export interface QteStageConfig {
  /** 階段名稱 */
  name: string;
  /** 時限（秒） */
  timeLimit: number;
  /** 指標移動速度（0~1 每秒走過的比例） */
  indicatorSpeed: number;
}

/** Perfect 區間：頂部 10% (更窄更難) */
export const CHARGE_PERFECT_MIN = 0.90
/** Great 區間：80%~90% */
export const CHARGE_GREAT_MIN = 0.80

export const qteStageConfigList: QteStageConfig[] = [
  {
    name: 'charge',
    timeLimit: 2.5,
    // 加速來回，更難精準
    indicatorSpeed: 1.2,
  },
  {
    name: 'aim',
    timeLimit: 2.5,
    // 準心移動更快
    indicatorSpeed: 1.6,
  },
  {
    name: 'launch',
    timeLimit: 2,
    // 箭頭旋轉更快，時限更短
    indicatorSpeed: 2.0,
  },
]
