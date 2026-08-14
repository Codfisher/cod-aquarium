import type { Material, Scene, UniformBuffer, Vector3 } from '@babylonjs/core'
import { MaterialPluginBase, RawTexture, RegisterMaterialPlugin, StandardMaterial, Texture } from '@babylonjs/core'

/**
 * 雲影最深時擋掉幾成的直射光
 *
 * 不是全擋。一朵積雲底下並不是黑的——太陽被擋住了，
 * 整片天空還在補光，而環境光這一項本來就不受雲影影響
 * （這個效果只乘進平行光）。半成剛好是「明顯暗了一塊」
 * 但還看得見地面紋理的程度
 */
const SHADE_DEPTH = 0.5

/**
 * 覆蓋率要到多少才開始遮、多少才遮到滿
 *
 * 圖樣本身是全有全無的格子，模糊過之後才有中間值。
 * 這兩個門檻決定雲影的邊緣有多硬：拉近是輪廓分明的積雲影，
 * 拉遠是糊成一片的高層雲。留一段距離，邊緣才有那圈半影
 */
const COVER_START = 0.2
const COVER_FULL = 0.78

/**
 * 太陽壓到這麼低就把雲影收掉
 *
 * 兩個理由。一是物理：太陽貼著地平線時，光要橫穿一百多格的空氣
 * 才到得了地面，雲影早就散得沒有形狀了。
 *
 * 二是這個投影法本身。雲在頭頂一百格高，投影點要沿著光線
 * 往回推 (雲高 − 腳下高度) ÷ 太陽仰角——仰角趨近零時那個距離會爆掉，
 * 整片地會被一格雲的顏色蓋滿。與其加保護，不如在還看得出形狀時就淡出
 */
const SUN_HEIGHT_FADE_START = 0.1
const SUN_HEIGHT_FADE_FULL = 0.32

/**
 * 圖樣要模糊幾輪
 *
 * 原始圖樣是一格十四格寬的布林值，直接雙線性取樣會拉出菱形的塊。
 * 先在畫布上糊開，取樣時才是一團有濃有淡的雲影。
 *
 * 順帶一提這也是物理上對的：太陽有半度的張角，
 * 雲在一百格高投下來的影子，邊緣本來就有好幾格寬的半影
 */
const BLUR_PASS_COUNT = 2

/**
 * 這一刻的雲影
 *
 * 與 aerial-perspective 的 airState 同一種寫法：所有材質共用一份，
 * 每一幀由漫遊控制器寫一次，下一幀各材質綁定時自己來讀。
 * 兩百多份材質各存一套的話，改天氣得走過每一份
 */
const cloudShadowState = {
  /** 最深遮到幾成，零等於這個效果不存在 */
  strength: 0,
  /** 雲層此刻往 +X 飄了多遠，要從投影點扣掉才對得回原本的圖樣格 */
  driftX: 0,
  /** 每高出地面一格，投影點要往回退多少（太陽的水平斜率） */
  slopeX: 0,
  slopeZ: 0,
  /** 雲層高度 */
  height: 0,
  /** 一除以圖樣涵蓋的世界寬度，世界座標乘上它就是貼圖座標 */
  inverseSpan: 0,
}

/** 雲的覆蓋圖，由 createCloudLayer 把它自己那份圖樣交過來 */
let patternTexture: Texture | null = null

/**
 * 雲影
 *
 * 天上飄著一整片雲，地面卻從早到晚是同一個亮度——這是原本的樣子。
 * 少了這一層，白沙庭園那一大片高明度的地會平得像一張紙：
 * 太陽角度在變，但「這一塊比較暗」這件事從來沒發生過。
 *
 * ── 為什麼不能用光的投影貼圖 ──
 *
 * 一般引擎的做法是給太陽掛一張捲動的雲圖（light cookie）。
 * Babylon 的 projectionTexture 只有聚光燈有，平行光沒有這個東西，
 * 所以只能走材質外掛，在著色器裡自己算。
 *
 * ── 為什麼要與真正的雲對得起來 ──
 *
 * 大可隨便鋪一張噪聲。但這個世界是循環的：走過邊界時位置會平移
 * 一整個世界的寬度，雲的圖樣正是為此才做成剛好一個世界寬
 * （見 createCloudLayer 那段說明）。雲影若用另一個週期，
 * 跨過邊界的那一瞬間地上的暗塊會整片換一副樣子。
 *
 * 既然週期非得一樣，不如直接拿同一份圖樣：把那 18×18 個布林值
 * 糊一糊烘成一張小圖，著色器沿著光線往上找就是了。
 * 一次貼圖取樣，換到的是「地上那塊暗確實是頭頂那朵雲的」
 *
 * ── 這個效果目前是沒有作用的 ──
 *
 * 畫面上看不到任何雲影。查過一輪，範圍已經縮到最後一小塊，
 * 記在這裡免得下次從頭來過。
 *
 * 已經逐項驗證過、可以排除的：
 *
 * 一、著色器注入是好的。攔下真正送進 GPU 的原始碼確認過：
 *     minespaceCloudShade 的定義在、cloudShade 有被賦值、
 *     也確實乘進了 computeLighting。呼叫次數三次
 *     （一個函式定義加兩處呼叫），對得上場景的燈組。
 *     最終 GLSL 裡沒有 #ifdef 是正常的——前處理器早就把條件解掉了。
 *
 * 二、資料是對的。強度 0.5、雲高 104、取樣縮放 0.00397（= 1/252）、
 *     斜率與飄移都在動，圖樣貼圖也建出來了。
 *
 * 三、uniform 真的送得到著色器。把函式改成
 *     `return 1.0 - cloudShadowParam.x;`（跳過圖樣與座標）之後，
 *     整片地面明顯變暗，而且開關一切換就恢復。
 *
 * 四、外掛機制沒問題。halo-soft-fade 用一模一樣的寫法
 *     （同樣的 getSamplers、同樣的 super 參數、同樣的 setTexture），
 *     而它是好的。
 *
 * 五、模組被載入兩次（場景跑在 whyframe 的 iframe 裡，
 *     外層頁面與 iframe 各一份），但活著的那一份數值全對，
 *     而且兩者是不同 realm，globalThis 也共用不了——與這個問題無關。
 *
 * 剩下唯一的嫌疑：cloudShadowSampler 那一次取樣讀出來恆為零。
 * 把 cover 直接當遮蔽量用（跳過 smoothstep）、
 * 甚至把取樣縮放拉到每十二格重複一次讓圖樣鋪滿整個視野，
 * 地面都毫無變化。所以不是門檻卡太高，也不是圖樣太稀疏——
 * 是那張圖根本沒被取樣到，或者取到的是全黑。
 *
 * 下次從這裡接：確認 RawTexture 有沒有真的綁上那個取樣器
 * （isReady、通道格式、UniformBuffer.setTexture 有沒有找到位置），
 * 或者換成 material.diffuseTexture 之類已知會綁的路徑對照看看
 */
class CloudShadowPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，理由與 aerial-perspective 相同 */
    super(material, 'MinespaceCloudShadow', 210, {}, true, true)
  }

  getClassName(): string {
    return 'CloudShadowPlugin'
  }

  getSamplers(samplers: string[]): void {
    samplers.push('cloudShadowSampler')
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'cloudShadowParam', size: 4, type: 'vec4' },
        { name: 'cloudShadowProjection', size: 4, type: 'vec4' },
      ],
      /**
       * 這一段只有不支援統一緩衝區時才派得上用場
       *
       * 支援的時候上面那個 ubo 陣列會被塞進材質的統一緩衝區，
       * 而著色器裡根本沒有 ADDITIONAL_FRAGMENT_DECLARATION 這個位置，
       * 這串字會靜靜地被丟掉。兩邊都寫，退路才在
       */
      fragment: `
        uniform vec4 cloudShadowParam;
        uniform vec4 cloudShadowProjection;
      `,
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const state = cloudShadowState

    uniformBuffer.updateFloat4(
      'cloudShadowParam',
      state.strength,
      state.inverseSpan,
      COVER_START,
      COVER_FULL,
    )
    uniformBuffer.updateFloat4(
      'cloudShadowProjection',
      state.slopeX,
      state.slopeZ,
      state.height,
      state.driftX,
    )

    /**
     * 圖樣還沒生出來時不綁
     *
     * 沒綁的取樣器在 WebGL2 讀出來是全黑，而強度此時還是零，
     * 乘出來仍然是「沒有雲影」。畫面不會壞，只是那幾幀沒有效果
     */
    if (patternTexture) {
      uniformBuffer.setTexture('cloudShadowSampler', patternTexture)
    }
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 沿著光線往上找，看頭頂那個位置有沒有雲
       *
       * 雲在 height 這麼高，光沿著太陽的方向斜射下來。
       * 腳下這個點被遮住與否，取決於「往回推到雲層高度」的那一格
       * 是不是雲——所以先依高度差把座標推回去，再扣掉雲此刻飄了多遠，
       * 剩下的就是原始圖樣裡的位置。
       *
       * 取樣器用重複定址，座標推到圖樣外面會自己繞回來，
       * 這與循環世界是同一件事
       */
      'CUSTOM_FRAGMENT_DEFINITIONS': `
        uniform sampler2D cloudShadowSampler;

        float minespaceCloudShade() {
          if (cloudShadowParam.x <= 0.0) {
            return 1.0;
          }

          vec2 cloudPoint = vPositionW.xz
            - (cloudShadowProjection.z - vPositionW.y) * cloudShadowProjection.xy
            - vec2(cloudShadowProjection.w, 0.0);

          float cover = texture2D(cloudShadowSampler, cloudPoint * cloudShadowParam.y).r;

          return 1.0 - cloudShadowParam.x * smoothstep(cloudShadowParam.z, cloudShadowParam.w, cover);
        }
      `,

      /**
       * 只乘進平行光，而且漫射與高光都要乘
       *
       * 雲擋住的是太陽，不是天空。環境光、洞裡那幾盞燈都不該跟著暗——
       * DIRLIGHT 這個條件就是在挑「這一盞是不是平行光」，
       * 而整個場景裡只有日月那一盞是。
       *
       * 高光同樣要收。少了那一行，一朵雲飄過水鏡池的時候
       * 池面照樣閃著一道刺眼的反光——那道光的來源明明正被遮著。
       *
       * 這一行是 include 展開後每一盞燈各一份，正規式帶著 g 旗標
       * 會全部換過，靠 $3 把燈的編號帶進條件裡。
       * 哪天 Babylon 改了這行的寫法，正規式找不到就靜靜地不做事，
       * 畫面退回沒有雲影的樣子，不會壞掉。
       *
       * 每個 $n 只准出現一次。Babylon 代換捕獲群組用的是
       * `newCode.replace('$' + i, match[i])`——字串比對，一個編號只換掉
       * 最前面那一個，後面的原封不動留在著色器裡變成 `$` 字元，
       * 整支著色器編不過。所以寧可多切幾個群組，也不要重複用同一個編號。
       * 漫射與高光連同編號各自獨立成群，就是為了守住這條規則。
       *
       * 注入的那段 GLSL 裡不要寫註解。Babylon 的前處理器用
       * `/(#ifdef)|(#else)|(#elif)|(#endif)|(#ifndef)|(#if)/` 掃每一行，
       * 沒有錨定行首，也不先把註解拿掉——註解裡提到條件編譯指令的名字，
       * 就會被當成真的指令，條件層數從此對不起來，
       * 游標一路跑到檔尾，後面整段著色器憑空消失。
       * 要解釋就寫在這裡，這裡的字不會進到著色器。
       *
       * 至於下面那段在做什麼：平行光以外的那幾盞，條件編譯整段會被拿掉，
       * cloudShade 就是常數 1.0，乘法會被編譯器摺掉，不花錢
       */
      '!info=computeLighting\\(viewDirectionW,normalW,([^,]+),(diffuse(\\d+)\\.rgb),([^,]+),(diffuse\\3\\.a),glossiness\\);': `
        {
          float cloudShade = 1.0;
          #ifdef DIRLIGHT$3
            cloudShade = minespaceCloudShade();
          #endif

          info = computeLighting(viewDirectionW, normalW, $1, $2 * cloudShade, $4 * cloudShade, $5, glossiness);
        }
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上雲影
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同：
 * 外掛是靠「材質被建立」這個事件自己接上去的
 */
export function registerCloudShadow(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin('MinespaceCloudShadow', (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new CloudShadowPlugin(material)
  })
}

/** 繞著圖樣邊界讀，這與雲層那邊的 readCell 是同一套規則 */
function readWrapped(valueList: number[], size: number, x: number, z: number): number {
  const wrappedX = ((x % size) + size) % size
  const wrappedZ = ((z % size) + size) % size
  return valueList[wrappedZ * size + wrappedX] ?? 0
}

/**
 * 把布林的雲格糊成有濃淡的覆蓋率
 *
 * 三乘三取平均，跑幾輪。邊界要繞回去，否則圖樣接縫上會出現一條亮線——
 * 而這張圖是要拿去無限平鋪的
 */
function blurPattern(cellList: boolean[], size: number): number[] {
  let valueList: number[] = cellList.map((isCloud) => (isCloud ? 1 : 0))

  for (let pass = 0; pass < BLUR_PASS_COUNT; pass++) {
    const nextList = valueList.slice()
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        let total = 0
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            total += readWrapped(valueList, size, x + offsetX, z + offsetZ)
          }
        }
        nextList[z * size + x] = total / 9
      }
    }
    valueList = nextList
  }

  return valueList
}

/**
 * 把雲層那份圖樣交過來
 *
 * 由 createCloudLayer 呼叫。它是唯一知道雲長什麼樣的地方，
 * 而這裡需要的正是同一份資料——與其重算一次（那就會算出不同的雲），
 * 不如讓它把結果送過來
 */
export function setCloudShadowPattern(
  scene: Scene,
  cellList: boolean[],
  patternCount: number,
  cellSize: number,
  cloudHeight: number,
): void {
  patternTexture?.dispose()

  const coverList = blurPattern(cellList, patternCount)

  /**
   * 用四通道，不用單通道
   *
   * 單通道格式在不同裝置上的支援情況要一個一個確認，
   * 而這張圖只有十八格見方——多三個通道也才多一千個位元組。
   * 拿確定不會出事換掉那點記憶體很划算
   */
  const data = new Uint8Array(patternCount * patternCount * 4)
  for (const [index, cover] of coverList.entries()) {
    const value = Math.round(Math.min(1, Math.max(0, cover)) * 255)
    data[index * 4] = value
    data[index * 4 + 1] = value
    data[index * 4 + 2] = value
    data[index * 4 + 3] = 255
  }

  const texture = RawTexture.CreateRGBATexture(
    data,
    patternCount,
    patternCount,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  /** 圖樣要無限平鋪，這是循環世界的硬性條件 */
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE

  patternTexture = texture
  cloudShadowState.height = cloudHeight
  cloudShadowState.inverseSpan = 1 / (patternCount * cellSize)
}

/**
 * 雲層此刻飄到哪裡
 *
 * 由雲層自己的飄移那一段順手寫進來。繞一圈去場景裡按名字找那顆網格
 * 也讀得到，但那是每一幀都會走的路——讓知道答案的人直接說就好
 */
export function setCloudShadowDrift(driftX: number): void {
  cloudShadowState.driftX = driftX
}

/** 收掉雲的覆蓋圖 */
export function disposeCloudShadow(): void {
  patternTexture?.dispose()
  patternTexture = null
  cloudShadowState.strength = 0
}

/**
 * 寫入這一刻的雲影
 *
 * @param sunDirection 平行光的方向，也就是光線前進的方向
 * @param clarity 直射陽光還剩幾成，陰天與洞裡要收掉
 * @param isEnabled 除錯開關
 */
export function updateCloudShadow(
  sunDirection: Vector3,
  clarity: number,
  isEnabled = true,
): void {
  /** 光線往下走，y 越負代表太陽越高 */
  const sunHeight = -sunDirection.y

  if (!isEnabled || sunHeight <= SUN_HEIGHT_FADE_START) {
    cloudShadowState.strength = 0
    return
  }

  const heightRatio = Math.min(
    1,
    (sunHeight - SUN_HEIGHT_FADE_START) / (SUN_HEIGHT_FADE_FULL - SUN_HEIGHT_FADE_START),
  )

  cloudShadowState.strength = SHADE_DEPTH
    * heightRatio
    * Math.min(1, Math.max(0, clarity))
  cloudShadowState.slopeX = sunDirection.x / sunHeight
  cloudShadowState.slopeZ = sunDirection.z / sunHeight
}
