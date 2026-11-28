import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2 } from '@babylonjs/core'
import { MEADOW_METEOR_RADIANT_ANCHOR } from '../realm-signature-direction'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE, GLSL_SKY_DIRECTION, SIGNATURE_SHELL_RADIUS } from '../realm-signature-kit'

/**
 * 風露原夜空的流星雨（渲染端，屬於世界層）
 *
 * 地上是一原野的螢火，天上隔幾秒劃過一道流星：都從東北高空的輻射點往四面散開，離輻射點越遠拖得越長。
 * 十道流星是同一個網格裡的十片細長方片，各有自己的週期；每一輪用雜湊換一個起點，
 * 位置、長度與明暗全在頂點著色器裡照時間算，沒輪到的那幾片丟到畫面外（不產生片段）。
 *
 * 亮度跟著星空同進同退（nightRatio）。
 * 成本：十片共二十個三角形、一次繪製；同一時間通常只有零到兩道在畫，片元極少
 */

const METEOR_COUNT = 10

/** 流星頭的峰值亮度：一閃而過的東西可以亮一點，讓泛光帶出一點暈 */
const METEOR_PEAK = 1.1

const METEOR_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float activeCount;
uniform vec2 radiant;
varying vec3 vInfo;
${GLSL_NOISE}
${GLSL_SKY_DIRECTION}

void main() {
  float index = position.z;
  /** 每一道各自的週期（十四到三十六秒）與錯開的起跑時間 */
  float period = 14.0 + hash11(index * 3.1) * 22.0;
  float clock = time / period + hash11(index * 7.7 + 1.0);
  float cycle = floor(clock);
  /** 一輪裡只有最前面零點九秒在飛 */
  float progress = fract(clock) * period / 0.9;

  /** 這一輪從輻射點的哪個方向飛出去、飛多遠才亮起來 */
  float bearing = hash21(vec2(index, cycle)) * 6.2831853;
  float startDistance = 0.18 + hash21(vec2(cycle, index + 9.0)) * 0.75;
  float travel = 0.2 + startDistance * 0.35;

  vec3 radiantDirection = skyDirection(radiant.x, radiant.y);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), radiantDirection));
  vec3 north = cross(radiantDirection, east);
  vec3 outward = east * cos(bearing) + north * sin(bearing);

  /** 頭在前、尾在後：尾巴落後頭零點四個行程 */
  float along = position.x * 0.5 + 0.5;
  float headDistance = startDistance + travel * progress;
  float pointDistance = headDistance - travel * 0.4 * (1.0 - along);
  vec3 center = normalize(radiantDirection * cos(pointDistance) + outward * sin(pointDistance));
  vec3 side = normalize(cross(center, outward));
  vec3 direction = normalize(center + side * position.y * 0.0045);

  bool isVisible = progress < 1.0 && index < activeCount;
  vInfo = vec3(along, position.y, isVisible ? sin(progress * 3.14159) : 0.0);
  gl_Position = isVisible
    ? viewProjection * world * vec4(direction * ${SIGNATURE_SHELL_RADIUS.toFixed(1)}, 1.0)
    : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const METEOR_FRAGMENT = `
precision highp float;
varying vec3 vInfo;
uniform float strength;

void main() {
  float along = vInfo.x;
  float across = 1.0 - abs(vInfo.y);
  /** 尾巴往後漸細漸暗，頭是一顆亮點 */
  float trail = pow(along, 2.6) * across * across;
  float head = smoothstep(0.9, 1.0, along) * across;
  vec3 color = mix(vec3(0.55, 0.75, 1.0), vec3(0.9, 1.0, 0.88), along);
  gl_FragColor = vec4(color * (trail * 0.7 + head * 0.9) * vInfo.z * strength, 1.0);
}
`

export function createMeadowMeteors({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const radiant = new Vector2(MEADOW_METEOR_RADIANT_ANCHOR.azimuth, MEADOW_METEOR_RADIANT_ANCHOR.elevation)
  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'meadow-meteors',
    shaderName: 'minespaceMeadowMeteors',
    vertexSource: METEOR_VERTEX,
    fragmentSource: METEOR_FRAGMENT,
    uniformList: ['activeCount', 'radiant'],
    mesh: createQuadListMesh(scene, 'meadow-meteors', METEOR_COUNT),
    blend: 'add',
    space: 'sky',
    fogHandling: '亮度是 nightRatio（星空可見度乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡都跟星星一起淡出',
    update(frame, material) {
      /** 畫質低就少幾道，至少留四道 */
      material.setFloat('activeCount', Math.max(4, Math.round(METEOR_COUNT * frame.detailRatio)))
      material.setVector2('radiant', radiant)
      return frame.nightRatio * METEOR_PEAK
    },
  })
}
