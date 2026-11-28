import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector3 } from '@babylonjs/core'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE } from '../realm-signature-kit'
import { TERRACE_GROUND_Y, VILLAGE_CENTER } from './village-layout'

/**
 * 村落夜裡的天燈（渲染端，屬於世界層）
 *
 * 入夜之後村民在廣場上放天燈：一盞一盞暖橘的紙燈從廣場各處升起來，起先慢、越升越快，
 * 被風帶著往東北飄，升到一百格高才淡進夜空。天上同時總有二三十盞，遠近高低錯落。
 *
 * 四十盞燈是同一個網格裡的四十張方片，各有自己的週期與起飛點；升到哪、飄到哪全在頂點著色器裡照時間算，
 * 方片永遠面向鏡頭。片段著色器在二十四格見方的像素格上畫一個上寬下窄的紙燈，外面包一圈柔的暈。
 * 相加混合、不寫深度，畫在天氣那一層：屋頂與樹照樣擋得住。
 *
 * 亮度跟著星空同進同退（nightRatio）：天黑才放，下雨就不放了。
 * 成本：四十張方片共八十個三角形、一次繪製（效能檔減到約十四盞）；每盞三格見方的暈，遠的只剩幾個像素
 */

const LANTERN_COUNT = 40

/** 夜裡的峰值亮度：燈本體略過泛光門檻，自己帶出一圈暈 */
const LANTERN_PEAK = 0.95

const LANTERN_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform float time;
uniform float lanternCount;
uniform vec3 launchPoint;
uniform vec3 eyePosition;
varying vec3 vInfo;
varying float vSeed;
${GLSL_NOISE}

void main() {
  float index = position.z;
  float seedA = hash11(index * 1.93);
  float seedB = hash11(index * 4.41 + 2.0);
  /** 每一盞各自的週期（四十六到七十六秒）與錯開的起飛時間 */
  float period = 46.0 + seedA * 30.0;
  float progress = fract(time / period + seedB);

  /** 從廣場上某一點起飛 */
  float bearing = hash11(index * 7.7 + 5.0) * 6.2831853;
  float spread = sqrt(hash11(index * 3.3 + 8.0)) * 8.0;
  vec3 center = launchPoint + vec3(cos(bearing) * spread, 0.0, sin(bearing) * spread);

  /** 起先慢、越升越快；越高被風帶得越遠，還左右晃 */
  float rise = progress * (0.35 + 0.65 * progress) * 95.0;
  center.y += rise;
  center.x += rise * 0.32 + sin(time * 0.31 + index) * 2.4 * progress;
  center.z += rise * -0.18 + cos(time * 0.27 + index * 1.7) * 2.0 * progress;

  /** 面向鏡頭；燈在正頭頂時那個外積會是零，給一個固定的右 */
  vec3 toEye = normalize(eyePosition - center);
  vec3 side = cross(vec3(0.0, 1.0, 0.0), toEye);
  vec3 right = length(side) > 0.001 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  vec3 up = cross(toEye, right);
  vec3 worldPosition = center + (right * position.x + up * position.y) * 1.5;

  bool isVisible = index < lanternCount;
  float fade = smoothstep(0.0, 0.03, progress) * (1.0 - smoothstep(0.7, 1.0, progress));
  vInfo = vec3(position.xy, isVisible ? fade : 0.0);
  vSeed = seedA;
  gl_Position = isVisible ? viewProjection * vec4(worldPosition, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const LANTERN_FRAGMENT = `
precision highp float;
varying vec3 vInfo;
varying float vSeed;
uniform float time;
uniform float strength;

void main() {
  vec2 point = vInfo.xy;
  /** 二十四格見方的像素格，紙燈佔中間：上寬、腰最寬、底收窄 */
  vec2 pixel = floor(point * 12.0) + 0.5;
  float halfWidth = pixel.y > 2.0 ? 2.6 : (pixel.y > -3.0 ? 3.2 : 2.2);
  float body = step(abs(pixel.x), halfWidth) * step(abs(pixel.y), 4.2);
  /** 火在底下，所以下半截比較亮；整盞輕輕地閃 */
  float flame = 0.65 + 0.35 * clamp((2.0 - pixel.y) / 6.0, 0.0, 1.0);
  float flicker = 0.88 + 0.12 * sin(time * 6.0 + vSeed * 40.0);
  float halo = exp(-dot(point, point) * 5.0) * 0.4;
  vec3 color = vec3(1.0, 0.56, 0.2) * body * flame * flicker + vec3(1.0, 0.45, 0.14) * halo;
  gl_FragColor = vec4(color * vInfo.z * strength, 1.0);
}
`

export function createVillageSkyLanterns({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  /** 起飛點：廣場中央，人舉著燈的高度 */
  const launchPoint = new Vector3(VILLAGE_CENTER.x, TERRACE_GROUND_Y + 2.5, VILLAGE_CENTER.z)

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'village-sky-lanterns',
    shaderName: 'minespaceVillageSkyLanterns',
    vertexSource: LANTERN_VERTEX,
    fragmentSource: LANTERN_FRAGMENT,
    uniformList: ['lanternCount', 'launchPoint', 'eyePosition'],
    mesh: createQuadListMesh(scene, 'village-sky-lanterns', LANTERN_COUNT),
    blend: 'add',
    space: 'world',
    fogHandling: '亮度是 nightRatio（星空可見度乘 skyBodyFade 與露天程度）：下雨、換場景的霧幕與洞裡整批淡掉',
    update(frame, material) {
      material.setVector3('launchPoint', launchPoint)
      material.setVector3('eyePosition', frame.cameraPosition)
      material.setFloat('lanternCount', Math.max(12, Math.round(LANTERN_COUNT * frame.detailRatio)))
      return frame.nightRatio * LANTERN_PEAK
    },
  })
}
