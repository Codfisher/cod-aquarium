/** 分成 3 個等級 */
export enum BlurLevel {
  /** 清晰 */
  LEVEL_0,
  /** 稍微模糊 */
  LEVEL_1,
  /** 非常模糊 */
  LEVEL_2,
}

/** 圖片模糊範例 */
export const exampleImages = [
  {
    name: 'meme-0c3fea0c-9d75-430b-9b16-88f3ed286300.webp',
    level: BlurLevel.LEVEL_2,
  },
  {
    name: 'meme-1909912c-fe6e-46cd-bf2f-a32fd300c3d4.webp',
    level: BlurLevel.LEVEL_2,
  },
  {
    name: 'meme-14e93fbd-b7aa-4185-ae76-9b4514b2509a.webp',
    level: BlurLevel.LEVEL_2,
  },
]
