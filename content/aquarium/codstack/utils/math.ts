export function roundToStep(value: number, step: number) {
  if (!step) {
    return value
  }
  return Math.round(value / step) * step
}
