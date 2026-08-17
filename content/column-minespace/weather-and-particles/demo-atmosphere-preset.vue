<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="每一座箱庭有自己的大氣"
    caption="平行光、天光與高光三個倍率要分開。陰天不是變暗而是光的來源換了，把平行光壓到影子消失時天光要補回來，畫面才會是「陰而亮」而不是「傍晚」。高光則需要一個又小又亮的點才照得出來，那正是雲最先抹掉的東西。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 2.7"
    :camera-radius="17"
    :camera-target="[0, 1.4, 0]"
    :height="300"
  >
    <button
      v-for="preset in presetList"
      :key="preset.name"
      type="button"
      class="atmosphere-preset"
      :class="{ 'atmosphere-preset--on': currentName === preset.name }"
      @click="currentName = preset.name"
    >
      {{ preset.name }}
    </button>
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, HemisphericLight, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

interface AtmospherePreset {
  name: string;
  fogColor: [number, number, number];
  fogStart: number;
  fogEnd: number;
  /** 平行光的強度倍率，陰天會壓低 */
  lightRatio: number;
  /** 天光的強度倍率，與平行光分開 */
  ambientRatio: number;
  /** 直射陽光還剩幾成，高光專用 */
  specularRatio: number;
}

/** 與本體同一組數字，能見度照這個範例的尺度收過 */
const presetList: AtmospherePreset[] = [
  {
    name: '晴天',
    fogColor: [0.955, 0.95, 0.935],
    fogStart: 30,
    fogEnd: 90,
    lightRatio: 1,
    ambientRatio: 1,
    specularRatio: 1,
  },
  {
    name: '聽雨亭',
    fogColor: [0.62, 0.66, 0.72],
    fogStart: 4,
    fogEnd: 26,
    /** 厚雲之後已經沒有一個「方向」可言 */
    lightRatio: 0.12,
    /** 落到地面的總光量其實掉得不多，只是沒有方向了 */
    ambientRatio: 1.05,
    specularRatio: 0.05,
  },
  {
    name: '吹雪野',
    fogColor: [0.88, 0.91, 0.95],
    fogStart: 0.5,
    fogEnd: 6,
    lightRatio: 0.1,
    /** 雪把光從地面反回來，天光比任何一種天氣都高 */
    ambientRatio: 1.15,
    specularRatio: 0.04,
  },
  {
    name: '蛙聲澤',
    fogColor: [0.72, 0.78, 0.7],
    fogStart: 2,
    fogEnd: 20,
    lightRatio: 0.82,
    /** 濕氣散開的光又落回地面，天光反而比晴天更均勻 */
    ambientRatio: 1.02,
    specularRatio: 0.45,
  },
  {
    name: '地獄谷',
    /** 岩漿那池光反射在空氣裡的顏色，紅通道給到滿檔以上 */
    fogColor: [1.02, 0.34, 0.16],
    fogStart: 3,
    fogEnd: 22,
    lightRatio: 0.55,
    ambientRatio: 1.12,
    /** 岩面是粗糙的，沒有一個能反出太陽的點 */
    specularRatio: 0.12,
  },
]

const currentName = shallowRef('晴天')

const currentPreset = computed(
  () => presetList.find((preset) => preset.name === currentName.value) ?? presetList[0]!,
)

const badge = computed(() => {
  const preset = currentPreset.value

  return `平行光 ${preset.lightRatio}  天光 ${preset.ambientRatio}  高光 ${preset.specularRatio}`
})

const sceneRef = shallowRef<Scene>()
const sunLight = shallowRef<DirectionalLight>()
const ambientLight = shallowRef<HemisphericLight>()
const waterMaterial = shallowRef<StandardMaterial>()
const babylonModule = shallowRef<BabylonModule>()

/** 晴天的基準，各箱庭的倍率都是乘在這上面 */
const BASE_LIGHT_INTENSITY = 1.3
const BASE_AMBIENT_INTENSITY = 0.82

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  sceneRef.value = scene
  babylonModule.value = babylon

  scene.fogMode = babylon.Scene.FOGMODE_LINEAR

  const sun = new DirectionalLight('sun', new Vector3(0.6, -0.6, -0.5), scene)
  sun.diffuse = new Color3(1, 0.93, 0.78)
  /** 高光給滿，讓材質自己決定要反射多少 */
  sun.specular = new Color3(1, 1, 1)
  sunLight.value = sun

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)
  ambientLight.value = ambient

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 120, height: 120 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 一路排到遠處的石燈籠，能見度的差別要有深度才看得出來 */
  for (let index = 0; index < 12; index++) {
    const z = -index * 6 - 3
    for (const x of [-3.6, 3.6]) {
      const base = MeshBuilder.CreateBox(`lantern-${index}-${x}`, { width: 1.1, height: 0.9, depth: 1.1 }, scene)
      base.position.set(x, 0.45, z)
      base.material = stoneMaterial

      const head = MeshBuilder.CreateBox(`lantern-head-${index}-${x}`, { width: 1.3, height: 0.9, depth: 1.3 }, scene)
      head.position.set(x, 1.75, z)
      head.material = stoneMaterial

      const post = MeshBuilder.CreateBox(`lantern-post-${index}-${x}`, { width: 0.35, height: 0.5, depth: 0.35 }, scene)
      post.position.set(x, 1.15, z)
      post.material = woodMaterial
    }
  }

  /**
   * 一池水
   *
   * 高光倍率的差別全靠它。水面是全場唯一能反出一個亮點的東西
   */
  const water = new StandardMaterial('water', scene)
  water.diffuseColor = new Color3(0.24, 0.44, 0.52)
  water.specularPower = 160
  water.alpha = 0.9
  waterMaterial.value = water

  const pool = MeshBuilder.CreateGround('pool', { width: 7, height: 7 }, scene)
  pool.position.set(0, 0.02, 2)
  pool.material = water

  applySetting()

  return () => {
    sceneRef.value = undefined
    sunLight.value = undefined
    ambientLight.value = undefined
    waterMaterial.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const scene = sceneRef.value
  const babylon = babylonModule.value
  if (!scene || !babylon)
    return

  const { Color3 } = babylon
  const preset = currentPreset.value

  scene.fogColor = new Color3(...preset.fogColor)
  scene.fogStart = preset.fogStart
  scene.fogEnd = preset.fogEnd
  /** 背景與霧同色，天地交界才不會露出一條線 */
  scene.clearColor = new babylon.Color4(...preset.fogColor, 1)

  if (sunLight.value) {
    sunLight.value.intensity = BASE_LIGHT_INTENSITY * preset.lightRatio
  }

  if (ambientLight.value) {
    ambientLight.value.intensity = BASE_AMBIENT_INTENSITY * preset.ambientRatio
  }

  /**
   * 高光單獨收
   *
   * 少了這一項，暴雨裡的水面照樣會被太陽打出一道刺眼的反光，
   * 明明頭頂連太陽的位置都看不出來
   */
  if (waterMaterial.value) {
    const glint = 0.8 * preset.specularRatio
    waterMaterial.value.specularColor = new Color3(glint, glint * 1.02, glint * 1.06)
  }
}

watch(currentName, applySetting)
</script>

<style scoped>
.atmosphere-preset {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.atmosphere-preset:hover {
  border-color: #d1d5db;
}

.atmosphere-preset--on {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
}

:global(html.dark) .atmosphere-preset {
  border-color: #374151;
  background: rgba(31, 41, 55, 0.6);
  color: #9ca3af;
}

:global(html.dark) .atmosphere-preset--on {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
}
</style>
