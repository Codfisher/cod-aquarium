import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2 } from '@babylonjs/core'
import { createSignatureLayer, createStripMesh, GLSL_NOISE, SKY_RING_VERTEX } from '../realm-signature-kit'

/**
 * 湯煙谷天上的火映與火山雷（渲染端，屬於世界層）
 *
 * 谷底的熔岩把低垂的硫煙從底下照紅：谷稜上方一整圈暗紅的光，貼著稜線最亮、往上淡掉，
 * 熔岩縫延伸的東西兩頭特別紅，整片像呼吸一樣一脹一縮。煙柱裡偶爾竄出一道淡紫的火山雷，連閃兩三下。
 *
 * 一條繞地平線一整圈的格子帶，掛在天球上、相加混合。畫在天氣那一層（陰天罩與體積雲之後），
 * 光才是「打在雲上」而不是被雲蓋掉；各層之間不清深度，谷壁照樣擋得住它。
 *
 * 不看天氣（那是地熱，下雨照樣紅），白天留四成、天黑全亮；洞裡與換場景的霧幕裡收掉。
 * 成本：48×4 格共 384 個三角形、一次繪製；帶子從地平線到仰角四十三度，平視時約佔半個畫面，
 * 片段兩次噪音取樣加幾次雜湊，沒有迴圈
 */

/** 帶子的下緣與上緣仰角（弧度） */
const GLOW_ELEVATION_RANGE = new Vector2(-0.02, 0.75)

/** 天黑時的峰值亮度 */
const GLOW_PEAK = 0.5

/** 白天還留幾成 */
const GLOW_DAY_RATIO = 0.4

const GLOW_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
${GLSL_NOISE}

void main() {
  float u = vUv.x;
  float v = vUv.y;
  float azimuth = u * 6.2831853;
  /** 沿圓周的噪音在圓上取樣，繞一圈接得起來，北邊不會留一道縫 */
  vec2 ring = vec2(cos(azimuth), sin(azimuth));

  /** 熔岩縫是東西向的，兩頭的煙最紅 */
  float riftWeight = 0.55 + 0.45 * cos(2.0 * (azimuth - 1.5707963));
  float billow = valueNoise(ring * 4.0 + vec2(time * 0.05, v * 3.0 - time * 0.07));
  float fine = valueNoise(ring * 11.0 + vec2(v * 8.0 - time * 0.12, 3.0));
  float pulse = 0.72 + 0.28 * sin(time * 0.45 + billow * 5.0);
  float glow = exp(-v * 3.2) * (0.45 + 0.55 * billow) * (0.7 + 0.3 * fine) * riftWeight * pulse;
  vec3 color = mix(vec3(1.0, 0.2, 0.04), vec3(1.0, 0.5, 0.14), exp(-v * 7.0)) * glow;

  /** 火山雷：每七秒一輪，六成五的機會打一道；前一秒多連閃幾下 */
  float clock = time / 7.0;
  float cycle = floor(clock);
  float local = fract(clock) * 7.0;
  float fires = step(0.35, hash11(cycle * 1.7));
  float flicker = step(0.45, fract(local * 9.0 + hash11(cycle))) * exp(-local * 3.5) * step(local, 1.2);
  float offset = u - hash11(cycle + 11.0);
  offset -= floor(offset + 0.5);
  /** 閃電本體：一節一節橫向跳的折線，粗的轉折疊細的抖動 */
  float segment = floor(v * 18.0);
  float wander = (hash21(vec2(segment, cycle)) - 0.5) * 0.012
    + (hash21(vec2(floor(segment / 4.0), cycle + 5.0)) - 0.5) * 0.03;
  float bolt = step(abs(offset - wander), 0.0009) * step(0.1, v) * step(v, 0.62);
  /** 閃電照亮四周的煙 */
  float sheet = exp(-pow(offset / 0.06, 2.0)) * exp(-pow((v - 0.35) / 0.25, 2.0));
  color += vec3(0.78, 0.66, 1.0) * (bolt * 1.4 + sheet * 0.5) * flicker * fires;

  /** 上緣收乾淨 */
  color *= 1.0 - smoothstep(0.85, 1.0, v);
  gl_FragColor = vec4(color * strength, 1.0);
}
`

export function createJigokuSkyGlow({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'jigoku-sky-glow',
    shaderName: 'minespaceJigokuSkyGlow',
    vertexSource: SKY_RING_VERTEX,
    fragmentSource: GLOW_FRAGMENT,
    uniformList: ['elevationRange'],
    mesh: createStripMesh(scene, 'jigoku-sky-glow', 48, 4),
    blend: 'add',
    space: 'sky',
    layer: 'weather',
    fogHandling: '亮度乘 outdoorRatio（露天程度，含 edgeRatio 的霧幕）：換場景與洞裡收掉；它是地熱的光，不跟著雨收',
    update(frame, material) {
      material.setVector2('elevationRange', GLOW_ELEVATION_RANGE)
      return frame.outdoorRatio * (GLOW_DAY_RATIO + (1 - GLOW_DAY_RATIO) * frame.darkRatio) * GLOW_PEAK
    },
  })
}
