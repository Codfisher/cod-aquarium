import type { Color3, Scene } from '@babylonjs/core'
import { Effect, ShaderMaterial } from '@babylonjs/core'

/**
 * 雲的材質
 *
 * 雲層是一整片鋪在頭頂一百格的方塊，往四面各鋪一千一百格。
 * 從眼睛看出去，越遠的雲落在越低的仰角上：最遠那一圈只剩不到五度，
 * 幾百朵雲全擠在地平線上方那一小條裡，疊成一道白得發亮的帶子。
 *
 * 雲又是全場唯一不吃霧氣的東西（吃了的話，霧在兩百二十格就滿了，
 * 整片天會被染成一塊死白），所以那道帶子連淡都不會淡。
 *
 * 解法是讓雲自己隨距離化進天邊的顏色。與世界邊界那招同一個道理：
 * 雲還在那裡，只是與背後的天空一模一樣，看不出來而已。
 * 這裡用視空間的距離，每個像素各自算，遠近之間是連續的
 */
const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;

uniform mat4 world;
uniform mat4 worldView;
uniform mat4 worldViewProjection;

varying float vDistance;

void main() {
  /** 視空間的原點就是眼睛，長度直接就是離鏡頭多遠 */
  vDistance = length((worldView * vec4(position, 1.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying float vDistance;

uniform vec3 cloudColor;
uniform vec3 hazeColor;
uniform float cloudAlpha;
uniform float fadeStart;
uniform float fadeEnd;

void main() {
  float haze = smoothstep(fadeStart, fadeEnd, vDistance);
  vec3 color = mix(cloudColor, hazeColor, haze);
  gl_FragColor = vec4(color, cloudAlpha);
}
`

const SHADER_NAME = 'minespaceCloud'

/**
 * 雲開始化進天色的距離
 *
 * 雲層在鏡頭上方約九十五格。三百二十格外的雲落在十五度左右的仰角，
 * 從那裡開始淡；九百格外只剩六度，那時已經完全化進天色。
 * 抬頭看得到的那一大片雲完全不受影響，只有貼著地平線那一條被收掉
 */
const CLOUD_FADE_START = 320
const CLOUD_FADE_END = 900

/** 半透明的雲，飛過頭頂時還看得到後面的天色 */
const CLOUD_ALPHA = 0.72

/** 這一刻的雲色 */
export interface CloudColorParams {
  /** 雲本身的顏色，由日夜與天氣決定 */
  color: Color3;
  /** 遠方要化進去的顏色，用霧色 */
  hazeColor: Color3;
}

/** 建立雲的材質 */
export function createCloudMaterial(name: string, scene: Scene): ShaderMaterial {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const material = new ShaderMaterial(name, scene, SHADER_NAME, {
    attributes: ['position'],
    uniforms: [
      'world',
      'worldView',
      'worldViewProjection',
      'cloudColor',
      'hazeColor',
      'cloudAlpha',
      'fadeStart',
      'fadeEnd',
    ],
    needAlphaBlending: true,
  })

  /** 讓 Babylon 把它排進半透明佇列 */
  material.alpha = CLOUD_ALPHA
  material.backFaceCulling = true
  /**
   * 先寫一次深度再上色
   *
   * 少了這一步，同一片雲自己的前後面會互相疊色，
   * 邊緣會出現一塊深一塊淺的髒污
   */
  material.needDepthPrePass = true

  material.setFloat('cloudAlpha', CLOUD_ALPHA)
  material.setFloat('fadeStart', CLOUD_FADE_START)
  material.setFloat('fadeEnd', CLOUD_FADE_END)

  return material
}

/** 把這一刻的雲色寫進材質 */
export function applyCloudColor(material: ShaderMaterial, params: CloudColorParams): void {
  material.setColor3('cloudColor', params.color)
  material.setColor3('hazeColor', params.hazeColor)
}
