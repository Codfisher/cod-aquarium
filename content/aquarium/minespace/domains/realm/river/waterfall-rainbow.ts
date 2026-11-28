import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector3 } from '@babylonjs/core'
import { createIndexedMesh, createSignatureLayer, GLSL_NOISE, smoothRange } from '../realm-signature-kit'
import { UPPER_FLOOR_Y, WATERFALL_POINT } from './river-layout'

/**
 * 溪谷瀑布水霧裡的彩虹（渲染端，屬於世界層）
 *
 * 瀑布砸進水潭，潭面上方終年一團水霧；出太陽的時候，站在下游往瀑布看，水霧裡橫著一道虹。
 * 太陽在人背後（東邊）時最鮮明，太陽繞到瀑布後面就只剩淡淡的一抹；陰天、下雨、天黑都沒有。
 *
 * 一張立在水潭上方、面朝下游的方片，虹的圓心在潭面：片段著色器先把座標切成半格見方的大像素，
 * 再照離圓心的距離上色（外紅內紫，壓成六階），虹腳紮在水霧裡最濃、弧頂最淡，整道隨水霧濃淡慢慢呼吸。
 * 相加混合、不寫深度，畫在天氣那一層：峽谷的岩壁照樣擋得住兩隻虹腳。
 *
 * 人要在瀑布的下游側才看得到（繞到背面沒有），走太近、太遠也淡掉。
 * 成本：一張方片兩個三角形、一次繪製；二十八格乘十四格的一片，片段一次噪音取樣
 */

/** 方片立在瀑布落點下游幾格（瀑布在谷的西端，下游是 +X） */
const PLANE_OFFSET_X = 4

/** 虹的內外半徑（格） */
const BOW_INNER_RADIUS = 9
const BOW_WIDTH = 2.6

/** 方片的半寬與高（格），比虹大一圈 */
const PLANE_HALF_WIDTH = 14
const PLANE_HEIGHT = 14

/** 最鮮明時的亮度：虹是很淡的東西，亮了就像貼紙 */
const BOW_PEAK = 0.34

const RAINBOW_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
varying vec3 vWorld;

void main() {
  vWorld = position;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const RAINBOW_FRAGMENT = `
precision highp float;
varying vec3 vWorld;
uniform float time;
uniform float strength;
uniform vec3 bowCenter;
${GLSL_NOISE}

void main() {
  /** 方片上的座標：x 沿著瀑布的寬、y 往上，切成半格見方的大像素 */
  vec2 point = vec2(vWorld.z - bowCenter.z, vWorld.y - bowCenter.y);
  point = (floor(point * 2.0) + 0.5) / 2.0;

  float radius = length(point);
  float band = (radius - ${BOW_INNER_RADIUS.toFixed(1)}) / ${BOW_WIDTH.toFixed(1)};
  float inside = step(0.0, band) * step(band, 1.0);

  /** 六階的色帶：外圈紅、內圈紫 */
  float hue = (1.0 - (floor(clamp(band, 0.0, 0.999) * 6.0) + 0.5) / 6.0) * 0.78;
  vec3 spectrum = clamp(abs(fract(hue + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);

  /** 水霧有濃有淡，虹跟著一塊一塊地明暗 */
  float mist = 0.6 + 0.4 * valueNoise(vec2(point.x * 0.25 + time * 0.08, point.y * 0.3 - time * 0.15));
  /** 虹腳最濃、弧頂最淡；貼著潭面那一截收掉 */
  float height = point.y / ${(BOW_INNER_RADIUS + BOW_WIDTH).toFixed(1)};
  float lift = smoothstep(0.0, 0.12, height) * (1.0 - 0.45 * height);

  gl_FragColor = vec4(spectrum * inside * mist * lift * strength, 1.0);
}
`

export function createWaterfallRainbow({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const planeX = WATERFALL_POINT.x + PLANE_OFFSET_X
  /** 虹的圓心在潭面上（與 river-realm 的 waterfallMist 同一個高度） */
  const bowCenter = new Vector3(planeX, UPPER_FLOOR_Y + 0.4, WATERFALL_POINT.z)

  const mesh = createIndexedMesh(scene, 'river-waterfall-rainbow', [
    planeX,
    bowCenter.y,
    bowCenter.z - PLANE_HALF_WIDTH,
    planeX,
    bowCenter.y,
    bowCenter.z + PLANE_HALF_WIDTH,
    planeX,
    bowCenter.y + PLANE_HEIGHT,
    bowCenter.z + PLANE_HALF_WIDTH,
    planeX,
    bowCenter.y + PLANE_HEIGHT,
    bowCenter.z - PLANE_HALF_WIDTH,
  ], [0, 1, 2, 0, 2, 3])

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'river-waterfall-rainbow',
    shaderName: 'minespaceWaterfallRainbow',
    vertexSource: RAINBOW_VERTEX,
    fragmentSource: RAINBOW_FRAGMENT,
    uniformList: ['bowCenter'],
    mesh,
    blend: 'add',
    space: 'world',
    fogHandling: '亮度含 dayRatio（太陽露出乘 skyBodyFade 與露天程度）並照鏡頭離瀑布的距離淡出：下雨、霧幕、洞裡與走遠都收掉',
    update(frame, material) {
      material.setVector3('bowCenter', bowCenter)
      /** 太陽要升到一定高度水霧才照得到；在人背後（東邊）最鮮明，繞到瀑布後面只留兩成半 */
      const sunRatio = smoothRange(frame.sunHeight, 0.06, 0.22)
        * (0.25 + 0.75 * smoothRange(frame.sunDirection.x, -0.1, 0.35))
      /** 人在下游側才看得到：貼著方片時淡掉（不然會看到一片色塊從臉上穿過去），走遠了也淡掉 */
      const downstream = frame.cameraPosition.x - planeX
      const viewRatio = smoothRange(downstream, 2, 9) * (1 - smoothRange(downstream, 70, 105))
      return frame.dayRatio * sunRatio * viewRatio * BOW_PEAK
    },
  })
}
