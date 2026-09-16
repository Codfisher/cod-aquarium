import { chunk } from 'remeda'

export interface StitchLayoutOption {
  value: string;
  label: string;
  rowCount: number;
  columnCount: number;
}

/**
 * 拼接版面。value 為「列數x欄數」，底圖固定佔第一格，其餘格子由使用者自行填入。
 *
 * 同一列的格子等高、寬度依長寬比分配；不同列各自等寬，
 * 這樣不裁切也拼得整齊，免得把梗圖的字切掉
 */
export const STITCH_LAYOUT_LIST: StitchLayoutOption[] = [
  { value: 'single', label: '單張', rowCount: 1, columnCount: 1 },
  { value: '1x2', label: '左右並排（1×2）', rowCount: 1, columnCount: 2 },
  { value: '2x1', label: '上下堆疊（2×1）', rowCount: 2, columnCount: 1 },
  { value: '1x3', label: '三張並排（1×3）', rowCount: 1, columnCount: 3 },
  { value: '3x1', label: '三張堆疊（3×1）', rowCount: 3, columnCount: 1 },
  { value: '2x2', label: '四宮格（2×2）', rowCount: 2, columnCount: 2 },
]

export const DEFAULT_STITCH_LAYOUT_VALUE = 'single'

export function getStitchLayoutOption(value: string | undefined): StitchLayoutOption {
  return STITCH_LAYOUT_LIST.find((item) => item.value === value) ?? STITCH_LAYOUT_LIST[0]!
}

export interface StitchCell {
  key: string;
  url: string;
  /** 圖片原始的寬 ÷ 高。填滿比例選「原始比例」時，格子靠它分配寬度 */
  aspectRatio: number;
  /** 填滿比例，對應 STITCH_FILL_OPTION_LIST 的 value。未設定視為原始比例 */
  fillValue?: string;
  /** 裁切後的可視位置百分比（0~100），未設定視為置中 */
  focalX?: number;
  focalY?: number;
  /**
   * 比例與圖片不吻合時的處理方式：cover 裁切填滿（預設）、contain 完整顯示。
   * 只有選了非原始比例才有意義，原始比例下格子必定與圖片吻合，沒有選擇的必要
   */
  fitMode?: 'cover' | 'contain';
  /** 完整顯示模式露出的背景色，其餘情況下設了也沒有可見效果 */
  backgroundColor?: string;
}

/** 格子的圖片來源，與「插入圖片」選單一致 */
export type StitchSourceType = 'upload' | 'clipboard' | 'meme'

export interface StitchFillOption {
  value: string;
  label: string;
  /** 裁切比例，null 表示原始比例（不裁切） */
  ratio: number | null;
}

/**
 * 格子的填滿比例。選了非原始比例時，格子的寬高比會脫離圖片本身，
 * 預設用 object-fit: cover 裁切填滿（可拖曳調整可視範圍），
 * 也可切換成 contain 完整顯示（見 StitchCell.fitMode），但比例不吻合時會露出背景
 */
export const STITCH_FILL_OPTION_LIST: StitchFillOption[] = [
  { value: 'original', label: '原始比例（不裁切）', ratio: null },
  { value: 'square', label: '方形 1:1', ratio: 1 },
  { value: 'portrait', label: '直式 3:4', ratio: 3 / 4 },
  { value: 'landscape', label: '橫式 4:3', ratio: 4 / 3 },
]

export const DEFAULT_STITCH_FILL_VALUE = 'original'

/** 裁切位置未設定時的預設值：置中 */
export const DEFAULT_STITCH_FOCAL = 50

export const DEFAULT_STITCH_FIT_MODE = 'cover'

export const DEFAULT_STITCH_BACKGROUND_COLOR = '#FFFFFF'

export function getStitchFillOption(value: string | undefined): StitchFillOption {
  return STITCH_FILL_OPTION_LIST.find((item) => item.value === value) ?? STITCH_FILL_OPTION_LIST[0]!
}

/** 格子實際要用的寬高比：原始比例沿用圖片本身，否則採選定的裁切比例 */
export function getStitchCellBoxAspectRatio(cell: StitchCell): number {
  return getStitchFillOption(cell.fillValue).ratio ?? cell.aspectRatio
}

/**
 * 完整顯示模式下，比例與圖片不吻合才會露出背景，才需要設定背景色。
 * 原始比例必定吻合、裁切填滿模式不會露出背景，這兩種情況背景色都是設假的
 */
export function canStitchCellShowBackground(cell: StitchCell): boolean {
  return getStitchFillOption(cell.fillValue).ratio !== null
    && (cell.fitMode ?? DEFAULT_STITCH_FIT_MODE) === 'contain'
}

/**
 * 依版面調整格子數。底圖不算在內，故格數為總格數減一。
 *
 * 換到較小的版面時多出的格子直接捨棄，換回大版面時補空格；
 * 使用者若想反悔，靠復原即可
 */
export function resizeStitchCellList<T>(
  cellList: Array<T | undefined>,
  layout: StitchLayoutOption,
): Array<T | undefined> {
  const cellCount = layout.rowCount * layout.columnCount - 1
  return Array.from({ length: cellCount }, (_, index) => cellList[index])
}

/**
 * 把「底圖 + 其餘格子」依欄數切成列。
 *
 * 回傳的索引是整體格子的索引（底圖為 0），
 * 樣板要靠它判斷哪一格是底圖、以及對應到 cellList 的哪一項（索引減一）
 */
export function chunkStitchRowList(
  cellCount: number,
  layout: StitchLayoutOption,
): number[][] {
  return chunk(
    Array.from({ length: cellCount + 1 }, (_, index) => index),
    layout.columnCount,
  )
}

/**
 * 算出同一列每一格該佔的寬度百分比，讓它們維持等高。
 *
 * 高度 = 寬度 ÷ 長寬比 = (該列總寬 × 佔比) ÷ 長寬比 = 該列總寬 ÷ 長寬比總和，
 * 這個值對同一列每一格都相同，故只要依長寬比佔比分配寬度，各格高度自然相等，
 * 不必量測任何實際尺寸。
 *
 * 用明確算出的百分比而非 CSS flex-grow 按比例分配寬度，
 * 是因為 flex-grow 搭配 aspect-ratio 曾被回報格子沒有撐滿整列寬度，
 * 直接指定百分比就不必依賴瀏覽器如何處理這個組合
 */
export function getStitchRowCellWidthPercentList(aspectRatioList: number[]): number[] {
  const ratioSum = aspectRatioList.reduce((sum, ratio) => sum + ratio, 0)
  if (ratioSum <= 0) {
    return aspectRatioList.map(() => 100 / (aspectRatioList.length || 1))
  }

  return aspectRatioList.map((ratio) => (ratio / ratioSum) * 100)
}
