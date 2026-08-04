/** 可重現的偽隨機數產生器（mulberry32）。
 *
 * 程序生成的地形與擺設用固定種子，每次載入的世界才會一致；
 * 無限關卡則以「段落序號」當種子，同一段永遠長一樣，玩家記得住地形。
 */
export function createRandomGenerator(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6D2B79F5) | 0
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

/** 在 [min, max) 間取隨機數 */
export function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min)
}

/** 從清單隨機取一個元素。空清單回傳 undefined */
export function pickRandom<ItemType>(
  random: () => number,
  itemList: readonly ItemType[],
): ItemType | undefined {
  if (itemList.length === 0) {
    return undefined
  }
  return itemList[Math.floor(random() * itemList.length)]
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 指數趨近：與幀率無關的平滑插值。rate 越大收斂越快 */
export function damp(current: number, target: number, rate: number, deltaSeconds: number): number {
  return target + (current - target) * Math.exp(-rate * deltaSeconds)
}
