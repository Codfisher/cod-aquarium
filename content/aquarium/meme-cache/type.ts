import { z } from 'zod'

export const memeOriDataSchema = z.object({
  file: z.string(),
  describe: z.string(),
  ocr: z.string(),
  /** , 分隔之字串 */
  keyword: z.string(),
})
export type MemeOriData = z.infer<typeof memeOriDataSchema>

export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.string(),
  describeZhTw: z.string(),
  ocr: z.string(),
  keyword: z.string(),
})
export type MemeData = z.infer<typeof memeDataSchema>
