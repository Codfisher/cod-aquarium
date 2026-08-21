import type { Color3, Scene, UniversalCamera, Vector3 } from '@babylonjs/core'
import { Vector3 as BabylonVector3, Effect, Matrix, PostProcess } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { reportDiagnostic } from '../../composables/use-error-logger'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { createVolumetricShadow } from './volumetric-shadow'

const SHADER_NAME = 'minespaceVolumetricLight'

/** 除錯檢視要看哪一個中間量，按 F7 循環，見著色器裡各模式的說明 */
const DEBUG_MODE_LABEL_LIST = [
  '一號：可見度／距離／相位（紅綠藍）',
  '二號：只畫加上去的那道光',
  '三號：只畫深度',
  '四號：只畫陰影圖查出來的可見度',
]

const debugState = { mode: 1 }

/**
 * 換下一種除錯檢視
 *
 * 空間性的瑕疵沒辦法用文字紀錄追——樹葉透出木頭這種問題，
 * 唯一問得出答案的是「把中間量單獨畫出來看」。
 * 各個量的失敗方式不同，所以分成幾張圖輪流看
 */
export function cycleVolumetricDebugMode(): string {
  debugState.mode = (debugState.mode % DEBUG_MODE_LABEL_LIST.length) + 1

  const label = DEBUG_MODE_LABEL_LIST[debugState.mode - 1] ?? ''
  reportDiagnostic('體積光/除錯檢視模式', label)

  return label
}

/**
 * 光束最多往前走多遠（格）
 *
 * 這個距離同時是成本與觀感的上限。給太遠，同樣的步數會被攤得很稀，
 * 光束糊成一片平均的霧；而霧本來在一百格就開始收，
 * 再遠的光束也早就被霧吃掉了
 */
const MAX_DISTANCE = 90

/**
 * 光束最亮到什麼程度
 *
 * 這個數字曾經是 0.5，而那讓整個畫面泛白——不是光束太亮，
 * 是它變成了一層均勻的白幕。理由見著色器裡「要乘上走過多長」那一段：
 * 少了那一項，正午戶外每一個像素都被無條件加亮半個單位。
 *
 * 修好之後這裡還是收了一階。光束是空氣裡的東西，它該是
 * 「看得出有一道光斜插進來」，不是「整片畫面亮一階」。
 *
 * 補上相位函數之後可以給回來一些：那一項會把亮度集中到
 * 望向太陽的那一側，不再是整片均勻地加。
 *
 * 但集中之後反而在晨昏出過一次事：望向朝陽時那一小塊被推爆了。
 * 治本的是天空不疊那一項（見著色器的 geometryRatio）。
 *
 * 這個數字曾經一路被壓到四成，而那是被錯誤的前提逼出來的：
 * 當時的可見度來自體素粗網格，場裡處處都是一，加什麼都變成
 * 一層均勻的白幕，只好靠壓低強度遮掩。換成真正的陰影圖之後
 * 場裡有了明暗對比，加大換到的是更清楚的光束，不再是更白的畫面。
 *
 * 而畫面出去還要過一次 ACES——早晨的白沙本來就頂在膝點附近，
 * 加上去的量會被壓縮掉大半，所以這個值可以大於一：
 * 它是加在色調映射之前的線性值，不是最終畫面上的亮度。
 *
 * 累積改取平均之後（見著色器裡那一段），遠處不再被距離放大，
 * 這裡收一階剛好補回來——原本九十格外會拿到接近滿檔，
 * 現在無論遠近都是同一個上限
 */
const MAX_STRENGTH = 0.6

/**
 * 沿著視線行進的光束
 *
 * 原本那道光束（god-rays.ts）是螢幕空間的放射狀模糊：拿太陽在畫面上的
 * 位置往外一路取樣疊加。那個做法很便宜，但它的前提是「太陽要在畫面裡」——
 * 太陽一轉到背後，投影出來的原點落在畫面之外，整個效果只能關掉。
 * 於是這座庭園裡最想看到的那一幕反而看不到：站在鳥居底下背對夕陽，
 * 光從身後穿過柱子與松枝灑進來。
 *
 * 這一支換了做法：從鏡頭往每一個像素射一條線，沿路一步一步問
 * 「這一點的空氣照得到太陽嗎」，照得到就累加一點亮度。
 * 太陽在哪個方向完全不影響它成不成立，被遮住的地方自然就暗下來，
 * 光束因此是從真的幾何縫隙裡透出來的。
 *
 * ── 那份「照得到嗎」從哪來 ──
 *
 * 沿路每一步都去查陰影圖是正規做法，但這個場景的陰影在高畫質是分層的，
 * 要在著色器裡自己挑層、自己算每一層的矩陣，是一整套獨立的機制。
 *
 * 而這個世界剛好已經有一份現成的答案：體素全局光那張三維格子，
 * 它的 alpha 欄存的正是「這一格照得到多少陽光」（見 voxel-gi-worker）。
 * 那份資料本來就每隔幾秒跟著太陽重烘一次，直接拿來行進就好——
 * 解析度是粗的（水平四格、垂直兩格一單元），所以光束的邊緣是軟的，
 * 而那正好是光束該有的樣子
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform sampler2D depthSampler;

/**
 * 專門給光束用的那張陰影圖，見 volumetric-shadow.ts
 *
 * 存的是「從太陽看過去，這個方向最近的表面有多遠」。
 * 拿取樣點自己離太陽的距離跟它比，就知道這一點在不在陰影裡
 */
uniform sampler2D volumetricShadowSampler;
uniform mat4 volumetricShadowViewProjection;
uniform mat4 volumetricShadowView;
uniform float volumetricShadowBias;

float minespaceSunVisibility(vec3 worldPosition) {
  vec4 clipPosition = volumetricShadowViewProjection * vec4(worldPosition, 1.0);
  vec2 uv = (clipPosition.xy / clipPosition.w) * 0.5 + 0.5;

  /**
   * 走出這張圖就當作照得到
   *
   * 這張圖只罩住鏡頭附近那一塊。超出去的地方沒有資料，
   * 判成陰影的話，遠處會憑空冒出一片方形的暗
   */
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 1.0;
  }

  float occluderDistance = texture2D(volumetricShadowSampler, uv).r;
  float sampleDistance = (volumetricShadowView * vec4(worldPosition, 1.0)).z;

  return sampleDistance <= occluderDistance + volumetricShadowBias ? 1.0 : 0.0;
}

uniform mat4 inverseViewProjection;
uniform vec3 cameraPosition;
uniform vec3 cameraForward;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float strength;
uniform float maxDistance;
uniform float stepCount;
/** 大於零時把中間值畫成偽色圖，見底下 main 的說明 */
uniform float debugView;
/** 要看哪一個中間量，見底下 main 的說明 */
uniform float debugMode;

/**
 * 空氣往前散射得有多集中
 *
 * 零是各個方向散得一樣多，趨近一則是幾乎只往原方向繼續走。
 * 零點五五偏前向：望著太陽時光束很明顯，側面看還留得住一些，
 * 背對時則幾乎沒有——那正是真實的光束該有的分布
 */
const float SCATTER_ANISOTROPY = 0.45;

/**
 * 不看太陽的方向也留多少
 *
 * 純粹的前向散射集中得很兇：以零點五五的不對稱係數算，
 * 視線與光線垂直時只剩百分之六，背對時只剩百分之二——
 * 也就是說除非幾乎正對著太陽，整個效果等於不存在。
 * 那是「調了強度也看不出差別」的真正原因。
 *
 * 空氣裡本來就有一部分是各向同性的散射（多次散射的結果），
 * 補一個底之後，側著看也還留得住一截，光束才不是只有
 * 對著太陽那一瞬間才看得到
 */
const float SCATTER_BASE = 0.18;

/**
 * 幾格以內把光束淡掉
 *
 * 貼著鏡頭的表面前面幾乎沒有空氣，不該有散射。
 * 這一段淡入要夠短——它是唯一還跟距離有關的一項，
 * 而距離正是深度落差瑕疵的來源（見 main 裡那一段）
 */
const float NEAR_FADE_DISTANCE = 10.0;

/**
 * Henyey-Greenstein 相位函數
 *
 * 「這條視線與光線的夾角，散射進眼睛的比例是多少」。
 * 少了這一項，加上去的就是一層不分方向的均勻亮度——
 * 那不是光束，那是把整個畫面調亮一階（踩過一次，見下面 main 的說明）
 */
float scatterPhase(float cosAngle) {
  float g = SCATTER_ANISOTROPY;
  float gg = g * g;
  float denominator = 1.0 + gg - 2.0 * g * cosAngle;

  return (1.0 - gg) / (4.0 * 3.14159265 * pow(max(denominator, 0.0001), 1.5));
}

void main() {
  vec3 sceneColor = texture2D(textureSampler, vUV).rgb;

  if (strength <= 0.0) {
    gl_FragColor = vec4(sceneColor, 1.0);
    return;
  }

  /**
   * 這條視線指向哪裡
   *
   * 把畫面座標推到遠平面再轉回世界座標，減掉鏡頭位置就是方向
   */
  vec4 farPoint = inverseViewProjection * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec3 rayDirection = normalize(farPoint.xyz / farPoint.w - cameraPosition);

  /**
   * 走到撞上實體為止
   *
   * 深度圖存的是視空間的 Z，也就是「沿著鏡頭正前方多遠」，
   * 而這條射線是斜的——除以兩者的夾角才換算得回沿著射線的距離。
   * 少了這一步，越靠畫面邊緣的光束會越早被截斷
   */
  float viewZ = texture2D(depthSampler, vUV).r;
  float forwardRatio = max(dot(rayDirection, cameraForward), 0.001);
  float rayLength = min(viewZ / forwardRatio, maxDistance);

  float stepLength = rayLength / stepCount;

  /**
   * 起點要抖動
   *
   * 每個像素都從同一個位置起步的話，取樣點會在空間裡排成一層一層
   * 等距的殼，畫面上就是一圈一圈的同心紋。加半步以內的隨機位移之後
   * 那些紋被打散成雜訊，而雜訊在這種糊開的效果裡看不出來
   */
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float travelled = stepLength * jitter;

  float accumulated = 0.0;

  for (int index = 0; index < MAX_STEP_COUNT; index++) {
    if (float(index) >= stepCount) {
      break;
    }

    vec3 samplePosition = cameraPosition + rayDirection * travelled;

    accumulated += minespaceSunVisibility(samplePosition);

    travelled += stepLength;
  }

  /**
   * 要乘上「這條線走過多長」，不能只取平均
   *
   * 只除以步數的話得到的是「沿路平均有多少空氣照得到太陽」，
   * 而散射的量取決於光穿過了多少空氣：看著腳邊的地面只穿過兩三格，
   * 望向遠處的松林才穿過幾十格。乘上走過的比例之後，
   * 近處的表面幾乎不受影響
   */
  /**
   * 先留下沒有乘過距離的原始值
   *
   * 除錯檢視要的是「取樣本身有沒有讀到東西」，而那與「這條線走多遠」
   * 是兩個獨立的失敗點。乘在一起之後兩者分不開——
   * 紅色偏暗到底是取樣讀成零，還是只是距離短，看不出來
   */
  float rawVisibility = accumulated / stepCount;

  /**
   * 取沿路的平均，不要取積分——這一項不能跟距離走
   *
   * 散射量正比於路徑長度是物理上對的，這裡曾經照著做
   * （先是除以最大距離、後來改成指數飽和），兩版都在深度不連續的地方
   * 留下很醜的瑕疵：樹葉是 alpha 鏤空的，葉片本身很近、
   * 而縫隙後面的木頭很遠，同一片樹冠上相鄰兩個像素的行進距離
   * 可能差上三倍——十五格是 0.42、四十格是 0.76，再乘上強度
   * 就是 0.37 的亮度落差。縫隙因此整個「亮穿」出來，
   * 樹冠看起來像被吃掉。
   *
   * 而且那條隨距離增長的曲線本來就是重複工：霧與大氣透視
   * 已經在做「越遠越濁」這件事了。體積光真正只有它做得到的，
   * 是「這一段空氣在不在陰影裡」——那一項與距離無關。
   *
   * 改取平均之後，跨過深度邊界時前半段的取樣是共用的，
   * 平均值幾乎連續，落差自然就沒了。只留一段很短的近距離淡入，
   * 免得貼著鏡頭的表面也蒙上一層
   */
  float nearFade = smoothstep(0.0, NEAR_FADE_DISTANCE, rayLength);
  accumulated = rawVisibility * nearFade;

  /**
   * 再乘上相位函數——這一項是整個效果成立的關鍵
   *
   * 這裡曾經沒有它，結果是正午整片畫面泛白。原因不是給得太強，
   * 是加上去的東西不分方向：戶外滿視野的空氣都照得到太陽，
   * 於是每一個像素都被加上差不多的亮度，那是一層白幕不是光束。
   *
   * 空氣的散射是強烈前向的：光束看得見，是因為視線朝著光源看過去，
   * 那些光才散得進眼睛。背對太陽時空氣裡照樣有光在散射，
   * 只是散射的方向不朝著你。加上這一項之後，亮度自己就集中到
   * 太陽那一側，正午背對太陽的畫面幾乎不受影響——
   * 於是它不必再靠「只在晨昏開啟」來避免泛白，全天候都成立。
   *
   * 除以正對時的值是為了正規化：讓最強的那個方向大約是一，
   * 上面那個 strength 才是說得準的「最亮到什麼程度」
   */
  float cosAngle = dot(rayDirection, -sunDirection);
  float forwardLobe = scatterPhase(cosAngle) / scatterPhase(1.0);
  float phaseValue = SCATTER_BASE + (1.0 - SCATTER_BASE) * forwardLobe;

  /**
   * 只把天空那一塊收掉，別動有東西擋住的那些像素
   *
   * 晨昏會亮成一片的原因在天空：太陽貼近地平線時望向它的視線
   * 幾乎是平的，行進的九十格全是照得到太陽的空氣，累積值頂到滿檔；
   * 而那一塊的天色本來就已經接近純白——霞光加上日暈早就貼在
   * 色調映射的上限上，再疊什麼都只會衝破天花板。
   * 何況天空那一段沒有東西可以擋光，走再遠都是滿的。
   *
   * 但這道淡出的門檻曾經切在七成的距離上，那是錯的：
   * 上面剛乘過的 rayLength / maxDistance 要走得夠遠才大，
   * 而這一項要撞得夠近才大——兩個係數彼此抵消，
   * 中間只剩一道很窄的窗口，於是整個效果幾乎看不到。
   *
   * 門檻改成貼著行進距離的盡頭：九十格以內有東西擋住的一律full，
   * 真正什麼都沒撞到的（天空，以及遠得超出行進範圍的）才收掉。
   * 留一成五不收，光束打在天空前面時才不會硬生生斷掉
   */
  float geometryRatio = 1.0 - 0.85 * smoothstep(maxDistance * 0.95, maxDistance * 1.05, viewZ);

  /**
   * 除錯檢視：把三個中間值分別畫成三個顏色通道
   *
   * 這個效果的失敗方式全都是「安靜地變成零」，而三個乘數任何一個
   * 是零，結果就是零——光看畫面分不出是哪一個。分成三個通道之後，
   * 一張截圖就答得出來：
   *
   *   紅 = 沿路照得到太陽的比例（查那張專用陰影圖得來，不含距離）
   *   綠 = 這條視線走了多遠（深度圖換算出來的，全黑代表深度讀不到）
   *   藍 = 相位（望向太陽時亮，背對時暗）
   *
   * 紅色特意不乘距離：取樣讀不讀得到東西，與這條線走多遠，
   * 是兩個獨立的失敗點，乘在一起就分不出是哪一個壞了。
   *
   * 換成真的陰影圖之後，紅色那一層本身就是最好的驗收畫面：
   * 樹下、鳥居底下該是暗的，空曠處該是亮的。整片一致的亮
   * 代表遮蔽沒生效——那正是體素網格那一版失敗的樣子
   */
  if (debugView > 0.5) {
    /**
     * 一號：三個中間量各佔一個通道，用來一眼看出哪一項是零
     */
    if (debugMode < 1.5) {
      gl_FragColor = vec4(rawVisibility, rayLength / maxDistance, phaseValue, 1.0);
      return;
    }

    /**
     * 二號：只畫加上去的那道光，不含原本的畫面
     *
     * 這是查「深度不連續的瑕疵」最直接的一張圖。樹葉是鏤空的，
     * 葉片與縫隙後面的木頭深度差很多；如果那道邊界在這張圖上
     * 是一條銳利的亮邊，瑕疵就是這道加成造成的。
     * 若這張圖在那裡是平滑的，那麼「木頭透出來」與體積光無關，
     * 要查的是葉子本身的繪製順序
     */
    if (debugMode < 2.5) {
      gl_FragColor = vec4(sunColor * accumulated * phaseValue * geometryRatio * strength, 1.0);
      return;
    }

    /**
     * 三號：只畫深度
     *
     * 深度圖是所有東西的源頭。葉片與縫隙在這張圖上該有清楚的落差，
     * 若葉片那一格的深度跟著後面的木頭跑，就是深度圖沒有把
     * 鏤空的葉子畫進去——那會讓上面每一項都跟著錯
     */
    if (debugMode < 3.5) {
      float depthRatio = rayLength / maxDistance;
      gl_FragColor = vec4(depthRatio, depthRatio, depthRatio, 1.0);
      return;
    }

    /**
     * 四號：只畫陰影圖查出來的可見度
     *
     * 這一張與深度無關，純粹是「這條視線沿路有多少空氣曬得到太陽」。
     * 樹下該暗、空曠處該亮
     */
    gl_FragColor = vec4(rawVisibility, rawVisibility, rawVisibility, 1.0);
    return;
  }

  gl_FragColor = vec4(
    sceneColor + sunColor * accumulated * phaseValue * geometryRatio * strength,
    1.0
  );
}
`

export interface VolumetricLight {
  /**
   * 設定光束強度，0 為完全不做
   *
   * @param ratio 這一刻該有多強，通常吃「直射陽光還剩幾成」
   * @param sunColor 這一刻的陽光顏色
   */
  setStrength: (ratio: number, sunColor: Color3, sunDirection: Vector3) => void;
  dispose: () => void;
}

/**
 * 建立沿著視線行進的光束
 *
 * 只有最奢的那一級會走到這裡；其餘各級要嘛不要光束、
 * 要嘛用便宜的螢幕空間版本（見 god-rays.ts）
 */
export function createVolumetricLight(scene: Scene, camera: UniversalCamera): VolumetricLight {
  const { preset } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()
  const stepCount = preset.value.volumetricStepCount

  reportDiagnostic('體積光/畫質模式', preset.value.volumetric)
  reportDiagnostic('體積光/步數', stepCount)

  if (preset.value.volumetric !== 'raymarch' || stepCount <= 0) {
    reportDiagnostic('體積光/建立', '沒建立（這一級不做行進版光束）')
    return { setStrength: () => {}, dispose: () => {} }
  }

  reportDiagnostic('體積光/建立', '有建立')

  /**
   * 光束自己的那張陰影圖
   *
   * 每幀多畫一趟世界，但範圍只有鏡頭附近、解析度也只有一千零二十四，
   * 比場景那份四層 CSM 便宜得多。只有最奢的那一級會走到這裡
   */
  const shadow = createVolumetricShadow(scene, camera)

  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const postProcess = new PostProcess(
    'minespace-volumetric-light',
    SHADER_NAME,
    [
      'inverseViewProjection',
      'cameraPosition',
      'cameraForward',
      'sunDirection',
      'sunColor',
      'strength',
      'maxDistance',
      'stepCount',
      'debugView',
      'debugMode',
      'volumetricShadowViewProjection',
      'volumetricShadowView',
      'volumetricShadowBias',
    ],
    ['depthSampler', 'volumetricShadowSampler'],
    1,
    camera,
    undefined,
    scene.getEngine(),
    false,
    /**
     * 迴圈的上限必須是編譯期的常數
     *
     * GLSL 的迴圈次數不能是 uniform，所以步數走兩層：
     * 這個 define 決定「最多幾步」，uniform 決定「這一刻實際走幾步」
     */
    `#define MAX_STEP_COUNT ${stepCount}`,
  )

  const inverseViewProjection = new Matrix()
  const forward = new BabylonVector3()
  let currentStrength = 0
  let currentSunRed = 1
  let currentSunGreen = 1
  let currentSunBlue = 1
  /** 光線前進的方向，相位函數要拿它算視線與光線的夾角 */
  const currentSunDirection = new BabylonVector3(0, -1, 0)
  let isAttached = false

  /**
   * 不需要的時候整個卸下來，不要留著跑一趟什麼都不做的繪製
   *
   * 這不只是省一趟全螢幕。留著而不綁貼圖是會出事的：
   * 著色器裡引用了 depthSampler 與 voxelSampler，只要那兩個材質單元
   * 是不完整的，整個繪製呼叫就無效——畫面上剩下的是清除色，
   * 也就是一整片霧色，什麼都看不到。
   *
   * 曾經踩過一次：那時的做法是「強度為零就設 strength = 0 然後提早返回」，
   * 以為著色器第一行會跳出去就沒事。著色器確實跳得出去，
   * 但驅動看的是「這支著色器用到了那個取樣器」，不管它有沒有真的執行到。
   *
   * 所以只有兩種狀態：要嘛掛上去、而且每一幀把該綁的都綁齊；
   * 要嘛整個拿掉
   */
  function setAttached(nextAttached: boolean): void {
    if (nextAttached === isAttached)
      return

    isAttached = nextAttached
    reportDiagnostic('體積光/後製掛載', nextAttached ? '掛著' : '卸下')

    if (nextAttached) {
      /**
       * 插在最前面
       *
       * 後製鏈的順序就是套用的順序。光束要在色調映射之前疊上去，
       * 才會跟著整個畫面一起被曝光曲線壓過；擺在後面則是疊在成品上，
       * 亮部會直接爆掉——與 god-rays 是同一個道理
       */
      camera.attachPostProcess(postProcess, 0)
      return
    }

    camera.detachPostProcess(postProcess)
  }

  /** 建立時先卸下來，等強度與兩張貼圖都到齊了才掛上去 */
  camera.detachPostProcess(postProcess)

  postProcess.onApply = (effect) => {
    const shadowTexture = shadow.getTexture()
    const depthTexture = shadow.getCameraDepthTexture()

    scene.getTransformMatrix().invertToRef(inverseViewProjection)
    camera.getDirectionToRef(BabylonVector3.Forward(), forward)

    /**
     * 著色器真的跑起來時才寫得到這一行
     *
     * 前面每一段都可能悄悄地不做事，只有走到這裡才代表
     * 「後製確實在畫，而且該綁的都綁上了」
     */
    reportDiagnostic('體積光/著色器套用', `有，強度 ${currentStrength.toFixed(3)}`)

    /**
     * 兩張輸入貼圖的實際狀態
     *
     * 深度圖決定這條視線走多遠，陰影圖決定沿路哪一段在陰影裡——
     * 任何一張沒就緒，結果都是零，而畫面上兩者看起來一模一樣
     */
    const depthSize = depthTexture.getSize()
    const shadowSize = shadowTexture.getSize()
    reportDiagnostic(
      '體積光/輸入貼圖',
      `深度圖 ${depthSize.width}×${depthSize.height} 就緒 ${depthTexture.isReady()}`
      + `｜光束陰影圖 ${shadowSize.width}×${shadowSize.height} 就緒 ${shadowTexture.isReady()}`,
    )
    reportDiagnostic(
      '體積光/鏡頭',
      `位置 ${camera.globalPosition.x.toFixed(1)}, ${camera.globalPosition.y.toFixed(1)}, ${camera.globalPosition.z.toFixed(1)}`
      + `｜遠平面 ${camera.maxZ}｜行進上限 ${MAX_DISTANCE} 格、${stepCount} 步`,
    )

    effect.setTexture('depthSampler', depthTexture)
    effect.setTexture('volumetricShadowSampler', shadowTexture)
    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setMatrix('volumetricShadowViewProjection', shadow.getViewProjection())
    effect.setMatrix('volumetricShadowView', shadow.getView())
    effect.setFloat('volumetricShadowBias', shadow.getBias())
    effect.setVector3('cameraPosition', camera.globalPosition)
    effect.setVector3('cameraForward', forward)
    effect.setVector3('sunDirection', currentSunDirection)
    effect.setFloat3('sunColor', currentSunRed, currentSunGreen, currentSunBlue)
    effect.setFloat('strength', currentStrength)
    effect.setFloat('maxDistance', MAX_DISTANCE)
    effect.setFloat('stepCount', stepCount)
    effect.setFloat('debugView', devToggle.volumetricDebug ? 1 : 0)
    effect.setFloat('debugMode', debugState.mode)
  }

  return {
    setStrength(ratio: number, sunColor: Color3, sunDirection: Vector3) {
      currentStrength = Math.min(1, Math.max(0, ratio)) * MAX_STRENGTH
      currentSunRed = sunColor.r
      currentSunGreen = sunColor.g
      currentSunBlue = sunColor.b
      /**
       * 方向要正規化過
       *
       * 相位函數是拿它與視線做點積算夾角的，長度不是一的話那個角會算錯——
       * 而日夜循環寫進來的方向不保證是單位向量（與 leaf-translucency 同一個坑）
       */
      currentSunDirection.copyFrom(sunDirection).normalize()

      /**
       * 陰影圖每幀要跟著鏡頭與太陽挪一次
       *
       * 擺在這裡而不是另外掛一個觀察者：這個函式本來就每幀被日夜循環
       * 呼叫一次，而且它剛好同時知道太陽的方向。多一個觀察者
       * 只是多一個要記得對齊順序的東西
       */
      shadow.update(currentSunDirection)

      /**
       * 掛不上去的話，是卡在哪一個條件
       *
       * 三個條件缺一不可，而它們壞掉的方式完全不同：
       * 開關是使用者關的、強度是時段或天氣算出來的、
       * 深度圖則是別的子系統還沒準備好。分開記才知道要查哪邊
       */
      reportDiagnostic(
        '體積光/掛載條件',
        `除錯開關 ${devToggle.volumetricLight}、強度 ${currentStrength.toFixed(3)}`,
      )

      /**
       * 都到齊了才掛上去
       *
       * 強度為零（雨中、洞裡）算不需要，走「整個拿掉」那條路。
       * 兩張貼圖是自己開的，跟著這個實例的生命週期走，不必再檢查
       */
      setAttached(devToggle.volumetricLight && currentStrength > 0.001)
    },
    dispose() {
      shadow.dispose()
      camera.detachPostProcess(postProcess)
      postProcess.dispose(camera)
    },
  }
}
