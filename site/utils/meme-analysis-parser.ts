export interface MemeAnalysis {
  describe?: string;
  ocr?: string;
  keyword?: string;
  /** 逗號分隔的情緒／情境標籤，取值限於 EMOTION_LIST */
  emotion?: string;
}

/**
 * 從模型回應文字取出第一個完整 JSON 物件
 *
 * 模型偶爾會在 JSON 後面多吐內容（思考摘要、第二個 JSON 等），
 * 直接 JSON.parse 會炸掉，所以掃描括號層級取出第一段。
 */
export function extractFirstJsonObject(text: string) {
  const startIndex = text.indexOf('{')
  if (startIndex === -1) {
    return undefined
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index++) {
    const char = text[index]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) {
      continue
    }

    if (char === '{') {
      depth++
    }
    else if (char === '}') {
      depth--
      if (depth === 0) {
        return text.slice(startIndex, index + 1)
      }
    }
  }

  return undefined
}

/** 解析模型回傳的迷因分析結果 */
export function parseMemeAnalysis(text: string): MemeAnalysis {
  const trimmed = text.trim()
  if (!trimmed) {
    return {}
  }

  try {
    return JSON.parse(trimmed)
  }
  catch {
    const jsonText = extractFirstJsonObject(trimmed)
    if (!jsonText) {
      throw new Error(`回應不含 JSON：${trimmed.slice(0, 200)}`)
    }

    return JSON.parse(jsonText)
  }
}
