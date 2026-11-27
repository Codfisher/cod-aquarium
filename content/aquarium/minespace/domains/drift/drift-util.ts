/**
 * 取陣列的第 index 個元素
 *
 * 專案開了 noUncheckedIndexedAccess，直接用中括號取值每次都得處理 undefined。
 * 神遊的軌道、路徑與格子清單都是自己建的、下標都先夾過範圍，這裡集中收成一個函式
 */
export function itemAt<T>(list: readonly T[], index: number): T {
  return list[index] as T
}
