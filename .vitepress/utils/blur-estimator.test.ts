import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BlurLevel, computeBlurLevel } from './blur-estimator'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const MEME_DIR = path.resolve(currentDir, '../../content/public/memes')

const BLUR_LEVEL_LABEL: Record<BlurLevel, string> = {
  [BlurLevel.LEVEL_0]: '清晰',
  [BlurLevel.LEVEL_1]: '稍微模糊',
  [BlurLevel.LEVEL_2]: '非常模糊',
}

/** 人工標注的模糊等級範例 */
const exampleImages = [
  // LEVEL_2
  { name: 'meme-0c3fea0c-9d75-430b-9b16-88f3ed286300.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-1909912c-fe6e-46cd-bf2f-a32fd300c3d4.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-14e93fbd-b7aa-4185-ae76-9b4514b2509a.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-46a84a3f-083f-4bfd-a14e-1ac6fe07cb38.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-486cf0f4-26a1-4142-935c-fdf8acd6ba55.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-50617e0a-3071-4520-b8c6-ae4fd96fad9c.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-5b7643f6-1420-4d39-8df0-67aefcfa985d.webp', level: BlurLevel.LEVEL_2 },
  { name: 'meme-9fa4a5b1-0bc7-4301-a0c2-a6d2d39ef77a.webp', level: BlurLevel.LEVEL_2 },

  // LEVEL_1
  { name: 'meme-2a743526-7fd9-4ab0-91e6-421c02a1132a.webp', level: BlurLevel.LEVEL_1 },
  { name: 'meme-43effe7f-66a3-4739-a716-edac261879b6.webp', level: BlurLevel.LEVEL_1 },
  { name: 'meme-7823e62f-d00a-4997-b735-e4e2f80df19b.webp', level: BlurLevel.LEVEL_1 },

  // LEVEL_0
  { name: 'meme-4bac9670-97fc-4eab-9eb9-56f4845d491b.webp', level: BlurLevel.LEVEL_0 },
  { name: 'meme-5b73f1c4-17a9-42f0-ae47-123b1b21554d.webp', level: BlurLevel.LEVEL_0 },
  { name: 'meme-7174c064-23ca-480c-913a-81d1b4001c76.webp', level: BlurLevel.LEVEL_0 },
  { name: 'meme-7c450c60-3473-406e-8e64-53e999c9b267.webp', level: BlurLevel.LEVEL_0 },
  { name: 'meme-b9b3f56c-90b2-4cef-b915-6582e1ea3041.webp', level: BlurLevel.LEVEL_0 },
]

describe('computeBlurLevel', () => {
  for (const image of exampleImages) {
    const expectedLabel = BLUR_LEVEL_LABEL[image.level]

    it(`${image.name} 應判定為「${expectedLabel}」`, async () => {
      const filePath = path.join(MEME_DIR, image.name)
      const actualLevel = await computeBlurLevel(filePath)

      expect(
        actualLevel,
        `期望 ${BLUR_LEVEL_LABEL[image.level]}，實際為 ${BLUR_LEVEL_LABEL[actualLevel]}`,
      ).toBe(image.level)
    })
  }
})
