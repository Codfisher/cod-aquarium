import type { Boid } from './boid'
import { computeUprightRotation } from './fish-model'
import { computeShellCountScale } from './flock'
import { clamp01 } from './utils'

/** WebGL2 shader 渲染器。
 *
 * 以 SDF（有號距離場）在 fragment shader 解析重現 zdog 的質感——
 * zdog 的視覺特徵是「正交投影＋定寬圓頭筆畫＋平塗色＋畫家排序」，
 * 每個部位（身體、背鰭、眼睛、尾巴、皇冠）都是同一套投影數學：
 * x 軸乘上 cos(深度角)、筆畫為固定半徑的圓頭描邊、依 z 順序覆蓋合成。
 *
 * 相較 sprite 圖集，所有姿態參數（深度角、尾擺、霧化）都是連續值，
 * 不再有量化格與相位跳變，邊緣由 SDF 抗鋸齒、任何縮放下都銳利。
 * 幾何常數與 fish-model.ts 的 zdog 模型一一對應
 */

/** 顯示朝向的追隨速率（每秒），濾掉轉向力造成的微抖 */
const ORIENTATION_SMOOTH_RATE = 12
/** 左右鏡像切換的遲滯量 */
const FLIP_HYSTERESIS = 0.25
/** 鏡像切換後的冷卻秒數 */
const FLIP_COOLDOWN_SECONDS = 0.4
/** 鏡像過渡速率（每秒），以交叉淡化取代瞬間翻面 */
const MIRROR_BLEND_RATE = 7

/** 尾鰭擺動幅度（rad），連續正弦擺動，繞垂直軸左右擺 */
const TAIL_WAG_AMPLITUDE = 0.6

/** 最遠處的魚混向背景色的最大比例 */
const MAX_DEPTH_FOG = 0.7

const BUBBLE_LIMIT = 60
const TWO_PI = Math.PI * 2

/** 每個魚 instance 的 float 數（3 個 vec4 屬性） */
const FISH_INSTANCE_FLOAT_COUNT = 12
/** 每個泡泡 instance 的 float 數（1 個 vec4 屬性） */
const BUBBLE_INSTANCE_FLOAT_COUNT = 4

const FISH_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aQuad;
/** x, y, 縮放, 螢幕旋轉角 */
layout(location = 1) in vec4 aTransform;
/** 深度角, 尾擺角, 鏡像(+1/-1), 透明度 */
layout(location = 2) in vec4 aPose;
/** 魚體尺寸, 霧量, 是否領頭魚, 明度差異 */
layout(location = 3) in vec4 aStyle;

uniform vec2 uResolution;

out vec2 vLocal;
flat out vec4 vPose;
flat out vec4 vStyle;

void main() {
  float size = aStyle.x;
  // quad 半徑取魚體尺寸（含尾巴、皇冠與筆畫的外接範圍）
  vec2 local = aQuad * size;
  vLocal = local;
  vPose = aPose;
  vStyle = aStyle;

  vec2 scaled = local * aTransform.z;
  float c = cos(aTransform.w);
  float s = sin(aTransform.w);
  vec2 rotated = vec2(c * scaled.x - s * scaled.y, s * scaled.x + c * scaled.y);
  // 鏡像為最外層變換，與 2D 版 scale(-1, 1) 後再旋轉等價
  rotated.x *= aPose.z;

  vec2 screen = aTransform.xy + rotated;
  vec2 ndc = screen / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`

const FISH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec4 vPose;
flat in vec4 vStyle;

uniform vec3 uFogColor;

out vec4 outColor;

// 調色盤，對應 fish-model.ts 的 zdog 模型
const vec3 BODY_BLUE = vec3(0.749, 0.922, 1.0);
const vec3 BODY_GOLD = vec3(1.0, 0.843, 0.322);
const vec3 EYE_BLUE = vec3(0.247, 0.498, 0.651);
const vec3 EYE_GOLD = vec3(0.671, 0.549, 0.169);
const vec3 CROWN_GOLD = vec3(0.961, 0.702, 0.004);

/** 近似橢圓 SDF（梯度正規化），邊界附近誤差極小 */
float sdEllipse(vec2 p, vec2 r) {
  float k1 = length(p / r);
  float k2 = length(p / (r * r));
  return k1 * (k1 - 1.0) / max(k2, 1e-6);
}

float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0;
  vec2 e1 = p2 - p1;
  vec2 e2 = p0 - p2;
  vec2 v0 = p - p0;
  vec2 v1 = p - p1;
  vec2 v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(
    min(
      vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
      vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))
    ),
    vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x))
  );
  return -sqrt(d.x) * sign(d.y);
}

float sdPolygon7(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3, vec2 v4, vec2 v5, vec2 v6) {
  vec2 v[7] = vec2[7](v0, v1, v2, v3, v4, v5, v6);
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0, j = 6; i < 7; j = i, i++) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) {
      s *= -1.0;
    }
  }
  return s * sqrt(d);
}

/** 畫家式覆蓋合成：後畫的形狀蓋住先畫的，邊緣以 SDF 抗鋸齒。
 * 全程使用 premultiplied alpha，邊緣半覆蓋像素才不會混進黑底產生黑邊
 */
vec4 paintShape(vec4 acc, float sd, vec3 color) {
  float aa = max(fwidth(sd), 1e-4);
  float coverage = 1.0 - smoothstep(-aa, aa, sd);
  return vec4(
    color * coverage + acc.rgb * (1.0 - coverage),
    coverage + acc.a * (1.0 - coverage)
  );
}

void main() {
  float size = vStyle.x;
  float fog = vStyle.y;
  bool leader = vStyle.z > 0.5;
  float shade = vStyle.w;
  float depthAngle = vPose.x;
  float wagAngle = vPose.y;
  float alpha = vPose.w;

  // 每隻魚有些微明度差異，重疊時能看出層次而不糊成一團
  vec3 bodyColor = (leader ? BODY_GOLD : BODY_BLUE) * shade;
  vec3 eyeColor = leader ? EYE_GOLD : EYE_BLUE;
  // 描邊為身體色略往眼睛色（同色系深色調）偏移，保持淡淡的輪廓
  vec3 outlineColor = mix(bodyColor, eyeColor, 0.2);

  float thickness = size / 5.0;
  float cosD = cos(depthAngle);
  float sinD = sin(depthAngle);
  vec2 p = vLocal;

  // 各部位 SDF
  float sdFin = sdTriangle(
    p,
    vec2(size * 0.16 * cosD, size * -0.24),
    vec2(size * -0.04 * cosD, size * -0.52),
    vec2(size * -0.2 * cosD, size * -0.26)
  ) - thickness * 0.3;

  // 身體：橢圓 + 定寬圓頭描邊，x 軸依深度角透視收縮
  float sdBody = sdEllipse(
    p,
    vec2(max(size * 0.5 * cosD, 0.75), size * 0.3)
  ) - thickness * 0.5;

  // 尾巴：繞尾根做深度角 + 擺動角旋轉，投影為 x 縮放
  float cosTail = cos(depthAngle + wagAngle);
  vec2 tailPoint = p - vec2(size * -0.5 * cosD, 0.0);
  float sdTail = sdTriangle(
    tailPoint,
    vec2(0.0, 0.0),
    vec2(thickness * -1.5 * cosTail, -thickness),
    vec2(thickness * -1.5 * cosTail, thickness)
  ) - thickness * 0.5;

  vec4 acc = vec4(0.0);

  // 輪廓描邊：整體剪影向外擴一圈先畫深色，
  // 部位疊上後剩下的環就是描邊，重疊的魚彼此有輪廓分隔
  float outlineWidth = max(0.6, size * 0.04);
  float sdSilhouette = min(sdBody, min(sdFin, sdTail));
  acc = paintShape(acc, sdSilhouette - outlineWidth, outlineColor);

  // 背鰭（先畫，讓身體蓋住相接處）
  acc = paintShape(acc, sdFin, bodyColor);
  acc = paintShape(acc, sdBody, bodyColor);
  acc = paintShape(acc, sdTail, bodyColor);

  // 領頭魚的小皇冠
  if (leader) {
    acc = paintShape(
      acc,
      sdPolygon7(
        p,
        vec2(size * 0.04 * cosD, size * -0.4),
        vec2(size * 0.08 * cosD, size * -0.56),
        vec2(size * 0.13 * cosD, size * -0.46),
        vec2(size * 0.18 * cosD, size * -0.6),
        vec2(size * 0.23 * cosD, size * -0.46),
        vec2(size * 0.28 * cosD, size * -0.56),
        vec2(size * 0.32 * cosD, size * -0.4)
      ) - thickness * 0.2,
      CROWN_GOLD
    );
  }

  // 眼睛：zdog backface 規則下，深度角範圍內永遠是 +z 側那顆可見，
  // 位置隨轉向水平位移。圓片隨深度角透視收縮，
  // 並保留 zdog 筆畫厚度的最小寬度——側視時縮成細條而非瞬間消失
  float eyeOffsetZ = thickness * 0.5 + 1.0;
  vec2 eyeCenter = vec2(size * 0.25 * cosD - eyeOffsetZ * sinD, size * -0.05);
  float eyeRadius = size * 0.05;
  acc = paintShape(
    acc,
    sdEllipse(p - eyeCenter, vec2(max(eyeRadius * cosD, 0.6), eyeRadius)),
    eyeColor
  );

  // 景深霧化：顏色混向背景色（霧色乘上相同 alpha 保持 premultiplied），
  // 透明度不變
  vec3 color = mix(acc.rgb, uFogColor * acc.a, fog);
  outColor = vec4(color * alpha, acc.a * alpha);
}
`

const BUBBLE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aQuad;
/** x, y, 半徑, 透明度 */
layout(location = 1) in vec4 aBubble;

uniform vec2 uResolution;

out vec2 vLocal;
flat out vec4 vBubble;

void main() {
  float extent = aBubble.z + 1.5;
  vec2 local = aQuad * extent;
  vLocal = local;
  vBubble = aBubble;

  vec2 screen = aBubble.xy + local;
  vec2 ndc = screen / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`

const BUBBLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec4 vBubble;

out vec4 outColor;

// 泡泡描邊色，對應 2D 版的 #8fcfe8
const vec3 BUBBLE_COLOR = vec3(0.561, 0.812, 0.910);

void main() {
  // 圓環 SDF：半徑處 1px 的描邊，premultiplied alpha 輸出
  float sd = abs(length(vLocal) - vBubble.z) - 0.5;
  float aa = max(fwidth(sd), 1e-4);
  float coverage = 1.0 - smoothstep(-aa, aa, sd);
  float alpha = coverage * vBubble.w;
  outColor = vec4(BUBBLE_COLOR * alpha, alpha);
}
`

interface FishRenderConfig {
  /** 建立當下的魚體尺寸（之後尺寸變更不影響既有的魚） */
  size: number;
  /** 第一隻魚為金色領頭魚 */
  isFirst: boolean;
  /** 尾擺相位（0~1），逐幀累加 */
  wagPhase: number;
  /** 個體擺動速率差異，避免整群魚同步擺尾 */
  wagRateScale: number;
  /** 顯示用朝向向量（指數平滑追隨實際值），初始為 NaN、首幀直接對齊 */
  displayHeadingX: number;
  displayHeadingY: number;
  displayHeadingZ: number;
  /** 是否左右鏡像（魚頭朝左時鏡像 nose-right 的姿態），帶遲滯 */
  mirrored: boolean;
  /** 鏡像切換的剩餘冷卻秒數 */
  mirrorCooldown: number;
  /** 鏡像過渡進度（0 = 未鏡像、1 = 鏡像），朝 mirrored 對應值滑動 */
  mirrorBlend: number;
  /** 個體明度差異（約 0.97~1.03），讓重疊的魚看得出層次 */
  shadeScale: number;
}

interface Bubble {
  x: number;
  y: number;
  riseSpeed: number;
  driftPhase: number;
  radius: number;
  age: number;
  lifetime: number;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('無法建立 shader')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader 編譯失敗：${log}`)
  }
  return shader
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const program = gl.createProgram()
  if (!program) {
    throw new Error('無法建立 program')
  }

  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program 連結失敗：${gl.getProgramInfoLog(program)}`)
  }
  return program
}

/** 解析 #rrggbb 色碼為 0~1 的 RGB */
function parseHexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [
    ((value >> 16) & 0xFF) / 255,
    ((value >> 8) & 0xFF) / 255,
    (value & 0xFF) / 255,
  ]
}

/** 上傳 instance 資料：容量足夠時用 bufferSubData，不足時擴充配置。
 * 回傳更新後的 GPU 端容量（float 數）
 */
function uploadInstanceData(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  floatCount: number,
  capacity: number,
): number {
  if (data.length > capacity) {
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    return data.length
  }

  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, floatCount))
  return capacity
}

/** 設定 instanced vec4 屬性群 */
function setupInstanceAttributes(
  gl: WebGL2RenderingContext,
  startLocation: number,
  vec4Count: number,
) {
  const stride = vec4Count * 4 * 4
  for (let i = 0; i < vec4Count; i++) {
    const location = startLocation + i
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, stride, i * 16)
    gl.vertexAttribDivisor(location, 1)
  }
}

export class FishShaderRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly canvas: HTMLCanvasElement

  private readonly fishProgram: WebGLProgram
  private readonly fishVao: WebGLVertexArrayObject
  private readonly fishInstanceBuffer: WebGLBuffer
  private readonly fishResolutionLocation: WebGLUniformLocation | null
  private readonly fishFogColorLocation: WebGLUniformLocation | null

  private readonly bubbleProgram: WebGLProgram
  private readonly bubbleVao: WebGLVertexArrayObject
  private readonly bubbleInstanceBuffer: WebGLBuffer
  private readonly bubbleResolutionLocation: WebGLUniformLocation | null

  private fishInstanceData = new Float32Array(FISH_INSTANCE_FLOAT_COUNT * 64)
  private bubbleInstanceData = new Float32Array(BUBBLE_INSTANCE_FLOAT_COUNT * BUBBLE_LIMIT)
  /** GPU 端已配置的容量（float 數）。
   * 每幀重新 bufferData 會反覆重配 GPU 緩衝、偶發管線停頓，
   * 改為容量不足時才擴充，平時用 bufferSubData 更新
   */
  private fishBufferCapacity = 0
  private bubbleBufferCapacity = 0

  private readonly fishConfigList: FishRenderConfig[] = []
  private readonly bubbleList: Bubble[] = []
  private readonly drawOrderScratch: number[] = []

  private width = 0
  private height = 0
  private pixelRatio = 1
  private fogColor: [number, number, number] = [1, 1, 1]
  /** 景深淡化的半徑，通常等於殼半徑＋殼厚度 */
  private depthFadeRange = 200
  private bubbleSpawnCooldown = 1

  /** WebGL2 不可用時回傳 undefined，由呼叫端退回 2D 渲染器 */
  static tryCreate(canvas: HTMLCanvasElement): FishShaderRenderer | undefined {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    })
    if (!gl) {
      return undefined
    }

    try {
      return new FishShaderRenderer(canvas, gl)
    }
    catch (error) {
      console.error('[bg-flock] shader 渲染器初始化失敗', error)
      return undefined
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas
    this.gl = gl

    const quadBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    )

    // 魚
    this.fishProgram = createProgram(gl, FISH_VERTEX_SHADER, FISH_FRAGMENT_SHADER)
    this.fishResolutionLocation = gl.getUniformLocation(this.fishProgram, 'uResolution')
    this.fishFogColorLocation = gl.getUniformLocation(this.fishProgram, 'uFogColor')

    this.fishVao = gl.createVertexArray()!
    gl.bindVertexArray(this.fishVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.fishInstanceBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fishInstanceBuffer)
    setupInstanceAttributes(gl, 1, 3)

    // 泡泡
    this.bubbleProgram = createProgram(gl, BUBBLE_VERTEX_SHADER, BUBBLE_FRAGMENT_SHADER)
    this.bubbleResolutionLocation = gl.getUniformLocation(this.bubbleProgram, 'uResolution')

    this.bubbleVao = gl.createVertexArray()!
    gl.bindVertexArray(this.bubbleVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.bubbleInstanceBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bubbleInstanceBuffer)
    setupInstanceAttributes(gl, 1, 1)

    gl.bindVertexArray(null)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    // premultiplied alpha 的 source-over
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
  }

  setFogColor(color: string) {
    this.fogColor = parseHexColor(color)
  }

  setDepthFadeRange(range: number) {
    this.depthFadeRange = range
  }

  /** 差量同步魚的外觀設定 */
  syncFishCount(count: number, fishSize: number) {
    while (this.fishConfigList.length < count) {
      this.fishConfigList.push({
        size: fishSize,
        isFirst: this.fishConfigList.length === 0,
        wagPhase: Math.random(),
        wagRateScale: 0.85 + Math.random() * 0.3,
        displayHeadingX: Number.NaN,
        displayHeadingY: Number.NaN,
        displayHeadingZ: Number.NaN,
        mirrored: false,
        mirrorCooldown: 0,
        mirrorBlend: 0,
        shadeScale: 0.97 + Math.random() * 0.06,
      })
    }

    if (this.fishConfigList.length > count) {
      this.fishConfigList.length = count
    }
  }

  spawnBubbles(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.bubbleList.length >= BUBBLE_LIMIT) {
        this.bubbleList.shift()
      }

      this.bubbleList.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        riseSpeed: 18 + Math.random() * 22,
        driftPhase: Math.random() * TWO_PI,
        radius: 0.8 + Math.random() * 1.2,
        age: 0,
        lifetime: 1.5 + Math.random() * 1.5,
      })
    }
  }

  render(boidList: Boid[], deltaSeconds: number) {
    const { gl, canvas } = this

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const fishInstanceCount = this.fillFishInstances(boidList, deltaSeconds)
    if (fishInstanceCount > 0) {
      gl.useProgram(this.fishProgram)
      gl.uniform2f(this.fishResolutionLocation, this.width, this.height)
      gl.uniform3f(this.fishFogColorLocation, ...this.fogColor)

      gl.bindVertexArray(this.fishVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fishInstanceBuffer)
      this.fishBufferCapacity = uploadInstanceData(
        gl,
        this.fishInstanceData,
        fishInstanceCount * FISH_INSTANCE_FLOAT_COUNT,
        this.fishBufferCapacity,
      )
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fishInstanceCount)
    }

    this.updateBubbles(boidList, deltaSeconds)
    const bubbleInstanceCount = this.fillBubbleInstances()
    if (bubbleInstanceCount > 0) {
      gl.useProgram(this.bubbleProgram)
      gl.uniform2f(this.bubbleResolutionLocation, this.width, this.height)

      gl.bindVertexArray(this.bubbleVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bubbleInstanceBuffer)
      this.bubbleBufferCapacity = uploadInstanceData(
        gl,
        this.bubbleInstanceData,
        bubbleInstanceCount * BUBBLE_INSTANCE_FLOAT_COUNT,
        this.bubbleBufferCapacity,
      )
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bubbleInstanceCount)
    }

    gl.bindVertexArray(null)
  }

  /** 更新每隻魚的顯示狀態並寫入 instance 資料，回傳 instance 數量 */
  private fillFishInstances(boidList: Boid[], deltaSeconds: number): number {
    const count = Math.min(boidList.length, this.fishConfigList.length)

    // 畫家演算法：z 小（遠）的先畫，與 zdog 的 z 排序一致
    const drawOrder = this.drawOrderScratch
    drawOrder.length = count
    for (let i = 0; i < count; i++) {
      drawOrder[i] = i
    }
    drawOrder.sort(
      (a, b) => boidList[a]!.position.z - boidList[b]!.position.z,
    )

    // 鏡像過渡中每隻魚需要兩個 instance，預留兩倍容量
    const requiredCapacity = count * 2 * FISH_INSTANCE_FLOAT_COUNT
    if (this.fishInstanceData.length < requiredCapacity) {
      this.fishInstanceData = new Float32Array(requiredCapacity)
    }

    /** 指數平滑係數：與幀率無關的追隨比例 */
    const orientationAlpha = 1 - Math.exp(-ORIENTATION_SMOOTH_RATE * deltaSeconds)

    let instanceCount = 0

    for (const index of drawOrder) {
      const boid = boidList[index]!
      const config = this.fishConfigList[index]!

      // 顯示朝向平滑追隨實際朝向（向量內插，無尤拉角的繞角問題）
      if (Number.isNaN(config.displayHeadingX)) {
        config.displayHeadingX = boid.heading.x
        config.displayHeadingY = boid.heading.y
        config.displayHeadingZ = boid.heading.z
      }
      else {
        config.displayHeadingX
          += (boid.heading.x - config.displayHeadingX) * orientationAlpha
        config.displayHeadingY
          += (boid.heading.y - config.displayHeadingY) * orientationAlpha
        config.displayHeadingZ
          += (boid.heading.z - config.displayHeadingZ) * orientationAlpha
      }

      const headingX = config.displayHeadingX
      const headingY = config.displayHeadingY
      const headingZ = config.displayHeadingZ

      const inPlaneLength = Math.hypot(headingX, headingY)
      const depthAngle = Math.atan2(headingZ, inPlaneLength)
      const rotationNormal = computeUprightRotation(headingX, headingY, inPlaneLength)
      const rotationMirrored = computeUprightRotation(-headingX, headingY, inPlaneLength)

      // 魚頭朝左時左右鏡像（遲滯＋冷卻＋交叉淡化）
      config.mirrorCooldown = Math.max(0, config.mirrorCooldown - deltaSeconds)
      if (config.mirrorCooldown <= 0) {
        const wasMirrored = config.mirrored
        if (config.mirrored) {
          if (headingX > FLIP_HYSTERESIS) {
            config.mirrored = false
          }
        }
        else if (headingX < -FLIP_HYSTERESIS) {
          config.mirrored = true
        }

        if (config.mirrored !== wasMirrored) {
          config.mirrorCooldown = FLIP_COOLDOWN_SECONDS
        }
      }

      const mirrorBlendTarget = config.mirrored ? 1 : 0
      if (config.mirrorBlend !== mirrorBlendTarget) {
        const maxStep = MIRROR_BLEND_RATE * deltaSeconds
        config.mirrorBlend += Math.max(
          -maxStep,
          Math.min(maxStep, mirrorBlendTarget - config.mirrorBlend),
        )
      }

      // 尾擺：連續正弦擺動，游速越快擺越快
      const wagRate = (0.8 + boid.velocity.length() / 60) * config.wagRateScale
      config.wagPhase = (config.wagPhase + wagRate * deltaSeconds) % 1
      const wagAngle = Math.sin(config.wagPhase * TWO_PI) * TAIL_WAG_AMPLITUDE

      const scale = 1 + boid.position.z / 500
      const fog = this.computeDepthFog(boid.position.z)

      if (config.mirrorBlend <= 0.001) {
        instanceCount = this.writeFishInstance(instanceCount, boid, config, scale, rotationNormal, depthAngle, wagAngle, fog, 1, 1)
      }
      else if (config.mirrorBlend >= 0.999) {
        instanceCount = this.writeFishInstance(instanceCount, boid, config, scale, rotationMirrored, depthAngle, wagAngle, fog, -1, 1)
      }
      else {
        // 翻面過渡中：兩面交叉淡化
        instanceCount = this.writeFishInstance(instanceCount, boid, config, scale, rotationNormal, depthAngle, wagAngle, fog, 1, 1 - config.mirrorBlend)
        instanceCount = this.writeFishInstance(instanceCount, boid, config, scale, rotationMirrored, depthAngle, wagAngle, fog, -1, config.mirrorBlend)
      }
    }

    return instanceCount
  }

  /** 寫入單一 instance，參數採位置引數避免高頻迴圈中配置暫時物件 */
  private writeFishInstance(
    instanceIndex: number,
    boid: Boid,
    config: FishRenderConfig,
    scale: number,
    rotation: number,
    depthAngle: number,
    wagAngle: number,
    fog: number,
    mirror: number,
    alpha: number,
  ): number {
    const data = this.fishInstanceData
    const offset = instanceIndex * FISH_INSTANCE_FLOAT_COUNT

    data[offset] = boid.position.x
    data[offset + 1] = boid.position.y
    data[offset + 2] = scale
    data[offset + 3] = rotation
    data[offset + 4] = depthAngle
    data[offset + 5] = wagAngle
    data[offset + 6] = mirror
    data[offset + 7] = alpha
    data[offset + 8] = config.size
    data[offset + 9] = fog
    data[offset + 10] = config.isFirst ? 1 : 0
    data[offset + 11] = config.shadeScale

    return instanceIndex + 1
  }

  /** 景深霧量：z 越小（越遠）混入越多背景色，靠近鏡頭時為 0。
   *
   * 淡化範圍套用與殼相同的數量縮放，魚少、殼縮小時濃淡層次不會消失
   */
  private computeDepthFog(z: number) {
    const range = this.depthFadeRange
      * computeShellCountScale(this.fishConfigList.length)
    const ratio = clamp01((z + range) / (2 * range))
    return MAX_DEPTH_FOG * (1 - ratio)
  }

  /** 更新泡泡：偶爾讓隨機一隻魚吐泡，泡泡上浮、左右漂、逾期淘汰 */
  private updateBubbles(boidList: Boid[], deltaSeconds: number) {
    this.bubbleSpawnCooldown -= deltaSeconds
    if (this.bubbleSpawnCooldown <= 0 && boidList.length > 0) {
      this.bubbleSpawnCooldown = 0.7 + Math.random() * 1.6

      const boid = boidList[Math.floor(Math.random() * boidList.length)]
      if (boid) {
        // 從嘴邊（鼻頭前方）冒出
        this.spawnBubbles(
          boid.position.x + boid.heading.x * 8,
          boid.position.y + boid.heading.y * 8,
          1 + Math.floor(Math.random() * 2),
        )
      }
    }

    let writeIndex = 0
    for (const bubble of this.bubbleList) {
      bubble.age += deltaSeconds
      if (bubble.age >= bubble.lifetime) {
        continue
      }

      bubble.y -= bubble.riseSpeed * deltaSeconds
      bubble.x += Math.sin(bubble.age * 4 + bubble.driftPhase) * 8 * deltaSeconds
      this.bubbleList[writeIndex] = bubble
      writeIndex++
    }
    this.bubbleList.length = writeIndex
  }

  private fillBubbleInstances(): number {
    const data = this.bubbleInstanceData
    let instanceCount = 0

    for (const bubble of this.bubbleList) {
      const fadeIn = clamp01(bubble.age / 0.25)
      const fadeOut = clamp01((bubble.lifetime - bubble.age) / 0.5)
      const offset = instanceCount * BUBBLE_INSTANCE_FLOAT_COUNT

      data[offset] = bubble.x
      data[offset + 1] = bubble.y
      data[offset + 2] = bubble.radius * (1 + bubble.age * 0.2)
      data[offset + 3] = fadeIn * fadeOut * 0.55
      instanceCount++
    }

    return instanceCount
  }
}
