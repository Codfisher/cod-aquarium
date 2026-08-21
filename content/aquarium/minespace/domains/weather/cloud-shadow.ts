import type { Material, Scene, UniformBuffer, Vector3 } from '@babylonjs/core'
import { MaterialPluginBase, RawTexture, RegisterMaterialPlugin, StandardMaterial, Texture } from '@babylonjs/core'

/**
 * 雲影最深時擋掉幾成的直射光
 *
 * 這個數字比「物理上該有的」大。理由與色調映射有關，
 * 寫在下面 SKY_SHADE_DEPTH 那一段，兩個要一起讀
 */
const SHADE_DEPTH = 0.72

/**
 * 雲影連天光一起收掉幾成
 *
 * 原本這一項是零，理由寫得很篤定：「雲擋住的是太陽，不是天空」。
 * 那句話只對了一半。一朵積雲罩在頭頂時，它擋掉的除了那顆太陽，
 * 還有頭頂那一大塊天空，站在雲底下天光確實也少了一截。
 *
 * 而真正逼著這一項從零長出來的，是色調映射。
 *
 * 這座庭園的地是白沙。正午時平行光加天光加上環境色，
 * 線性亮度是 1.75，早就衝過 ACES 的膝點，整片地貼在天花板上。
 * 量過的數字：只收平行光、深度給到 0.6，最暗處是 204，
 * 沒有雲影的地方是 209——差五階，等於看不見。
 * 雲影一直都算對了，只是全部被壓在那道天花板底下。
 *
 * 天光跟著收，兩邊一起把總量壓到膝點以下，那塊暗才掉得出來。
 * 量過的組合（白沙 / 一般方塊，數字是最深處與無雲處）：
 *
 *   0.60 / 0.30 → 204..209 / 142..209   白沙上還是看不見
 *   0.72 / 0.42 → 174..209 / 108..209   白沙看得出來，深色地面也不死黑
 *   0.82 / 0.55 → 130..209 /  75..209   太深，像雲飄過去整個世界暗一下
 *
 * 所以這兩個數字是照著這座場景的曝光配的，不是物理值。
 * 哪天 pipeline 的 exposure 或日夜的光強調低、畫面離開了膝點，
 * 這兩個數字就該一起往回收
 */
const SKY_SHADE_DEPTH = 0.42

/**
 * 天光那一份相對於直射光的比例
 *
 * 兩者共用同一個覆蓋率與同一組淡出，差的只有深度。
 * 直接把比例算成常數塞進著色器，就不必為了它多開一個 uniform
 */
const SKY_SHADE_RATIO = SKY_SHADE_DEPTH / SHADE_DEPTH

/**
 * 覆蓋率要到多少才開始遮、多少才遮到滿
 *
 * 圖樣本身是全有全無的格子，模糊過之後才有中間值。
 * 這兩個門檻決定雲影的邊緣有多硬：拉近是輪廓分明的積雲影，
 * 拉遠是糊成一片的高層雲。留一段距離，邊緣才有那圈半影。
 *
 * 這兩個數字是照著「零到一」訂的，所以糊完的圖樣必須先正規化，
 * 否則雲小一點就永遠踩不到 COVER_FULL——見 blurPattern
 */
const COVER_START = 0.1
const COVER_FULL = 0.5

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
 * 一格雲要切成幾個紋素
 *
 * 這是雲影邊緣清不清楚的關鍵，而它一開始是一（貼圖與雲的圖樣同解析度）。
 *
 * 問題在於一格雲有十四格寬。糊兩輪等於糊掉兩個紋素，也就是二十八格；
 * 量出來的半影寬度是二十格，而一朵雲的影子總共才五十來格寬——
 * 半影吃掉了將近一半，剩下的不是影子，是一團髒污。
 *
 * 切細之後模糊的半徑就與雲的大小脫鉤了。四倍是每個紋素三點五格，
 * 同樣糊兩輪，半影收到四格。貼圖從 1.6 KB 長到 25 KB，換得回來。
 *
 * 邊緣清楚之後看得出雲的方格輪廓，那是對的：
 * 天上那朵雲本來就是方塊堆的，影子理當跟著有稜有角
 */
const SHADOW_TEXEL_PER_CELL = 4

/**
 * 圖樣要模糊幾輪
 *
 * 直接雙線性取樣一張全有全無的圖會拉出菱形的塊，糊過才有中間值。
 * 在切細之後的格子上跑，兩輪大約是四格寬的半影。
 *
 * 這裡原本寫著「太陽有半度的張角，邊緣本來就有好幾格寬的半影」。
 * 那句話是錯的，而且錯得很遠：雲在地面上方約七十四格，
 * 半度張角投下來的半影是 74 × tan(0.53°)，也就是零點七格，不到一格。
 *
 * 真正該糊的理由不是太陽的大小，是雲自己的邊本來就不是一刀切的——
 * 厚度往邊緣遞減，遮光量跟著遞減。這幾格半影模擬的是那件事
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
 * 既然週期非得一樣，不如直接拿同一份圖樣：把那些布林值糊一糊烘成一張小圖，
 * 著色器沿著光線往上找就是了。
 * 一次貼圖取樣，換到的是「地上那塊暗確實是頭頂那朵雲的」
 *
 * ── 這個效果曾經看起來像壞掉的 ──
 *
 * 有很長一段時間畫面上完全看不到雲影，而所有跡象都指向取樣器沒綁上。
 * 那個方向查到底都是錯的，機制從頭到尾都是好的，問題在資料：
 *
 * 一、雲的圖樣幾乎是空的。舊的雲形狀是細胞自動機加上一道削雲團的侵蝕，
 *     兩者疊起來收斂到只剩十二格雲，而且全擠在同一條 Z 帶上。
 *     雲只往 +X 飄，那條帶以外的地面永遠等不到雲經過
 *     （見 use-babylon-scene 的 createCloudPattern）。
 *
 * 二、門檻踩不到。三乘三糊兩輪之後最濃的一格只剩零點七幾，
 *     而 COVER_FULL 是 0.78——最深的雲影也到不了滿格
 *     （見 blurPattern 末尾那一段正規化）。
 *
 * 三、週期對不上世界。圖樣寫死 18 格、格寬 14，乘起來是 252，
 *     而世界寬度是 280。
 *
 * 四、算對了也看不見。白沙在正午的線性亮度是 1.75，貼在 ACES 的天花板上，
 *     只收平行光的話最暗處與無雲處只差五階
 *     （見 SKY_SHADE_DEPTH 那一段的量測）。
 *
 * 留兩句給下次。查外掛的取樣器有沒有綁上，最快的方法是拿掉所有變因，
 * 用一張全白的 RawTexture 去比對，地面該整片黑掉；
 * 分不出「沒綁上」與「綁上了但圖是空的」的時候，先讓資料變成常數。
 *
 * 而畫面上看不到效果，不代表效果沒算。加東西之前先確認那塊地
 * 還在色調映射的線性段裡，貼著天花板的地方加什麼都不會動
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

        float minespaceCloudCover() {
          if (cloudShadowParam.x <= 0.0) {
            return 0.0;
          }

          vec2 cloudPoint = vPositionW.xz
            - (cloudShadowProjection.z - vPositionW.y) * cloudShadowProjection.xy
            - vec2(cloudShadowProjection.w, 0.0);

          float cover = texture2D(cloudShadowSampler, cloudPoint * cloudShadowParam.y).r;

          return smoothstep(cloudShadowParam.z, cloudShadowParam.w, cover);
        }
      `,

      /**
       * 覆蓋率一幀只算一次
       *
       * 平行光與天光都要用到它，而它裡面有一次貼圖取樣。
       * 擺在光照之前算好存起來，兩盞燈共用同一個值
       */
      'CUSTOM_FRAGMENT_BEFORE_LIGHTS': `
        float minespaceCloudCoverValue = minespaceCloudCover();
      `,

      /**
       * 天光也收一截
       *
       * 這一行是半球光專用的，條件編譯已經把它框在 HEMILIGHT 裡面，
       * 不必再自己加一層條件。場景裡的半球光只有一盞，就是天光。
       *
       * 天空色與地面反射色兩份都乘。雲罩在頭頂時擋掉的是天空那一半，
       * 而地面反射的光本來就是曬到的地面反上來的，
       * 那塊地一起在影子裡，反上來的自然也少
       */
      '!info=computeHemisphericLighting\\(viewDirectionW,normalW,([^,]+),(diffuse(\\d+)\\.rgb),([^,]+),([^,]+),glossiness\\);': `
        {
          float cloudSkyShade = 1.0 - cloudShadowParam.x * ${SKY_SHADE_RATIO.toFixed(4)} * minespaceCloudCoverValue;

          info = computeHemisphericLighting(viewDirectionW, normalW, $1, $2 * cloudSkyShade, $4, $5 * cloudSkyShade, glossiness);
        }
      `,

      /**
       * 平行光收得最深，而且漫射與高光都要乘
       *
       * 雲擋掉的主要是那顆太陽，天光只是連帶收了一截（見 SKY_SHADE_DEPTH）。
       * 洞裡那幾盞燈則完全不該跟著暗——
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
            cloudShade = 1.0 - cloudShadowParam.x * minespaceCloudCoverValue;
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
 * 把每一格雲切成 SHADOW_TEXEL_PER_CELL 個紋素
 *
 * 純放大，不內插。要的只是「讓後面的模糊有比較細的格子可以糊」，
 * 這一步本身不該讓邊緣變樣
 */
function upsamplePattern(cellList: boolean[], size: number, factor: number): number[] {
  const fineSize = size * factor

  return Array.from({ length: fineSize * fineSize }, (_, index) => {
    const x = Math.floor((index % fineSize) / factor)
    const z = Math.floor(Math.floor(index / fineSize) / factor)
    return cellList[z * size + x] ? 1 : 0
  })
}

/**
 * 把全有全無的雲格糊成有濃淡的覆蓋率
 *
 * 三乘三取平均，跑幾輪。邊界要繞回去，否則圖樣接縫上會出現一條亮線——
 * 而這張圖是要拿去無限平鋪的
 */
function blurPattern(cellValueList: number[], size: number): number[] {
  let valueList: number[] = cellValueList.slice()

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

  /**
   * 糊完之後把最濃的一格拉回滿格
   *
   * 三乘三取平均只有在「一朵雲寬到中心那格的鄰居全是雲」時才留得住 1.0。
   * 兩輪之後那要五格寬，而多數雲不到那麼大——最濃的地方只剩零點七幾。
   * 門檻卻是照著 0 到 1 訂的，於是最深的雲影也永遠踩不到 COVER_FULL，
   * 整個效果被壓成一層看不太出來的灰。
   *
   * 拉回去之後，「雲最厚的地方」對上的就是「影子最深的程度」，
   * 這兩個數字本來就該是同一件事。雲多雲少都不必再回頭改門檻
   */
  const peak = Math.max(...valueList)
  if (peak <= 0) {
    return valueList
  }

  return valueList.map((value) => value / peak)
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

  /**
   * 貼圖比雲的圖樣細，取樣座標卻不必跟著改
   *
   * 座標是拿世界座標除以「圖樣涵蓋的世界寬度」算出來的，
   * 那個寬度與貼圖有幾個紋素無關。切細只是讓同一塊範圍多幾格可以糊
   */
  const shadowCount = patternCount * SHADOW_TEXEL_PER_CELL
  const coverList = blurPattern(
    upsamplePattern(cellList, patternCount, SHADOW_TEXEL_PER_CELL),
    shadowCount,
  )

  /**
   * 用四通道，不用單通道
   *
   * 單通道格式在不同裝置上的支援情況要一個一個確認，
   * 而這張圖只有八十格見方——多三個通道也才多兩萬個位元組。
   * 拿確定不會出事換掉那點記憶體很划算
   */
  const data = new Uint8Array(shadowCount * shadowCount * 4)
  for (const [index, cover] of coverList.entries()) {
    const value = Math.round(Math.min(1, Math.max(0, cover)) * 255)
    data[index * 4] = value
    data[index * 4 + 1] = value
    data[index * 4 + 2] = value
    data[index * 4 + 3] = 255
  }

  const texture = RawTexture.CreateRGBATexture(
    data,
    shadowCount,
    shadowCount,
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
