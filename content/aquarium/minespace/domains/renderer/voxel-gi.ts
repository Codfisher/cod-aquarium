import type { Color3, Material, Scene, UniformBuffer } from '@babylonjs/core'
import type { BlockLightSource } from '../world/light-source'
import {
  MaterialPluginBase,
  RawTexture,
  RegisterMaterialPlugin,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { reportDiagnostic } from '../../composables/use-error-logger'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { buildVoxelGiGrid, collectVoxelGiLightSeedList } from './voxel-gi-grid'
import { useVoxelGiWorker } from './voxel-gi-worker/use-voxel-gi-worker'

/**
 * 補的間接光要乘多強
 *
 * 烘出來的值已經是 0～1 夾過的相對亮度，這個倍率是最後一道總量開關——
 * 全局光該是牆角一點淡淡的鄰色，不該搶過真正的直射光與燈火。
 *
 * 這個數字原本是 0.5，那讓白沙庭園在正午整片浮起來。這座場景的地
 * 是高明度的白沙，正午的線性亮度本來就已經頂在 ACES 的膝點上
 * （量測見 cloud-shadow 的 SKY_SHADE_DEPTH 那一段）——
 * 貼著天花板的地方再加東西只會把周圍一起推過去，
 * 亮部之間的層次全被壓平。間接光要看得出來的是暗處，不是亮處
 */
const GI_INTENSITY = 0.22

/** 隔多久檢查一次要不要重烘 */
const CHECK_INTERVAL = 0.5

/**
 * 太陽方向要偏移多少（弧度）才值得重烘一次
 *
 * 世界不會變，會變的只有太陽——但太陽在一天裡幾乎每一刻都在動一點點，
 * 逐幀重烘不必要也跑不動。這個門檻大約是一度，日夜循環正常速度下
 * 大約每幾秒才會踩到一次，加速時段自然烘得更勤
 */
const REBAKE_ANGLE_THRESHOLD = 0.018

/**
 * 這一刻的全局光
 *
 * 與 aerial-perspective 的 airState 同一種寫法：所有材質共用一份，
 * 由 createVoxelGi 在建立與每次重烘完成時寫入
 */
const giState = {
  /** 貼圖還沒烘出第一份結果之前是 0，材質讀到的加成也就是零 */
  enabled: 0,
  intensity: GI_INTENSITY,
  /** 粗網格的格數 */
  gridX: 1,
  gridY: 1,
  gridZ: 1,
  /** 一格粗格對應幾格世界方塊 */
  cellSizeXZ: 4,
  cellSizeY: 2,
  /** 圖集的排法 */
  tilesPerRow: 1,
  atlasWidth: 1,
  atlasHeight: 1,
}

let giTexture: RawTexture | null = null

/**
 * 把烘好的那張格子交出去
 *
 * 光束那一支要行進的正是這份資料（alpha 欄存著「這一格照得到多少陽光」），
 * 與其為它另外再算一次世界，不如共用同一張圖。
 * 還沒烘出第一份結果時是 null，那時候光束自己會安靜地不做事
 */
export function getVoxelGiTexture(): RawTexture | null {
  return giTexture
}

/** 著色器要用的那幾組常數，光束那一支照樣得設一遍 */
export function getVoxelGiUniforms(): {
  grid: [number, number, number];
  cellSize: [number, number, number];
  atlas: [number, number, number];
} {
  return {
    grid: [giState.gridX, giState.gridY, giState.gridZ],
    cellSize: [giState.cellSizeXZ, giState.cellSizeY, giState.cellSizeXZ],
    atlas: [giState.tilesPerRow, giState.atlasWidth, giState.atlasHeight],
  }
}

/**
 * 從圖集裡取一格的共用取樣函式
 *
 * 材質外掛與光束的後製都要讀同一張圖，算式必須一模一樣——
 * 各寫一份的話，哪天改了磚的排法就會有一邊悄悄對不上。
 * 兩邊都把這段字串貼進自己的著色器，宣告的取樣器名字也共用。
 *
 * ── 為什麼是 2D 圖集而不是 3D 貼圖 ──
 *
 * 這裡原本用的是 RawTexture3D，那是最自然的資料結構。但它在這個
 * 場景裡會撞上一個查了很久的問題：主控台一直丟
 * GL_INVALID_OPERATION: Two textures of different types use the same
 * sampler location，整批繪製呼叫作廢，而畫面上看不出是哪裡壞了。
 *
 * 這份程式碼裡所有既有的烘焙資料（cloud-shadow 的雲影圖樣、
 * water-map 的水位圖）用的都是 2D RawTexture，那些從來沒出過事；
 * 出事的只有新引入的 sampler3D。與其繼續猜引擎內部怎麼配置材質單元，
 * 不如走已經驗證過的路——順帶一提，把三維資料攤成 2D 圖集
 * 本來就是光影包的標準做法。
 *
 * 排法是：每一層 Y 切片一塊磚，磚並排成一張二維的圖。
 * 磚內兩軸是 X 與 Z，跨磚則是 Y。Y 軸的兩層之間自己做一次內插，
 * 所以垂直方向照樣是平滑的，只是多一次取樣
 */
export const VOXEL_GI_SAMPLE_GLSL = `
uniform sampler2D voxelGiSampler;

vec4 minespaceSampleVoxelSlice(vec2 cellXZ, float slice) {
  float tileX = mod(slice, voxelGiAtlas.x);
  float tileY = floor(slice / voxelGiAtlas.x);
  vec2 pixel = vec2(tileX * voxelGiGrid.x, tileY * voxelGiGrid.z) + cellXZ + 0.5;

  return texture2D(voxelGiSampler, pixel / voxelGiAtlas.yz);
}

vec4 minespaceSampleVoxelGi(vec3 worldPosition) {
  /**
   * 減掉半格，整數點才落在格子中心
   *
   * 直接除以格距得到的座標，整數點落在格子的「邊界」上；
   * 而紋素的整數點落在紋素中心。兩者差半格——內插的重心
   * 因此整份偏移了半個粗格，也就是兩格方塊。
   * 少了這一項，牆角的間接光會固定偏向某一側
   */
  vec3 cell = worldPosition / voxelGiCellSize - 0.5;
  cell = clamp(cell, vec3(0.0), voxelGiGrid - 1.0);

  /** 上下兩層各取一次再內插，垂直方向才不會一階一階跳 */
  float slice0 = floor(cell.y);
  float slice1 = min(slice0 + 1.0, voxelGiGrid.y - 1.0);

  return mix(
    minespaceSampleVoxelSlice(cell.xz, slice0),
    minespaceSampleVoxelSlice(cell.xz, slice1),
    cell.y - slice0
  );
}
`

/**
 * 那三組常數的宣告，只有後製要用
 *
 * 材質外掛不能用這一份：它的常數走的是材質的統一緩衝區
 * （見 getUniforms 的 ubo），著色器裡已經有一份宣告了，
 * 再貼一次就是 redefinition，整支著色器編不過——
 * 而編不過的是每一份方塊材質，畫面上會看不出是哪裡壞的。
 *
 * 後製沒有那個緩衝區，得自己宣告一遍
 */
export const VOXEL_GI_UNIFORM_GLSL = `
uniform vec3 voxelGiGrid;
uniform vec3 voxelGiCellSize;
uniform vec3 voxelGiAtlas;
`

/**
 * 體素全局光
 *
 * 把世界降採樣成一份粗網格，讓光在裡面傳播幾輪，取樣進材質補上
 * 「牆角會反射鄰居顏色」這種間接光——這是能在瀏覽器裡即時跑的簡化版，
 * 不是真的路徑追蹤，詳見 voxel-gi-worker.ts 的說明
 */
class VoxelGiPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，理由與 aerial-perspective 相同 */
    super(material, 'MinespaceVoxelGi', 215, {}, true, true)
  }

  getClassName(): string {
    return 'VoxelGiPlugin'
  }

  getSamplers(samplers: string[]): void {
    samplers.push('voxelGiSampler')
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'voxelGiGrid', size: 3, type: 'vec3' },
        { name: 'voxelGiCellSize', size: 3, type: 'vec3' },
        { name: 'voxelGiAtlas', size: 3, type: 'vec3' },
        { name: 'voxelGiParam', size: 4, type: 'vec4' },
      ],
      /** 不支援統一緩衝區時的退路，理由見 cloud-shadow */
      fragment: `
        uniform vec3 voxelGiGrid;
        uniform vec3 voxelGiCellSize;
        uniform vec3 voxelGiAtlas;
        uniform vec4 voxelGiParam;
      `,
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat3('voxelGiGrid', giState.gridX, giState.gridY, giState.gridZ)
    uniformBuffer.updateFloat3('voxelGiCellSize', giState.cellSizeXZ, giState.cellSizeY, giState.cellSizeXZ)
    uniformBuffer.updateFloat3('voxelGiAtlas', giState.tilesPerRow, giState.atlasWidth, giState.atlasHeight)
    uniformBuffer.updateFloat4('voxelGiParam', giState.enabled, giState.intensity, 0, 0)

    /** 貼圖還沒建出來之前不綁，理由與 cloud-shadow 的 patternTexture 相同 */
    if (giTexture) {
      uniformBuffer.setTexture('voxelGiSampler', giTexture)
    }
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 取樣的算式與光束那一支共用同一份字串
       *
       * 兩邊讀的是同一張圖，磚的排法一旦對不上就會取到別層的資料，
       * 而那種錯在畫面上是看不出來的——只會覺得「顏色怪怪的」。
       * 共用一份就不存在對不上這回事
       */
      CUSTOM_FRAGMENT_DEFINITIONS: `
        ${VOXEL_GI_SAMPLE_GLSL}

        vec3 minespaceVoxelGi(vec3 worldPosition) {
          if (voxelGiParam.x < 0.5) {
            return vec3(0.0);
          }

          return minespaceSampleVoxelGi(worldPosition).rgb * voxelGiParam.y;
        }
      `,

      /**
       * 加在霧之前，與葉片透光同一個位置
       *
       * 補的是間接漫射光，理當跟直射光一樣被霧吃掉；乘上 baseColor
       * 讓這道光帶著表面自己的顏色，而不是憑空疊一層純白
       */
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        color.rgb += minespaceVoxelGi(vPositionW) * baseColor.rgb;
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上體素全局光
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同
 */
export function registerVoxelGi(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin('MinespaceVoxelGi', (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new VoxelGiPlugin(material)
  })
}

export interface VoxelGi {
  /** 每幀呼叫，內部自己節流，多數幀只是比對一下角度就結束 */
  update: (deltaTime: number, sunDirection: Vector3, sunColor: Color3, sunStrength: number) => void;
  dispose: () => void;
}

/**
 * 建立體素全局光
 *
 * 只在世界生成完之後呼叫一次：把世界降採樣成粗網格、丟給 worker、
 * 建一張還沒有內容的貼圖。之後每幀呼叫回傳的 update，
 * 太陽角度變得夠多時才會真的觸發一次重烘
 */
export function createVoxelGi(
  scene: Scene,
  worldState: Uint8Array,
  lightSourceList: BlockLightSource[],
): VoxelGi {
  const { preset } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()

  /**
   * 網格的粗細在建立當下就定了
   *
   * 換畫質不會重建這份網格——重建要把整個世界重掃一次，
   * 那是啟動時才付得起的成本。換等級真正會跟著變的是
   * 「要不要算」與「跑幾輪反彈」，那兩項每一幀都讀得到最新的值
   */
  const cellSize = { xz: preset.value.giCellSizeXZ, y: preset.value.giCellSizeY }

  const grid = buildVoxelGiGrid(worldState, cellSize)
  const lightSeedList = collectVoxelGiLightSeedList(grid, lightSourceList, cellSize)

  /**
   * 磚排成接近正方形的一張圖
   *
   * 排成一長條也行，但那會做出一張又寬又扁的貼圖，
   * 容易撞上顯卡的單邊尺寸上限。開平方根排出來最接近正方
   */
  const tilesPerRow = Math.ceil(Math.sqrt(grid.gridY))
  const tileRowCount = Math.ceil(grid.gridY / tilesPerRow)
  const atlasWidth = tilesPerRow * grid.gridX
  const atlasHeight = tileRowCount * grid.gridZ

  giState.gridX = grid.gridX
  giState.gridY = grid.gridY
  giState.gridZ = grid.gridZ
  giState.cellSizeXZ = cellSize.xz
  giState.cellSizeY = cellSize.y
  giState.tilesPerRow = tilesPerRow
  giState.atlasWidth = atlasWidth
  giState.atlasHeight = atlasHeight
  giState.enabled = 0

  giTexture = RawTexture.CreateRGBATexture(
    /** 一開始沒有內容，全黑——enabled 為零時材質也不會去讀它 */
    new Uint8Array(atlasWidth * atlasHeight * 4),
    atlasWidth,
    atlasHeight,
    scene,
    false,
    false,
    /**
     * 水平方向用雙線性，垂直方向由著色器自己內插
     *
     * 這裡曾經是 NEAREST，顧慮是「磚與磚在圖上相鄰、在世界裡卻是
     * 不同的 Y 層，雙線性會把兩層混在一起」。那個顧慮其實不成立——
     * 取樣座標是 tileOrigin + cell + 0.5，而 cell 已經被夾在
     * [0, gridX - 1]，換算成紋素中心正好是 [0.5, gridX - 0.5]，
     * 雙線性的取樣範圍剛好貼齊磚的邊界，一格都不會跨出去。
     *
     * 而 NEAREST 的代價是實打實的：同一個粗格內（水平四格見方）
     * 的間接光完全一樣、格與格之間硬切，地面上因此浮出一塊一塊的
     * 矩形。白沙是高明度的平面，最藏不住這種階梯。
     *
     * 垂直方向仍然由著色器取兩層再內插（見 VOXEL_GI_SAMPLE_GLSL）：
     * 只有那一份知道哪兩塊磚才是真的相鄰
     */
    Texture.BILINEAR_SAMPLINGMODE,
  )
  /** 世界外緣不要繞回另一頭，貼著邊界取樣不到才不會冒出對面的顏色 */
  giTexture.wrapU = Texture.CLAMP_ADDRESSMODE
  giTexture.wrapV = Texture.CLAMP_ADDRESSMODE

  const worker = useVoxelGiWorker()
  worker.init({
    gridX: grid.gridX,
    gridY: grid.gridY,
    gridZ: grid.gridZ,
    solidList: grid.solidList,
    albedoList: grid.albedoList,
    skyVisibilityList: grid.skyVisibilityList,
    lightSeedList,
    tilesPerRow,
    atlasWidth,
    atlasHeight,
  })

  /** 一開始就檢查一次，不必等滿一個間隔才第一次烘 */
  let elapsed = CHECK_INTERVAL
  let isBaking = false
  let lastBakedDirection: Vector3 | null = null
  let bakeCount = 0

  reportDiagnostic(
    '全局光/網格',
    `格數 ${grid.gridX}×${grid.gridY}×${grid.gridZ}、格距 ${cellSize.xz}×${cellSize.y}`
    + `、圖集 ${atlasWidth}×${atlasHeight}（一列 ${tilesPerRow} 塊）`,
  )
  reportDiagnostic('全局光/燈火數', lightSeedList.length)

  /**
   * 用 CPU 重跑一次著色器的取樣算式
   *
   * 這是要回答一個從畫面上永遠問不出來的問題：GPU 到底讀到了什麼。
   *
   * 資料本身有沒有值，前面那段統計已經答得出來；但「資料有值」與
   * 「著色器取得到」是兩件事——中間隔著圖集的座標換算與貼圖上傳。
   * 這裡照著 VOXEL_GI_SAMPLE_GLSL 一模一樣的算式，在 CPU 上對同一份
   * 資料取樣：
   *
   * - CPU 取得到、畫面卻是黑的 → 座標算式是對的，問題在貼圖上傳或綁定
   * - CPU 也取不到 → 座標算式本身就錯，跟 GPU 無關
   *
   * 兩種情況要查的地方完全不同，而不做這一步就只能猜
   */
  function sampleIndirectOnCpu(data: Uint8Array, worldX: number, worldY: number, worldZ: number): number {
    /** 減掉半格，與著色器那一份保持一致——差一格就不是「重現」了 */
    const cellX = Math.min(grid.gridX - 1, Math.max(0, worldX / cellSize.xz - 0.5))
    const cellY = Math.min(grid.gridY - 1, Math.max(0, worldY / cellSize.y - 0.5))
    const cellZ = Math.min(grid.gridZ - 1, Math.max(0, worldZ / cellSize.xz - 0.5))

    const slice = Math.floor(cellY)
    const tileX = slice % tilesPerRow
    const tileY = Math.floor(slice / tilesPerRow)
    const atlasX = Math.floor(tileX * grid.gridX + cellX)
    const atlasY = Math.floor(tileY * grid.gridZ + cellZ)
    const pixel = (atlasY * atlasWidth + atlasX) * 4

    /** 三個通道取最大值，只是要知道「這一格有沒有東西」 */
    return Math.max(data[pixel] ?? -1, data[pixel + 1] ?? -1, data[pixel + 2] ?? -1) / 255
  }

  function reportAtlasDiagnostic(data: Uint8Array): void {
    /**
     * 每一層各有幾格帶著間接光
     *
     * 這一串數字能一眼看出資料在垂直方向的分布對不對：
     * 間接光是從表面反射出來的，所以該集中在貼近地面與牆面的那幾層，
     * 高空應該接近零。若數字錯位——例如高空那幾層很滿——
     * 就是磚的排法對不上
     */
    const perSliceList: number[] = []
    for (let y = 0; y < grid.gridY; y++) {
      const tileX = y % tilesPerRow
      const tileY = Math.floor(y / tilesPerRow)
      let indirect = 0

      for (let x = 0; x < grid.gridX; x++) {
        for (let z = 0; z < grid.gridZ; z++) {
          const atlasX = tileX * grid.gridX + x
          const atlasY = tileY * grid.gridZ + z
          const pixel = (atlasY * atlasWidth + atlasX) * 4
          if (data[pixel]! > 0 || data[pixel + 1]! > 0 || data[pixel + 2]! > 0) {
            indirect++
          }
        }
      }
      perSliceList.push(indirect)
    }
    reportDiagnostic(
      `全局光/每層有間接光（共 ${grid.gridX * grid.gridZ} 格）`,
      perSliceList.join(', '),
    )

    /**
     * 照著鏡頭的位置取樣
     *
     * 用 CPU 重跑一次著色器的算式，答的是「GPU 到底讀到了什麼」。
     * 資料有值與著色器取得到是兩件事，中間隔著圖集的座標換算與貼圖上傳
     */
    const camera = scene.activeCamera
    if (!camera)
      return

    const { x, y, z } = camera.globalPosition
    const probeList = [
      { label: '鏡頭', offsetY: 0 },
      { label: '鏡頭下 4 格', offsetY: -4 },
      { label: '鏡頭下 10 格', offsetY: -10 },
      { label: '鏡頭上 10 格', offsetY: 10 },
    ]

    const probeText = probeList
      .map((probe) => `${probe.label} ${sampleIndirectOnCpu(data, x, y + probe.offsetY, z).toFixed(2)}`)
      .join('、')

    reportDiagnostic(
      '全局光/鏡頭處取樣（CPU 重現著色器算式）',
      `鏡頭世界座標 ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}｜間接光亮度 ${probeText}`,
    )
  }

  function update(deltaTime: number, sunDirection: Vector3, sunColor: Color3, sunStrength: number): void {
    const isEnabled = preset.value.voxelGi && devToggle.voxelGi
    giState.enabled = isEnabled ? 1 : 0
    reportDiagnostic(
      '全局光/啟用',
      `${isEnabled}（畫質 ${preset.value.voxelGi}、除錯開關 ${devToggle.voxelGi}）`,
    )
    if (!isEnabled)
      return

    elapsed += deltaTime
    if (elapsed < CHECK_INTERVAL)
      return

    elapsed = 0
    /** 上一次請求還沒回來，這一輪先跳過，別把 worker 的信箱塞爆 */
    if (isBaking)
      return

    const hasMovedEnough = !lastBakedDirection
      || Vector3.Distance(lastBakedDirection, sunDirection) > REBAKE_ANGLE_THRESHOLD
    if (!hasMovedEnough)
      return

    isBaking = true
    const requestDirection = sunDirection.clone()

    worker.bake({
      sunColor: [sunColor.r, sunColor.g, sunColor.b],
      sunStrength,
      bouncePassCount: preset.value.giBouncePassCount,
    })
      .then((data) => {
        giTexture?.update(data)
        lastBakedDirection = requestDirection
        bakeCount++

        /**
         * 貼圖本身的狀態
         *
         * 資料對、算式也對的話，剩下唯一會出錯的地方就是這張圖——
         * 尺寸與資料長度對不上、或者根本還沒準備好，
         * 取樣出來都會是零，而那兩件事從畫面上完全看不出來
         */
        if (giTexture) {
          const size = giTexture.getSize()
          reportDiagnostic(
            '全局光/貼圖狀態',
            `${size.width}×${size.height}、資料 ${data.length} 位元組`
            + `（預期 ${atlasWidth * atlasHeight * 4}）、就緒 ${giTexture.isReady()}`,
          )
        }

        /**
         * 烘出來的到底有沒有東西
         *
         * 「著色器編過了、貼圖也綁上了，但畫面什麼都沒有」的時候，
         * 最該先問的是這一份資料本身是不是全零——那比任何猜測都快
         */
        if (import.meta.env.DEV) {
          let indirectCount = 0
          for (let pixel = 0; pixel < data.length; pixel += 4) {
            if (data[pixel]! > 0 || data[pixel + 1]! > 0 || data[pixel + 2]! > 0) {
              indirectCount++
            }
          }

          const total = data.length / 4
          reportDiagnostic(
            '全局光/烘焙結果',
            `第 ${bakeCount} 次，共 ${total} 格：有間接光 ${indirectCount}`,
          )

          reportAtlasDiagnostic(data)
        }
      })
      /** 逾時或失敗就跳過這一輪，下次角度再變就會重試，不必特別處理 */
      .catch((error: unknown) => {
        reportDiagnostic('全局光/烘焙結果', `失敗：${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        isBaking = false
      })
  }

  function dispose(): void {
    worker.dispose()
    giTexture?.dispose()
    giTexture = null
    giState.enabled = 0
  }

  return { update, dispose }
}
