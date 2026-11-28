/**
 * 晨昏的光：火燒雲與朝霞
 *
 * 太陽貼近地平線時，光要斜著穿過很長一段大氣才到得了雲，藍與綠先被散掉，剩下的越來越紅；
 * 太陽沉到地平線下之後，地面已經在影子裡，高處的雲還照得到一陣子。
 * 火燒雲就是這兩件事疊起來：雲底被從下面打上來的紅光燒亮，雲頂只剩暗下來的天光。
 *
 * 這個檔案只有數字，不碰場景也不碰 Babylon：
 * 日夜循環（use-day-night）拿它算 CPU 這一側的光色，體積雲的著色器（cloud-glsl）用同一組色階
 * 逐點重算一次，Node 腳本與單元測試也直接載入它。三邊共用一份，色階才不會各調各的。
 *
 * ── 模型 ──
 *
 * 對雲裡的一點問：「朝太陽的那條光線離地面最近時有多高？」（掠地高度，見 getGrazingHeight）
 * 這個高度是負的，就是進了星球的影子；越貼地，光穿過的濁氣越多、越紅越暗。
 * 色階就掛在這個高度上：金 → 橘 → 緋紅 → 玫瑰 → 暗。
 * 太陽往下沉，同一朵雲的掠地高度一路降，顏色就照這個順序走完；
 * 高處的雲掠地高度比較大，所以低雲先熄、卷雲殿後；背對太陽那一側的雲先進影子，地影於是由東往西掃過去。
 *
 * ── 每天不一樣 ──
 *
 * 燃燒強度（零到一）由當天的雲與一支獨立的籤決定（見 cloud-daily-weather 的 deriveBurnIntensity）：
 * 平淡的傍晚雲只帶一點粉，好的傍晚整片燒起來。它只改顏色的飽和度與亮度，不碰雲量
 */

/**
 * 三個調整旋鈕：要改「燒得多兇」先動這裡
 *
 * - 整體燃燒強度：每天抽出來的強度再乘上它（之後夾在零到一）。
 *   調到 1.3，好的傍晚變多、平淡的變少；調到 0.7，再也不會整片燒滿
 * - 暮光長度：一是照幾何算（太陽沉到雲的地平俯角就暗）。調大，每一層雲都撐久一點，
 *   低雲與高雲相隔的時間也跟著拉開；長度大約與這個數字成正比
 * - 緋紅的量：一是預設。調大，緋紅那一段佔的高度變寬（同一時刻更多的雲是紅的而不是橘的）；
 *   調到零，色階就從橘直接暗下去，沒有紅
 */
export const TWILIGHT_BURN_STRENGTH = 1
export const TWILIGHT_DURATION_SCALE = 1
export const TWILIGHT_CRIMSON_AMOUNT = 1

/**
 * 色階的四個顏色：玫瑰、緋紅、橘、金（由低到高）
 *
 * 黃昏比清晨濃：太陽整天曬起來的塵埃都在傍晚的空氣裡。
 * 清晨的空氣乾淨，朝霞偏粉、偏冷，金色也淡一點
 */
export type TwilightKind = 'dawn' | 'dusk'

type Rgb = readonly [number, number, number]

const PALETTE_MAP: Record<TwilightKind, readonly [Rgb, Rgb, Rgb, Rgb]> = {
  dusk: [
    [0.55, 0.15, 0.22],
    [0.96, 0.26, 0.13],
    [1.0, 0.52, 0.22],
    [1.0, 0.76, 0.46],
  ],
  dawn: [
    [0.5, 0.18, 0.3],
    [0.95, 0.33, 0.27],
    [1.0, 0.57, 0.36],
    [1.0, 0.8, 0.56],
  ],
}

/**
 * 色階掛在哪些掠地高度上（格）
 *
 * 低於 shadow 是星球的影子，全暗；rose 以下只剩一點玫瑰色的殘光；
 * crimson 到 orange 之間是緋紅轉橘；gold 以上是金色（太陽還在地平線上的時候）。
 * 緋紅的量會把 crimson 那一格往上推，緋紅佔的範圍就變寬
 */
export const TWILIGHT_STOP_HEIGHT = {
  shadow: -20,
  rose: 15,
  crimson: 15 + 45 * Math.max(0.2, TWILIGHT_CRIMSON_AMOUNT),
  orange: 150 + 45 * Math.max(0, TWILIGHT_CRIMSON_AMOUNT - 1),
  gold: 260 + 45 * Math.max(0, TWILIGHT_CRIMSON_AMOUNT - 1),
} as const

/** 太陽還在地平線上時，掠地高度隨「沿著陽光方向的距離」加多少：太陽越高越往金色走 */
export const TWILIGHT_SUNWARD_LIFT = 0.1

/**
 * 暮光長度換算成「每一格高度多算幾格」
 *
 * 雲進影子時太陽的俯角大約與高度的平方根成正比，所以長度要兩倍、高度就得當成四倍。
 * 著色器與 CPU 這一側用同一個數字
 */
export const TWILIGHT_ALTITUDE_LIFT = TWILIGHT_DURATION_SCALE * TWILIGHT_DURATION_SCALE - 1

/**
 * 太陽多高開始有晨昏的光、多高是滿的
 *
 * 高於上限的白天完全不受影響：晨昏的比例是零，雲的光色就是原本那一條式子
 */
const TWILIGHT_FULL_HEIGHT = 0.02
const TWILIGHT_START_HEIGHT = 0.28

/**
 * 太陽沉到多深，雲的光才交給月亮
 *
 * 原本是 −0.1：太陽才下去六度，雲就改被月亮從東邊照，餘暉的方向整個反了。
 * 卷雲（四百二十格高）要到 −0.26 才進星球的影子，所以換手排在那之後；
 * 月光再用一小段淡進來，t 過了 0.82 就與原本的夜完全相同
 */
export const TWILIGHT_HANDOVER_HEIGHT = -0.3
const TWILIGHT_FADE_HEIGHT = -0.26
export const MOON_LIGHT_FULL_DEPTH = 0.36

/**
 * 晨昏時雲的天光最多打幾折：雲頂暗下來，雲底的紅才撐得住
 *
 * 只壓到積雲燒完為止（太陽沉到 AMBIENT_DIM_FULL_HEIGHT 之後放掉，到 AMBIENT_DIM_END_HEIGHT 完全還原）：
 * 低雲進了影子之後只剩天光在照，還壓著的話是一團團近乎全黑的剪影貼在藍調的天上
 */
const AMBIENT_DIM = 0.45
const AMBIENT_DIM_FULL_HEIGHT = -0.13
const AMBIENT_DIM_END_HEIGHT = -0.22

/**
 * 高光的保色壓縮最多用到幾成
 *
 * 原本逐通道把亮度收進一，逆光的雲邊進去是橘、出來是純白。
 * 改成以最亮的通道為準一起縮，色相就留得住；但全用保色的話雲邊是一圈飽和到刺眼的橘，
 * 留兩成逐通道的結果，雲邊落在金色。正午這個比例是零，白雲還是白的
 */
const HUE_CLIP_RATIO = 0.8

/** 燃燒強度最低時顏色還留幾成飽和、亮度是幾倍；最高時是滿的飽和、GAIN_MAX 倍 */
const SATURATION_MIN = 0.35
const GAIN_MIN = 0.7
const GAIN_MAX = 1.4

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

/** 與 GLSL 的 smoothstep 同一條式子 */
export function smoothstep(from: number, to: number, value: number): number {
  const ratio = clampUnit((value - from) / (to - from))
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 晨昏的比例：太陽在 TWILIGHT_START_HEIGHT 以上是零，貼到地平線就是一，之後整夜維持一
 *
 * 著色器拿它在「白天的光色」與「晨昏的色階」之間混
 */
export function getTwilightRatio(sunHeight: number): number {
  return 1 - smoothstep(TWILIGHT_FULL_HEIGHT, TWILIGHT_START_HEIGHT, sunHeight)
}

/** 入夜後晨昏的光淡到零的那一段：換手給月亮之前就已經全暗 */
export function getTwilightNightFade(sunHeight: number): number {
  return smoothstep(TWILIGHT_HANDOVER_HEIGHT, TWILIGHT_FADE_HEIGHT, sunHeight)
}

/** 晨昏的窗口：只有太陽貼近地平線的那一段是一，正午與深夜都是零 */
export function getTwilightWindow(sunHeight: number): number {
  return getTwilightRatio(sunHeight) * getTwilightNightFade(sunHeight)
}

/** 雲是不是還被太陽照著（否則是月亮） */
export function isCloudSunLit(sunHeight: number): boolean {
  return sunHeight > TWILIGHT_HANDOVER_HEIGHT
}

/** 月光照到雲上的比例：換手之後才淡進來 */
export function getMoonLightGate(sunHeight: number): number {
  return smoothstep(-TWILIGHT_HANDOVER_HEIGHT, MOON_LIGHT_FULL_DEPTH, -sunHeight)
}

/** 晨昏時雲的天光乘多少：燒得越兇，雲頂壓得越暗 */
export function getTwilightAmbientScale(sunHeight: number, burnIntensity: number): number {
  const dimWindow = getTwilightRatio(sunHeight) * smoothstep(AMBIENT_DIM_END_HEIGHT, AMBIENT_DIM_FULL_HEIGHT, sunHeight)
  return 1 - AMBIENT_DIM * dimWindow * clampUnit(burnIntensity)
}

/** 高光保色壓縮的比例，正午與深夜是零 */
export function getHueClipRatio(sunHeight: number): number {
  return HUE_CLIP_RATIO * getTwilightWindow(sunHeight)
}

/** 天色的霞光在最平淡與最燒的日子各乘多少 */
const SKY_GLOW_SCALE_RANGE: readonly [number, number] = [0.75, 1.25]

/**
 * 天色的霞光強度乘多少
 *
 * 雲燒得兇的傍晚，天邊那團暖光與背後的金星帶也跟著濃；平淡的傍晚淡一點。
 * 只在晨昏的窗口裡作用，正午與深夜是一：那時霞光本來就幾乎是零，
 * 而且每天的籤在正午與子夜換，不乘窗口的話會在那兩個時刻跳一下
 */
export function getSkyGlowScale(sunHeight: number, burnIntensity: number): number {
  const [plain, burning] = SKY_GLOW_SCALE_RANGE
  return lerp(1, lerp(plain, burning, clampUnit(burnIntensity)), getTwilightWindow(sunHeight))
}

/**
 * 掠地高度（格）：頭頂某個高度的一點，朝太陽的光線離地面最近時有多高
 *
 * 太陽在地平線上時光線不會碰到地面，回傳的是「那一點的高度再加一段」，太陽越高加越多，
 * 色階因此一路走到金色；太陽在地平線下時是光線到星球中心的垂直距離減半徑。
 * 兩段在太陽剛好落在地平線時相接（都等於那一點的高度）
 *
 * 暮光長度的旋鈕在這裡生效：把高度放大，等於把星球的影子往下壓
 */
export function getGrazingHeight(altitude: number, sunHeight: number, planetRadius: number): number {
  const distanceToCenter = planetRadius + altitude
  const along = distanceToCenter * sunHeight
  const lifted = TWILIGHT_ALTITUDE_LIFT * altitude
  if (along >= 0)
    return altitude + along * TWILIGHT_SUNWARD_LIFT + lifted

  return Math.sqrt(Math.max(distanceToCenter * distanceToCenter - along * along, 0)) - planetRadius + lifted
}

/** 這一刻的色階：四個顏色依序攤平成十二個數字，已經乘過燃燒強度與入夜的淡出 */
export type TwilightPalette = number[]

export function createTwilightPalette(): TwilightPalette {
  return Array.from({ length: 12 }, () => 0)
}

/**
 * 填出這一刻的色階
 *
 * 燃燒強度低的日子，顏色往一個帶粉的灰收、亮度也低：雲只是染上一點霞色；
 * 強度高的日子是滿的飽和與一點四倍的亮度
 */
export function fillTwilightPalette(
  kind: TwilightKind,
  burnIntensity: number,
  sunHeight: number,
  out: TwilightPalette,
): TwilightPalette {
  const burn = clampUnit(burnIntensity)
  const saturation = lerp(SATURATION_MIN, 1, burn)
  const gain = lerp(GAIN_MIN, GAIN_MAX, burn) * getTwilightNightFade(sunHeight)
  const crimsonRatio = clampUnit(TWILIGHT_CRIMSON_AMOUNT)
  const [rose, crimson, orange, gold] = PALETTE_MAP[kind]

  for (const [stopIndex, stop] of [rose, crimson, orange, gold].entries()) {
    /** 緋紅的量不到一時，玫瑰與緋紅兩格往橘色收 */
    const red = stopIndex < 2 ? lerp(orange[0], stop[0], crimsonRatio) : stop[0]
    const green = stopIndex < 2 ? lerp(orange[1], stop[1], crimsonRatio) : stop[1]
    const blue = stopIndex < 2 ? lerp(orange[2], stop[2], crimsonRatio) : stop[2]
    const dim = stopIndex === 0 && crimsonRatio < 1 ? lerp(0.55, 1, crimsonRatio) : 1

    const luminance = (red + green + blue) / 3
    out[stopIndex * 3] = lerp(luminance * 1.15, red, saturation) * gain * dim
    out[stopIndex * 3 + 1] = lerp(luminance * 0.95, green, saturation) * gain * dim
    out[stopIndex * 3 + 2] = lerp(luminance * 0.9, blue, saturation) * gain * dim
  }
  return out
}

/**
 * 某個掠地高度上的光色，寫進 out
 *
 * 與著色器的 cloudTwilightLight 同一條式子，改一邊要改另一邊
 */
export function sampleTwilightLight(
  grazingHeight: number,
  palette: TwilightPalette,
  out: [number, number, number],
): [number, number, number] {
  const { shadow, rose, crimson, orange, gold } = TWILIGHT_STOP_HEIGHT
  const toCrimson = smoothstep(rose, crimson, grazingHeight)
  const toOrange = smoothstep(crimson, orange, grazingHeight)
  const toGold = smoothstep(orange, gold, grazingHeight)
  const lit = smoothstep(shadow, rose, grazingHeight)

  for (let channel = 0; channel < 3; channel++) {
    let value = lerp(palette[channel]!, palette[3 + channel]!, toCrimson)
    value = lerp(value, palette[6 + channel]!, toOrange)
    value = lerp(value, palette[9 + channel]!, toGold)
    out[channel] = value * lit
  }
  return out
}

/**
 * 高光壓縮：超過零點七五的部分用指數收進一
 *
 * 與著色器的 cloudSoftClip 同一條式子。hueRatio 為零時是原本的逐通道壓縮；
 * 為一時三個通道照最亮的那一個等比例縮，色相不變
 */
export function clipHighlight(
  color: readonly [number, number, number],
  hueRatio: number,
  out: [number, number, number],
): [number, number, number] {
  const knee = 0.75
  const compress = (value: number) =>
    Math.min(value, knee) + (1 - knee) * (1 - Math.exp(-Math.max(value - knee, 0) / (1 - knee)))

  const peak = Math.max(color[0], color[1], color[2], 0.0001)
  const scale = compress(peak) / peak
  for (let channel = 0; channel < 3; channel++) {
    out[channel] = lerp(compress(color[channel]!), color[channel]! * scale, hueRatio)
  }
  return out
}
