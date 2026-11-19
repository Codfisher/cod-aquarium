/**
 * 迷因情緒／情境標籤。
 *
 * 使用者要的往往不是關鍵字，而是「一張能表達無奈的圖」，
 * 故用固定清單而非自由填寫，chip 才收斂得住、也不會出現同義標籤各自為政。
 */
export const EMOTION_LIST = [
  '無奈',
  '生氣',
  '疑惑',
  '開心',
  '悲傷',
  '驚訝',
  '嘲諷',
  '得意',
  '尷尬',
  '疲憊',
  '可愛',
  '恐怖',
  '讚許',
  '拒絕',
  '敷衍',
] as const

export type Emotion = typeof EMOTION_LIST[number]

const EMOTION_SET = new Set<string>(EMOTION_LIST)

export function isEmotion(value: string): value is Emotion {
  return EMOTION_SET.has(value)
}

/** 每張圖最多幾個標籤，超過反而失去篩選意義 */
export const EMOTION_MAX_COUNT = 2

/**
 * 將逗號分隔的情緒字串轉為合法標籤陣列。
 * 模型偶爾會回傳清單外的詞或重複詞，一律在此濾掉，避免髒資料流進 UI。
 */
export function parseEmotionList(source: string | undefined): Emotion[] {
  if (!source)
    return []

  return [...new Set(
    source
      .split(',')
      .map((item) => item.trim())
      .filter(isEmotion),
  )].slice(0, EMOTION_MAX_COUNT)
}

/** 合併多來源的情緒標籤，保留 EMOTION_LIST 的順序，方便 chip 顯示一致 */
export function mergeEmotion(...sourceList: Array<string | undefined>): string {
  const merged = new Set(sourceList.flatMap((source) => parseEmotionList(source)))
  return EMOTION_LIST.filter((emotion) => merged.has(emotion)).join(',')
}
