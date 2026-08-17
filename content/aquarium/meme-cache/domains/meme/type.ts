import { z } from 'zod'
import { BlurLevel } from '../../../../../.vitepress/utils/blur-level'

/**
 * 手動標註檔只會補其中幾個欄位，故文字欄位一律給預設值，
 * 讓 `{"file":"…","emotion":"無奈"}` 這種最小行也能通過驗證
 */
export const memeDataSchema = z.object({
  file: z.string(),
  describe: z.string().default(''),
  ocr: z.string().default(''),
  keyword: z.string().default(''),
  /** 逗號分隔的情緒／情境標籤，取值限於 EMOTION_LIST */
  emotion: z.string().default(''),
  blurLevel: z.nativeEnum(BlurLevel).optional(),
})
export type MemeData = z.infer<typeof memeDataSchema>
