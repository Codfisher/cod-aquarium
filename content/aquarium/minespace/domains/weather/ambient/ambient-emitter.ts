import type { AmbientParticle } from '../../realm/realm-definition'
import type { AmbientKindSpec } from './ambient-kind-spec'
import type { AmbientFrame } from './ambient-layer'
import type { AmbientWorld } from './ambient-spot'
import { clamp } from 'remeda'
import { measureAmbientActivity } from './ambient-activity'
import { collectAmbientSpot, getAmbientReach, MAX_SPOT_COUNT } from './ambient-spot'

/**
 * 一層環境粒子「什麼時候生、生在哪裡」
 *
 * 像素方片那一路（ambient-layer，粒子系統）與體素生物那一路（ambient-critter-layer）畫法完全不同，
 * 但這兩件事是同一套：照日夜與天氣算出此刻的活躍程度與生成速度，每隔一小段時間在鏡頭四周重挑落腳點，
 * 新的一顆從落腳點附近（或鏡頭四周的空中）冒出來。集中在這裡，場景清單的欄位
 * （count、activity、weatherResponse、spawn、wind）在兩邊才是同一個意思
 */

/** 每隔幾秒重新挑落腳點：走路一秒才五六格，這個間隔看不出落差 */
const SPOT_REFRESH_INTERVAL = 0.4

const DEFAULT_SPREAD = 0.6

/** 開場多生一點：不預熱（發射點還沒對上鏡頭），改成頭幾秒加速填滿 */
const WARMUP_SECOND = 4
const WARMUP_BOOST = 2.5

/** 活躍程度低於這個就當作關著，連落腳點都不挑 */
const ACTIVE_THRESHOLD = 0.01

/** 雨雪躲起來的靈敏度：雨勢到六成就全躲了，蟲子與花粉不會在雨裡硬撐 */
const WEATHER_HIDE_RATE = 1.6

/** 這一層此刻要不要因為雨雪躲起來（零是完全躲掉、一是照常） */
function measureWeatherFactor(definition: AmbientParticle, rainRatio: number, snowRatio: number): number {
  const response = definition.weatherResponse ?? 'hide'
  if (response === 'keep')
    return 1
  if (response === 'rain')
    return rainRatio

  return 1 - Math.min(1, Math.max(rainRatio, snowRatio) * WEATHER_HIDE_RATE)
}

function pickBetween(from: number, to: number): number {
  return from + (to - from) * Math.random()
}

export interface AmbientEmitter {
  /** 此刻的風（格／秒），已乘上這一層與這一種的風速倍率；每幀由 update 寫進來 */
  windX: number;
  windZ: number;
  /** 剛挑好的出生位置，由 pickSpawnPoint 就地覆寫 */
  spawnPoint: { x: number; y: number; z: number };
  /** 每幀呼叫：更新鏡頭、風與落腳點，回傳此刻每秒該生幾顆（關著、或附近沒有地方生就是零） */
  update: (frame: AmbientFrame) => number;
  /** 幫新的一顆挑出生位置，寫進 spawnPoint */
  pickSpawnPoint: () => void;
}

export interface CreateAmbientEmitterParams {
  definition: AmbientParticle;
  spec: AmbientKindSpec;
  /** 已乘上畫質倍率的顆數 */
  count: number;
  world: AmbientWorld;
}

export function createAmbientEmitter({ definition, spec, count, world }: CreateAmbientEmitterParams): AmbientEmitter {
  const { spawn } = definition
  const meanLife = (spec.life[0] + spec.life[1]) / 2
  /** 穩定時身邊飄著 count 顆：生成速度 = count ÷ 平均壽命 */
  const peakEmitRate = count / meanLife
  const reach = getAmbientReach(spawn)
  const spread = spawn.spread ?? DEFAULT_SPREAD
  const [heightMin, heightMax] = spawn.height
  const windGain = (definition.wind ?? 1) * (spec.windGain ?? 1)

  /** 落腳點：每三個數字一組座標，高度是錨點那一面的高度（再由 pickSpawnPoint 加上 height） */
  const spotList = new Float32Array(MAX_SPOT_COUNT * 3)
  let spotCount = 0
  /** 挑落腳點只讀鏡頭的位置，每次重挑都拿這一份，不另外配置物件 */
  const camera = { x: 0, y: 0, z: 0 }

  let activeSecond = 0
  let isSpotStale = true
  let spotElapsed = 0

  const emitter: AmbientEmitter = {
    windX: 0,
    windZ: 0,
    spawnPoint: { x: 0, y: 0, z: 0 },
    update(frame) {
      const activity = measureAmbientActivity(definition.activity, frame.phaseWeight)
        * measureWeatherFactor(definition, frame.rainRatio, frame.snowRatio)
        * frame.visibleRatio

      camera.x = frame.camera.position.x
      camera.y = frame.camera.position.y
      camera.z = frame.camera.position.z
      emitter.windX = frame.windX * windGain
      emitter.windZ = frame.windZ * windGain

      if (activity <= ACTIVE_THRESHOLD) {
        /** 關著：不再生新的，已經飄著的讓它自己走完；下次醒來落腳點要重挑 */
        isSpotStale = true
        activeSecond = 0
        return 0
      }

      spotElapsed += frame.deltaSecond
      if (isSpotStale || spotElapsed >= SPOT_REFRESH_INTERVAL) {
        spotElapsed = 0
        isSpotStale = false
        spotCount = collectAmbientSpot(spawn, world, camera, spotList)
      }

      activeSecond += frame.deltaSecond
      const warmup = 1 + (WARMUP_BOOST - 1) * clamp(1 - activeSecond / WARMUP_SECOND, { min: 0, max: 1 })
      const canSpawn = spawn.anchor === 'air' || spotCount > 0
      return canSpawn ? peakEmitRate * activity * warmup : 0
    },
    pickSpawnPoint() {
      const height = pickBetween(heightMin, heightMax)
      const point = emitter.spawnPoint

      if (spawn.anchor === 'air') {
        point.x = camera.x + pickBetween(-reach, reach)
        point.y = camera.y + height
        point.z = camera.z + pickBetween(-reach, reach)
        return
      }

      const offset = Math.floor(Math.random() * spotCount) * 3
      point.x = spotList[offset]! + pickBetween(-spread, spread)
      point.y = spotList[offset + 1]! + height
      point.z = spotList[offset + 2]! + pickBetween(-spread, spread)
    },
  }
  return emitter
}
