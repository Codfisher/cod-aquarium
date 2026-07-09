import type { Boid } from './boid'
import { computeShellCountScale } from './flock'
import { clamp01 } from './utils'

/** WebGL2 shader 渲染器（真 3D）。
 *
 * 每隻魚傳入完整朝向的兩個基向量（f 前向、u 上向），fragment 在每個像素
 * 沿視線方向對真正的 3D 部位做深度排序投影：
 * - 身體：扁橢球，用 Schur 補數解析算出任何朝向下的真實投影輪廓
 * - 雙眼：3D 球，靠深度排序自動達成 zdog 的 backface 遮蔽
 * - 尾／鰭／皇冠：真 3D 平面三角形，隨朝向投影、邊緣自然收合
 *
 * 因此任何角度都是真投影、翻身是真的轉過正面/背面，
 * 不需要鏡像、翻轉縮放、深度角這類 2D 假招。
 * 幾何常數以魚體尺寸為單位（size = 1），對應 fish-model.ts 的 zdog 模型
 */

/** 顯示朝向的追隨速率（每秒），濾掉轉向力造成的微抖 */
const ORIENTATION_SMOOTH_RATE = 12

/** 尾鰭擺動幅度（rad），連續正弦擺動，繞垂直軸左右擺 */
const TAIL_WAG_AMPLITUDE = 0.6

/** 最遠處的魚混向背景色的最大比例 */
const MAX_DEPTH_FOG = 0.7

const BUBBLE_LIMIT = 60
const TWO_PI = Math.PI * 2

/** 每個魚 instance 的 float 數（4 個 vec4 屬性） */
const FISH_INSTANCE_FLOAT_COUNT = 16
/** 每個泡泡 instance 的 float 數（1 個 vec4 屬性） */
const BUBBLE_INSTANCE_FLOAT_COUNT = 4

const FISH_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aQuad;
/** 中心 x, 中心 y, 景深縮放, 魚體尺寸 */
layout(location = 1) in vec4 aTransform;
/** 前向 f.xyz, 尾擺角 */
layout(location = 2) in vec4 aForward;
/** 上向 u.xyz, 霧量 */
layout(location = 3) in vec4 aUp;
/** 是否領頭魚, 明度差異, 透明度, 保留 */
layout(location = 4) in vec4 aStyle;

uniform vec2 uResolution;

out vec2 vLocal;
flat out vec3 vForward;
flat out vec3 vUp;
/** 尺寸, 尾擺角, 霧量, 領頭魚 */
flat out vec4 vParams;
/** 明度差異, 透明度 */
flat out vec2 vStyle;

void main() {
  float size = aTransform.w;
  // quad 半徑取魚體尺寸（含尾、鰭、皇冠與筆畫的外接範圍）
  vec2 local = aQuad * size;
  vLocal = local;
  vForward = aForward.xyz;
  vUp = aUp.xyz;
  vParams = vec4(size, aForward.w, aUp.w, aStyle.x);
  vStyle = aStyle.yz;

  vec2 screen = aTransform.xy + local * aTransform.z;
  vec2 ndc = screen / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`

const FISH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec3 vForward;
flat in vec3 vUp;
flat in vec4 vParams;
flat in vec2 vStyle;

uniform vec3 uFogColor;

out vec4 outColor;

// 調色盤，對應 fish-model.ts 的 zdog 模型
const vec3 BODY_BLUE = vec3(0.749, 0.922, 1.0);
const vec3 BODY_GOLD = vec3(1.0, 0.843, 0.322);
const vec3 EYE_BLUE = vec3(0.247, 0.498, 0.651);
const vec3 EYE_GOLD = vec3(0.671, 0.549, 0.169);
const vec3 CROWN_GOLD = vec3(0.961, 0.702, 0.004);

// 身體橢球半軸（size 單位）：長、高、厚
const vec3 BODY_AXES = vec3(0.55, 0.33, 0.14);

/** 平面三角形 SDF（面積正負號判斷內外，跨 GPU 穩定） */
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

/** 深度排序累加器：nearest（frontZ 最大）的實心部位決定顏色，
 * uni 為聯集覆蓋率（外輪廓抗鋸齒），fb 為邊緣退路顏色
 */
struct Acc {
  float bestZ;
  vec3 col;
  bool got;
  float uni;
  float fbCov;
  vec3 fbCol;
};

void consider(inout Acc a, float cov, float z, vec3 color) {
  a.uni = max(a.uni, cov);
  if (cov > a.fbCov) {
    a.fbCov = cov;
    a.fbCol = color;
  }
  if (cov > 0.5 && z > a.bestZ) {
    a.bestZ = z;
    a.col = color;
    a.got = true;
  }
}

/** 本地座標轉世界（R 的欄為 f, u, s） */
vec3 toWorld(vec3 local, vec3 f, vec3 u, vec3 s) {
  return f * local.x + u * local.y + s * local.z;
}

/** 平面三角形部位：投影三頂點、2D 三角形 SDF 覆蓋、平面交點求 frontZ */
void addTriangle(
  inout Acc a, vec2 p, vec3 v0, vec3 v1, vec3 v2,
  vec3 f, vec3 u, vec3 s, float round, vec3 color
) {
  vec3 w0 = toWorld(v0, f, u, s);
  vec3 w1 = toWorld(v1, f, u, s);
  vec3 w2 = toWorld(v2, f, u, s);

  float d = sdTriangle(p, w0.xy, w1.xy, w2.xy) - round;
  float aa = fwidth(d) + 1e-4;
  float cov = 1.0 - smoothstep(-aa, aa, d);

  vec3 n = cross(w1 - w0, w2 - w0);
  // 平面近乎與視線平行（edge-on）時投影三角形退化，cov 自然趨近 0
  float z = abs(n.z) < 1e-3
    ? -1e9
    : (dot(n, w0) - n.x * p.x - n.y * p.y) / n.z;

  consider(a, cov, z, color);
}

/** 眼睛：3D 球，投影為圓；靠 frontZ 深度排序自動達成背面遮蔽 */
void addEye(
  inout Acc a, vec2 p, vec3 center, float radius,
  vec3 f, vec3 u, vec3 s, vec3 color
) {
  vec3 w = toWorld(center, f, u, s);
  float dist = length(p - w.xy);
  float d = dist - radius;
  float aa = fwidth(d) + 1e-4;
  float cov = 1.0 - smoothstep(-aa, aa, d);
  float z = w.z + sqrt(max(0.0, radius * radius - dist * dist));
  consider(a, cov, z, color);
}

void main() {
  float size = vParams.x;
  float wag = vParams.y;
  float fog = vParams.z;
  bool leader = vParams.w > 0.5;
  float shade = vStyle.x;
  float alpha = vStyle.y;

  // 世界座標沿用 zdog 的 y 向下慣例（背鰭在負 y = 螢幕上方），size 為單位
  vec2 p = vLocal / size;

  vec3 f = normalize(vForward);
  vec3 u = normalize(vUp);
  vec3 s = cross(f, u);

  vec3 bodyColor = (leader ? BODY_GOLD : BODY_BLUE) * shade;
  vec3 eyeColor = leader ? EYE_GOLD : EYE_BLUE;

  Acc acc = Acc(-1e9, vec3(0.0), false, 0.0, 0.0, vec3(0.0));

  // 身體橢球：以 Q = R·diag(1/軸²)·Rᵀ 的 Schur 補數，
  // 解析求出正交投影下的真實輪廓橢圓（任何朝向都正確、含厚度）
  vec3 invSq = 1.0 / (BODY_AXES * BODY_AXES);
  float q00 = invSq.x * f.x * f.x + invSq.y * u.x * u.x + invSq.z * s.x * s.x;
  float q01 = invSq.x * f.x * f.y + invSq.y * u.x * u.y + invSq.z * s.x * s.y;
  float q02 = invSq.x * f.x * f.z + invSq.y * u.x * u.z + invSq.z * s.x * s.z;
  float q11 = invSq.x * f.y * f.y + invSq.y * u.y * u.y + invSq.z * s.y * s.y;
  float q12 = invSq.x * f.y * f.z + invSq.y * u.y * u.z + invSq.z * s.y * s.z;
  float q22 = invSq.x * f.z * f.z + invSq.y * u.z * u.z + invSq.z * s.z * s.z;

  float m00 = q00 - q02 * q02 / q22;
  float m01 = q01 - q02 * q12 / q22;
  float m11 = q11 - q12 * q12 / q22;
  float eBody = m00 * p.x * p.x + 2.0 * m01 * p.x * p.y + m11 * p.y * p.y;

  float aaBody = fwidth(eBody) + 1e-4;
  float bodyCov = 1.0 - smoothstep(1.0 - aaBody, 1.0 + aaBody, eBody);
  float zCenter = -(q02 * p.x + q12 * p.y) / q22;
  float bodyZ = zCenter + sqrt(max(0.0, (1.0 - eBody)) / q22);
  consider(acc, bodyCov, bodyZ, bodyColor);

  // 背鰭（平面三角形）
  addTriangle(
    acc, p,
    vec3(0.16, -0.24, 0.0), vec3(-0.04, -0.52, 0.0), vec3(-0.2, -0.26, 0.0),
    f, u, s, 0.06, bodyColor
  );

  // 尾巴：繞垂直軸擺動的平面三角形
  float cosW = cos(wag);
  float sinW = sin(wag);
  addTriangle(
    acc, p,
    vec3(-0.5, 0.0, 0.0),
    vec3(-0.5 - 0.3 * cosW, 0.2, 0.3 * sinW),
    vec3(-0.5 - 0.3 * cosW, -0.2, 0.3 * sinW),
    f, u, s, 0.1, bodyColor
  );

  // 領頭魚的小皇冠：3 個尖角。底邊塞進頭頂（約 -0.3），
  // 塞入部分會被身體依深度遮住，只露出上方尖角，看起來戴在頭上
  if (leader) {
    addTriangle(acc, p, vec3(0.03, -0.3, 0.0), vec3(0.13, -0.3, 0.0), vec3(0.08, -0.47, 0.0), f, u, s, 0.04, CROWN_GOLD);
    addTriangle(acc, p, vec3(0.12, -0.3, 0.0), vec3(0.24, -0.3, 0.0), vec3(0.18, -0.52, 0.0), f, u, s, 0.04, CROWN_GOLD);
    addTriangle(acc, p, vec3(0.23, -0.3, 0.0), vec3(0.33, -0.3, 0.0), vec3(0.28, -0.47, 0.0), f, u, s, 0.04, CROWN_GOLD);
  }

  // 雙眼：兩側各一，near 側靠 frontZ 勝出、far 側被身體遮蔽
  addEye(acc, p, vec3(0.25, -0.05, 0.16), 0.055, f, u, s, eyeColor);
  addEye(acc, p, vec3(0.25, -0.05, -0.16), 0.055, f, u, s, eyeColor);

  vec3 base = acc.got ? acc.col : acc.fbCol;
  // 景深霧化：顏色混向背景色，透明度不變
  vec3 color = mix(base, uFogColor, fog);
  float a = acc.uni * alpha;
  outColor = vec4(color * a, a);
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
    setupInstanceAttributes(gl, 1, 4)

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
      const isFirst = this.fishConfigList.length === 0
      this.fishConfigList.push({
        // 領頭魚放大 1.5 倍，更顯眼
        size: isFirst ? fishSize * 1.5 : fishSize,
        isFirst,
        wagPhase: Math.random(),
        wagRateScale: 0.85 + Math.random() * 0.3,
        displayHeadingX: Number.NaN,
        displayHeadingY: Number.NaN,
        displayHeadingZ: Number.NaN,
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

    // 畫家演算法：z 小（遠）的先畫，與整體景深一致
    const drawOrder = this.drawOrderScratch
    drawOrder.length = count
    for (let i = 0; i < count; i++) {
      drawOrder[i] = i
    }
    drawOrder.sort(
      (a, b) => boidList[a]!.position.z - boidList[b]!.position.z,
    )

    const requiredCapacity = count * FISH_INSTANCE_FLOAT_COUNT
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

      // 尾擺：連續正弦擺動，游速越快擺越快
      const wagRate = (0.8 + boid.velocity.length() / 60) * config.wagRateScale
      config.wagPhase = (config.wagPhase + wagRate * deltaSeconds) % 1
      const wagAngle = Math.sin(config.wagPhase * TWO_PI) * TAIL_WAG_AMPLITUDE

      const scale = 1 + boid.position.z / 500
      const fog = this.computeDepthFog(boid.position.z)

      instanceCount = this.writeFishInstance(instanceCount, boid, config, scale, wagAngle, fog)
    }

    return instanceCount
  }

  /** 由平滑朝向建立正交基（f 前向、u 為本地 +y），寫入單一 instance。
   *
   * 世界座標系沿用 zdog：x 向右、y 向下、z 朝觀者，與 heading 同向，
   * 故 f = heading。u 取世界 (0,1,0) 去除 f 分量（背鰭在本地 -y，
   * 因此本地 +y 對應螢幕下方），near-vertical 奇異時改用 z 參考
   */
  private writeFishInstance(
    instanceIndex: number,
    boid: Boid,
    config: FishRenderConfig,
    scale: number,
    wagAngle: number,
    fog: number,
  ): number {
    let fx = config.displayHeadingX
    let fy = config.displayHeadingY
    let fz = config.displayHeadingZ
    const fLen = Math.hypot(fx, fy, fz) || 1
    fx /= fLen
    fy /= fLen
    fz /= fLen

    // u = 世界上方 (0,1,0) 去除 f 分量後正規化
    let dot = fy
    let ux = -fx * dot
    let uy = 1 - fy * dot
    let uz = -fz * dot
    let uLen = Math.hypot(ux, uy, uz)
    if (uLen < 1e-3) {
      // f 幾乎垂直，改用世界前方 (0,0,1) 當參考
      dot = fz
      ux = -fx * dot
      uy = -fy * dot
      uz = 1 - fz * dot
      uLen = Math.hypot(ux, uy, uz) || 1
    }
    ux /= uLen
    uy /= uLen
    uz /= uLen

    const data = this.fishInstanceData
    const offset = instanceIndex * FISH_INSTANCE_FLOAT_COUNT

    data[offset] = boid.position.x
    data[offset + 1] = boid.position.y
    data[offset + 2] = scale
    data[offset + 3] = config.size
    data[offset + 4] = fx
    data[offset + 5] = fy
    data[offset + 6] = fz
    data[offset + 7] = wagAngle
    data[offset + 8] = ux
    data[offset + 9] = uy
    data[offset + 10] = uz
    data[offset + 11] = fog
    data[offset + 12] = config.isFirst ? 1 : 0
    data[offset + 13] = config.shadeScale
    data[offset + 14] = 1
    data[offset + 15] = 0

    return instanceIndex + 1
  }

  /** 景深霧量：z 越小（越遠）混入越多背景色，靠近鏡頭時為 0。
   *
   * 淡化範圍套用與殼相同的數量縮放，魚少、殼縮小時濃淡層次不會消失
   */
  private computeDepthFog(z: number) {
    const range = this.depthFadeRange
      * computeShellCountScale(this.fishConfigList.length)
    // z ≥ 0（殼的近半與中心）清晰，只有背面（z < 0）往深處漸淡
    const ratio = clamp01((z + range) / range)
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
