import type { GeometryConfig, VertexAttribute } from './shader-intro/use-webgl'

const SIZE_TO_TYPE: Record<number, string> = {
  1: 'float',
  2: 'vec2',
  3: 'vec3',
  4: 'vec4',
}

/** 將 attribute name 轉成變數名稱前綴（去掉 a_ 前綴） */
function toVarName(attributeName: string): string {
  return attributeName.replace(/^a_/, '')
}

/** 格式化數字陣列，依 size 分組換行 */
function formatDataArray(data: number[], size: number): string {
  const lineList: string[] = []

  for (let i = 0; i < data.length; i += size) {
    const chunk = data.slice(i, i + size)
    const formatted = chunk
      .map((n) => {
        const str = Number.isInteger(n) ? `${n}.0` : String(n)
        return str.padStart(5)
      })
      .join(', ')
    lineList.push(`  ${formatted},`)
  }

  return lineList.join('\n')
}

function generateAttributeBlock(attribute: VertexAttribute): string {
  const varName = toVarName(attribute.name)
  const typeName = SIZE_TO_TYPE[attribute.size] ?? `vec${attribute.size}`

  return `// ── ${attribute.name}（${typeName}）──
const ${varName}Buffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, ${varName}Buffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
${formatDataArray(attribute.data, attribute.size)}
]), gl.STATIC_DRAW)

const ${varName}Location = gl.getAttribLocation(program, '${attribute.name}')
gl.enableVertexAttribArray(${varName}Location)
gl.vertexAttribPointer(${varName}Location, ${attribute.size}, gl.FLOAT, false, 0, 0)`
}

/** 根據 GeometryConfig 生成擬真的 WebGL JS 程式碼 */
export function generateJsCode(geometry: GeometryConfig): string {
  const blockList = geometry.attributeList.map(generateAttributeBlock)

  const drawCall = `\n// ── 繪製 ──\ngl.drawArrays(gl.${geometry.drawMode}, 0, ${geometry.vertexCount})`

  return `${blockList.join('\n\n')}\n${drawCall}\n`
}
