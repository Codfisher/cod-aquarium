<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    :interactive="false"
    :zoomable="false"
    title="色調映射之後又量化了一次"
    caption="曲線把暗部往上拉開，原本相鄰的兩階被推得更遠；再量化一次，中間那段空隙就成了更寬的一條帶。畫面經過的每一道處理都會重排色階，而每一次重排都是一次讓色階環現形的機會。"
    :height="280"
  >
    <demo-toggle
      v-model="hasToneMapping"
      label="色調映射與對比"
    />
    <demo-toggle
      v-model="hasDithering"
      label="分級後打散色階"
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
import DemoToggle from '../demo/demo-toggle.vue'

const hasToneMapping = shallowRef(true)
const hasDithering = shallowRef(false)
const stepCount = shallowRef(32)

const badge = computed(() => {
  if (!hasToneMapping.value)
    return '只量化一次'

  return hasDithering.value ? '量化兩次，打散過' : '量化兩次'
})

const SHADER_NAME = 'demoTonemapBand'

/**
 * 把一整條後製鏈壓進一支著色器
 *
 * 順序照著本體的管線走：場景先寫進緩衝區（第一次量化），
 * 接著才是色調映射與對比，最後寫進畫面（第二次量化）。
 * 色階數改成可調的，中間發生的事才看得見
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform float stepCount;
uniform float toneMappingEnabled;
uniform float ditheringEnabled;

/** ACES 的常見近似式，與 Babylon 用的是同一條曲線的形狀 */
vec3 acesToneMap(vec3 color) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;

  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

vec3 quantize(vec3 color) {
  return floor(color * stepCount + 0.5) / stepCount;
}

void main() {
  float ratio = clamp(vUV.y, 0.0, 1.0);

  vec3 linearColor = mix(
    vec3(0.02, 0.03, 0.06),
    vec3(0.55, 0.72, 0.98),
    ratio
  );

  /** 第一次量化：場景畫進緩衝區 */
  vec3 color = quantize(linearColor);

  if (toneMappingEnabled > 0.5) {
    color = acesToneMap(color * 1.6);
    /** 對比拉一點，色階會再被重排一次 */
    color = clamp((color - 0.5) * 1.18 + 0.5, 0.0, 1.0);
  }

  if (ditheringEnabled > 0.5) {
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (noise - 0.5) / stepCount;
  }

  /** 第二次量化：寫進畫面 */
  gl_FragColor = vec4(quantize(color), 1.0);
}
`

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const anchor = babylon.MeshBuilder.CreateBox('anchor', { size: 0.01 }, scene)
  anchor.isPickable = false

  const postProcess: PostProcess = new babylon.PostProcess(
    'demo-tonemap-band',
    SHADER_NAME,
    ['stepCount', 'toneMappingEnabled', 'ditheringEnabled'],
    [],
    1,
    camera,
  )

  postProcess.onApply = (effect) => {
    effect.setFloat('stepCount', stepCount.value)
    effect.setFloat('toneMappingEnabled', hasToneMapping.value ? 1 : 0)
    effect.setFloat('ditheringEnabled', hasDithering.value ? 1 : 0)
  }

  return () => postProcess.dispose(camera)
}
</script>
