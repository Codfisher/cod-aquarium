<template>
  <demo-frame
    :setup="setupScene"
    title="走近才畫"
    caption="把鏡頭距離拉到啟用距離之外，倒影整片消失，那一趟地景也跟著整個省下來。那顆繞著池子飄的燈籠是拿來看更新頻率的，頻率歸零之後倒影裡的它會停在原地，因為那張圖不再重畫了。"
    :camera-alpha="-Math.PI / 2.2"
    :camera-beta="Math.PI / 3"
    :camera-radius="16"
    :camera-target="[0, 1, 0]"
    :interactive="false"
    :height="300"
  >
    <demo-slider
      v-model="cameraDistance"
      label="鏡頭距離"
      :min="8"
      :max="44"
      :step="1"
      :digit="0"
      unit=" 格"
    />
    <demo-slider
      v-model="activeDistance"
      label="啟用距離"
      :min="8"
      :max="44"
      :step="1"
      :digit="0"
      unit=" 格"
    />
    <demo-toggle
      v-model="isFrozenOnly"
      label="只凍結不隱藏"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import {
  createMirrorScene,
  POOL_HALF_DEPTH,
  POOL_HALF_WIDTH,
  SURFACE_LIFT,
  SURFACE_Y,
} from './mirror-scene'

const cameraDistance = shallowRef(16)
const activeDistance = shallowRef(30)
const isFrozenOnly = shallowRef(false)

/** 距離檢查的間隔（秒），這件事不必每一幀做 */
const CHECK_INTERVAL = 0.3

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene, camera } = context
  const { skyMeshList, landmarkList } = createMirrorScene(context)

  /** 一盞繞著池子飄的燈籠，倒影停不停得下來要靠它才看得出來 */
  const lantern = babylon.MeshBuilder.CreateBox('drifting-lantern', { size: 0.9 }, scene)
  const lanternMaterial = new babylon.StandardMaterial('drifting-lantern-material', scene)
  lanternMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  lanternMaterial.specularColor = new babylon.Color3(0, 0, 0)
  lanternMaterial.emissiveColor = new babylon.Color3(1, 0.78, 0.42)
  lanternMaterial.disableLighting = true
  lantern.material = lanternMaterial
  lantern.isPickable = false

  const texture = new babylon.MirrorTexture('water-mirror', 512, scene, true)
  texture.mirrorPlane = new babylon.Plane(0, -1, 0, SURFACE_Y)
  texture.renderList = [...skyMeshList, ...landmarkList, lantern]

  const material = new babylon.StandardMaterial('water-mirror-material', scene)
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(0, 0, 0)
  material.disableLighting = true
  material.reflectionTexture = texture
  material.reflectionTexture.level = 1
  material.alpha = 0.55
  material.transparencyMode = babylon.Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = true
  material.fogEnabled = false

  const surface = babylon.MeshBuilder.CreateGround(
    'water-mirror-surface',
    { width: POOL_HALF_WIDTH * 2, height: POOL_HALF_DEPTH * 2 },
    scene,
  )
  surface.material = material
  surface.position.y = SURFACE_Y + SURFACE_LIFT
  surface.isPickable = false

  const center = new babylon.Vector3(0, SURFACE_Y, 0)
  let isActive = true
  let elapsed = CHECK_INTERVAL
  let driftAngle = 0

  /**
   * 停用時把更新頻率設成零
   *
   * 只把網格關掉是不夠的，算繪目標是掛在場景上的，
   * 網格看不看得見它都照畫。頻率歸零才是真的不畫
   */
  function setActive(nextActive: boolean) {
    if (nextActive === isActive)
      return

    isActive = nextActive
    surface.setEnabled(nextActive || isFrozenOnly.value)
    texture.refreshRate = nextActive
      ? babylon.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
      : 0
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = scene.getEngine().getDeltaTime() / 1000

    driftAngle += deltaSecond * 0.5
    lantern.position.set(Math.cos(driftAngle) * 3, 2.4, Math.sin(driftAngle) * 3)

    camera.radius = cameraDistance.value

    elapsed += deltaSecond
    if (elapsed < CHECK_INTERVAL)
      return

    elapsed = 0
    surface.setEnabled(isActive || isFrozenOnly.value)
    setActive(babylon.Vector3.Distance(camera.position, center) < activeDistance.value)
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}
</script>
