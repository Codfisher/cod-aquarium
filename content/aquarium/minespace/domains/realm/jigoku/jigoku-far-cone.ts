import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Effect, Engine, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { optOutOfFog } from '../../renderer/fog-opt-out'
import { smoothRange } from '../realm-signature-kit'
import { FAR_CONE, JIGOKU_CENTER, RIM_Y } from './jigoku-layout'

/**
 * 湯煙谷的遠火山（渲染端，屬於世界層）
 *
 * 火口外正北偏東、走不到的一座火山錐：錐頂的火口一直在噴，火星拋到幾十格高再落回山腰，
 * 一柱灰黑的煙往上冒、被風帶著往東歪，一道熔岩順著朝這邊的山腰往下淌，像是火口裡那道熔岩瀑的來處。
 *
 * 世界只有四十格高，一百格高的山放不進方塊世界，人也走不到；與石殿遺址的巨像同一種做法，是布景：
 *
 * - 山體：對齊世界座標的體素格堆出來的階梯錐（四格一階，等高線是方格階梯、每個面朝正東西南北或正上方），
 *   一個網格、一次繪製。每個面平塗：明暗、落灰與山腰的熔岩在建網格時一個面算一次，錐頂的火光與熔岩的流動在著色器裡算，不吃貼圖
 * - 噴發：火星與煙各是一疊永遠正對鏡頭的方片（硬邊的像素塊），位置在頂點著色器裡照時間算
 *   （火星走拋物線、煙往上漲大），兩種拼在同一個網格、用預乘透明度一次畫完：火星只加亮、煙才蓋得住後面
 *
 * 立在稜線外那片岩地平面上，火口壁的稜線擋住山腳。不吃一般的距離霧，照山稜那一套自己往霧色混，
 * 轉場時跟著霧幕化掉；發光的部分穿得過霧，入夜更亮（白天留六成）
 */

/** 布景那一層（與 backdrop 的山稜同一層）：地形的深度已經寫好，被火口壁擋住的部分照樣不畫 */
const BACKDROP_RENDERING_GROUP = 1

const CONE_SHADER_NAME = 'minespaceJigokuFarCone'
const PLUME_SHADER_NAME = 'minespaceJigokuFarPlume'

/** 山腳的高度：稜線外那片岩地平面（backdrop.floor）的頂面 */
const FOOT_Y = RIM_Y + 0.5

/**
 * 山體的一格體素多大（格）、錐頂火口的半徑
 *
 * 四格一階：山在兩百三十格外，一格體素約一度，階梯與每個面的明暗都分得出來，又不至於粗成幾塊積木
 */
const CONE_VOXEL_SIZE = 4
const SUMMIT_RADIUS = 9

/** 頂面只畫到離山腳這麼高：再高的階永遠在視線上方，頂面看不到 */
const TOP_FACE_HEIGHT = 44

/** 人最遠走到離火口中心多遠（格，含神遊的鏡頭）：永遠背對這個範圍的面不建 */
const VIEWER_REACH = 100

/** 往霧色混幾成：與最近那圈火山稜（0.3）同一個量級 */
const CONE_HAZE = 0.3

/** 發光的部分白天留幾成 */
const GLOW_DAY_RATIO = 0.6

/** 與山稜同一組光的權重：天光是主體，直射光補一點 */
const AMBIENT_WEIGHT = 0.95
const SUN_WEIGHT = 0.55

/** 火星與煙各幾片 */
const EMBER_COUNT = 150
const SMOKE_COUNT = 34

/** 錐的中心（世界座標）：方位自北（−Z）往東量 */
const CONE_X = JIGOKU_CENTER.x + Math.sin(FAR_CONE.azimuth) * FAR_CONE.distance
const CONE_Z = JIGOKU_CENTER.z - Math.cos(FAR_CONE.azimuth) * FAR_CONE.distance

/** 錐頂火口的世界座標，噴發從這裡出來 */
const VENT_Y = FOOT_Y + FAR_CONE.height

/**
 * 某個高度比例（零是山腳、一是錐頂）上的半徑
 *
 * 山腳攤得開、越往上越陡，是一座火山錐而不是一個圓錐
 */
function measureConeRadius(heightRatio: number): number {
  return SUMMIT_RADIUS + (FAR_CONE.baseRadius - SUMMIT_RADIUS) * (1 - heightRatio) ** 1.7
}

/** 繞著山體的凹凸：幾道稜與溝從頂一路拉到腳，每一階同一個方位用同一個倍率 */
function measureGully(angle: number): number {
  return 1 + 0.07 * Math.sin(angle * 3 + 1) + 0.05 * Math.sin(angle * 7 + 2.3) + 0.03 * Math.sin(angle * 13 + 0.4)
}

/** 一根柱子（體素格）堆到第幾階：越靠近錐心越高，零是山體外面 */
function measureColumnTier(cellX: number, cellZ: number, tierCount: number): number {
  const offsetX = (cellX + 0.5) * CONE_VOXEL_SIZE
  const offsetZ = (cellZ + 0.5) * CONE_VOXEL_SIZE
  const distance = Math.hypot(offsetX, offsetZ)
  const gully = measureGully(Math.atan2(offsetZ, offsetX))
  let tier = 0
  while (tier < tierCount && distance <= measureConeRadius(tier / tierCount) * gully) {
    tier += 1
  }
  return tier
}

/** 山體一個面的資料，四個頂點共用（整面同一個明暗、同一段熔岩） */
export interface ConeFace {
  /** 四個角，相對錐心（格）；y 從山腳起算 */
  cornerList: [number, number, number][];
  normal: [number, number, number];
  /** 明暗、是不是錐頂的火口、高度比例、離「朝火口這一側」的方位差（−1 到 1） */
  info: [number, number, number, number];
  /** 落灰的程度、山腰熔岩的濃度 */
  surface: [number, number];
}

/**
 * 山體所有的面（純資料，可以單獨測）
 *
 * 山是對齊世界座標的體素格堆出來的：每一格柱子照它離錐心的距離決定堆幾階，
 * 所以等高線是方格階梯、每個面都朝著正東西南北或正上方，與方塊世界同一種語言
 * （第一版是二十八邊形一層一層往上縮，側面是斜的，遠看像一疊圓餅而不是方塊堆的山）。
 * 側面一階一個面，各有自己的明暗；永遠背對火口的面不建，頂面只建看得到的那幾階，並把同一列同高的格子併成一片。
 *
 * facingAngle 是從錐心朝火口中心的方位（繞山體的角度），viewerOffset 是火口中心相對錐心的位置
 */
export function buildConeFaceList(facingAngle: number, viewerOffset: { x: number; z: number }): ConeFace[] {
  const random = createSeededRandom('jigoku-far-cone')
  const tierCount = Math.ceil(FAR_CONE.height / CONE_VOXEL_SIZE)
  /** 溝與稜最多把半徑撐大一成五 */
  const reach = Math.ceil((FAR_CONE.baseRadius * 1.16) / CONE_VOXEL_SIZE)
  const faceList: ConeFace[] = []

  const toFacing = (x: number, z: number): number => {
    const difference = Math.atan2(z, x) - facingAngle
    /** 收進正負半圈 */
    const wrapped = difference - Math.round(difference / (Math.PI * 2)) * Math.PI * 2
    return wrapped / Math.PI
  }

  /**
   * 山腰的熔岩有多濃：朝火口這一側一道主流從錐頂淌到山腳，偏東另一道短的
   *
   * 整個面取一個值。流的寬度至少給到一格體素，不然窄的那一段會從格子之間漏掉、斷成一截一截
   */
  const measureStream = (x: number, z: number, heightRatio: number): number => {
    const facing = toFacing(x, z)
    const cellWidth = (CONE_VOXEL_SIZE * 0.5) / (Math.PI * Math.max(Math.hypot(x, z), 1))
    const meander = 0.05 * Math.sin(heightRatio * 9) + 0.025 * Math.sin(heightRatio * 23 + 1)
    const mainWidth = Math.max(0.022 + 0.03 * (1 - heightRatio), cellWidth * 1.2)
    const mainStream = 1 - smoothRange(Math.abs(facing + 0.04 - meander), mainWidth * 0.45, mainWidth)
    const sideWidth = Math.max(0.026, cellWidth * 1.2)
    const sideStream = (1 - smoothRange(Math.abs(facing - 0.3 - meander * 1.5), sideWidth * 0.45, sideWidth))
      * smoothRange(heightRatio, 0.42, 0.55)
    return Math.max(mainStream, sideStream)
  }

  /** 落灰：山腰以下蓋著一層，一塊濃一塊淡 */
  const measureAsh = (x: number, z: number, heightRatio: number): number => {
    const patch = 0.5 + 0.5 * fbm2D(x * 0.05 + 3, z * 0.05 - 7, 2, 0.5)
    return (1 - smoothRange(heightRatio, 0.15, 0.6)) * (0.4 + 0.6 * Math.min(1, Math.max(0, patch)))
  }

  const pushFace = (cornerList: [number, number, number][], normal: [number, number, number], shade: number, isVent: number): void => {
    const centerX = (cornerList[0]![0] + cornerList[2]![0]) / 2
    const centerY = (cornerList[0]![1] + cornerList[2]![1]) / 2
    const centerZ = (cornerList[0]![2] + cornerList[2]![2]) / 2
    const heightRatio = Math.min(1, Math.max(0, centerY / FAR_CONE.height))
    faceList.push({
      cornerList,
      normal,
      info: [shade, isVent, heightRatio, toFacing(centerX, centerZ)],
      surface: [measureAsh(centerX, centerZ, heightRatio), isVent > 0 ? 0 : measureStream(centerX, centerZ, heightRatio)],
    })
  }

  /** 從火口那一帶的任何位置都看不到的面：法線背對整個可走範圍 */
  const isNeverSeen = (normalX: number, normalZ: number, faceX: number, faceZ: number): boolean => {
    const towardViewer = (viewerOffset.x - faceX) * normalX + (viewerOffset.z - faceZ) * normalZ
    return towardViewer < -VIEWER_REACH
  }

  const tierMap = new Map<string, number>()
  const getTier = (cellX: number, cellZ: number): number => {
    const key = `${cellX},${cellZ}`
    let tier = tierMap.get(key)
    if (tier === undefined) {
      tier = measureColumnTier(cellX, cellZ, tierCount)
      tierMap.set(key, tier)
    }
    return tier
  }

  const sideList = [
    { stepX: 1, stepZ: 0 },
    { stepX: -1, stepZ: 0 },
    { stepX: 0, stepZ: 1 },
    { stepX: 0, stepZ: -1 },
  ] as const

  for (let cellZ = -reach; cellZ < reach; cellZ++) {
    /** 這一列正在併的頂面：同高、相連的格子併成一片 */
    let runStartX = 0
    let runTier = 0
    const closeRun = (endX: number): void => {
      if (runTier === 0)
        return
      const isSummit = runTier === tierCount
      const topY = Math.min(FAR_CONE.height, runTier * CONE_VOXEL_SIZE)
      if (isSummit || topY <= TOP_FACE_HEIGHT) {
        const minX = runStartX * CONE_VOXEL_SIZE
        const maxX = endX * CONE_VOXEL_SIZE
        const minZ = cellZ * CONE_VOXEL_SIZE
        const maxZ = minZ + CONE_VOXEL_SIZE
        /** 最上面那一階的頂面就是火口，整片發光 */
        pushFace([[minX, topY, minZ], [maxX, topY, minZ], [maxX, topY, maxZ], [minX, topY, maxZ]], [0, 1, 0], (0.9 + random() * 0.2) * 1.12, isSummit ? 1 : 0)
      }
      runTier = 0
    }

    for (let cellX = -reach; cellX < reach; cellX++) {
      const tier = getTier(cellX, cellZ)
      if (tier !== runTier) {
        closeRun(cellX)
        runStartX = cellX
        runTier = tier
      }
      if (tier === 0)
        continue

      /** 側面：鄰格比較矮的那幾階露在外面，一階一個面 */
      for (const side of sideList) {
        const neighborTier = getTier(cellX + side.stepX, cellZ + side.stepZ)
        if (neighborTier >= tier)
          continue
        /** 這一面所在的那條邊：固定的那一軸在格子朝外的那一側，另一軸橫跨整格 */
        const fixedX = (cellX + (side.stepX > 0 ? 1 : 0)) * CONE_VOXEL_SIZE
        const fixedZ = (cellZ + (side.stepZ > 0 ? 1 : 0)) * CONE_VOXEL_SIZE
        const fromX = side.stepX !== 0 ? fixedX : cellX * CONE_VOXEL_SIZE
        const toX = side.stepX !== 0 ? fixedX : (cellX + 1) * CONE_VOXEL_SIZE
        const fromZ = side.stepZ !== 0 ? fixedZ : cellZ * CONE_VOXEL_SIZE
        const toZ = side.stepZ !== 0 ? fixedZ : (cellZ + 1) * CONE_VOXEL_SIZE
        if (isNeverSeen(side.stepX, side.stepZ, (fromX + toX) / 2, (fromZ + toZ) / 2))
          continue

        for (let level = neighborTier; level < tier; level++) {
          const bottomY = level * CONE_VOXEL_SIZE
          const topY = Math.min(FAR_CONE.height, bottomY + CONE_VOXEL_SIZE)
          /** 每一面的明暗差一點點，不然整座山是一個顏色；每三階壓暗一階，像一層一層的熔岩流 */
          const shade = (0.84 + random() * 0.3) * (level % 3 === 0 ? 0.88 : 1)
          pushFace([[fromX, bottomY, fromZ], [toX, bottomY, toZ], [toX, topY, toZ], [fromX, topY, fromZ]], [side.stepX, 0, side.stepZ], shade, 0)
        }
      }
    }
    closeRun(reach)
  }
  return faceList
}

/**
 * 山體的網格
 *
 * 頂點：位置、法線、color（明暗、是不是錐頂的火口、高度比例、方位差）、uv（落灰、熔岩）。
 * 一個面的四個頂點帶同一份資料，所以整面是平塗的
 */
function createConeMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const normalList: number[] = []
  const colorList: number[] = []
  const uvList: number[] = []
  const indexList: number[] = []
  /** 朝著火口中心的方位（繞山體的角度） */
  const facingAngle = Math.atan2(JIGOKU_CENTER.z - CONE_Z, JIGOKU_CENTER.x - CONE_X)
  const faceList = buildConeFaceList(facingAngle, { x: JIGOKU_CENTER.x - CONE_X, z: JIGOKU_CENTER.z - CONE_Z })

  for (const face of faceList) {
    const baseIndex = positionList.length / 3
    for (const corner of face.cornerList) {
      positionList.push(CONE_X + corner[0], FOOT_Y + corner[1], CONE_Z + corner[2])
      normalList.push(...face.normal)
      colorList.push(...face.info)
      uvList.push(...face.surface)
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  const mesh = new Mesh('jigoku-far-cone', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.colors = colorList
  vertexData.uvs = uvList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

const CONE_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;
uniform mat4 viewProjection;
varying vec4 vInfo;
varying vec2 vSurface;
varying vec3 vNormal;

void main() {
  vInfo = color;
  vSurface = uv;
  vNormal = normal;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const GLSL_NOISE = `
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

const CONE_FRAGMENT = `
precision highp float;
/** r 明暗、g 是不是錐頂的火口、b 從山腳（0）到錐頂（1）、a 離朝火口那一側的方位差（−1 到 1）；整個面同一份 */
varying vec4 vInfo;
/** x 落灰的程度、y 山腰熔岩的濃度；整個面同一份 */
varying vec2 vSurface;
varying vec3 vNormal;

uniform vec3 ambientLight;
uniform vec3 sunLight;
uniform vec3 sunDirection;
uniform vec3 horizonColor;
uniform float haze;
uniform float veilRatio;
uniform float glowRatio;
uniform float time;
${GLSL_NOISE}

const vec3 ROCK = vec3(0.15, 0.13, 0.125);
const vec3 ASH = vec3(0.3, 0.27, 0.25);

void main() {
  vec3 normal = normalize(vNormal);
  float height = vInfo.b;
  float facing = vInfo.a;

  /** 岩：山腰以下蓋著一層落灰。層理與每一面的深淺已經算進 vInfo.r，整面平塗 */
  vec3 rock = mix(ROCK, ASH, vSurface.x * 0.6) * vInfo.r;

  float sunFacing = max(dot(normal, sunDirection), 0.0);
  vec3 lit = ambientLight * (0.45 + 0.55 * normal.y) + sunLight * sunFacing;
  vec3 color = rock * lit;

  /** 山腰的熔岩：哪些面在流裡已經在建網格時算好；往下淌的亮斑一個面一個面地挪 */
  float flow = hash21(vec2(floor(facing * 120.0), floor(height * 60.0 + time * 0.7)));
  float stream = vSurface.y * (0.55 + 0.45 * flow);
  vec3 emission = mix(vec3(1.5, 0.3, 0.05), vec3(2.6, 1.15, 0.28), flow) * stream;

  /** 錐頂的火口：整片亮，跟著噴發一脹一縮；口緣以下那一段岩被它從上面照紅 */
  float pulse = 0.78 + 0.22 * sin(time * 1.3) * sin(time * 0.37 + 1.0);
  emission += vec3(2.8, 1.3, 0.35) * vInfo.g * pulse;
  float summitGlow = smoothstep(0.7, 1.0, height) * (1.0 - vInfo.g);
  emission += vec3(0.9, 0.2, 0.05) * summitGlow * summitGlow * 0.55 * pulse;

  /** 山腳多混一層霧：是從稜線後面的煙裡站起來的，不是一張剪紙貼在稜線上 */
  float footMist = (1.0 - smoothstep(0.0, 0.45, height)) * 0.3;
  float mixed = max(clamp(haze + (1.0 - haze) * footMist, 0.0, 1.0), veilRatio);
  color = mix(color, horizonColor, mixed);
  /** 發光的部分穿得過霧，但跟著轉場的霧幕一起化掉 */
  color += emission * glowRatio * (1.0 - 0.45 * mixed) * (1.0 - veilRatio);
  gl_FragColor = vec4(color, 1.0);
}
`

const PLUME_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
attribute vec2 uv;
uniform mat4 view;
uniform mat4 viewProjection;
uniform float time;
/** x 這一片的進度（零到一）、y 是火星（1）還是煙（0）、z 亂數 */
varying vec3 vLife;

void main() {
  /** color：x 與 w 是兩個亂數、y 是相位、z 小於零是煙、否則是方位（零到一） */
  float isEmber = step(0.0, color.z);
  vec3 cameraRight = vec3(view[0][0], view[1][0], view[2][0]);
  vec3 cameraUp = vec3(view[0][1], view[1][1], view[2][1]);
  vec3 center;
  float size;
  float life;

  if (isEmber > 0.5) {
    /** 火星：從火口拋出去的拋物線，拋得高的飛得久 */
    float period = 5.0 + color.x * 3.0;
    life = fract(time / period + color.y);
    float elapsed = life * period;
    float angle = color.z * 6.2831853;
    float spread = 3.0 + color.w * 9.0;
    float rise = 22.0 + color.x * 22.0;
    center = position + vec3(cos(angle) * spread * elapsed, rise * elapsed - 5.5 * elapsed * elapsed, sin(angle) * spread * elapsed);
    size = (1.3 + 1.9 * color.w) * (1.0 - 0.45 * life);
  }
  else {
    /** 煙：一團一團往上冒、越漲越大，被風帶著往東歪 */
    float period = 26.0 + color.x * 12.0;
    life = fract(time / period + color.y);
    float lean = life * life * 70.0;
    center = position + vec3(lean + sin(color.w * 40.0 + life * 5.0) * 6.0 * life, life * 92.0, cos(color.w * 31.0) * 10.0 * life);
    size = 9.0 + 34.0 * life + 8.0 * color.w;
  }

  vLife = vec3(life, isEmber, color.w);
  gl_Position = viewProjection * vec4(center + (cameraRight * uv.x + cameraUp * uv.y) * size, 1.0);
}
`

const PLUME_FRAGMENT = `
precision highp float;
varying vec3 vLife;
uniform vec3 horizonColor;
uniform vec3 smokeLight;
uniform float haze;
uniform float veilRatio;
uniform float glowRatio;

void main() {
  float life = vLife.x;
  float visible = 1.0 - veilRatio;

  if (vLife.y > 0.5) {
    /** 火星：剛出來是黃白，飛到頂轉橘，落回去之前冷成暗紅；只加亮 */
    vec3 color = mix(vec3(2.6, 1.7, 0.6), vec3(2.0, 0.55, 0.08), smoothstep(0.0, 0.35, life));
    color = mix(color, vec3(0.7, 0.08, 0.01), smoothstep(0.45, 0.9, life));
    float strength = (1.0 - smoothstep(0.78, 1.0, life)) * glowRatio * (1.0 - 0.4 * haze) * visible;
    gl_FragColor = vec4(color * strength, 0.0);
    return;
  }

  /** 煙：灰黑，剛冒出來那一段被火口從底下照紅；越往上越淡、越混進霧色 */
  float alpha = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.55, 1.0, life)) * (0.5 + 0.2 * vLife.z) * visible;
  vec3 color = vec3(0.26, 0.235, 0.225) * smokeLight;
  color += vec3(1.1, 0.26, 0.05) * (1.0 - smoothstep(0.0, 0.3, life)) * glowRatio;
  color = mix(color, horizonColor, clamp(haze + life * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(color * alpha, alpha);
}
`

/** 方片的四個角（−0.5 到 0.5）：左下、右下、右上、左上 */
const CORNER_LIST = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
] as const

/**
 * 噴發的網格：煙在前、火星在後（索引的順序就是畫的順序，火星疊在煙上）
 *
 * 每一片的四個頂點都放在火口，真正的位置由頂點著色器照時間算
 */
function createPlumeMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const colorList: number[] = []
  const uvList: number[] = []
  const indexList: number[] = []
  const random = createSeededRandom('jigoku-far-plume')

  const pushQuad = (direction: number): void => {
    const baseIndex = positionList.length / 3
    const seed = random()
    const phase = random()
    const size = random()
    for (const [cornerX, cornerY] of CORNER_LIST) {
      positionList.push(CONE_X, VENT_Y, CONE_Z)
      colorList.push(seed, phase, direction, size)
      uvList.push(cornerX, cornerY)
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }
  for (let index = 0; index < SMOKE_COUNT; index++) {
    pushQuad(-1)
  }
  for (let index = 0; index < EMBER_COUNT; index++) {
    pushQuad(random())
  }

  const mesh = new Mesh('jigoku-far-plume', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.colors = colorList
  vertexData.uvs = uvList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

export function createJigokuFarCone({ scene, atmosphere }: { scene: Scene; atmosphere: AtmosphereState }): { dispose: () => void } {
  Effect.ShadersStore[`${CONE_SHADER_NAME}VertexShader`] = CONE_VERTEX
  Effect.ShadersStore[`${CONE_SHADER_NAME}FragmentShader`] = CONE_FRAGMENT
  Effect.ShadersStore[`${PLUME_SHADER_NAME}VertexShader`] = PLUME_VERTEX
  Effect.ShadersStore[`${PLUME_SHADER_NAME}FragmentShader`] = PLUME_FRAGMENT

  const coneMaterial = new ShaderMaterial('jigoku-far-cone', scene, CONE_SHADER_NAME, {
    attributes: ['position', 'normal', 'color', 'uv'],
    uniforms: ['viewProjection', 'ambientLight', 'sunLight', 'sunDirection', 'horizonColor', 'haze', 'veilRatio', 'glowRatio', 'time'],
  })
  /** 繞向沒有整理過，兩面都畫；整座約三千多個三角形 */
  coneMaterial.backFaceCulling = false
  const coneMesh = createConeMesh(scene)
  coneMesh.material = coneMaterial
  coneMesh.isPickable = false
  coneMesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  coneMesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(coneMesh, '只在湯煙谷出現，與山稜同一套：自己往地平線色混，轉場時由 veilRatio 化進霧色')

  const plumeMaterial = new ShaderMaterial('jigoku-far-plume', scene, PLUME_SHADER_NAME, {
    attributes: ['position', 'color', 'uv'],
    uniforms: ['view', 'viewProjection', 'time', 'horizonColor', 'smokeLight', 'haze', 'veilRatio', 'glowRatio'],
    needAlphaBlending: true,
  })
  /** 方片跟著鏡頭轉，沒有固定的正反面 */
  plumeMaterial.backFaceCulling = false
  /** 預乘透明度：火星輸出的透明度是零（只加亮），煙輸出自己的透明度（蓋住後面），同一次繪製兩種都畫得對 */
  plumeMaterial.alphaMode = Engine.ALPHA_PREMULTIPLIED
  plumeMaterial.disableDepthWrite = true
  const plumeMesh = createPlumeMesh(scene)
  plumeMesh.material = plumeMaterial
  plumeMesh.isPickable = false
  plumeMesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  /** 頂點是著色器算的，網格自己的包圍盒只有火口那一點 */
  plumeMesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(plumeMesh, '與遠火山的山體同一組：煙自己往地平線色混，火星與煙轉場時都由 veilRatio 收掉')

  const ambientLight = new Color3()
  const sunLight = new Color3()
  const smokeLight = new Color3()
  const sunDirection = new Vector3()
  let elapsedSecond = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsedSecond += scene.getEngine().getDeltaTime() / 1000
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    ambientLight.set(atmosphere.ambientSkyColor.r * ambient, atmosphere.ambientSkyColor.g * ambient, atmosphere.ambientSkyColor.b * ambient)
    sunLight.set(atmosphere.lightColor.r * sun, atmosphere.lightColor.g * sun, atmosphere.lightColor.b * sun)
    /** 煙沒有法線，天光加一半的直射光當它的亮度 */
    smokeLight.set(ambientLight.r + sunLight.r * 0.5, ambientLight.g + sunLight.g * 0.5, ambientLight.b + sunLight.b * 0.5)
    sunDirection.copyFrom(atmosphere.sunDirection).normalize()
    /** 與山稜同一個係數：轉場的霧還沒蓋滿之前，遠火山就已經化進霧色 */
    const veil = Math.min(1, atmosphere.edgeRatio * 1.6)
    const darkRatio = smoothRange(-sunDirection.y, 0.02, 0.24)
    const glowRatio = GLOW_DAY_RATIO + (1 - GLOW_DAY_RATIO) * darkRatio

    coneMaterial.setFloat('time', elapsedSecond)
    coneMaterial.setColor3('ambientLight', ambientLight)
    coneMaterial.setColor3('sunLight', sunLight)
    coneMaterial.setVector3('sunDirection', sunDirection)
    coneMaterial.setColor3('horizonColor', atmosphere.fogColor)
    coneMaterial.setFloat('haze', CONE_HAZE)
    coneMaterial.setFloat('veilRatio', veil)
    coneMaterial.setFloat('glowRatio', glowRatio)

    plumeMaterial.setFloat('time', elapsedSecond)
    plumeMaterial.setColor3('horizonColor', atmosphere.fogColor)
    plumeMaterial.setColor3('smokeLight', smokeLight)
    plumeMaterial.setFloat('haze', CONE_HAZE)
    plumeMaterial.setFloat('veilRatio', veil)
    plumeMaterial.setFloat('glowRatio', glowRatio)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      coneMesh.dispose()
      coneMaterial.dispose(false, true)
      plumeMesh.dispose()
      plumeMaterial.dispose(false, true)
    },
  }
}
