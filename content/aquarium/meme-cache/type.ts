import { z } from 'zod'

export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.string(),
  ocr: z.string(),
  keyword: z.string(),
})
export type MemeData = z.infer<typeof memeDataSchema>
