import type { Color3, Scene, Vector3 } from '@babylonjs/core'
import { Effect, ShaderMaterial } from '@babylonjs/core'

/**
 * 天色的漸層
 *
 * 這裡不算大氣散射，天色直接由日夜的顏色表指定。
 *
 * 換掉散射模型是有原因的：那套模型（Preetham）以「視線穿過大氣多長」
 * 決定顏色，抬頭看天頂是八千四，視線放平看地平線卻暴衝到三十萬——
 * 三十六倍之後散射早已徹底飽和，地平線必然是一整片沒有層次的純白，
 * 而且那片白貼著色調映射的上限，壓曝光也壓不下來，
 * 只會讓天頂跟著變暗、反差更大。天邊那道刺眼的白線就是這樣來的。
 *
 * 改成自己畫之後，天色是調出來的而不是算出來的：
 * 天頂一個顏色、天邊一個顏色，中間用一條收得快的曲線接起來，
 * 再往太陽的方向疊一團暖光。霞色因此只出現在太陽那半邊天，
 * 背對太陽的天邊維持冷色——這是原本那套模型給不了的
 */
const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;

varying vec3 vDirection;

void main() {
  /**
   * 天空罩是以原點為中心的方盒，又設了 infiniteDistance 跟著鏡頭走，
   * 所以頂點的區域座標本身就是「從眼睛看出去的方向」
   */
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vDirection;

uniform vec3 zenithColor;
uniform vec3 midColor;
uniform vec3 horizonColor;
uniform vec3 glowColor;
uniform vec3 counterColor;
uniform vec3 sunDirection;
uniform float glowStrength;

/**
 * 天邊那層霧色往上收的速度
 *
 * 天邊用的是霧色，而這片禪庭的霧幾乎是純白。
 * 這個數字要是小的，那片白會從地平線一路淹上來十幾度，
 * 在藍天底下鋪成一條又寬又亮的白帶——那正是原本刺眼的那一條。
 *
 * 收到六，白只留在地平線上方五度左右：
 * 遠景照樣融得進去，抬頭卻馬上是天空自己的顏色
 */
const float HAZE_FALLOFF = 6.0;

/**
 * 中空色爬向天頂的速度
 *
 * 這一條要慢，天空才有「一路換色」的深度：
 * 十五度時還有六成是中空色，四十五度才幾乎全是天頂色
 */
const float ZENITH_FALLOFF = 1.6;

/** 背對太陽那道反霞相對於霞光的濃度 */
const float COUNTER_RATIO = 0.5;

void main() {
  vec3 direction = normalize(vDirection);

  /**
   * 地平線以下一律是天邊色
   *
   * 那一段幾乎整片被沙地蓋住，只在沙地盡頭與地平線之間露出一線。
   * 讓它與天邊同色，那一線就接得天衣無縫；
   * 若在這裡做別的處理，露出來的就是一條突兀的邊
   */
  float upward = clamp(direction.y, 0.0, 1.0);

  /**
   * 三段顏色，兩條曲線
   *
   * 只有天邊與天頂兩個顏色時，天空是一條單調的漸層。
   * 中間多一個顏色，日出的丁香紫與日落的洋紅才有地方待著——
   * 那是把橘色的天邊接到藍色的天頂之間的那一段，
   * 也是一片天之所以好看的原因。
   *
   * 兩條曲線各司其職：霧色收得快，只留在地平線附近；
   * 中空色到天頂則慢慢爬，鋪滿整片天
   */
  float hazeBlend = 1.0 - pow(1.0 - upward, HAZE_FALLOFF);
  float zenithBlend = 1.0 - pow(1.0 - upward, ZENITH_FALLOFF);
  vec3 upperColor = mix(midColor, zenithColor, zenithBlend);
  vec3 color = mix(horizonColor, upperColor, hazeBlend);

  float towardSun = max(dot(direction, sunDirection), 0.0);
  float lowSky = 1.0 - smoothstep(0.0, 0.6, upward);

  /**
   * 反霞
   *
   * 日出與日落時，背對太陽的天邊會浮起一道玫瑰色的帶子，
   * 那是被地平線下的陽光染紅、又還沒被地球的影子吃掉的那一層大氣。
   * 真實的天空裡最美的一段往往不在太陽那一邊，而在身後。
   *
   * 濃度直接跟著霞光走：霞光濃的時候（晨昏）它才在，
   * 正午霞光收到剩一點點，這道帶子自然也就不見了
   */
  float awayFromSun = max(-dot(direction, sunDirection), 0.0);
  float counter = pow(awayFromSun, 3.0) * lowSky * COUNTER_RATIO;
  color = mix(color, counterColor, clamp(counter * glowStrength, 0.0, 1.0));

  /**
   * 太陽周圍的暖光
   *
   * 兩層疊起來：緊的那層是太陽外圍那一圈亮，
   * 鬆的那層鋪滿太陽那半邊天。
   * 鬆的那層還要隨高度收掉，霞光才會積在天邊而不是糊上天頂。
   *
   * 混色，不是相加。
   * 相加的話，天邊本來就接近純白的霧色再加上一團暖光就會衝破一，
   * 太陽貼近地平線時整片天糊成一大團白，霞色反而不見了。
   * 混色有天花板：再濃也只會濃到霞光本身的顏色，
   * 於是日落是「整片天燒成橘色」而不是「整片天燒成白色」
   */
  float halo = pow(towardSun, 18.0) * 0.55 + pow(towardSun, 2.5) * 0.45 * lowSky;
  color = mix(color, glowColor, clamp(halo * glowStrength, 0.0, 1.0));

  /**
   * 打散色階
   *
   * 整片天是一條很長的漸層，八位元的色階在上面會顯出一圈圈的等高線。
   * 加上半個色階的雜訊就看不出來了，代價是肉眼看不見的顆粒
   */
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (noise - 0.5) / 255.0;

  gl_FragColor = vec4(color, 1.0);
}
`

const SHADER_NAME = 'minespaceSkyGradient'

/** 這一刻的天色 */
export interface SkyGradientParams {
  /** 天頂的顏色 */
  zenithColor: Color3;
  /** 中空的顏色，日出的丁香紫與日落的洋紅都住在這裡 */
  midColor: Color3;
  /** 天邊的顏色，通常直接用霧色，天與地才接得起來 */
  horizonColor: Color3;
  /** 太陽周圍那團暖光的顏色 */
  glowColor: Color3;
  /** 背對太陽那道反霞的顏色 */
  counterColor: Color3;
  /** 暖光的強度，正午幾乎為零、日落最濃 */
  glowStrength: number;
  /**
   * 由世界中心指向太陽
   *
   * 只有日夜循環知道太陽在哪，天氣那邊疊陰天時不必也不該重算，
   * 省略就沿用上一次寫進去的方位
   */
  sunDirection?: Vector3;
}

/** 建立天色材質 */
export function createSkyGradientMaterial(name: string, scene: Scene): ShaderMaterial {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const material = new ShaderMaterial(name, scene, SHADER_NAME, {
    attributes: ['position'],
    uniforms: [
      'worldViewProjection',
      'zenithColor',
      'midColor',
      'horizonColor',
      'glowColor',
      'counterColor',
      'sunDirection',
      'glowStrength',
    ],
  })

  /** 鏡頭在盒子裡面，看到的是內側 */
  material.backFaceCulling = false
  /**
   * 天空罩不寫深度
   *
   * 這個盒子邊長只有 260，跟著鏡頭走，所以永遠在一百三十格外。
   * 它照常寫深度的話，比它遠的東西全部會被擋掉——
   * 世界之外那片白沙鋪了一千多格，超過一百三十格的部分會整片消失
   */
  material.disableDepthWrite = true
  /** 天空不吃霧氣，否則整片天會被霧染成一塊死板的顏色 */
  material.fogEnabled = false

  return material
}

/** 把這一刻的天色寫進材質 */
export function applySkyGradient(material: ShaderMaterial, params: SkyGradientParams): void {
  material.setColor3('zenithColor', params.zenithColor)
  material.setColor3('midColor', params.midColor)
  material.setColor3('horizonColor', params.horizonColor)
  material.setColor3('glowColor', params.glowColor)
  material.setColor3('counterColor', params.counterColor)
  material.setFloat('glowStrength', params.glowStrength)

  if (params.sunDirection) {
    material.setVector3('sunDirection', params.sunDirection)
  }
}
