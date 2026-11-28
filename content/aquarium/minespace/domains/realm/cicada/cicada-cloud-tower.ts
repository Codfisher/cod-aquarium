import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Vector2, Vector3 } from '@babylonjs/core'
import { CICADA_CLOUD_TOWER_ANCHOR } from '../realm-signature-direction'
import { createQuadListMesh, createSignatureLayer, createSkyAnchorVector, GLSL_NOISE, SKY_QUAD_VERTEX, smoothRange } from '../realm-signature-kit'

/**
 * 蟬雨深林東邊的積雨雲（渲染端，屬於世界層）
 *
 * 夏天午後的招牌：林稜後面長起一座入道雲，底寬、中間一節一節往上堆、頂端攤成砧狀。
 * 白天向陽的那一側白得發亮，傍晚整座染成橘粉，天快黑時雲裡還會悶悶地閃幾下（熱雷，沒有聲音）。
 *
 * 體積雲畫不出這種「遠在天邊的一整座」，所以另外掛一張方片在天球上：片段著色器把座標切成
 * 四十乘三十格的大像素，用九顆雲泡取聯集再加一層噪音當輪廓，明暗壓成四階。
 * 顏色不寫死：亮面跟著此刻的日光色、暗面跟著天色、雲腳化進地平線的霧色，日夜與天氣變了它自己跟上。
 * 一般混合（不是相加）：它是擋在天空前面的實體，不是光。
 *
 * 白天才有（太陽落下後淡出），下雨或陰天罩蓋上來時跟著日月一起收。
 * 成本：一張方片兩個三角形、一次繪製；方片約五十七度乘四十三度，片段九次距離運算、一次噪音取樣
 */

/** 方片的半寬與半高（切平面上的長度，約等於弧度） */
const TOWER_EXTENT = new Vector2(0.5, 0.38)

const TOWER_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
uniform vec3 litColor;
uniform vec3 shadeColor;
uniform vec3 horizonColor;
uniform float sunSide;
uniform float thunderRatio;
${GLSL_NOISE}

/** 一顆雲泡：圓心是一、邊上是零、外面是負的 */
float puff(vec2 point, vec2 center, float radius) {
  return 1.0 - length(point - center) / radius;
}

void main() {
  /** 切成大像素，再把寬扁的方片換回等比例的座標 */
  vec2 grid = vec2(40.0, 30.0);
  vec2 cell = floor(vUv * grid * 0.5);
  vec2 snapped = (cell + 0.5) / (grid * 0.5);
  vec2 point = vec2(snapped.x * 1.32, snapped.y);

  /** 雲塔：底下三顆攤開、中間三顆往上堆、頂上三顆攤成砧 */
  float shape = puff(point, vec2(0.0, -0.75), 0.75);
  shape = max(shape, puff(point, vec2(-0.55, -0.8), 0.5));
  shape = max(shape, puff(point, vec2(0.6, -0.82), 0.55));
  shape = max(shape, puff(point, vec2(0.05, -0.25), 0.55));
  shape = max(shape, puff(point, vec2(-0.3, 0.0), 0.42));
  shape = max(shape, puff(point, vec2(0.28, 0.12), 0.45));
  shape = max(shape, puff(point, vec2(0.0, 0.45), 0.45));
  shape = max(shape, puff(point, vec2(-0.45, 0.55), 0.3));
  shape = max(shape, puff(point, vec2(0.5, 0.58), 0.34));
  /** 輪廓的凹凸，極慢地翻湧 */
  shape += (valueNoise(point * 5.0 + vec2(time * 0.004, 0.0)) - 0.5) * 0.45;
  float inside = step(0.0, shape);

  /** 明暗：越往雲泡中心、越高、越朝太陽那一側越亮，壓成四階 */
  float shade = clamp(0.42 + shape * 0.9 + point.y * 0.22 + point.x * sunSide * 0.3, 0.0, 1.0);
  shade = floor(shade * 4.0 + 0.5) / 4.0;
  vec3 color = mix(shadeColor, litColor, shade);

  /** 雲裡的悶雷：傍晚才有，每五秒有四成機會閃一陣，光從雲塔中段透出來 */
  float clock = time / 5.0;
  float cycle = floor(clock);
  float local = fract(clock) * 5.0;
  float flicker = step(0.5, fract(local * 7.0 + hash11(cycle + 3.0))) * exp(-local * 4.0);
  float thunder = step(0.6, hash11(cycle)) * flicker * thunderRatio;
  vec2 thunderOffset = point - vec2(hash11(cycle + 7.0) * 0.5 - 0.25, -0.1);
  color += vec3(0.7, 0.76, 1.0) * thunder * exp(-dot(thunderOffset, thunderOffset) * 4.0);

  /** 雲腳化進地平線，最底下整個淡掉，不露出方片的下緣 */
  color = mix(horizonColor, color, smoothstep(-0.95, -0.3, snapped.y));
  float alpha = inside * smoothstep(-1.0, -0.78, snapped.y);
  gl_FragColor = vec4(color, alpha * strength);
}
`

export function createCicadaCloudTower({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const anchor = createSkyAnchorVector(CICADA_CLOUD_TOWER_ANCHOR)
  const right = Vector3.Cross(Vector3.Up(), anchor).normalize()
  const litColor = new Color3()
  const shadeColor = new Color3()

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'cicada-cloud-tower',
    shaderName: 'minespaceCicadaCloudTower',
    vertexSource: SKY_QUAD_VERTEX,
    fragmentSource: TOWER_FRAGMENT,
    uniformList: ['anchor', 'extent', 'litColor', 'shadeColor', 'horizonColor', 'sunSide', 'thunderRatio'],
    mesh: createQuadListMesh(scene, 'cicada-cloud-tower', 1),
    blend: 'alpha',
    space: 'sky',
    fogHandling: '透明度乘 clearRatio（skyBodyFade 乘露天程度）：下雨、霧幕與洞裡整座淡掉；雲腳自己往霧色混',
    update(frame, material) {
      /** 亮面：日光色往白靠一點，太陽越低越暗；上限零點九，不讓泛光把像素的硬邊吃掉 */
      const sunlight = 0.3 + 0.6 * smoothRange(frame.sunHeight, -0.08, 0.3)
      litColor.set(
        (0.35 + 0.65 * atmosphere.lightColor.r) * sunlight,
        (0.35 + 0.65 * atmosphere.lightColor.g) * sunlight,
        (0.35 + 0.65 * atmosphere.lightColor.b) * sunlight,
      )
      /** 暗面：天色與霧色各半，再壓暗一點 */
      shadeColor.set(
        (atmosphere.skyMidColor.r + atmosphere.fogColor.r) * 0.36,
        (atmosphere.skyMidColor.g + atmosphere.fogColor.g) * 0.36,
        (atmosphere.skyMidColor.b + atmosphere.fogColor.b) * 0.38,
      )
      material.setVector3('anchor', anchor)
      material.setVector2('extent', TOWER_EXTENT)
      material.setColor3('litColor', litColor)
      material.setColor3('shadeColor', shadeColor)
      material.setColor3('horizonColor', atmosphere.fogColor)
      material.setFloat('sunSide', Vector3.Dot(frame.sunDirection, right))
      material.setFloat('thunderRatio', frame.twilightRatio)
      /** 太陽落到地平線下一點就淡出：夜裡沒有光打在它上面 */
      return smoothRange(frame.sunHeight, -0.14, 0.0) * frame.clearRatio
    },
  })
}
