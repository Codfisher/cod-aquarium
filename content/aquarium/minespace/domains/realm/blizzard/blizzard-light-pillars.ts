import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { BlockLightSource } from '../../world/light-source'
import { createAnchoredQuadMesh, createSignatureLayer } from '../realm-signature-kit'
import { BLIZZARD_CENTER } from './blizzard-layout'

/**
 * 白矇雪原夜裡的光柱（渲染端，屬於世界層）
 *
 * 極冷的夜裡空氣中飄著平躺的冰晶，每一盞燈的光被它們往上反射，在燈的正上方拉出一根筆直的光柱：
 * 底下是燈火的暖色，越往上越冷越淡，裡面有一點一點往上竄的閃爍。這是真的自然現象，
 * 而暴風雪裡什麼都看不遠，偏偏這幾根光柱隔著雪幕還看得到——它們就是這片雪原上的路標。
 *
 * 世界上每一盞燈火（燈籠、紙燈、營火）上方一張細長的方片，全在同一個網格裡；
 * 方片繞著鉛直軸轉向鏡頭（只轉水平方向，柱子永遠是直的）。相加混合、不寫深度，畫在天氣那一層。
 *
 * 不看天氣（雪越大冰晶越多），只看天黑的程度；洞裡與換場景的霧幕裡收掉。
 * 這座場景的霧只到四十格，光柱不吃霧，所以自己照距離淡出（三十四到六十四格）：比霧遠一點，才有路標的作用。
 * 成本：最多四十八根共九十六個三角形、一次繪製；每根不到一格寬，片元很少，片段沒有取樣
 */

/** 最多幾根：燈再多也只取離場景中心最近的這幾盞 */
const PILLAR_LIMIT = 48

/** 天黑時的峰值亮度 */
const PILLAR_PEAK = 0.42

const PILLAR_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec3 normal;
uniform mat4 viewProjection;
uniform vec3 eyePosition;
varying vec3 vInfo;
varying float vDistance;

void main() {
  /** 只在水平面上轉向鏡頭 */
  vec3 toEye = eyePosition - position;
  toEye.y = 0.0;
  float planar = length(toEye);
  vec3 right = planar > 0.001 ? vec3(toEye.z, 0.0, -toEye.x) / planar : vec3(1.0, 0.0, 0.0);

  /** normal.x 是每根各自的亂數：高度二十二到三十二格 */
  float height = 22.0 + normal.x * 10.0;
  vec3 worldPosition = position + vec3(0.0, 0.7 + uv.y * height, 0.0) + right * uv.x * 0.42;
  vInfo = vec3(uv, normal.x);
  vDistance = planar;
  gl_Position = viewProjection * vec4(worldPosition, 1.0);
}
`

const PILLAR_FRAGMENT = `
precision highp float;
varying vec3 vInfo;
varying float vDistance;
uniform float time;
uniform float strength;

void main() {
  float across = 1.0 - abs(vInfo.x);
  float v = vInfo.y;
  /** 柱心最亮、兩側收掉；從燈上方一點開始，往上指數淡掉 */
  float column = across * across * smoothstep(0.0, 0.05, v) * exp(-v * 2.4);
  /** 冰晶一陣一陣飄過：一段一段往上竄的明暗 */
  float shimmer = 0.75 + 0.25 * sin(v * 14.0 - time * 1.1 + vInfo.z * 30.0) * sin(time * 0.6 + vInfo.z * 11.0);
  /** 貼在臉上與太遠的都淡掉 */
  float distanceFade = smoothstep(1.5, 5.0, vDistance) * (1.0 - smoothstep(34.0, 64.0, vDistance));
  vec3 color = mix(vec3(1.0, 0.74, 0.4), vec3(0.85, 0.9, 1.0), smoothstep(0.0, 0.7, v));
  gl_FragColor = vec4(color * column * shimmer * distanceFade * strength, 1.0);
}
`

export function createBlizzardLightPillars({ scene, atmosphere, lightSourceList }: {
  scene: Scene;
  worldState: Uint8Array;
  atmosphere: AtmosphereState;
  lightSourceList: BlockLightSource[];
}): { dispose: () => void } {
  /** 岩漿那種躺平的面光源不算；太多就留離中心近的 */
  const anchorList = lightSourceList
    .filter((source) => !source.isAreaLight)
    .map((source) => ({
      x: source.x,
      y: source.y,
      z: source.z,
      distance: Math.hypot(source.x - BLIZZARD_CENTER.x, source.z - BLIZZARD_CENTER.z),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, PILLAR_LIMIT)

  /** 一盞燈都沒有就什麼都不建 */
  if (anchorList.length === 0)
    return { dispose() {} }

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'blizzard-light-pillars',
    shaderName: 'minespaceBlizzardLightPillars',
    vertexSource: PILLAR_VERTEX,
    fragmentSource: PILLAR_FRAGMENT,
    uniformList: ['eyePosition'],
    attributeList: ['uv', 'normal'],
    mesh: createAnchoredQuadMesh(scene, 'blizzard-light-pillars', anchorList),
    blend: 'add',
    space: 'world',
    fogHandling: '自己照離鏡頭的水平距離淡出（三十四到六十四格），亮度乘 outdoorRatio：換場景的霧幕與洞裡收掉',
    update(frame, material) {
      material.setVector3('eyePosition', frame.cameraPosition)
      return frame.darkRatio * frame.outdoorRatio * PILLAR_PEAK
    },
  })
}
