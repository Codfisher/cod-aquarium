<template>
  <demo-frame
    :setup="setupScene"
    title="自己畫的一片天"
    caption="拉時刻走一輪日夜。「三段顏色」關掉之後中空色被天頂色取代，日出的丁香紫與日落的洋紅就沒有地方待著了；「霞光用混色」關掉會改成相加，太陽貼近地平線時整片天糊成一團白，霞色反而不見。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.1"
    :camera-radius="12"
    :camera-target="[0, 0, 0]"
    :height="300"
    :interactive="true"
  >
    <demo-slider
      v-model="timeOfDay"
      label="時刻"
      :min="0"
      :max="1"
      :step="0.005"
      :digit="3"
    />
    <demo-toggle
      v-model="hasMidColor"
      label="三段顏色"
    />
    <demo-toggle
      v-model="isGlowMixed"
      label="霞光用混色"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ShaderMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'

/** 進場就擺在日落，一眼看到最好看的那一段 */
const timeOfDay = shallowRef(0.74)
const hasMidColor = shallowRef(true)
const isGlowMixed = shallowRef(true)

const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;

void main() {
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

/**
 * 與本體同一支著色器，只多了兩個示範用的開關
 *
 * glowMode 為 1 時走混色、為 0 時改成相加，
 * 那正是文章裡「日落是燒成橘色還是燒成白色」的分界
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vDirection;

uniform vec3 zenithColor;
uniform vec3 midColor;
uniform vec3 horizonColor;
uniform vec3 glowColor;
uniform vec3 counterColor;
uniform vec3 sunDirection;
uniform float glowStrength;
uniform float glowMode;

const float HAZE_FALLOFF = 6.0;
const float ZENITH_FALLOFF = 1.6;
const float COUNTER_RATIO = 0.5;

void main() {
  vec3 direction = normalize(vDirection);
  float upward = clamp(direction.y, 0.0, 1.0);

  float hazeBlend = 1.0 - pow(1.0 - upward, HAZE_FALLOFF);
  float zenithBlend = 1.0 - pow(1.0 - upward, ZENITH_FALLOFF);
  vec3 upperColor = mix(midColor, zenithColor, zenithBlend);
  vec3 color = mix(horizonColor, upperColor, hazeBlend);

  float towardSun = max(dot(direction, sunDirection), 0.0);
  float lowSky = 1.0 - smoothstep(0.0, 0.6, upward);

  float awayFromSun = max(-dot(direction, sunDirection), 0.0);
  float counter = pow(awayFromSun, 3.0) * lowSky * COUNTER_RATIO;
  color = mix(color, counterColor, clamp(counter * glowStrength, 0.0, 1.0));

  float halo = pow(towardSun, 18.0) * 0.55 + pow(towardSun, 2.5) * 0.45 * lowSky;
  float haloAmount = clamp(halo * glowStrength, 0.0, 1.0);

  vec3 mixed = mix(color, glowColor, haloAmount);
  vec3 added = color + glowColor * haloAmount;
  color = mix(added, mixed, glowMode);

  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (noise - 0.5) / 255.0;

  gl_FragColor = vec4(color, 1.0);
}
`

interface Keyframe {
  time: number;
  fogColor: [number, number, number];
  skyZenithColor: [number, number, number];
  skyMidColor: [number, number, number];
  skyGlowColor: [number, number, number];
  skyCounterColor: [number, number, number];
  skyGlowStrength: number;
}

/** 本體那張顏色表的節錄，關鍵的幾個時刻都在 */
const KEYFRAME_LIST: Keyframe[] = [
  {
    time: 0,
    fogColor: [0.055, 0.07, 0.115],
    skyZenithColor: [0.01, 0.016, 0.048],
    skyMidColor: [0.03, 0.042, 0.098],
    skyGlowColor: [0.12, 0.14, 0.26],
    skyCounterColor: [0.06, 0.07, 0.14],
    skyGlowStrength: 0,
  },
  {
    time: 0.2,
    fogColor: [0.24, 0.26, 0.36],
    skyZenithColor: [0.05, 0.085, 0.23],
    skyMidColor: [0.17, 0.19, 0.38],
    skyGlowColor: [0.66, 0.44, 0.56],
    skyCounterColor: [0.3, 0.26, 0.45],
    skyGlowStrength: 0.5,
  },
  {
    time: 0.26,
    fogColor: [0.88, 0.63, 0.52],
    skyZenithColor: [0.2, 0.4, 0.76],
    skyMidColor: [0.63, 0.55, 0.74],
    skyGlowColor: [1, 0.62, 0.34],
    skyCounterColor: [0.76, 0.54, 0.64],
    skyGlowStrength: 0.95,
  },
  {
    time: 0.34,
    fogColor: [0.94, 0.91, 0.87],
    skyZenithColor: [0.3, 0.55, 0.95],
    skyMidColor: [0.62, 0.78, 0.96],
    skyGlowColor: [1, 0.88, 0.68],
    skyCounterColor: [0.78, 0.84, 0.95],
    skyGlowStrength: 0.3,
  },
  {
    time: 0.5,
    fogColor: [0.955, 0.95, 0.935],
    skyZenithColor: [0.26, 0.52, 0.98],
    skyMidColor: [0.6, 0.78, 0.99],
    skyGlowColor: [1, 0.98, 0.9],
    skyCounterColor: [0.8, 0.88, 0.98],
    skyGlowStrength: 0.12,
  },
  {
    time: 0.66,
    fogColor: [0.96, 0.93, 0.89],
    skyZenithColor: [0.28, 0.52, 0.93],
    skyMidColor: [0.64, 0.78, 0.95],
    skyGlowColor: [1, 0.9, 0.72],
    skyCounterColor: [0.82, 0.86, 0.94],
    skyGlowStrength: 0.24,
  },
  {
    time: 0.74,
    fogColor: [0.94, 0.63, 0.44],
    skyZenithColor: [0.15, 0.27, 0.62],
    skyMidColor: [0.73, 0.46, 0.62],
    skyGlowColor: [1, 0.38, 0.16],
    skyCounterColor: [0.64, 0.44, 0.68],
    skyGlowStrength: 1.05,
  },
  {
    time: 0.8,
    fogColor: [0.46, 0.37, 0.44],
    skyZenithColor: [0.055, 0.085, 0.24],
    skyMidColor: [0.29, 0.22, 0.44],
    skyGlowColor: [0.74, 0.32, 0.42],
    skyCounterColor: [0.34, 0.25, 0.46],
    skyGlowStrength: 0.62,
  },
  {
    time: 0.88,
    fogColor: [0.055, 0.07, 0.115],
    skyZenithColor: [0.01, 0.016, 0.048],
    skyMidColor: [0.03, 0.042, 0.098],
    skyGlowColor: [0.12, 0.14, 0.26],
    skyCounterColor: [0.06, 0.07, 0.14],
    skyGlowStrength: 0,
  },
]

const skyMaterial = shallowRef<ShaderMaterial>()

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

function lerpColor(
  from: [number, number, number],
  to: [number, number, number],
  ratio: number,
): [number, number, number] {
  return [
    lerp(from[0], to[0], ratio),
    lerp(from[1], to[1], ratio),
    lerp(from[2], to[2], ratio),
  ]
}

/** 依時刻補間出這一刻的天色，與本體的 applyKeyframe 同一套邏輯 */
function sampleKeyframe(time: number) {
  const lastIndex = KEYFRAME_LIST.length - 1
  let fromIndex = lastIndex

  for (let index = 0; index < KEYFRAME_LIST.length; index++) {
    if (KEYFRAME_LIST[index]!.time <= time) {
      fromIndex = index
    }
  }

  const from = KEYFRAME_LIST[fromIndex]!
  const to = KEYFRAME_LIST[(fromIndex + 1) % KEYFRAME_LIST.length]!
  /** 最後一段要繞回第一個關鍵時刻，跨過子夜那條線 */
  const span = fromIndex === lastIndex
    ? 1 - from.time + KEYFRAME_LIST[0]!.time
    : to.time - from.time
  const ratio = span <= 0 ? 0 : Math.min(1, Math.max(0, (time - from.time) / span))

  return {
    fogColor: lerpColor(from.fogColor, to.fogColor, ratio),
    skyZenithColor: lerpColor(from.skyZenithColor, to.skyZenithColor, ratio),
    skyMidColor: lerpColor(from.skyMidColor, to.skyMidColor, ratio),
    skyGlowColor: lerpColor(from.skyGlowColor, to.skyGlowColor, ratio),
    skyCounterColor: lerpColor(from.skyCounterColor, to.skyCounterColor, ratio),
    skyGlowStrength: lerp(from.skyGlowStrength, to.skyGlowStrength, ratio),
  }
}

/** 太陽沿著傾斜的圓在天球上繞一圈，0.25 時剛好在地平線上 */
function measureSunDirection(time: number): [number, number, number] {
  const angle = (time - 0.25) * Math.PI * 2
  const alongRise = Math.cos(angle)
  const alongNoon = Math.sin(angle)

  const sunriseAxis: [number, number, number] = [Math.sin(2.084), 0, Math.cos(2.084)]
  const noonRadian = 2.084 + Math.PI / 2
  const noonAxis: [number, number, number] = [
    Math.sin(noonRadian) * 0.528,
    0.849,
    Math.cos(noonRadian) * 0.528,
  ]

  return [
    sunriseAxis[0] * alongRise + noonAxis[0] * alongNoon,
    sunriseAxis[1] * alongRise + noonAxis[1] * alongNoon,
    sunriseAxis[2] * alongRise + noonAxis[2] * alongNoon,
  ]
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, Effect, MeshBuilder, ShaderMaterial } = babylon

  Effect.ShadersStore.demoSkyGradientVertexShader = VERTEX_SHADER
  Effect.ShadersStore.demoSkyGradientFragmentShader = FRAGMENT_SHADER

  const material = new ShaderMaterial('demo-sky', scene, 'demoSkyGradient', {
    attributes: ['position'],
    uniforms: [
      'worldViewProjection',
      'zenithColor',
      'midColor',
      'horizonColor',
      'glowColor',
      'counterColor',
      'sunDirection',
      'glowStrength',
      'glowMode',
    ],
  })

  /** 鏡頭在盒子裡面，看到的是內側 */
  material.backFaceCulling = false
  material.disableDepthWrite = true

  const dome = MeshBuilder.CreateBox('sky-dome', { size: 260 }, scene)
  dome.material = material
  dome.infiniteDistance = true
  dome.isPickable = false

  skyMaterial.value = material

  /** 一小片地景，天邊那一段要有東西擋著才看得出「天與地接得起來」 */
  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground', scene)
  groundMaterial.diffuseColor = new Color3(0.9, 0.88, 0.85)
  groundMaterial.specularColor = new Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.position.y = -1.6

  const torii = MeshBuilder.CreateBox('torii', { width: 0.5, height: 6, depth: 0.5 }, scene)
  torii.position.set(-3, 1.4, -14)
  torii.material = groundMaterial

  const toriiRight = torii.clone('torii-right')
  toriiRight.position.x = 3

  const beam = MeshBuilder.CreateBox('beam', { width: 8, height: 0.5, depth: 0.5 }, scene)
  beam.position.set(0, 4.2, -14)
  beam.material = groundMaterial

  scene.fogMode = babylon.Scene.FOGMODE_NONE
  /** 地景不吃光，只要剪影就夠了 */
  groundMaterial.disableLighting = true
  groundMaterial.emissiveColor = new Color3(0.16, 0.15, 0.16)

  const camera = scene.activeCamera
  if (camera) {
    camera.maxZ = 800
  }

  applySetting()
}

function applySetting() {
  const material = skyMaterial.value
  if (!material)
    return

  const sample = sampleKeyframe(timeOfDay.value)
  const [sunX, sunY, sunZ] = measureSunDirection(timeOfDay.value)

  material.setFloat3('sunDirection', sunX, sunY, sunZ)
  material.setFloat3('zenithColor', ...sample.skyZenithColor)
  /**
   * 關掉三段顏色時，中空直接用天頂色
   *
   * 天空立刻退回「天邊到天頂」的單調漸層，
   * 日出的丁香紫與日落的洋紅整個消失
   */
  material.setFloat3(
    'midColor',
    ...(hasMidColor.value ? sample.skyMidColor : sample.skyZenithColor),
  )
  material.setFloat3('horizonColor', ...sample.fogColor)
  material.setFloat3('glowColor', ...sample.skyGlowColor)
  material.setFloat3('counterColor', ...sample.skyCounterColor)
  material.setFloat('glowStrength', sample.skyGlowStrength)
  material.setFloat('glowMode', isGlowMixed.value ? 1 : 0)
}

watch([timeOfDay, hasMidColor, isGlowMixed], applySetting)
</script>
