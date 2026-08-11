import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import type { BlockDef, BlockTextureDef } from '../block/block-constants'
import type { ChunkMeshData, ChunkWorkerComposable } from '../world/use-chunk-worker'
import {
  Color3,
  DynamicTexture,
  Material,
  MeshBuilder,
  StandardMaterial,
  Texture,
  VertexBuffer,
} from '@babylonjs/core'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import { BLOCK_DEFS, BlockId, isDecorationBlock } from '../block/block-constants'
import { CHUNKS_PER_AXIS, getChunkIndex } from '../world/world-constants'

interface BlockMeshEntry {
  mesh: Mesh;
  material: StandardMaterial;
}

/**
 * 會依鄰居連接的四個方向
 *
 * 圍籬與玻璃片都靠這組方向決定要往哪幾側延伸，
 * Worker 端也用同一組 key 發送實例矩陣
 */
export const CONNECT_DIRECTION_LIST = [
  { key: 'px', offsetX: 1, offsetZ: 0 },
  { key: 'nx', offsetX: -1, offsetZ: 0 },
  { key: 'pz', offsetX: 0, offsetZ: 1 },
  { key: 'nz', offsetX: 0, offsetZ: -1 },
] as const

/**
 * 體素渲染器
 *
 * 使用 Babylon.js ThinInstances 批次渲染同類型方塊。
 * Minespace 的世界不可編輯，只需在載入時建構一次。
 */
export interface VoxelRenderer {
  /** 依目前 worldState 建構所有區塊 */
  build: (worldState: Uint8Array) => Promise<void>;
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

  const baseImage = new Image()
  const overlayImage = new Image()
  let loadedCount = 0

  const tryComposite = () => {
    loadedCount++
    if (loadedCount < 2)
      return

    const context = dynamicTexture.getContext()
    if (context instanceof CanvasRenderingContext2D) {
      context.imageSmoothingEnabled = false
    }
    context.clearRect(0, 0, size, size)
    context.drawImage(baseImage, 0, 0, size, size)
    context.drawImage(overlayImage, 0, 0, size, size)
    dynamicTexture.update()
  }

  baseImage.onload = tryComposite
  overlayImage.onload = tryComposite
  baseImage.src = basePath
  overlayImage.src = overlayPath

  return dynamicTexture
}

/** 動畫貼圖每秒播幾格 */
const TEXTURE_FRAME_RATE = 3.5

/** 液體最上層比方塊頂面矮多少，與 Minecraft 相同取八分之一格 */
const LIQUID_SURFACE_DROP = 0.125

/**
 * 讓直向排列的連續畫格動起來
 *
 * 貼圖是 frameCount 張圖上下疊成一條，
 * v 軸縮到只取一格，再逐格往下捲，水面就流動起來了
 */
function playTextureFrames(texture: Texture, frameCount: number, scene: Scene): void {
  texture.vScale = 1 / frameCount
  texture.wrapV = Texture.WRAP_ADDRESSMODE

  let elapsed = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    texture.vOffset = Math.floor(elapsed * TEXTURE_FRAME_RATE) % frameCount / frameCount
  })
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
  frameCount?: number,
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
    const texture = new Texture(texturePath, scene, {
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
    })
    if (frameCount && frameCount > 1) {
      playTextureFrames(texture, frameCount, scene)
    }
    material.diffuseTexture = texture
  }

  material.specularColor = new Color3(0.08, 0.08, 0.08)
  material.backFaceCulling = false
  /** 太陽、環境光，再加上洞裡的幾盞燈 */
  material.maxSimultaneousLights = 6

  if (tint) {
    material.diffuseColor = new Color3(tint[0], tint[1], tint[2])
  }

  return material
}

/**
 * 建立會鏤空的像素材質
 *
 * 花草的貼圖四周是透明的，要用 alpha test 把那些像素整個丟掉，
 * 用半透明混合會出現排序錯誤，遠處的草會蓋掉近處的東西
 */
function createCutoutMaterial(
  name: string,
  texturePath: string,
  scene: Scene,
  tint?: [number, number, number],
  isTwoSidedLighting = true,
): StandardMaterial {
  const material = createPixelMaterial(name, texturePath, scene, tint)
  const texture = material.diffuseTexture as Texture

  texture.hasAlpha = true
  material.useAlphaFromDiffuseTexture = true
  material.transparencyMode = Material.MATERIAL_ALPHATEST
  material.backFaceCulling = false
  /**
   * 樹葉這種有體積的方塊，背面用翻轉後的法線計算光照，
   * 從縫隙看進樹冠內部才不會是一片黑。
   *
   * 花草則相反：它們的法線已經統一改成朝上，
   * 再翻轉就會讓背面朝下而變暗，所以要關掉
   */
  material.twoSidedLighting = isTwoSidedLighting
  /** 花草不該有高光 */
  material.specularColor = new Color3(0, 0, 0)

  return material
}

function needsPerFaceRendering(textureDef: BlockTextureDef): boolean {
  return !textureDef.all && !!(textureDef.top || textureDef.side || textureDef.bottom)
}

/**
 * 把網格的法線全部改成朝上
 *
 * 這樣每一面都會拿到跟地面頂面相同的光照。
 * 水面因此不會有深淺不一的側面，花草也不會出現一面亮一面暗的怪異切分，
 * 效果就像 Minecraft 那種「整塊取同一個亮度」的平塗
 */
function applyUpwardNormals(mesh: Mesh): void {
  const normalList = mesh.getVerticesData(VertexBuffer.NormalKind)
  if (!normalList)
    return

  for (let index = 0; index < normalList.length; index += 3) {
    normalList[index] = 0
    normalList[index + 1] = 1
    normalList[index + 2] = 0
  }

  mesh.setVerticesData(VertexBuffer.NormalKind, normalList)
}

/**
 * 把四個側面的 UV 統一成「u 水平、v 由上往下」
 *
 * Babylon 的盒子每一面各有各的 UV 方向：+Z 面的 v 由上往下，
 * -Z 與 -X 面的 v 反過來由下往上，+X 面更是把 u 與 v 對調，
 * v 跑的是水平方向。
 * 靜態貼圖看不出差別，但流水是逐格播放的動畫，
 * 動畫沿著 v 前進，於是同一道瀑布的四個面各流各的，
 * 其中兩面看起來是往旁邊流。
 *
 * 這裡直接依頂點座標重算側面的 UV，四面才會一致往下流。
 * 必須在 bakeCurrentTransformIntoVertices 之前呼叫，
 * 座標還是以盒子中心為原點時才算得準
 */
function alignSideFaceUvs(mesh: Mesh, height: number): void {
  const positionList = mesh.getVerticesData(VertexBuffer.PositionKind)
  const uvList = mesh.getVerticesData(VertexBuffer.UVKind)
  if (!positionList || !uvList)
    return

  /** 頂點 0～15 是四個側面（+Z、-Z、+X、-X），16 之後是頂面與底面 */
  const sideVertexCount = 16
  for (let vertexIndex = 0; vertexIndex < sideVertexCount; vertexIndex++) {
    const x = positionList[vertexIndex * 3]!
    const y = positionList[vertexIndex * 3 + 1]!
    const z = positionList[vertexIndex * 3 + 2]!
    /** 後兩個面朝向 X 軸，水平方向要改看 Z */
    const isFacingX = vertexIndex >= 8

    uvList[vertexIndex * 2] = (isFacingX ? z : x) + 0.5
    uvList[vertexIndex * 2 + 1] = 0.5 - y / height
  }

  mesh.setVerticesData(VertexBuffer.UVKind, uvList)
}

/**
 * 區塊渲染器：管理單一區塊的 ThinInstances
 */
class ChunkRenderer {
  /** 一個 key 可能對應多個網格，例如花盆由盆身與植物兩片組成 */
  private allEntries = new Map<string, BlockMeshEntry[]>()

  constructor(
    private scene: Scene,
    private chunkX: number,
    private chunkZ: number,
    shadowGenerator: ShadowGenerator | null,
  ) {
    const blockIdList = Object.values(BlockId).filter((value) => typeof value === 'number') as BlockId[]

    for (const blockId of blockIdList) {
      const blockDef = BLOCK_DEFS[blockId]
      if (blockDef.isHidden || !blockDef.textures)
        continue

      if (isDecorationBlock(blockId)) {
        this.initDecorationMeshes(blockId, blockDef)
      }
      else if (needsPerFaceRendering(blockDef.textures)) {
        this.initPerFaceMeshes(blockId, blockDef.textures)
      }
      else {
        this.initSingleMaterialMesh(blockId, blockDef, blockDef.textures)
      }
    }

    if (shadowGenerator) {
      for (const [key, entryList] of this.allEntries.entries()) {
        const blockId = Number(key.split('_')[0]) as BlockId
        const blockDef = BLOCK_DEFS[blockId]
        /** 半透明的水面接陰影會變成一塊塊的黑洞，乾脆讓它不接 */
        const receiveShadows = blockDef?.receiveShadow !== false
        /** 水、冰、玻璃這類半透明方塊不該擋光 */
        const isTransparent = blockDef?.alpha !== undefined && blockDef.alpha < 1

        for (const { mesh } of entryList) {
          mesh.receiveShadows = receiveShadows
          if (!isTransparent) {
            shadowGenerator.addShadowCaster(mesh)
          }
        }
      }
    }
  }

  private addEntry(key: string, mesh: Mesh, material: StandardMaterial) {
    mesh.isVisible = false
    const entryList = this.allEntries.get(key) ?? []
    entryList.push({ mesh, material })
    this.allEntries.set(key, entryList)
  }

  /**
   * 非正立方體方塊
   *
   * 全部用小片的盒子與立板拼出來，再把同一份實例矩陣套到每一片上，
   * 這樣一個方塊就能長成花盆、欄杆或一叢草
   */
  private initDecorationMeshes(blockId: BlockId, blockDef: BlockDef) {
    const prefix = `chunk_${this.chunkX}_${this.chunkZ}_deco_${blockId}`
    const texturePath = blockDef.textures?.all ?? ''
    const key = `${blockId}`

    const addBox = (
      name: string,
      size: { width: number; height: number; depth: number },
      offset: { x: number; y: number; z: number },
      material: StandardMaterial,
    ) => {
      const mesh = MeshBuilder.CreateBox(`${prefix}_${name}`, size, this.scene)
      mesh.position.set(offset.x, offset.y, offset.z)
      mesh.bakeCurrentTransformIntoVertices()
      mesh.material = material
      this.addEntry(key, mesh, material)
    }

    const addPlane = (
      name: string,
      size: number,
      rotation: { x: number; y: number },
      offset: { x: number; y: number; z: number },
      material: StandardMaterial,
      isFlatShaded = true,
    ) => {
      const mesh = MeshBuilder.CreatePlane(`${prefix}_${name}`, { size }, this.scene)
      mesh.rotation.x = rotation.x
      mesh.rotation.y = rotation.y
      mesh.position.set(offset.x, offset.y, offset.z)
      mesh.bakeCurrentTransformIntoVertices()
      /** 花草一律平塗，否則交叉的兩片會一亮一暗 */
      if (isFlatShaded) {
        applyUpwardNormals(mesh)
      }
      mesh.material = material
      this.addEntry(key, mesh, material)
    }

    switch (blockDef.shape) {
      case 'cross': {
        /** 法線已統一朝上，關掉背面翻轉才不會一面亮一面黑 */
        const material = createCutoutMaterial(`${prefix}_mat`, texturePath, this.scene, blockDef.textures?.tint, false)
        addPlane('cross-a', 1, { x: 0, y: Math.PI / 4 }, { x: 0, y: 0, z: 0 }, material)
        addPlane('cross-b', 1, { x: 0, y: -Math.PI / 4 }, { x: 0, y: 0, z: 0 }, material)
        break
      }
      case 'flat': {
        /** 貼在水面上的葉片，高度要跟著矮八分之一格的水面一起降下來 */
        const material = createCutoutMaterial(`${prefix}_mat`, texturePath, this.scene, blockDef.textures?.tint, false)
        addPlane('flat', 1, { x: Math.PI / 2, y: 0 }, { x: 0, y: -0.6, z: 0 }, material)
        break
      }
      case 'slab': {
        const material = createPixelMaterial(`${prefix}_mat`, texturePath, this.scene, blockDef.textures?.tint)
        addBox('slab', { width: 1, height: 0.5, depth: 1 }, { x: 0, y: -0.25, z: 0 }, material)
        break
      }
      case 'fence': {
        this.initFenceMeshes(blockId, blockDef, prefix)
        break
      }
      case 'pane': {
        const material = createCutoutMaterial(`${prefix}_mat`, texturePath, this.scene, blockDef.textures?.tint)
        this.initPaneMeshes(blockId, material, prefix)
        break
      }
      case 'pot': {
        const potMaterial = createPixelMaterial(`${prefix}_pot_mat`, texturePath, this.scene)
        addBox('pot', { width: 0.42, height: 0.42, depth: 0.42 }, { x: 0, y: -0.28, z: 0 }, potMaterial)

        if (blockDef.plantTexture) {
          const plantMaterial = createCutoutMaterial(`${prefix}_plant_mat`, blockDef.plantTexture, this.scene, undefined, false)
          addPlane('plant-a', 0.7, { x: 0, y: Math.PI / 4 }, { x: 0, y: 0.2, z: 0 }, plantMaterial)
          addPlane('plant-b', 0.7, { x: 0, y: -Math.PI / 4 }, { x: 0, y: 0.2, z: 0 }, plantMaterial)
        }
        break
      }
    }
  }

  /**
   * 圍籬
   *
   * 柱子固定畫，四個方向的橫桿則各自獨立，
   * 由 Worker 判斷哪一側有鄰居才發送對應的實例，
   * 否則每根柱子都會長出四根懸空的橫桿
   */
  private initFenceMeshes(blockId: BlockId, blockDef: BlockDef, prefix: string) {
    const material = createPixelMaterial(
      `${prefix}_mat`,
      blockDef.textures?.all ?? '',
      this.scene,
      blockDef.textures?.tint,
    )

    const post = MeshBuilder.CreateBox(`${prefix}_post`, { width: 0.26, height: 1, depth: 0.26 }, this.scene)
    post.material = material
    this.addEntry(`${blockId}`, post, material)

    /** 橫桿只從柱子延伸到方塊邊界，兩塊圍籬相接才會連成一段 */
    const railLength = 0.37
    const railOffset = 0.315

    for (const direction of CONNECT_DIRECTION_LIST) {
      for (const [railIndex, railY] of [0.2, -0.16].entries()) {
        const isAlongX = direction.offsetX !== 0
        const rail = MeshBuilder.CreateBox(
          `${prefix}_rail_${direction.key}_${railIndex}`,
          {
            width: isAlongX ? railLength : 0.12,
            height: 0.14,
            depth: isAlongX ? 0.12 : railLength,
          },
          this.scene,
        )
        rail.position.set(
          direction.offsetX * railOffset,
          railY,
          direction.offsetZ * railOffset,
        )
        rail.bakeCurrentTransformIntoVertices()
        rail.material = material
        this.addEntry(`${blockId}_${direction.key}`, rail, material)
      }
    }
  }

  /**
   * 玻璃片
   *
   * 中央一片薄板，四個方向依鄰居決定要不要往外接。
   * 沒有鄰居時只會看到一片薄玻璃，不會變成十字
   */
  private initPaneMeshes(blockId: BlockId, material: StandardMaterial, prefix: string) {
    /**
     * 厚度整根一致
     *
     * 原本柱子 0.22 厚、橫向的板只有 0.1，柱子胖了一圈，
     * 一整面窗看過去是一根一根凸出來的白柱，這是「看起來很雜亂」的主因
     */
    const thickness = 0.125

    const core = MeshBuilder.CreateBox(
      `${prefix}_core`,
      { width: thickness, height: 1, depth: thickness },
      this.scene,
    )
    core.material = material
    this.addEntry(`${blockId}`, core, material)

    for (const direction of CONNECT_DIRECTION_LIST) {
      const isAlongX = direction.offsetX !== 0
      /** 從方塊中心一路延伸到邊界，與柱子重疊，接縫才不會有共面的閃爍 */
      const arm = MeshBuilder.CreateBox(
        `${prefix}_arm_${direction.key}`,
        {
          width: isAlongX ? 0.5 : thickness,
          height: 1,
          depth: isAlongX ? thickness : 0.5,
        },
        this.scene,
      )
      arm.position.set(direction.offsetX * 0.25, 0, direction.offsetZ * 0.25)
      arm.bakeCurrentTransformIntoVertices()
      arm.material = material
      this.addEntry(`${blockId}_${direction.key}`, arm, material)
    }
  }

  private initPerFaceMeshes(blockId: BlockId, textureDef: BlockTextureDef) {
    const prefix = `chunk_${this.chunkX}_${this.chunkZ}_block_${blockId}`

    const addFace = (
      name: string,
      texturePath: string,
      rotationX: number,
      rotationY: number,
      offset: { x: number; y: number; z: number },
      tint?: [number, number, number],
      overlay?: string,
    ) => {
      const material = createPixelMaterial(`${prefix}_${name}_mat`, texturePath, this.scene, tint, overlay)
      const mesh = MeshBuilder.CreatePlane(`${prefix}_${name}`, { size: 1 }, this.scene)
      mesh.rotation.x = rotationX
      mesh.rotation.y = rotationY
      mesh.position.set(offset.x, offset.y, offset.z)
      mesh.bakeCurrentTransformIntoVertices()
      mesh.material = material
      this.addEntry(`${blockId}_${name}`, mesh, material)
    }

    /**
     * 每一片的朝向都要讓法線指向方塊外面
     *
     * Babylon 的 CreatePlane 預設法線是 (0, 0, -1)，
     * 側面若不轉半圈，法線會朝方塊內部，
     * 結果就是照到太陽的那一面反而最暗，跟地上的影子方向對不起來
     */
    addFace('top', textureDef.top ?? textureDef.side ?? '', Math.PI / 2, 0, { x: 0, y: 0.5, z: 0 }, textureDef.topTint)
    addFace('bottom', textureDef.bottom ?? textureDef.side ?? '', -Math.PI / 2, 0, { x: 0, y: -0.5, z: 0 })
    addFace('front', textureDef.side ?? '', 0, Math.PI, { x: 0, y: 0, z: 0.5 }, textureDef.sideTint, textureDef.sideOverlay)
    addFace('back', textureDef.side ?? '', 0, 0, { x: 0, y: 0, z: -0.5 }, textureDef.sideTint, textureDef.sideOverlay)
    addFace('left', textureDef.side ?? '', 0, Math.PI / 2, { x: -0.5, y: 0, z: 0 }, textureDef.sideTint, textureDef.sideOverlay)
    addFace('right', textureDef.side ?? '', 0, -Math.PI / 2, { x: 0.5, y: 0, z: 0 }, textureDef.sideTint, textureDef.sideOverlay)
  }

  private initSingleMaterialMesh(blockId: BlockId, blockDef: BlockDef, textureDef: BlockTextureDef) {
    const name = `chunk_${this.chunkX}_${this.chunkZ}_block_${blockId}`
    const material = blockDef.cutout
      ? createCutoutMaterial(`${name}_mat`, textureDef.all ?? '', this.scene, textureDef.tint)
      : createPixelMaterial(
          `${name}_mat`,
          textureDef.all ?? '',
          this.scene,
          textureDef.tint,
          textureDef.overlay,
          textureDef.frameCount,
        )

    if (blockDef.emissive) {
      material.emissiveColor = new Color3(blockDef.emissive, blockDef.emissive, blockDef.emissive)
      /** 自發光要最後相加且不夾限，燈石與餘燼才會真的透出光暈 */
      material.useEmissiveAsIllumination = true
    }

    if (blockDef.alpha !== undefined && blockDef.alpha < 1) {
      material.alpha = blockDef.alpha
      material.transparencyMode = Material.MATERIAL_ALPHABLEND
      material.backFaceCulling = true
      material.needDepthPrePass = true
    }

    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene)
    /** 逐格播放的貼圖要靠一致的 UV 方向，動畫才會四面都往同一邊跑 */
    if (textureDef.frameCount) {
      alignSideFaceUvs(mesh, 1)
    }
    if (blockDef.flatShaded) {
      applyUpwardNormals(mesh)
    }
    mesh.material = material
    this.addEntry(`${blockId}`, mesh, material)

    if (!blockDef.isLiquid)
      return

    /**
     * 液體的水面那一層
     *
     * Minecraft 的水面比方塊頂面矮八分之一格，
     * 岸邊因此會露出一小截泥土或沙的側面，水才像是灌進地形裡，
     * 而不是一顆一顆水方塊疊出來的。
     * 水底下的格子仍舊是滿格，兩層之間不會出現縫隙
     */
    const surfaceMesh = MeshBuilder.CreateBox(
      `${name}_surface`,
      { width: 1, height: 1 - LIQUID_SURFACE_DROP, depth: 1 },
      this.scene,
    )
    if (textureDef.frameCount) {
      alignSideFaceUvs(surfaceMesh, 1 - LIQUID_SURFACE_DROP)
    }
    surfaceMesh.position.y = -LIQUID_SURFACE_DROP / 2
    surfaceMesh.bakeCurrentTransformIntoVertices()
    if (blockDef.flatShaded) {
      applyUpwardNormals(surfaceMesh)
    }
    surfaceMesh.material = material
    this.addEntry(`${blockId}_surface`, surfaceMesh, material)
  }

  /** 套用 Worker 計算好的矩陣與環境遮蔽緩衝區 */
  applyMeshData(meshData: ChunkMeshData): void {
    for (const [key, entryList] of this.allEntries.entries()) {
      const matrixBuffer = meshData.matrixMap[key]
      const shadeBuffer = meshData.shadeMap[key]

      for (const entry of entryList) {
        if (!matrixBuffer || matrixBuffer.length === 0) {
          entry.mesh.isVisible = false
          entry.mesh.thinInstanceSetBuffer('matrix', new Float32Array(0), 16, false)
          continue
        }

        entry.mesh.isVisible = true
        entry.mesh.thinInstanceSetBuffer('matrix', matrixBuffer, 16, false)

        /**
         * 每個實例一個顏色，著色器會拿去乘上貼圖顏色
         *
         * 遮蔽算好之後直接烘進緩衝區，執行期沒有任何額外成本
         */
        const isShadeMatched = !!shadeBuffer
          && shadeBuffer.length / 4 === matrixBuffer.length / 16
        if (isShadeMatched) {
          entry.mesh.thinInstanceSetBuffer('color', shadeBuffer, 4, false)
        }
      }
    }
  }

  dispose(): void {
    /** 一份材質可能掛在好幾個網格上（例如水的滿格與水面），只能釋放一次 */
    const materialSet = new Set<StandardMaterial>()

    for (const entryList of this.allEntries.values()) {
      for (const { mesh, material } of entryList) {
        mesh.dispose()
        materialSet.add(material)
      }
    }

    for (const material of materialSet) {
      material.dispose()
    }
    this.allEntries.clear()
  }
}

export function createVoxelRenderer(
  scene: Scene,
  chunkWorker: ChunkWorkerComposable,
): VoxelRenderer {
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null

  const chunkList: ChunkRenderer[] = []

  for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
    for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
      chunkList.push(new ChunkRenderer(scene, chunkX, chunkZ, shadowGenerator))
    }
  }

  chunkWorker.setOnChunkResult((chunkX, chunkZ, meshData) => {
    chunkList[getChunkIndex(chunkX, chunkZ)]?.applyMeshData(meshData)
  })

  return {
    build: (worldState: Uint8Array) => chunkWorker.rebuildAll(worldState),
    dispose() {
      chunkWorker.terminate()
      for (const chunk of chunkList) {
        chunk.dispose()
      }
      chunkList.length = 0
    },
  }
}
