import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import distance from 'sharp-phash/distance'
import { describe, expect, it } from 'vitest'
import { createFingerprint, IMG_SIMILARITY_THRESHOLD, isDuplicateFingerprint } from './meme-dedupe'

const WIDTH = 320
const HEIGHT = 200
const FRAME_COUNT = 12

function createFrame(svgBody: string) {
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#000000' } })
    .composite([{
      input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}">${svgBody}</svg>`),
      top: 0,
      left: 0,
    }])
    .png()
    .toBuffer()
}

/**
 * 造一段「第一格全黑、之後才出現內容」的動圖，
 * 模擬真實梗圖常見的淡入開場
 */
async function createFadeInGif(shape: (index: number) => string) {
  const frameList = await Promise.all(
    Array.from({ length: FRAME_COUNT }, (_, index) => createFrame(index === 0 ? '' : shape(index))),
  )

  return sharp(frameList, { join: { animated: true } })
    .gif({ delay: Array.from({ length: FRAME_COUNT }, () => 80), loop: 0 })
    .toBuffer()
}

function movingSquare(index: number) {
  return `<rect x="${index * 20}" y="40" width="90" height="110" fill="#e0245e"/>`
}
function growingCircle(index: number) {
  return `<circle cx="160" cy="100" r="${index * 7}" fill="#2ecc71"/>`
}

describe('isDuplicateFingerprint', () => {
  it('同一段動圖判定為重複', async () => {
    const gif = await createFadeInGif(movingSquare)

    expect(isDuplicateFingerprint(
      await createFingerprint(gif),
      await createFingerprint(gif),
    )).toBe(true)
  })

  it('縮放後的同一段動圖仍判定為重複', async () => {
    const gif = await createFadeInGif(movingSquare)
    const resized = await sharp(gif, { animated: true })
      .resize({ width: 160 })
      .gif()
      .toBuffer()

    expect(isDuplicateFingerprint(
      await createFingerprint(gif),
      await createFingerprint(resized),
    )).toBe(true)
  })

  it('開頭相同但內容不同的動圖不算重複', async () => {
    const square = await createFingerprint(await createFadeInGif(movingSquare))
    const circle = await createFingerprint(await createFadeInGif(growingCircle))

    // 兩者的第一格都是全黑，只比第一格的舊做法會誤判成重複
    expect(distance(square.hashList[0]!, circle.hashList[0]!))
      .toBeLessThanOrEqual(IMG_SIMILARITY_THRESHOLD)

    expect(isDuplicateFingerprint(square, circle)).toBe(false)
  })

  it('動圖取樣多格，靜態圖只有一格', async () => {
    const animated = await createFingerprint(await createFadeInGif(movingSquare))
    const still = await createFingerprint(await createFrame(movingSquare(3)))

    expect(animated.animated).toBe(true)
    expect(animated.hashList.length).toBeGreaterThan(1)
    expect(still.animated).toBe(false)
    expect(still.hashList).toHaveLength(1)
  })

  it('只要有一方是靜態圖就沿用單格比對', async () => {
    const animated = await createFingerprint(await createFadeInGif(movingSquare))
    const blackStill = await createFingerprint(await createFrame(''))

    // 動圖第一格是全黑，與全黑靜態圖比對會相符，維持既有行為
    expect(isDuplicateFingerprint(animated, blackStill)).toBe(true)
  })
})
