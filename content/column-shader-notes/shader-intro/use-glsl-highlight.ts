import { computed, type MaybeRefOrGetter, toValue } from 'vue'

interface TokenRule {
  pattern: RegExp;
  className: string;
}

const TOKEN_RULE_LIST: TokenRule[] = [
  // 單行註解
  { pattern: /\/\/.*$/gm, className: 'sh-comment' },
  // 多行註解
  { pattern: /\/\*[\s\S]*?\*\//g, className: 'sh-comment' },
  // 預處理指令
  { pattern: /^#\s*\w.*/gm, className: 'sh-preprocessor' },
  // 數字（含浮點數）
  { pattern: /\b\d+(?:\.\d*)?(e[+-]?\d+)?\b/gi, className: 'sh-number' },
  // 內建變數
  {
    pattern: /\b(gl_FragCoord|gl_FragColor|gl_Position|gl_PointSize|gl_FrontFacing|gl_PointCoord)\b/g,
    className: 'sh-builtin-var',
  },
  // 內建函式
  {
    pattern: /\b(radians|degrees|sin|cos|tan|asin|acos|atan|pow|exp|log|exp2|log2|sqrt|inversesqrt|abs|sign|floor|ceil|fract|mod|min|max|clamp|mix|step|smoothstep|length|distance|dot|cross|normalize|reflect|refract|texture2D|textureCube)\b/g,
    className: 'sh-builtin-fn',
  },
  // 型別
  {
    pattern: /\b(void|bool|int|float|vec2|vec3|vec4|mat2|mat3|mat4|ivec2|ivec3|ivec4|bvec2|bvec3|bvec4|sampler2D|samplerCube)\b/g,
    className: 'sh-type',
  },
  // 修飾詞與關鍵字
  {
    pattern: /\b(precision|lowp|mediump|highp|attribute|uniform|varying|const|in|out|inout|if|else|for|while|do|return|discard|break|continue|struct)\b/g,
    className: 'sh-keyword',
  },
  // Swizzle 成員（.rgba, .xyzw, .stpq）
  {
    pattern: /\.([w-zp-tgba]{1,4})\b/g,
    className: 'sh-swizzle',
  },
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function highlightGlsl(source: string): string {
  interface Token {
    start: number;
    end: number;
    className: string;
  }

  const tokenList: Token[] = []

  for (const rule of TOKEN_RULE_LIST) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags)
    for (
      let match = regex.exec(source);
      match !== null;
      match = regex.exec(source)
    ) {
      tokenList.push({
        start: match.index,
        end: match.index + match[0].length,
        className: rule.className,
      })
    }
  }

  // 依起始位置排序，重疊時優先取先出現的（註解優先）
  tokenList.sort((a, b) => a.start - b.start)

  // 移除重疊 token
  const filteredTokenList: Token[] = []
  let lastEnd = 0
  for (const token of tokenList) {
    if (token.start >= lastEnd) {
      filteredTokenList.push(token)
      lastEnd = token.end
    }
  }

  // 組裝 HTML
  let result = ''
  let cursor = 0
  for (const token of filteredTokenList) {
    if (token.start > cursor) {
      result += escapeHtml(source.slice(cursor, token.start))
    }
    result += `<span class="${token.className}">${escapeHtml(source.slice(token.start, token.end))}</span>`
    cursor = token.end
  }
  if (cursor < source.length) {
    result += escapeHtml(source.slice(cursor))
  }

  return result
}

export function useGlslHighlight(source: MaybeRefOrGetter<string>) {
  const highlightedHtml = computed(() => highlightGlsl(toValue(source)))
  return { highlightedHtml }
}
