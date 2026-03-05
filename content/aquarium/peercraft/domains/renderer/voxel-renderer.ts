import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import type { BlockTextureDef } from '../block/block-constants'
import {
  Color3,
  Matrix,
  MeshBuilder,
  StandardMaterial,
  Texture,
} from '@babylonjs/core'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import {
  BLOCK_TEXTURES,
  BlockId,
  RENDERABLE_BLOCK_IDS,
} from '../block/block-constants'
import {
  indexToCoordinate,
  WORLD_VOLUME,
} from '../world/world-constants'

interface BlockMeshEntry {
  mesh: Mesh;
  material: StandardMaterial;
}

/**
 * 體素渲染器
 *
 * 使用 Babylon.js ThinInstances 批次渲染同類型方塊，
 * 大幅減少 draw call 數。
 */
export interface VoxelRenderer {
  /** 根據目前 worldState 重建所有 ThinInstances */
  rebuildInstances: (worldState: Uint8Array) => void;
  /** 釋放所有資源 */
  dispose: () => void;
}

/**
 * 建立像素風格材質（關閉插值，保留像素感）
 */
export function createPixelMaterial(
  name: string,
  texturePath: string,
  scene: Scene,
  tint?: [number, number, number],
): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  const texture = new Texture(texturePath, scene, {
    samplingMode: Texture.NEAREST_SAMPLINGMODE,
  })
  material.diffuseTexture = texture
  material.specularColor = new Color3(0.1, 0.1, 0.1)
  material.backFaceCulling = false

  if (tint) {
    material.diffuseColor = new Color3(tint[0], tint[1], tint[2])
  }

  return material
}

/**
 * 判斷方塊是否需要 per-face 渲染
 */
function needsPerFaceRendering(textureDef: BlockTextureDef): boolean {
  return !textureDef.all && !!(textureDef.top || textureDef.side || textureDef.bottom)
}

/**
 * 建立體素渲染器
 *
 * 為每種方塊類型建立 base mesh 與材質。
 * - 單一材質方塊：一個 box mesh
 * - 多面材質方塊（如草地）：拆分為 top / bottom / side 三組 mesh
 *
 * 透過 thinInstanceSetBuffer 一次性設定所有 instance 的 transform matrix。
 */
export function createVoxelRenderer(scene: Scene, worldState: Uint8Array): VoxelRenderer {
  /** 所有需要管理的 mesh entry，key = "blockId" 或 "blockId_top" 等 */
  const allEntries = new Map<string, BlockMeshEntry>()

  /** 紀錄哪些 blockId 使用 per-face 渲染 */
  const perFaceBlocks = new Set<BlockId>()

  for (const blockId of RENDERABLE_BLOCK_IDS) {
    const textureDef = BLOCK_TEXTURES[blockId]

    if (needsPerFaceRendering(textureDef)) {
      perFaceBlocks.add(blockId)

      /** Top face（朝上的面） */
      const topMaterial = createPixelMaterial(
        `block_${blockId}_top_mat`,
        textureDef.top ?? textureDef.side ?? '',
        scene,
        textureDef.topTint,
      )
      const topMesh = MeshBuilder.CreatePlane(
        `block_${blockId}_top`,
        { size: 1 },
        scene,
      )
      topMesh.rotation.x = Math.PI / 2
      topMesh.bakeCurrentTransformIntoVertices()
      topMesh.material = topMaterial
      topMesh.isVisible = false
      allEntries.set(`${blockId}_top`, { mesh: topMesh, material: topMaterial })

      /** Bottom face（朝下的面） */
      const bottomMaterial = createPixelMaterial(
        `block_${blockId}_bottom_mat`,
        textureDef.bottom ?? textureDef.side ?? '',
        scene,
      )
      const bottomMesh = MeshBuilder.CreatePlane(
        `block_${blockId}_bottom`,
        { size: 1 },
        scene,
      )
      bottomMesh.rotation.x = -Math.PI / 2
      bottomMesh.bakeCurrentTransformIntoVertices()
      bottomMesh.material = bottomMaterial
      bottomMesh.isVisible = false
      allEntries.set(`${blockId}_bottom`, { mesh: bottomMesh, material: bottomMaterial })

      /** Side faces（四個側面，共用同一材質） */
      const sideMaterial = createPixelMaterial(
        `block_${blockId}_side_mat`,
        textureDef.side ?? textureDef.all ?? '',
        scene,
      )

      /** 前(+Z)、後(-Z)、左(-X)、右(+X) 四個面 */
      const sideRotations = [
        { name: 'front', rotationY: 0 },
        { name: 'back', rotationY: Math.PI },
        { name: 'left', rotationY: -Math.PI / 2 },
        { name: 'right', rotationY: Math.PI / 2 },
      ]

      for (const { name, rotationY } of sideRotations) {
        const sideMesh = MeshBuilder.CreatePlane(
          `block_${blockId}_${name}`,
          { size: 1 },
          scene,
        )
        sideMesh.rotation.y = rotationY
        /** 將面往對應方向偏移半格 */
        switch (name) {
          case 'front':
            sideMesh.position.z = 0.5
            break
          case 'back':
            sideMesh.position.z = -0.5
            break
          case 'left':
            sideMesh.position.x = -0.5
            break
          case 'right':
            sideMesh.position.x = 0.5
            break
        }
        sideMesh.bakeCurrentTransformIntoVertices()
        sideMesh.material = sideMaterial
        sideMesh.isVisible = false
        allEntries.set(`${blockId}_${name}`, { mesh: sideMesh, material: sideMaterial })
      }
    }
    else {
      /** 單一材質：直接用 box */
      const material = createPixelMaterial(
        `block_${blockId}_mat`,
        textureDef.all ?? '',
        scene,
        textureDef.tint,
      )
      const mesh = MeshBuilder.CreateBox(`block_${blockId}`, { size: 1 }, scene)
      mesh.material = material
      mesh.isVisible = false
      allEntries.set(`${blockId}`, { mesh, material })
    }
  }

  /** 註冊陰影投射與接收 */
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null
  if (shadowGenerator) {
    for (const { mesh } of allEntries.values()) {
      mesh.receiveShadows = true
      shadowGenerator.addShadowCaster(mesh)
    }
  }

  function rebuildInstances(state: Uint8Array): void {
    /** 收集每個 entry key 對應的 transform matrices */
    const matricesMap = new Map<string, number[]>()
    for (const key of allEntries.keys()) {
      matricesMap.set(key, [])
    }

    for (let index = 0; index < WORLD_VOLUME; index++) {
      const blockId = state[index] as BlockId
      if (blockId === BlockId.AIR)
        continue

      const { x, y, z } = indexToCoordinate(index)
      const translationMatrix = Matrix.Translation(x, y, z)
      const matrixArray = translationMatrix.toArray()

      if (perFaceBlocks.has(blockId)) {
        /** Per-face：top/bottom 需要額外偏移半格 */
        const topMatrix = Matrix.Translation(x, y + 0.5, z).toArray()
        const bottomMatrix = Matrix.Translation(x, y - 0.5, z).toArray()

        matricesMap.get(`${blockId}_top`)?.push(...topMatrix)
        matricesMap.get(`${blockId}_bottom`)?.push(...bottomMatrix)

        for (const sideName of ['front', 'back', 'left', 'right']) {
          matricesMap.get(`${blockId}_${sideName}`)?.push(...matrixArray)
        }
      }
      else {
        matricesMap.get(`${blockId}`)?.push(...matrixArray)
      }
    }

    /** 套用所有 thin instances */
    for (const [key, entry] of allEntries.entries()) {
      const matrices = matricesMap.get(key)
      if (!matrices)
        continue

      const instanceCount = matrices.length / 16

      if (instanceCount > 0) {
        entry.mesh.isVisible = true
        entry.mesh.thinInstanceSetBuffer(
          'matrix',
          new Float32Array(matrices),
          16,
          false,
        )
      }
      else {
        entry.mesh.isVisible = false
        entry.mesh.thinInstanceSetBuffer('matrix', new Float32Array(0), 16, false)
      }
    }
  }

  /** 初次渲染 */
  rebuildInstances(worldState)

  function dispose(): void {
    for (const { mesh, material } of allEntries.values()) {
      mesh.dispose()
      material.dispose()
    }
    allEntries.clear()
  }

  return {
    rebuildInstances,
    dispose,
  }
}
