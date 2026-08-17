<template>
  <compare-grid
    title="風要寫在初速上，不是寫在重力上"
    caption="左邊把橫向的風掛在 gravity 上。重力是加速度不是速度，四秒之後橫向位移是 ½×9×4²，也就是七十幾格，雪片還沒降下來就已經衝出視野。右邊把速度一次給足、重力只留微弱的下沉，雪才會等速斜著穿過眼前。"
  >
    <demo-frame
      :setup="setupGravityWind"
      badge="風掛在 gravity"
      compact
      v-bind="cameraParam"
    />
    <demo-frame
      :setup="setupVelocityWind"
      badge="風寫在初速"
      compact
      v-bind="cameraParam"
    />
  </compare-grid>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const cameraParam = {
  cameraAlpha: -Math.PI / 2,
  cameraBeta: Math.PI / 2.4,
  cameraRadius: 13,
  cameraTarget: [0, 1.6, 0] as [number, number, number],
  height: 260,
}

const SNOW_AREA_HALF_SIZE = 7
const SNOW_SPAWN_HEIGHT = 5

/**
 * 一片雪
 *
 * 硬邊的方塊，右下角缺一小塊讓它不是完美的正方形，
 * 飄起來才不會像一群像素同步移動
 */
function createSnowTexture(babylon: BabylonModule, scene: Scene) {
  const size = 8
  const texture = new babylon.DynamicTexture(
    'snow-flake',
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(0, 0, size, size)
  context.clearRect(size - size / 4, size - size / 4, size / 4, size / 4)

  texture.update()
  texture.hasAlpha = true

  return texture
}

function createScene(
  { babylon, scene }: BabylonDemoContext,
  windMode: 'gravity' | 'velocity',
) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    ParticleSystem,
    StandardMaterial,
    Vector3,
  } = babylon

  /** 暴風雪的白矇，霧色比晴天還白 */
  scene.clearColor = new Color4(0.88, 0.91, 0.95, 1)
  scene.fogMode = babylon.Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(0.88, 0.91, 0.95)
  scene.fogStart = 4
  scene.fogEnd = 22

  const sun = new DirectionalLight('sun', new Vector3(0.4, -0.8, -0.4), scene)
  sun.intensity = 0.1
  sun.diffuse = new Color3(1, 0.97, 0.92)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 1.15
  ambient.diffuse = new Color3(0.9, 0.94, 1)
  ambient.groundColor = new Color3(0.88, 0.9, 0.94)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  const sandMaterial = new StandardMaterial('snow-ground', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'snow-ground-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  /** 幾盞石燈籠當參照物，才看得出雪有沒有經過眼前 */
  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  for (const [x, z] of [[-3.2, 1], [3.4, -1.5], [0.4, -4]] as const) {
    const lantern = MeshBuilder.CreateBox(`lantern-${x}`, { width: 1.1, height: 2.6, depth: 1.1 }, scene)
    lantern.position.set(x, 1.3, z)
    lantern.material = stoneMaterial
  }

  const snow = new ParticleSystem('snow', 900, scene)
  snow.particleTexture = createSnowTexture(babylon, scene)
  snow.applyFog = true
  snow.emitter = new Vector3(0, 0, 0)
  /** 雪片沒有方向，抬頭看它也該是一片而不是一條線 */
  snow.billboardMode = ParticleSystem.BILLBOARDMODE_ALL

  /**
   * 生成盒往上風處推
   *
   * 雪是斜著飛的，盒子若對準鏡頭，有一半一出生就往下風飄走
   */
  const upwindX = windMode === 'velocity' ? 3 : 0
  snow.minEmitBox = new Vector3(-SNOW_AREA_HALF_SIZE + upwindX, SNOW_SPAWN_HEIGHT, -SNOW_AREA_HALF_SIZE)
  snow.maxEmitBox = new Vector3(SNOW_AREA_HALF_SIZE + upwindX, SNOW_SPAWN_HEIGHT + 3, SNOW_AREA_HALF_SIZE)

  snow.color1 = new Color4(1, 1, 1, 0.92)
  snow.color2 = new Color4(0.93, 0.96, 1, 0.72)
  snow.colorDead = new Color4(1, 1, 1, 0)

  snow.minSize = 0.07
  snow.maxSize = 0.16
  snow.minLifeTime = 3
  snow.maxLifeTime = 5
  snow.emitRate = 700
  snow.minAngularSpeed = -3.6
  snow.maxAngularSpeed = 3.6
  snow.updateSpeed = 0.02
  snow.blendMode = ParticleSystem.BLENDMODE_STANDARD

  if (windMode === 'gravity') {
    /**
     * 踩過的那個坑
     *
     * 橫向給 -9 的加速度，四秒之後位移七十幾格，
     * 而這座箱庭的能見度只有二十來格
     */
    snow.gravity = new Vector3(-9, -1, 1.5)
    snow.direction1 = new Vector3(0, -1, 0)
    snow.direction2 = new Vector3(0, -0.8, 0)
    snow.minEmitPower = 1
    snow.maxEmitPower = 2
  }
  else {
    /** 真正的風是等速的，初速一次給足 */
    snow.gravity = new Vector3(0, -1, 0)
    snow.direction1 = new Vector3(-1, -0.9, 0.2)
    snow.direction2 = new Vector3(-0.72, -0.66, 0.5)
    snow.minEmitPower = 6
    snow.maxEmitPower = 8.5
  }

  snow.start()

  return () => snow.dispose()
}

function setupGravityWind(context: BabylonDemoContext) {
  return createScene(context, 'gravity')
}

function setupVelocityWind(context: BabylonDemoContext) {
  return createScene(context, 'velocity')
}
</script>
