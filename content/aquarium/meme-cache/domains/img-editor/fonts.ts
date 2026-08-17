export interface FontOption {
  /** 存進 localStorage 的識別字，故不可隨意更動 */
  value: string;
  label: string;
  cssFamily: string;
  /** Google Fonts 的 family 參數，站台已載入者留空 */
  googleFamily?: string;
}

/**
 * 中文字型動輒數 MB，故只挑 Google Fonts 上有正體中文字符集的幾套，
 * 由其 unicode-range 分片機制按實際用字下載，並延到使用者真的選了才載入。
 */
export const FONT_LIST: FontOption[] = [
  {
    value: 'default',
    label: '黑體',
    // 站台本身已載入，不必重複請求
    cssFamily: '"Noto Sans TC", sans-serif',
  },
  {
    value: 'serif',
    label: '明體',
    cssFamily: '"Noto Serif TC", serif',
    googleFamily: 'Noto+Serif+TC:wght@400;700;900',
  },
  {
    value: 'kai',
    label: '楷體',
    cssFamily: '"cwTeXKai", serif',
    googleFamily: 'cwTeXKai',
  },
  {
    value: 'round',
    label: '圓體',
    cssFamily: '"cwTeXYen", sans-serif',
    googleFamily: 'cwTeXYen',
  },
]

export const DEFAULT_FONT_VALUE = 'default'

const fontMap = new Map(FONT_LIST.map((item) => [item.value, item]))

export function getFontOption(value: string | undefined): FontOption {
  return fontMap.get(value ?? '') ?? FONT_LIST[0]!
}

const loadedFontSet = new Set<string>()

/**
 * 載入字型並等待可用。
 *
 * 截圖是同步取樣，字型還沒下載完就會拍到 fallback 字型，
 * 故除了插入 stylesheet，也要等 document.fonts 真的備妥。
 */
export async function loadFont(value: string, sampleText: string): Promise<void> {
  const option = getFontOption(value)
  if (!option.googleFamily || typeof document === 'undefined')
    return

  if (!loadedFontSet.has(option.value)) {
    loadedFontSet.add(option.value)

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${option.googleFamily}&display=swap`
    document.head.appendChild(link)
  }

  try {
    await document.fonts.load(`16px ${option.cssFamily}`, sampleText)
  }
  catch (error) {
    console.warn('[meme-cache] 字型載入失敗', option.value, error)
  }
}
