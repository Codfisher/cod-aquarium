<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-beta="1.3"
    :clear-color="[0.55, 0.63, 0.71, 1]"
    title="白天的浮塵與夜裡的螢火，同一套系統"
    caption="兩組粒子的骨架完全一樣，差別只在顏色、混合模式與發射率。把白晝程度拉到底，浮塵收乾淨，草間才開始有幾點螢火。"
  >
    <demo-slider
      v-model="dayRatio"
      label="白晝程度"
      :min="0"
      :max="1"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createLandmarkList, createMoteTexture } from './mote-texture'

const dayRatio = ref(1)

/** 兩種顆粒各自的最高發射率 */
const MOTE_EMIT_RATE = 26
const FIREFLY_EMIT_RATE = 9

/** 螢火開始現身的白晝程度，天再亮一點牠們就散了 */
const FIREFLY_DAY_THRESHOLD = 0.35

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.diffuse = new babylon.Color3(1, 0.97, 0.9)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 44, height: 44 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.33, 0.41, 0.25)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  createLandmarkList(babylon, scene)

  const emitter = new babylon.Vector3(0, 2, 0)

  /** 白天的浮塵，走標準混合，靠太陽照亮才看得見 */
  const moteSystem = new babylon.ParticleSystem('air-mote', 240, scene)
  moteSystem.particleTexture = createMoteTexture(babylon, scene, 'air-mote-texture')
  moteSystem.emitter = emitter
  moteSystem.minEmitBox = new babylon.Vector3(-11, -2.5, -11)
  moteSystem.maxEmitBox = new babylon.Vector3(11, 4, 11)
  moteSystem.color1 = new babylon.Color4(1, 0.94, 0.72, 0.5)
  moteSystem.color2 = new babylon.Color4(0.94, 0.9, 0.78, 0.28)
  moteSystem.colorDead = new babylon.Color4(1, 0.94, 0.72, 0)
  moteSystem.minSize = 0.04
  moteSystem.maxSize = 0.08
  moteSystem.minLifeTime = 6
  moteSystem.maxLifeTime = 13
  moteSystem.gravity = new babylon.Vector3(0, 0.012, 0)
  moteSystem.direction1 = new babylon.Vector3(-0.06, 0.02, -0.06)
  moteSystem.direction2 = new babylon.Vector3(0.06, 0.09, 0.06)
  moteSystem.minEmitPower = 0.04
  moteSystem.maxEmitPower = 0.16
  moteSystem.updateSpeed = 0.02
  moteSystem.emitRate = 0
  moteSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  moteSystem.start()

  /** 夜裡的螢火，走相加混合，自己會發光 */
  const fireflyColor = new babylon.Color4(0.78, 1, 0.5, 1)
  const fireflyColorDim = new babylon.Color4(0.4, 0.62, 0.26, 1)

  const fireflySystem = new babylon.ParticleSystem('air-firefly', 64, scene)
  fireflySystem.particleTexture = createMoteTexture(babylon, scene, 'air-firefly-texture')
  fireflySystem.emitter = emitter
  /** 螢火貼著草叢飛，範圍收窄、也不往高處去 */
  fireflySystem.minEmitBox = new babylon.Vector3(-8.8, -2.5, -8.8)
  fireflySystem.maxEmitBox = new babylon.Vector3(8.8, 1.2, 8.8)

  /**
   * 一生的亮度：亮起、撐住、熄掉
   *
   * 螢火是一明一滅的。用一整條壽命走完一次明滅，
   * 一群螢火各自的壽命又不一樣，整片看過去就是此起彼落地閃
   */
  fireflySystem.addColorGradient(0, fireflyColorDim, fireflyColorDim)
  fireflySystem.addColorGradient(0.25, fireflyColor, fireflyColor)
  fireflySystem.addColorGradient(0.6, fireflyColor, fireflyColor)
  fireflySystem.addColorGradient(1, fireflyColorDim, fireflyColorDim)
  fireflySystem.minSize = 0.06
  fireflySystem.maxSize = 0.11
  fireflySystem.minLifeTime = 3
  fireflySystem.maxLifeTime = 7
  fireflySystem.gravity = new babylon.Vector3(0, 0.02, 0)
  fireflySystem.direction1 = new babylon.Vector3(-0.35, -0.1, -0.35)
  fireflySystem.direction2 = new babylon.Vector3(0.35, 0.25, 0.35)
  fireflySystem.minEmitPower = 0.1
  fireflySystem.maxEmitPower = 0.45
  fireflySystem.updateSpeed = 0.02
  fireflySystem.emitRate = 0
  fireflySystem.blendMode = babylon.ParticleSystem.BLENDMODE_ADD
  fireflySystem.start()

  const stop = watch(dayRatio, (ratio) => {
    /** 天色與光照跟著走，不然「夜裡」只是一句話 */
    scene.clearColor.set(
      0.04 + 0.51 * ratio,
      0.05 + 0.58 * ratio,
      0.1 + 0.61 * ratio,
      1,
    )
    ambient.intensity = 0.12 + 0.7 * ratio

    /**
     * 白天才有浮塵，夜裡收掉
     *
     * 浮塵之所以看得見，是因為有光照在它身上。
     * 夜裡沒有那道光，一群還在發亮的顆粒只會像浮在畫面上的雜訊
     */
    moteSystem.emitRate = MOTE_EMIT_RATE * ratio

    /** 螢火反過來，拿 1 - dayRatio 反推，而且天要夠暗才出來 */
    const nightRatio = Math.max(0, 1 - ratio / FIREFLY_DAY_THRESHOLD)
    fireflySystem.emitRate = FIREFLY_EMIT_RATE * nightRatio
  }, { immediate: true })

  return () => {
    stop()
    moteSystem.dispose()
    fireflySystem.dispose()
  }
}
</script>
