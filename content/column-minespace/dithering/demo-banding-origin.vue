<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    :interactive="false"
    :zoomable="false"
    title="色階環是怎麼浮出來的"
    caption="漸層越長，每一階佔的螢幕就越寬，那條界線也就越明顯。八位元有 256 階，聽起來很多，但一片從天頂鋪到天邊的漸層本來就吃得下這麼多階。"
    :height="280"
  >
    <demo-slider
      v-model="stepCount"
      label="色階數"
      :min="8"
      :max="256"
      :step="8"
      :digit="0"
      unit=" 階"
    />
    <demo-slider
      v-model="gradientLength"
      label="漸層長度"
      :min="0.15"
      :max="1"
      :step="0.05"
      :digit="2"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { PostProcess } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'

const stepCount = shallowRef(32)
const gradientLength = shallowRef(1)

const badge = computed(() => {
  const width = (100 * gradientLength.value / stepCount.value).toFixed(1)
  return `每一階佔畫面高度的 ${width}%`
})

const SHADER_NAME = 'demoBandingOrigin'

/**
 * 一條乾淨的漸層，最後量化到指定的階數
 *
 * 量化的算式與顯示器把浮點數寫進八位元緩衝區時做的事一樣，
 * 只是階數換成可以調的，肉眼才看得出中間發生了什麼
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform float stepCount;
uniform float gradientLength;

void main() {
  /** 以畫面中央為基準往上下展開，長度可調 */
  float ratio = clamp((vUV.y - 0.5) / gradientLength + 0.5, 0.0, 1.0);

  vec3 color = mix(
    vec3(0.90, 0.93, 0.96),
    vec3(0.22, 0.44, 0.86),
    ratio
  );

  /** 存進緩衝區的那一步，連續的數值只能落在整數階上 */
  color = floor(color * stepCount + 0.5) / stepCount;

  gl_FragColor = vec4(color, 1.0);
}
`

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  /**
   * 場景裡留一顆看不到的方塊
   *
   * 整張畫面由後製自己畫出來，場景本身沒有東西要畫。
   * 留一顆是為了讓算繪流程照常走完，它會被後製整個蓋掉
   */
  const anchor = babylon.MeshBuilder.CreateBox('anchor', { size: 0.01 }, scene)
  anchor.isPickable = false

  const postProcess: PostProcess = new babylon.PostProcess(
    'demo-banding',
    SHADER_NAME,
    ['stepCount', 'gradientLength'],
    [],
    1,
    camera,
  )

  /** 常數每一幀重寫一次，滑桿拉到哪裡下一幀就是哪裡 */
  postProcess.onApply = (effect) => {
    effect.setFloat('stepCount', stepCount.value)
    effect.setFloat('gradientLength', gradientLength.value)
  }

  return () => postProcess.dispose(camera)
}
</script>
