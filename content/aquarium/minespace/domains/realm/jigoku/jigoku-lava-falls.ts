import type { Scene } from '@babylonjs/core'
import { Color4, DynamicTexture, Effect, Engine, Mesh, ParticleSystem, ShaderMaterial, Texture, Vector2, Vector3 } from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId, isLavaBlock, isPassableBlock } from '../../block/block-constants'
import { getBlock } from '../../world/world-access'
import { WORLD_HEIGHT, WORLD_SIZE } from '../../world/world-constants'
import { JIGOKU_CENTER, LAKE_Y, LAVA_FALL_LIST, LAVA_SPATTER_POINT_LIST, LAVA_SURFACE_Y } from './jigoku-layout'

/**
 * 熔岩瀑的流動與湖面的熔岩花（渲染端，屬於世界層）
 *
 * 引擎沒有「流動的熔岩」這種方塊：瀑身是一疊靜止的熔岩方塊，貼圖只會原地換格，
 * 看起來是一面發亮的牆，不是往下淌的東西。這裡照溪谷瀑布的水幕（river/waterfall-curtain）在外面貼一層：
 *
 * - 流幕：貼在瀑身每一個露出來的側面外，三層雜訊以不同速度往下捲。熔岩是黏的，捲得慢（水幕的六分之一），
 *   亮的地方是剛翻出來的黃白、暗的地方是結了殼的暗紅；取樣座標切成八分之一格，流動是一格一格像素往下挪
 * - 落潭：瀑腳的湖面上一圈往外推的亮斑，熔岩砸進湖裡翻出來的那一片
 * - 熔岩花：一組粒子，一顆一顆亮點從落潭與湖面幾處熱點拋起來、畫一道弧又落回去
 *
 * 流幕要貼在哪裡不寫死：掃一次方塊資料，高過湖面的熔岩格、側面朝著空氣的就貼，
 * 地形怎麼改（瀑布搬家、加寬、加一道）這裡都跟得上。整組一個網格、一次繪製，加一組粒子。
 * 顏色是自己發光的，不吃日夜的光；只照場景的霧淡出去
 */

const SHADER_NAME = 'minespaceJigokuLavaFall'

/** 流幕貼在方塊側面外這麼遠，避開與方塊面同深度的閃爍 */
const FACE_OFFSET = 0.04

/** 落潭的亮斑浮在熔岩面上這麼高：要蓋在湖面那張面（jigoku-lava-surface，浮 0.06）之上 */
const CHURN_LIFT = 0.1

const VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec4 span;
attribute vec2 tangent;
uniform mat4 viewProjection;
uniform mat4 view;
varying vec3 vWorld;
varying vec4 vSpan;
varying vec2 vTangent;
varying float vViewDistance;
void main() {
  vWorld = position;
  vSpan = span;
  vTangent = tangent;
  vViewDistance = length((view * vec4(position, 1.0)).xyz);
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
uniform float time;
uniform vec3 fogColor;
uniform vec2 fogRange;
varying vec3 vWorld;
/** 流幕：x 底、y 頂、z 零；落潭：x 與 y 是圓心、z 一、w 半徑 */
varying vec4 vSpan;
varying vec2 vTangent;
varying float vViewDistance;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 smoothed = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, smoothed.x), mix(c, d, smoothed.x), smoothed.y);
}

/** 切成八分之一格：方塊的貼圖是十六格像素，流幕的顆粒與它同一個量級 */
float pixel(float value) {
  return floor(value * 8.0) / 8.0;
}

const vec3 CRUST = vec3(0.17, 0.035, 0.02);
const vec3 RED = vec3(1.25, 0.2, 0.03);
const vec3 ORANGE = vec3(2.3, 0.78, 0.1);
const vec3 YELLOW = vec3(2.9, 1.9, 0.55);

void main() {
  vec3 color;
  float alpha;

  if (vSpan.z < 0.5) {
    float along = pixel(dot(vWorld.xz, vTangent));
    float height = pixel(vWorld.y);
    /* 三層：寬的舌、細的絲、很慢的大塊明暗；都往下捲，速度不同才不會整面一起平移 */
    float tongue = valueNoise(vec2(along * 0.7, (height + pixel(time * 1.5)) * 0.13));
    float streak = valueNoise(vec2(along * 2.6 + 13.0, (height + pixel(time * 2.4)) * 0.3));
    float slow = valueNoise(vec2(along * 0.35 + 5.0, (height + pixel(time * 0.8)) * 0.07));
    float heat = tongue * 0.45 + streak * 0.3 + slow * 0.25;

    float fromTop = vSpan.y - vWorld.y;
    float fromBottom = vWorld.y - vSpan.x;
    /* 瀑頂是剛翻出來的、瀑腳砸在湖面上，兩頭都比中段熱 */
    heat += (1.0 - smoothstep(0.0, 3.0, fromTop)) * 0.24;
    heat += (1.0 - smoothstep(0.0, 2.5, fromBottom)) * 0.2;

    color = mix(CRUST, RED, smoothstep(0.3, 0.42, heat));
    color = mix(color, ORANGE, smoothstep(0.42, 0.58, heat));
    color = mix(color, YELLOW, smoothstep(0.66, 0.82, heat));
    alpha = 0.94;
  }
  else {
    vec2 point = vec2(pixel(vWorld.x), pixel(vWorld.z));
    vec2 offset = point - vSpan.xy;
    float reach = length(offset);
    float ratio = reach / vSpan.w;
    /* 一圈一圈往外推的亮斑，越往外越碎 */
    float ring = valueNoise(vec2(reach * 1.3 - time * 1.1, atan(offset.y, offset.x) * 2.0));
    float fine = valueNoise(point * 2.4 + vec2(time * 0.4, -time * 0.3));
    float heat = (1.0 - ratio) * 0.75 + ring * 0.35 + fine * 0.2 - 0.25;
    color = mix(ORANGE, YELLOW, smoothstep(0.5, 0.9, heat));
    alpha = smoothstep(0.25, 0.6, heat) * (1.0 - smoothstep(0.75, 1.0, ratio));
  }

  /* 自己發光的東西穿得過霧：只淡到八成 */
  float fogRatio = clamp((vViewDistance - fogRange.x) / (fogRange.y - fogRange.x), 0.0, 1.0);
  color = mix(color, fogColor, fogRatio * 0.8);
  gl_FragColor = vec4(color, alpha);
}
`

interface FallGeometry {
  positionList: number[];
  spanList: number[];
  tangentList: number[];
  indexList: number[];
}

/** 四個水平方向：瀑身朝哪一側露出來，流幕就貼哪一側 */
const SIDE_LIST = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
] as const

/** 這一格的這一側是不是露在外面的熔岩面：自己是熔岩、隔壁是空氣或穿得過去的東西 */
function isOpenFallFace(worldState: Uint8Array, x: number, y: number, z: number, side: { x: number; z: number }): boolean {
  if (!isLavaBlock(getBlock(worldState, x, y, z)))
    return false
  const neighbourId = getBlock(worldState, x + side.x, y, z + side.z)
  return neighbourId === BlockId.AIR || (isPassableBlock(neighbourId) && !isLavaBlock(neighbourId))
}

/** 加一片立著的流幕：貼在 (x, z) 這一格柱朝 side 那一側，高度從 bottomY 到 topY */
function addCurtainQuad(geometry: FallGeometry, x: number, z: number, side: { x: number; z: number }, bottomY: number, topY: number): void {
  const centerX = x + side.x * (0.5 + FACE_OFFSET)
  const centerZ = z + side.z * (0.5 + FACE_OFFSET)
  /** 沿著壁面的方向：朝外的方向轉九十度 */
  const tangentX = -side.z
  const tangentZ = side.x
  const baseIndex = geometry.positionList.length / 3
  for (const [along, y] of [[-0.5, bottomY], [0.5, bottomY], [0.5, topY], [-0.5, topY]] as const) {
    geometry.positionList.push(centerX + tangentX * along, y, centerZ + tangentZ * along)
    geometry.spanList.push(bottomY, topY, 0, 0)
    /** 兩個方向的側面共用同一條「沿著壁面」的軸，轉角兩側的紋路才接得起來 */
    geometry.tangentList.push(Math.abs(tangentX), Math.abs(tangentZ))
  }
  geometry.indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
}

/** 加一片躺著的落潭亮斑 */
function addChurnQuad(geometry: FallGeometry, centerX: number, centerZ: number, radius: number): void {
  const y = LAVA_SURFACE_Y + CHURN_LIFT
  const baseIndex = geometry.positionList.length / 3
  for (const [offsetX, offsetZ] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    geometry.positionList.push(centerX + offsetX * radius, y, centerZ + offsetZ * radius)
    geometry.spanList.push(centerX, centerZ, 1, radius)
    geometry.tangentList.push(1, 0)
  }
  geometry.indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
}

/**
 * 掃方塊資料，把流幕與落潭拼成一個網格
 *
 * 同一格柱同一側、上下連著的露出面併成一片（主瀑一根柱子二十七格高，併完是一片不是二十七片）；
 * 最底下那一片往下接到熔岩面，最上面那一片頂緣矮八分之一格（液面那一層本來就矮）
 */
function buildGeometry(worldState: Uint8Array): FallGeometry {
  const geometry: FallGeometry = { positionList: [], spanList: [], tangentList: [], indexList: [] }

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      /** 絕大多數格柱在湖面以上沒有熔岩，先掃一趟就跳過，不必四個方向各掃一次 */
      let hasRaisedLava = false
      for (let y = LAKE_Y + 1; y < WORLD_HEIGHT && !hasRaisedLava; y++) {
        hasRaisedLava = isLavaBlock(getBlock(worldState, x, y, z))
      }
      if (!hasRaisedLava)
        continue

      for (const side of SIDE_LIST) {
        let runStartY = -1
        for (let y = LAKE_Y + 1; y <= WORLD_HEIGHT; y++) {
          const isOpen = y < WORLD_HEIGHT && isOpenFallFace(worldState, x, y, z, side)
          if (isOpen && runStartY < 0) {
            runStartY = y
            continue
          }
          if (isOpen || runStartY < 0)
            continue
          const runEndY = y - 1
          const bottomY = runStartY === LAKE_Y + 1 ? LAVA_SURFACE_Y : runStartY - 0.5
          const isSurface = !isLavaBlock(getBlock(worldState, x, runEndY + 1, z))
          addCurtainQuad(geometry, x, z, side, bottomY, runEndY + 0.5 - (isSurface ? 0.125 : 0))
          runStartY = -1
        }
      }
    }
  }

  for (const fall of LAVA_FALL_LIST) {
    /** 落潭的圓心從壁腳往火口裡退兩格 */
    const inwardX = JIGOKU_CENTER.x - fall.x
    const inwardZ = JIGOKU_CENTER.z - fall.z
    const inwardLength = Math.hypot(inwardX, inwardZ)
    addChurnQuad(geometry, fall.x + (inwardX / inwardLength) * 2, fall.z + (inwardZ / inwardLength) * 2, fall.halfWidth * 2 + 3)
  }
  return geometry
}

/** 熔岩花的貼圖：四格見方的一塊白，顏色交給粒子自己 */
function createSpatterTexture(scene: Scene): DynamicTexture {
  const size = 4
  const texture = new DynamicTexture('jigoku-spatter-texture', { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true
  return texture
}

/**
 * 熔岩花：從湖面拋起來又落回去的亮點
 *
 * 落潭權重最高、拋得也最高；湖面那幾處熱點只是偶爾一兩顆。
 * 顆粒給得比火星大（零點二到零點五格）：這是隔著幾十格從崖上看的東西，再小就只剩一個點
 */
function createSpatter(scene: Scene): ParticleSystem {
  const particleSystem = new ParticleSystem('jigoku-spatter', 180, scene)
  particleSystem.particleTexture = createSpatterTexture(scene)
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  particleSystem.applyFog = true
  const totalWeight = LAVA_SPATTER_POINT_LIST.reduce((sum, point) => sum + point.weight, 0)
  const random = createSeededRandom('jigoku-spatter')
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    let roll = random() * totalWeight
    let picked = LAVA_SPATTER_POINT_LIST[0]!
    for (const point of LAVA_SPATTER_POINT_LIST) {
      roll -= point.weight
      if (roll <= 0) {
        picked = point
        break
      }
    }
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * picked.radius
    positionToUpdate.set(picked.x + Math.cos(angle) * distance, LAVA_SURFACE_Y, picked.z + Math.sin(angle) * distance)
  }
  /** 剛拋起來是黃白，落回去之前冷成暗紅 */
  particleSystem.color1 = new Color4(1, 0.82, 0.34, 1)
  particleSystem.color2 = new Color4(1, 0.5, 0.12, 1)
  particleSystem.colorDead = new Color4(0.5, 0.06, 0.01, 0)
  particleSystem.minSize = 0.2
  particleSystem.maxSize = 0.5
  particleSystem.minLifeTime = 0.9
  particleSystem.maxLifeTime = 1.9
  particleSystem.emitRate = 70
  particleSystem.gravity = new Vector3(0, -9, 0)
  particleSystem.direction1 = new Vector3(-0.9, 3.5, -0.9)
  particleSystem.direction2 = new Vector3(0.9, 8.5, 0.9)
  particleSystem.minEmitPower = 0.7
  particleSystem.maxEmitPower = 1.1
  particleSystem.minAngularSpeed = 0
  particleSystem.maxAngularSpeed = 0
  particleSystem.updateSpeed = 0.012
  particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD
  particleSystem.start()
  return particleSystem
}

export function createJigokuLavaFalls({ scene, worldState }: { scene: Scene; worldState: Uint8Array }): { dispose: () => void } {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const geometry = buildGeometry(worldState)
  const mesh = new Mesh('jigoku-lava-fall', scene)
  mesh.setVerticesData('position', geometry.positionList, false, 3)
  mesh.setVerticesData('span', geometry.spanList, false, 4)
  mesh.setVerticesData('tangent', geometry.tangentList, false, 2)
  mesh.setIndices(geometry.indexList)
  mesh.isPickable = false
  /** 兩道瀑布隔著半座火口，包圍盒橫跨整個場景，不讓剔除來回切 */
  mesh.alwaysSelectAsActiveMesh = true
  mesh.renderingGroupId = WEATHER_RENDERING_GROUP

  const material = new ShaderMaterial('jigoku-lava-fall', scene, SHADER_NAME, {
    attributes: ['position', 'span', 'tangent'],
    uniforms: ['viewProjection', 'view', 'time', 'fogColor', 'fogRange'],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.alphaMode = Engine.ALPHA_COMBINE
  material.disableDepthWrite = true
  mesh.material = material

  const spatter = createSpatter(scene)

  let elapsedSecond = 0
  const fogRange = new Vector2()
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsedSecond += scene.getEngine().getDeltaTime() / 1000
    material.setFloat('time', elapsedSecond)
    material.setColor3('fogColor', scene.fogColor)
    /** ShaderMaterial 沒有 setFloat2（那是 Effect 的），用一個重複利用的 Vector2 傳 */
    fogRange.set(scene.fogStart, scene.fogEnd)
    material.setVector2('fogRange', fogRange)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose(false, false)
      material.dispose()
      /** 粒子系統預設會連貼圖一起釋放 */
      spatter.dispose()
    },
  }
}
