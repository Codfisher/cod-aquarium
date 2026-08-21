<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="螢幕空間的放射狀模糊"
    caption="做法是拿太陽在畫面上的位置往外一路取樣疊加，很便宜。前提是太陽得在畫面裡，一轉到畫面之外，投影出來的原點沒了地方站，整個效果只能收掉。拉方位角把太陽推出畫面就看得到。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.2"
    :camera-radius="22"
    :camera-target="[0, 3.5, 2]"
    :height="320"
  >
    <demo-slider
      v-model="sunAzimuth"
      label="太陽方位"
      :min="-1.6"
      :max="1.6"
      :step="0.05"
      :digit="2"
      unit=" rad"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { PostProcess } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { addBeamAnchor, BEAM_SUN_DIRECTION, createBeamPostProcess } from './beam-scene'

/** 放射狀模糊沿路取幾次，這是編譯期常數 */
const SAMPLE_COUNT = 48

const sunAzimuth = shallowRef(0)
const sunOnScreen = shallowRef(true)

const badge = computed(() => (sunOnScreen.value ? '太陽在畫面裡' : '太陽跑出畫面，效果收掉'))

/** 太陽繞著世界的上方轉，方位一變光束的來向也跟著變 */
const sunDirection = computed<[number, number, number]>(() => {
  const [x, y, z] = BEAM_SUN_DIRECTION
  const angle = sunAzimuth.value

  return [
    x * Math.cos(angle) + z * Math.sin(angle),
    y,
    -x * Math.sin(angle) + z * Math.cos(angle),
  ]
})

const BLUR_SHADER_NAME = 'demoScreenGodRays'

/**
 * 典型的螢幕空間光束
 *
 * 從這個像素往太陽在畫面上的位置一路取樣，越靠近太陽權重越高。
 * 取樣時只留夠亮的部分，不然整個畫面都會被拖出尾巴
 */
const BLUR_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform vec2 sunPosition;
uniform float density;
uniform float decay;
uniform float weight;
uniform float exposure;
uniform float intensity;

void main() {
  vec3 sceneColor = texture2D(textureSampler, vUV).rgb;

  if (intensity <= 0.0) {
    gl_FragColor = vec4(sceneColor, 1.0);
    return;
  }

  vec2 texCoord = vUV;
  vec2 stepOffset = (texCoord - sunPosition) * (density / float(SAMPLE_COUNT));

  vec3 accumulated = vec3(0.0);
  float illuminationDecay = 1.0;

  for (int index = 0; index < SAMPLE_COUNT; index++) {
    texCoord -= stepOffset;

    vec3 sampleColor = texture2D(textureSampler, texCoord).rgb;
    float luma = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));
    sampleColor *= smoothstep(0.72, 0.96, luma);

    accumulated += sampleColor * illuminationDecay * weight;
    illuminationDecay *= decay;
  }

  gl_FragColor = vec4(sceneColor + accumulated * exposure * intensity, 1.0);
}
`

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const { Effect, PostProcess, Vector3 } = babylon

  addBeamAnchor(babylon, scene)

  /**
   * 第一道只負責把場景畫出來
   *
   * 強度給零，所以它不加任何光束。這裡要示範的是接在後面那一道
   */
  const scenePass = createBeamPostProcess({
    babylon,
    scene,
    camera,
    maxStepCount: 1,
    measureSetting: () => ({
      strength: 0,
      stepCount: 1,
      anisotropy: 0.45,
      scatterBase: 0.18,
      phaseEnabled: true,
      averageEnabled: true,
      jitterEnabled: false,
      beamOnly: false,
      sunDirection: sunDirection.value,
    }),
  })

  Effect.ShadersStore[`${BLUR_SHADER_NAME}FragmentShader`] = BLUR_FRAGMENT_SHADER

  const blurPass: PostProcess = new PostProcess(
    'demo-screen-god-rays',
    BLUR_SHADER_NAME,
    ['sunPosition', 'density', 'decay', 'weight', 'exposure', 'intensity'],
    [],
    1,
    camera,
    undefined,
    scene.getEngine(),
    false,
    `#define SAMPLE_COUNT ${SAMPLE_COUNT}`,
  )

  const sunPoint = new Vector3()

  blurPass.onApply = (effect) => {
    const [x, y, z] = sunDirection.value

    /** 太陽擺在光線來向的遠處，再投影回畫面上 */
    sunPoint.set(
      camera.globalPosition.x - x * 200,
      camera.globalPosition.y - y * 200,
      camera.globalPosition.z - z * 200,
    )

    const viewPoint = Vector3.TransformCoordinates(sunPoint, scene.getViewMatrix())
    const clipPoint = Vector3.TransformCoordinates(sunPoint, scene.getTransformMatrix())

    const positionX = clipPoint.x * 0.5 + 0.5
    const positionY = clipPoint.y * 0.5 + 0.5

    /** 跑到鏡頭背後或畫面之外就沒有原點可以站了 */
    const isVisible = viewPoint.z > 0
      && positionX > -0.1 && positionX < 1.1
      && positionY > -0.1 && positionY < 1.1
    sunOnScreen.value = isVisible

    effect.setFloat2('sunPosition', positionX, positionY)
    effect.setFloat('density', 0.92)
    effect.setFloat('decay', 0.96)
    effect.setFloat('weight', 0.24)
    effect.setFloat('exposure', 0.34)
    effect.setFloat('intensity', isVisible ? 1 : 0)
  }

  return () => {
    blurPass.dispose(camera)
    scenePass.dispose(camera)
  }
}
</script>
