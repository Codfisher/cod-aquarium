import {
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type MaybeRefOrGetter,
  toValue,
} from 'vue'
import { useMouseInElement, useElementSize } from '@vueuse/core'

export const DEFAULT_VERTEX_SHADER = `attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

interface UseWebGlOptions {
  /** Fragment Shader 程式碼 */
  fragmentShaderSource: MaybeRefOrGetter<string>
  /** Vertex Shader 程式碼，不傳則使用預設全螢幕四邊形 */
  vertexShaderSource?: MaybeRefOrGetter<string>
}

export function useWebGl(
  canvasRef: MaybeRefOrGetter<HTMLCanvasElement | null>,
  options: UseWebGlOptions,
) {
  const error = ref<string>('')
  const glRef = shallowRef<WebGLRenderingContext | null>(null)
  const programRef = shallowRef<WebGLProgram | null>(null)
  let animationFrameId = 0
  let startTime = Date.now()

  const canvasSize = useElementSize(canvasRef)
  const mouse = useMouseInElement(canvasRef)

  function createShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string,
  ): WebGLShader | null {
    const shader = gl.createShader(type)
    if (!shader) return null

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'Unknown error'
      gl.deleteShader(shader)
      error.value = log
      return null
    }

    return shader
  }

  function createProgram(
    gl: WebGLRenderingContext,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
  ): WebGLProgram | null {
    const program = gl.createProgram()
    if (!program) return null

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'Unknown error'
      gl.deleteProgram(program)
      error.value = log
      return null
    }

    return program
  }

  let bufferRef: WebGLBuffer | null = null

  function setupGeometry(gl: WebGLRenderingContext, program: WebGLProgram) {
    // 清理舊 buffer
    if (bufferRef) {
      gl.deleteBuffer(bufferRef)
    }

    const positionBuffer = gl.createBuffer()
    bufferRef = positionBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)

    // 全螢幕四邊形（兩個三角形）
    const positionList = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ])
    gl.bufferData(gl.ARRAY_BUFFER, positionList, gl.STATIC_DRAW)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  }

  /** 釋放所有 WebGL 資源 */
  function dispose() {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = 0

    const gl = glRef.value
    if (!gl) return

    if (programRef.value) {
      gl.deleteProgram(programRef.value)
      programRef.value = null
    }
    if (bufferRef) {
      gl.deleteBuffer(bufferRef)
      bufferRef = null
    }

    // 強制釋放 WebGL context
    const loseContext = gl.getExtension('WEBGL_lose_context')
    if (loseContext) {
      loseContext.loseContext()
    }

    glRef.value = null
  }

  function compile(source: string) {
    const canvas = toValue(canvasRef)
    if (!canvas) return

    let gl = glRef.value
    if (!gl) {
      gl = canvas.getContext('webgl')
      if (!gl) {
        error.value = 'WebGL is not supported'
        return
      }
      glRef.value = gl
    }

    error.value = ''

    const vertexSource = toValue(options.vertexShaderSource) || DEFAULT_VERTEX_SHADER
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
    if (!vertexShader) return

    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, source)
    if (!fragmentShader) {
      gl.deleteShader(vertexShader)
      return
    }

    // 清理舊 program
    if (programRef.value) {
      gl.deleteProgram(programRef.value)
    }

    const program = createProgram(gl, vertexShader, fragmentShader)
    if (!program) {
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    // shader 已附加到 program，可以刪除
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    programRef.value = program
    gl.useProgram(program)
    setupGeometry(gl, program)
    startTime = Date.now()
  }

  function render() {
    const gl = glRef.value
    const program = programRef.value
    const canvas = toValue(canvasRef)

    if (!gl || !program || !canvas) {
      animationFrameId = requestAnimationFrame(render)
      return
    }

    // 同步 canvas 解析度
    const displayWidth = canvas.clientWidth
    const displayHeight = canvas.clientHeight
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth
      canvas.height = displayHeight
      gl.viewport(0, 0, displayWidth, displayHeight)
    }

    // 設定 uniform
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    if (timeLocation) {
      gl.uniform1f(timeLocation, (Date.now() - startTime) / 1000)
    }

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    if (resolutionLocation) {
      gl.uniform2f(resolutionLocation, displayWidth, displayHeight)
    }

    const mouseLocation = gl.getUniformLocation(program, 'u_mouse')
    if (mouseLocation) {
      gl.uniform2f(
        mouseLocation,
        mouse.elementX.value,
        displayHeight - mouse.elementY.value,
      )
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    animationFrameId = requestAnimationFrame(render)
  }

  // 監聽 fragment / vertex source 變化自動重新編譯
  watch(
    [
      () => toValue(options.fragmentShaderSource),
      () => toValue(options.vertexShaderSource),
    ],
    () => {
      compile(toValue(options.fragmentShaderSource))
    },
    { immediate: true },
  )

  // 監聽 canvas 出現/消失（配合 LazyRender）
  watch(
    () => toValue(canvasRef),
    (canvas, oldCanvas) => {
      if (!canvas && oldCanvas) {
        // canvas 被移除，釋放資源
        dispose()
        return
      }
      if (canvas) {
        compile(toValue(options.fragmentShaderSource))
        animationFrameId = requestAnimationFrame(render)
      }
    },
    { immediate: true },
  )

  onUnmounted(dispose)

  return {
    error,
  }
}
