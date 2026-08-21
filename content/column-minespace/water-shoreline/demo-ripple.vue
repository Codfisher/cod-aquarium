<template>
  <demo-frame
    :setup="setupScene"
    title="八個槽位的擴散圓環"
    caption="每一圈是一條往外跑的環，半徑隨時間長大、濃度隨時間指數衰減。同時最多八圈，滿了就擠掉最老的那一圈。雨照著固定節奏放圈，涉水的人則是走多遠濺一次，站著不動的人不會在自己腳邊一直冒水波。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.2"
    :camera-radius="17"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isRaining"
      label="下雨"
    />
    <demo-toggle
      v-model="isWading"
      label="涉水的腳步"
    />
    <demo-slider
      v-model="rippleSpeed"
      label="擴散速度"
      :min="0.4"
      :max="4"
      :step="0.1"
      :digit="1"
      unit=" 格/秒"
    />
    <demo-slider
      v-model="rippleWidth"
      label="圈的厚度"
      :min="0.05"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Material, UniformBuffer } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createShoreScene, WATER_SURFACE_Y } from './shore-scene'

const isRaining = shallowRef(true)
const isWading = shallowRef(true)
const rippleSpeed = shallowRef(1.9)
const rippleWidth = shallowRef(0.32)

/** 同時最多幾圈 */
const SLOT_COUNT = 8

/** 幾秒之內淡光，同時也是一個槽位被佔用的時間 */
const RIPPLE_LIFETIME = 2.2

/** 指數衰減的係數，與壽命配合讓圈在消失前就已經很淡 */
const RIPPLE_DECAY = 1.5

/** 兩圈雨至少隔多久，圈才長得出來 */
const RAIN_INTERVAL = 0.33

/** 走多遠濺一次 */
const WADE_DISTANCE = 0.7

/**
 * 這一刻的水面
 *
 * 每四個數字一圈：世界 X、世界 Z、已經過幾秒、濃度。濃度為零代表空槽
 */
const rippleState = {
  time: 0,
  rippleList: new Float32Array(SLOT_COUNT * 4),
}

/**
 * 在水面上打一圈漣漪
 *
 * 有空槽就用空槽，全滿時擠掉最老的那一圈，它本來就快淡光了
 */
function emitRipple(x: number, z: number, strength: number): void {
  const { rippleList } = rippleState

  let slotIndex = 0
  let oldestAge = -1

  for (let index = 0; index < SLOT_COUNT; index++) {
    const offset = index * 4
    if (rippleList[offset + 3] === 0) {
      slotIndex = offset
      break
    }

    const age = rippleList[offset + 2]!
    if (age > oldestAge) {
      oldestAge = age
      slotIndex = offset
    }
  }

  rippleList[slotIndex] = x
  rippleList[slotIndex + 1] = z
  rippleList[slotIndex + 2] = 0
  rippleList[slotIndex + 3] = strength
}

function createRipplePluginClass(babylon: BabylonModule) {
  return class DemoRipplePlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      super(material, 'DemoRipple', 216, {}, true, true)
    }

    getClassName(): string {
      return 'DemoRipplePlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'rippleParam', size: 4, type: 'vec4' },
          { name: 'rippleList', size: 4, type: 'vec4', arraySize: SLOT_COUNT },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat4(
        'rippleParam',
        rippleState.time,
        rippleSpeed.value,
        rippleWidth.value,
        RIPPLE_DECAY,
      )
      uniformBuffer.updateFloatArray('rippleList', rippleState.rippleList)
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          float rippleFoamMask = 0.0;
        `,
        /**
         * 取最大值而不是相加
         *
         * 兩圈交會處相加會爆出一塊白，
         * 而水面上兩道波交會時本來就只是「比較亮的那一道」
         */
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
          for (int rippleIndex = 0; rippleIndex < ${SLOT_COUNT}; rippleIndex++) {
            vec4 rippleEvent = rippleList[rippleIndex];
            if (rippleEvent.w <= 0.0) continue;

            float rippleDistance = length(vPositionW.xz - rippleEvent.xy);
            float ringRadius = rippleEvent.z * rippleParam.y;
            float ring = 1.0 - smoothstep(0.0, rippleParam.z, abs(rippleDistance - ringRadius));

            rippleFoamMask = max(
              rippleFoamMask,
              ring * rippleEvent.w * exp(-rippleEvent.z * rippleParam.w)
            );
          }

          rippleFoamMask = clamp(rippleFoamMask, 0.0, 1.0);
          baseColor.rgb = mix(baseColor.rgb, vec3(1.7, 1.25, 1.05), rippleFoamMask);
        `,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          color.a = min(1.0, color.a + rippleFoamMask * 0.4);
        `,
      }
    }
  }
}

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context

  const { waterMaterial } = createShoreScene(context)

  const PluginClass = createRipplePluginClass(babylon)
  // eslint-disable-next-line no-new
  new PluginClass(waterMaterial)

  /** 一個在水裡繞圈的人，讓「走多遠濺一次」看得見 */
  const walker = babylon.MeshBuilder.CreateBox('walker', { width: 0.5, height: 1.6, depth: 0.5 }, scene)
  const walkerMaterial = new babylon.StandardMaterial('walker-material', scene)
  walkerMaterial.diffuseColor = new babylon.Color3(0.24, 0.22, 0.26)
  walkerMaterial.specularColor = new babylon.Color3(0, 0, 0)
  walker.material = walkerMaterial
  walker.isPickable = false

  let lastRainTime = Number.NEGATIVE_INFINITY
  let walkAngle = 0
  let lastWadeX = 0
  let lastWadeZ = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = scene.getEngine().getDeltaTime() / 1000
    rippleState.time += deltaSecond

    /** 過了壽命就把槽位讓出來 */
    for (let index = 0; index < SLOT_COUNT; index++) {
      const offset = index * 4
      if (rippleState.rippleList[offset + 3] === 0)
        continue

      const age = rippleState.rippleList[offset + 2]! + deltaSecond
      rippleState.rippleList[offset + 2] = age
      if (age > RIPPLE_LIFETIME) {
        rippleState.rippleList[offset + 3] = 0
      }
    }

    if (isRaining.value && rippleState.time - lastRainTime >= RAIN_INTERVAL) {
      lastRainTime = rippleState.time
      const angle = Math.random() * Math.PI * 2
      const radius = Math.sqrt(Math.random()) * 4.2
      emitRipple(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.55)
    }

    walker.setEnabled(isWading.value)
    if (!isWading.value)
      return

    walkAngle += deltaSecond * 0.42
    const walkX = Math.cos(walkAngle) * 3.1
    const walkZ = Math.sin(walkAngle) * 3.1
    walker.position.set(walkX, WATER_SURFACE_Y + 0.3, walkZ)

    if (Math.hypot(walkX - lastWadeX, walkZ - lastWadeZ) < WADE_DISTANCE)
      return

    lastWadeX = walkX
    lastWadeZ = walkZ
    emitRipple(walkX, walkZ, 0.9)
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    rippleState.rippleList.fill(0)
  }
}
</script>
