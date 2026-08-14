import type { DirectionalLight, Mesh, Scene, ShadowGenerator, StandardMaterial } from '@babylonjs/core'
import type { BlockDef, BlockId, BlockTextureDef } from '../block/block-constants'
import type { TextureKey } from '../block/texture-pack'
import type { ChunkMeshData, ChunkWorkerComposable } from '../world/use-chunk-worker'
import type { TextureSkinner } from './pixel-material'
import type { WindSway } from './wind-sway'
import {
  Color3,
  Material,
  MeshBuilder,
  VertexBuffer,
} from '@babylonjs/core'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import { BLOCK_DEFS, isDecorationBlock, LIQUID_SURFACE_DROP } from '../block/block-constants'
import { TOTAL_CHUNKS } from '../world/world-constants'
import { LEAF_TRANSLUCENCY, PLANT_TRANSLUCENCY } from './leaf-translucency'
import { createWindSway, LEAF_SWAY_AMPLITUDE, PLANT_SWAY_AMPLITUDE } from './wind-sway'

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
  /** 淋得到雨、也淋濕得起來的那些材質 */
  getWetMaterialList: () => StandardMaterial[];
  /** 開關水面的日照高光，除錯面板用 */
  setWaterGlintEnabled: (isEnabled: boolean) => void;
  /** 釋放所有資源 */
  dispose: () => void;
}

/** 花草與玻璃這類鏤空的東西不該有高光 */
const NO_SPECULAR = new Color3(0, 0, 0)

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
  /** 淋得濕的材質。同一份材質可能掛在好幾片網格上，用 Set 去重 */
  private wetMaterialSet = new Set<StandardMaterial>()
  /** 會反日光的液體材質，除錯開關要拿它比對有沒有高光的差別 */
  private liquidMaterialList: StandardMaterial[] = []

  constructor(
    private scene: Scene,
    private shadowGenerator: ShadowGenerator | null,
    private windSway: WindSway,
    private skinner: TextureSkinner,
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

  /**
   * 記下這份材質淋不淋得濕
   *
   * 得在建網格的當下決定：這裡是唯一同時握有
   * 「方塊是哪一種」與「它用了哪一份材質」的地方。
   *
   * 三種東西要排除。半透明的水、冰與玻璃本來就是濕的，
   * 再壓暗一次只會變成一塊髒玻璃；鏤空的花草沒有高光可言
   * （它們的高光被刻意關成零），壓暗漫射只會讓整片草黑掉；
   * 會自己發亮的燈火則是光源，光源不會因為淋雨而變暗
   */
  private collectWetMaterial(blockId: BlockId, material: StandardMaterial): void {
    const blockDef = BLOCK_DEFS[blockId]
    if (!blockDef)
      return

    const isTransparent = blockDef.alpha !== undefined && blockDef.alpha < 1
    if (isTransparent || blockDef.cutout || (blockDef.emissive ?? 0) > 0)
      return

    this.wetMaterialSet.add(material)
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
     * 接影：立板是直的，法線卻為了打光統一改成朝上（見 pixel-material），
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
    this.collectWetMaterial(Number(key.split('_')[0]) as BlockId, material)

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
    const textureKey = blockDef.textures?.all
    const key = `${blockId}`
    if (!textureKey)
      return

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
        const material = this.skinner.create({
          name: `${prefix}_mat`,
          textureKey,
          tint: blockDef.textures?.tint,
          pixelTint: blockDef.textures?.pixelTint,
          cutout: true,
          twoSidedLighting: false,
          noMipmap: true,
          flatShaded: true,
          specularColor: NO_SPECULAR,
          translucency: PLANT_TRANSLUCENCY,
        })
        /**
         * 交叉立板就是地上的花草，從根部往上彎
         *
         * 但不是每一種都該動。蜘蛛網長在洞裡、掛在岩壁之間，
         * 那裡沒有風——而它跟著花草一起搖，會讓整個山洞看起來像在戶外。
         * 方塊自己說了不算的話，這裡就得留一個能關掉的開關
         */
        if (blockDef.swaysInWind !== false) {
          this.windSway.attach(material, PLANT_SWAY_AMPLITUDE, true)
        }
        addPlane('cross-a', 1, { x: 0, y: Math.PI / 4 }, { x: 0, y: 0, z: 0 }, material)
        addPlane('cross-b', 1, { x: 0, y: -Math.PI / 4 }, { x: 0, y: 0, z: 0 }, material)
        break
      }
      case 'flat': {
        /** 貼在水面上的葉片，高度要跟著矮八分之一格的水面一起降下來 */
        const material = this.skinner.create({
          name: `${prefix}_mat`,
          textureKey,
          tint: blockDef.textures?.tint,
          pixelTint: blockDef.textures?.pixelTint,
          cutout: true,
          twoSidedLighting: false,
          noMipmap: true,
          flatShaded: true,
          specularColor: NO_SPECULAR,
          translucency: PLANT_TRANSLUCENCY,
        })
        addPlane('flat', 1, { x: Math.PI / 2, y: 0 }, { x: 0, y: -0.6, z: 0 }, material)
        break
      }
      case 'slab': {
        const material = this.skinner.create({ name: `${prefix}_mat`, textureKey, tint: blockDef.textures?.tint })
        addBox('slab', { width: 1, height: 0.5, depth: 1 }, { x: 0, y: -0.25, z: 0 }, material)
        break
      }
      case 'stairs': {
        const material = this.skinner.create({ name: `${prefix}_mat`, textureKey, tint: blockDef.textures?.tint })
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
        const material = this.skinner.create({
          name: `${prefix}_mat`,
          textureKey,
          tint: blockDef.textures?.tint,
          cutout: true,
          noMipmap: true,
          specularColor: NO_SPECULAR,
        })
        this.initPaneMeshes(blockId, material, prefix)
        break
      }
      /**
       * 薄層
       *
       * 一個扁盒子貼著格子底面。飛石、薄雪、榻榻米都是它——
       * 差別只在厚度，而厚度是方塊自己說的
       */
      case 'layer': {
        const thickness = blockDef.shapeThickness ?? 0.125
        const material = this.skinner.create({ name: `${prefix}_mat`, textureKey, tint: blockDef.textures?.tint })
        addBox(
          'layer',
          { width: 1, height: thickness, depth: 1 },
          { x: 0, y: -0.5 + thickness / 2, z: 0 },
          material,
        )
        break
      }
      /** 細柱：整格高，但四周瘦下來，兩根之間走得過去 */
      case 'post': {
        const thickness = blockDef.shapeThickness ?? 0.3
        const material = this.skinner.create({ name: `${prefix}_mat`, textureKey, tint: blockDef.textures?.tint })
        addBox(
          'post',
          { width: thickness, height: 1, depth: thickness },
          { x: 0, y: 0, z: 0 },
          material,
        )
        break
      }
      /**
       * 薄板
       *
       * 立在格子正中央，順著一軸展開、在另一軸上薄下去。
       * 不做鏤空：紙門的紙是整片的，透光靠的是顏色不是洞
       */
      case 'panel': {
        const thickness = blockDef.shapeThickness ?? 0.15
        const isAlongX = (blockDef.panelAxis ?? 'x') === 'x'
        const material = this.skinner.create({
          name: `${prefix}_mat`,
          textureKey,
          tint: blockDef.textures?.tint,
          pixelTint: blockDef.textures?.pixelTint,
        })
        addBox(
          'panel',
          {
            width: isAlongX ? 1 : thickness,
            height: 1,
            depth: isAlongX ? thickness : 1,
          },
          { x: 0, y: 0, z: 0 },
          material,
        )
        break
      }
      /**
       * 吊著的東西
       *
       * 主體貼著上一格的底面掛下來，底下再垂一片會搖的紙。
       * 兩者分成兩份材質是刻意的：搖的只有紙，鈴身不動——
       * 整團一起晃看起來會像掛在繩子上的燈籠在盪，那是另一回事
       */
      case 'hanging': {
        const size = blockDef.shapeThickness ?? 0.4
        const material = this.skinner.create({
          name: `${prefix}_mat`,
          textureKey,
          tint: blockDef.textures?.tint,
          pixelTint: blockDef.textures?.pixelTint,
        })
        addBox(
          'hanging',
          { width: size, height: size, depth: size },
          { x: 0, y: 0.5 - size / 2, z: 0 },
          material,
        )

        if (blockDef.hangingTailTexture) {
          const tailMaterial = this.skinner.create({
            name: `${prefix}_tail_mat`,
            textureKey: blockDef.hangingTailTexture,
            cutout: true,
            twoSidedLighting: false,
            noMipmap: true,
            flatShaded: true,
            specularColor: NO_SPECULAR,
          })
          /**
           * 整片一起盪，不從底部彎
           *
           * 「從底部彎」是給地上的草用的：根釘在土裡，越往上倒得越多。
           * 吊著的紙剛好相反，它的固定點在頂上——底部彎那條曲線
           * 會把它畫成一片站在空中的草
           */
          this.windSway.attach(tailMaterial, PLANT_SWAY_AMPLITUDE, false)
          addPlane(
            'hanging-tail',
            size * 0.7,
            { x: 0, y: Math.PI / 4 },
            { x: 0, y: 0.5 - size - size * 0.35, z: 0 },
            tailMaterial,
          )
        }
        break
      }
      case 'pot': {
        const potMaterial = this.skinner.create({ name: `${prefix}_pot_mat`, textureKey })
        addBox('pot', { width: 0.42, height: 0.42, depth: 0.42 }, { x: 0, y: -0.28, z: 0 }, potMaterial)

        if (blockDef.plantTexture) {
          const plantMaterial = this.skinner.create({
            name: `${prefix}_plant_mat`,
            textureKey: blockDef.plantTexture,
            cutout: true,
            twoSidedLighting: false,
            noMipmap: true,
            flatShaded: true,
            specularColor: NO_SPECULAR,
            translucency: PLANT_TRANSLUCENCY,
          })
          addPlane('plant-a', 0.7, { x: 0, y: Math.PI / 4 }, { x: 0, y: 0.2, z: 0 }, plantMaterial)
          addPlane('plant-b', 0.7, { x: 0, y: -Math.PI / 4 }, { x: 0, y: 0.2, z: 0 }, plantMaterial)
        }
        break
      }
    }

    /**
     * 自發光
     *
     * 立方體那一條路在建材質的時候就處理掉了，非立方體這邊沒有——
     * 於是吊燈會點著真光、外面也有一圈暈，唯獨它自己是暗的。
     * 在這裡一次補上，往後任何一種外型的發光方塊都不必再想這件事。
     *
     * 換材質包只重做貼圖，材質物件本身不動，所以設一次就夠了
     */
    if (blockDef.emissive) {
      const emissive = new Color3(blockDef.emissive, blockDef.emissive, blockDef.emissive)
      for (const entry of this.allEntries.get(key) ?? []) {
        entry.material.emissiveColor = emissive
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
    const textureKey = blockDef.textures?.all
    if (!textureKey)
      return

    /**
     * 圍籬也可能需要鏤空
     *
     * 柱子與橫桿都是實心的小盒子，貼上帶透明像素的圖時，
     * 那些洞沒有東西可以透出來，就會整片畫成黑的。
     * 鐵鏈那種本來就大半是洞的東西一定要走 alpha test 這條路
     */
    const material = this.skinner.create({
      name: `${prefix}_mat`,
      textureKey,
      tint: blockDef.textures?.tint,
      cutout: blockDef.cutout,
      twoSidedLighting: false,
      noMipmap: blockDef.cutout,
      specularColor: blockDef.cutout ? NO_SPECULAR : undefined,
    })

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
      textureKey: TextureKey | undefined,
      rotationX: number,
      rotationY: number,
      offset: { x: number; y: number; z: number },
      tint?: [number, number, number],
      overlayKey?: TextureKey,
    ) => {
      if (!textureKey)
        return

      const material = this.skinner.create({
        name: `${prefix}_${name}_mat`,
        textureKey,
        overlayKey,
        tint,
      })
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
    const endTexture = textureDef.top ?? textureDef.side
    const barkTexture = textureDef.side
    const pickTexture = (face: string, fallback: TextureKey | undefined) => (
      endFaceSet.has(face) ? endTexture : (logAxis === 'y' ? fallback : barkTexture)
    )
    /** 端面不吃側面的疊圖與色調，那是給樹皮用的 */
    const pickSideTint = (face: string) => (endFaceSet.has(face) ? undefined : textureDef.sideTint)
    const pickSideOverlay = (face: string) => (endFaceSet.has(face) ? undefined : textureDef.sideOverlay)

    addFace('top', pickTexture('top', textureDef.top ?? textureDef.side), Math.PI / 2, 0, { x: 0, y: 0.5, z: 0 }, endFaceSet.has('top') ? textureDef.topTint : undefined)
    addFace('bottom', pickTexture('bottom', textureDef.bottom ?? textureDef.side), -Math.PI / 2, 0, { x: 0, y: -0.5, z: 0 })
    addFace('front', pickTexture('front', barkTexture), 0, Math.PI, { x: 0, y: 0, z: 0.5 }, pickSideTint('front'), pickSideOverlay('front'))
    addFace('back', pickTexture('back', barkTexture), 0, 0, { x: 0, y: 0, z: -0.5 }, pickSideTint('back'), pickSideOverlay('back'))
    addFace('left', pickTexture('left', barkTexture), 0, Math.PI / 2, { x: -0.5, y: 0, z: 0 }, pickSideTint('left'), pickSideOverlay('left'))
    addFace('right', pickTexture('right', barkTexture), 0, -Math.PI / 2, { x: 0.5, y: 0, z: 0 }, pickSideTint('right'), pickSideOverlay('right'))
  }

  private initSingleMaterialMesh(blockId: BlockId, blockDef: BlockDef, textureDef: BlockTextureDef) {
    const name = `block_${blockId}`
    const textureKey = textureDef.all
    if (!textureKey)
      return

    const material = this.skinner.create({
      name: `${name}_mat`,
      textureKey,
      overlayKey: textureDef.overlay,
      tint: textureDef.tint,
      pixelTint: textureDef.pixelTint,
      frameCount: textureDef.frameCount,
      cutout: blockDef.cutout,
      /**
       * 鏤空的貼圖不能有 mipmap
       *
       * 這些貼圖的 alpha 是全有全無的：不是完全透明就是完全不透明。
       * 但 mipmap 是把相鄰像素平均出來的，縮小之後透明與不透明的邊界上
       * 會生出 0.5 這種中間值——alpha test 判定它「要畫」，
       * 於是花草上方浮出一道細細的十字，那正是交叉立板本身的輪廓
       */
      noMipmap: blockDef.cutout,
      /** 水與熔岩的法線同樣被改成朝上，掛不了法線貼圖 */
      flatShaded: blockDef.flatShaded,
      specularColor: blockDef.cutout ? NO_SPECULAR : undefined,
      /** 立方體要自己說會不會透光，玻璃與鐵鏈同樣是鏤空的但不該發亮 */
      translucency: blockDef.translucent ? LEAF_TRANSLUCENCY : undefined,
    })

    /**
     * 樹葉整團一起晃
     *
     * 不從底部彎：樹冠是一團互相緊貼的方塊，
     * 每一塊各自彎腰的話塊與塊之間會裂開一條縫
     */
    if (blockDef.swaysInWind) {
      this.windSway.attach(material, LEAF_SWAY_AMPLITUDE, false)
    }

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

    /**
     * 水面反日光
     *
     * 水的法線已經統一改成朝上（flatShaded），整池水因此是一個
     * 光學上的平面：太陽在上面只會反出一個點，人一走那個點就跟著移。
     * 那道光是靜水最有說服力的東西——比任何波紋貼圖都有效。
     *
     * 指數給得很高，高光才收得緊。散開的高光是磨砂玻璃，
     * 不是水。而它加在漫射的 clamp 外面，所以正午時真的會刺眼
     */
    if (blockDef.isLiquid) {
      material.specularColor = new Color3(0.8, 0.82, 0.85)
      material.specularPower = 160
      this.liquidMaterialList.push(material)
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
        /**
         * 第四個參數是「這份緩衝區是靜態的」
         *
         * 這裡原本傳 false，等於告訴 Babylon 之後還會改它，
         * 於是 GPU 緩衝區以 DYNAMIC_DRAW 配置。
         * 但這些矩陣是 Worker 一次算好的，設完就再也不動——
         * 一路撐到世界被釋放為止。
         *
         * 代價不是一點點：驅動層對動態緩衝區會另外做搬運與反交錯，
         * 官方論壇有一個兩百五十萬個面的實測，只改這個旗標
         * 就從十五幀變成六十幀
         */
        entry.mesh.thinInstanceSetBuffer('matrix', matrixBuffer, 16, true)

        /**
         * 每個實例一個顏色，著色器會拿去乘上貼圖顏色
         *
         * 遮蔽算好之後直接烘進緩衝區，執行期沒有任何額外成本
         */
        if (shadeBuffer && shadeBuffer.length / 4 === matrixBuffer.length / 16) {
          entry.mesh.thinInstanceSetBuffer('color', shadeBuffer, 4, true)
        }

        /**
         * 邊界盒已經在上面設定緩衝區時算好了
         *
         * 方塊之後不會再變，往後每一幀都不必再同步一次
         */
        entry.mesh.doNotSyncBoundingInfo = true
        /**
         * 這兩個旗標必須成對出現
         *
         * doNotSyncBoundingInfo 單獨用會讓網格整個消失：
         * 邊界盒不再更新，視錐剔除卻照樣拿它去判斷，
         * 判成「不在畫面裡」就整批不畫了。
         *
         * 而對 thin instance 來說剔除本來就幫不上忙：
         * 一顆網格的邊界盒是它所有實例的聯集，在體素世界裡
         * 通常橫跨整座場景，永遠剔不掉——那幾百次測試是白做的。
         * 直接說「一律當成看得見」，省下測試也順便修掉消失的風險
         */
        entry.mesh.alwaysSelectAsActiveMesh = true
      }
    }

    this.pendingMatrixMap.clear()
    this.pendingShadeMap.clear()
  }

  getWetMaterialList(): StandardMaterial[] {
    return [...this.wetMaterialSet]
  }

  /**
   * 水面高光的開關
   *
   * 高光是加在漫射的 clamp 外面的，也就是全場唯一能超過純白的通道。
   * 關掉之後水面就回到與別的方塊一樣的霧面，正午那道刺眼的反光會消失
   */
  setWaterGlintEnabled(isEnabled: boolean): void {
    for (const material of this.liquidMaterialList) {
      material.specularColor.set(
        isEnabled ? 0.8 : 0.02,
        isEnabled ? 0.82 : 0.02,
        isEnabled ? 0.85 : 0.02,
      )
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
    this.wetMaterialSet.clear()
    this.liquidMaterialList.length = 0
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
  skinner: TextureSkinner,
): VoxelRenderer {
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null

  const windSway = createWindSway(scene)
  const worldRenderer = new WorldRenderer(scene, shadowGenerator, windSway, skinner)

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
    getWetMaterialList: () => worldRenderer.getWetMaterialList(),
    setWaterGlintEnabled: (isEnabled: boolean) => worldRenderer.setWaterGlintEnabled(isEnabled),
    dispose() {
      chunkWorker.terminate()
      worldRenderer.dispose()
      windSway.dispose()
    },
  }
}
