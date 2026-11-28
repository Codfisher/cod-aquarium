import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2 } from '@babylonjs/core'
import { createSignatureLayer, createStripMesh, GLSL_NOISE, SKY_RING_VERTEX } from '../realm-signature-kit'

/**
 * 聽雨林雲層裡的片狀閃電（渲染端，屬於世界層）
 *
 * 雨下不停的谷地，頭頂永遠是一片灰。隔幾秒遠處的雲裡無聲地亮一下：不是一道閃電，是整塊雲從裡面被照亮，
 * 那一瞬間才看得出雲其實是一層疊一層的。亮的位置每次不同，有時在林梢後面、有時幾乎在頭頂。
 *
 * 一條繞地平線一整圈的格子帶，掛在天球上、相加混合。這座場景的陰天罩一直蓋著，
 * 所以畫在天氣那一層（陰天罩之後），不然整片被灰罩吃掉；各層之間不清深度，樹冠照樣擋得住它。
 * 兩組互不相干的閃光各跑各的週期（九秒與十三秒），每一輪用雜湊決定打不打、打在哪。
 *
 * 不看天氣（雨越大越該有），白天留四成五、天黑全亮；洞裡與換場景的霧幕裡收掉。
 * 與真的打雷（天氣系統的 flashRatio，會照亮地面、有雷聲）是兩回事：這是遠到聽不見的那一種。
 * 成本：48×5 格共 480 個三角形、一次繪製；帶子從地平線到仰角五十四度，
 * 片段兩次噪音取樣加幾次雜湊，沒有迴圈；沒有閃的時候畫出來是全黑（相加等於沒畫）
 */

/** 帶子的下緣與上緣仰角（弧度） */
const LIGHTNING_ELEVATION_RANGE = new Vector2(0.02, 0.95)

/** 天黑時的峰值亮度 */
const LIGHTNING_PEAK = 0.62

/** 白天還留幾成：白天的雲本來就亮，閃光只是淡淡的一下 */
const LIGHTNING_DAY_RATIO = 0.45

const LIGHTNING_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
${GLSL_NOISE}

/** 一組閃光：每一輪決定打不打、打在哪個方位與高度，前一秒半連閃幾下再留一點餘暉 */
float sheetFlash(float u, float v, float period, float seed) {
  float clock = time / period + seed;
  float cycle = floor(clock);
  float local = fract(clock) * period;
  float fires = step(0.3, hash11(cycle * 1.3 + seed));
  float flicker = (step(0.5, fract(local * 6.0 + hash11(cycle + seed))) * 0.7 + 0.3)
    * exp(-local * 2.6) * step(local, 1.6);
  float offset = u - hash11(cycle + seed * 7.0 + 2.0);
  offset -= floor(offset + 0.5);
  float center = 0.15 + hash11(cycle * 3.1 + seed) * 0.4;
  float spread = exp(-pow(offset / 0.11, 2.0) - pow((v - center) / 0.32, 2.0));
  return spread * flicker * fires;
}

void main() {
  float u = vUv.x;
  float v = vUv.y;
  float azimuth = u * 6.2831853;
  /** 沿圓周的噪音在圓上取樣，繞一圈接得起來 */
  vec2 ring = vec2(cos(azimuth), sin(azimuth));

  /** 雲的層次：平常看不到，被閃光照到才浮出來。橫向拉長，一層一層的 */
  float mass = valueNoise(ring * 5.0 + vec2(v * 6.0, time * 0.01));
  float shelf = valueNoise(vec2(ring.x * 9.0 + ring.y * 4.0, v * 14.0));
  float cloud = 0.3 + 0.7 * mass * (0.45 + 0.55 * shelf);

  float flash = sheetFlash(u, v, 9.0, 0.37) + sheetFlash(u, v, 13.0, 4.61);
  float fade = smoothstep(0.0, 0.06, v) * (1.0 - smoothstep(0.82, 1.0, v));
  gl_FragColor = vec4(vec3(0.7, 0.78, 1.0) * flash * cloud * fade * strength, 1.0);
}
`

export function createRainvaleSheetLightning({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'rainvale-sheet-lightning',
    shaderName: 'minespaceRainvaleSheetLightning',
    vertexSource: SKY_RING_VERTEX,
    fragmentSource: LIGHTNING_FRAGMENT,
    uniformList: ['elevationRange'],
    mesh: createStripMesh(scene, 'rainvale-sheet-lightning', 48, 5),
    blend: 'add',
    space: 'sky',
    layer: 'weather',
    fogHandling: '亮度乘 outdoorRatio（露天程度，含 edgeRatio 的霧幕）：換場景與洞裡收掉；雲裡的光不跟著雨收',
    update(frame, material) {
      material.setVector2('elevationRange', LIGHTNING_ELEVATION_RANGE)
      return frame.outdoorRatio * (LIGHTNING_DAY_RATIO + (1 - LIGHTNING_DAY_RATIO) * frame.darkRatio) * LIGHTNING_PEAK
    },
  })
}
