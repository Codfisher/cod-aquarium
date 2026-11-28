import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2, Vector3 } from '@babylonjs/core'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE, SKY_QUAD_VERTEX, smoothRange } from '../realm-signature-kit'

/**
 * 千蛙沼夜裡的月暈（渲染端，屬於世界層）
 *
 * 沼澤上空的水氣重，月亮外面套著一圈二十二度的大暈：內緣銳利帶一點紅，往外慢慢散成藍白；
 * 月亮剛升起、還貼著林線時，暈裡面整片染成橘紅（濕氣把月光濾紅了），升高之後才退成冷色。
 * 沼面上的鬼火由環境粒子負責（marshlight），這裡只做天上那一圈。
 *
 * 一張跟著月亮走的方片（月亮永遠在太陽的正對面），圓環在片段著色器裡照角度畫。
 * 亮度跟著星空同進同退（nightRatio），再乘上月亮的高度：還沒升上來就沒有暈。
 * 成本：一張方片兩個三角形、一次繪製；方片約五十五度見方，但絕大部分片元是零，片段一次噪音取樣
 */

/** 方片的半邊長（切平面上的長度）：二十二度的暈在切平面上半徑約零點四，留一點邊給外側的散光 */
const HALO_EXTENT = new Vector2(0.56, 0.56)

/** 夜裡的峰值亮度：暈是一圈很淡的光，亮了就像畫上去的圓 */
const HALO_PEAK = 0.3

const HALO_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
uniform float lowRatio;
${GLSL_NOISE}

void main() {
  /** 離月亮的角距離（弧度）：方片在切平面上，長度取 atan 才是真的角度 */
  float angle = atan(length(vUv) * ${HALO_EXTENT.x.toFixed(2)});
  float offset = angle - 0.384;

  /** 內緣銳利、外緣拖著一段散光 */
  float ring = offset < 0.0 ? exp(-pow(offset / 0.012, 2.0)) : exp(-offset / 0.055);
  vec3 ringColor = mix(vec3(1.0, 0.62, 0.42), vec3(0.78, 0.87, 1.0), smoothstep(-0.012, 0.03, offset));

  /**
   * 水氣不均勻：圓環沿著圓周有濃有淡，慢慢流動
   *
   * 沿圓周的變化只用整數倍的正弦：atan 在正左方會從 π 跳到 −π，拿它去取噪音會在那裡留一道接縫
   */
  float around = atan(vUv.y, vUv.x);
  float mist = 0.62 + 0.19 * (1.0 + sin(around * 3.0 + time * 0.05 + 2.0 * sin(around + time * 0.03)));
  mist *= 0.85 + 0.15 * valueNoise(vec2(angle * 60.0, time * 0.05));

  /** 暈裡面那一片：月亮低的時候是橘紅的霾，升高之後幾乎沒有 */
  float inner = exp(-angle / 0.16) * (0.25 + 0.75 * lowRatio);
  vec3 innerColor = mix(vec3(0.7, 0.78, 0.95), vec3(1.0, 0.45, 0.2), lowRatio);

  float edge = 1.0 - smoothstep(0.82, 1.0, length(vUv));
  vec3 color = ringColor * ring * mist + innerColor * inner * 0.6;
  gl_FragColor = vec4(color * edge * strength, 1.0);
}
`

export function createSwampMoonHalo({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const moonDirection = new Vector3(0, 1, 0)

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'swamp-moon-halo',
    shaderName: 'minespaceSwampMoonHalo',
    vertexSource: SKY_QUAD_VERTEX,
    fragmentSource: HALO_FRAGMENT,
    uniformList: ['anchor', 'extent', 'lowRatio'],
    mesh: createQuadListMesh(scene, 'swamp-moon-halo', 1),
    blend: 'add',
    space: 'sky',
    fogHandling: '亮度是 nightRatio（星空可見度乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡都跟月亮一起淡出',
    update(frame, material) {
      moonDirection.copyFrom(frame.sunDirection).scaleInPlace(-1)
      const moonHeight = moonDirection.y
      material.setVector3('anchor', moonDirection)
      material.setVector2('extent', HALO_EXTENT)
      /** 月亮貼著地平線時染紅，升到三十度以上退成冷色 */
      material.setFloat('lowRatio', 1 - smoothRange(moonHeight, 0.12, 0.5))
      /** 月相：新月的夜月亮幾乎看不見，暈也跟著淡（滿月是一倍） */
      return frame.nightRatio * frame.moonLightRatio * smoothRange(moonHeight, 0.02, 0.16) * HALO_PEAK
    },
  })
}
