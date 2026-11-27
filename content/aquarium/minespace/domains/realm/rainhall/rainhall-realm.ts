import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  RAINHALL_CENTER,
  RAINHALL_FLOOR_Y,
  RAINHALL_HUB_GATE_OFFSET,
  RAINHALL_PORTAL_POINT,
  RAINHALL_PUSH_RADIUS,
  RAINHALL_SLOW_RADIUS,
} from './rainhall-layout'

/**
 * 大廳那座通往雨聽深院的門
 *
 * 立在雨聽堂屋裡最深的那一格（RAINHALL_HUB_GATE_OFFSET），貼著北牆、門洞朝南：
 * 從雨裡走上石板、跨進屋簷、穿過開口前那兩個坐墊，正前方就是門。
 * 屋子三面是牆，預設的木牌位置（門旁三格）落在牆上，所以木牌改立在屋裡、門的東南一格，牌面朝南。
 * 回來時落在門南邊四格、兩個坐墊之間，面朝門；快速前往落在門前六格的滴水線上
 */
const HUB_GATE = createGardenGate({
  gardenId: 'rainhall',
  side: 'south',
  inner: RAINHALL_HUB_GATE_OFFSET,
  targetRealmId: 'rainhall',
  signFacing: 'outward',
})

export const RAINHALL_HUB_GATE = {
  ...HUB_GATE,
  portal: {
    ...HUB_GATE.portal,
    sign: { x: HUB_GATE.portal.x + 2, z: HUB_GATE.portal.z + 1, facing: 'south' as const },
  },
}

/**
 * 雨聽深院：雨聽堂的大場景
 *
 * 雨聽堂那間三面牆、南面敞開的屋子放大成一座大堂，前面一圈有頂的迴廊圍著石板中庭。
 * 雨從來沒停過，而且是滂沱的那一種；人在簷下是乾的，沿著迴廊繞一圈，
 * 一路聽著雨打屋瓦、順著出簷滴在卵石上。不打雷（雨聽堂要的是坐著聽雨的安穩）
 */
export const RAINHALL_REALM: RealmDefinition = {
  id: 'rainhall',
  title: { 'zh-hant': '雨聽深院', 'en': 'Rain Cloister' },
  description: { 'zh-hant': '雨聽堂的另一頭，迴廊圍著一院滂沱大雨', 'en': 'Beyond Rain Hall, a cloister wrapped around the downpour' },
  signCaption: { 'zh-hant': '簷下聽滂沱', 'en': 'Dry under the eaves' },
  icon: 'i-material-symbols:cottage',
  /**
   * 站在回程門南邊三格的榻榻米上，面朝南
   *
   * 大廳那一頭是往北走進門的；到了這裡是從大堂最裡面的門走出來，
   * 所以轉過身面朝南：一排坐墊、整排敞開的南面、門外的大雨與中庭就在正前方。
   * 這一處與「出生點順著穿門的方向」的慣例相反，是刻意的：大堂的門只能在最裡面
   */
  spawn: {
    x: RAINHALL_PORTAL_POINT.x,
    z: RAINHALL_PORTAL_POINT.z + 3,
    pitch: 0.06,
    yaw: YAW_MAP.south,
  },
  isLooping: false,
  hasGardens: false,
  /**
   * 雨天的霧、光與天色由天氣那一層給（雨勢滿檔，RAIN_ATMOSPHERE 整份換過去）；
   * 這裡是雨勢稍緩那幾刻露出來的底：冷灰偏藍、近，光更暗
   */
  atmosphere: {
    fog: {
      tint: { scale: [0.84, 0.88, 0.96] },
      start: { value: 4 },
      end: { value: 34 },
    },
    light: {
      lightRatio: { scale: 0.8 },
      ambientRatio: { scale: 0.92 },
    },
    cloud: {
      coverageOffset: { offset: 0.4 },
      stratus: { value: 1 },
      windSpeed: { scale: 0.6 },
    },
    groundMist: {
      chance: { value: 0 },
    },
  },
  /** 與雨聽堂同一場雨，滂沱、不停：只在九成五與滿檔之間微微起落 */
  weather: {
    rain: { min: 0.95, max: 1, periodSecond: 180 },
  },
  backdrop: {
    centerX: RAINHALL_CENTER.x,
    centerZ: RAINHALL_CENTER.z,
    /** 牆外走不到，地面是不畫的 LAKE_BED；平面墊在底下，萬一從屋頂縫隙望出去也不會是一片空 */
    floor: { surfaceY: RAINHALL_FLOOR_Y + 0.5, blockId: BlockId.GRAVEL, isEndless: true },
  },
  /** 往深院去是一陣冷灰的雨霧，夾著往下落的雨珠 */
  transition: {
    fogTint: [0.78, 0.82, 0.9],
    particleColor: [0.7, 0.76, 0.86],
    particleRise: -1,
    sound: 'rain-roof',
  },
  portalList: [
    {
      ...RAINHALL_PORTAL_POINT,
      y: RAINHALL_FLOOR_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: RAINHALL_HUB_GATE.landingSpawn,
      /** 木牌立在門東南一格的榻榻米上、牌面朝南，與大廳那一座同一個位置 */
      sign: { x: RAINHALL_PORTAL_POINT.x + 2, z: RAINHALL_PORTAL_POINT.z + 1, facing: 'south' },
    },
  ],
  boundary: {
    centerX: RAINHALL_CENTER.x,
    centerZ: RAINHALL_CENTER.z,
    medium: 'land',
    slowRadius: RAINHALL_SLOW_RADIUS,
    pushRadius: RAINHALL_PUSH_RADIUS,
  },
}
