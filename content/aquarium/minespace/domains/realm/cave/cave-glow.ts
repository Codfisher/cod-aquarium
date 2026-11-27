import type { Scene } from '@babylonjs/core'
import {
  Color3,
  Constants,
  Effect,
  Mesh,
  PointLight,
  ShaderMaterial,
  Vector2,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId, isPassableBlock, isWaterBlock } from '../../block/block-constants'
import { getBlock } from '../../world/world-access'
import { WORLD_HEIGHT } from '../../world/world-constants'
import {
  CAVE_FLOOR_Y,
  CAVE_GROUND_Y,
  GLOW_CLUSTER_LIST,
  HALL_CENTER,
  HALL_RADIUS_X,
  HALL_RADIUS_Z,
  measureGlowDensity,
  UNDERGROUND_LAKE_CENTER,
  UNDERGROUND_LAKE_RADIUS,
} from './cave-layout'

/**
 * 地底湖窟洞頂的螢光蟲（渲染端，屬於世界層）
 *
 * 螢光洞窟的樣子：洞頂一片一片冷藍綠的小光點，每一點底下垂一兩條細絲，絲上沾著光；
 * 湖面映著頭上那一片。光點有幾千顆，不能做成方塊光源（每一顆都會變成一盞真光、
 * 一份全局光與一圈光暈），全部畫在同一個網格裡：一顆光點一片面向鏡頭的小方片、
 * 一條絲一片細長的直條、湖上的光點再多一片倒影，加法混合、一次繪製。
 *
 * 倒影不開鏡面：把光點對湖面鏡射之後，沿著鏡頭到鏡像點的那條線找它穿過水面的位置，
 * 把方片放在水面上方兩公分。方片只要不在湖上就會落到岸邊的洞底底下（洞底頂面比水面高八分之一格），
 * 被深度擋掉，所以只有真的在水面上的那幾顆看得到。
 *
 * 光點各自有一個相位，緩緩地明滅；離太遠的跟著霧淡掉（霧色是黑的，加法混合直接乘到零）。
 * 另外在最密的幾叢底下各掛一盞冷色的真光，洞頂那一片岩與湖面才被染上藍綠（地衣方塊自己不照人，見 GLOW_LICHEN）
 */

/** 光點的顏色（線性 RGB），螢光蟲那種冷的藍綠 */
const GLOW_COLOR = new Color3(0.42, 1, 0.88)

/** 洞頂離地至少幾格才有螢光蟲：通道與前室太矮，伸手就碰得到不像話 */
const MIN_CEILING_HEIGHT = 7

/** 一格洞頂最多幾顆光點，濃度滿時 */
const MAX_DOT_PER_CELL = 5

/** 光點方片的半寬（格），太遠時會撐到至少一兩個像素 */
const DOT_SIZE_MIN = 0.08
const DOT_SIZE_RANGE = 0.07

/** 細絲的長度（格）與半寬 */
const THREAD_LENGTH_MIN = 0.25
const THREAD_LENGTH_RANGE = 1.4
const THREAD_HALF_WIDTH = 0.02

/** 冷色真光：幾盞、多亮、照多遠 */
const AREA_LIGHT_INTENSITY = 0.55
const AREA_LIGHT_RANGE = 24

/** 湖面的世界高度：水面那一層方塊的頂面再矮八分之一格 */
const LAKE_SURFACE_Y = CAVE_FLOOR_Y + 0.5 - 0.125

/** 三種方片 */
const KIND_DOT = 0
const KIND_THREAD = 1
const KIND_REFLECTION = 2

const SHADER_NAME = 'caveGlowworm'

const GLOW_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 glowParam;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform float time;
uniform float waterY;
varying vec2 vCorner;
varying float vBright;
varying float vKind;
varying float vDistance;

void main() {
  float kind = glowParam.x;
  float size = glowParam.y;
  float phase = glowParam.z;
  float threadLength = glowParam.w;

  vec3 toCamera = cameraPosition - position;
  vec3 right = normalize(vec3(toCamera.z, 0.0, -toCamera.x) + vec3(0.0001, 0.0, 0.0));
  vec3 world;
  float distanceToCamera = length(toCamera);

  if (kind < 0.5) {
    /** 光點：整片面向鏡頭；遠的撐到至少一兩個像素，不然閃一下就不見了 */
    vec3 forward = toCamera / max(distanceToCamera, 0.001);
    vec3 up = normalize(cross(forward, right));
    float radius = max(size, distanceToCamera * 0.0045);
    world = position + (right * uv.x + up * uv.y) * radius;
  }
  else if (kind < 1.5) {
    /** 細絲：從光點往下垂，只繞著垂直軸轉向鏡頭 */
    world = position + right * uv.x * size + vec3(0.0, -(uv.y * 0.5 + 0.5) * threadLength, 0.0);
  }
  else {
    /** 倒影：鏡像點與鏡頭的連線穿過水面的那一點，大小照透視縮放 */
    vec3 mirrored = vec3(position.x, 2.0 * waterY - position.y, position.z);
    float height = cameraPosition.y - waterY;
    float ratio = height / max(cameraPosition.y - mirrored.y, 0.001);
    vec3 hit = cameraPosition + (mirrored - cameraPosition) * ratio;
    vec3 forward = normalize(cameraPosition - mirrored);
    vec3 up = normalize(cross(forward, right));
    float radius = max(size, length(cameraPosition - mirrored) * 0.0045) * ratio;
    world = hit + vec3(0.0, 0.02, 0.0) + (right * uv.x + up * uv.y) * radius;
    /** 鏡頭在水面底下就沒有倒影 */
    if (height <= 0.05)
      world = vec3(0.0, -1000.0, 0.0);
    distanceToCamera = length(cameraPosition - mirrored);
  }

  /** 緩緩明滅：每一顆各自的速度與相位，不會整片一起呼吸 */
  float speed = 0.35 + fract(phase * 7.31) * 0.7;
  vBright = 0.55 + 0.45 * sin(time * speed + phase * 6.2832);
  vCorner = uv;
  vKind = kind;
  vDistance = distanceToCamera;
  gl_Position = viewProjection * vec4(world, 1.0);
}
`

const GLOW_FRAGMENT = `
precision highp float;
varying vec2 vCorner;
varying float vBright;
varying float vKind;
varying float vDistance;
uniform vec3 glowColor;
uniform vec2 sceneFogRange;

void main() {
  float alpha;
  if (vKind < 0.5) {
    float radius = length(vCorner);
    alpha = pow(max(0.0, 1.0 - radius), 1.8) * 2.6;
  }
  else if (vKind < 1.5) {
    /** 細絲：靠光點那一頭亮，往下淡掉；橫向中間亮兩邊暗 */
    float along = vCorner.y * 0.5 + 0.5;
    alpha = (1.0 - abs(vCorner.x)) * (1.0 - along) * 0.5;
  }
  else {
    float radius = length(vCorner);
    alpha = pow(max(0.0, 1.0 - radius), 1.8) * 1.3;
  }

  float fogRatio = clamp((sceneFogRange.y - vDistance) / max(sceneFogRange.y - sceneFogRange.x, 0.001), 0.0, 1.0);
  float strength = alpha * vBright * fogRatio;
  if (strength < 0.003)
    discard;
  gl_FragColor = vec4(glowColor * strength, 1.0);
}
`

/** 這一格柱從洞底往上第一格實心的岩，找不到回傳 -1 */
function findCeilingY(worldState: Uint8Array, x: number, z: number): number {
  for (let y = CAVE_GROUND_Y; y < WORLD_HEIGHT; y++) {
    const blockId = getBlock(worldState, x, y, z)
    if (blockId !== BlockId.AIR && !isPassableBlock(blockId) && !isWaterBlock(blockId))
      return y
  }
  return -1
}

/** 這一格柱是不是大廳裡的洞底（腳下那一格不是實心就不算，湖面也算） */
function findFloorY(worldState: Uint8Array, x: number, z: number): number {
  for (let y = CAVE_FLOOR_Y + 3; y > 0; y--) {
    const blockId = getBlock(worldState, x, y, z)
    if (blockId !== BlockId.AIR && !isPassableBlock(blockId))
      return y
  }
  return -1
}

interface GlowQuad {
  kind: number;
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  threadLength: number;
}

/** 掃一遍大廳的洞頂，撒出光點、細絲與湖上的倒影 */
function collectQuadList(worldState: Uint8Array): GlowQuad[] {
  const random = createSeededRandom('cave-glowworm')
  const quadList: GlowQuad[] = []

  for (let x = HALL_CENTER.x - HALL_RADIUS_X - 6; x <= HALL_CENTER.x + HALL_RADIUS_X + 6; x++) {
    for (let z = HALL_CENTER.z - HALL_RADIUS_Z - 6; z <= HALL_CENTER.z + HALL_RADIUS_Z + 6; z++) {
      const density = measureGlowDensity(x, z)
      if (density < 0.08)
        continue

      const floorY = findFloorY(worldState, x, z)
      const ceilingY = findCeilingY(worldState, x, z)
      if (floorY < 0 || ceilingY < 0 || ceilingY - floorY < MIN_CEILING_HEIGHT)
        continue

      const isOverLake = Math.hypot(x - UNDERGROUND_LAKE_CENTER.x, z - UNDERGROUND_LAKE_CENTER.z) < UNDERGROUND_LAKE_RADIUS + 4
      const dotCount = Math.floor(density * MAX_DOT_PER_CELL + random())

      for (let index = 0; index < dotCount; index++) {
        const dot: GlowQuad = {
          kind: KIND_DOT,
          x: x - 0.5 + random(),
          y: ceilingY - 0.52,
          z: z - 0.5 + random(),
          size: DOT_SIZE_MIN + random() * DOT_SIZE_RANGE,
          phase: random(),
          threadLength: 0,
        }
        quadList.push(dot)

        /** 七成的光點垂一條絲，偶爾兩條 */
        const threadCount = random() < 0.7 ? (random() < 0.25 ? 2 : 1) : 0
        for (let thread = 0; thread < threadCount; thread++) {
          quadList.push({
            ...dot,
            kind: KIND_THREAD,
            x: dot.x + (random() - 0.5) * 0.12,
            z: dot.z + (random() - 0.5) * 0.12,
            size: THREAD_HALF_WIDTH,
            threadLength: THREAD_LENGTH_MIN + random() * THREAD_LENGTH_RANGE,
          })
        }

        if (isOverLake) {
          quadList.push({ ...dot, kind: KIND_REFLECTION })
        }
      }
    }
  }

  return quadList
}

/** 把方片清單排成一個網格：每片四個頂點，位置都是中心，角落與種類交給著色器 */
function buildMesh(scene: Scene, quadList: GlowQuad[]): Mesh {
  const positionList = new Float32Array(quadList.length * 12)
  const uvList = new Float32Array(quadList.length * 8)
  const paramList = new Float32Array(quadList.length * 16)
  const indexList = new Uint32Array(quadList.length * 6)
  const cornerList = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const

  for (const [quadIndex, quad] of quadList.entries()) {
    for (const [cornerIndex, corner] of cornerList.entries()) {
      const vertex = quadIndex * 4 + cornerIndex
      positionList.set([quad.x, quad.y, quad.z], vertex * 3)
      uvList.set(corner, vertex * 2)
      paramList.set([quad.kind, quad.size, quad.phase, quad.threadLength], vertex * 4)
    }
    const base = quadIndex * 4
    indexList.set([base, base + 1, base + 2, base, base + 2, base + 3], quadIndex * 6)
  }

  const mesh = new Mesh('cave-glowworm', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.uvs = uvList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh, false)
  mesh.setVerticesData('glowParam', paramList, false, 4)
  /** 頂點在著色器裡才搬到真正的位置，包圍盒對不上，整個不做視錐剔除 */
  mesh.alwaysSelectAsActiveMesh = true
  mesh.isPickable = false
  /**
   * 排在天氣那一層（場景與水都畫完之後，深度照留）
   *
   * 水是半透明的，與這片加法網格在同一層時誰先畫看距離排序：水後畫的話，
   * 湖上的倒影與水面底下看得到的光點都會被那層七成的水色蓋掉
   */
  mesh.renderingGroupId = WEATHER_RENDERING_GROUP
  return mesh
}

export interface CaveGlow {
  dispose: () => void;
}

export function createCaveGlow({ scene, worldState }: { scene: Scene; worldState: Uint8Array }): CaveGlow {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = GLOW_VERTEX
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = GLOW_FRAGMENT

  const quadList = collectQuadList(worldState)
  const mesh = buildMesh(scene, quadList)

  const material = new ShaderMaterial('cave-glowworm-material', scene, SHADER_NAME, {
    attributes: [VertexBuffer.PositionKind, VertexBuffer.UVKind, 'glowParam'],
    uniforms: ['viewProjection', 'cameraPosition', 'time', 'waterY', 'glowColor', 'sceneFogRange'],
    needAlphaBlending: true,
  })
  material.alphaMode = Constants.ALPHA_ADD
  material.disableDepthWrite = true
  material.backFaceCulling = false
  material.setColor3('glowColor', GLOW_COLOR)
  material.setFloat('waterY', LAKE_SURFACE_Y)
  mesh.material = material

  /**
   * 最密的幾叢底下各一盞冷色真光
   *
   * 掛在洞頂下三格：太貼著岩只照亮那一小塊，往下一點，整片洞頂與底下的湖都染得到
   */
  const lightList = GLOW_CLUSTER_LIST.flatMap((cluster, index) => {
    const x = Math.round(HALL_CENTER.x + cluster.offsetX)
    const z = Math.round(HALL_CENTER.z + cluster.offsetZ)
    const ceilingY = findCeilingY(worldState, x, z)
    if (ceilingY < 0)
      return []

    const light = new PointLight(`cave-glow-light-${index}`, new Vector3(x, ceilingY - 3, z), scene)
    light.diffuse = GLOW_COLOR.clone()
    light.specular = new Color3(0, 0, 0)
    light.intensity = AREA_LIGHT_INTENSITY
    light.range = AREA_LIGHT_RANGE
    light.shadowEnabled = false
    return [light]
  })

  let time = 0
  const fogRange = new Vector2()
  const observer = scene.onBeforeRenderObservable.add(() => {
    time += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    material.setFloat('time', time)
    fogRange.set(scene.fogStart, scene.fogEnd)
    material.setVector2('sceneFogRange', fogRange)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      for (const light of lightList) {
        light.dispose()
      }
      mesh.dispose(false, true)
    },
  }
}
