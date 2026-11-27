import type { AmbientActivity, AmbientParticle } from './realm-definition'

/**
 * 各大場景的日夜環境粒子
 *
 * 純資料：每座場景一份清單，一層一個粒子系統，最多四層、同一時段合計不超過預算
 * （AMBIENT_MAX_LAYER_COUNT 與 AMBIENT_MAX_CONCURRENT_COUNT，見 weather/ambient/ambient-budget）。
 * 各場景的定義檔只掛一行 ambientParticleList；集中寫在這裡是為了一眼比得出每座場景的日夜各有什麼，
 * 也方便 Node 端一次驗完所有清單。
 *
 * 設計與每一座的取捨見 docs/plans/2026-11-27-minespace-realms-design.md 的「環境粒子」。
 * 原則：螢火只出現在牠們說得通的地方（風露原、千蛙沼、湖的蘆葦、溪邊、蟬林的林緣、麥田與林間空地少量），
 * 其他場景的夜晚是別的東西（蛾、孢子、霧、冰晶、火星、塵）；大廳不寫，沿用通用的花粉與螢火
 */

/**
 * 一層在四個時段的活躍程度
 *
 * 清晨與傍晚不給就是白天與夜裡的平均；要「只在清晨出現」就明確給 dawn 與 dusk
 */
function activity(day: number, night: number, dawn?: number, dusk?: number): AmbientActivity {
  return {
    day,
    night,
    ...(dawn === undefined ? {} : { dawn }),
    ...(dusk === undefined ? {} : { dusk }),
  }
}

/** 湖中島：白天池上有蜻蜓與柳絮，夜裡只有蘆葦邊幾點螢火，清晨水面起霧 */
export const LAKE_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'dragonfly', count: 7, activity: activity(1, 0, 0.4, 0.5), spawn: { anchor: 'water', reach: 20, height: [0.4, 1.6], spread: 0.5 } },
  { kind: 'seedfluff', count: 36, activity: activity(1, 0, 0.3, 0.4), spawn: { anchor: 'air', height: [-1, 4] }, wind: 0.8 },
  { kind: 'firefly', count: 26, activity: activity(0, 1, 0.3, 0.6), spawn: { anchor: 'reed', fallback: 'water', reach: 20, height: [0.3, 1.8], spread: 1.2 } },
  { kind: 'mist', count: 18, activity: activity(0, 0.15, 1, 0.25), spawn: { anchor: 'water', reach: 24, height: [0.1, 1], spread: 0.5 } },
]

/** 海中沙島：白天浪尖的鹽光、飛沫與貼地的風沙，夜裡只剩海面一層淡淡的霧，沒有螢火 */
export const COAST_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'glint', count: 44, activity: activity(1, 0, 0.5, 0.8), spawn: { anchor: 'water', reach: 22, height: [0.05, 0.6] } },
  { kind: 'spray', count: 22, activity: activity(1, 0.25, 0.6, 0.7), spawn: { anchor: 'water', reach: 12, height: [0, 0.2], spread: 0.4 } },
  {
    kind: 'windstreak',
    count: 22,
    activity: activity(1, 0.3, 0.5, 0.8),
    spawn: { anchor: 'ground', reach: 14, height: [0.05, 0.4] },
    color: [0.95, 0.85, 0.62],
    colorAlt: [0.9, 0.78, 0.55],
    wind: 1.2,
  },
  {
    kind: 'mist',
    count: 14,
    activity: activity(0, 0.8, 0.8, 0.6),
    spawn: { anchor: 'water', reach: 24, height: [0.2, 1.4] },
    color: [0.8, 0.88, 1],
    colorAlt: [0.7, 0.8, 0.92],
  },
]

/** 林海：白天光束裡的暖塵，夜裡蘑菇邊發光的孢子，神社那塊空地上有幾點螢火 */
export const FOREST_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  {
    kind: 'dust',
    count: 70,
    activity: activity(1, 0, 0.7, 0.7),
    spawn: { anchor: 'air', height: [-1.5, 4] },
    color: [0.95, 0.9, 0.7],
    colorAlt: [0.85, 0.85, 0.75],
  },
  { kind: 'spore', count: 40, activity: activity(0, 1, 0.3, 0.5), spawn: { anchor: 'mushroom', fallback: 'grass', reach: 20, height: [0.2, 1.6], spread: 1 } },
  { kind: 'firefly', count: 14, activity: activity(0, 1, 0.3, 0.6), spawn: { anchor: 'light', reach: 26, height: [-0.5, 2], spread: 4 } },
]

/** 金葉林：白天飄著暖色種絨，貼地的碎葉整天打轉，夜裡是琥珀色的腐葉塵（落葉另有專屬系統） */
export const AUTUMN_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  {
    kind: 'seedfluff',
    count: 45,
    activity: activity(1, 0, 0.4, 0.6),
    spawn: { anchor: 'air', height: [-1, 4] },
    color: [1, 0.95, 0.8],
    colorAlt: [0.95, 0.85, 0.7],
  },
  { kind: 'litter', count: 40, activity: activity(0.8, 0.6, 0.7, 1), spawn: { anchor: 'ground', reach: 16, height: [0.05, 0.6] }, wind: 1.3 },
  {
    kind: 'dust',
    count: 45,
    activity: activity(0, 1, 0.5, 0.7),
    spawn: { anchor: 'air', height: [-1.5, 3.5] },
    color: [0.9, 0.72, 0.5],
    colorAlt: [0.75, 0.6, 0.45],
  },
]

/** 千蛙沼：白天蜻蜓點水，夜裡蘆葦叢裡滿滿的螢火、水上幾盞鬼火，水面不時冒泡（霧片另有專屬系統） */
export const SWAMP_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'dragonfly', count: 8, activity: activity(1, 0, 0.5, 0.7), spawn: { anchor: 'water', reach: 22, height: [0.4, 1.4], spread: 0.5 } },
  { kind: 'firefly', count: 70, activity: activity(0, 1, 0.4, 0.7), spawn: { anchor: 'reed', fallback: 'water', reach: 22, height: [0.2, 1.8], spread: 1.5 } },
  { kind: 'marshlight', count: 6, activity: activity(0, 1, 0.5, 0.4), spawn: { anchor: 'water', reach: 26, height: [0.3, 1.2], spread: 0.5 } },
  { kind: 'bubble', count: 16, activity: activity(1, 1), spawn: { anchor: 'water', reach: 14, height: [0, 0.05], spread: 0.3 } },
]

/** 村落：白天花圃上的蝴蝶與花粉，灶上的炊煙；夜裡蛾繞著燈籠打轉 */
export const VILLAGE_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'butterfly', count: 14, activity: activity(1, 0, 0.3, 0.5), spawn: { anchor: 'flower', fallback: 'grass', reach: 22, height: [0.4, 1.6], spread: 1.2 } },
  { kind: 'pollen', count: 70, activity: activity(1, 0, 0.6, 0.6), spawn: { anchor: 'air', height: [-1.5, 3.5] } },
  { kind: 'moth', count: 12, activity: activity(0, 1, 0.3, 0.7), spawn: { anchor: 'light', reach: 26, height: [-0.6, 0.8], spread: 0.8 } },
  {
    kind: 'steam',
    count: 10,
    activity: activity(1, 0.9),
    spawn: { anchor: 'fire', reach: 30, height: [0.8, 1.6], spread: 0.3 },
    color: [0.78, 0.78, 0.8],
    colorAlt: [0.65, 0.65, 0.68],
    size: [0.4, 0.8],
  },
]

/** 地底洞窟：沒有日夜（四個時段一樣）：燈邊（附近沒有燈就在地面上方）浮著發光孢子、空中的冷塵、地底湖面貼著一層涼霧 */
export const CAVE_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'spore', count: 50, activity: activity(1, 1), spawn: { anchor: 'light', fallback: 'ground', reach: 28, height: [0, 3], spread: 3 }, weatherResponse: 'keep' },
  {
    kind: 'dust',
    count: 60,
    activity: activity(1, 1),
    spawn: { anchor: 'air', height: [-1.5, 3.5] },
    color: [0.7, 0.78, 0.88],
    wind: 0,
    weatherResponse: 'keep',
  },
  {
    kind: 'mist',
    count: 10,
    activity: activity(1, 1),
    spawn: { anchor: 'water', reach: 24, height: [0.1, 0.8] },
    color: [0.7, 0.85, 0.9],
    colorAlt: [0.6, 0.78, 0.85],
    wind: 0,
    weatherResponse: 'keep',
  },
]

/** 雪稜：白天日照下冰晶一閃一閃，夜裡極光底下風把雪吹成一條條細線 */
export const ALPINE_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  {
    kind: 'glint',
    count: 90,
    activity: activity(1, 0.1, 0.6, 0.6),
    spawn: { anchor: 'air', height: [-2, 4] },
    color: [0.85, 0.95, 1.2],
    colorAlt: [1, 1, 1.1],
    weatherResponse: 'keep',
  },
  {
    kind: 'windstreak',
    count: 42,
    activity: activity(0.2, 1, 0.5, 0.5),
    spawn: { anchor: 'air', height: [-1, 3.5] },
    color: [0.9, 0.95, 1],
    colorAlt: [0.8, 0.88, 1],
    wind: 1.8,
    weatherResponse: 'keep',
  },
]

/** 溪谷：白天溪邊的蝴蝶與蜻蜓、谷裡的暖塵，夜裡螢火只沿著溪水（瀑布水霧另有專屬系統） */
export const RIVER_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'butterfly', count: 10, activity: activity(1, 0, 0.3, 0.5), spawn: { anchor: 'flower', fallback: 'grass', reach: 22, height: [0.4, 1.5], spread: 1.2 } },
  { kind: 'dragonfly', count: 6, activity: activity(1, 0, 0.4, 0.5), spawn: { anchor: 'water', reach: 18, height: [0.4, 1.4], spread: 0.5 } },
  { kind: 'firefly', count: 30, activity: activity(0, 1, 0.3, 0.6), spawn: { anchor: 'water', reach: 20, height: [0.3, 1.5], spread: 0.8 } },
  {
    kind: 'dust',
    count: 40,
    activity: activity(1, 0, 0.6, 0.6),
    spawn: { anchor: 'air', height: [-1.5, 3.5] },
    color: [0.85, 0.92, 0.8],
    colorAlt: [0.78, 0.86, 0.78],
  },
]

/** 千頃麥浪：白天風裡橫著飛的麥殼與種絨，夜裡燈邊的蛾、麥田裡零星幾點螢火 */
export const WHEATFIELD_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'chaff', count: 60, activity: activity(1, 0.15, 0.5, 0.8), spawn: { anchor: 'crop', fallback: 'ground', reach: 20, height: [0.8, 2.2], spread: 1.5 }, wind: 1.6 },
  {
    kind: 'seedfluff',
    count: 40,
    activity: activity(1, 0, 0.3, 0.5),
    spawn: { anchor: 'air', height: [-1, 3.5] },
    color: [1, 0.97, 0.82],
    colorAlt: [0.95, 0.92, 0.78],
    wind: 1.2,
  },
  { kind: 'moth', count: 10, activity: activity(0, 1, 0.3, 0.7), spawn: { anchor: 'light', reach: 30, height: [-0.6, 0.8], spread: 0.8 } },
  { kind: 'firefly', count: 16, activity: activity(0, 1, 0.3, 0.6), spawn: { anchor: 'crop', reach: 22, height: [0.4, 1.8], spread: 1.5 } },
]

/** 風露原：白天花叢上的蝴蝶與飄落的花瓣；夜裡的主角是螢火，漫天都是 */
export const MEADOW_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'firefly', count: 130, activity: activity(0, 1, 0.4, 0.7), spawn: { anchor: 'grass', fallback: 'flower', reach: 22, height: [0.2, 2], spread: 2 } },
  { kind: 'butterfly', count: 18, activity: activity(1, 0, 0.3, 0.5), spawn: { anchor: 'flower', fallback: 'grass', reach: 24, height: [0.4, 1.7], spread: 1.5 } },
  { kind: 'petal', count: 40, activity: activity(1, 0, 0.4, 0.6), spawn: { anchor: 'air', height: [-1, 5] } },
]

/** 拓荒原：白天風沙與乾草屑貼地吹過；夜裡營火冒火星，燈邊有幾隻蛾 */
export const CAMPFIRE_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  {
    kind: 'windstreak',
    count: 36,
    activity: activity(1, 0.2, 0.4, 0.8),
    spawn: { anchor: 'ground', reach: 16, height: [0.05, 0.4] },
    color: [0.95, 0.78, 0.5],
    colorAlt: [0.88, 0.7, 0.42],
    wind: 1.4,
  },
  { kind: 'chaff', count: 26, activity: activity(1, 0.25, 0.5, 0.8), spawn: { anchor: 'grass', fallback: 'ground', reach: 20, height: [0.1, 0.9] }, wind: 1.5 },
  { kind: 'ember', count: 14, activity: activity(0.4, 1, 0.7, 1), spawn: { anchor: 'fire', reach: 26, height: [0.4, 0.9], spread: 0.3 } },
  { kind: 'moth', count: 6, activity: activity(0, 1, 0.3, 0.7), spawn: { anchor: 'light', reach: 28, height: [-0.6, 0.8], spread: 0.8 } },
]

/** 石殿遺址：白天暖灰的塵緩緩飄，夜裡月光下泛藍的微塵，偶爾一片碎葉 */
export const RUINS_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  {
    kind: 'dust',
    count: 70,
    activity: activity(1, 0, 0.6, 0.8),
    spawn: { anchor: 'air', height: [-1.5, 4] },
    color: [0.88, 0.82, 0.7],
    colorAlt: [0.75, 0.72, 0.66],
  },
  {
    kind: 'spore',
    count: 45,
    activity: activity(0, 1, 0.3, 0.6),
    spawn: { anchor: 'air', height: [-1.5, 4] },
    color: [0.55, 0.65, 0.95],
    colorAlt: [0.45, 0.58, 0.85],
    size: [0.04, 0.08],
    wind: 0.4,
  },
  {
    kind: 'litter',
    count: 8,
    activity: activity(0.8, 0, 0.5, 0.6),
    spawn: { anchor: 'ground', reach: 18, height: [0.05, 0.5] },
    color: [0.55, 0.5, 0.34],
    colorAlt: [0.45, 0.42, 0.3],
  },
]

/** 湯煙谷：灰燼整天緩緩落下，岩漿邊的火星入夜更旺，熱泉冒著帶硫磺色的煙氣（水汽與氣泡另有專屬系統） */
export const JIGOKU_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'ash', count: 60, activity: activity(1, 0.9, 1, 1), spawn: { anchor: 'air', height: [-1, 5] }, wind: 0.7, weatherResponse: 'keep' },
  { kind: 'ember', count: 40, activity: activity(0.5, 1, 0.8, 0.9), spawn: { anchor: 'fire', reach: 22, height: [0.5, 1.5], spread: 0.8 }, weatherResponse: 'keep' },
  {
    kind: 'steam',
    count: 24,
    activity: activity(1, 1),
    spawn: { anchor: 'water', reach: 20, height: [0.05, 0.5], spread: 0.5 },
    color: [1, 0.97, 0.78],
    colorAlt: [0.92, 0.9, 0.7],
    weatherResponse: 'keep',
  },
]

/** 百囀林苑：白天飄著羽毛與暖色花瓣、花上有蝴蝶；夜裡安靜，只有幾點螢火 */
export const SONGBIRD_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'feather', count: 20, activity: activity(1, 0, 0.5, 0.4), spawn: { anchor: 'air', height: [1, 5] } },
  {
    kind: 'petal',
    count: 30,
    activity: activity(1, 0, 0.4, 0.6),
    spawn: { anchor: 'air', height: [-1, 4.5] },
    color: [1, 0.82, 0.55],
    colorAlt: [1, 0.95, 0.9],
  },
  { kind: 'butterfly', count: 10, activity: activity(1, 0, 0.3, 0.5), spawn: { anchor: 'flower', fallback: 'grass', reach: 22, height: [0.4, 1.6], spread: 1.2 } },
  { kind: 'firefly', count: 6, activity: activity(0, 0.8, 0.2, 0.4), spawn: { anchor: 'flower', reach: 20, height: [0.4, 1.4], spread: 1.5 } },
]

/** 蟬雨深林：白天林外的暑氣在光束裡閃爍上升、暖塵緩緩飄；夜裡螢火只在石燈籠那一帶的林緣 */
export const CICADA_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'shimmer', count: 60, activity: activity(1, 0, 0.5, 0.6), spawn: { anchor: 'air', height: [-1.8, 2.5] } },
  {
    kind: 'dust',
    count: 50,
    activity: activity(1, 0, 0.6, 0.7),
    spawn: { anchor: 'air', height: [-1.5, 4] },
    color: [1, 0.93, 0.7],
    colorAlt: [0.95, 0.88, 0.7],
  },
  { kind: 'firefly', count: 26, activity: activity(0, 1, 0.3, 0.6), spawn: { anchor: 'light', reach: 28, height: [-0.3, 2.2], spread: 5 } },
]

/** 聽雨林：樹冠不停滴水，夜裡蘑菇邊的孢子微微發光，地面一層雨後的涼霧（雨本身另有專屬系統） */
export const RAINVALE_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  { kind: 'drip', count: 40, activity: activity(1, 0.8, 1, 1), spawn: { anchor: 'canopy', reach: 14, height: [-1, -0.2], spread: 0.6 }, weatherResponse: 'rain' },
  { kind: 'spore', count: 50, activity: activity(0, 1, 0.4, 0.6), spawn: { anchor: 'mushroom', fallback: 'grass', reach: 20, height: [0.2, 1.4], spread: 1 }, weatherResponse: 'keep' },
  {
    kind: 'mist',
    count: 18,
    activity: activity(1, 0.7, 1, 0.9),
    spawn: { anchor: 'ground', reach: 16, height: [0.05, 0.5] },
    color: [0.82, 0.9, 0.95],
    colorAlt: [0.75, 0.85, 0.9],
    weatherResponse: 'keep',
  },
]

/** 白矇雪原：白天雪裡夾著細碎的冰晶閃光，夜裡除了雪什麼都沒有（雪本身另有專屬系統） */
export const BLIZZARD_AMBIENT_PARTICLE_LIST: AmbientParticle[] = [
  {
    kind: 'glint',
    count: 50,
    activity: activity(1, 0, 0.8, 0.8),
    spawn: { anchor: 'air', reach: 9, height: [-1.5, 3.5] },
    color: [0.9, 0.97, 1.2],
    colorAlt: [1, 1, 1.1],
    weatherResponse: 'keep',
  },
]
