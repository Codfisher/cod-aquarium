import { z } from 'zod'

export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.object({
    en: z.string(),
    zh: z.string(),
  }),
  ocr: z.string(),
})

export type MemeData = z.infer<typeof memeDataSchema>
