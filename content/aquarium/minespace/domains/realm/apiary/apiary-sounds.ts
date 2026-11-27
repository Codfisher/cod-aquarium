import type { SoundEmitterDefinition } from '../../soundscape/type'
import { APIARY_CENTER, HIVE_YARD_LIST } from './apiary-layout'

/**
 * 萬花蜂台的音源
 *
 * 蜂巢圃只有兩種聲音：白天繞著蜂箱打轉的蜂群（小圈、轉得快、持續的嗡鳴），
 * 入夜換蜂箱旁灌叢裡的螽斯接手同一段頻段。這裡照搬：
 * 谷底那一大疊蜂箱三群蜂繞著轉，花台上每一組蜂箱各一群，
 * 走到哪一層都有一團嗡嗡聲在身邊繞；夜裡每一組蜂箱旁一隻螽斯。全沿用蜂巢圃的音檔與數字
 */

/** 蜂群：小圈、轉得快，站在蜂箱旁邊聽得出聲音從左耳繞到右耳 */
function createBeeEmitter(id: string, x: number, z: number, radius: number, periodSecond: number): SoundEmitterDefinition {
  return {
    id,
    activeAt: 'day',
    sound: 'bee',
    title: { 'zh-hant': '蜂箱嗡嗡', 'en': 'Buzzing beehive' },
    zone: 'apiary',
    x,
    z,
    heightOffset: 2,
    motion: { type: 'orbit', radius, periodSecond, riseHeight: 1 },
    mode: { type: 'loop' },
    volume: 0.7,
    minDistance: 3,
    maxDistance: 18,
    silentInRain: true,
  }
}

/** 螽斯：蜂群入夜就歇了，換灌叢裡的螽斯接手同一段嗡嗡的頻段 */
function createCricketEmitter(id: string, x: number, z: number): SoundEmitterDefinition {
  return {
    id,
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '蜂箱旁的螽斯', 'en': 'Bush cricket by the hives' },
    zone: 'apiary',
    x,
    z,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.38,
    minDistance: 3,
    maxDistance: 16,
    activeAt: 'night',
    silentInRain: true,
  }
}

export const APIARY_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 谷底那一大疊：中間一群繞大圈，兩頭各一群繞小圈，週期錯開，聽起來是一整團 */
  createBeeEmitter('apiary-realm-bee-main', APIARY_CENTER.x, APIARY_CENTER.z + 1, 4.5, 12),
  createBeeEmitter('apiary-realm-bee-west', APIARY_CENTER.x - 4, APIARY_CENTER.z + 1, 2.5, 9),
  createBeeEmitter('apiary-realm-bee-east', APIARY_CENTER.x + 4, APIARY_CENTER.z + 1, 2.5, 10),
  /** 花台上的每一組蜂箱 */
  ...HIVE_YARD_LIST.map((yard, index) =>
    createBeeEmitter(`apiary-realm-bee-yard-${index}`, yard.x, yard.z, 3.5, 11 + (index % 4))),
  /** 夜裡：谷底兩隻、每一組蜂箱旁一隻（與蜂巢圃一樣在蜂箱的西南幾格） */
  createCricketEmitter('apiary-realm-cricket-main-0', APIARY_CENTER.x - 5, APIARY_CENTER.z + 4),
  createCricketEmitter('apiary-realm-cricket-main-1', APIARY_CENTER.x + 6, APIARY_CENTER.z - 5),
  ...HIVE_YARD_LIST.map((yard, index) =>
    createCricketEmitter(`apiary-realm-cricket-yard-${index}`, yard.x - 3, yard.z + 3)),
]
