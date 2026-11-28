import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Vector2, Vector3 } from '@babylonjs/core'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE, smoothRange } from '../realm-signature-kit'
import { LAKE_WATER_SURFACE_Y } from './lake-layout'

/**
 * 湖中島夜裡的月光路（渲染端，屬於世界層）
 *
 * 月亮升起來之後，湖面上從腳邊到月亮底下鋪著一條碎銀：近處窄、越遠越寬，一格一格的亮片各閃各的。
 * 它永遠朝著月亮（月亮永遠在太陽的正對面），人走到哪、那條路就跟到哪——真的月光路就是這樣，
 * 那是每個人眼裡自己的那一條反光。
 *
 * 一張貼在水面上方一點點的梯形方片，每幀挪到鏡頭腳下、轉向月亮的方位。亮片的格子釘在世界座標上
 * （不跟著鏡頭滑），越遠格子越大，遠處才不會碎成雜訊。相加混合、不寫深度，畫在天氣那一層：
 * 島、木棧與石頭照樣擋得住它，而它不會被後畫的半透明水面蓋掉。
 *
 * 亮度跟著星空同進同退（nightRatio），再乘上月亮的高度：剛升起與快落下時最長最亮，升到頭頂就收掉；
 * 鏡頭潛到水面下也收掉。
 * 成本：一張方片兩個三角形、一次繪製；貼著水面看過去是很扁的一條，片元不多，片段兩次雜湊
 */

/** 月光路從離鏡頭多遠開始、鋪到多遠（格） */
const PATH_REACH = new Vector2(3, 150)

/** 貼在水面上方多高：太低會與水面搶深度，太高從側面看得出它浮著 */
const PATH_LIFT = 0.04

/** 夜裡的峰值亮度 */
const PATH_PEAK = 0.6

const PATH_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform vec3 origin;
uniform vec2 heading;
uniform vec2 reach;
varying vec3 vWorld;

void main() {
  /** position.y 沿著路（−1 在腳邊、1 在遠端），position.x 是左右；越遠越寬 */
  float along = mix(reach.x, reach.y, position.y * 0.5 + 0.5);
  float halfWidth = 1.2 + along * 0.2;
  vec2 sideAxis = vec2(-heading.y, heading.x);
  vec2 ground = origin.xz + heading * along + sideAxis * position.x * halfWidth;
  vWorld = vec3(ground.x, origin.y, ground.y);
  gl_Position = viewProjection * vec4(vWorld, 1.0);
}
`

const PATH_FRAGMENT = `
precision highp float;
varying vec3 vWorld;
uniform float time;
uniform float strength;
uniform vec3 origin;
uniform vec2 heading;
uniform vec2 reach;
${GLSL_NOISE}

void main() {
  /** 由世界座標反推這一點在路上的位置：梯形用兩個三角形內插會歪，自己算才準 */
  vec2 sideAxis = vec2(-heading.y, heading.x);
  vec2 relative = vWorld.xz - origin.xz;
  float along = dot(relative, heading);
  float sideRatio = dot(relative, sideAxis) / (1.2 + along * 0.2);
  float progress = (along - reach.x) / (reach.y - reach.x);

  /**
   * 亮片：橫寬縱短的格子，釘在世界座標上；每一格照自己的節拍換一次亂數，抽中才亮。
   * 格子隨距離一級一級放大（每遠一倍大一倍），遠處一格還是佔得到幾個像素
   */
  float level = exp2(floor(log2(max(along, 4.0) / 4.0)));
  vec2 cell = floor(vec2(dot(vWorld.xz, sideAxis) * 1.6, dot(vWorld.xz, heading) * 3.2) / level);
  float seed = hash21(cell + level);
  float tick = floor(time * (1.5 + seed * 2.5) + seed * 20.0);
  float density = 0.5 * exp(-sideRatio * sideRatio * 3.0);
  float glint = step(1.0 - density, hash21(cell + tick * 0.173));

  /** 亮片底下一層很淡的光，路的中線才有連續感 */
  float sheen = exp(-sideRatio * sideRatio * 5.0) * 0.16;

  float fade = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.55, 1.0, progress))
    * (1.0 - smoothstep(0.85, 1.0, abs(sideRatio)));
  vec3 color = vec3(0.8, 0.87, 1.0) * (glint * 0.75 + sheen);
  gl_FragColor = vec4(color * fade * strength, 1.0);
}
`

export function createLakeMoonPath({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const origin = new Vector3()
  const heading = new Vector2(1, 0)

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'lake-moon-path',
    shaderName: 'minespaceLakeMoonPath',
    vertexSource: PATH_VERTEX,
    fragmentSource: PATH_FRAGMENT,
    uniformList: ['origin', 'heading', 'reach'],
    mesh: createQuadListMesh(scene, 'lake-moon-path', 1),
    blend: 'add',
    space: 'world',
    fogHandling: '自己照距離淡出（遠端四成半的長度漸隱到零），亮度是 nightRatio：下雨、霧幕與洞裡跟月亮一起收',
    update(frame, material) {
      /** 月亮在太陽的正對面；它的水平方位就是路的方向 */
      const moonX = -frame.sunDirection.x
      const moonZ = -frame.sunDirection.z
      const moonHeight = -frame.sunHeight
      const horizontal = Math.hypot(moonX, moonZ)
      if (horizontal > 0.001) {
        heading.set(moonX / horizontal, moonZ / horizontal)
      }
      origin.set(frame.cameraPosition.x, LAKE_WATER_SURFACE_Y + PATH_LIFT, frame.cameraPosition.z)
      material.setVector3('origin', origin)
      material.setVector2('heading', heading)
      material.setVector2('reach', PATH_REACH)

      /** 月亮貼著地平線時才有長長的一條，升到頭頂就沒有了；潛到水下也看不到 */
      const moonRatio = smoothRange(moonHeight, 0.02, 0.14) * (1 - smoothRange(moonHeight, 0.7, 0.95))
      const isAboveWater = frame.cameraPosition.y > LAKE_WATER_SURFACE_Y + 0.2
      /** 月相：月光路的亮度跟著今夜的月亮（滿月是一倍） */
      return isAboveWater ? frame.nightRatio * frame.moonLightRatio * moonRatio * PATH_PEAK : 0
    },
  })
}
