import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import type { BlockDef, BlockId, BlockTextureDef } from '../block/block-constants'
import type { ChunkMeshData, ChunkWorkerComposable } from '../world/use-chunk-worker'
import type { WindSway } from './wind-sway'
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
import { BLOCK_DEFS, isDecorationBlock } from '../block/block-constants'
import { TOTAL_CHUNKS } from '../world/world-constants'
import { createWindSway } from './wind-sway'

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

/**
 * 直接在畫布上把貼圖的像素重新上色
 *
 * 材質的 tint 只能把顏色調暗：著色器是先把「光照 × tint」夾在 1 以內，
 * 再乘上貼圖的顏色，所以某個通道最亮就是貼圖本身的值。
 * 一張綠葉貼圖的紅只有 0.26，tint 的紅開到多大都紅不起來，
 * 調出來永遠是偏綠的暗色。
 *
 * 要把綠葉變成秋天的橘黃，只能在像素層下手：
 * 逐一乘上倍率再寫回畫布，鏤空的透明度原封不動留著
 */
function createRecoloredTexture(
  name: string,
  texturePath: string,
  scene: Scene,
  pixelTint: [number, number, number],
): DynamicTexture {
  const size = 16
  const dynamicTexture = new DynamicTexture(name, size, scene, false, Texture.NEAREST_SAMPLINGMODE)

  const image = new Image()
  image.onload = () => {
    const context = dynamicTexture.getContext()
    if (context instanceof CanvasRenderingContext2D) {
      context.imageSmoothingEnabled = false
    }
    context.clearRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)

    const imageData = context.getImageData(0, 0, size, size)
    const { data } = imageData
    for (let index = 0; index < data.length; index += 4) {
      data[index] = Math.min(255, data[index]! * pixelTint[0])
      data[index + 1] = Math.min(255, data[index + 1]! * pixelTint[1])
      data[index + 2] = Math.min(255, data[index + 2]! * pixelTint[2])
    }
    context.putImageData(imageData, 0, 0)

    dynamicTexture.update()
  }
  image.src = texturePath

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
  pixelTint?: [number, number, number],
  noMipmap = false,
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
  else if (pixelTint) {
    material.diffuseTexture = createRecoloredTexture(`${name}_tex`, texturePath, scene, pixelTint)
  }
  else {
    const texture = new Texture(texturePath, scene, {
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      noMipmap,
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
  /**
   * 接受場景的補光
   *
   * Babylon 的 ambientColor 是「場景的 × 材質的」，材質這一項預設是黑的，
   * 也就是預設完全不吃場景補光。方塊要開起來：
   * 夜裡那道補光是加在光照上、再乘上反照率的，
   * 而方塊光正烘在反照率裡——這是燈火照得出範圍的唯一途徑。
   *
   * 天體與雲維持預設的黑，它們不該被地面的補光影響
   */
  material.ambientColor = new Color3(1, 1, 1)

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
  pixelTint?: [number, number, number],
): StandardMaterial {
  /**
   * 鏤空的貼圖不能有 mipmap
   *
   * 這些貼圖的 alpha 是全有全無的：不是完全透明就是完全不透明。
   * 但 mipmap 是把相鄰像素平均出來的，縮小之後透明與不透明的邊界上
   * 會生出 0.5 這種中間值——alpha test 判定它「要畫」，
   * 於是花草上方浮出一道細細的十字，那正是交叉立板本身的輪廓。
   *
   * 低畫質把解析度降到三分之一，那條線被放大成三個像素才變得明顯；
   * 高畫質其實也有，只是細到一個像素看不出來。
   *
   * 關掉 mipmap 之後永遠只取原圖，alpha 就維持全有全無，邊緣自然乾淨。
   * 代價是遠處會有一點閃爍，但那本來就是方塊遊戲的樣子
   */
  const material = createPixelMaterial(name, texturePath, scene, tint, undefined, undefined, pixelTint, true)
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
  /**
   * 裁切門檻
   *
   * 關掉 mipmap 之後 alpha 只剩 0 與 1 兩種值，門檻擺在中間最保險。
   * 拉太高會連葉尖那種只有一兩個像素的部分一起啃掉
   */
  material.alphaCutOff = 0.5

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
/**
 * 整個世界的方塊渲染器
 *
 * 原本是一個區塊一份：二十五個區塊各自替自己用到的方塊建網格，
 * 同一種石頭在世界各處就有二十五份網格。網格數八百多，
 * 每一幀主畫面與陰影各畫一次，等於一千七百次 draw call——
 * 這是白沙與空網格處理掉之後，剩下最貴的一項。
 *
 * 方塊全部是靜態的，切成區塊的唯一理由是讓 Worker 能平行運算；
 * 算完之後沒有必要繼續分開。這裡把各區塊的實例矩陣接成一條，
 * 同一種方塊全世界共用一個網格，draw call 直接砍掉七成。
 *
 * 代價是失去逐區塊的視錐剔除。但這個世界只有兩百八十格見方、
 * 霧又開到兩百二十格，本來就幾乎整片都在視野內，剔除省不到什麼
 */
class WorldRenderer {
  /** 一個 key 可能對應多個網格，例如花盆由盆身與植物兩片組成 */
  private allEntries = new Map<string, BlockMeshEntry[]>()
  /** 已經建過網格的方塊，避免重建 */
  private builtBlockSet = new Set<BlockId>()
  /** 各區塊送回來的緩衝區，等全部到齊再接成一條 */
  private pendingMatrixMap = new Map<string, Float32Array[]>()
  private pendingShadeMap = new Map<string, Float32Array[]>()
  private receivedChunkCount = 0

  constructor(
    private scene: Scene,
    private shadowGenerator: ShadowGenerator | null,
    private windSway: WindSway,
  ) {}

  /**
   * 需要時才建網格
   *
   * 這裡原本在建構時就替「所有有貼圖的方塊」建好網格，一種都不漏。
   * 但一個區塊裡通常只出現十來種方塊：整個世界一百多種、二十五個區塊，
   * 算下來會建出七千多個網格，其中八成八一個實例都沒有。
   * 空網格照樣要進每一幀的剔除與排序，白白吃掉大量時間。
   *
   * 改成等 Worker 算完、知道這個區塊實際用到哪些方塊之後才建，
   * 網格數從七千三百降到八百八十
   */
  private ensureBlockMeshes(blockId: BlockId): void {
    if (this.builtBlockSet.has(blockId))
      return

    this.builtBlockSet.add(blockId)

    const blockDef = BLOCK_DEFS[blockId]
    if (!blockDef || blockDef.isHidden || !blockDef.textures)
      return

    if (isDecorationBlock(blockId)) {
      this.initDecorationMeshes(blockId, blockDef)
    }
    else if (needsPerFaceRendering(blockDef.textures)) {
      this.initPerFaceMeshes(blockId, blockDef.textures, blockDef.logAxis)
    }
    else {
      this.initSingleMaterialMesh(blockId, blockDef, blockDef.textures)
    }
  }

  /** 網格一建好就設定陰影，改成延後建立之後沒有「事後統一處理」的時機了 */
  private applyShadowSetting(key: string, mesh: Mesh): void {
    if (!this.shadowGenerator)
      return

    const blockId = Number(key.split('_')[0]) as BlockId
    const blockDef = BLOCK_DEFS[blockId]

    /**
     * 交叉立板的花草整個退出陰影
     *
     * 這種植株是兩片交叉的薄板，貼圖還是鏤空的，兩件事同時出問題：
     *
     * 投影：一片葉子在陰影貼圖上只佔不到一個取樣格。太陽一移動，
     * 整張貼圖重新光柵化，那些細節每一幀落在不同的格子上，
     * 有的幀畫得出來、有的幀整個消失，地上的影子就一直在閃。
     *
     * 接影：立板是直的，法線卻為了打光統一改成朝上（見 createCutoutMaterial），
     * 法線偏移的方向因此完全不對，自我遮蔽的髒污躲不掉，
     * 太陽一動就在葉面上爬。
     *
     * 兩邊都退出去之後，花草只吃平行光與環境光，明暗穩定，
     * 也正好是 Minecraft 本來的樣子——那裡的草從來不投影子
     */
    const isThinPlant = blockDef?.shape === 'cross'

    /** 半透明的水面接陰影會變成一塊塊的黑洞，乾脆讓它不接 */
    mesh.receiveShadows = blockDef?.receiveShadow !== false && !isThinPlant
    /** 水、冰、玻璃這類半透明方塊不該擋光 */
    const isTransparent = blockDef?.alpha !== undefined && blockDef.alpha < 1
    if (!isTransparent && !isThinPlant && blockDef?.castShadow !== false) {
      this.shadowGenerator.addShadowCaster(mesh)
    }
  }

  private addEntry(key: string, mesh: Mesh, material: StandardMaterial) {
    mesh.isVisible = false
    /**
     * 這些網格生成之後就再也不會動
     *
     * 位置早就烘進頂點裡、實例矩陣也由 Worker 一次算好，
     * 所以世界矩陣可以直接凍結，省下每一幀替上百個網格重算矩陣的成本。
     * 順手關掉拾取，射線檢測不必再走過它們
     */
    mesh.freezeWorldMatrix()
    mesh.isPickable = false
    this.applyShadowSetting(key, mesh)

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
    const prefix = `block_deco_${blockId}`
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
        const material = createCutoutMaterial(
          `${prefix}_mat`,
          texturePath,
          this.scene,
          blockDef.textures?.tint,
          false,
          blockDef.textures?.pixelTint,
        )
        /** 交叉立板就是地上的花草，讓它們跟著風擺 */
        this.windSway.attach(material)
        addPlane('cross-a', 1, { x: 0, y: Math.PI / 4 }, { x: 0, y: 0, z: 0 }, material)
        addPlane('cross-b', 1, { x: 0, y: -Math.PI / 4 }, { x: 0, y: 0, z: 0 }, material)
        break
      }
      case 'flat': {
        /** 貼在水面上的葉片，高度要跟著矮八分之一格的水面一起降下來 */
        const material = createCutoutMaterial(
          `${prefix}_mat`,
          texturePath,
          this.scene,
          blockDef.textures?.tint,
          false,
          blockDef.textures?.pixelTint,
        )
        addPlane('flat', 1, { x: Math.PI / 2, y: 0 }, { x: 0, y: -0.6, z: 0 }, material)
        break
      }
      case 'slab': {
        const material = createPixelMaterial(`${prefix}_mat`, texturePath, this.scene, blockDef.textures?.tint)
        addBox('slab', { width: 1, height: 0.5, depth: 1 }, { x: 0, y: -0.25, z: 0 }, material)
        break
      }
      case 'stairs': {
        const material = createPixelMaterial(`${prefix}_mat`, texturePath, this.scene, blockDef.textures?.tint)
        /** 座面：與半磚同樣的下半格 */
        addBox('stairs-seat', { width: 1, height: 0.5, depth: 1 }, { x: 0, y: -0.25, z: 0 }, material)

        /** 靠背：上半格只佔靠背那一側的半格深 */
        const facing = blockDef.stairsFacing ?? 'north'
        const isAlongZ = facing === 'north' || facing === 'south'
        const backOffset = facing === 'north' || facing === 'west' ? -0.25 : 0.25
        addBox(
          'stairs-back',
          {
            width: isAlongZ ? 1 : 0.5,
            height: 0.5,
            depth: isAlongZ ? 0.5 : 1,
          },
          {
            x: isAlongZ ? 0 : backOffset,
            y: 0.25,
            z: isAlongZ ? backOffset : 0,
          },
          material,
        )
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
    /**
     * 圍籬也可能需要鏤空
     *
     * 柱子與橫桿都是實心的小盒子，貼上帶透明像素的圖時，
     * 那些洞沒有東西可以透出來，就會整片畫成黑的。
     * 鐵鏈那種本來就大半是洞的東西一定要走 alpha test 這條路
     */
    const material = blockDef.cutout
      ? createCutoutMaterial(
          `${prefix}_mat`,
          blockDef.textures?.all ?? '',
          this.scene,
          blockDef.textures?.tint,
          false,
        )
      : createPixelMaterial(
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

  private initPerFaceMeshes(
    blockId: BlockId,
    textureDef: BlockTextureDef,
    logAxis: 'x' | 'y' | 'z' = 'y',
  ) {
    const prefix = `block_face_${blockId}`

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
    /**
     * 哪兩面是「端面」
     *
     * 立著的樹幹端面在上下（年輪朝天），躺著的木頭端面則在兩端。
     * 一格只存得下一個方塊編號、放不進旋轉角度，
     * 所以躺著的木頭是另一種方塊，差別就在這裡把端面換到哪兩面
     */
    const endFaceSet = new Set(
      logAxis === 'x'
        ? ['left', 'right']
        : logAxis === 'z'
          ? ['front', 'back']
          : ['top', 'bottom'],
    )
    const endTexture = textureDef.top ?? textureDef.side ?? ''
    const barkTexture = textureDef.side ?? ''
    const pickTexture = (face: string, fallback: string) => (
      endFaceSet.has(face) ? endTexture : (logAxis === 'y' ? fallback : barkTexture)
    )
    /** 端面不吃側面的疊圖與色調，那是給樹皮用的 */
    const pickSideTint = (face: string) => (endFaceSet.has(face) ? undefined : textureDef.sideTint)
    const pickSideOverlay = (face: string) => (endFaceSet.has(face) ? undefined : textureDef.sideOverlay)

    addFace('top', pickTexture('top', textureDef.top ?? textureDef.side ?? ''), Math.PI / 2, 0, { x: 0, y: 0.5, z: 0 }, endFaceSet.has('top') ? textureDef.topTint : undefined)
    addFace('bottom', pickTexture('bottom', textureDef.bottom ?? textureDef.side ?? ''), -Math.PI / 2, 0, { x: 0, y: -0.5, z: 0 })
    addFace('front', pickTexture('front', barkTexture), 0, Math.PI, { x: 0, y: 0, z: 0.5 }, pickSideTint('front'), pickSideOverlay('front'))
    addFace('back', pickTexture('back', barkTexture), 0, 0, { x: 0, y: 0, z: -0.5 }, pickSideTint('back'), pickSideOverlay('back'))
    addFace('left', pickTexture('left', barkTexture), 0, Math.PI / 2, { x: -0.5, y: 0, z: 0 }, pickSideTint('left'), pickSideOverlay('left'))
    addFace('right', pickTexture('right', barkTexture), 0, -Math.PI / 2, { x: 0.5, y: 0, z: 0 }, pickSideTint('right'), pickSideOverlay('right'))
  }

  private initSingleMaterialMesh(blockId: BlockId, blockDef: BlockDef, textureDef: BlockTextureDef) {
    const name = `block_${blockId}`
    const material = blockDef.cutout
      ? createCutoutMaterial(
          `${name}_mat`,
          textureDef.all ?? '',
          this.scene,
          textureDef.tint,
          true,
          textureDef.pixelTint,
        )
      : createPixelMaterial(
          `${name}_mat`,
          textureDef.all ?? '',
          this.scene,
          textureDef.tint,
          textureDef.overlay,
          textureDef.frameCount,
          textureDef.pixelTint,
        )

    /**
     * 自發光當成「這顆方塊自帶亮度」，而不是整片加上去的白光
     *
     * Babylon 的 emissiveColor 是一整片相加的顏色。
     * 開了 useEmissiveAsIllumination 之後它會跳過貼圖直接加在最後，
     * 而且最終顏色仍然夾在 1 以內——燈石與餘燼因此被洗成一塊死白，
     * 貼圖的圖案整個看不見。
     * 關掉它，自發光會先併進光照量再乘上貼圖，
     * 效果等同 Minecraft 的亮度等級：方塊亮起來，圖案還在
     */
    if (blockDef.emissive) {
      material.emissiveColor = new Color3(blockDef.emissive, blockDef.emissive, blockDef.emissive)
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

  /**
   * 收下一個區塊的結果
   *
   * 先擱著不畫。全部到齊之後才一次接成整片，
   * 中途每收到一塊就重設一次緩衝區的話，等於把同一份資料上傳好幾遍
   */
  collectMeshData(meshData: ChunkMeshData): void {
    for (const [key, buffer] of Object.entries(meshData.matrixMap)) {
      if (!buffer || buffer.length === 0)
        continue

      const matrixList = this.pendingMatrixMap.get(key) ?? []
      matrixList.push(buffer)
      this.pendingMatrixMap.set(key, matrixList)

      const shadeBuffer = meshData.shadeMap[key]
      /**
       * 遮蔽緩衝區要與矩陣一一對應
       *
       * 有些方塊沒有遮蔽資料。接成一條之後長度必須對得起來，
       * 否則整批顏色會錯位，所以缺的那一段補上不影響顏色的白
       */
      const instanceCount = buffer.length / 16
      const shadeList = this.pendingShadeMap.get(key) ?? []
      shadeList.push(
        shadeBuffer && shadeBuffer.length / 4 === instanceCount
          ? shadeBuffer
          : new Float32Array(instanceCount * 4).fill(1),
      )
      this.pendingShadeMap.set(key, shadeList)
    }

    this.receivedChunkCount++
    if (this.receivedChunkCount >= TOTAL_CHUNKS) {
      this.flush()
    }
  }

  /** 把各區塊的緩衝區接成一條，一種方塊只設定一次 */
  private flush(): void {
    for (const key of this.pendingMatrixMap.keys()) {
      this.ensureBlockMeshes(Number(key.split('_')[0]) as BlockId)
    }

    for (const [key, entryList] of this.allEntries.entries()) {
      const matrixBuffer = mergeBufferList(this.pendingMatrixMap.get(key))
      const shadeBuffer = mergeBufferList(this.pendingShadeMap.get(key))

      for (const entry of entryList) {
        if (!matrixBuffer) {
          entry.mesh.isVisible = false
          continue
        }

        entry.mesh.isVisible = true
        entry.mesh.thinInstanceSetBuffer('matrix', matrixBuffer, 16, false)

        /**
         * 每個實例一個顏色，著色器會拿去乘上貼圖顏色
         *
         * 遮蔽算好之後直接烘進緩衝區，執行期沒有任何額外成本
         */
        if (shadeBuffer && shadeBuffer.length / 4 === matrixBuffer.length / 16) {
          entry.mesh.thinInstanceSetBuffer('color', shadeBuffer, 4, false)
        }

        /**
         * 邊界盒已經在上面設定緩衝區時算好了
         *
         * 方塊之後不會再變，往後每一幀都不必再同步一次
         */
        entry.mesh.doNotSyncBoundingInfo = true
      }
    }

    this.pendingMatrixMap.clear()
    this.pendingShadeMap.clear()
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

/** 把一串緩衝區接成一條 */
function mergeBufferList(bufferList: Float32Array[] | undefined): Float32Array | null {
  if (!bufferList || bufferList.length === 0)
    return null

  const total = bufferList.reduce((sum, buffer) => sum + buffer.length, 0)
  if (total === 0)
    return null

  const merged = new Float32Array(total)
  let offset = 0
  for (const buffer of bufferList) {
    merged.set(buffer, offset)
    offset += buffer.length
  }

  return merged
}

export function createVoxelRenderer(
  scene: Scene,
  chunkWorker: ChunkWorkerComposable,
): VoxelRenderer {
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null

  const windSway = createWindSway(scene)
  const worldRenderer = new WorldRenderer(scene, shadowGenerator, windSway)

  /**
   * 滑鼠移動時不要做拾取
   *
   * Babylon 預設每一次 pointermove 都會發一條射線去找游標下的網格。
   * 這個場景用的是指標鎖定，游標下有什麼完全沒有意義，
   * 但那條射線照樣要走過所有網格
   */
  scene.skipPointerMovePicking = true

  chunkWorker.setOnChunkResult((_chunkX, _chunkZ, meshData) => {
    worldRenderer.collectMeshData(meshData)
  })

  return {
    build: (worldState: Uint8Array) => chunkWorker.rebuildAll(worldState),
    dispose() {
      chunkWorker.terminate()
      worldRenderer.dispose()
      windSway.dispose()
    },
  }
}
