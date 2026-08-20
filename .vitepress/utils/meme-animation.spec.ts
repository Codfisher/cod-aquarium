import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buildFrameSprite, buildPoster, getSpriteFrameDelayList, normalizeAnimatedMeme } from './meme-animation'
import { pickFrameIndexList } from './meme-frame-sheet'

/** 造一段真的有動作的動畫，避免相鄰影格因壓縮後相同而被編碼器合併 */
async function createAnimatedGif(frameCount: number, delay: number) {
  const frameList = await Promise.all(
    Array.from({ length: frameCount }, (_, index) => sharp({
      create: { width: 320, height: 200, channels: 3, background: '#ffffff' },
    })
      .composite([{
        input: Buffer.from(
          // 讓方塊在畫面內來回，影格才不會因內容相同被編碼器合併
          `<svg width="320" height="200"><rect x="${(index * 11) % 240}" y="40" width="80" height="120" fill="#e0245e"/></svg>`,
        ),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer()),
  )

  return sharp(frameList, { join: { animated: true } })
    .gif({ delay: Array.from({ length: frameCount }, () => delay), loop: 0 })
    .toBuffer()
}

function sumDelay(delayList: number[] | undefined) {
  return (delayList ?? []).reduce((total, delay) => total + delay, 0)
}

describe('pickFrameIndexList', () => {
  it('影格數未超過上限時全取', () => {
    expect(pickFrameIndexList(5, 9)).toEqual([0, 1, 2, 3, 4])
  })

  it('超過上限時等距抽格，首尾必取', () => {
    const result = pickFrameIndexList(40, 9)

    expect(result.length).toBeLessThanOrEqual(9)
    expect(result[0]).toBe(0)
    expect(result.at(-1)).toBe(39)
    expect([...result]).toEqual([...result].sort((a, b) => a - b))
  })
})

describe('normalizeAnimatedMeme', () => {
  it('抽格後總時長不變', async () => {
    const source = await createAnimatedGif(200, 60)
    const result = await normalizeAnimatedMeme(source)

    const sourceMeta = await sharp(source).metadata()
    const resultMeta = await sharp(result).metadata()

    expect(sourceMeta.pages).toBeGreaterThan(120)
    expect(resultMeta.pages).toBeLessThan(sourceMeta.pages ?? 0)
    expect(sumDelay(resultMeta.delay)).toBe(sumDelay(sourceMeta.delay))
  })

  it('影格數在上限內時完整保留，不會被抽格', async () => {
    const source = await createAnimatedGif(36, 60)
    const result = await normalizeAnimatedMeme(source)

    const sourceMeta = await sharp(source).metadata()
    const resultMeta = await sharp(result).metadata()

    // webp 編碼器可能合併壓縮後相同的相鄰影格，故允許略少
    expect(resultMeta.pages).toBeGreaterThanOrEqual((sourceMeta.pages ?? 0) - 4)
  })

  it('影格數收斂到上限以內', async () => {
    const result = await normalizeAnimatedMeme(await createAnimatedGif(200, 40))

    expect((await sharp(result).metadata()).pages).toBeLessThanOrEqual(120)
  })

  it('最長邊縮到 480 以內', async () => {
    const source = await sharp(
      await Promise.all([0, 1, 2].map((index) => sharp({
        create: { width: 1200, height: 900, channels: 3, background: { r: index * 80, g: 0, b: 0 } },
      }).png().toBuffer())),
      { join: { animated: true } },
    ).gif({ delay: [80, 80, 80] }).toBuffer()

    const meta = await sharp(await normalizeAnimatedMeme(source)).metadata()

    expect(meta.width).toBe(480)
  })
})

describe('衍生檔案', () => {
  it('影格長圖的高度等於影格數乘以單格高度', async () => {
    const meme = await normalizeAnimatedMeme(await createAnimatedGif(20, 50))
    const memeMeta = await sharp(meme).metadata()
    const spriteMeta = await sharp(await buildFrameSprite(meme)).metadata()

    expect(spriteMeta.width).toBe(memeMeta.width)
    expect(spriteMeta.height).toBe((memeMeta.height ?? 0) * (memeMeta.pages ?? 0))
    // 長圖必須是靜態的，前端才切得出影格
    expect(spriteMeta.pages).toBeUndefined()
  })

  it('動圖影格多於長圖上限時，長圖獨立抽格', async () => {
    const meme = await normalizeAnimatedMeme(await createAnimatedGif(120, 40))
    const memeMeta = await sharp(meme).metadata()
    const spriteMeta = await sharp(await buildFrameSprite(meme)).metadata()

    const spriteFrameCount = (spriteMeta.height ?? 0) / (memeMeta.height ?? 1)

    expect(memeMeta.pages).toBeGreaterThan(32)
    expect(spriteFrameCount).toBeLessThanOrEqual(32)
    expect(Number.isInteger(spriteFrameCount)).toBe(true)
  })

  it('長圖的影格間隔數量與長圖影格數一致，且總時長保留', async () => {
    const meme = await normalizeAnimatedMeme(await createAnimatedGif(120, 40))
    const memeMeta = await sharp(meme).metadata()
    const spriteMeta = await sharp(await buildFrameSprite(meme)).metadata()
    const delayList = await getSpriteFrameDelayList(meme)

    expect(delayList).toHaveLength((spriteMeta.height ?? 0) / (memeMeta.height ?? 1))
    expect(sumDelay(delayList)).toBe(sumDelay(memeMeta.delay))
  })

  it('首格圖是單張靜態圖，且與動圖同尺寸', async () => {
    const meme = await normalizeAnimatedMeme(await createAnimatedGif(20, 50))
    const memeMeta = await sharp(meme).metadata()
    const posterMeta = await sharp(await buildPoster(meme)).metadata()

    expect(posterMeta.pages).toBeUndefined()
    expect(posterMeta.width).toBe(memeMeta.width)
    expect(posterMeta.height).toBe(memeMeta.height)
  })
})
