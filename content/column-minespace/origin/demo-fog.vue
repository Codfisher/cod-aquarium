<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="霧同時做兩件事"
    caption="平常那一檔只是淡淡一層，遠處的石燈籠若隱若現，整片庭園的構圖還看得到。切到世界邊界那一檔，六格以外什麼都沒有，那不是天氣是一道遮蔽用的簾子，玩家跨過去時兩側都是同一片白，無從察覺自己被送到了對面。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.3"
    :camera-radius="10"
    :camera-target="[0, 1.4, -22]"
    :height="300"
  >
    <button
      type="button"
      class="fog-preset"
      :class="{ 'fog-preset--on': presetName === 'garden' }"
      @click="applyPreset('garden')"
    >
      平常的能見度
    </button>
    <button
      type="button"
      class="fog-preset"
      :class="{ 'fog-preset--on': presetName === 'edge' }"
      @click="applyPreset('edge')"
    >
      世界邊界的白幕
    </button>
    <demo-slider
      v-model="fogStart"
      label="起點"
      :min="0"
      :max="60"
      :step="0.5"
      :digit="1"
      unit=" 格"
    />
    <demo-slider
      v-model="fogEnd"
      label="終點"
      :min="2"
      :max="220"
      :step="1"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/**
 * 平常的能見度
 *
 * 本體是 100 到 220 格，那是照著整片禪庭的尺度定的。
 * 這個範例只有四十來格深，照抄的話霧根本不會作用，
 * 所以等比收成同樣的「淡淡一層」觀感
 */
const GARDEN_FOG_START = 24
const GARDEN_FOG_END = 90

/**
 * 世界邊界的白幕
 *
 * 這一組是本體的原始數字，沒有縮放。
 * 它濃到六格外什麼都沒有，與場景多大無關
 */
const EDGE_FOG_START = 0.5
const EDGE_FOG_END = 6

const fogStart = shallowRef(GARDEN_FOG_START)
const fogEnd = shallowRef(GARDEN_FOG_END)

const sceneRef = shallowRef<Scene>()

/** 目前落在哪一組預設上，兩個都不是就不標 */
const presetName = computed(() => {
  if (fogStart.value === GARDEN_FOG_START && fogEnd.value === GARDEN_FOG_END)
    return 'garden'
  if (fogStart.value === EDGE_FOG_START && fogEnd.value === EDGE_FOG_END)
    return 'edge'

  return ''
})

const badge = computed(() => `${fogStart.value} 格開始褪色，${fogEnd.value} 格外一片空白`)

function applyPreset(name: 'garden' | 'edge') {
  if (name === 'garden') {
    fogStart.value = GARDEN_FOG_START
    fogEnd.value = GARDEN_FOG_END
    return
  }

  fogStart.value = EDGE_FOG_START
  fogEnd.value = EDGE_FOG_END
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  /**
   * 背景要與霧色一致
   *
   * 霧把遠方收成一片白，而天空是另一塊顏色的話，
   * 兩者交界就會露出一條線，那正是霧要藏起來的東西
   */
  const fogColor = new Color3(0.955, 0.95, 0.935)
  scene.clearColor = new babylon.Color4(fogColor.r, fogColor.g, fogColor.b, 1)

  scene.fogMode = babylon.Scene.FOGMODE_LINEAR
  scene.fogColor = fogColor
  sceneRef.value = scene

  const sun = new DirectionalLight('sun', new Vector3(0.6, -0.64, -0.48), scene)
  sun.intensity = 1.25
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 120, height: 260 }, scene)
  ground.position.z = -60
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 一路排到遠處的石燈籠
   *
   * 霧是「越遠越淡」，所以場景一定要有深度。
   * 等距擺放還有一個好處：讀者可以數出霧吃掉了第幾盞
   */
  for (let index = 0; index < 16; index++) {
    const z = -index * 5 - 3
    for (const x of [-3.4, 3.4]) {
      const base = MeshBuilder.CreateBox(`lantern-base-${index}-${x}`, { width: 1.1, height: 0.8, depth: 1.1 }, scene)
      base.position.set(x, 0.4, z)
      base.material = stoneMaterial

      const post = MeshBuilder.CreateBox(`lantern-post-${index}-${x}`, { width: 0.35, height: 1.1, depth: 0.35 }, scene)
      post.position.set(x, 1.35, z)
      post.material = woodMaterial

      const head = MeshBuilder.CreateBox(`lantern-head-${index}-${x}`, { width: 1.3, height: 0.9, depth: 1.3 }, scene)
      head.position.set(x, 2.35, z)
      head.material = stoneMaterial
    }
  }

  /** 遠處一座鳥居，霧濃起來時它是第一個消失的東西 */
  for (const x of [-2.6, 2.6]) {
    const pillar = MeshBuilder.CreateBox(`torii-${x}`, { width: 0.6, height: 6, depth: 0.6 }, scene)
    pillar.position.set(x, 3, -34)
    pillar.material = woodMaterial
  }

  const toriiBeam = MeshBuilder.CreateBox('torii-beam', { width: 7.4, height: 0.6, depth: 0.7 }, scene)
  toriiBeam.position.set(0, 6.2, -34)
  toriiBeam.material = woodMaterial

  applySetting()
}

function applySetting() {
  const scene = sceneRef.value
  if (!scene)
    return

  scene.fogStart = fogStart.value
  scene.fogEnd = fogEnd.value
}

watch([fogStart, fogEnd], applySetting)
</script>

<style scoped>
.fog-preset {
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

.fog-preset:hover {
  border-color: #d1d5db;
}

.fog-preset--on {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
}

:global(html.dark) .fog-preset {
  border-color: #374151;
  background: rgba(31, 41, 55, 0.6);
  color: #9ca3af;
}

:global(html.dark) .fog-preset--on {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
}
</style>
