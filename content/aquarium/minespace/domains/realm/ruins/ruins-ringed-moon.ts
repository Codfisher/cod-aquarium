import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2, Vector3 } from '@babylonjs/core'
import { RUINS_RINGED_MOON_ANCHOR } from '../realm-signature-direction'
import { createQuadListMesh, createSignatureLayer, createSkyAnchorVector, GLSL_NOISE, SKY_QUAD_VERTEX } from '../realm-signature-kit'

/**
 * 石殿遺址天上的環月（渲染端，屬於世界層）
 *
 * 遺址的天上除了平常那顆月亮，還固定掛著另一顆帶環的大月亮：就在正北的坐像與東北的門闕之間，
 * 兩座巨像一左一右夾著它。那是造這些巨像的人膜拜的東西，所以整座石殿的長廊軸線都朝著它。
 *
 * 一張掛在天球上的方片，片段著色器先把座標切成三十六格見方的大像素（跟方形的日月同一種語言），
 * 再畫球體、環與環縫。球面的明暗照真的太陽方向算，所以一夜之間盈虧會變；
 * 白天也看得到一點（像白天的月亮一樣淡），天黑才亮起來。
 *
 * 成本：一張方片兩個三角形、一次繪製；方片約二十三度見方，片段沒有迴圈、一次雜湊
 */

/** 方片的半寬與半高（切平面上的長度，約等於弧度）：月面直徑約九度，連環約二十一度 */
const MOON_EXTENT = new Vector2(0.2, 0.2)

/** 夜裡的峰值亮度，與月亮一樣壓在泛光門檻之下，像素的硬邊才留得住 */
const MOON_PEAK = 0.82

/** 白天還留幾成：淡淡的一個影子 */
const MOON_DAY_RATIO = 0.1

const MOON_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float strength;
uniform vec3 lightVector;
${GLSL_NOISE}

void main() {
  /** 切成大像素：每格取中心的座標來算，邊緣自然是階梯狀 */
  vec2 cell = floor(vUv * 18.0);
  vec2 point = (cell + 0.5) / 18.0;

  /** 球體：算出球面法線，照太陽的方向打光，再壓成四階 */
  float bodyRadius = 0.4;
  vec2 surface = point / bodyRadius;
  float body = step(dot(surface, surface), 1.0);
  vec3 normal = vec3(surface, sqrt(max(1.0 - dot(surface, surface), 0.0)));
  float light = clamp(dot(normal, normalize(lightVector + vec3(0.0, 0.0, 0.3))), 0.0, 1.0);
  light = floor(light * 4.0 + 0.5) / 4.0;
  /** 幾格顏色深一點的斑，像隕石坑 */
  float crater = step(0.84, hash21(cell * 0.37 + 3.0)) * 0.2;
  vec3 bodyColor = vec3(0.76, 0.86, 0.8) * (0.1 + 0.9 * light) * (1.0 - crater);

  /** 環：一個壓扁再轉斜的圓環，中間留一道環縫 */
  vec2 tilted = vec2(point.x * 0.92 + point.y * 0.39, -point.x * 0.39 + point.y * 0.92);
  float ringRadius = length(vec2(tilted.x, tilted.y / 0.3));
  float ring = step(0.56, ringRadius) * step(ringRadius, 0.94);
  ring *= 1.0 - step(0.7, ringRadius) * step(ringRadius, 0.76);
  /** 環的遠半邊繞到球體後面，被球擋住 */
  float ringShown = tilted.y < 0.0 ? ring : ring * (1.0 - body);
  vec3 ringColor = vec3(0.94, 0.8, 0.58) * (ringRadius > 0.76 ? 0.5 : 0.72);

  vec3 color = mix(bodyColor * body, ringColor, ringShown);
  gl_FragColor = vec4(color * strength, 1.0);
}
`

export function createRuinsRingedMoon({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const anchor = createSkyAnchorVector(RUINS_RINGED_MOON_ANCHOR)
  /** 方片的右與上，與 SKY_QUAD_VERTEX 裡算的是同一組：把太陽方向換到方片的座標上用 */
  const right = Vector3.Cross(Vector3.Up(), anchor).normalize()
  const up = Vector3.Cross(anchor, right)
  const lightVector = new Vector3()

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'ruins-ringed-moon',
    shaderName: 'minespaceRuinsRingedMoon',
    vertexSource: SKY_QUAD_VERTEX,
    fragmentSource: MOON_FRAGMENT,
    uniformList: ['anchor', 'extent', 'lightVector'],
    mesh: createQuadListMesh(scene, 'ruins-ringed-moon', 1),
    blend: 'add',
    space: 'sky',
    fogHandling: '亮度乘 clearRatio（skyBodyFade 乘露天程度），下雨、霧幕與洞裡都跟日月一起淡出',
    update(frame, material) {
      /** 太陽在方片座標上的方向：z 是朝著看的人（太陽在人背後時月面全亮） */
      lightVector.set(
        Vector3.Dot(frame.sunDirection, right),
        Vector3.Dot(frame.sunDirection, up),
        -Vector3.Dot(frame.sunDirection, anchor),
      )
      material.setVector3('anchor', anchor)
      material.setVector2('extent', MOON_EXTENT)
      material.setVector3('lightVector', lightVector)
      return frame.clearRatio * (MOON_DAY_RATIO + (1 - MOON_DAY_RATIO) * frame.darkRatio) * MOON_PEAK
    },
  })
}
