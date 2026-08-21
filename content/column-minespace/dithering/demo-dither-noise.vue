<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    :interactive="false"
    title="加半個色階的雜訊"
    caption="雜訊加在量化之前。原本整片會一起跳到下一階的像素，現在依各自拿到的隨機值先後跳過去，那條筆直的界線於是散成一片顆粒。幅度給到一個色階就夠，再往上只是把畫面弄髒。"
    :height="280"
  >
    <demo-slider
      v-model="noiseAmount"
      label="雜訊幅度"
      :min="0"
      :max="3"
      :step="0.1"
      :digit="1"
      unit=" 階"
    />
    <demo-slider
      v-model="stepCount"
      label="色階數"
      :min="8"
      :max="128"
      :step="4"
      :digit="0"
      unit=" 階"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { PostProcess } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'

const noiseAmount = shallowRef(0)
const stepCount = shallowRef(24)

const badge = computed(() => (
  noiseAmount.value < 0.05
    ? '沒有雜訊，一圈一圈的等高線'
    : `雜訊 ±${(noiseAmount.value / 2).toFixed(2)} 階`
))

const SHADER_NAME = 'demoDitherNoise'

/**
 * 與上一個範例同一條漸層，差別只在量化之前多加一道雜訊
 *
 * 雜訊的產生式與本體的天空著色器完全一樣：拿片元座標做一次
 * 高頻的正弦再取小數，這是著色器裡最省的亂數
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform float stepCount;
uniform float noiseAmount;

void main() {
  float ratio = clamp(vUV.y, 0.0, 1.0);

  vec3 color = mix(
    vec3(0.90, 0.93, 0.96),
    vec3(0.22, 0.44, 0.86),
    ratio
  );

  /**
   * 雜訊要加在量化之前
   *
   * 加在之後只是在已經分好的階上灑顆粒，界線還在原地
   */
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (noise - 0.5) * noiseAmount / stepCount;

  color = floor(color * stepCount + 0.5) / stepCount;

  gl_FragColor = vec4(color, 1.0);
}
`

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const anchor = babylon.MeshBuilder.CreateBox('anchor', { size: 0.01 }, scene)
  anchor.isPickable = false

  const postProcess: PostProcess = new babylon.PostProcess(
    'demo-dither',
    SHADER_NAME,
    ['stepCount', 'noiseAmount'],
    [],
    1,
    camera,
  )

  postProcess.onApply = (effect) => {
    effect.setFloat('stepCount', stepCount.value)
    effect.setFloat('noiseAmount', noiseAmount.value)
  }

  return () => postProcess.dispose(camera)
}
</script>
