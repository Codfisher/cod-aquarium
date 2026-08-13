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
 * 風本身用柏林噪聲。三角函數疊出來的風每一株都照同一個節拍搖，
 * 遠看整片草地像在打拍子；柏林噪聲則是一塊連續起伏的場——
 * 取樣點隨時間往風的方向平移，強弱就會像一陣一陣的風掃過草原，
 * 這一株才剛被吹倒，隔壁那一株還沒開始動
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

  /** 每一株自己的細碎顫動，相位由它的座標決定 */
  float flutterPhase = plantOrigin.x * 1.7 + plantOrigin.z * 2.3;
  float flutter = sin(windTime * ${toGlslFloat(FLUTTER_SPEED)} + flutterPhase);

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

  float amplitude = windAmplitude * (gust + flutter * ${toGlslFloat(FLUTTER_RATIO)});
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

  constructor(
    material: StandardMaterial,
    private amplitude: number,
    /** 一為從底部彎（花草），零為整塊一起移動（樹葉） */
    private heightLeverage: number,
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
      ],
    }
  }

  /** 由外面每一幀推進，材質自己不知道時間過了多久 */
  setElapsedSecond(value: number): void {
    this.elapsedSecond = value
  }

  bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: Engine, _subMesh: SubMesh): void {
    uniformBuffer.updateFloat('windTime', this.elapsedSecond)
    uniformBuffer.updateFloat('windAmplitude', this.amplitude)
    uniformBuffer.updateFloat('windHeightLeverage', this.heightLeverage)
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

  const observer = scene.onBeforeRenderObservable.add(() => {
    measureSection('風', () => {
      elapsedSecond += scene.getEngine().getDeltaTime() / 1000

      for (const plugin of pluginList) {
        plugin.setElapsedSecond(elapsedSecond)
      }
    })
  })

  return {
    attach(material, amplitude, followsHeight) {
      const plugin = new WindSwayPlugin(material, amplitude, followsHeight ? 1 : 0)
      plugin.setElapsedSecond(elapsedSecond)
      pluginList.push(plugin)
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      pluginList.length = 0
    },
  }
}
