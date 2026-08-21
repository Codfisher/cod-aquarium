<template>
  <demo-frame
    :setup="setup"
    :camera-radius="15"
    :camera-beta="1.3"
    :clear-color="[0.52, 0.6, 0.69, 1]"
    title="鏡頭一直往前走，發射點跟不跟"
    caption="鏡頭沿著這排柱子來回移動。發射點釘在原地時，走出那一圈之後身邊就什麼都沒有了；跟著鏡頭走則是走到哪裡身邊都有東西在飄。"
  >
    <demo-toggle
      v-model="emitterFollows"
      label="發射點跟著鏡頭"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createMoteTexture } from './mote-texture'

const emitterFollows = ref(true)

/** 顆粒只鋪在這一圈裡，再遠的在畫面上小到看不見 */
const SPREAD_RADIUS = 9

/** 發射點重新繞回鏡頭的間隔（秒） */
const RECENTER_INTERVAL = 0.25

function setup({ babylon, scene, camera }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new babylon.Color3(1, 0.97, 0.9)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 120, height: 40 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.33, 0.41, 0.25)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  /** 一排柱子，人走過去時才看得出鏡頭真的在前進 */
  const pillarMaterial = new babylon.StandardMaterial('pillar-material', scene)
  pillarMaterial.diffuseColor = new babylon.Color3(0.4, 0.34, 0.26)
  pillarMaterial.specularColor = new babylon.Color3(0, 0, 0)

  for (let index = -6; index <= 6; index++) {
    for (const side of [-4, 4]) {
      const pillar = babylon.MeshBuilder.CreateBox(
        `pillar-${index}-${side}`,
        { width: 1, depth: 1, height: 3 },
        scene,
      )
      pillar.position.set(index * 6, 1.5, side)
      pillar.material = pillarMaterial
      pillar.isPickable = false
    }
  }

  const emitter = new babylon.Vector3(0, 2, 0)

  const moteSystem = new babylon.ParticleSystem('air-mote', 320, scene)
  moteSystem.particleTexture = createMoteTexture(babylon, scene, 'air-mote-texture')
  moteSystem.emitter = emitter
  moteSystem.minEmitBox = new babylon.Vector3(-SPREAD_RADIUS, -2.5, -SPREAD_RADIUS)
  moteSystem.maxEmitBox = new babylon.Vector3(SPREAD_RADIUS, 4, SPREAD_RADIUS)
  moteSystem.color1 = new babylon.Color4(1, 0.94, 0.72, 0.55)
  moteSystem.color2 = new babylon.Color4(0.94, 0.9, 0.78, 0.3)
  moteSystem.colorDead = new babylon.Color4(1, 0.94, 0.72, 0)
  moteSystem.minSize = 0.045
  moteSystem.maxSize = 0.09
  moteSystem.minLifeTime = 6
  moteSystem.maxLifeTime = 12
  moteSystem.emitRate = 30
  moteSystem.gravity = new babylon.Vector3(0, 0.012, 0)
  moteSystem.direction1 = new babylon.Vector3(-0.06, 0.02, -0.06)
  moteSystem.direction2 = new babylon.Vector3(0.06, 0.09, 0.06)
  moteSystem.minEmitPower = 0.04
  moteSystem.maxEmitPower = 0.16
  moteSystem.updateSpeed = 0.02
  moteSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  moteSystem.start()

  let elapsedSecond = 0
  let recenterElapsed = RECENTER_INTERVAL

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    elapsedSecond += deltaSecond

    /** 鏡頭沿著這排柱子來回，模擬一個人在走路 */
    camera.target.x = Math.sin(elapsedSecond * 0.32) * 24

    if (!emitterFollows.value) {
      emitter.set(0, 2, 0)
      return
    }

    /**
     * 發射點跟著鏡頭走，但不必每一幀跟
     *
     * 顆粒撒在十八格見方的盒子裡，走路一秒也才五六格，
     * 四分之一秒對齊一次完全看不出落差
     */
    recenterElapsed += deltaSecond
    if (recenterElapsed < RECENTER_INTERVAL)
      return

    recenterElapsed = 0
    emitter.set(camera.target.x, 2, camera.target.z)
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    moteSystem.dispose()
  }
}
</script>
