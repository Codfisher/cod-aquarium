/**
 * 雲縫光：太陽在雲後時，從雲縫放射出來的一道道光
 *
 * 雲擋住的地方，後面的空氣沒被照亮；沒擋住的地方照亮了。從側面看，就是一條條亮與暗相間的光柱，
 * 全部指向太陽。
 *
 * ── 做法 ──
 *
 * 螢幕空間的放射狀模糊，材料是體積雲累積好的那張圖：對每個像素，朝「太陽在畫面上的位置」走二十步，
 * 沿路問「這裡是不是太陽附近（光源）、有沒有被雲擋住」，把沒被擋住的光加起來。
 * 一路都被雲擋住的像素拿不到光，穿過雲縫的像素拿得到，亮暗相間的條紋就出來了。
 * 結果在合成時乘上這一刻雲被照的顏色，疊在天空與雲上（合成的天空罩貼在遠平面，地形擋得住）。
 *
 * 與既有的兩套光束互補，不重疊：
 * - weather/god-rays（螢幕空間）：遮蔽圖裡只有地形與樹，雲被排除在外，所以它的光束只會被樹與建築切開
 * - renderer/volumetric-light（行進版，極致）：畫地面上的光柱，刻意不往天空加光
 * 這一支只管天上被雲切開的那一份，而且用的是雲本來就算好的圖，不必把世界多畫一次
 *
 * ── 平常不花錢 ──
 *
 * 多一趟全螢幕就是多一趟的錢，所以只在看得到效果時才跑（見 computeRayStrength）：
 * 效能檔不做；太陽太高、落得太深、不在畫面附近不做；太陽那一側沒有雲、或整片被雲蓋死也不做。
 * 最後一項在 CPU 上估：照著色器算區域雲量的式子（estimateLocalCoverage），對太陽周圍幾個方向各查一次天氣圖。
 * 強度是零的時候這一趟整個不畫，合成那一支也不取樣
 */

/** 沿著光線取樣幾次 */
export const RAY_SAMPLE_COUNT = 20

/** 這一趟的圖是雲那張圖的幾分之一 */
export const RAY_RESOLUTION_RATIO = 0.5

/** 疊上去的光最亮是幾成 */
export const RAY_PEAK_STRENGTH = 0.32

/** 太陽周圍多大一圈算光源（畫面高度的倍數） */
const RAY_SOURCE_RADIUS = 0.42

/** 每一步的光剩幾成：離太陽越遠的雲縫，漏下來的光傳到這裡越淡 */
const RAY_DECAY = 0.93

/** 朝太陽走多遠：一是一路走到太陽的位置 */
const RAY_REACH = 0.9

/**
 * 沒被擋住的光要扣掉幾成才算「光柱」
 *
 * 一整片晴空也會加出一團光暈，那不是雲縫光，而且天色的暖光已經調好了。
 * 扣掉完全沒被擋時的一半：路上有一半以上是通的才亮，光柱之間的暗帶因此是真的暗
 */
const RAY_BASELINE = 0.5

/** 太陽多高、多深的範圍內才有雲縫光：貼著地平線最強，升高之後淡掉，沉到雲都暗了也收掉 */
const RAY_SUN_HEIGHT_RANGE = { fadeInFrom: -0.16, fadeInTo: -0.05, fadeOutFrom: 0.3, fadeOutTo: 0.62 } as const

/** 太陽離畫面中心多遠（畫面座標，零點五是畫面邊緣）開始淡、多遠全無 */
const RAY_SCREEN_RANGE: readonly [number, number] = [0.75, 1.15]

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(from: number, to: number, value: number): number {
  const ratio = clampUnit((value - from) / (to - from))
  return ratio * ratio * (3 - 2 * ratio)
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

/** 一張 RGBA 的雜訊圖（天氣圖、宏觀圖） */
export interface NoiseMap {
  size: number;
  data: Uint8Array;
}

/** 雙線性取紅色通道，座標會繞回（與著色器的重複定址相同），回傳零到一 */
export function sampleNoiseRed(map: NoiseMap, u: number, v: number): number {
  const { size, data } = map
  const x = (u - Math.floor(u)) * size - 0.5
  const y = (v - Math.floor(v)) * size - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const ratioX = x - x0
  const ratioY = y - y0
  const read = (column: number, row: number) =>
    data[(((column % size) + size) % size + (((row % size) + size) % size) * size) * 4]! / 255

  return lerp(
    lerp(read(x0, y0), read(x0 + 1, y0), ratioX),
    lerp(read(x0, y0 + 1), read(x0 + 1, y0 + 1), ratioX),
    ratioY,
  )
}

export interface LocalCoverageInput {
  weatherMap: NoiseMap;
  macroMap: NoiseMap;
  /** 天氣圖的頻率（每格幾個週期），著色器的 cloudScale.z */
  weatherFrequency: number;
  /** 這一刻的覆蓋率，著色器的 cloudShape.x */
  coverage: number;
  /** 層雲的程度，著色器的 cloudWeather.x */
  stratusBlend: number;
}

/**
 * 某個位置（已加上雲的座標原點）的區域雲量，零到一
 *
 * 著色器 cloudDensityLevel 開頭那一段的鏡像，只到「局部覆蓋率」為止：
 * 真的有沒有雲還要過基底雜訊，那太貴，也不需要——這裡只要知道那一帶大概有多少雲
 */
export function estimateLocalCoverage(pointX: number, pointZ: number, input: LocalCoverageInput): number {
  const u = pointX * input.weatherFrequency
  const v = pointZ * input.weatherFrequency
  const weather = sampleNoiseRed(input.weatherMap, u, v)
  const macro = sampleNoiseRed(input.macroMap, u * 0.31 + 0.17, v * 0.31 + 0.53)

  let regional = clampUnit(weather * 0.6 + macro * 0.6 - 0.1)
  regional = regional * regional * (3 - 2 * regional)
  regional = lerp(regional, 0.72, input.stratusBlend * 0.65)
  return clampUnit(input.coverage * lerp(0.2, 1.7, regional))
}

/**
 * 太陽那一側的雲適不適合出光柱，零到一
 *
 * 要「有雲，但沒蓋死」：幾個方向的雲量都很低就是晴空（沒東西切光），都很高就是一堵雲牆（光透不過來）
 */
export function computeCloudGapRatio(coverageList: readonly number[]): number {
  if (coverageList.length === 0)
    return 0

  let presence = 0
  let blocked = 0
  for (const coverage of coverageList) {
    presence += smoothstep(0.22, 0.4, coverage)
    blocked += smoothstep(0.58, 0.82, coverage)
  }
  presence /= coverageList.length
  blocked /= coverageList.length

  return smoothstep(0.05, 0.3, presence) * (1 - blocked)
}

/** 太陽的高度允許多少雲縫光，零到一 */
export function computeRaySunWindow(sunHeight: number): number {
  const { fadeInFrom, fadeInTo, fadeOutFrom, fadeOutTo } = RAY_SUN_HEIGHT_RANGE
  return smoothstep(fadeInFrom, fadeInTo, sunHeight) * (1 - smoothstep(fadeOutFrom, fadeOutTo, sunHeight))
}

/**
 * 太陽在畫面上的位置允許多少雲縫光，零到一
 *
 * sunU、sunV 是太陽投影到畫面上的座標（零到一是畫面內）。太陽在畫面外不遠處時光柱照樣掃得進來，
 * 再遠就收掉：那時每個像素朝太陽走的方向幾乎平行，放射狀的樣子沒了，只剩一片斜的條紋
 */
export function computeRayScreenWindow(sunU: number, sunV: number): number {
  const distance = Math.hypot(sunU - 0.5, sunV - 0.5)
  return 1 - smoothstep(RAY_SCREEN_RANGE[0], RAY_SCREEN_RANGE[1], distance)
}

/** 放射狀模糊那一趟的 uniform 名字 */
export const CLOUD_RAY_UNIFORM_NAME_LIST = ['raySun', 'raySetting']

/**
 * 輸出要放大幾倍才剛好用滿零到一
 *
 * 一路全通、全程都在光源範圍內時，每一步的光加起來是等比級數的和；扣掉基準、除以步數之後只剩兩成多。
 * 圖是八位元的，不放大的話只用到六十幾階，光柱的漸層會出現色階
 */
const RAY_OUTPUT_GAIN = 1 / ((1 - RAY_DECAY ** RAY_SAMPLE_COUNT) / (1 - RAY_DECAY) * (1 - RAY_BASELINE))

/**
 * 放射狀模糊
 *
 * raySun      太陽在畫面上的位置（x、y，可以在畫面外）、畫面的寬高比、未用
 * raySetting  光源範圍、每一步剩幾成、朝太陽走多遠、扣掉的基準
 *
 * 起點照像素抖動一格以內：步數少的時候不抖會出現一圈圈同心的階梯。
 * 抖動不隨時間變（這一趟沒有時間累積，隨時間變就是閃爍），圖又是放大著貼回去的，顆粒看不出來。
 *
 * 取樣用 textureLod、迴圈的次數寫死：迴圈裡要算微分的取樣（texture2D）在 ANGLE 轉成 HLSL 時編不過。
 * 字串裡不寫註解，理由同 cloud-glsl
 */
export const CLOUD_RAY_FRAGMENT = `
precision highp float;

varying vec2 vUV;

uniform sampler2D cloudSampler;
uniform vec4 raySun;
uniform vec4 raySetting;

void main() {
  vec2 stepVector = (raySun.xy - vUV) * (raySetting.z / ${RAY_SAMPLE_COUNT}.0);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 uv = vUV + stepVector * jitter;

  float illumination = 1.0;
  float total = 0.0;
  float reference = 0.0;
  for (int index = 0; index < ${RAY_SAMPLE_COUNT}; index++) {
    vec2 offset = (uv - raySun.xy) * vec2(raySun.z, 1.0);
    float source = (1.0 - smoothstep(0.0, raySetting.x, length(offset))) * illumination;
    float opacity = clamp(textureLod(cloudSampler, clamp(uv, vec2(0.0), vec2(1.0)), 0.0).a, 0.0, 1.0);
    total += source * (1.0 - opacity);
    reference += source;
    illumination *= raySetting.y;
    uv += stepVector;
  }

  float shaft = min(max(total - reference * raySetting.w, 0.0) * ${RAY_OUTPUT_GAIN.toFixed(5)}, 1.0);
  gl_FragColor = vec4(shaft, shaft, shaft, 1.0);
}
`

/** 放射狀模糊的設定，寫進 raySetting */
export const CLOUD_RAY_SETTING = {
  sourceRadius: RAY_SOURCE_RADIUS,
  decay: RAY_DECAY,
  reach: RAY_REACH,
  baseline: RAY_BASELINE,
} as const
