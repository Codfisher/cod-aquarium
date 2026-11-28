import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2 } from '@babylonjs/core'
import { CAMPFIRE_COMET_ANCHOR } from '../realm-signature-direction'
import { createQuadListMesh, createSignatureLayer, createSkyAnchorVector, GLSL_NOISE, SKY_QUAD_VERTEX } from '../realm-signature-kit'

/**
 * 拓荒原夜空的大彗星（渲染端，屬於世界層）
 *
 * 荒原上除了營火沒有別的光，夜空乾淨到西南方低空掛著一顆拖著長尾的彗星：
 * 彗頭一團暖白的暈，寬而彎的塵埃尾往上甩，旁邊另有一道又細又直的藍色離子尾。
 * 整顆是掛在天球上的一張方片，形狀全在片段著色器裡算（幾個高斯與指數相乘），沒有貼圖。
 *
 * 亮度跟著星空同進同退（nightRatio）。
 * 成本：一張方片兩個三角形、一次繪製；方片約佔視野的四十度乘二十度，片段只有一次噪音取樣
 */

/** 方片的半寬與半高（切平面上的長度，約等於弧度） */
const COMET_EXTENT = new Vector2(0.42, 0.24)

/** 夜裡的峰值亮度：彗頭可以略過泛光門檻，尾巴是淡的 */
const COMET_PEAK = 0.9

const COMET_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
${GLSL_NOISE}

void main() {
  /** 方片比例是寬扁的，換回等比例的座標再算形狀 */
  vec2 point = vec2(vUv.x * 1.75, vUv.y);
  vec2 head = vec2(-1.2, -0.52);
  vec2 offset = point - head;

  /** 尾巴的軸：往右上甩；along 是沿軸離彗頭多遠，across 是離軸多遠 */
  vec2 axis = normalize(vec2(1.0, 0.36));
  float along = dot(offset, axis);
  float across = dot(offset, vec2(-axis.y, axis.x));
  float behind = max(along, 0.0);

  /** 塵埃尾：越遠越寬，還慢慢往一側彎；裡面有幾道順著尾巴的紋理 */
  float bend = behind * behind * 0.1;
  float dustWidth = 0.035 + behind * 0.16;
  float streak = 0.75 + 0.25 * valueNoise(vec2((across - bend) / dustWidth * 2.5, behind * 3.0 - time * 0.02));
  float dust = exp(-pow((across - bend) / dustWidth, 2.0)) * exp(-behind * 1.15) * step(0.0, along) * streak;

  /** 離子尾：又細又直，偏藍，方向與塵埃尾差一點角度 */
  float ionAcross = across + behind * 0.2;
  float ion = exp(-pow(ionAcross / (0.012 + behind * 0.03), 2.0)) * exp(-behind * 0.8) * step(0.0, along);

  /** 彗頭：一顆亮核外面包一團暈 */
  float distanceSquared = dot(offset, offset);
  float coma = exp(-distanceSquared / 0.0016) * 1.4 + exp(-distanceSquared / 0.02) * 0.45;

  /** 方片邊緣收乾淨 */
  float edge = (1.0 - smoothstep(0.78, 1.0, abs(vUv.x))) * (1.0 - smoothstep(0.78, 1.0, abs(vUv.y)));

  vec3 color = vec3(1.0, 0.93, 0.78) * (dust * 0.55 + coma) + vec3(0.45, 0.72, 1.0) * ion * 0.5;
  gl_FragColor = vec4(color * edge * strength, 1.0);
}
`

export function createCampfireComet({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const anchor = createSkyAnchorVector(CAMPFIRE_COMET_ANCHOR)

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'campfire-comet',
    shaderName: 'minespaceCampfireComet',
    vertexSource: SKY_QUAD_VERTEX,
    fragmentSource: COMET_FRAGMENT,
    uniformList: ['anchor', 'extent'],
    mesh: createQuadListMesh(scene, 'campfire-comet', 1),
    blend: 'add',
    space: 'sky',
    fogHandling: '亮度是 nightRatio（星空可見度乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡都跟星星一起淡出',
    update(frame, material) {
      material.setVector3('anchor', anchor)
      material.setVector2('extent', COMET_EXTENT)
      return frame.nightRatio * COMET_PEAK
    },
  })
}
