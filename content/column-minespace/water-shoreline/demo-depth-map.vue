<template>
  <demo-frame
    :setup="setupScene"
    title="場景深度圖是什麼"
    caption="切到深度圖，畫面就變成一張「這個方向上最近的實體有多遠」的灰階圖，近的白、遠的黑。注意那片水完全不在圖上：深度那一趟不畫半透明的東西，所以水面問得到自己背後那塊沙地有多遠。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="19"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="depthVisible"
      label="顯示深度圖"
    />
    <demo-slider
      v-model="viewRange"
      label="灰階範圍"
      :min="8"
      :max="40"
      :step="1"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSceneDepth, createShoreScene } from './shore-scene'

const depthVisible = shallowRef(true)
const viewRange = shallowRef(24)

const SHADER_NAME = 'demoSceneDepthView'

/**
 * 把深度圖畫到畫面上的後處理
 *
 * 深度圖存的是視空間的 Z，也就是「離鏡頭多少格」。
 * 那個數字動輒好幾十，直接當顏色是一片全白，
 * 所以要先除以一個範圍再反過來，近的才是白的
 */
function registerShader(babylon: BabylonModule) {
  if (babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`])
    return

  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform sampler2D depthSampler;
    uniform float depthRange;
    uniform float depthMix;

    void main(void) {
      vec3 sceneColor = texture2D(textureSampler, vUV).rgb;
      float viewZ = texture2D(depthSampler, vUV).r;
      float ratio = clamp(viewZ / depthRange, 0.0, 1.0);

      gl_FragColor = vec4(mix(sceneColor, vec3(1.0 - ratio), depthMix), 1.0);
    }
  `
}

function setupScene(context: BabylonDemoContext) {
  const { babylon, camera } = context

  createShoreScene(context)
  const depthMap = createSceneDepth(context)

  registerShader(babylon)

  const view = new babylon.PostProcess(
    'demo-scene-depth-view',
    SHADER_NAME,
    ['depthRange', 'depthMix'],
    ['depthSampler'],
    1,
    camera,
  )

  view.onApply = (effect) => {
    effect.setTexture('depthSampler', depthMap)
    effect.setFloat('depthRange', viewRange.value)
    effect.setFloat('depthMix', depthVisible.value ? 1 : 0)
  }

  return () => view.dispose()
}
</script>
