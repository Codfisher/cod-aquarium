import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Vector2 } from '@babylonjs/core'
import { AUTUMN_GEESE_ANCHOR } from '../realm-signature-direction'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE, GLSL_SKY_DIRECTION, SIGNATURE_SHELL_RADIUS } from '../realm-signature-kit'

/**
 * 金葉林晨昏的雁行（渲染端，屬於世界層）
 *
 * 秋天的天空要有往南飛的雁：太陽貼著地平線、天色最紅的那一段，西邊低空一隊一隊人字形的雁群橫越過去。
 * 三隊各九隻，全在同一個網格裡；每隻是一張小方片，位置（隊伍走到哪、牠排第幾個）在頂點著色器裡算，
 * 片段著色器在八乘八的像素格上畫一個會拍翅的人字。深色剪影，用一般混合蓋在晚霞上。
 *
 * 只在晨昏出現（twilightRatio）：太陽升高或天黑之後淡出，下雨或陰天罩蓋上來時一起收。
 * 成本：二十七張方片共五十四個三角形、一次繪製；每隻約一度見方，片元很少
 */

const FORMATION_COUNT = 3
const BIRD_PER_FORMATION = 9

const GEESE_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float formationCount;
uniform vec2 course;
varying vec3 vInfo;
varying float vFade;
${GLSL_NOISE}
${GLSL_SKY_DIRECTION}

void main() {
  float index = position.z;
  float formation = floor(index / ${BIRD_PER_FORMATION.toFixed(1)});
  float slot = index - formation * ${BIRD_PER_FORMATION.toFixed(1)};
  /** 人字形：第零隻領頭，其餘一左一右往後排 */
  float rank = ceil(slot * 0.5);
  float side = mod(slot, 2.0) < 0.5 ? -1.0 : 1.0;

  /** 每一隊各自的週期，橫越一百五十度的方位；隊與隊錯開高度 */
  float period = 70.0 + formation * 17.0;
  float progress = fract(time / period + hash11(formation * 5.3));
  float leadAzimuth = course.x - (progress - 0.5) * 2.6;
  float elevation = course.y + (formation - 1.0) * 0.09 + 0.03 * sin(progress * 6.2831853 + formation);

  /** 往方位減少的方向飛，所以排在後面的方位比較大；左右兩翼在仰角上岔開 */
  float spacing = 0.02;
  float azimuth = leadAzimuth + rank * spacing;
  float lift = side * rank * spacing * 0.55 + 0.004 * sin(time * 0.7 + index);
  vec3 center = skyDirection(azimuth, elevation + lift);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), center));
  vec3 up = cross(center, right);
  vec3 direction = normalize(center + (right * position.x + up * position.y) * 0.011);

  /** 隊伍從一端的地平線霧裡冒出來，到另一端再淡掉 */
  bool isVisible = formation < formationCount;
  vFade = isVisible ? smoothstep(0.0, 0.12, progress) * smoothstep(1.0, 0.88, progress) : 0.0;
  vInfo = vec3(position.xy, sin(time * 5.5 + index * 1.7));
  gl_Position = isVisible
    ? viewProjection * world * vec4(direction * ${SIGNATURE_SHELL_RADIUS.toFixed(1)}, 1.0)
    : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const GEESE_FRAGMENT = `
precision highp float;
varying vec3 vInfo;
varying float vFade;
uniform float strength;
uniform vec3 tint;

void main() {
  /** 八乘八的像素格：中間兩格是身體，兩翼是一格粗的斜線，跟著拍翅上下翻 */
  vec2 pixel = floor(vInfo.xy * 4.0) + 0.5;
  float wingLine = (abs(pixel.x) - 0.5) * vInfo.z * 0.6;
  float wing = step(abs(pixel.y - wingLine), 0.6);
  float body = step(abs(pixel.x), 1.0) * step(abs(pixel.y), 1.0);
  float bird = max(wing, body);
  gl_FragColor = vec4(tint, bird * vFade * strength);
}
`

export function createAutumnGeese({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const course = new Vector2(AUTUMN_GEESE_ANCHOR.azimuth, AUTUMN_GEESE_ANCHOR.elevation)
  const tint = new Color3()

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'autumn-geese',
    shaderName: 'minespaceAutumnGeese',
    vertexSource: GEESE_VERTEX,
    fragmentSource: GEESE_FRAGMENT,
    uniformList: ['formationCount', 'course', 'tint'],
    mesh: createQuadListMesh(scene, 'autumn-geese', FORMATION_COUNT * BIRD_PER_FORMATION),
    blend: 'alpha',
    space: 'sky',
    fogHandling: '透明度是 twilightRatio（晨昏乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡整群淡掉',
    update(frame, material) {
      /** 剪影的顏色：此刻的霧色壓到很暗，逆著晚霞看是一隻隻黑影，但不是死黑 */
      tint.set(atmosphere.fogColor.r * 0.16, atmosphere.fogColor.g * 0.15, atmosphere.fogColor.b * 0.17)
      material.setColor3('tint', tint)
      material.setVector2('course', course)
      /** 畫質低就少一隊 */
      material.setFloat('formationCount', frame.detailRatio < 0.5 ? FORMATION_COUNT - 1 : FORMATION_COUNT)
      return frame.twilightRatio * 0.92
    },
  })
}
