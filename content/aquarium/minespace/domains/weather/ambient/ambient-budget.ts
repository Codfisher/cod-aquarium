import type { AmbientParticle } from '../../realm/realm-definition'
import { getAmbientActivityAt } from './ambient-activity'

/**
 * 環境粒子的預算
 *
 * 一座場景的環境粒子是一個粒子系統一層，每個系統每幀都要更新、排序、畫一次，
 * 所以層數與同時在飄的顆數都有上限。上限對照的是大廳那套通用空氣顆粒
 * （容量花粉兩百二、螢火一百四十四）：任何時段，一座場景同時在飄的環境粒子
 * 不超過它，GPU 與 CPU 的成本就不會比大廳多
 */
export const AMBIENT_MAX_LAYER_COUNT = 4
export const AMBIENT_MAX_CONCURRENT_COUNT = 220

/** 單層 count 的上限，風露原的螢火是最大的一層 */
export const AMBIENT_MAX_LAYER_PARTICLE_COUNT = 150

/**
 * 一層需要的粒子系統容量
 *
 * 穩定時身邊飄著 count 顆，容量留一成半的餘裕給壽命長短不一造成的起伏，
 * 再加幾顆給開場時多生的那一小段（見 ambient-layer 的 WARMUP）
 */
export function measureAmbientCapacity(count: number): number {
  return Math.ceil(count * 1.15) + 4
}

export type AmbientBudgetPhase = 'day' | 'night' | 'dawn' | 'dusk'

const PHASE_LIST: AmbientBudgetPhase[] = ['day', 'night', 'dawn', 'dusk']

export interface AmbientBudget {
  layerCount: number;
  /** 某一時段所有層同時在飄的顆數，取四個時段裡最大的 */
  peakConcurrentCount: number;
  peakPhase: AmbientBudgetPhase;
  /** 所有層的粒子系統容量加總（記憶體，不管那一層此刻活不活躍） */
  capacityCount: number;
}

/** 算一座場景的預算，雨雪天躲起來的不另外折算（最壞的情況是天晴） */
export function measureAmbientBudget(list: readonly AmbientParticle[]): AmbientBudget {
  let peakConcurrentCount = 0
  let peakPhase: AmbientBudgetPhase = 'day'

  for (const phase of PHASE_LIST) {
    const total = list.reduce((sum, layer) => sum + layer.count * getAmbientActivityAt(layer.activity, phase), 0)
    if (total > peakConcurrentCount) {
      peakConcurrentCount = total
      peakPhase = phase
    }
  }

  return {
    layerCount: list.length,
    peakConcurrentCount: Math.round(peakConcurrentCount),
    peakPhase,
    capacityCount: list.reduce((sum, layer) => sum + measureAmbientCapacity(layer.count), 0),
  }
}
