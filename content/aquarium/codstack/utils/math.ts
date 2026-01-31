export function roundToStep(value: number, step: number) {
  if (!step) {
    return value
  }
  return Math.round(value / step) * step
}

/** 修整小數點，避免過長 */
export function cleanFloat(
  value: number,
  decimal: number = 4,
) {
  return Number.parseFloat(value.toFixed(decimal))
}
