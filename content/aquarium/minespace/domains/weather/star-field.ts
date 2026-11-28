import type { Material, Mesh, Scene } from '@babylonjs/core'
import { Constants, Effect, ShaderMaterial, VertexData } from '@babylonjs/core'
import { createSeededRandom } from '../../utils/noise'

/**
 * 星空：一顆一顆對齊像素格的方塊
 *
 * 原本的星空是一張點了四百多個點的貼圖，貼在罩住鏡頭的盒子上。貼圖被放大後每顆星是一小團糊開的光，
 * 與方形的日月不搭；星星也不閃、沒有冷暖之分，貼著地平線的與天頂的一樣亮；
 * 而且那個盒子全天都在畫（白天只是乘上零），整片天每個像素白做一次相加混合。
 *
 * 現在每顆星是一張小方片，全部合成一個網格、一次繪製：
 *
 * - 對齊像素：頂點著色器把星星的位置吸到畫面的像素格上，邊長是整數個像素，
 *   所以每顆都是邊緣銳利的方塊，鏡頭轉動時一格一格跳，不會糊成半透明的一團
 * - 有大有小：亮度照冪次分布（暗星多、亮星少），最亮的那幾十顆才是兩三個像素大
 * - 有冷有暖：藍白、白、暖白、黃、橘紅，照真實星空的比例偏白
 * - 會閃：亮度緩緩起伏，越貼近地平線起伏越大（那裡的光穿過的大氣最厚）；
 *   最低那一截還會被霧氣吃掉，星星不會貼著地平線出現
 * - 看不見就不畫：亮度是零的白天整個網格停用
 *
 * 沒有做的：整片星空隨夜晚轉動、淡淡的銀河。前者會讓星星在千頃麥浪那條固定的銀河底下滑動，
 * 後者就是那條招牌銀河本身（見 realm-signature-kit），不重複做
 *
 * ── 為什麼是「換掉舊盒子的內容」而不是另建一個網格 ──
 *
 * 舊的星空盒子（use-babylon-scene 的 createStarField）被四個地方以名字或參照抓著：
 * 水鏡的倒影清單、地底場景的隱藏清單、晨昏光束的排除清單、日夜循環。
 * 另建一個網格的話，四處都要改，而且有的是在建立當下就把參照存起來的。
 * 所以留著那顆網格，只換掉它的幾何與材質：身分不變，四處都不必動
 */

/** 星空的著色器在 ShadersStore 裡的名字 */
const SHADER_NAME = 'minespacePixelStar'

/** 星星掛在離鏡頭多遠的殼上；深度另外壓在遠平面上，這個數字只要落在近遠平面之間 */
const SHELL_RADIUS = 100

/** 最高畫質的星數；效能檔照粒子倍率砍到六成上下 */
const STAR_COUNT = 1300
const STAR_COUNT_MIN_RATIO = 0.6

/** 星星只撒到地平線下一點點，再低的永遠被地面擋住 */
const LOWEST_HEIGHT = -0.05

/**
 * 星的顏色與各自佔的比例
 *
 * 真實夜空肉眼看得到的星大多偏白，暖色的少、紅的更少。
 * 顏色不能太濃：每顆只有一兩個像素，飽和的顏色在深藍的底上會像壞點
 */
const STAR_TINT_LIST: readonly { color: readonly [number, number, number]; weight: number }[] = [
  { color: [0.74, 0.84, 1], weight: 0.2 },
  { color: [1, 1, 1], weight: 0.42 },
  { color: [1, 0.95, 0.82], weight: 0.2 },
  { color: [1, 0.86, 0.62], weight: 0.12 },
  { color: [1, 0.68, 0.5], weight: 0.06 },
]

/** 一顆星 */
export interface StarDefinition {
  /** 天球上的方向（單位向量，y 朝上） */
  direction: [number, number, number];
  /** 顏色，零到一 */
  color: readonly [number, number, number];
  /** 亮度，零到一 */
  brightness: number;
  /** 邊長（CSS 像素），一到三 */
  pixelSize: number;
  /** 閃爍的相位（弧度）與速度（弧度 / 秒） */
  twinklePhase: number;
  twinkleSpeed: number;
}

/**
 * 星空露出多少，零到一
 *
 * 日夜循環每幀寫（星空可見度乘天體露出的比例）。
 * 要「跟星星同進同退」的景象（雪稜的極光）讀這個，不必去翻星空的材質
 */
export const starFieldState = {
  visibility: 0,
}

/**
 * 撒出一整片星
 *
 * 用固定的種子：每次打開都是同一片星空，星星才認得出來
 */
export function createStarList(count: number, seed = 'minespace-pixel-star'): StarDefinition[] {
  const random = createSeededRandom(seed)
  const totalWeight = STAR_TINT_LIST.reduce((sum, tint) => sum + tint.weight, 0)

  return Array.from({ length: count }, () => {
    /** 高度均勻取，球面上的分布就是均勻的 */
    const height = LOWEST_HEIGHT + (1 - LOWEST_HEIGHT) * random()
    const azimuth = random() * Math.PI * 2
    const horizontal = Math.sqrt(Math.max(0, 1 - height * height))

    /** 冪次分布：一半的星亮度不到三成，只有百分之四超過八成五 */
    const magnitude = random() ** 5
    const brightness = 0.22 + 0.78 * magnitude

    let pick = random() * totalWeight
    let color = STAR_TINT_LIST[0]!.color
    for (const tint of STAR_TINT_LIST) {
      color = tint.color
      pick -= tint.weight
      if (pick <= 0)
        break
    }

    return {
      direction: [Math.sin(azimuth) * horizontal, height, Math.cos(azimuth) * horizontal],
      color,
      brightness,
      pixelSize: magnitude > 0.96 ? 3 : magnitude > 0.8 ? 2 : 1,
      twinklePhase: random() * Math.PI * 2,
      twinkleSpeed: 0.5 + random() * 1.6,
    }
  })
}

const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;

uniform mat4 world;
uniform mat4 viewProjection;
uniform vec4 starSetting;
uniform float strength;

varying vec3 vColor;

void main() {
  vec4 clip = viewProjection * world * vec4(position * ${SHELL_RADIUS.toFixed(1)}, 1.0);
  if (clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    return;
  }

  float size = max(1.0, floor(color.a * starSetting.z + 0.5));
  vec2 pixel = (clip.xy / clip.w * 0.5 + 0.5) * starSetting.xy;
  vec2 corner = floor(pixel) + uv * size;
  vec2 snapped = corner / starSetting.xy * 2.0 - 1.0;
  gl_Position = vec4(snapped * clip.w, clip.w, clip.w);

  float height = position.y;
  float extinction = smoothstep(-0.02, 0.22, height);
  float twinkleAmount = mix(0.42, 0.14, smoothstep(0.0, 0.6, height));
  float twinkle = 1.0 - twinkleAmount * (0.5 + 0.5 * sin(starSetting.w * normal.y + normal.x));
  vColor = color.rgb * (normal.z * extinction * twinkle * strength);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`

export interface PixelStarField {
  /**
   * 每幀呼叫一次
   *
   * visibility 是星空露出多少（零到一），brightnessBoost 是月相給的倍率（新月時星星比較亮）
   */
  update: (deltaSecond: number, visibility: number, brightnessBoost: number) => void;
}

const installedMap = new WeakMap<Mesh, PixelStarField>()

/**
 * 把舊的星空盒子換成像素星空
 *
 * dome 是 use-babylon-scene 建的那顆星空網格。同一顆網格只換一次，重複呼叫拿到同一份
 */
export function installPixelStarField(scene: Scene, dome: Mesh, detailRatio: number): PixelStarField {
  const installed = installedMap.get(dome)
  if (installed)
    return installed

  const engine = scene.getEngine()
  const countRatio = STAR_COUNT_MIN_RATIO + (1 - STAR_COUNT_MIN_RATIO) * Math.min(1, Math.max(0, detailRatio))
  const starList = createStarList(Math.round(STAR_COUNT * countRatio))

  const positionList: number[] = []
  const normalList: number[] = []
  const uvList: number[] = []
  const colorList: number[] = []
  const indexList: number[] = []
  for (const [starIndex, star] of starList.entries()) {
    const baseIndex = starIndex * 4
    for (const [cornerX, cornerY] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      positionList.push(...star.direction)
      normalList.push(star.twinklePhase, star.twinkleSpeed, star.brightness)
      uvList.push(cornerX, cornerY)
      colorList.push(star.color[0], star.color[1], star.color[2], star.pixelSize)
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.uvs = uvList
  vertexData.colors = colorList
  vertexData.indices = indexList
  vertexData.applyToMesh(dome)

  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const material = new ShaderMaterial(`${dome.name}-pixel-material`, scene, SHADER_NAME, {
    attributes: ['position', 'normal', 'uv', 'color'],
    uniforms: ['world', 'viewProjection', 'starSetting', 'strength'],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_ADD
  /** 星星是天空的一部分，不留深度；自己的深度壓在遠平面上，任何實體都擋得住 */
  material.disableDepthWrite = true
  material.depthFunction = Constants.LEQUAL
  material.fogEnabled = false

  let elapsed = 0
  let strength = 0

  /**
   * 畫面多大、一個 CSS 像素是幾個畫面像素，綁定的當下才知道
   *
   * 同一顆網格會畫進不同大小的目標：主畫面，以及水鏡的倒影（幾百格見方的小圖）。
   * 像素格要照「現在畫進去的那一張」算，否則倒影裡的星會落在格子之間、糊成半透明。
   * 主畫面再乘上像素比（高畫質是一點五倍），星星在螢幕上才是同樣的大小；倒影本來就小，不乘
   */
  material.onBindObservable.add(() => {
    const effect = material.getEffect()
    if (!effect)
      return

    const width = engine.getRenderWidth()
    const height = engine.getRenderHeight()
    const isMainPass = width === engine.getRenderWidth(true) && height === engine.getRenderHeight(true)
    const pixelScale = isMainPass ? 1 / engine.getHardwareScalingLevel() : 1
    /** 直接寫進效果：這個觀察者在材質綁定之後才發，寫回材質的話要到下一次綁定才生效 */
    effect.setFloat4('starSetting', width, height, pixelScale, elapsed)
    effect.setFloat('strength', strength)
  })

  const previousMaterial: Material | null = dome.material
  dome.material = material
  previousMaterial?.dispose(false, true)

  /** 頂點是著色器擺的，網格自己的包圍盒沒有意義 */
  dome.alwaysSelectAsActiveMesh = true
  /** 天空的東西最先畫：其他半透明的（水面、招牌景象）都疊在它上面 */
  dome.alphaIndex = 0
  dome.setEnabled(false)

  const starField: PixelStarField = {
    update(deltaSecond, visibility, brightnessBoost) {
      elapsed += deltaSecond
      strength = Math.max(0, visibility) * brightnessBoost
      const isShown = strength > 0.004
      if (dome.isEnabled(false) !== isShown) {
        dome.setEnabled(isShown)
      }
    },
  }
  installedMap.set(dome, starField)
  return starField
}
