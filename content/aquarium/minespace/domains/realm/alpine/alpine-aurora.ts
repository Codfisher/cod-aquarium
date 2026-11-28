import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Constants, Effect, Mesh, ShaderMaterial, VertexData } from '@babylonjs/core'
import { optOutOfFog } from '../../renderer/fog-opt-out'
import { starFieldState } from '../../weather/star-field'

/**
 * 雪稜夜空的極光（渲染端，屬於世界層）
 *
 * 高山上空氣稀薄、夜空乾淨，北邊天上掛幾道光幕：下緣是亮綠，往上轉青，頂端帶一圈淡紫。
 * 做法跟星空一樣是天空的一部分：一個網格、一次繪製，沒有任何 render target。
 *
 * 網格只是三條「u 沿著弧、v 往上」的格子帶，頂點位置完全在著色器裡算：
 * 每條光幕是掛在天球上的一片帘子，下緣的仰角與方位隨時間緩緩起伏（折幕），
 * 片段著色器用沿弧方向的高頻噪音畫出一條一條垂直的光束，並讓它們慢慢閃動。
 * 相加混合、不寫深度，星點會透過它露出來；地形與山稜照常擋住它。
 *
 * 亮度不自己算日夜：直接讀星空材質的自發光——那個值正是「星空可見度 × 天體露出」，
 * 傍晚天黑之後才亮起、天亮前先退，下雨、暴風雪或貼近世界邊界時白幕蓋上來也一起收，
 * 與星星同進同退，不會浮在陰天罩前面
 */

/** 光幕掛在離鏡頭這麼遠的天球上（跟著鏡頭走，等於無限遠），比星空盒子遠一點 */
const AURORA_SHELL_RADIUS = 200

/** 每條光幕沿弧切幾段、往上切幾段：頂點全在著色器裡動，段數只決定折線的細緻度 */
const SEGMENT_ALONG = 64
const SEGMENT_UP = 10
const BAND_COUNT = 3

/** 夜裡極光的整體亮度，再高會被泛光吃成一片白 */
const AURORA_PEAK = 0.62

const AURORA_SHADER_NAME = 'minespaceAlpineAurora'

const AURORA_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
varying vec3 vInfo;

/** 一條光幕的形狀：x 方位（自北往東，弧度）、y 弧長（弧度）、z 下緣仰角、w 高度 */
vec4 bandShape(float band) {
  if (band < 0.5) return vec4(-0.18, 2.3, 0.1, 0.46);
  if (band < 1.5) return vec4(0.62, 1.5, 0.2, 0.5);
  return vec4(-0.95, 1.7, 0.07, 0.3);
}

void main() {
  /** position 只是格子座標：x 沿弧（0..1）、y 往上（0..1）、z 第幾條光幕 */
  float u = position.x;
  float v = position.y;
  float band = position.z;
  vec4 shape = bandShape(band);
  float phase = band * 2.7;

  /** 折幕：下緣與高度隨沿弧的位置起伏，整片再慢慢往一側漂 */
  float fold = sin(u * 7.0 + time * 0.11 + phase) * 0.055
    + sin(u * 17.0 - time * 0.17 + phase * 1.7) * 0.025;
  float bottom = shape.z + fold;
  float height = shape.w * (0.8 + 0.3 * sin(u * 3.0 + time * 0.07 + phase));
  float elevation = bottom + v * height;
  float azimuth = shape.x + (u - 0.5) * shape.y
    + sin(v * 2.4 + u * 5.0 + time * 0.2 + phase) * 0.045 * v;

  vec3 direction = vec3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation));
  vInfo = vec3(u, v, band + 0.01 * sin(u * 7.0 + time * 0.11 + phase));
  gl_Position = viewProjection * world * vec4(direction * ${AURORA_SHELL_RADIUS.toFixed(1)}, 1.0);
}
`

const AURORA_FRAGMENT = `
precision highp float;
varying vec3 vInfo;
uniform float time;
uniform float strength;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  float u = vInfo.x;
  float v = vInfo.y;
  float band = floor(vInfo.z);
  float seed = band * 13.7;

  /** 垂直光束：沿弧方向的高頻噪音拉成一條一條，上下用同一欄所以是直的；時間慢慢推動它們閃爍 */
  float coarse = valueNoise(vec2(u * 34.0 + seed, time * 0.16 + v * 0.8));
  float fine = valueNoise(vec2(u * 120.0 + seed * 3.0, time * 0.4 + 7.0));
  float ray = 0.35 + 0.65 * smoothstep(0.25, 0.85, coarse);
  ray *= 0.75 + 0.25 * fine;

  /** 垂直剖面：下緣銳利、往上慢慢淡掉，頂端留一圈很淡的邊 */
  float lower = smoothstep(0.0, 0.07, v);
  float body = lower * exp(-v * 2.5) * (1.0 - smoothstep(0.82, 1.0, v));
  float edgeGlow = pow(max(1.0 - v, 0.0), 6.0) * lower * 0.55;
  float profile = body + edgeGlow;

  /** 整條光幕的明暗：沿弧起伏，兩端收掉，偶爾一陣很輕的增亮（不閃） */
  float along = smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u);
  float swell = 0.7 + 0.3 * sin(u * 4.0 + time * 0.09 + seed);
  float pulse = 1.0 + 0.16 * sin(time * 0.13 + band * 2.0) * sin(time * 0.047 + 1.0 + band);

  vec3 green = vec3(0.22, 1.0, 0.42);
  vec3 teal = vec3(0.08, 0.82, 0.78);
  vec3 violet = vec3(0.62, 0.24, 0.86);
  vec3 color = mix(green, teal, smoothstep(0.12, 0.5, v));
  color = mix(color, violet, smoothstep(0.55, 0.95, v));

  float bandGain = band < 0.5 ? 1.0 : (band < 1.5 ? 0.8 : 0.55);
  float intensity = profile * ray * along * swell * pulse * bandGain * strength;
  gl_FragColor = vec4(color * intensity, 1.0);
}
`

/** 三條光幕的格子帶：頂點位置是（沿弧, 往上, 第幾條），真正的位置在頂點著色器裡算 */
function createAuroraMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const indexList: number[] = []
  const rowCount = SEGMENT_UP + 1
  const columnCount = SEGMENT_ALONG + 1

  for (let band = 0; band < BAND_COUNT; band++) {
    const baseIndex = positionList.length / 3
    for (let column = 0; column < columnCount; column++) {
      for (let row = 0; row < rowCount; row++) {
        positionList.push(column / SEGMENT_ALONG, row / SEGMENT_UP, band)
      }
    }
    for (let column = 0; column < SEGMENT_ALONG; column++) {
      for (let row = 0; row < SEGMENT_UP; row++) {
        const bottomLeft = baseIndex + column * rowCount + row
        const bottomRight = bottomLeft + rowCount
        indexList.push(bottomLeft, bottomRight, bottomLeft + 1, bottomRight, bottomRight + 1, bottomLeft + 1)
      }
    }
  }

  const mesh = new Mesh('alpine-aurora', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

export function createAlpineAurora({ scene }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  Effect.ShadersStore[`${AURORA_SHADER_NAME}VertexShader`] = AURORA_VERTEX
  Effect.ShadersStore[`${AURORA_SHADER_NAME}FragmentShader`] = AURORA_FRAGMENT

  const material = new ShaderMaterial('alpine-aurora', scene, AURORA_SHADER_NAME, {
    attributes: ['position'],
    uniforms: ['world', 'viewProjection', 'time', 'strength'],
  })
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_ADD
  /** 相加混合要走半透明那條路才生效，與星空同一個寫法 */
  material.alpha = 0.999
  material.disableDepthWrite = true

  const mesh = createAuroraMesh(scene)
  mesh.material = material
  mesh.isPickable = false
  /** 與星空同一層（預設那一層）、一樣跟著鏡頭走，所以地形擋得住它、雲蓋得住它 */
  mesh.infiniteDistance = true
  /** 頂點是著色器算的，網格自己的包圍盒沒有意義 */
  mesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(mesh, '亮度讀星空材質的自發光（星空可見度乘 skyBodyFade），貼近邊界或下雨時與星星一起淡出')

  let elapsed = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    /** 星空此刻露出多少（見 star-field 的 starFieldState）；用 smoothstep 讓極光比星星晚一點亮、早一點退 */
    const starFade = starFieldState.visibility
    const fade = Math.min(1, Math.max(0, (starFade - 0.15) / 0.75))
    const strength = fade * fade * (3 - 2 * fade) * AURORA_PEAK
    mesh.setEnabled(strength > 0.002)
    material.setFloat('time', elapsed)
    material.setFloat('strength', strength)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose()
      material.dispose(false, true)
    },
  }
}
