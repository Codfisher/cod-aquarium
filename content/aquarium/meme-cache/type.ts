import { z } from 'zod'

export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.string(),
  ocr: z.string(),
  keyword: z.string(),
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
