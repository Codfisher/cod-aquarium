import type { GardenId } from '../garden/garden-layout'
import type { SoundEmitterDefinition } from './type'
import {
  CAVE_CHAMBER,
  CAVE_MOUTH,
  CAVE_TUNNEL,
  GARDEN_LIST,
  getGarden,
  WATERFALL_POINT,
} from '../garden/garden-layout'
import { getWaterlineY } from '../world/world-access'

/** 音檔資料夾 */
export const SOUND_BASE = '/minespace/sounds'

/**
 * 音源佈局
 *
 * 一座箱庭一組聲音，分組的依據是質地而不是地理：
 * 連續的寬頻風、有週期的水、稀疏的瞬態、密集的高頻顆粒⋯⋯
 * 同一種質地收在同一個木座上，走一趟就是一場聽覺的分類練習。
 *
 * `maxDistance` 一律壓在四十格以內。這不只是為了「走近才聽得到」，
 * 也是循環世界的硬性條件：最外圈的木座離世界邊界四十二格，
 * 聲音若傳得比那還遠，玩家跨過邊界的瞬間會聽到它憑空消失
 */

/** 以指定座標為圓心，等距排出一圈座標 */
function createRingPositionList(
  center: { x: number; z: number },
  count: number,
  radius: number,
): { x: number; z: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2

    return {
      x: Math.round(center.x + Math.cos(angle) * radius),
      z: Math.round(center.z + Math.sin(angle) * radius),
    }
  })
}

/** 取箱庭中心加上偏移的座標 */
function at(gardenId: GardenId, offsetX = 0, offsetZ = 0): { x: number; z: number } {
  const { center } = getGarden(gardenId)

  return { x: center.x + offsetX, z: center.z + offsetZ }
}

/**
 * 風要用一圈音源鋪，不能只擺一顆
 *
 * 風吹的是整片樹冠，不是林子裡的某一個點。
 * 中心一個、外圍一圈，每個都壓小範圍：
 * 人在林子裡時前後左右都有聲音，走出木座就很快靜下來
 */
const WIND_RING_COUNT = 6

const EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  // ── 麥浪田：一陣風走過整片麥子 ──
  /**
   * 四顆收在木座內側，不是攤在角落
   *
   * 原本擺在 ±6、可聽距離二十格，加起來的腳印是二十八格半——
   * 而這座木座的半邊長只有十一格，等於麥浪一路響到田外十七格的空沙地上。
   *
   * 收到 ±4 配十一格：腳印剩十六格半，大約就是木座的對角。
   * 站在田中央四顆都在滿音量附近，走到角落最近那顆也還在十格內，
   * 整片田都有聲音，但踏出木座沒幾步就靜下來
   */
  ...[
    at('wheatfield', -4, -4),
    at('wheatfield', 4, 4),
    at('wheatfield', 4, -4),
    at('wheatfield', -4, 4),
  ].map((position, index): SoundEmitterDefinition => ({
    /**
     * 麥浪
     *
     * 這裡原本借用松籟林那個樹梢的風聲，理由是「質地對了，
     * 聽的人自然會把它聽成眼前看到的東西」。那個說法只對了一半：
     * 落葉的沙沙是闊葉互相拍打，短促、有顆粒；
     * 麥浪是幾百萬根乾稈同時彎下去再起來，聲音是連續的、會推移的。
     * 兩者在頻譜上像，在時間上不像——閉上眼睛聽得出那是一棵樹。
     *
     * 現在用的是麥稈根部的實地錄音，來源見 sounds/CREDITS.md。
     *
     * 四顆圍成一圈而不是中央一顆：風是從一邊掃到另一邊的，
     * 走在田裡才會覺得聲音有方向
     */
    id: `wheat-rustle-${index}`,
    sound: 'wheat-wind',
    title: { 'zh-hant': '麥稈摩擦', 'en': 'Wheat stalks rubbing' },
    zone: 'wheatfield',
    ...position,
    /** 及腰的高度，聲音要從麥子那一層來，不是從樹梢 */
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.42,
    minDistance: 3,
    maxDistance: 11,
  })),

  // ── 松籟林：連續寬頻的風，襯著高處的鳥 ──
  ...[
    at('forest'),
    ...createRingPositionList(getGarden('forest').center, WIND_RING_COUNT, 11),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `forest-rustle-${index}`,
    sound: 'forest-rustle',
    title: { 'zh-hant': '樹梢的風聲', 'en': 'Rustling treetops' },
    zone: 'forest',
    ...position,
    heightOffset: 8,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 22,
  })),
  {
    id: 'forest-blackbird',
    activeAt: 'day',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '烏鶇鳴唱', 'en': 'Blackbird song' },
    zone: 'forest',
    ...at('forest', 6, -6),
    heightOffset: 7,
    /** 林子裡的鳥同樣會換枝，範圍比鳴禽庭那隻大一些 */
    motion: { type: 'wander', radius: 9, periodSecond: 48, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 28,
    silentInRain: true,
  },
  {
    id: 'forest-crossbill',
    activeAt: 'day',
    sound: 'bird-crossbill',
    title: { 'zh-hant': '交嘴雀', 'en': 'Crossbill' },
    zone: 'forest',
    ...at('forest', -7, 5),
    heightOffset: 7,
    mode: { type: 'interval', rangeSecond: [14, 34] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 26,
    silentInRain: true,
  },
  {
    id: 'forest-woodpecker',
    activeAt: 'day',
    sound: 'bird-woodpecker',
    title: { 'zh-hant': '啄木鳥敲樹', 'en': 'Woodpecker drumming' },
    zone: 'forest',
    ...at('forest', 8, 9),
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [18, 45] },
    volume: 0.75,
    minDistance: 6,
    maxDistance: 30,
    silentInRain: true,
  },
  {
    id: 'forest-owl',
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '林中貓頭鷹', 'en': 'Owl in the woods' },
    zone: 'forest',
    ...at('forest', -6, -9),
    heightOffset: 9,
    mode: { type: 'interval', rangeSecond: [25, 60] },
    volume: 0.8,
    minDistance: 8,
    maxDistance: 32,
  },

  // ── 金葉苑：乾燥、粗糙的沙沙 ──
  ...[
    at('autumn'),
    ...createRingPositionList(getGarden('autumn').center, 5, 10),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `autumn-rustle-${index}`,
    sound: 'forest-rustle',
    title: { 'zh-hant': '落葉沙沙', 'en': 'Rustling autumn leaves' },
    zone: 'autumn',
    ...position,
    /** 擺得比針葉林低，白楊沒那麼高，聲音也該從低處來 */
    heightOffset: 5,
    mode: { type: 'loop' },
    volume: 0.42,
    minDistance: 5,
    maxDistance: 20,
  })),
  {
    /**
     * 落葉堆裡的蟲
     *
     * 這座木座原本一天二十四小時都只有同一片沙沙聲，
     * 日夜之間毫無差別。厚厚的落葉層本來就是蟲最愛躲的地方，
     * 入夜讓它們接手，同一座箱庭才有兩副面孔
     */
    id: 'autumn-night-cricket',
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '落葉間的蟲', 'en': 'Crickets in the leaf litter' },
    zone: 'autumn',
    ...at('autumn', -6, 5),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.36,
    minDistance: 3,
    maxDistance: 18,
    silentInRain: true,
  },

  // ── 雪稜丘：稀薄而遠的嘯風 ──
  ...[
    at('alpine', 0, 0),
    at('alpine', -8, -8),
    at('alpine', 8, 8),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `alpine-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '山稜的風', 'en': 'Wind along the ridge' },
    zone: 'alpine',
    ...position,
    heightOffset: 9,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 8,
    maxDistance: 30,
  })),
  {
    id: 'alpine-snowcock',
    activeAt: 'day',
    sound: 'alpine-snowcock',
    title: { 'zh-hant': '雪雞', 'en': 'Snowcock' },
    zone: 'alpine',
    ...at('alpine', -11, 6),
    heightOffset: 2,
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.7,
    minDistance: 6,
    maxDistance: 28,
  },
  {
    id: 'alpine-pika',
    activeAt: 'day',
    sound: 'beast-pika',
    title: { 'zh-hant': '鼠兔', 'en': 'Pika' },
    zone: 'alpine',
    ...at('alpine', 10, -10),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [14, 34] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 22,
  },
  {
    /**
     * 稜線上的狼
     *
     * 雪雞與鼠兔都是白天的動物，天一黑這座木座就只剩下風。
     * 一聲拖得很長的狼嚎是雪線之上唯一該有的夜聲。
     *
     * 間隔給到兩分半到六分：這種聲音的重量全在稀有。
     * 每分鐘都來一次就成了背景音，久久一次才會讓人停下腳步。
     *
     * 範圍三十八格，是全庭僅次於鐘樓的第二遠——
     * 狼本來就該是「從很遠的地方傳過來」的那種聲音
     */
    id: 'alpine-wolf',
    activeAt: 'night',
    sound: 'beast-wolf',
    title: { 'zh-hant': '稜線上的狼嚎', 'en': 'Wolf on the ridge' },
    zone: 'alpine',
    ...at('alpine', -12, -12),
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [150, 360] },
    volume: 0.8,
    minDistance: 10,
    maxDistance: 38,
  },
  // ── 遣水：沒有縫的白噪 ──
  {
    id: 'river-waterfall',
    sound: 'waterfall',
    title: { 'zh-hant': '瀑布', 'en': 'Waterfall' },
    zone: 'river',
    ...WATERFALL_POINT,
    heightOffset: 4,
    mode: { type: 'loop' },
    volume: 1,
    minDistance: 4,
    maxDistance: 30,
  },
  ...[
    at('river', 0, -10),
    at('river', 3, -3),
    at('river', 0, 5),
    at('river', -3, 12),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `river-flow-${index}`,
    sound: 'river-flow',
    title: { 'zh-hant': '水道流水', 'en': 'Flowing water' },
    zone: 'river',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 4,
    maxDistance: 18,
  })),
  {
    id: 'river-moorhen',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '紅冠水雞', 'en': 'Moorhen' },
    zone: 'river',
    ...at('river', 8, 10),
    heightOffset: 2,
    mode: { type: 'interval', rangeSecond: [16, 38] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 22,
  },

  // ── 潮汐磯：有呼吸週期的水 ──
  ...[
    at('coast', -10, 5),
    at('coast', -5, 4),
    at('coast', 0, 6),
    at('coast', 5, 4),
    at('coast', 10, 6),
    at('coast', 13, 9),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `coast-shore-${index}`,
    sound: 'ocean-shore',
    title: { 'zh-hant': '拍岸浪聲', 'en': 'Waves on the shore' },
    zone: 'coast',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 22,
  })),
  ...[
    at('coast', -7, 13),
    at('coast', 7, 13),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `coast-ocean-${index}`,
    sound: 'ocean-wave',
    title: { 'zh-hant': '外海濤聲', 'en': 'Open sea' },
    zone: 'coast',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 6,
    maxDistance: 24,
  })),
  {
    id: 'coast-gull',
    activeAt: 'day',
    sound: 'ocean-gull',
    title: { 'zh-hant': '海鷗', 'en': 'Seagulls' },
    zone: 'coast',
    ...at('coast', -4, -8),
    heightOffset: 9,
    /**
     * 在頭頂上繞圈
     *
     * 海鷗是全場最該動的一個：牠本來就在天上盤旋，
     * 而且離地九格——聲音從斜上方繞過去，
     * 抬不抬頭都聽得出牠在轉。半分鐘一圈，慢得像在滑翔
     */
    motion: { type: 'orbit', radius: 10, periodSecond: 34, riseHeight: 3 },
    mode: { type: 'interval', rangeSecond: [12, 30] },
    volume: 0.7,
    minDistance: 6,
    maxDistance: 28,
  },
  {
    /** 海豚壓在水槽最深處，得走到欄杆邊探頭才聽得到 */
    id: 'coast-dolphin',
    sound: 'ocean-dolphin',
    title: { 'zh-hant': '海豚', 'en': 'Dolphins' },
    zone: 'coast',
    ...at('coast', 0, 14),
    heightOffset: 0,
    /**
     * 在水槽裡繞來繞去
     *
     * 半徑要壓得比別的音源小：牠只聽得到十二格，
     * 而兩個軸同時走到底時對角線還會再拉一點四倍——
     * 給三格才不會游出水槽、跑到甲板上去叫
     */
    motion: { type: 'wander', radius: 3, periodSecond: 44 },
    mode: { type: 'interval', rangeSecond: [16, 40] },
    volume: 0.9,
    minDistance: 2,
    maxDistance: 12,
  },

  // ── 蛙聲澤：低頻、斷續、此起彼落 ──
  ...[
    at('swamp', -8, -6),
    at('swamp', 9, 7),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-frog-${index}`,
    sound: 'swamp-frog',
    title: { 'zh-hant': '蛙鳴合唱', 'en': 'Frog chorus' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 6,
    maxDistance: 26,
  })),
  {
    id: 'swamp-toad',
    sound: 'frog-toad',
    title: { 'zh-hant': '蟾蜍', 'en': 'Common toad' },
    zone: 'swamp',
    ...at('swamp', -11, 9),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 22,
  },
  {
    id: 'swamp-frog-single',
    sound: 'frog-single',
    title: { 'zh-hant': '池畔青蛙', 'en': 'Frog by the pond' },
    zone: 'swamp',
    ...at('swamp', 11, -10),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [8, 20] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 20,
  },

  // ── 市井坊：全庭唯一有意圖的聲音 ──
  {
    id: 'village-crowd',
    activeAt: 'day',
    sound: 'village-crowd',
    title: { 'zh-hant': '市集人聲', 'en': 'Market chatter' },
    zone: 'village',
    ...at('village'),
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 26,
  },
  {
    /**
     * 鐘
     *
     * 全庭傳得最遠的聲音。走在白沙上什麼都看不到的時候，
     * 遠遠一聲鐘會告訴你市井坊在哪個方向
     */
    id: 'village-bell',
    sound: 'village-bell',
    title: { 'zh-hant': '鐘樓', 'en': 'Bell tower' },
    zone: 'village',
    ...at('village', -9, 9),
    heightOffset: 8,
    mode: { type: 'interval', rangeSecond: [45, 100] },
    volume: 0.85,
    minDistance: 10,
    maxDistance: 40,
  },
  {
    /** 灶上的火，走到攤子旁邊才聽得到。收攤了火自然也就熄了 */
    id: 'village-hearth',
    activeAt: 'day',
    sound: 'campfire',
    title: { 'zh-hant': '灶上的火', 'en': 'Cooking fire' },
    zone: 'village',
    ...at('village', 5, 4),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 2,
    maxDistance: 12,
  },
  {
    /**
     * 食肆
     *
     * 這個音檔原本掛在石廊跡上叫「石廳迴響」，但它其實是一屋子的人聲，
     * 擺在沒有屋頂的廢墟上聽起來像隔壁在辦桌。
     * 挪到市井坊當一間店，範圍壓到十二格：
     * 走過門口才聽得到裡面在吃飯，那是市集該有的層次
     */
    id: 'village-eatery',
    activeAt: 'day',
    sound: 'ruins-hall',
    title: { 'zh-hant': '食肆人聲', 'en': 'Chatter from the eatery' },
    zone: 'village',
    ...at('village', -4, -5),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 12,
  },
  {
    /**
     * 收攤之後
     *
     * 人聲與灶火入夜都退場，這座木座本來會只剩一口鐘。
     * 補一片牆角的蟲聲：市集散了，地方還在
     */
    id: 'village-night-cricket',
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '牆角的蟲', 'en': 'Crickets by the wall' },
    zone: 'village',
    ...at('village', 7, -6),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  },

  // ── 岩響窟：稀疏的瞬態，拖著長長的殘響 ──
  {
    id: 'cave-drip',
    sound: 'cave-drip',
    title: { 'zh-hant': '洞頂滴水', 'en': 'Dripping from the ceiling' },
    zone: 'cave',
    x: CAVE_TUNNEL.x,
    z: CAVE_TUNNEL.z,
    y: CAVE_TUNNEL.y,
    mode: { type: 'loop' },
    volume: 0.8,
    minDistance: 3,
    maxDistance: 20,
  },
  {
    id: 'cave-lake',
    sound: 'cave-water',
    title: { 'zh-hant': '地底湖', 'en': 'Underground lake' },
    zone: 'cave',
    x: CAVE_CHAMBER.x,
    z: CAVE_CHAMBER.z,
    y: CAVE_CHAMBER.y,
    mode: { type: 'loop' },
    volume: 0.8,
    minDistance: 4,
    maxDistance: 24,
  },
  {
    id: 'cave-mouth-wind',
    sound: 'alpine-wind',
    title: { 'zh-hant': '洞口風聲', 'en': 'Wind at the cave mouth' },
    zone: 'cave',
    x: CAVE_MOUTH.x,
    z: CAVE_MOUTH.z,
    y: CAVE_MOUTH.y,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 16,
  },

  // ── 爐火壇：一團持續的低頻劈啪 ──
  {
    id: 'campfire-fire',
    sound: 'campfire',
    title: { 'zh-hant': '營火劈啪', 'en': 'Crackling campfire' },
    zone: 'campfire',
    ...at('campfire'),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.9,
    minDistance: 2,
    maxDistance: 20,
  },

  // ── 石廊跡：聲音進去要繞好幾圈才出得來 ──
  {
    /**
     * 穿堂風
     *
     * 這座木座原本掛的是 ruins-hall，但那個音檔其實是一屋子的人聲，
     * 擺在一座沒有屋頂的廢墟上聽起來像隔壁在辦桌。
     * 它已經改調去市井坊當食肆，那裡才是它該在的地方。
     *
     * 廢墟該有的聲音是「沒有人」：風穿過斷掉的廊柱，
     * 用雪稜那道嘯風壓低音量鋪底，空曠感就出來了
     */
    id: 'ruins-wind',
    sound: 'alpine-wind',
    title: { 'zh-hant': '廊間穿堂風', 'en': 'Wind through the colonnade' },
    zone: 'ruins',
    ...at('ruins'),
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 4,
    maxDistance: 22,
  },
  {
    /**
     * 石縫滲水
     *
     * 廢墟的另一半是水。石頭縫裡滲下來的水滴在空廳裡拖著長長的殘響，
     * 稀稀落落一聲一聲——那正是「這裡很久沒有人了」的聲音
     */
    id: 'ruins-seep',
    sound: 'cave-drip',
    title: { 'zh-hant': '石縫滲水', 'en': 'Water seeping through the stone' },
    zone: 'ruins',
    ...at('ruins', -5, 4),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 16,
  },
  {
    /** 塌了一半的樑上住著一隻鴞，入夜才叫，替這座廢墟收尾 */
    id: 'ruins-owl',
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '棲在斷樑的鴞', 'en': 'Owl on the broken beam' },
    zone: 'ruins',
    ...at('ruins', 5, -5),
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [26, 62] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 24,
  },

  // ── 草苑：開闊而柔，沒有東西反射它 ──
  ...[
    at('meadow', -3, -3),
    at('meadow', 4, 4),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `meadow-wind-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '草原的風', 'en': 'Wind over the meadow' },
    zone: 'meadow',
    ...position,
    heightOffset: 5,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 6,
    maxDistance: 26,
  })),
  {
    /**
     * 日頭下的草蟲
     *
     * 白天的草叢是蚱蜢那種乾而短的摩擦聲，稀稀落落。
     * 真正成片的蟲鳴要等到天黑，見下面那一組
     */
    id: 'meadow-insect',
    activeAt: 'day',
    sound: 'meadow-insect',
    title: { 'zh-hant': '日頭下的草蟲', 'en': 'Grasshoppers in the sun' },
    zone: 'meadow',
    ...at('meadow', 3, -4),
    heightOffset: 1,
    /** 草上的蟲，飄得很淺，只是讓那片嗡嗡聲不要釘死在一個點 */
    motion: { type: 'wander', radius: 4, periodSecond: 34 },
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: 3,
    maxDistance: 14,
    silentInRain: true,
  },
  {
    /**
     * 入夜的草苑
     *
     * 一片草地最熱鬧的時候是晚上。原本這座木座天一黑就只剩風，
     * 那是反過來的：蟲類多半入夜才叫，草原的夜該是滿滿一片蟋蟀。
     *
     * 音量給得比白天的草蟲高，範圍也拉寬——
     * 白天是零星幾聲，夜裡是整片地一起響
     */
    id: 'meadow-night-cricket',
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '草間的蟲聲', 'en': 'Crickets across the meadow' },
    zone: 'meadow',
    ...at('meadow', -4, 3),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.42,
    minDistance: 4,
    maxDistance: 22,
    silentInRain: true,
  },

  // ── 牧野：位置一直在動的聲音 ──
  {
    id: 'pasture-sheep',
    activeAt: 'day',
    sound: 'village-sheep',
    title: { 'zh-hant': '牧場羊群', 'en': 'Sheep in the pasture' },
    zone: 'pasture',
    ...at('pasture'),
    heightOffset: 1,
    /**
     * 羊群自己會走
     *
     * 柵欄裡那幾隻羊本來就在慢慢挪位置，聲音卻釘在牧地正中央——
     * 站在欄邊聽久了會發現叫聲永遠從同一個點來。
     * 走得很慢，一分鐘才換完一趟，那才是吃草的速度
     */
    motion: { type: 'wander', radius: 6, periodSecond: 62 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 24,
  },

  {
    /**
     * 入夜的牧野
     *
     * 羊群白天叫、夜裡睡，這座木座若只有羊就會在天黑後整個啞掉。
     * 補一片草間的蟲聲：同一塊地，白天是牲口、夜裡是蟲，
     * 聲音換了，地方還是那個地方
     */
    id: 'pasture-night-insect',
    sound: 'insect-cricket',
    title: { 'zh-hant': '夜草間的蟲', 'en': 'Crickets in the night grass' },
    zone: 'pasture',
    ...at('pasture', 6, -5),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 3,
    maxDistance: 16,
    activeAt: 'night',
    silentInRain: true,
  },

  // ── 蜂巢圃：一整團密集的中頻嗡鳴 ──
  {
    id: 'apiary-bee',
    activeAt: 'day',
    sound: 'bee',
    title: { 'zh-hant': '蜂箱嗡嗡', 'en': 'Buzzing beehive' },
    zone: 'apiary',
    ...at('apiary'),
    heightOffset: 2,
    /**
     * 繞著蜂箱打轉
     *
     * 圈子小、轉得快，而且是持續的嗡鳴——
     * 站在蜂箱旁邊時，那個聲音會實實在在地從左耳繞到右耳。
     * 這是整片音景裡最容易察覺「聲音在動」的一個
     */
    motion: { type: 'orbit', radius: 3.5, periodSecond: 12, riseHeight: 1 },
    mode: { type: 'loop' },
    volume: 0.7,
    minDistance: 3,
    maxDistance: 18,
    silentInRain: true,
  },

  {
    /** 蜂群入夜就歇了，換灌叢裡的螽斯接手同一段嗡嗡的頻段 */
    id: 'apiary-night-cricket',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '蜂箱旁的螽斯', 'en': 'Bush cricket by the hives' },
    zone: 'apiary',
    ...at('apiary', -5, 4),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.38,
    minDistance: 3,
    maxDistance: 16,
    activeAt: 'night',
    silentInRain: true,
  },

  // ── 水鏡池：靜水面上零星的點 ──
  {
    id: 'pond-frog',
    sound: 'frog-single',
    title: { 'zh-hant': '池畔蛙鳴', 'en': 'Pondside frog' },
    zone: 'pond',
    ...at('pond'),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [6, 18] },
    volume: 0.65,
    minDistance: 4,
    maxDistance: 20,
  },
  {
    id: 'pond-moorhen',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '水鳥', 'en': 'Moorhen' },
    zone: 'pond',
    ...at('pond', 5, -4),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 22,
    silentInRain: true,
  },
  {
    id: 'pond-cricket',
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'pond',
    ...at('pond', -5, 5),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.35,
    minDistance: 3,
    maxDistance: 14,
    silentInRain: true,
  },

  // ── 聽雨亭：密集而柔軟 ──
  /**
   * 雨打在葉子上
   *
   * 雨聲是種在這裡的，不是天氣系統給的。
   * 那邊只管看得到的那一半——雨絲、陰天、地濕（見 use-weather 開頭）。
   *
   * 一圈而不是一顆，理由與松籟林那圈風相同：
   * 雨落的是整片樹冠，不是林子裡的某一個點。
   * 走在亭子四周時前後左右都有雨，方向感才出得來。
   *
   * 這座沒有屋頂，走進去就是淋在身上，
   * 用的是雨直接打在葉子上那段——亮而細碎。
   * 隔壁雨聽堂是隔著屋瓦聽的那段，兩座擺在一起才成為對照
   */
  ...[
    at('rainvale'),
    ...createRingPositionList(getGarden('rainvale').center, 4, 6),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `rainvale-rain-${index}`,
    sound: 'rain-foliage',
    title: { 'zh-hant': '雨打樹葉', 'en': 'Rain on the leaves' },
    zone: 'rainvale',
    ...position,
    /** 聲音要從樹冠那一層落下來，不是從腳邊 */
    heightOffset: 6,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 18,
  })),
  {
    /**
     * 遠雷
     *
     * 全庭唯一會打雷的地方。雷聲原本掛在天氣系統上，
     * 那表示雨聽堂也跟著轟隆——一間坐著聽雨的屋子不需要那個。
     * 打雷是這座箱庭獨有的事，所以種在這裡。
     *
     * mode 是 trigger：它不自己響，等閃電來叫。
     * 閃光先到、聲音隔零點四到三點四秒才傳來，
     * 兩者共用同一個「遠近」的隨機值，對得起來才像真的雷。
     * 若改成自己跑計時器，閃電與雷聲會各響各的。
     *
     * 擺在天上二十格，範圍給到全庭第二遠——
     * 雷本來就是從很高、很遠的地方壓下來的聲音
     */
    id: 'rainvale-thunder',
    sound: 'thunder',
    title: { 'zh-hant': '遠雷', 'en': 'Distant thunder' },
    zone: 'rainvale',
    ...at('rainvale'),
    /** 擺在天上，雷是從頭頂很高的地方壓下來的 */
    heightOffset: 20,
    mode: { type: 'trigger' },
    /** 實際音量由閃電依遠近決定，這裡只是預設值 */
    volume: 0.85,
    minDistance: 10,
    maxDistance: 38,
  },
  {
    id: 'rainvale-toad',
    sound: 'frog-toad',
    title: { 'zh-hant': '雨中的蟾蜍', 'en': 'Toad in the rain' },
    zone: 'rainvale',
    ...at('rainvale', 2, -5),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [14, 34] },
    volume: 0.6,
    minDistance: 3,
    maxDistance: 18,
  },

  /**
   * ── 蟲聲叢：高頻、顆粒感，成片鋪開 ──
   *
   * 這座木座的日夜原本是反的：白天兩顆迴圈鋪成一片密實的合唱，
   * 夜裡卻只剩兩顆間隔十幾秒才響一次的零星叫聲——
   * 一座叫「蟲聲叢」的箱庭在蟲最該叫的時候是全庭最安靜的。
   *
   * 現在夜裡有兩顆迴圈當底、兩聲獨奏點綴，白天則收成稀疏的日行蟲。
   * 走進來的人在夜裡會被整片蟲聲包住，那才是這座箱庭的名字
   */
  ...[
    at('insect', -3, 3),
    at('insect', 4, -2),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `insect-day-chorus-${index}`,
    sound: 'meadow-insect',
    activeAt: 'day',
    title: { 'zh-hant': '日行的草蟲', 'en': 'Daytime insects' },
    zone: 'insect',
    ...position,
    heightOffset: 1,
    /** 白天是稀疏的背景，讓位給夜裡那一片 */
    volume: 0.26,
    mode: { type: 'loop' },
    minDistance: 4,
    maxDistance: 18,
    silentInRain: true,
  })),
  ...[
    { position: at('insect', -3, 3), sound: 'insect-cricket' },
    { position: at('insect', 4, -2), sound: 'insect-bush-cricket' },
  ].map(({ position, sound }, index): SoundEmitterDefinition => ({
    id: `insect-night-chorus-${index}`,
    sound,
    activeAt: 'night',
    title: { 'zh-hant': '入夜的合唱', 'en': 'Chorus after dark' },
    zone: 'insect',
    ...position,
    heightOffset: 1,
    /** 兩顆分別是蟋蟀與螽斯，頻段錯開才不會糊成一團嗡嗡 */
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 4,
    maxDistance: 22,
    silentInRain: true,
  })),
  {
    /** 底層之上的獨奏，讓那片合唱有前後景 */
    id: 'insect-cricket',
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '近處的蟋蟀', 'en': 'Cricket nearby' },
    zone: 'insect',
    ...at('insect', -5, -4),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [12, 30] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 20,
    silentInRain: true,
  },
  {
    id: 'insect-bush-cricket',
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '灌叢螽斯', 'en': 'Bush cricket' },
    zone: 'insect',
    ...at('insect', 5, 5),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [14, 32] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 20,
    silentInRain: true,
  },

  // ── 雨聽堂：從屋子裡聽外面的雨 ──
  /**
   * 打在屋瓦上的雨
   *
   * 這座箱庭的雨聲同樣是種在這裡的。天氣系統那道全域雨底已經拿掉，
   * 理由見 use-weather 開頭：一道共用的雨聲會把兩座雨區聽成同一座。
   *
   * 用的不是聽雨亭那段葉子雨，而是在屋頂底下錄的那一段：
   * 四千赫以上低十分貝，細碎的高頻讓那層頂擋在外面，
   * 剩下中頻的悶響。同一場雨，隔著一層東西聽是另一回事——
   * 這座箱庭要的就是那個「另一回事」。
   *
   * 一圈而不是一顆。屋瓦是頭頂上一整片，
   * 只擺一顆的話雨會縮成天花板上的一個點，
   * 人一走動就發現聲音黏在某個角落
   */
  ...[
    at('rainhall'),
    ...createRingPositionList(getGarden('rainhall').center, 4, 4),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `rainhall-roof-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '打在屋瓦上的雨', 'en': 'Rain on the roof' },
    zone: 'rainhall',
    ...position,
    /** 屋脊的高度，雨要從頭頂上那層下來 */
    heightOffset: 7,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 5,
    maxDistance: 15,
  })),
  ...[
    at('rainhall', -4, 4),
    at('rainhall', 4, 4),
  ].map((position, index): SoundEmitterDefinition => ({
    /**
     * 順著出簷落下來的水
     *
     * 擺在滴水線上、與眼睛差不多高，範圍壓到十二格：
     * 坐在開口前才聽得到那一排水滴打在卵石上
     */
    id: `rainhall-eave-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '簷下滴水', 'en': 'Dripping from the eaves' },
    zone: 'rainhall',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 2,
    maxDistance: 12,
  })),
  {
    /** 手水缽接滿了水，多的那些溢出來，斷斷續續 */
    id: 'rainhall-basin',
    sound: 'river-flow',
    title: { 'zh-hant': '缽緣溢水', 'en': 'Water spilling from the basin' },
    zone: 'rainhall',
    ...at('rainhall', 6, 3),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: 2,
    maxDistance: 10,
  },
  {
    /**
     * 雨裡的蟾蜍
     *
     * 下雨天最活躍的就是牠。一天到晚都在，
     * 因為這座箱庭的雨從來沒停過
     */
    id: 'rainhall-toad',
    sound: 'frog-toad',
    title: { 'zh-hant': '雨中的蟾蜍', 'en': 'Toad in the rain' },
    zone: 'rainhall',
    ...at('rainhall', -6, -3),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [16, 40] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 18,
  },

  // ── 鳴禽庭：不摻風聲水聲的純旋律 ──
  {
    id: 'songbird-blackbird',
    activeAt: 'day',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '烏鶇鳴唱', 'en': 'Blackbird song' },
    zone: 'songbird',
    ...at('songbird', -4, -3),
    heightOffset: 5,
    /**
     * 在樹梢之間換位置
     *
     * 鳥不會站在同一根枝子上唱一整天。牠叫的間隔是七到十八秒，
     * 而飄一趟要四十秒——所以每次開口的方位都不一樣，
     * 聽起來就是「牠剛剛換了一棵樹」
     */
    motion: { type: 'wander', radius: 7, periodSecond: 40, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [7, 18] },
    volume: 0.8,
    minDistance: 4,
    maxDistance: 24,
    silentInRain: true,
  },
  {
    id: 'songbird-crossbill',
    activeAt: 'day',
    sound: 'bird-crossbill',
    title: { 'zh-hant': '交嘴雀', 'en': 'Crossbill' },
    zone: 'songbird',
    ...at('songbird', 4, -4),
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [9, 24] },
    volume: 0.75,
    minDistance: 4,
    maxDistance: 24,
    silentInRain: true,
  },
  {
    /** 飲水盤上的水鳥，偶爾一聲，替兩隻鳴禽留出空白 */
    id: 'songbird-moorhen',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '飲水的水鳥', 'en': 'Bird at the basin' },
    zone: 'songbird',
    ...at('songbird', 0, 1),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [20, 46] },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  },

  {
    /**
     * 夜裡的鳥架
     *
     * 三隻鳴禽日落就不唱了。同一根架子上換一隻夜行的鳥，
     * 一整座箱庭的旋律於是從清亮的短句變成一聲拖得很長的低音
     */
    id: 'songbird-night-owl',
    sound: 'bird-owl',
    title: { 'zh-hant': '架上的夜梟', 'en': 'Owl on the perch' },
    zone: 'songbird',
    ...at('songbird', 0, -5),
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 24,
    activeAt: 'night',
  },

  // ── 蟬時雨：一整片沒有縫的高頻 ──
  /**
   * 蟬要用一整圈鋪，而且要在頭頂
   *
   * 蟬時雨的關鍵是「聽不出有幾隻，也聽不出從哪裡來」。
   * 一顆音源做不到這件事——單一點的聲音一定有方向，
   * 轉個頭就聽得出它在左邊還是右邊，那就變成「一隻蟬」了。
   *
   * 所以圍一圈六顆、全部掛在樹冠的高度、範圍互相重疊：
   * 站在樹下時六顆同時進耳朵，方向互相抵消，
   * 剩下的就是一片從頭頂壓下來的聲音
   */
  ...createRingPositionList(getGarden('cicada').center, WIND_RING_COUNT, 5)
    .map((position, index): SoundEmitterDefinition => ({
      /**
       * 真的是蟬
       *
       * 這裡曾經借用灌叢螽斯的音檔頂替，理由是「同樣是連續的高頻摩擦音」。
       * 那個推論是錯的：螽斯的顆粒是一顆一顆數得出來的，
       * 蟬是一面糊成一片的牆，兩者在耳朵裡差得很遠。
       *
       * 換成蟬的合唱之後，那道牆才真的立起來
       */
      id: `cicada-chorus-${index}`,
      activeAt: 'day',
      sound: 'insect-cicada',
      title: { 'zh-hant': '樹冠上的蟬', 'en': 'Cicadas in the canopy' },
      zone: 'cicada',
      ...position,
      /** 掛在樹冠裡。蟬是抱著樹幹上半段叫的，聲音必須從上方來 */
      heightOffset: 7,
      mode: { type: 'loop' },
      /**
       * 六顆一起開到這麼大是刻意的
       *
       * 蟬時雨的字面意思就是「蟬聲像下雨」——它不是背景，是主角，
       * 大到蓋掉別的東西才對。這個數字曾經是 0.62，
       * 那是照著它頂替的那支螽斯抄來的，而螽斯本來就該是背景
       */
      volume: 0.85,
      minDistance: 4,
      maxDistance: 18,
      /** 下雨時蟬全部停口，那是夏天最明顯的一種安靜 */
      silentInRain: true,
    })),
  {
    /**
     * 一隻特別近的
     *
     * 六顆合唱是一片沒有縫的底，聽久了會變成白噪。
     * 加一隻位置會動、而且比別人近的，整片聲音才有前景與背景之分——
     * 它飛過去的時候，你會下意識抬頭找
     */
    id: 'cicada-near',
    activeAt: 'day',
    sound: 'insect-cicada',
    title: { 'zh-hant': '近處的一隻', 'en': 'One close by' },
    zone: 'cicada',
    ...at('cicada', 2, -1),
    heightOffset: 5,
    motion: { type: 'wander', radius: 4, periodSecond: 52, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.5,
    minDistance: 2,
    maxDistance: 12,
    silentInRain: true,
  },
  {
    /**
     * 夜裡換成蟋蟀
     *
     * 蟬是日行的，太陽下山就整片停掉。若什麼都不留，
     * 這座箱庭到了晚上會變成一個沒有聲音的洞——
     * 而它旁邊沒有別的箱庭可以借聲音。
     * 換一種蟲接手，同一棵樹底下於是有兩種夏天
     */
    id: 'cicada-night',
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '入夜的蟋蟀', 'en': 'Crickets after dark' },
    zone: 'cicada',
    ...at('cicada', 0, 0),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  },

  // ── 地獄谷：從腳底下上來的低頻 ──
  /**
   * 熔岩要從低處來，而且要圍一圈
   *
   * 這一座與別座相反：聲音的來源在腳下而不是前方或頭頂。
   * heightOffset 全部給零甚至更低，走到欄杆邊往下看的時候，
   * 耳朵與眼睛才指著同一個地方。
   *
   * 圍一圈的理由與蟬時雨相同，但目的相反：蟬是要抹掉方向感，
   * 這裡是要讓人繞著池子走一圈時，聲音始終在同一側——
   * 那一池就是聲音的形狀
   */
  ...createRingPositionList(getGarden('jigoku').center, 5, 3)
    .map((position, index): SoundEmitterDefinition => ({
      /**
       * 熔岩有自己的音檔，不再借用別的
       *
       * 這裡換過兩次。最早擺的是地底湖，理由是「水與熔岩的差別在耳朵裡只有速度」——
       * 那個推論是錯的。水聲最好認的特徵是流動的嘶嘶與濺落的點狀高頻，
       * 而熔岩根本不會濺，它是黏的。放下去的結果是一條發光的小溪。
       *
       * 第二次改用柴火。方向對了——真正的熔岩湖錄音最接近的確實是火，
       * 低頻的悶響加上不規則的爆裂——但柴火終究是柴火：
       * 它的爆裂是乾的、短的、帶著木頭的脆響，
       * 五顆疊起來只會聽成「五盆營火圍成一圈」，而不是一整條在燒的地縫。
       *
       * 現在用的是專為熔岩做的循環，來源見 sounds/CREDITS.md。
       * 它的底是黏稠的滾沸而不是乾燒，疊起來才是一池而不是一堆火
       */
      id: `jigoku-churn-${index}`,
      sound: 'jigoku-lava',
      title: { 'zh-hant': '裂縫裡的熔岩', 'en': 'Lava in the fissure' },
      zone: 'jigoku',
      ...position,
      /** 貼著裂縫，聲音要從低處來 */
      heightOffset: 0,
      mode: { type: 'loop' },
      volume: 0.55,
      minDistance: 3,
      maxDistance: 18,
    })),
  {
    /**
     * 地底下的悶響
     *
     * 用的是雷。但擺在地面以下、音量壓到一半、間隔拉到兩三分鐘，
     * 同一段聲音就從「天上打雷」變成「地下有東西在動」——
     * 方位是這裡唯一的差別，雷從上面來，這個從下面來。
     *
     * 間隔給得很長是刻意的：這種聲音久久一次才嚇人，
     * 每半分鐘來一次就成了節拍器
     */
    id: 'jigoku-rumble',
    sound: 'thunder',
    title: { 'zh-hant': '地底的悶響', 'en': 'A rumble from below' },
    zone: 'jigoku',
    ...at('jigoku'),
    /** 埋在地面下，聲音悶在土裡才對 */
    heightOffset: -3,
    mode: { type: 'interval', rangeSecond: [110, 260] },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 26,
  },

  // ── 雪聽庭：風把別的聲音都吹走了 ──
  /**
   * 這一座的重點是「只剩一種聲音」
   *
   * 其他二十一座都在收集聲音，這一座在清空它們。
   * 暴風雪是一種會把別的東西全部蓋掉的聲音——
   * 所以這裡不種鳥、不種蟲、不種水，一樣都不留。
   *
   * 但也不能只有一顆音源。單獨一個點的風會被定位出來，
   * 一旦聽得出「風在那邊」，被包住的感覺就沒了。
   * 圍一圈六顆、全部同音量、範圍互相重疊，
   * 方向互相抵消之後剩下的才是「四面八方都是風」。
   *
   * 整圈的腳印必須收在十四格以內
   *
   * 最近的鄰居是水鏡池，中心相距二十二格半、木座邊緣只有十五格半。
   * 音源在半徑三的環上、maxDistance 十一，加起來十四——
   * 剛好在踏上水鏡池的木座之前就斷乾淨。
   *
   * 環的半徑從六收到三，是為了在腳印變小的同時保住那份包覆感：
   * 環愈大，站在木座邊緣時對面那幾顆就愈遠、愈聽不到，
   * 剩下近側那兩三顆一響，風就又有方向了。
   * 收緊之後六顆全部落在聽得到的範圍裡，抵消才成立
   */
  ...createRingPositionList(getGarden('blizzard').center, WIND_RING_COUNT, 3)
    .map((position, index): SoundEmitterDefinition => ({
      id: `blizzard-roar-${index}`,
      sound: 'blizzard-roar',
      title: { 'zh-hant': '壓下來的風', 'en': 'The wind bearing down' },
      zone: 'blizzard',
      ...position,
      /** 貼著地面，暴風雪是從地表捲起來的，不是從天上落下來 */
      heightOffset: 2,
      mode: { type: 'loop' },
      volume: 0.8,
      minDistance: 3,
      maxDistance: 11,
    })),
  {
    /**
     * 打旋的陣風
     *
     * 底層那一圈是不會變的牆，聽久了會變成白噪。
     * 這一顆位置會飄、而且時有時無，整片風才有了前後景——
     * 它掃過來的時候，你會覺得剛剛那一陣比較大
     */
    id: 'blizzard-gust',
    sound: 'blizzard-gust',
    title: { 'zh-hant': '捲過去的雪', 'en': 'Snow whipping past' },
    zone: 'blizzard',
    ...at('blizzard', 0, 0),
    heightOffset: 4,
    /** 飄的半徑與可聽距離加起來同樣收在十四格內，理由見上面那一圈 */
    motion: { type: 'wander', radius: 5, periodSecond: 23, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [6, 18] },
    volume: 0.7,
    minDistance: 3,
    maxDistance: 9,
  },
]

/** 已解析高度的音源 */
export interface ResolvedEmitter extends SoundEmitterDefinition {
  y: number;
}

/**
 * 滿音量半徑最多佔可聽距離的幾成
 *
 * 被鄰居夾住而收窄的音源要照比例把 minDistance 一起收，
 * 不然「滿音量的圈」會追過「聽得到的圈」，衰減公式的分母歸零
 */
const MIN_DISTANCE_RATIO = 0.6

/**
 * 這個音源最遠能傳到多遠，才不會被隔壁的箱庭聽見
 *
 * 一座箱庭的聲音只屬於那一座。站在雨聽堂聽得到牧野的羊，
 * 兩座箱庭就從「各有各的世界」退回「同一片草原上的兩個裝置」——
 * 而整個禪庭的前提是每一座各自成立。
 *
 * 這件事不適合逐筆調。一百多顆音源、二十二座箱庭，
 * 手動對過一輪之後只要有人搬動一座箱庭或改一個 maxDistance，
 * 越界就會悄悄長回來，而且要走到那裡站著聽才發現得了。
 * 所以把它寫成建立清單時的約束：資料裡的 maxDistance 是「希望傳多遠」，
 * 這裡把它夾到「不會吵到鄰居的最遠距離」。
 *
 * 量的是到鄰居木座邊緣的距離，不是到中心：人是站在木座上聽的。
 * 會飄的音源還要扣掉飄的半徑，因為它可能正好飄向鄰居那一側
 */
function measureNeighbourLimit(definition: SoundEmitterDefinition): number {
  const motionRadius = definition.motion && 'radius' in definition.motion
    ? (definition.motion.radius ?? 0)
    : 0

  let limit = Number.POSITIVE_INFINITY

  for (const garden of GARDEN_LIST) {
    if (garden.id === definition.zone)
      continue

    const deltaX = Math.max(0, Math.abs(definition.x - garden.center.x) - garden.halfSize)
    const deltaZ = Math.max(0, Math.abs(definition.z - garden.center.z) - garden.halfSize)
    limit = Math.min(limit, Math.hypot(deltaX, deltaZ))
  }

  return Math.max(0, limit - motionRadius)
}

/**
 * 產生音源清單
 *
 * 沒有指定高度的音源會自動貼齊地面或水面，
 * 免得音源埋進木座裡，或是沉到水槽底下
 */
export function createEmitterList(worldState: Uint8Array): ResolvedEmitter[] {
  return EMITTER_DEFINITION_LIST.map((definition) => {
    const limit = measureNeighbourLimit(definition)
    const maxDistance = Math.min(definition.maxDistance, limit)

    return {
      ...definition,
      maxDistance,
      /**
       * 滿音量的半徑不能追過可聽距離
       *
       * 線性衰減的公式是 (max − d) / (max − min)，兩者相等時分母為零。
       * 被鄰居夾得很近的音源如果不跟著收，會整顆變成沒有衰減的硬邊
       */
      minDistance: Math.min(definition.minDistance, maxDistance * MIN_DISTANCE_RATIO),
      y: definition.y ?? getWaterlineY(worldState, definition.x, definition.z) + (definition.heightOffset ?? 1),
    }
  })
}

/** 取得音檔完整路徑 */
export function getSoundUrl(sound: string): string {
  return `${SOUND_BASE}/${sound}.mp3`
}
