import type { Engine, Scene, StandardMaterial, SubMesh, UniformBuffer } from '@babylonjs/core'
import { MaterialPluginBase } from '@babylonjs/core'
import { measureSection } from '../../composables/use-performance-probe'

/**
 * 隨風搖擺
 *
 * 交叉立板的花草在頂點著色器裡擺動。這件事只能在著色器裡做：
 * 全世界有上萬株草，全部是 thin instance 共用同一份頂點資料，
 * CPU 這邊連「單獨移動其中一株」的餘地都沒有。
 *
 * 風由三層疊起來，各管一件事：
 *
 * 一是柏林噪聲的陣風，決定「這一帶此刻風多大」。取樣點隨時間往風的方向
 * 平移，強弱就像一陣一陣的風掃過草原。但它的起伏有十一格寬，
 * 相鄰兩株取到的值幾乎一樣——它管得了範圍，管不了順序。
 *
 * 二是沿著風向前進的行進波，相位只看「這一株在風向上站得多前面」。
 * 六格一個週期，隔壁那株差六十度：這一株彎到底時下一株才剛開始傾，
 * 一排草因此是接力倒下去的。順序感全靠這一層。
 *
 * 三是每一株自己的細碎顫動，讓同一小塊裡的草不會整齊得像一塊布。
 */

/**
 * 花草的擺動幅度（格）
 *
 * 一株草才一格見方，頂端偏移零點一四格大約是八度。
 * 再大就不像風吹，像草自己在跳舞
 */
export const PLANT_SWAY_AMPLITUDE = 0.14

/**
 * 樹葉的擺動幅度（格）
 *
 * 只有花草的三分之一，而且整塊一起移動、不從底部彎。
 * 樹冠是一團互相緊貼的方塊，各自彎腰的話塊與塊之間會裂開；
 * 整團同進同出才是一棵樹被風推的樣子。
 *
 * 幅度壓小還有一個理由：樹葉會投影子，而陰影貼圖走的是另一支著色器，
 * 影子不會跟著擺。差零點零五格看不出來，差零點一五就對不上了
 */
export const LEAF_SWAY_AMPLITUDE = 0.05

/**
 * 噪聲場的疏密
 *
 * 數字越小，一陣風的範圍越大。零點零九約是十一格一個起伏，
 * 差不多是一座箱庭的三分之一——看得出「一陣」的形狀，
 * 又不會整座木座同進同出
 */
const WIND_FIELD_SCALE = 0.09

/** 風往哪個方向吹，與雲層的飄移同向，天上地下才是同一場風 */
const WIND_DIRECTION: [number, number] = [0.94, 0.34]

/** 陣風掃過的速度（格／秒） */
const WIND_SPEED = 2.6

/**
 * 一道波多長（格）
 *
 * 噪聲場只管「這一帶的風多大」，管不了「一株接一株倒下去」——
 * 十一格才一個起伏，相鄰兩株在噪聲場上只差零點零九，
 * 取到的值幾乎一模一樣，於是整片草看起來是同時動的。
 *
 * 真正看得出順序的是這道沿著風向前進的波。六格一個週期，
 * 隔壁那一株就差六十度的相位——這一株彎到底時，
 * 下一株才剛開始傾，一排草因此是接力倒下去的
 */
const PLANT_RIPPLE_WAVELENGTH = 6

/**
 * 樹葉的波要長得多
 *
 * 樹冠是一團互相緊貼的方塊。波長若與草一樣短，
 * 相鄰兩塊葉子會往不同方向偏，塊與塊之間裂出縫來。
 * 拉到二十四格之後同一棵樹幾乎整團同進同出，
 * 波的作用只剩「這棵樹與那棵樹不同步」
 */
const LEAF_RIPPLE_WAVELENGTH = 24

/**
 * 寫成 GLSL 的浮點字面值
 *
 * 直接把數字內插進著色器有個陷阱：常數若哪天被調成整數，
 * JS 會印出「3」，而 GLSL 的 3 是 int，vec2 乘 int 直接編譯失敗。
 * 一律補到小數點後三位，改成什麼值都不會踩到
 */
function toGlslFloat(value: number): string {
  return value.toFixed(3)
}

/**
 * 每一株自己的抖動
 *
 * 只有陣風的話，同一小塊裡的草會整齊得像一塊布。
 * 疊一層又快又小的擾動，每一株的相位由它自己的座標決定，
 * 葉尖那種細碎的顫動就出來了。
 *
 * 幅度寫成佔擺幅的比例，這樣調整主擺幅時顫動會跟著等比縮放，
 * 不會出現「樹葉幾乎不動、卻抖得跟草一樣厲害」
 */
const FLUTTER_RATIO = 0.25
const FLUTTER_SPEED = 2.2

/**
 * 整場風的強弱怎麼變
 *
 * 三條週期互不整除的正弦疊起來：七十九秒、三十二秒、一百五十三秒。
 * 大部分時候它們互相抵消，風就維持在中等；偶爾三條同時走到高點，
 * 那一下就是一陣把整片草壓下去的大風。
 * 因為週期永遠對不回同一個相位，那樣的時刻不會照著節拍出現
 */
const SQUALL_PERIOD_LIST = [79, 32, 153]
/** 風最小與最大各是基準的幾倍 */
const SQUALL_RANGE: [number, number] = [0.3, 1.75]

/**
 * 這一刻整場的風有多大
 *
 * 與位置無關，所以在這裡算一次、所有材質共用，不必進著色器逐頂點重算
 */
function measureSquall(elapsedSecond: number): number {
  let total = 0
  for (const [index, period] of SQUALL_PERIOD_LIST.entries()) {
    total += Math.sin(elapsedSecond * (Math.PI * 2 / period) + index * 1.7)
  }

  const normalized = total / SQUALL_PERIOD_LIST.length
  const [min, max] = SQUALL_RANGE

  return min + (max - min) * (normalized * 0.5 + 0.5)
}

/**
 * 這裡不要自己宣告 windTime
 *
 * 它已經登記在 getUniforms 的 ubo 裡，Babylon 會把宣告注入
 * 材質的 uniform 區塊（頂點與片段兩支都會拿到）。
 * 在這裡再寫一次 uniform float windTime 就是重複宣告，
 * 著色器編譯直接失敗——而編譯失敗的材質不會報錯，只會整批不畫，
 * 畫面上看到的就是「所有的草突然消失」
 */
const VERTEX_DEFINITIONS = `
/**
 * 柏林噪聲
 *
 * 梯度噪聲，不是值噪聲：格點上存的是方向而非高度，
 * 內插出來的場沒有格子的痕跡，這是「像風」的關鍵
 */
vec2 windHash(vec2 point) {
  point = vec2(dot(point, vec2(127.1, 311.7)), dot(point, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(point) * 43758.5453123);
}

float windNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);
  /** 平滑係數，讓格線兩側的斜率接得上 */
  vec2 weight = offset * offset * (3.0 - 2.0 * offset);

  return mix(
    mix(
      dot(windHash(cell), offset),
      dot(windHash(cell + vec2(1.0, 0.0)), offset - vec2(1.0, 0.0)),
      weight.x
    ),
    mix(
      dot(windHash(cell + vec2(0.0, 1.0)), offset - vec2(0.0, 1.0)),
      dot(windHash(cell + vec2(1.0, 1.0)), offset - vec2(1.0, 1.0)),
      weight.x
    ),
    weight.y
  );
}
`

const VERTEX_UPDATE_POSITION = `
{
  /**
   * 這一株長在哪裡
   *
   * thin instance 的矩陣是純平移，第四行就是它的世界座標。
   * 這一段插在 instancesVertex 之前，finalWorld 還沒算出來，
   * 但 world3 這個屬性已經在了
   */
  #ifdef INSTANCES
    vec3 plantOrigin = world3.xyz;
  #else
    vec3 plantOrigin = vec3(0.0);
  #endif

  vec2 windDirection = normalize(vec2(${toGlslFloat(WIND_DIRECTION[0])}, ${toGlslFloat(WIND_DIRECTION[1])}));

  /**
   * 取樣點隨時間往風的方向退，噪聲場因此像一陣風掃過草原
   *
   * 兩層疊起來：大的那層是一陣一陣的強弱，
   * 小的那層讓陣與陣之間不會是同一個形狀
   */
  vec2 samplePoint = plantOrigin.xz * ${toGlslFloat(WIND_FIELD_SCALE)}
    - windDirection * windTime * ${toGlslFloat(WIND_FIELD_SCALE)} * ${toGlslFloat(WIND_SPEED)};
  float gust = windNoise(samplePoint) * 0.68
    + windNoise(samplePoint * 2.3 + 17.0) * 0.32;

  /**
   * 陣風只決定「這一帶此刻風多大」
   *
   * 壓成一個恆正的包絡：風會忽強忽弱，但不會反過來吹。
   * 下限留一點，草地永遠有一絲微風，不會出現整片完全靜止的死角。
   *
   * 範圍收得比整場的強弱窄：這一層負責的是「同一時刻各處的差別」，
   * 「這一陣風有多大」交給 windSquall
   */
  float gustStrength = clamp(0.7 + gust * 0.45, 0.35, 1.15);

  /**
   * 整場風的強弱
   *
   * 只隨時間走、與位置無關，所以在 CPU 那邊算好再送進來。
   * 少了它，風的大小永遠落在同一個區間裡，聽起來像一台定速的風扇；
   * 有了它才會偶爾來一陣把整片草壓下去的大風，然後慢慢緩下來
   */
  float strength = clamp(gustStrength * windSquall, 0.1, 1.7);

  /**
   * 沿著風向前進的那道波
   *
   * 相位只看「這一株在風向上站得多前面」，減去時間就成了一道
   * 往下游跑的行進波。它與陣風用同一個速度前進，
   * 所以看到的是「一陣風掃過來，草一株接一株倒下去」，
   * 而不是波與陣風各走各的
   */
  float rippleTravel = dot(plantOrigin.xz, windDirection) - windTime * ${toGlslFloat(WIND_SPEED)};
  float ripple = sin(windRippleFrequency * rippleTravel);

  /**
   * 每一株自己的細碎顫動
   *
   * 相位由它的座標決定，快慢則跟著整場的風走——風大時葉尖抖得急，
   * 風緩下來就慢慢晃。這裡用的是 CPU 累積好的相位而不是「時間乘上速度」：
   * 速度會變，而 t 乘上一個變動的速度，t 一大就會在速度改變的瞬間
   * 把相位甩出去一大段，看起來是整片草突然抽動一下
   */
  float flutterPhase = plantOrigin.x * 1.7 + plantOrigin.z * 2.3;
  float flutter = sin(windFlutterPhase + flutterPhase);

  /**
   * 越高擺得越開，或整塊一起動
   *
   * 區域座標從負零點五到正零點五，加上零點五就是「離地多高」。
   * 再平方一次：根部幾乎釘在地上，只有頂端在動——
   * 草是從底下長出來的，不是浮在空中的一片布。
   *
   * 樹葉則要整塊一起動（windHeightLeverage 給零）：
   * 樹冠是一團互相緊貼的方塊，各自彎腰的話塊與塊之間會裂開
   */
  float height = clamp(positionUpdated.y + 0.5, 0.0, 1.0);
  float leverage = mix(1.0, height * height, windHeightLeverage);

  float amplitude = windAmplitude * strength * (ripple + flutter * ${toGlslFloat(FLUTTER_RATIO)});
  vec2 sway = windDirection * amplitude * leverage;

  positionUpdated.x += sway.x;
  positionUpdated.z += sway.y;
}
`

/**
 * 把搖擺掛上材質
 *
 * 走材質外掛而不是自己寫一份 ShaderMaterial：
 * 這些草照樣要吃平行光、環境光、霧氣與鏤空裁切，
 * 自己寫一份等於把 StandardMaterial 的那一整套重寫一遍
 */
class WindSwayPlugin extends MaterialPluginBase {
  /** 從場景開始到現在經過幾秒，風的節奏全靠它推 */
  private elapsedSecond = 0
  /** 這一刻整場的風有多大 */
  private squall = 1
  /** 顫動累積到哪個相位，由外面依當下的風速一點一點加上來 */
  private flutterPhase = 0

  constructor(
    material: StandardMaterial,
    private amplitude: number,
    /** 一為從底部彎（花草），零為整塊一起移動（樹葉） */
    private heightLeverage: number,
    /** 行進波的角頻率，由波長換算而來 */
    private rippleFrequency: number,
  ) {
    super(material, 'WindSway', 200, { WIND_SWAY: true })
    this._enable(true)
  }

  getClassName(): string {
    return 'WindSwayPlugin'
  }

  /**
   * 只登記 ubo，不要再給 vertex 宣告字串
   *
   * 兩個都給的話 Babylon 會照單全收：ubo 那份注入 uniform 區塊、
   * vertex 那份原樣貼進頂點著色器，同一個名字宣告兩次
   */
  getUniforms() {
    return {
      ubo: [
        { name: 'windTime', size: 1, type: 'float' },
        { name: 'windAmplitude', size: 1, type: 'float' },
        { name: 'windHeightLeverage', size: 1, type: 'float' },
        { name: 'windRippleFrequency', size: 1, type: 'float' },
        { name: 'windSquall', size: 1, type: 'float' },
        { name: 'windFlutterPhase', size: 1, type: 'float' },
      ],
    }
  }

  /** 由外面每一幀推進，材質自己不知道時間過了多久 */
  setWindState(elapsedSecond: number, squall: number, flutterPhase: number): void {
    this.elapsedSecond = elapsedSecond
    this.squall = squall
    this.flutterPhase = flutterPhase
  }

  bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: Engine, _subMesh: SubMesh): void {
    uniformBuffer.updateFloat('windTime', this.elapsedSecond)
    uniformBuffer.updateFloat('windAmplitude', this.amplitude)
    uniformBuffer.updateFloat('windHeightLeverage', this.heightLeverage)
    uniformBuffer.updateFloat('windRippleFrequency', this.rippleFrequency)
    uniformBuffer.updateFloat('windSquall', this.squall)
    uniformBuffer.updateFloat('windFlutterPhase', this.flutterPhase)
  }

  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'vertex')
      return null

    return {
      CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS,
      CUSTOM_VERTEX_UPDATE_POSITION: VERTEX_UPDATE_POSITION,
    }
  }
}

/** 一份場景共用的計時，掛上去的材質全部讀同一個數字 */
export interface WindSway {
  /**
   * 讓一份材質跟著風走
   *
   * followsHeight 為真時從底部彎（花草），為假時整塊一起移動（樹葉）
   */
  attach: (material: StandardMaterial, amplitude: number, followsHeight: boolean) => void;
  dispose: () => void;
}

export function createWindSway(scene: Scene): WindSway {
  const pluginList: WindSwayPlugin[] = []
  let elapsedSecond = 0
  let squall = measureSquall(0)
  /**
   * 顫動的相位一點一點累積
   *
   * 不能在著色器裡寫「時間 × 當下的速度」：速度是會變的，
   * 而那個乘積的變化率是「速度加上時間乘上速度的變化率」——
   * 跑了十分鐘之後，速度稍微一動就會把相位甩出去好幾圈，
   * 畫面上是整片草莫名其妙抽動一下。
   * 每一幀只加上「這一幀該轉多少」就沒有這個問題
   */
  let flutterPhase = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    measureSection('風', () => {
      const deltaSecond = scene.getEngine().getDeltaTime() / 1000
      elapsedSecond += deltaSecond
      squall = measureSquall(elapsedSecond)
      /** 風越大抖得越急，但再緩也還在動 */
      flutterPhase += deltaSecond * FLUTTER_SPEED * (0.55 + squall * 0.5)

      for (const plugin of pluginList) {
        plugin.setWindState(elapsedSecond, squall, flutterPhase)
      }
    })
  })

  return {
    attach(material, amplitude, followsHeight) {
      /**
       * 花草與樹葉的波長差很多
       *
       * 「從底部彎」的正是地上的花草，它們要一株接一株倒下去；
       * 「整塊一起動」的是樹葉，波長必須拉長到整棵樹幾乎同步，
       * 否則相鄰的葉子方塊會被推往不同方向而裂開
       */
      const wavelength = followsHeight ? PLANT_RIPPLE_WAVELENGTH : LEAF_RIPPLE_WAVELENGTH
      const plugin = new WindSwayPlugin(material, amplitude, followsHeight ? 1 : 0, Math.PI * 2 / wavelength)
      plugin.setWindState(elapsedSecond, squall, flutterPhase)
      pluginList.push(plugin)
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      pluginList.length = 0
    },
  }
}
