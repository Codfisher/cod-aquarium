import { computed, type MaybeRefOrGetter, toValue } from 'vue'

interface TokenRule {
  pattern: RegExp;
  className: string;
}

const TOKEN_RULE_LIST: TokenRule[] = [
  // 單行註解
  { pattern: /\/\/.*$/gm, className: 'sh-comment' },
  // 字串
  { pattern: /'[^']*'/g, className: 'sh-number' },
  // 數字（含浮點數）
  { pattern: /\b\d+(?:\.\d*)?(e[+-]?\d+)?\b/gi, className: 'sh-number' },
  // WebGL 常數（gl.XXXX）
  {
    pattern: /\bgl\.(ARRAY_BUFFER|STATIC_DRAW|DYNAMIC_DRAW|FLOAT|POINTS|LINES|LINE_STRIP|LINE_LOOP|TRIANGLES|TRIANGLE_STRIP|TRIANGLE_FAN|VERTEX_SHADER|FRAGMENT_SHADER)\b/g,
    className: 'sh-builtin-var',
  },
  // WebGL 方法（gl.xxx）
  {
    pattern: /\bgl\.(createBuffer|bindBuffer|bufferData|getAttribLocation|enableVertexAttribArray|vertexAttribPointer|drawArrays|createShader|shaderSource|compileShader|createProgram|attachShader|linkProgram|useProgram|getUniformLocation|uniform[1234][fi]v?)\b/g,
    className: 'sh-builtin-fn',
  },
  // 型別與建構式
  {
    pattern: /\b(Float32Array|Int32Array|Uint8Array|WebGLBuffer|WebGLProgram)\b/g,
    className: 'sh-type',
  },
  // 關鍵字
  {
    pattern: /\b(const|let|var|new|function|return|if|else|for|while|true|false|null|undefined)\b/g,
    className: 'sh-keyword',
  },
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function highlightJs(source: string): string {
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

  tokenList.sort((a, b) => a.start - b.start)

  const filteredTokenList: Token[] = []
  let lastEnd = 0
  for (const token of tokenList) {
    if (token.start >= lastEnd) {
      filteredTokenList.push(token)
      lastEnd = token.end
    }
  }

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

export function useJsHighlight(source: MaybeRefOrGetter<string>) {
  const highlightedHtml = computed(() => highlightJs(toValue(source)))
  return { highlightedHtml }
}
