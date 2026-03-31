export interface QteStageConfig {
  /** 階段名稱 */
  name: string;
  /** 時限（秒） */
  timeLimit: number;
  /** 指標移動速度（0~1 每秒走過的比例） */
  indicatorSpeed: number;
}

/** Perfect 區間：頂部 15% */
export const CHARGE_PERFECT_MIN = 0.85
/** Great 區間：頂部 15%~25% 和 75%~85% */
export const CHARGE_GREAT_MIN = 0.75

export const qteStageConfigList: QteStageConfig[] = [
  {
    name: 'charge',
    timeLimit: 3,
    indicatorSpeed: 0.8,
  },
  {
    name: 'aim',
    timeLimit: 3,
    indicatorSpeed: 1.2,
  },
  {
    name: 'launch',
    timeLimit: 3,
    indicatorSpeed: 1.5,
  },
]
