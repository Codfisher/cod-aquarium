import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { ColossusSite } from './ruins-colossi-shape'
import { Color3, Effect, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core'
import { createSeededRandom } from '../../../utils/noise'
import { optOutOfFog } from '../../renderer/fog-opt-out'
import { BIRD_FLOCK_LIST, SITE_LIST } from './ruins-colossi-shape'
import { RUINS_CENTER, RUINS_GROUND_Y, RUINS_RIM_HEIGHT } from './ruins-layout'

/**
 * 石殿遺址遠處的巨像與遺跡（渲染端，屬於世界層）
 *
 * 使用者要的：「遠處加上殘破、壯觀的雕像與遺跡，無法接近，只看的到」。
 * 世界只有四十格高、兩百八十格寬，四五十格高的巨像放不進方塊世界，
 * 而且人走不到、只遠遠看，做成方塊是白花幾萬個面。所以跟遠山一樣是布景：
 * 一個網格、一次繪製，由幾百個方盒拼成（形體在 ruins-colossi-shape.ts），
 * 立在亂石坡外那片走不到的岩地上（世界外，地面是布景的岩地平面），
 * 亂石坡的坡頂擋住它們的下半截，只露出肩、斷臂與斷頸，像從霧裡浮出來。
 *
 * 石頭質感全在著色器裡算，不吃貼圖：
 * 方盒的每個頂點帶面的法線、貼在這一面上的平面座標（格）、離盒底的高度比例，
 * 片段著色器用平面座標畫砌石的層與縫、每塊石頭的色差、雨水沖出的垂直汙痕、裂縫，
 * 頂面、腳下與藤蔓縫長青苔，盒底與凹處壓暗（近似環境遮蔽）。
 * 細節隨距離淡出，遠的只剩大塊的明暗，不會閃爍。
 *
 * 不吃一般的距離霧，與山稜同一套做法：自己依遠近往地平線色混（越遠越淡，一層一層），
 * 腳下再多混一層霧，轉場時跟著灰罩化進霧色。光照用天光加直射光（有法線、有方位）；
 * 迎著太陽看過去（黃昏時它們正好在落日前）石頭整個壓暗、霧收薄，剪影最重。
 * 不投影：太遠了，影子落在走不到的地方
 *
 * 構圖：從回程門往北看，長廊兩排石柱正好夾住正北那尊無頭的坐像；
 * 東北一對持劍的守門巨像夾著一座塌了的門，西邊半埋著一顆巨大的頭，
 * 西南幾根倒下的巨柱，東邊一段斷了的水道橋，東南遠處山稜上一座塌了一角的階梯神殿。
 * 坐像與塌門上空各有一群鳥在盤旋（方盒拼的立體鳥，見下面「盤旋的鳥」）
 */

/** 布景那一層（與 backdrop 的山稜同一層）：地形的深度已經寫好，被殿牆擋住的部分照樣不畫 */
const BACKDROP_RENDERING_GROUP = 1

/** 巨像腳下的高度：亂石坡外那片岩地平面（backdrop.floor）的頂面 */
const FOOT_Y = RUINS_GROUND_Y + RUINS_RIM_HEIGHT + 0.5

/** 與山稜同一組光的權重：天光是主體，直射光補一點 */
const AMBIENT_WEIGHT = 0.95
const SUN_WEIGHT = 0.55

/** 方盒的五個面（沒有底面）：法線軸與方向 */
const FACE_LIST = [
  { axis: 1, sign: 1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
] as const

/** 一格的石頭換算成貼在面上的座標時，不同遠景錯開多少，才不會每一處都是同一個花紋 */
const SITE_PATTERN_OFFSET = 41.3

/** 一處遠景離地平線色的基準混色 */
function measureSiteHaze(distance: number): number {
  return Math.min(0.55, Math.max(0.1, 0.08 + (distance - 150) / 450))
}

/**
 * 把所有遠景拼成一個網格
 *
 * 頂點：位置、法線、color（明暗、混色、青苔、離地高度比例）、
 * uv（貼在這一面上的平面座標，世界格）、uv2（離盒底的高度比例、這一塊石頭的亂數）
 */
function createColossusMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const normalList: number[] = []
  const colorList: number[] = []
  const uvList: number[] = []
  const uv2List: number[] = []
  const indexList: number[] = []
  const random = createSeededRandom('ruins-colossi')

  for (const [siteIndex, site] of SITE_LIST.entries()) {
    const radian = (site.degree / 180) * Math.PI
    const siteX = RUINS_CENTER.x + Math.cos(radian) * site.distance
    const siteZ = RUINS_CENTER.z + Math.sin(radian) * site.distance
    /** 正面（區域 +Z）朝向遺址中心，右手（區域 +X）與它垂直 */
    const faceAngle = Math.atan2(RUINS_CENTER.z - siteZ, RUINS_CENTER.x - siteX)
    const frontX = Math.cos(faceAngle)
    const frontZ = Math.sin(faceAngle)
    const rightX = -frontZ
    const rightZ = frontX
    const haze = measureSiteHaze(site.distance)
    const siteTop = Math.max(...site.boxList.map((item) => item.to[1])) * site.scale
    const patternOffset = siteIndex * SITE_PATTERN_OFFSET

    const toWorld = (localX: number, localY: number, localZ: number): [number, number, number] => [
      siteX + (rightX * localX + frontX * localZ) * site.scale,
      FOOT_Y + localY * site.scale,
      siteZ + (rightZ * localX + frontZ * localZ) * site.scale,
    ]

    for (const item of site.boxList) {
      /** 每一塊石頭的明暗差一點點，風化得不均勻 */
      const weathering = (0.9 + random() * 0.16) * item.shade
      const seed = random()
      const boxHeight = Math.max(0.5, item.to[1] - item.from[1])
      for (const face of FACE_LIST) {
        const normalLocal: [number, number, number] = [0, 0, 0]
        normalLocal[face.axis] = face.sign
        const normalWorldX = rightX * normalLocal[0] + frontX * normalLocal[2]
        const normalWorldZ = rightZ * normalLocal[0] + frontZ * normalLocal[2]
        /** 這一面上四個角的區域座標：固定軸取那一側，另外兩軸各取兩端 */
        const otherAxisList = [0, 1, 2].filter((axis) => axis !== face.axis) as [number, number]
        const fixed = face.sign > 0 ? item.to[face.axis]! : item.from[face.axis]!
        const cornerList: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
        const baseIndex = positionList.length / 3
        for (const [first, second] of cornerList) {
          const local = [0, 0, 0]
          local[face.axis] = fixed
          local[otherAxisList[0]] = first === 0 ? item.from[otherAxisList[0]]! : item.to[otherAxisList[0]]!
          local[otherAxisList[1]] = second === 0 ? item.from[otherAxisList[1]]! : item.to[otherAxisList[1]]!
          const world = toWorld(local[0]!, local[1]!, local[2]!)
          positionList.push(...world)
          normalList.push(normalWorldX, face.axis === 1 ? face.sign : 0, normalWorldZ)
          const heightRatio = Math.max(0, Math.min(1, (world[1] - FOOT_Y) / Math.max(1, siteTop)))
          colorList.push(weathering, haze, item.moss, heightRatio)
          /** 貼在這一面上的平面座標：側面是（水平, 高），頂面是（x, z） */
          const planeU = (face.axis === 0 ? local[2]! : local[0]!) * site.scale + patternOffset
          const planeV = (face.axis === 1 ? local[2]! : local[1]!) * site.scale
          uvList.push(planeU, planeV)
          const bottomRatio = face.axis === 1 ? 1 : (local[1]! - item.from[1]) / Math.min(boxHeight, 8)
          uv2List.push(bottomRatio, seed)
        }
        indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
      }
    }
  }

  const mesh = new Mesh('ruins-colossi', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.colors = colorList
  vertexData.uvs = uvList
  vertexData.uvs2 = uv2List
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

const COLOSSUS_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;
attribute vec2 uv2;
uniform mat4 viewProjection;
varying vec4 vInfo;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vPlane;
varying vec2 vBottom;

void main() {
  vInfo = color;
  vWorld = position;
  vNormal = normal;
  vPlane = uv;
  vBottom = uv2;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const COLOSSUS_FRAGMENT = `
precision highp float;
/** r 明暗、g 往地平線色混的基準、b 青苔、a 從腳（0）到頂（1） */
varying vec4 vInfo;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vPlane;
/** x 離盒底的高度比例（頂面為一）、y 這一塊石頭的亂數 */
varying vec2 vBottom;

uniform vec3 ambientLight;
uniform vec3 sunLight;
uniform vec3 sunDirection;
uniform vec3 horizonColor;
uniform vec3 eyePosition;
uniform float veilRatio;

const vec3 STONE = vec3(0.32, 0.305, 0.285);
const vec3 MOSS = vec3(0.1, 0.155, 0.055);
const vec3 DARK_MOSS = vec3(0.055, 0.09, 0.035);

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

void main() {
  vec3 normal = normalize(vNormal);
  float isTop = step(0.5, normal.y);
  float isSide = 1.0 - isTop;
  vec3 toEye = vWorld - eyePosition;
  float distanceToEye = length(toEye);
  /** 細節只在近處：遠的只剩大塊明暗，免得閃 */
  float detail = 1.0 - smoothstep(230.0, 430.0, distanceToEye);
  vec2 plane = vPlane;

  /** 砌石：一層一層的石磚，每層錯縫，每塊石頭各有色差，縫是一條暗線 */
  float courseHeight = 3.6;
  float row = floor(plane.y / courseHeight);
  float rowShift = hash21(vec2(row, 7.0)) * 5.0;
  float blockWidth = 5.0 + hash21(vec2(row, 3.0)) * 4.0 + 1.0;
  float colFloat = (plane.x + rowShift) / blockWidth;
  vec2 cell = vec2(floor(colFloat), row);
  float blockTone = 0.72 + 0.5 * hash21(cell + vBottom.y * 13.0);
  vec2 edge = vec2(fract(colFloat), fract(plane.y / courseHeight));
  float edgeDistance = min(min(edge.x, 1.0 - edge.x) * blockWidth, min(edge.y, 1.0 - edge.y) * courseHeight);
  float mortar = 1.0 - smoothstep(0.0, 0.42, edgeDistance);

  /** 粗粒與大片的髒汙 */
  float grain = 0.88 + 0.24 * valueNoise(plane * 1.9 + vBottom.y * 31.0);
  float blotch = 0.82 + 0.36 * valueNoise(plane * 0.17 + 5.0);

  /** 雨水沖出的垂直汙痕（側面）：沿高度拉得很長的暗帶 */
  float streakNoise = valueNoise(vec2(plane.x * 0.85, plane.y * 0.055));
  float streak = smoothstep(0.58, 0.88, streakNoise) * isSide;

  /** 裂縫：噪音等值線上的細暗線 */
  float crackNoise = valueNoise(plane * 0.27 + vec2(11.0, 3.0));
  float crack = (1.0 - smoothstep(0.0, 0.028, abs(crackNoise - 0.5))) * detail;

  float stone = blockTone * grain * blotch;
  stone *= 1.0 - 0.5 * mortar * detail;
  stone *= 1.0 - 0.36 * streak;
  stone *= 1.0 - 0.55 * crack;

  /** 青苔：本身的程度、頂面、腳下；再用一層噪音切成一塊一塊 */
  float footMoss = 1.0 - smoothstep(0.0, 0.2, vInfo.a);
  float mossAmount = vInfo.b + isTop * 0.42 + footMoss * 0.5;
  float mossPatch = valueNoise(plane * 0.33 + 17.0);
  float mossMask = smoothstep(0.42, 0.72, mossAmount + (mossPatch - 0.5) * 0.95);
  /** 藤蔓：側面一條一條垂下來的深綠 */
  float vineNoise = valueNoise(vec2(plane.x * 0.5, plane.y * 0.045 + 3.0));
  float vine = smoothstep(0.66, 0.76, vineNoise) * isSide * (0.3 + 0.7 * vInfo.b + 0.3 * isTop);

  vec3 rock = STONE * stone;
  rock = mix(rock, MOSS * (0.7 + 0.6 * grain), mossMask * 0.85);
  rock = mix(rock, DARK_MOSS, clamp(vine * 0.75, 0.0, 0.75));

  /** 近似環境遮蔽：側面靠盒底與凹處壓暗，離地越近越暗 */
  float occlusion = mix(0.58 + 0.42 * smoothstep(0.0, 0.55, vBottom.x), 1.0, isTop);
  occlusion *= 0.78 + 0.22 * smoothstep(0.0, 0.18, vInfo.a);

  /** 光：天光（頂面比側面亮）加直射光，兩邊都有法線 */
  float sunFacing = max(dot(normal, sunDirection), 0.0);
  vec3 lit = ambientLight * (0.42 + 0.58 * normal.y) + sunLight * sunFacing;
  vec3 color = rock * lit * vInfo.r * occlusion;

  /** 逆光：迎著太陽看過去，石頭壓暗成剪影，霧收薄一些，邊緣才分得出天色 */
  float backlight = pow(max(dot(normalize(toEye), sunDirection), 0.0), 3.0);
  color *= 1.0 - 0.42 * backlight;

  /** 腳下多混一層霧：巨像是從坡頂後面的霧裡站起來的，不是一張剪紙貼在坡頂上 */
  float footMist = (1.0 - smoothstep(0.0, 0.4, vInfo.a)) * 0.35;
  float haze = clamp(vInfo.g + (1.0 - vInfo.g) * footMist, 0.0, 1.0);
  haze *= 1.0 - 0.32 * backlight;
  haze = max(haze, veilRatio);
  /** 越遠越平：近處的明暗反差大，遠處往中間灰收 */
  vec3 grayColor = vec3(dot(color, vec3(0.333)));
  color = mix(color, grayColor, vInfo.g * 0.5);
  gl_FragColor = vec4(mix(color, horizonColor, haze), 1.0);
}
`

const COLOSSUS_SHADER_NAME = 'minespaceRuinsColossus'

/**
 * 盤旋的鳥（體素風的立體物）
 *
 * 第一版是三角形拼的 V，第二版改成永遠正對鏡頭的像素小方片。方片沒有厚度、沒有朝向、
 * 整片同一個顏色，遠近只剩大小一個線索，一群鳥看起來像貼在天上的同一層
 * （使用者：「遺跡天空的飛鳥用像素看不出距離，改成實體的立體物體，走體素風格」）。
 *
 * 現在每隻鳥是幾個方盒拼的：身體、頭、喙、尾羽，左右各兩節翅膀。距離感靠四樣東西：
 * - 朝向：鳥頭朝著飛的方向，繞圈時身體往圈心傾，從哪個角度看到牠一目了然
 * - 明暗：每個面有自己的法線，吃與巨像同一組天光與直射光，背、腹、側面亮度不同
 * - 動作：翅膀是整節方盒繞著肩與肘轉（像方塊生物那樣），外節比內節慢一點跟上
 * - 霧：照每隻鳥離鏡頭的實際距離往地平線色混，近的深、遠的淡
 *
 * 整群仍是一個網格、一次繪製，位置、朝向與拍翅都在頂點著色器裡算
 */

/** 鳥的一格體素在世界裡多大（格）：翼展九格，鳥在兩三百格外，才看得出是方塊拼的 */
const BIRD_VOXEL_SIZE = 1

/** 一輪要幾秒：盤旋的鳥大半時間在滑翔，一輪裡只有後面八分之三在拍翅 */
const BIRD_FLAP_PERIOD_SECOND = 2.8

/** 繞圈時身體往圈心傾多少（弧度） */
const BIRD_BANK_RADIAN = 0.38

/** 滑翔時翅膀微微上翹；拍翅時內節、外節各擺多大（弧度） */
const BIRD_GLIDE_RADIAN = 0.14
const BIRD_INNER_FLAP_RADIAN = 0.62
const BIRD_OUTER_FLAP_RADIAN = 0.5

/**
 * 往地平線色混多少：離鏡頭這麼近以內最深、這麼遠以外最淡
 *
 * 鳥繞著兩三百格外的巨像飛，一圈下來離鏡頭的距離差上百格；
 * 兩端的差距要拉得夠開，一群鳥才分得出前後
 */
const BIRD_HAZE_NEAR_DISTANCE = 110
const BIRD_HAZE_FAR_DISTANCE = 360
const BIRD_NEAR_HAZE = 0.12
const BIRD_FAR_HAZE = 0.62

/** 翅根離身體中線多遠、翅膀底面的高度（體素）：內節繞著這條線轉 */
const BIRD_SHOULDER_OFFSET = 0.5
const BIRD_WING_BASE_Y = 0

/** 內節的長度（體素）：外節繞著內節末端轉 */
const BIRD_INNER_WING_LENGTH = 2

/** 部位：不動的身體、翅膀內節、翅膀外節。數值會寫進頂點，著色器照它決定怎麼轉 */
const BIRD_PART = { body: 0, innerWing: 1, outerWing: 2 } as const
type BirdPart = typeof BIRD_PART[keyof typeof BIRD_PART]

/** 顏色：深褐的身體、更深的翅膀、淺色的頭、土黃的喙。數值要與片段著色器的判斷一致 */
const BIRD_TONE = { body: 0, wing: 1, head: 2, beak: 3 } as const
type BirdTone = typeof BIRD_TONE[keyof typeof BIRD_TONE]

interface BirdBox {
  /** 前後（頭朝 +x）、上下、左右；翅膀的第三軸是「離翅根多遠」，一律從零往外 */
  min: [number, number, number];
  max: [number, number, number];
  part: BirdPart;
  /** 翅膀在哪一邊：右 1、左 -1；身體是 0 */
  side: number;
  tone: BirdTone;
}

function createWingBoxList(side: number): BirdBox[] {
  return [
    {
      min: [-1, BIRD_WING_BASE_Y, 0],
      max: [1, BIRD_WING_BASE_Y + 0.5, BIRD_INNER_WING_LENGTH],
      part: BIRD_PART.innerWing,
      side,
      tone: BIRD_TONE.wing,
    },
    {
      min: [-1, BIRD_WING_BASE_Y, BIRD_INNER_WING_LENGTH],
      max: [0.5, BIRD_WING_BASE_Y + 0.5, BIRD_INNER_WING_LENGTH + 2],
      part: BIRD_PART.outerWing,
      side,
      tone: BIRD_TONE.wing,
    },
  ]
}

/** 一隻鳥：身長七格半、翼展九格 */
const BIRD_BOX_LIST: BirdBox[] = [
  { min: [-2, -0.5, -0.5], max: [2, 0.5, 0.5], part: BIRD_PART.body, side: 0, tone: BIRD_TONE.body },
  { min: [2, -0.25, -0.5], max: [3, 0.75, 0.5], part: BIRD_PART.body, side: 0, tone: BIRD_TONE.head },
  { min: [3, 0, -0.25], max: [3.75, 0.5, 0.25], part: BIRD_PART.body, side: 0, tone: BIRD_TONE.beak },
  { min: [-3.75, -0.25, -1], max: [-2, 0.25, 1], part: BIRD_PART.body, side: 0, tone: BIRD_TONE.wing },
  ...createWingBoxList(1),
  ...createWingBoxList(-1),
]

/** 方盒的六個面：法線軸與方向。順序要與著色器裡 getFaceNormal 的編號一致 */
const BIRD_FACE_LIST = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
] as const

/** 面上兩個切線軸各取 min（0）或 max（1）的四個角 */
const BIRD_FACE_CORNER_LIST = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const

const BIRD_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;
attribute vec2 uv2;
uniform mat4 viewProjection;
uniform float time;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;

const float TWO_PI = 6.2831853;

vec3 getFaceNormal(float faceIndex) {
  if (faceIndex < 0.5) return vec3(1.0, 0.0, 0.0);
  if (faceIndex < 1.5) return vec3(-1.0, 0.0, 0.0);
  if (faceIndex < 2.5) return vec3(0.0, 1.0, 0.0);
  if (faceIndex < 3.5) return vec3(0.0, -1.0, 0.0);
  if (faceIndex < 4.5) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0, 0.0, -1.0);
}

/** 在（高度、離翅根的距離）這個平面上轉：角度為正時外端往上抬 */
vec2 liftWing(vec2 point, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(point.x * c + point.y * s, point.y * c - point.x * s);
}

void main() {
  /** color：x 半徑、y 角速度（帶方向）、z 相位、w 拍翅的相位 */
  float angle = time * color.y + color.z;
  vec2 radial = vec2(cos(angle), sin(angle));
  float turn = color.y < 0.0 ? -1.0 : 1.0;
  vec3 center = position + vec3(radial.x * color.x, sin(time * 0.31 + color.z * 2.0) * 3.0, radial.y * color.x);

  /** 頭朝著圓的切線；繞圈時往圈心傾，內側那隻翅膀壓低 */
  vec3 forward = vec3(-radial.y, 0.0, radial.x) * turn;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = cross(forward, up);
  float bankCos = cos(${BIRD_BANK_RADIAN.toFixed(3)});
  float bankSin = sin(${BIRD_BANK_RADIAN.toFixed(3)}) * turn;
  vec3 bankedRight = right * bankCos - up * bankSin;
  vec3 bankedUp = up * bankCos + right * bankSin;

  /**
   * 拍翅：一輪的前八分之五攤平滑翔（翅膀微微上翹），後八分之三拍一下。
   * 拍的那一段兩頭用 smoothstep 收進滑翔的角度，才不會跳一下；外節比內節晚一點跟上
   */
  float beat = fract(time / ${BIRD_FLAP_PERIOD_SECOND.toFixed(2)} + color.w);
  float stroke = smoothstep(0.625, 0.7, beat) * (1.0 - smoothstep(0.925, 1.0, beat));
  float strokePhase = (beat - 0.625) / 0.375 * TWO_PI;
  float innerAngle = ${BIRD_GLIDE_RADIAN.toFixed(3)} + stroke * sin(strokePhase) * ${BIRD_INNER_FLAP_RADIAN.toFixed(3)};
  float outerAngle = stroke * sin(strokePhase - 0.9) * ${BIRD_OUTER_FLAP_RADIAN.toFixed(3)};

  /** normal 這個屬性放的是頂點在鳥身上的位置（體素）；面的法線由 uv2.x 的面編號查 */
  vec3 local = normal;
  vec3 faceNormal = getFaceNormal(uv2.x);
  if (uv.x > 0.5) {
    /** 翅膀：第三軸是離翅根的距離。外節先繞內節末端轉，再整隻翅膀繞翅根轉 */
    vec2 lifted = vec2(local.y - ${BIRD_WING_BASE_Y.toFixed(2)}, local.z);
    vec2 liftedNormal = faceNormal.yz;
    if (uv.x > 1.5) {
      lifted.y -= ${BIRD_INNER_WING_LENGTH.toFixed(2)};
      lifted = liftWing(lifted, outerAngle);
      lifted.y += ${BIRD_INNER_WING_LENGTH.toFixed(2)};
      liftedNormal = liftWing(liftedNormal, outerAngle);
    }
    lifted = liftWing(lifted, innerAngle);
    liftedNormal = liftWing(liftedNormal, innerAngle);
    local = vec3(local.x, lifted.x + ${BIRD_WING_BASE_Y.toFixed(2)}, (lifted.y + ${BIRD_SHOULDER_OFFSET.toFixed(2)}) * uv.y);
    faceNormal = vec3(faceNormal.x, liftedNormal.x, liftedNormal.y * uv.y);
  }

  vec3 world = center + (forward * local.x + bankedUp * local.y + bankedRight * local.z) * ${BIRD_VOXEL_SIZE.toFixed(2)};
  vNormal = forward * faceNormal.x + bankedUp * faceNormal.y + bankedRight * faceNormal.z;
  vWorld = world;
  vTone = uv2.y;
  gl_Position = viewProjection * vec4(world, 1.0);
}
`

const BIRD_FRAGMENT = `
precision highp float;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;
uniform vec3 ambientLight;
uniform vec3 sunLight;
uniform vec3 sunDirection;
uniform vec3 horizonColor;
uniform vec3 eyePosition;
uniform float veilRatio;

const vec3 BODY_COLOR = vec3(0.2, 0.165, 0.14);
const vec3 WING_COLOR = vec3(0.125, 0.108, 0.1);
const vec3 HEAD_COLOR = vec3(0.56, 0.53, 0.47);
const vec3 BEAK_COLOR = vec3(0.66, 0.47, 0.15);

void main() {
  vec3 normal = normalize(vNormal);
  vec3 albedo = vTone < 0.5 ? BODY_COLOR : (vTone < 1.5 ? WING_COLOR : (vTone < 2.5 ? HEAD_COLOR : BEAK_COLOR));

  /**
   * 與巨像同一組光。鳥多半是從底下往上看，腹面不能全黑：
   * 天光在朝下的面留四成半（地面反上來的光），朝上的面全給
   */
  float skyFacing = 0.45 + 0.55 * (0.5 + 0.5 * normal.y);
  float sunFacing = max(dot(normal, sunDirection), 0.0);
  vec3 color = albedo * (ambientLight * skyFacing + sunLight * sunFacing);

  /** 照實際距離往地平線色混：近的那隻深、遠的那隻淡，這是看出前後的主要線索 */
  float distanceToEye = length(vWorld - eyePosition);
  float haze = mix(${BIRD_NEAR_HAZE.toFixed(2)}, ${BIRD_FAR_HAZE.toFixed(2)}, smoothstep(${BIRD_HAZE_NEAR_DISTANCE.toFixed(1)}, ${BIRD_HAZE_FAR_DISTANCE.toFixed(1)}, distanceToEye));
  haze = max(haze, veilRatio);
  gl_FragColor = vec4(mix(color, horizonColor, haze), 1.0);
}
`

const BIRD_SHADER_NAME = 'minespaceRuinsBird'

function createBirdMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const localList: number[] = []
  const colorList: number[] = []
  const uvList: number[] = []
  const uv2List: number[] = []
  const indexList: number[] = []
  const random = createSeededRandom('ruins-birds')

  for (const flock of BIRD_FLOCK_LIST) {
    const site: ColossusSite = SITE_LIST[flock.siteIndex]!
    const radian = (site.degree / 180) * Math.PI
    const centerX = RUINS_CENTER.x + Math.cos(radian) * site.distance
    const centerZ = RUINS_CENTER.z + Math.sin(radian) * site.distance
    const direction = random() < 0.5 ? 1 : -1
    for (let index = 0; index < flock.count; index++) {
      const radius = flock.radius * (0.7 + random() * 0.6)
      const speed = (0.18 + random() * 0.1) * direction * (flock.radius / radius)
      const phase = random() * Math.PI * 2
      const height = FOOT_Y + flock.height + (random() - 0.5) * 30
      /** 拍翅的相位每隻一個，整隻鳥的頂點要同一個值，兩隻翅膀才會一起動 */
      const flapPhase = random()
      /** 最早的版本每個頂點各抽一次，這裡照樣多抽三次：每隻鳥的圈與速度才會跟原本一樣 */
      random()
      random()
      random()

      for (const box of BIRD_BOX_LIST) {
        for (const [faceIndex, face] of BIRD_FACE_LIST.entries()) {
          const baseIndex = positionList.length / 3
          const firstAxis = (face.axis + 1) % 3
          const secondAxis = (face.axis + 2) % 3
          for (const [firstCorner, secondCorner] of BIRD_FACE_CORNER_LIST) {
            const local: [number, number, number] = [0, 0, 0]
            local[face.axis] = face.sign > 0 ? box.max[face.axis]! : box.min[face.axis]!
            local[firstAxis] = firstCorner === 1 ? box.max[firstAxis]! : box.min[firstAxis]!
            local[secondAxis] = secondCorner === 1 ? box.max[secondAxis]! : box.min[secondAxis]!
            positionList.push(centerX, height, centerZ)
            localList.push(local[0], local[1], local[2])
            colorList.push(radius, speed, phase, flapPhase)
            uvList.push(box.part, box.side)
            uv2List.push(faceIndex, box.tone)
          }
          indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
        }
      }
    }
  }

  const mesh = new Mesh('ruins-birds', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  /** 法線這個屬性挪去放「頂點在鳥身上的位置」：真正的法線要跟著翅膀轉，在著色器裡算 */
  vertexData.normals = localList
  vertexData.colors = colorList
  vertexData.uvs = uvList
  vertexData.uvs2 = uv2List
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

export function createRuinsColossi({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  Effect.ShadersStore[`${COLOSSUS_SHADER_NAME}VertexShader`] = COLOSSUS_VERTEX
  Effect.ShadersStore[`${COLOSSUS_SHADER_NAME}FragmentShader`] = COLOSSUS_FRAGMENT
  Effect.ShadersStore[`${BIRD_SHADER_NAME}VertexShader`] = BIRD_VERTEX
  Effect.ShadersStore[`${BIRD_SHADER_NAME}FragmentShader`] = BIRD_FRAGMENT

  const material = new ShaderMaterial('ruins-colossi', scene, COLOSSUS_SHADER_NAME, {
    attributes: ['position', 'normal', 'color', 'uv', 'uv2'],
    uniforms: ['viewProjection', 'ambientLight', 'sunLight', 'sunDirection', 'horizonColor', 'eyePosition', 'veilRatio'],
  })
  /** 方盒的繞向沒有整理過，兩面都畫；整組約六千個三角形 */
  material.backFaceCulling = false

  const mesh = createColossusMesh(scene)
  mesh.material = material
  mesh.isPickable = false
  mesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  /** 散在世界四周兩三百格外，包圍盒很大，不讓它被剔除的判斷來回切 */
  mesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(mesh, '只在石殿遺址出現，與山稜同一套：自己往地平線色混，轉場時由 veilRatio 化進霧色')

  const birdMaterial = new ShaderMaterial('ruins-birds', scene, BIRD_SHADER_NAME, {
    attributes: ['position', 'normal', 'color', 'uv', 'uv2'],
    uniforms: ['viewProjection', 'time', 'ambientLight', 'sunLight', 'sunDirection', 'horizonColor', 'eyePosition', 'veilRatio'],
  })
  /** 方盒的繞向沒有整理過，兩面都畫；整群不到兩千個三角形 */
  birdMaterial.backFaceCulling = false
  const birdMesh = createBirdMesh(scene)
  birdMesh.material = birdMaterial
  birdMesh.isPickable = false
  birdMesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  birdMesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(birdMesh, '與巨像同一組：自己往地平線色混，轉場時由 veilRatio 化進霧色')

  const ambientLight = new Color3()
  const sunLight = new Color3()
  const eyePosition = new Vector3()
  let elapsed = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    ambientLight.set(atmosphere.ambientSkyColor.r * ambient, atmosphere.ambientSkyColor.g * ambient, atmosphere.ambientSkyColor.b * ambient)
    sunLight.set(atmosphere.lightColor.r * sun, atmosphere.lightColor.g * sun, atmosphere.lightColor.b * sun)
    const camera = scene.activeCamera
    if (camera)
      eyePosition.copyFrom(camera.globalPosition)
    material.setColor3('ambientLight', ambientLight)
    material.setColor3('sunLight', sunLight)
    material.setVector3('sunDirection', atmosphere.sunDirection)
    material.setColor3('horizonColor', atmosphere.fogColor)
    material.setVector3('eyePosition', eyePosition)
    /** 與山稜同一個係數：轉場的霧還沒蓋滿之前，巨像就已經化進霧色 */
    const veil = Math.min(1, atmosphere.edgeRatio * 1.6)
    material.setFloat('veilRatio', veil)

    elapsed += scene.getEngine().getDeltaTime() / 1000
    birdMaterial.setFloat('time', elapsed)
    birdMaterial.setColor3('ambientLight', ambientLight)
    birdMaterial.setColor3('sunLight', sunLight)
    birdMaterial.setVector3('sunDirection', atmosphere.sunDirection)
    birdMaterial.setColor3('horizonColor', atmosphere.fogColor)
    birdMaterial.setVector3('eyePosition', eyePosition)
    birdMaterial.setFloat('veilRatio', veil)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose()
      material.dispose(false, true)
      birdMesh.dispose()
      birdMaterial.dispose(false, true)
    },
  }
}
