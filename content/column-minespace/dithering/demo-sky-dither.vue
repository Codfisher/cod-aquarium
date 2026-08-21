<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="天空那一層自己也加一次"
    caption="從天頂鋪到天邊的漸層是整個場景最長的一條，色階環會先在這裡浮出來。所以天空著色器在寫出顏色之前自己先加一次雜訊，管線最後那一次只負責收拾分級之後重排的部分。拖曳可以轉動視角。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.15"
    :camera-radius="10"
    :height="300"
  >
    <demo-toggle
      v-model="hasNoise"
      label="著色器內的雜訊"
    />
    <demo-slider
      v-model="stepCount"
      label="色階數"
      :min="16"
      :max="256"
      :step="8"
      :digit="0"
      unit=" 階"
    />
    <demo-slider
      v-model="sunHeight"
      label="太陽高度"
      :min="-0.1"
      :max="0.7"
      :step="0.02"
      :digit="2"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ShaderMaterial, Vector3 } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'

const hasNoise = shallowRef(false)
const stepCount = shallowRef(48)
const sunHeight = shallowRef(0.06)

const badge = computed(() => (hasNoise.value ? '有打散' : '沒有打散'))

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
 * 本體天空著色器的節錄
 *
 * 三段顏色、兩條曲線、太陽那一側的暖光都在，
 * 只多了兩個示範用的常數：量化階數與雜訊開關
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vDirection;

uniform vec3 zenithColor;
uniform vec3 midColor;
uniform vec3 horizonColor;
uniform vec3 glowColor;
uniform vec3 sunDirection;
uniform float glowStrength;
uniform float stepCount;
uniform float noiseEnabled;

const float HAZE_FALLOFF = 6.0;
const float ZENITH_FALLOFF = 1.6;

void main() {
  vec3 direction = normalize(vDirection);
  float upward = clamp(direction.y, 0.0, 1.0);

  float hazeBlend = 1.0 - pow(1.0 - upward, HAZE_FALLOFF);
  float zenithBlend = 1.0 - pow(1.0 - upward, ZENITH_FALLOFF);
  vec3 upperColor = mix(midColor, zenithColor, zenithBlend);
  vec3 color = mix(horizonColor, upperColor, hazeBlend);

  float towardSun = max(dot(direction, sunDirection), 0.0);
  float lowSky = 1.0 - smoothstep(0.0, 0.6, upward);
  float halo = pow(towardSun, 18.0) * 0.55 + pow(towardSun, 2.5) * 0.45 * lowSky;
  color = mix(color, glowColor, clamp(halo * glowStrength, 0.0, 1.0));

  /**
   * 打散色階
   *
   * 半個色階的雜訊。代價是肉眼看不見的顆粒，
   * 換掉的是一整片看得見的等高線
   */
  if (noiseEnabled > 0.5) {
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (noise - 0.5) / stepCount;
  }

  /** 寫進緩衝區的那一步，示範用的階數比八位元粗，才看得出來 */
  color = floor(color * stepCount + 0.5) / stepCount;

  gl_FragColor = vec4(color, 1.0);
}
`

const SHADER_NAME = 'demoSkyDither'

const materialRef = shallowRef<ShaderMaterial>()
const sunDirectionRef = shallowRef<Vector3>()

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const { Color3, Effect, MeshBuilder, ShaderMaterial, Vector3 } = babylon

  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const material = new ShaderMaterial('demo-sky', scene, SHADER_NAME, {
    attributes: ['position'],
    uniforms: [
      'worldViewProjection',
      'zenithColor',
      'midColor',
      'horizonColor',
      'glowColor',
      'sunDirection',
      'glowStrength',
      'stepCount',
      'noiseEnabled',
    ],
  })

  /** 鏡頭在盒子裡面，看到的是內側 */
  material.backFaceCulling = false
  material.disableDepthWrite = true

  const dome = MeshBuilder.CreateBox('sky-dome', { size: 260 }, scene)
  dome.material = material
  dome.infiniteDistance = true
  dome.isPickable = false

  camera.maxZ = 800

  /** 一組日落的顏色，從頭到尾不變，設一次就好 */
  material.setColor3('zenithColor', new Color3(0.15, 0.27, 0.62))
  material.setColor3('midColor', new Color3(0.73, 0.46, 0.62))
  material.setColor3('horizonColor', new Color3(0.94, 0.63, 0.44))
  material.setColor3('glowColor', new Color3(1, 0.38, 0.16))
  material.setFloat('glowStrength', 1.05)

  /** 太陽的方位每一次都改同一個向量，不必重新配置 */
  sunDirectionRef.value = new Vector3(0, 0, 0)

  materialRef.value = material

  applySetting()

  return () => {
    materialRef.value = undefined
    sunDirectionRef.value = undefined
  }
}

/** 太陽沿著一條斜線升降，高度為負時就是剛落下的那一刻 */
function applySetting() {
  const material = materialRef.value
  const sunDirection = sunDirectionRef.value
  if (!material || !sunDirection)
    return

  const height = sunHeight.value
  const flat = Math.sqrt(Math.max(0, 1 - height * height))

  sunDirection.set(flat * 0.92, height, flat * -0.39)

  material.setVector3('sunDirection', sunDirection)
  material.setFloat('stepCount', stepCount.value)
  material.setFloat('noiseEnabled', hasNoise.value ? 1 : 0)
}

watch([hasNoise, stepCount, sunHeight], applySetting)
</script>
