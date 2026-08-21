<template>
  <demo-frame
    :setup="setup"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.4"
    :camera-radius="18"
    :camera-target="[0, 1.4, -1]"
    :height="300"
    title="投影範圍跟著走的時候，邊緣會爬"
    caption="紅色那顆方塊代表玩家，投影範圍跟著它移動。關掉對齊之後，同一道邊緣每一幀落在不同的取樣點上，影子邊緣會沿著移動的方向不停爬動。打開對齊，只要玩家沒有跨過一格取樣格，整張陰影貼圖就與上一幀一模一樣。"
  >
    <demo-toggle
      v-model="isSnapped"
      label="對齊取樣格"
    />
    <demo-slider
      v-model="walkSpeed"
      label="移動速度"
      :min="0"
      :max="1"
      :step="0.02"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createShadowProps, createShadowStage } from './shadow-stage'

const isSnapped = ref(true)
const walkSpeed = ref(0.4)

/** 投影範圍的半徑與貼圖邊長，兩者一起決定一格取樣格有多寬 */
const HALF_EXTENT = 16
const MAP_SIZE = 512
/** 光源沿著光線退開多遠 */
const LIGHT_DISTANCE = 34

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createShadowStage({ babylon, scene })

  stage.sun.autoUpdateExtends = false
  stage.sun.orthoLeft = -HALF_EXTENT
  stage.sun.orthoRight = HALF_EXTENT
  stage.sun.orthoTop = HALF_EXTENT
  stage.sun.orthoBottom = -HALF_EXTENT
  stage.sun.shadowMinZ = 1
  stage.sun.shadowMaxZ = LIGHT_DISTANCE + 60

  const generator = new babylon.ShadowGenerator(MAP_SIZE, stage.sun)
  generator.darkness = 0.05
  generator.bias = 0.0005
  generator.normalBias = 0.08
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = babylon.ShadowGenerator.QUALITY_MEDIUM

  for (const mesh of createShadowProps({ babylon, scene, stage })) {
    generator.addShadowCaster(mesh)
  }

  /** 代表玩家的那顆方塊，投影範圍跟著它走 */
  const walker = babylon.MeshBuilder.CreateBox('walker', { size: 0.8 }, scene)
  walker.position.set(0, 0.4, 4)
  const walkerMaterial = new babylon.StandardMaterial('walker-material', scene)
  walkerMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  walkerMaterial.specularColor = new babylon.Color3(0, 0, 0)
  walkerMaterial.emissiveColor = new babylon.Color3(0.85, 0.22, 0.24)
  walker.material = walkerMaterial
  generator.addShadowCaster(walker)

  /** 光源空間的三軸與暫存，每幀就地覆寫，不重新配置 */
  const forward = new babylon.Vector3()
  const right = new babylon.Vector3()
  const up = new babylon.Vector3()
  const center = new babylon.Vector3()

  const texelSize = (HALF_EXTENT * 2) / MAP_SIZE
  let elapsed = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += (scene.getEngine().getDeltaTime() / 1000) * walkSpeed.value
    walker.position.x = Math.sin(elapsed) * 9

    /**
     * 三軸的建法必須與 Babylon 算陰影視圖矩陣時完全一致
     *
     * 它用的是 LookAtLH，以世界的上方為參考
     */
    forward.copyFrom(stage.sun.direction).normalize()
    babylon.Vector3.CrossToRef(babylon.Vector3.UpReadOnly, forward, right)
    right.normalize()
    babylon.Vector3.CrossToRef(forward, right, up)

    if (!isSnapped.value) {
      center.copyFrom(walker.position)
    }
    else {
      /**
       * 先投影到光源自己的三軸上，在那裡對齊，再轉回世界座標
       *
       * 陰影貼圖的格子長在光源空間上，而光源是斜的。
       * 直接拿世界座標的 X、Y、Z 去對齊，投影過去照樣落在格子中間
       */
      const alongRight = Math.round(babylon.Vector3.Dot(walker.position, right) / texelSize) * texelSize
      const alongUp = Math.round(babylon.Vector3.Dot(walker.position, up) / texelSize) * texelSize
      const alongForward = Math.round(babylon.Vector3.Dot(walker.position, forward) / texelSize) * texelSize

      center.set(
        right.x * alongRight + up.x * alongUp + forward.x * alongForward,
        right.y * alongRight + up.y * alongUp + forward.y * alongForward,
        right.z * alongRight + up.z * alongUp + forward.z * alongForward,
      )
    }

    stage.sun.position.set(
      center.x - forward.x * LIGHT_DISTANCE,
      center.y - forward.y * LIGHT_DISTANCE,
      center.z - forward.z * LIGHT_DISTANCE,
    )
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}
</script>
