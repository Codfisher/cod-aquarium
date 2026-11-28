import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Effect, Engine, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core'
import { createSeededRandom } from '../../../utils/noise'
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
 * - 山體：一層一層往上縮的多邊形台（八格一階，與遠山的階梯同一個量級），一個網格、一次繪製。
 *   岩色、層理、山腰的熔岩與錐頂的火光都在著色器裡算，不吃貼圖
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

/** 繞一圈切幾邊、每一階多高（格）、錐頂火口的半徑 */
const SEGMENT_COUNT = 28
const TIER_HEIGHT = 8
const SUMMIT_RADIUS = 9

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

/**
 * 山體的網格
 *
 * 頂點：位置、法線、color（明暗、是不是錐頂的火口、高度比例、離「朝火口這一側」的方位差 −1 到 1）
 */
function createConeMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const normalList: number[] = []
  const colorList: number[] = []
  const indexList: number[] = []
  const random = createSeededRandom('jigoku-far-cone')
  const tierCount = Math.ceil(FAR_CONE.height / TIER_HEIGHT)
  /** 朝著火口中心的方位（繞山體的角度） */
  const facingAngle = Math.atan2(JIGOKU_CENTER.z - CONE_Z, JIGOKU_CENTER.x - CONE_X)

  const toFacing = (angle: number): number => {
    const difference = angle - facingAngle
    /** 收進正負半圈 */
    const wrapped = difference - Math.round(difference / (Math.PI * 2)) * Math.PI * 2
    return wrapped / Math.PI
  }
  const pushVertex = (angle: number, radius: number, y: number, normal: [number, number, number], shade: number, isVent: number): void => {
    positionList.push(CONE_X + Math.cos(angle) * radius, y, CONE_Z + Math.sin(angle) * radius)
    normalList.push(...normal)
    colorList.push(shade, isVent, Math.min(1, Math.max(0, (y - FOOT_Y) / FAR_CONE.height)), toFacing(angle))
  }
  const pushQuad = (): void => {
    const baseIndex = positionList.length / 3 - 4
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  for (let tier = 0; tier < tierCount; tier++) {
    const bottomY = FOOT_Y + tier * TIER_HEIGHT
    const topY = Math.min(VENT_Y, bottomY + TIER_HEIGHT)
    const radius = measureConeRadius(tier / tierCount)
    const nextRadius = measureConeRadius((tier + 1) / tierCount)
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      const fromAngle = (segment / SEGMENT_COUNT) * Math.PI * 2
      const toAngle = ((segment + 1) / SEGMENT_COUNT) * Math.PI * 2
      const middleAngle = (fromAngle + toAngle) / 2
      const fromRadius = radius * measureGully(fromAngle)
      const toRadius = radius * measureGully(toAngle)
      /** 每一面的明暗差一點點，不然整座山是一個顏色 */
      const shade = 0.86 + random() * 0.28

      /** 這一階立著的那一面 */
      const sideNormal: [number, number, number] = [Math.cos(middleAngle), 0, Math.sin(middleAngle)]
      pushVertex(fromAngle, fromRadius, bottomY, sideNormal, shade, 0)
      pushVertex(toAngle, toRadius, bottomY, sideNormal, shade, 0)
      pushVertex(toAngle, toRadius, topY, sideNormal, shade, 0)
      pushVertex(fromAngle, fromRadius, topY, sideNormal, shade, 0)
      pushQuad()

      /** 這一階的頂面：往裡縮到下一階的腳；最上面那一階的頂面就是火口，整片發光 */
      const isSummit = tier === tierCount - 1
      const innerFrom = isSummit ? 0 : nextRadius * measureGully(fromAngle)
      const innerTo = isSummit ? 0 : nextRadius * measureGully(toAngle)
      const topNormal: [number, number, number] = [0, 1, 0]
      pushVertex(fromAngle, fromRadius, topY, topNormal, shade * 1.12, isSummit ? 1 : 0)
      pushVertex(toAngle, toRadius, topY, topNormal, shade * 1.12, isSummit ? 1 : 0)
      pushVertex(toAngle, innerTo, topY, topNormal, shade * 1.12, isSummit ? 1 : 0)
      pushVertex(fromAngle, innerFrom, topY, topNormal, shade * 1.12, isSummit ? 1 : 0)
      pushQuad()
    }
  }

  const mesh = new Mesh('jigoku-far-cone', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.colors = colorList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

const CONE_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec4 vInfo;
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  vInfo = color;
  vWorld = position;
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
/** r 明暗、g 是不是錐頂的火口、b 從山腳（0）到錐頂（1）、a 離朝火口那一側的方位差（−1 到 1） */
varying vec4 vInfo;
varying vec3 vWorld;
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

  /** 岩：一層一層的熔岩流，山腰以下蓋著一層落灰 */
  float strata = 0.86 + 0.14 * step(0.5, fract(vWorld.y / 5.0 + valueNoise(vWorld.xz * 0.02) * 2.0));
  float ashAmount = (1.0 - smoothstep(0.15, 0.6, height)) * (0.4 + 0.6 * valueNoise(vWorld.xz * 0.05 + 3.0));
  vec3 rock = mix(ROCK, ASH, ashAmount * 0.6) * strata * vInfo.r;

  float sunFacing = max(dot(normal, sunDirection), 0.0);
  vec3 lit = ambientLight * (0.45 + 0.55 * normal.y) + sunLight * sunFacing;
  vec3 color = rock * lit;

  /** 山腰的熔岩：朝火口這一側一道主流從錐頂淌到山腳，偏東另一道短的；往下淌的亮斑一格一格挪 */
  float meander = 0.05 * sin(height * 9.0) + 0.025 * sin(height * 23.0 + 1.0);
  float mainWidth = 0.022 + 0.03 * (1.0 - height);
  float mainStream = 1.0 - smoothstep(mainWidth * 0.45, mainWidth, abs(facing + 0.04 - meander));
  float sideStream = (1.0 - smoothstep(0.012, 0.026, abs(facing - 0.3 - meander * 1.5))) * smoothstep(0.42, 0.55, height);
  float flow = valueNoise(vec2(floor(facing * 120.0), floor(height * 60.0 + time * 0.7)));
  float stream = max(mainStream, sideStream) * (0.55 + 0.45 * flow);
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
    attributes: ['position', 'normal', 'color'],
    uniforms: ['viewProjection', 'ambientLight', 'sunLight', 'sunDirection', 'horizonColor', 'haze', 'veilRatio', 'glowRatio', 'time'],
  })
  /** 繞向沒有整理過，兩面都畫；整座約三千個三角形 */
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
