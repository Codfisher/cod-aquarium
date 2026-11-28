import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Vector2 } from '@babylonjs/core'
import { createSignatureLayer, createStripMesh, GLSL_NOISE, smoothRange } from '../realm-signature-kit'

/**
 * 湯煙谷上空的煙幕（渲染端，屬於世界層）
 *
 * 火口上空壓著一整片火山灰。場景的氣氛設定調得到雲量與層雲，但天還是藍的、雲還是白的，
 * 一座噴著的火口頭上是晴天，怎麼看都不對；陰天罩又只跟著雨雪走。
 * 所以這裡自己掛一層：一條從地平線蓋到天頂的格子帶，灰褐色、一般混合，貼著地平線薄一點、往上壓實，
 * 白天是「悶著的煙」，夜裡是一片不見星的黑，火映（jigoku-sky-glow）與遠火山的火星打在上面才顯得亮。
 *
 * 借招牌景象那一套零件（createSignatureLayer）：一個網格、一支很小的著色器、一次繪製，
 * 不看天氣，洞裡與換場景的霧幕裡收掉。它不是招牌景象（整天都在、是底色），所以掛在一般的裝飾那一邊
 */

/**
 * 煙幕掛得比火映遠得多（九百格，火映與極光那一殼是兩百格）
 *
 * 它是不透明度很高的一層，掛在兩百格會蓋掉更遠的東西：火山稜（兩百八與五百格）與遠火山（兩百三十格）。
 * 掛到它們後面，那些布景先畫、寫了深度，煙幕只落在真正是天的地方（體積雲不寫深度，照樣被蓋住）
 */
const ASH_SHELL_RADIUS = 900

/** 煙幕從地平線下一點蓋到天頂 */
const ASH_ELEVATION_RANGE = new Vector2(-0.04, 1.5707963)

/** 白天與深夜的灰色（線性 RGB）：白天是被太陽照著的灰褐，夜裡只剩被熔岩映著的一點暗紅 */
const ASH_DAY_COLOR = new Color3(0.36, 0.31, 0.28)
const ASH_NIGHT_COLOR = new Color3(0.035, 0.016, 0.012)

const ASH_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform vec2 elevationRange;
varying vec2 vUv;

void main() {
  float azimuth = position.x * 6.2831853;
  float elevation = mix(elevationRange.x, elevationRange.y, position.y);
  vec3 direction = vec3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation));
  vUv = position.xy;
  gl_Position = viewProjection * world * vec4(direction * ${ASH_SHELL_RADIUS.toFixed(1)}, 1.0);
}
`

const ASH_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float strength;
uniform vec3 ashColor;
${GLSL_NOISE}

void main() {
  float azimuth = vUv.x * 6.2831853;
  float v = vUv.y;
  /** 沿圓周的噪音在圓上取樣，繞一圈接得起來；越往天頂圓越小，花紋跟著收攏 */
  vec2 ring = vec2(cos(azimuth), sin(azimuth)) * (1.15 - v);
  float billow = valueNoise(ring * 5.0 + vec2(time * 0.012, -time * 0.008));
  float fine = valueNoise(ring * 13.0 + vec2(-time * 0.02, time * 0.015));
  float cloud = billow * 0.7 + fine * 0.3;
  /** 貼著地平線薄一點（看得到煙幕底下透進來的天光），往上是壓實的一整片 */
  float density = mix(0.5, 0.94, smoothstep(0.02, 0.3, v)) * (0.8 + 0.2 * cloud);
  /** 厚的地方暗、薄的地方亮，一團一團的 */
  vec3 color = ashColor * (0.72 + 0.5 * cloud);
  gl_FragColor = vec4(color, density * strength);
}
`

export function createJigokuAshPall({ scene, atmosphere }: { scene: Scene; atmosphere: AtmosphereState }): { dispose: () => void } {
  const mesh = createStripMesh(scene, 'jigoku-ash-pall', 32, 6)
  /** 透明的東西照這個數字由小到大畫：煙幕最先，火映疊在它上面，其餘（蒸氣、熔岩瀑的流幕）再後面 */
  mesh.alphaIndex = 0
  const ashColor = new Color3()
  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'jigoku-ash-pall',
    shaderName: 'minespaceJigokuAshPall',
    vertexSource: ASH_VERTEX,
    fragmentSource: ASH_FRAGMENT,
    uniformList: ['elevationRange', 'ashColor'],
    mesh,
    blend: 'alpha',
    space: 'sky',
    layer: 'weather',
    fogHandling: '不透明度乘 outdoorRatio（露天程度，含 edgeRatio 的霧幕）：換場景與洞裡收掉；它是火山灰，不跟著雨收',
    update(frame, material) {
      /** 太陽落到地平線下就全黑，升起來一點就是白天的灰 */
      Color3.LerpToRef(ASH_NIGHT_COLOR, ASH_DAY_COLOR, smoothRange(frame.sunHeight, -0.12, 0.22), ashColor)
      material.setVector2('elevationRange', ASH_ELEVATION_RANGE)
      material.setColor3('ashColor', ashColor)
      return frame.outdoorRatio
    },
  })
}
