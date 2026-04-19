import { z } from 'zod'
import { BlurLevel } from '../../../../../.vitepress/utils/blur-level'

export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.string(),
  ocr: z.string(),
  keyword: z.string(),
  blurLevel: z.nativeEnum(BlurLevel).optional(),
})
export type MemeData = z.infer<typeof memeDataSchema>
