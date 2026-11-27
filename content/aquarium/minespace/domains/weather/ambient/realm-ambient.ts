import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { RealmId } from '../../realm/realm-definition'
import type { AmbientFrame, AmbientLayer } from './ambient-layer'
import type { AmbientWorldSource } from './ambient-world'
import { Vector3 } from '@babylonjs/core'
import { measureSection } from '../../../composables/use-performance-probe'
import { getRealm } from '../../realm/realm-list'
import { createAmbientPhaseWeight, measureAmbientPhaseWeight } from './ambient-activity'
import { createAmbientLayer } from './ambient-layer'
import { createAmbientWorld } from './ambient-world'

export type { AmbientWorldSource } from './ambient-world'

/**
 * 大場景的日夜環境粒子（蝴蝶、螢火、飛沫、冰晶…）的執行期
 *
 * 場景的設定寫在 RealmDefinition.ambientParticleList，一層一個粒子系統（見 ambient-layer）。
 * 這裡只做三件事：
 * 一、世界換了就把舊的整批拆掉、依新場景的設定重建（天氣系統整個工作階段只有一份，
 *     場景卻會換，所以不能把層綁在建立天氣的那一刻）；
 * 二、每一幀算好日夜四段的權重、風與天氣，交給每一層；
 * 三、沒有設定的場景（大廳）什麼都不建，由原本通用的空氣顆粒（air-motes）照舊負責。
 *
 * 層、系統與貼圖都只掛在這裡，換世界與整個結束都走 disposeLayerList，沒有別的觀察者要收
 */

/** 沒設定環境粒子的場景，由通用的空氣顆粒負責 */
export function hasAmbientProfile(realmId: RealmId): boolean {
  return (getRealm(realmId).ambientParticleList?.length ?? 0) > 0
}

/**
 * 風的方向與基準風速（格／秒）
 *
 * 方向與雲飄的方向相同（見 volumetric-cloud 的 WIND_DIRECTION）：
 * 雲往哪裡走、花瓣就往哪裡飄，兩邊才對得起來。風速再乘上場景自己的風速倍率
 */
const WIND_DIRECTION = new Vector3(1, 0, 0.34).normalize()
const BASE_WIND_SPEED = 1.2

export interface RealmAmbientFrame {
  camera: UniversalCamera;
  deltaSecond: number;
  /** 白晝的程度與時刻（零到一），決定清晨、白天、傍晚、夜裡的權重 */
  dayRatio: number;
  timeOfDay: number;
  /** 天色的亮度，吃光的粒子（花粉、花瓣）夜裡要跟著暗 */
  brightness: number;
  rainRatio: number;
  snowRatio: number;
  /** 洞穴、世界邊界與開關決定的整體可見程度 */
  visibleRatio: number;
  /** 場景自己的風速倍率，一是禪庭的風 */
  windScale: number;
}

export interface RealmAmbient {
  update: (frame: RealmAmbientFrame) => void;
  dispose: () => void;
}

export interface CreateRealmAmbientParams {
  scene: Scene;
  /** 畫質等級的粒子倍率，建層時才讀 */
  getParticleRatio: () => number;
  /** 世界還沒好（或正在換）時回傳 null */
  getWorldSource: () => AmbientWorldSource | null;
}

export function createRealmAmbient({
  scene,
  getParticleRatio,
  getWorldSource,
}: CreateRealmAmbientParams): RealmAmbient {
  let layerList: AmbientLayer[] = []
  let builtWorldState: Uint8Array | null = null
  let builtRealmId: RealmId | null = null
  let elapsedSecond = 0

  const phaseWeight = createAmbientPhaseWeight()
  /** 交給每一層的那一份每幀就地覆寫，鏡頭要等第一幀才拿得到，所以延後建 */
  let ambientFrame: AmbientFrame | null = null

  function disposeLayerList(): void {
    for (const layer of layerList)
      layer.dispose()
    layerList = []
  }

  function rebuild(source: AmbientWorldSource | null): void {
    disposeLayerList()
    builtWorldState = source?.worldState ?? null
    builtRealmId = source?.realmId ?? null

    const definitionList = source ? getRealm(source.realmId).ambientParticleList : undefined
    if (!source || !definitionList?.length)
      return

    const anchorKindList = definitionList.flatMap((definition) =>
      definition.spawn.fallback ? [definition.spawn.anchor, definition.spawn.fallback] : [definition.spawn.anchor])
    const world = createAmbientWorld(source, anchorKindList)
    const particleRatio = getParticleRatio()

    layerList = definitionList.map((definition) => createAmbientLayer({ scene, definition, particleRatio, world }))
  }

  return {
    update(frame) {
      measureSection('環境粒子', () => {
        const source = getWorldSource()
        if ((source?.worldState ?? null) !== builtWorldState || (source?.realmId ?? null) !== builtRealmId)
          rebuild(source)

        if (layerList.length === 0)
          return

        elapsedSecond += frame.deltaSecond
        measureAmbientPhaseWeight(frame.dayRatio, frame.timeOfDay, phaseWeight)

        /**
         * 風有陣：兩道週期不成比例的起伏疊起來，一陣緊一陣鬆。
         * 風速為零就是完全無風（場景的風速倍率給零時）
         */
        const gust = 0.75 + 0.25 * Math.sin(elapsedSecond * 0.37) + 0.12 * Math.sin(elapsedSecond * 1.3 + 1)
        const windSpeed = BASE_WIND_SPEED * frame.windScale * gust

        ambientFrame ??= {
          camera: frame.camera,
          deltaSecond: 0,
          phaseWeight,
          rainRatio: 0,
          snowRatio: 0,
          visibleRatio: 1,
          brightness: 1,
          windX: 0,
          windZ: 0,
        }
        ambientFrame.camera = frame.camera
        ambientFrame.deltaSecond = frame.deltaSecond
        ambientFrame.rainRatio = frame.rainRatio
        ambientFrame.snowRatio = frame.snowRatio
        ambientFrame.visibleRatio = frame.visibleRatio
        ambientFrame.brightness = frame.brightness
        ambientFrame.windX = WIND_DIRECTION.x * windSpeed
        ambientFrame.windZ = WIND_DIRECTION.z * windSpeed

        for (const layer of layerList)
          layer.update(ambientFrame)
      })
    },
    dispose() {
      disposeLayerList()
      builtWorldState = null
      builtRealmId = null
    },
  }
}
