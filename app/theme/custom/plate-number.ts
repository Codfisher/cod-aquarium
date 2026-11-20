/** 圖版號：依發布順序從 01 起算，補零到兩位數 */
export function toPlateNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}
