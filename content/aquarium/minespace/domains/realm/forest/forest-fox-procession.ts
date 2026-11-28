import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector3 } from '@babylonjs/core'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE } from '../realm-signature-kit'
import { FOREST_CENTER, FOREST_GROUND_Y } from './forest-layout'

/**
 * 林海夜裡的狐火行列（渲染端，屬於世界層）
 *
 * 夜裡站在小徑上往密林深處看，樹幹之間有一串燈火排成一列慢慢走過：十六點暖橘的光，一點接著一點亮起來，
 * 上下輕輕晃（像有誰提著），走一陣子又從隊尾開始一點一點熄掉，過一會兒才再出現。那是狐狸娶親的隊伍，
 * 牠們繞著人走不進去的密林外圈走，所以永遠隔著幾排樹幹，只能從縫隙裡看到斷斷續續的一串。
 *
 * 十六點火是同一個網格裡的十六張方片，沿著一條繞林心的歪圓走；位置、亮滅全在頂點著色器裡照時間算，
 * 方片永遠面向鏡頭。相加混合、不寫深度，畫在天氣那一層：樹幹與樹冠照樣擋得住——被擋才是重點。
 *
 * 不看天氣（狐狸娶親本來就挑下雨天），只看天黑的程度；洞裡與換場景的霧幕裡收掉。
 * 成本：十六張方片共三十二個三角形、一次繪製；每點兩格見方的暈，隔著半座林子只剩幾個像素
 */

const FIRE_COUNT = 16

/** 行列繞林心的半徑（格）：落在密林那一圈（四十二到六十格），人走不到 */
const PROCESSION_RADIUS = 49

/** 天黑時的峰值亮度 */
const FIRE_PEAK = 0.9

const FIRE_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform float time;
uniform vec3 pathCenter;
uniform vec3 eyePosition;
varying vec3 vInfo;
varying float vSeed;
${GLSL_NOISE}

void main() {
  float index = position.z;
  float seed = hash11(index * 2.3 + 1.0);

  /** 整列沿著歪圓慢慢走（每秒約半格），前後兩點相隔一格多 */
  float angle = time * 0.011 + index * 0.034;
  float radius = ${PROCESSION_RADIUS.toFixed(1)} + 2.5 * sin(angle * 5.0) + 1.2 * sin(angle * 13.0 + 2.0);
  vec3 center = pathCenter + vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
  /** 提著走的燈，上下輕輕晃 */
  center.y += 0.22 * sin(time * 1.6 + index * 0.9);

  /**
   * 九十秒一輪：前六成的時間行列在，後四成整列不見。
   * 亮與滅都從隊頭傳到隊尾（每一點晚一點點），不是整列一起開關
   */
  float phase = fract(time / 90.0) - index * 0.004;
  float presence = smoothstep(0.0, 0.03, phase) * (1.0 - smoothstep(0.58, 0.61, phase));

  vec3 toEye = eyePosition - center;
  float eyeDistance = length(toEye);
  toEye /= max(eyeDistance, 0.001);
  vec3 side = cross(vec3(0.0, 1.0, 0.0), toEye);
  vec3 right = length(side) > 0.001 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  vec3 up = cross(toEye, right);
  vec3 worldPosition = center + (right * position.x + up * position.y) * 1.0;

  /** 太遠的自己淡掉（它不吃霧） */
  float distanceFade = 1.0 - smoothstep(80.0, 115.0, eyeDistance);
  vInfo = vec3(position.xy, presence * distanceFade);
  vSeed = seed;
  gl_Position = viewProjection * vec4(worldPosition, 1.0);
}
`

const FIRE_FRAGMENT = `
precision highp float;
varying vec3 vInfo;
varying float vSeed;
uniform float time;
uniform float strength;

void main() {
  vec2 point = vInfo.xy;
  /** 十六格見方的像素格，中間一小團火：下圓上尖 */
  vec2 pixel = floor(point * 8.0) + 0.5;
  float halfWidth = pixel.y > 1.0 ? 0.6 : 1.6;
  float core = step(abs(pixel.x), halfWidth) * step(-2.0, pixel.y) * step(pixel.y, 3.0);
  float flicker = 0.8 + 0.2 * sin(time * 7.0 + vSeed * 50.0) * sin(time * 2.3 + vSeed * 17.0);
  /** 暖橘的火芯外面一圈偏青的暈：不是人點的火 */
  float halo = exp(-dot(point, point) * 4.5);
  vec3 color = vec3(1.0, 0.7, 0.34) * core * flicker + vec3(0.3, 0.75, 0.6) * halo * 0.3;
  gl_FragColor = vec4(color * vInfo.z * strength, 1.0);
}
`

export function createForestFoxProcession({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  /** 行列的圓心，高度是地面上兩格多（狐狸提燈的高度） */
  const pathCenter = new Vector3(FOREST_CENTER.x, FOREST_GROUND_Y + 2.3, FOREST_CENTER.z)

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'forest-fox-procession',
    shaderName: 'minespaceForestFoxProcession',
    vertexSource: FIRE_VERTEX,
    fragmentSource: FIRE_FRAGMENT,
    uniformList: ['pathCenter', 'eyePosition'],
    mesh: createQuadListMesh(scene, 'forest-fox-procession', FIRE_COUNT),
    blend: 'add',
    space: 'world',
    fogHandling: '自己照離鏡頭的距離淡出（八十到一百一十五格），亮度乘 outdoorRatio：換場景的霧幕與洞裡收掉',
    update(frame, material) {
      material.setVector3('pathCenter', pathCenter)
      material.setVector3('eyePosition', frame.cameraPosition)
      return frame.darkRatio * frame.outdoorRatio * FIRE_PEAK
    },
  })
}
