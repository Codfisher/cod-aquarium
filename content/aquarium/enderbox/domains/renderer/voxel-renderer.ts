import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import type { BlockTextureDef } from '../block/block-constants'
import type { ChunkWorkerComposable } from '../world/use-chunk-worker'
import {
  Color3,
  DynamicTexture,
  Material,
  MeshBuilder,
  StandardMaterial,
  Texture,
} from '@babylonjs/core'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import {
  BLOCK_DEFS,
  BlockId,
} from '../block/block-constants'
import {
  CHUNKS_PER_AXIS,
  getChunkIndex,
} from '../world/world-constants'

interface BlockMeshEntry {
  mesh: Mesh;
  material: StandardMaterial;
}

/**
 * 體素渲染器
 *
 * 使用 Babylon.js ThinInstances 批次渲染同類型方塊。
 * 每個區塊 (Chunk) 有自己的一組 ThinInstance 網格，
 * 這樣更新一個方塊時只需重建對應區塊，而非整個世界。
 */
export interface VoxelRenderer {
  /** 根據目前 worldState 重建所有區塊 */
  rebuildInstances: (worldState: Uint8Array) => void;
  /** 重建指定區塊 */
  rebuildChunk: (worldState: Uint8Array, cx: number, cz: number) => void;
  /** 重建指定座標及其鄰近區塊 */
  rebuildAt: (worldState: Uint8Array, x: number, z: number) => void;
  /** 釋放所有資源 */
  dispose: () => void;
}

/**
 * 將 base 與 overlay 圖片合成到 Canvas 上，產生 DynamicTexture
 */
function createCompositedTexture(
  name: string,
  basePath: string,
  overlayPath: string,
  scene: Scene,
): DynamicTexture {
  const size = 16
  const dynamicTexture = new DynamicTexture(name, size, scene, false, Texture.NEAREST_SAMPLINGMODE)

  const baseImg = new Image()
  const overlayImg = new Image()
  let loadedCount = 0

  const tryComposite = () => {
    loadedCount++
    if (loadedCount < 2)
      return

    const ctx = dynamicTexture.getContext()
    if (ctx instanceof CanvasRenderingContext2D) {
      ctx.imageSmoothingEnabled = false
    }
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(baseImg, 0, 0, size, size)
    ctx.drawImage(overlayImg, 0, 0, size, size)
    dynamicTexture.update()
  }

  baseImg.onload = tryComposite
  overlayImg.onload = tryComposite
  baseImg.src = basePath
  overlayImg.src = overlayPath

  return dynamicTexture
}

/**
 * 建立像素風格材質
 */
export function createPixelMaterial(
  name: string,
  texturePath: string,
  scene: Scene,
  tint?: [number, number, number],
  overlayPath?: string,
): StandardMaterial {
  const material = new StandardMaterial(name, scene)

  if (overlayPath) {
    material.diffuseTexture = createCompositedTexture(
      `${name}_tex`,
      texturePath,
      overlayPath,
      scene,
    )
  }
  else {
    material.diffuseTexture = new Texture(texturePath, scene, {
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
    })
  }

  material.specularColor = new Color3(0.1, 0.1, 0.1)
  material.backFaceCulling = false

  if (tint) {
    material.diffuseColor = new Color3(tint[0], tint[1], tint[2])
  }

  return material
}

function needsPerFaceRendering(textureDef: BlockTextureDef): boolean {
  return !textureDef.all && !!(textureDef.top || textureDef.side || textureDef.bottom)
}

/**
 * 區塊渲染器：管理單一 16x16x64 區域的 ThinInstances
 */
class ChunkRenderer {
  private allEntries = new Map<string, BlockMeshEntry>()
  private perFaceBlocks = new Set<BlockId>()

  constructor(
    private scene: Scene,
    private cx: number,
    private cz: number,
    shadowGenerator: ShadowGenerator | null,
  ) {
    const blockIds = Object.values(BlockId).filter((v) => typeof v === 'number') as BlockId[]

    for (const blockId of blockIds) {
      const blockDef = BLOCK_DEFS[blockId]
      if (blockDef.isHidden || !blockDef.textures)
        continue

      const textureDef = blockDef.textures

      if (needsPerFaceRendering(textureDef)) {
        this.perFaceBlocks.add(blockId)
        this.initPerFaceMeshes(blockId, textureDef)
      }
      else {
        this.initSingleMaterialMesh(blockId, blockDef, textureDef)
      }
    }

    if (shadowGenerator) {
      for (const { mesh } of this.allEntries.values()) {
        mesh.receiveShadows = true
        shadowGenerator.addShadowCaster(mesh)
      }
    }
  }

  private initPerFaceMeshes(blockId: BlockId, textureDef: BlockTextureDef) {
    const prefix = `chunk_${this.cx}_${this.cz}_block_${blockId}`

    const addFace = (name: string, tex: string, rotX: number, rotY: number, posOffset: { x: number; y: number; z: number }, tint?: [number, number, number], overlay?: string) => {
      const mat = createPixelMaterial(`${prefix}_${name}_mat`, tex, this.scene, tint, overlay)
      const mesh = MeshBuilder.CreatePlane(`${prefix}_${name}`, { size: 1 }, this.scene)
      mesh.rotation.x = rotX
      mesh.rotation.y = rotY
      mesh.position.set(posOffset.x, posOffset.y, posOffset.z)
      mesh.bakeCurrentTransformIntoVertices()
      mesh.material = mat
      mesh.isVisible = false
      this.allEntries.set(`${blockId}_${name}`, { mesh, material: mat })
    }

    addFace('top', textureDef.top ?? textureDef.side ?? '', Math.PI / 2, 0, { x: 0, y: 0.5, z: 0 }, textureDef.topTint)
    addFace('bottom', textureDef.bottom ?? textureDef.side ?? '', -Math.PI / 2, 0, { x: 0, y: -0.5, z: 0 })
    addFace('front', textureDef.side ?? '', 0, 0, { x: 0, y: 0, z: 0.5 }, undefined, textureDef.sideOverlay)
    addFace('back', textureDef.side ?? '', 0, Math.PI, { x: 0, y: 0, z: -0.5 }, undefined, textureDef.sideOverlay)
    addFace('left', textureDef.side ?? '', 0, -Math.PI / 2, { x: -0.5, y: 0, z: 0 }, undefined, textureDef.sideOverlay)
    addFace('right', textureDef.side ?? '', 0, Math.PI / 2, { x: 0.5, y: 0, z: 0 }, undefined, textureDef.sideOverlay)
  }

  private initSingleMaterialMesh(blockId: BlockId, blockDef: any, textureDef: BlockTextureDef) {
    const name = `chunk_${this.cx}_${this.cz}_block_${blockId}`
    const mat = createPixelMaterial(`${name}_mat`, textureDef.all ?? '', this.scene, textureDef.tint, textureDef.overlay)

    if (blockDef.alpha !== undefined && blockDef.alpha < 1) {
      mat.alpha = blockDef.alpha
      mat.transparencyMode = Material.MATERIAL_ALPHABLEND
      mat.backFaceCulling = true
      mat.needDepthPrePass = true
    }

    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene)
    mesh.material = mat
    mesh.isVisible = false
    this.allEntries.set(`${blockId}`, { mesh, material: mat })
  }

  /** 套用由 Worker 計算好的矩陣緩衝區到對應的 ThinInstance mesh */
  applyMatrices(matrices: Record<string, Float32Array>): void {
    for (const [key, entry] of this.allEntries.entries()) {
      const buffer = matrices[key]
      if (!buffer || buffer.length === 0) {
        entry.mesh.isVisible = false
        entry.mesh.thinInstanceSetBuffer('matrix', new Float32Array(0), 16, false)
        continue
      }

      entry.mesh.isVisible = true
      entry.mesh.thinInstanceSetBuffer('matrix', buffer, 16, false)
    }
  }

  dispose(): void {
    for (const { mesh, material } of this.allEntries.values()) {
      mesh.dispose()
      material.dispose()
    }
    this.allEntries.clear()
  }
}

export function createVoxelRenderer(
  scene: Scene,
  worldState: Uint8Array,
  chunkWorker?: ChunkWorkerComposable,
): VoxelRenderer {
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null

  const chunks: ChunkRenderer[] = []

  for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
    for (let cz = 0; cz < CHUNKS_PER_AXIS; cz++) {
      chunks.push(new ChunkRenderer(scene, cx, cz, shadowGenerator))
    }
  }

  if (chunkWorker) {
    // Worker 模式：接收 Worker 計算好的矩陣並套用到對應 chunk
    chunkWorker.setOnChunkResult((chunkX, chunkZ, matrices) => {
      const idx = getChunkIndex(chunkX, chunkZ)
      if (chunks[idx]) {
        chunks[idx].applyMatrices(matrices)
      }
    })
  }

  function rebuildInstances(state: Uint8Array): void {
    if (chunkWorker) {
      chunkWorker.rebuildAll(state)
    }
  }

  function rebuildChunk(state: Uint8Array, cx: number, cz: number): void {
    if (chunkWorker) {
      chunkWorker.rebuildChunk(state, cx, cz)
    }
  }

  function rebuildAt(state: Uint8Array, x: number, z: number): void {
    if (chunkWorker) {
      chunkWorker.rebuildAt(state, x, z)
    }
  }

  /** 初次渲染 */
  rebuildInstances(worldState)

  function dispose(): void {
    chunkWorker?.terminate()
    for (const chunk of chunks) {
      chunk.dispose()
    }
    chunks.length = 0
  }

  return {
    rebuildInstances,
    rebuildChunk,
    rebuildAt,
    dispose,
  }
}
