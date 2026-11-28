import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Mesh, VertexData } from '@babylonjs/core'
import { createSignatureLayer, GLSL_NOISE } from '../realm-signature-kit'
import { COAST_CENTER, measureCoastShoreDistance, SAND_ISLAND_RADIUS, SEA_WATER_SURFACE_Y } from './coast-layout'

/**
 * 海中沙島夜裡的藍眼淚（渲染端，屬於世界層）
 *
 * 天黑之後，浪打上沙灘的那一圈海水發出藍光：夜光藻被浪攪動才會亮，所以光沿著岸線一陣一陣往岸上推，
 * 貼著沙的那一道最亮，外面幾道浪頭淡淡的；有的灣濃、有的岬稀，還會慢慢換地方。
 *
 * 一圈貼在海面上方一點點的環帶：建的時候沿一百二十八個方位往外找岸線（讀 coast-layout 的岸線距離），
 * 內緣壓在沙灘底下半格、外緣到岸外六格。浪的節奏、濃淡與一格一格的閃光都在片段著色器裡算。
 * 相加混合、不寫深度，畫在天氣那一層：沙灘比海面高，自然擋掉壓在沙底下的那半格。
 *
 * 不看天氣（雨點打在海面上它只會更亮），只看天黑的程度；洞裡與換場景的霧幕裡收掉。
 * 成本：一百二十八段共 256 個三角形、一次繪製；環帶只有六格半寬，片元很少，片段三次噪音取樣
 */

/** 沿岸線取幾個方位 */
const SEGMENT_COUNT = 128

/** 環帶從岸線往內多少、往外多少（格） */
const INNER_INSET = 0.5
const OUTER_REACH = 6

/** 貼在海面上方多高：要低於灘地的頂面（海面上方八分之一格），沙才擋得住內緣 */
const SPARKLE_LIFT = 0.05

/** 天黑時的峰值亮度：浪尖可以略過泛光門檻，帶出一點暈 */
const SPARKLE_PEAK = 0.85

const SPARKLE_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 viewProjection;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vUv = uv;
  vWorld = position;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const SPARKLE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;
uniform float time;
uniform float strength;
uniform vec3 eyePosition;
${GLSL_NOISE}

void main() {
  float v = vUv.y;
  float azimuth = vUv.x * 6.2831853;
  /** 沿岸線的噪音在圓上取樣，繞一圈接得起來 */
  vec2 ring = vec2(cos(azimuth), sin(azimuth));

  /** 浪一道一道往岸上推（v 從一往零走），各段岸線的浪不同步 */
  float wobble = valueNoise(ring * 6.0 + vec2(time * 0.05, 0.0)) * 1.6;
  float crest = pow(max(sin((v * 2.2 + time * 0.22 + wobble) * 6.2831853), 0.0), 5.0);
  float reach = smoothstep(0.0, 0.05, v) * (1.0 - smoothstep(0.5, 1.0, v));

  /** 貼著沙的那一道：浪退下去暗一點、湧上來亮一點 */
  float swash = exp(-pow((v - 0.1) / 0.1, 2.0)) * (0.55 + 0.45 * sin(time * 0.9 + wobble * 3.0));

  /** 藻有濃有淡：沿岸幾段特別亮，慢慢換地方 */
  float bloom = smoothstep(0.3, 0.75, valueNoise(ring * 3.0 + vec2(1.7, time * 0.03)));

  /** 半格見方的亮片，釘在世界座標上，各自照節拍明滅 */
  vec2 cell = floor(vWorld.xz * 2.0);
  float seed = hash21(cell);
  float sparkle = step(0.72, hash21(cell + floor(time * (1.0 + seed * 2.0) + seed * 9.0) * 0.31));

  float glow = (crest * 0.8 * reach + swash) * (0.35 + 0.65 * bloom) * (0.55 + 0.45 * sparkle);
  vec3 color = mix(vec3(0.05, 0.35, 1.0), vec3(0.3, 0.95, 1.0), clamp(glow, 0.0, 1.0)) * glow;
  float distanceFade = 1.0 - smoothstep(70.0, 110.0, distance(vWorld, eyePosition));
  gl_FragColor = vec4(color * distanceFade * strength, 1.0);
}
`

/** 沿某個方位從島心往外走，回傳岸線（岸線距離第一次不小於島半徑）離島心多遠 */
function findShoreRadius(angle: number): number {
  const directionX = Math.cos(angle)
  const directionZ = Math.sin(angle)
  for (let radius = 4; radius < 70; radius += 0.25) {
    const x = COAST_CENTER.x + directionX * radius
    const z = COAST_CENTER.z + directionZ * radius
    if (measureCoastShoreDistance(x, z) >= SAND_ISLAND_RADIUS)
      return radius
  }
  return SAND_ISLAND_RADIUS
}

/** 沿岸線的環帶：uv.x 繞一圈、uv.y 從內緣（零）到外緣（一），位置直接是世界座標 */
function createShoreRingMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const uvList: number[] = []
  const indexList: number[] = []
  const y = SEA_WATER_SURFACE_Y + SPARKLE_LIFT

  for (let segment = 0; segment <= SEGMENT_COUNT; segment++) {
    /** 最後一欄與第一欄同一個方位：uv 要從一接回零，所以頂點不共用 */
    const angle = (segment % SEGMENT_COUNT) / SEGMENT_COUNT * Math.PI * 2
    const shoreRadius = findShoreRadius(angle)
    for (const [offset, across] of [[-INNER_INSET, 0], [OUTER_REACH, 1]] as const) {
      const radius = shoreRadius + offset
      positionList.push(COAST_CENTER.x + Math.cos(angle) * radius, y, COAST_CENTER.z + Math.sin(angle) * radius)
      uvList.push(segment / SEGMENT_COUNT, across)
    }
  }
  for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
    const inner = segment * 2
    indexList.push(inner, inner + 1, inner + 2, inner + 1, inner + 3, inner + 2)
  }

  const mesh = new Mesh('coast-sea-sparkle', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.uvs = uvList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

export function createCoastSeaSparkle({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'coast-sea-sparkle',
    shaderName: 'minespaceCoastSeaSparkle',
    vertexSource: SPARKLE_VERTEX,
    fragmentSource: SPARKLE_FRAGMENT,
    uniformList: ['eyePosition'],
    attributeList: ['uv'],
    mesh: createShoreRingMesh(scene),
    blend: 'add',
    space: 'world',
    fogHandling: '自己照離鏡頭的距離淡出（七十到一百一十格），亮度乘 outdoorRatio：換場景的霧幕與洞裡收掉',
    update(frame, material) {
      material.setVector3('eyePosition', frame.cameraPosition)
      return frame.darkRatio * frame.outdoorRatio * SPARKLE_PEAK
    },
  })
}
