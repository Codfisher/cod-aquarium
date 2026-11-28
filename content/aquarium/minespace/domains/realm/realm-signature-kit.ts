import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../weather/atmosphere'
import type { SkyAnchor } from './realm-signature-direction'
import { Constants, Effect, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { optOutOfFog } from '../renderer/fog-opt-out'

/**
 * 招牌景象的共用零件（渲染端）
 *
 * 雪稜有極光、地底湖窟有螢光蟲洞頂；其餘每一座大場景也各有一個「它的時刻」：
 * 某個時段、某種天氣才出現的大景（銀河、流星雨、環月、雁行、天燈、光柱……）。
 * 每一個都照極光的規矩做：一個網格、一支很小的著色器、一次繪製，沒有 render target。
 *
 * 十幾個景象要的東西大同小異，集中在這裡，各場景的檔案只剩形狀與顏色：
 *
 * - 此刻的條件（SignatureFrame）：夜裡露出多少、太陽多高、天有沒有被雨雪蓋住、人是不是在洞裡。
 *   全部從 AtmosphereState 算，不另外去問日夜循環或天氣
 * - 一層景象（createSignatureLayer）：建材質、掛觀察者、每幀寫 time 與 strength、
 *   亮度歸零時整個網格停用、換場景時把觀察者、網格與材質一起收掉
 * - 網格：頂點位置全在著色器裡算，網格只帶「第幾片、哪個角」這類索引（與極光同一個做法）
 * - GLSL 片段：雜湊、噪音、天球方向、掛在天球上的方片
 *
 * 兩種擺法：
 * - sky：掛在天球上（infiniteDistance，跟著鏡頭走），畫在預設那一層，
 *   所以地形擋得住、遠山與體積雲蓋得住、陰天罩淡入時一起被蓋掉
 * - world：放在世界座標上，畫在天氣那一層（各層之間不清深度，地形照樣擋得住）：
 *   半透明的水面在預設層是後畫的，留在預設層的話會被水面整片蓋掉（與湯煙谷的蒸氣同一個理由）
 */

/** 天球上的景象離鏡頭這麼遠，與極光同一個殼 */
export const SIGNATURE_SHELL_RADIUS = 200

/** 天氣那一層的編號，與 use-babylon-scene 的 WEATHER_RENDERING_GROUP 相同（那一支會把整個渲染環境拉進來，這裡不引用） */
const WEATHER_RENDERING_GROUP = 2

/** 亮度低於這個值就整個網格停用，省掉那一次繪製 */
const STRENGTH_EPSILON = 0.002

/** 平滑的區間映射：value 從 from 走到 to，回傳 0 到 1 */
export function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return ratio * ratio * (3 - 2 * ratio)
}

/** 天球上的方位換成單位向量，與著色器裡的 skyDirection 同一條式子 */
export function createSkyAnchorVector(anchor: SkyAnchor): Vector3 {
  return new Vector3(
    Math.sin(anchor.azimuth) * Math.cos(anchor.elevation),
    Math.sin(anchor.elevation),
    -Math.cos(anchor.azimuth) * Math.cos(anchor.elevation),
  )
}

/** 此刻的條件，每幀就地更新同一個物件 */
export interface SignatureFrame {
  /** 從這一層建好起算的秒數 */
  elapsed: number;
  deltaSecond: number;
  /** 由世界中心指向太陽的單位向量；月亮永遠在正對面 */
  sunDirection: Vector3;
  /** 太陽的高度，1 為天頂、負值在地平線下 */
  sunHeight: number;
  /** 人在露天的程度：洞裡與換場景的霧幕裡是零 */
  outdoorRatio: number;
  /** 天體露出多少：下雨、下雪、霧幕與洞裡都會收掉（skyBodyFade 乘上露天） */
  clearRatio: number;
  /** 天黑的程度，不管天氣：太陽落到地平線下才滿 */
  darkRatio: number;
  /** 星空露出多少：天黑乘上晴朗，與星星同進同退 */
  nightRatio: number;
  /** 太陽露出多少：白天乘上晴朗 */
  dayRatio: number;
  /** 晨昏：太陽貼著地平線那一段，乘上晴朗 */
  twilightRatio: number;
  /** 數量類的細節該留幾成，跟著畫質的粒子倍率走（效能檔三成六） */
  detailRatio: number;
  cameraPosition: Vector3;
}

/** 噪音與雜湊，片段與頂點著色器都能用 */
export const GLSL_NOISE = `
float hash11(float n) {
  return fract(sin(n * 127.1 + 3.7) * 43758.5453);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
`

/** 天球上的方向：方位自北（−Z）往東（+X）量，仰角自地平線往上，與 realm-signature-direction 同一套 */
export const GLSL_SKY_DIRECTION = `
vec3 skyDirection(float azimuth, float elevation) {
  return vec3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation));
}
`

/**
 * 掛在天球上的一張方片
 *
 * anchor 是方片中心的方向，extent 是半寬與半高（切平面上的長度，約等於弧度）。
 * 片段著色器拿到的 vUv 是 −1 到 1，x 往畫面右、y 往上
 */
export const SKY_QUAD_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform vec3 anchor;
uniform vec2 extent;
varying vec2 vUv;

void main() {
  vec3 forward = normalize(anchor);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 direction = normalize(forward + right * position.x * extent.x + up * position.y * extent.y);
  vUv = position.xy;
  gl_Position = viewProjection * world * vec4(direction * ${SIGNATURE_SHELL_RADIUS.toFixed(1)}, 1.0);
}
`

/**
 * 繞著地平線一整圈的帶子
 *
 * 網格是 createStripMesh 的格子帶：u 繞一圈、v 往上。elevationRange 是下緣與上緣的仰角。
 * 片段著色器拿到的 vUv 就是（u, v）
 */
export const SKY_RING_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform vec2 elevationRange;
varying vec2 vUv;

void main() {
  float azimuth = position.x * 6.2831853;
  float elevation = mix(elevationRange.x, elevationRange.y, position.y);
  vec3 direction = vec3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation));
  vUv = position.xy;
  gl_Position = viewProjection * world * vec4(direction * ${SIGNATURE_SHELL_RADIUS.toFixed(1)}, 1.0);
}
`

/**
 * 一疊方片：每片四個頂點，position 是（角的 x、角的 y、第幾片），角的範圍 −1 到 1
 *
 * 真正的位置由頂點著色器照「第幾片」與時間去算，所以網格自己的包圍盒沒有意義
 */
export function createQuadListMesh(scene: Scene, name: string, quadCount: number): Mesh {
  const positionList: number[] = []
  const indexList: number[] = []
  for (let quad = 0; quad < quadCount; quad++) {
    const baseIndex = quad * 4
    positionList.push(-1, -1, quad, 1, -1, quad, 1, 1, quad, -1, 1, quad)
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }
  return createIndexedMesh(scene, name, positionList, indexList)
}

/** 一條格子帶：position 是（沿帶 0 到 1、橫向 0 到 1、0），與極光那三條同一種 */
export function createStripMesh(scene: Scene, name: string, segmentAlong: number, segmentAcross: number): Mesh {
  const positionList: number[] = []
  const indexList: number[] = []
  const rowCount = segmentAcross + 1
  for (let column = 0; column <= segmentAlong; column++) {
    for (let row = 0; row < rowCount; row++) {
      positionList.push(column / segmentAlong, row / segmentAcross, 0)
    }
  }
  for (let column = 0; column < segmentAlong; column++) {
    for (let row = 0; row < segmentAcross; row++) {
      const bottomLeft = column * rowCount + row
      const bottomRight = bottomLeft + rowCount
      indexList.push(bottomLeft, bottomRight, bottomLeft + 1, bottomRight, bottomRight + 1, bottomLeft + 1)
    }
  }
  return createIndexedMesh(scene, name, positionList, indexList)
}

/**
 * 釘在世界座標上的一疊方片：每片的四個頂點都放在同一個錨點上
 *
 * position 是錨點的世界座標，uv 是角（x：−1 到 1，y：0 到 1），normal.x 是每片各自的亂數種子。
 * 頂點著色器把角攤開成面向鏡頭的方片（光柱、狐火這一類）
 */
export function createAnchoredQuadMesh(
  scene: Scene,
  name: string,
  anchorList: { x: number; y: number; z: number }[],
): Mesh {
  const positionList: number[] = []
  const uvList: number[] = []
  const normalList: number[] = []
  const indexList: number[] = []
  for (const [quad, anchor] of anchorList.entries()) {
    const baseIndex = quad * 4
    /** 種子用黃金比例散開，相鄰兩片不會同步閃 */
    const seed = (quad * 0.61803398875) % 1
    for (const [cornerX, cornerY] of [[-1, 0], [1, 0], [1, 1], [-1, 1]] as const) {
      positionList.push(anchor.x, anchor.y, anchor.z)
      uvList.push(cornerX, cornerY)
      normalList.push(seed, 0, 0)
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }
  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.uvs = uvList
  vertexData.normals = normalList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

/** 只有位置與索引的網格 */
export function createIndexedMesh(scene: Scene, name: string, positionList: number[], indexList: number[]): Mesh {
  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

interface SignatureLayerParam {
  scene: Scene;
  atmosphere: AtmosphereState;
  /** 網格與材質的名字 */
  name: string;
  /** 著色器在 ShadersStore 裡的名字，全專案不能重複 */
  shaderName: string;
  vertexSource: string;
  fragmentSource: string;
  /** world、viewProjection、time、strength 以外還用到的 uniform */
  uniformList?: string[];
  /** position 以外還用到的頂點屬性 */
  attributeList?: string[];
  mesh: Mesh;
  /** add：相加混合（發光的東西）；alpha：一般混合（剪影、雲） */
  blend: 'add' | 'alpha';
  /** 掛在天球上，還是放在世界座標上，見檔頭 */
  space: 'sky' | 'world';
  /**
   * 畫在哪一層，不給就照 space 決定（sky 畫在預設層、world 畫在天氣層）
   *
   * 天球上的東西若要「畫在陰天罩前面」（雲裡的閃電），就指定 weather
   */
  layer?: 'sky' | 'weather';
  /** 交代它跳出霧之後怎麼收（見 fog-opt-out） */
  fogHandling: string;
  /**
   * 每幀呼叫：寫自己的 uniform，回傳此刻的亮度（零到一上下）
   *
   * 亮度會被寫進 strength；低於門檻就整個網格停用
   */
  update: (frame: SignatureFrame, material: ShaderMaterial) => number;
}

/**
 * 建一層招牌景象
 *
 * 回傳的 dispose 把觀察者、網格與材質都收掉；著色器原始碼留在 ShadersStore（只是字串，重進場景會覆寫）
 */
export function createSignatureLayer(param: SignatureLayerParam): { dispose: () => void } {
  const { scene, atmosphere, mesh } = param
  Effect.ShadersStore[`${param.shaderName}VertexShader`] = param.vertexSource
  Effect.ShadersStore[`${param.shaderName}FragmentShader`] = param.fragmentSource

  const material = new ShaderMaterial(param.name, scene, param.shaderName, {
    attributes: ['position', ...(param.attributeList ?? [])],
    uniforms: ['world', 'viewProjection', 'time', 'strength', ...(param.uniformList ?? [])],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.alphaMode = param.blend === 'add' ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE
  /** 都是疊上去的東西，不留深度：後面的星星、雲與雨絲照常畫 */
  material.disableDepthWrite = true

  mesh.material = material
  mesh.isPickable = false
  /** 頂點是著色器算的，網格自己的包圍盒沒有意義 */
  mesh.alwaysSelectAsActiveMesh = true
  if (param.space === 'sky') {
    mesh.infiniteDistance = true
  }
  const layer = param.layer ?? (param.space === 'sky' ? 'sky' : 'weather')
  if (layer === 'weather') {
    mesh.renderingGroupId = WEATHER_RENDERING_GROUP
  }
  optOutOfFog(mesh, param.fogHandling)
  mesh.setEnabled(false)

  const { state: devToggle } = useDevToggles()
  const { preset } = useGraphicsQuality()
  const frame: SignatureFrame = {
    elapsed: 0,
    deltaSecond: 0,
    sunDirection: new Vector3(0, 1, 0),
    sunHeight: 1,
    outdoorRatio: 1,
    clearRatio: 1,
    darkRatio: 0,
    nightRatio: 0,
    dayRatio: 1,
    twilightRatio: 0,
    detailRatio: 1,
    cameraPosition: new Vector3(),
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    frame.deltaSecond = scene.getEngine().getDeltaTime() / 1000
    frame.elapsed += frame.deltaSecond
    updateSignatureFrame(frame, atmosphere)
    frame.detailRatio = preset.value.particleRatio
    if (scene.activeCamera) {
      frame.cameraPosition.copyFrom(scene.activeCamera.globalPosition)
    }

    const strength = devToggle.realmSignature ? param.update(frame, material) : 0
    mesh.setEnabled(strength > STRENGTH_EPSILON)
    material.setFloat('time', frame.elapsed)
    material.setFloat('strength', strength)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose()
      material.dispose(false, true)
    },
  }
}

/**
 * 由大氣狀態算出此刻的條件
 *
 * 門檻照抄日夜循環（domains/weather/day-night 的 sampleDayNight）：星空在太陽落到地平線下一點才開始亮，
 * 太陽本體貼著地平線就淡掉。這樣「跟星星同進同退」不必去讀星空材質
 */
export function updateSignatureFrame(frame: SignatureFrame, atmosphere: AtmosphereState): void {
  frame.sunDirection.copyFrom(atmosphere.sunDirection).normalize()
  const sunHeight = frame.sunDirection.y
  frame.sunHeight = sunHeight

  /** 換場景的霧幕與世界邊界：與石殿遺址的巨像同一條收法 */
  const veil = Math.min(1, atmosphere.edgeRatio * 1.6)
  frame.outdoorRatio = Math.min(1, Math.max(0, (1 - atmosphere.caveRatio) * (1 - veil)))
  frame.clearRatio = Math.min(1, Math.max(0, atmosphere.skyBodyFade)) * frame.outdoorRatio

  frame.darkRatio = smoothRange(-sunHeight, 0.02, 0.24)
  frame.nightRatio = frame.darkRatio * frame.clearRatio
  frame.dayRatio = smoothRange(sunHeight, -0.05, 0.06) * frame.clearRatio
  frame.twilightRatio = smoothRange(sunHeight, -0.1, -0.01) * (1 - smoothRange(sunHeight, 0.2, 0.36)) * frame.clearRatio
}

/** 組合好幾個裝飾：一起建、倒著收 */
export function combineDecorationList(decorationList: { dispose: () => void }[]): { dispose: () => void } {
  return {
    dispose() {
      for (const decoration of [...decorationList].reverse()) {
        decoration.dispose()
      }
    },
  }
}
