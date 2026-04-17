import { z } from 'zod'
import { BlurLevel } from '../../../.vitepress/utils/blur-estimator'

export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.string(),
  ocr: z.string(),
  keyword: z.string(),
  blurLevel: z.nativeEnum(BlurLevel).optional(),
})
export type MemeData = z.infer<typeof memeDataSchema>

export type AlignTarget = {
  type: 'point';
  x: number;
  y: number;
} | {
  type: 'axis';
  x: number;
} | {
  type: 'axis';
  y: number;
}
