import type { GardenId } from '../garden/garden-layout'
import type { SoundEmitterDefinition } from './type'
import {
  CAVE_CHAMBER,
  CAVE_MOUTH,
  CAVE_TUNNEL,
  getGarden,
  SUIKINKUTSU_POINT,
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
  // ── 枯山水：全庭最安靜的一座 ──
  {
    /**
     * 水琴窟
     *
     * 範圍刻意壓到只剩十二格：得走到石板旁邊才聽得見。
     * 整座禪庭的中心是一個幾乎沒有聲音的地方，
     * 那份安靜才是所有其他箱庭的參照點
     */
    id: 'stone-suikinkutsu',
    sound: 'cave-drip',
    title: { 'zh-hant': '水琴窟', 'en': 'Suikinkutsu' },
    zone: 'stonegarden',
    ...SUIKINKUTSU_POINT,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 2,
    maxDistance: 12,
  },

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
    /** 灶上的火，走到攤子旁邊才聽得到 */
    id: 'village-hearth',
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
    id: 'ruins-hall',
    sound: 'ruins-hall',
    title: { 'zh-hant': '石廳迴響', 'en': 'Echoing stone hall' },
    zone: 'ruins',
    ...at('ruins'),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 4,
    maxDistance: 22,
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
    id: 'meadow-insect',
    activeAt: 'day',
    sound: 'meadow-insect',
    title: { 'zh-hant': '草叢蟲鳴', 'en': 'Insects in the grass' },
    zone: 'meadow',
    ...at('meadow', 3, -4),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: 3,
    maxDistance: 14,
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
  ...[
    at('rainvale', -4, -3),
    at('rainvale', 4, 3),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `rainvale-drip-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '葉尖滴水', 'en': 'Water dripping off leaves' },
    zone: 'rainvale',
    ...position,
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 16,
  })),
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

  // ── 蟲聲叢：高頻、顆粒感，成片鋪開 ──
  ...[
    at('insect', -3, 3),
    at('insect', 4, -2),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `insect-chorus-${index}`,
    sound: 'meadow-insect',
    activeAt: 'day',
    title: { 'zh-hant': '草叢裡的合唱', 'en': 'Chorus in the grass' },
    zone: 'insect',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 4,
    maxDistance: 20,
    silentInRain: true,
  })),
  {
    id: 'insect-cricket',
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '蟋蟀', 'en': 'Cricket' },
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

  // ── 月語庭：只在黑暗中出現的聲音 ──
  {
    /**
     * 貓頭鷹
     *
     * 松籟林裡也有一隻，但那裡它是「林子中的一種鳥」；
     * 擺到這裡與蟋蟀、蟾蜍站在一起，同一段叫聲就變成「夜」的一部分。
     * 手上只有三十幾個音檔，能再生出新類別的辦法就是重新分類
     */
    id: 'nocturne-owl',
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '夜梟', 'en': 'Owl in the dark' },
    zone: 'nocturne',
    ...at('nocturne', -4, -4),
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [20, 48] },
    volume: 0.8,
    minDistance: 5,
    maxDistance: 26,
  },
  {
    id: 'nocturne-cricket',
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '夜裡的蟋蟀', 'en': 'Cricket after dark' },
    zone: 'nocturne',
    ...at('nocturne', 3, 3),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [8, 22] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 18,
  },
  {
    id: 'nocturne-toad',
    activeAt: 'night',
    sound: 'frog-toad',
    title: { 'zh-hant': '水邊的蟾蜍', 'en': 'Toad by the water' },
    zone: 'nocturne',
    ...at('nocturne', -3, 3),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [12, 30] },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 18,
  },

  {
    /**
     * 白日的月語庭
     *
     * 夜行的三種聲音天一亮就全退場了，只留一座空木座。
     * 補一道穿過草坡的風：白天的月語庭什麼都沒有，
     * 那份空正是它與夜裡的差別
     */
    id: 'nocturne-daywind',
    sound: 'meadow-wind',
    title: { 'zh-hant': '白日的空庭', 'en': 'The garden by day' },
    zone: 'nocturne',
    ...at('nocturne'),
    heightOffset: 4,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 5,
    maxDistance: 20,
    activeAt: 'day',
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

  // ── 湯屋：兩個聲音疊起來才成立的一座 ──
  {
    /**
     * 滾水
     *
     * 用的是地底湖那個音檔。它單獨聽是「洞裡的一潭水」，
     * 但一旦與柴火的劈啪疊在一起，同一段聲音就變成「正在燒開的水」——
     * 這是整套音景裡唯一靠疊加而不是靠單一音源說故事的地方
     */
    id: 'onsen-water',
    sound: 'cave-water',
    title: { 'zh-hant': '池水翻滾', 'en': 'Simmering water' },
    zone: 'onsen',
    ...at('onsen'),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.7,
    minDistance: 3,
    maxDistance: 20,
  },
  {
    id: 'onsen-fire',
    sound: 'campfire',
    title: { 'zh-hant': '池底的柴火', 'en': 'Fire beneath the pool' },
    zone: 'onsen',
    ...at('onsen', 0, 2),
    heightOffset: 0,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 2,
    maxDistance: 14,
  },
  {
    /** 屋簷滴下來的水，泡在池裡才聽得到 */
    id: 'onsen-drip',
    sound: 'cave-drip',
    title: { 'zh-hant': '簷下滴水', 'en': 'Dripping from the eaves' },
    zone: 'onsen',
    ...at('onsen', -5, -5),
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 2,
    maxDistance: 12,
  },
]

/** 已解析高度的音源 */
export interface ResolvedEmitter extends SoundEmitterDefinition {
  y: number;
}

/**
 * 產生音源清單
 *
 * 沒有指定高度的音源會自動貼齊地面或水面，
 * 免得音源埋進木座裡，或是沉到水槽底下
 */
export function createEmitterList(worldState: Uint8Array): ResolvedEmitter[] {
  return EMITTER_DEFINITION_LIST.map((definition) => ({
    ...definition,
    y: definition.y ?? getWaterlineY(worldState, definition.x, definition.z) + (definition.heightOffset ?? 1),
  }))
}

/** 取得音檔完整路徑 */
export function getSoundUrl(sound: string): string {
  return `${SOUND_BASE}/${sound}.mp3`
}
