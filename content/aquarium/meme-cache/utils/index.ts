export function isClose(a: number, b: number, epsilon = 0.1) {
  return Math.abs(a - b) < epsilon
}

export function hexToRgba(hex: string, alpha = 1) {
  let h = hex.replace(/^#/, '')
  if (h.length === 3)
    h = h.split('').map((c) => c + c).join('') // #000 -> #000000
  if (h.length !== 6)
    throw new Error('Invalid hex color')

  const num = Number.parseInt(h, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255

  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}