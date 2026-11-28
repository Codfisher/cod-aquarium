import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector3 } from '@babylonjs/core'
import { WHEATFIELD_GALAXY_CORE_ANCHOR } from '../realm-signature-direction'
import { createSignatureLayer, createStripMesh, GLSL_NOISE, SIGNATURE_SHELL_RADIUS } from '../realm-signature-kit'

/**
 * 千頃麥浪夜空的銀河（渲染端，屬於世界層）
 *
 * 平原上沒有山、沒有樹冠，天空佔了畫面的大半；晴朗的夜裡一條銀河從東南的地平線斜斜跨過頭頂。
 * 做法與雪稜的極光同一路：一條掛在天球大圓上的格子帶，雲氣、暗帶與細星全在片段著色器裡用噪音畫，
 * 相加混合、不寫深度，原本的星點照樣透出來。
 *
 * 亮度跟著星空同進同退（nightRatio）：天黑透了才浮出來，下雨或陰天罩蓋上來時一起收。
 * 成本：48×6 格共 576 個三角形、一次繪製；帶子約佔天空一成五，片段只做四次噪音取樣
 */

/** 大圓弧切幾段、橫向切幾段 */
const SEGMENT_ALONG = 48
const SEGMENT_ACROSS = 6

/** 夜裡的峰值亮度，壓在泛光門檻之下：銀河是一片霧光，不該自己發亮成一條燈管 */
const GALAXY_PEAK = 0.34

/** 銀河的大圓相對於鉛直面傾斜多少（弧度）：不從正頭頂過，斜斜掛著才有縱深 */
const GALAXY_TILT = 0.42

const GALAXY_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform vec3 riseAxis;
uniform vec3 archAxis;
uniform vec3 poleAxis;
varying vec2 vUv;

void main() {
  /** u 沿著大圓從一側地平線下一點走到另一側，v 橫跨銀河的寬度 */
  float angle = mix(-0.12, 3.26, position.x);
  float across = (position.y - 0.5) * 0.62;
  vec3 direction = normalize(riseAxis * cos(angle) + archAxis * sin(angle) + poleAxis * across);
  vUv = position.xy;
  gl_Position = viewProjection * world * vec4(direction * ${SIGNATURE_SHELL_RADIUS.toFixed(1)}, 1.0);
}
`

const GALAXY_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
${GLSL_NOISE}

void main() {
  float u = vUv.x;
  float across = (vUv.y - 0.5) * 2.0;

  /** 銀心：靠近升起那一端的一段特別亮、特別寬 */
  float core = exp(-pow((u - 0.24) / 0.2, 2.0));
  float width = 0.3 + 0.24 * core;

  /** 雲氣：兩層噪音相乘，一團一團而不是均勻的一條 */
  float cloud = valueNoise(vec2(u * 16.0, across * 2.6 + 3.0));
  float detail = valueNoise(vec2(u * 46.0 + 11.0, across * 7.0));
  float body = exp(-pow(across / width, 2.0)) * (0.35 + 0.65 * cloud) * (0.6 + 0.4 * detail);

  /** 中間那條暗帶（星際塵埃）：沿著銀河蜿蜒，把亮帶劈成兩股 */
  float laneCenter = 0.14 * sin(u * 9.0) + (valueNoise(vec2(u * 12.0, 5.0)) - 0.5) * 0.3;
  float lane = smoothstep(0.02, 0.2 + 0.1 * core, abs(across - laneCenter));
  body *= 0.3 + 0.7 * lane;

  /** 細星：很密的格子裡偶爾亮一格，越靠近帶心越多，各自慢慢明滅 */
  vec2 cell = floor(vec2(u * 900.0, vUv.y * 120.0));
  float seed = hash21(cell);
  float density = 0.012 + 0.03 * exp(-pow(across / (width * 1.4), 2.0));
  float star = step(1.0 - density, seed) * (0.6 + 0.4 * sin(time * (1.0 + seed * 2.0) + seed * 40.0));

  /** 兩端收進地平線，橫向的邊緣也收乾淨，不露出帶子的形狀 */
  float endFade = smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.92, u);
  float edgeFade = 1.0 - smoothstep(0.75, 1.0, abs(across));

  vec3 haze = mix(vec3(0.5, 0.6, 0.9), vec3(1.0, 0.82, 0.62), core * 0.8);
  vec3 color = haze * body + vec3(0.9, 0.93, 1.0) * star * 0.9;
  gl_FragColor = vec4(color * endFade * edgeFade * strength, 1.0);
}
`

export function createWheatfieldGalaxy({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  /**
   * 大圓的三根軸：riseAxis 是升起那一端的地平線方向，archAxis 是拱到最高的方向（往一側歪 GALAXY_TILT），
   * poleAxis 垂直於大圓，用來攤開寬度。銀心的方位就是升起那一端
   */
  const azimuth = WHEATFIELD_GALAXY_CORE_ANCHOR.azimuth
  const riseAxis = new Vector3(Math.sin(azimuth), 0, -Math.cos(azimuth))
  const sideAxis = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))
  const archAxis = new Vector3(0, Math.cos(GALAXY_TILT), 0).addInPlace(sideAxis.scale(Math.sin(GALAXY_TILT)))
  const poleAxis = Vector3.Cross(riseAxis, archAxis).normalize()

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'wheatfield-galaxy',
    shaderName: 'minespaceWheatfieldGalaxy',
    vertexSource: GALAXY_VERTEX,
    fragmentSource: GALAXY_FRAGMENT,
    uniformList: ['riseAxis', 'archAxis', 'poleAxis'],
    mesh: createStripMesh(scene, 'wheatfield-galaxy', SEGMENT_ALONG, SEGMENT_ACROSS),
    blend: 'add',
    space: 'sky',
    fogHandling: '亮度是 nightRatio（星空可見度乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡都跟星星一起淡出',
    update(frame, material) {
      material.setVector3('riseAxis', riseAxis)
      material.setVector3('archAxis', archAxis)
      material.setVector3('poleAxis', poleAxis)
      return frame.nightRatio * GALAXY_PEAK
    },
  })
}
