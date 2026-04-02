<template>
  <canvas
    v-once
    ref="canvasRef"
    class="w-full h-full outline-0"
    tabindex="0"
  />
</template>

<script setup lang="ts">
import type { InputState } from './composables/use-input'
import type { Vehicle } from './composables/use-vehicle'
import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  FreeCamera,
  HavokPlugin,
  HemisphericLight,
  ImportMeshAsync,
  PhysicsAggregate,
  PhysicsShapeType,
  Scene,
  ShadowGenerator,
  Vector3,
} from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'
import { ref } from 'vue'
import { useBabylonScene } from './composables/use-babylon-scene'
import { useTrackBuilder } from './composables/use-track-builder'
import { useVehicle } from './composables/use-vehicle'

const props = defineProps<{
  input: InputState;
}>()

const emit = defineEmits<{
  ready: [];
}>()

const { buildTrack } = useTrackBuilder()
const { speed, createVehicle } = useVehicle()

const vehicle = ref<Vehicle>()
const isReady = ref(false)

/**
 * 相機偏移（直接使用 Godot 數值，因為場景已設為右手座標系）
 *
 * View basis column2 * 16 = (9.268, 9.177, 9.268)
 */
const CAMERA_OFFSET = new Vector3(9.268, 9.177, 9.268)
const CAMERA_LERP_SPEED = 4
const CAMERA_FOV = 40 * Math.PI / 180
const cameraTarget = new Vector3(3.5, 0, 5)

const { canvasRef } = useBabylonScene({
  createScene({ engine }) {
    const sceneInstance = new Scene(engine)
    sceneInstance.useRightHandedSystem = true

    sceneInstance.clearColor = new Color4(0.676, 0.764, 0.974, 1)
    sceneInstance.ambientColor = new Color3(0.614, 0.703, 0.817)

    sceneInstance.fogMode = Scene.FOGMODE_LINEAR
    sceneInstance.fogColor = new Color3(0.676, 0.764, 0.974)
    sceneInstance.fogStart = 30
    sceneInstance.fogEnd = 60

    return sceneInstance
  },

  createCamera({ scene: sceneValue }) {
    const cam = new FreeCamera(
      'followCam',
      cameraTarget.add(CAMERA_OFFSET),
      sceneValue,
    )
    cam.fov = CAMERA_FOV
    cam.minZ = 0.1
    cam.maxZ = 120
    cam.setTarget(cameraTarget)
    return cam
  },

  async init({ scene: sceneValue, engine, camera: cameraValue }) {
    // --- 光源 ---
    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), sceneValue)
    hemiLight.intensity = 1.2
    hemiLight.diffuse = new Color3(0.9, 0.92, 0.98)
    hemiLight.groundColor = new Color3(0.55, 0.55, 0.6)

    // Sun DirectionalLight3D（Godot forward 約 (-0.58, -0.77, -0.27)）
    const sunLight = new DirectionalLight(
      'sunLight',
      new Vector3(-0.583, -0.766, -0.272),
      sceneValue,
    )
    sunLight.intensity = 1.8
    sunLight.diffuse = new Color3(1, 0.98, 0.95)

    // --- 陰影 ---
    const shadowGen = new ShadowGenerator(2048, sunLight)
    shadowGen.bias = 0.01
    shadowGen.normalBias = 0.05
    shadowGen.darkness = 0.25
    shadowGen.usePercentageCloserFiltering = true

    // --- 後製 ---
    const pipeline = new DefaultRenderingPipeline(
      'pipeline', true, sceneValue, [cameraValue],
    )
    pipeline.fxaaEnabled = true
    pipeline.samples = 4
    pipeline.imageProcessingEnabled = true
    pipeline.imageProcessing.toneMappingEnabled = true
    pipeline.imageProcessing.toneMappingType = 1
    pipeline.imageProcessing.exposure = 1.3
    pipeline.imageProcessing.contrast = 1.1
    pipeline.bloomEnabled = true
    pipeline.bloomThreshold = 0.9
    pipeline.bloomWeight = 0.15

    // --- Havok 物理引擎 ---
    console.log('[Scene] 初始化 Havok 物理引擎...')
    const havokInstance = await HavokPhysics()
    const havokPlugin = new HavokPlugin(true, havokInstance)
    const gravity = new Vector3(0, -9.81 * 1.5, 0)
    sceneValue.enablePhysics(gravity, havokPlugin)
    console.log('[Scene] Havok 啟用完成, gravity:', gravity.toString())

    // --- 賽道 ---
    const { spawnPosition, spawnRotation } = await buildTrack(sceneValue, shadowGen)
    cameraTarget.copyFrom(spawnPosition)

    // --- 玩家車輛 ---
    const modelPath = '/assets/kenny-Starter-Kit-Racing-godot-4.6/models/'

    try {
      const result = await ImportMeshAsync(
        `${modelPath}vehicle-truck-yellow.glb`,
        sceneValue,
      )

      if (result.meshes[0]) {
        const root = result.meshes[0]

        console.log('[Vehicle] GLB 載入成功', {
          meshCount: result.meshes.length,
          rootName: root.name,
          rootRotQuat: root.rotationQuaternion?.toString() ?? 'null',
          rootScaling: root.scaling?.toString(),
          childNames: root.getChildTransformNodes(false).map((n) => n.name),
        })

        root.rotationQuaternion = null
        root.rotation.set(0, spawnRotation, 0)
        root.position = spawnPosition.clone()
        root.scaling.setAll(0.375)

        for (const mesh of result.meshes) {
          if (mesh.getTotalVertices() > 0) {
            shadowGen.addShadowCaster(mesh)
          }
        }

        vehicle.value = createVehicle(sceneValue, root)
      }
    }
    catch (error) {
      console.warn('無法載入車輛 GLB', error)
    }

    // --- 裝飾車輛（Godot main.tscn 的靜態車輛） ---
    // 位置是 Godot 世界座標，Y 調整到路面高度（約 -0.4）
    const decorationVehicleList = [
      { file: 'vehicle-truck-green.glb', position: new Vector3(-3.51, -0.4, 12.70), rotationY: Math.atan2(0.990163, -0.139916) },
      { file: 'vehicle-truck-purple.glb', position: new Vector3(-23.78, -0.4, -13.56), rotationY: 0 },
      { file: 'vehicle-truck-red.glb', position: new Vector3(-1.36, -0.4, -23.8), rotationY: Math.atan2(0.407884, -0.913034) },
    ]

    for (const deco of decorationVehicleList) {
      try {
        const result = await ImportMeshAsync(
          `${modelPath}${deco.file}`,
          sceneValue,
        )
        if (result.meshes[0]) {
          result.meshes[0].rotationQuaternion = null
          result.meshes[0].rotation.set(0, deco.rotationY, 0)
          result.meshes[0].position = deco.position
          result.meshes[0].scaling.setAll(0.375)
          for (const mesh of result.meshes) {
            if (mesh.getTotalVertices() > 0) {
              shadowGen.addShadowCaster(mesh)
              try {
                // eslint-disable-next-line no-new
                new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, sceneValue)
              }
              catch { /* ignore */ }
            }
          }
        }
      }
      catch {
        // 裝飾車輛載入失敗不影響遊戲
      }
    }

    // --- 遊戲迴圈 ---
    sceneValue.onBeforeRenderObservable.add(() => {
      const delta = engine.getDeltaTime() / 1000
      if (vehicle.value) {
        vehicle.value.update(delta, props.input)
        updateCamera(cameraValue as FreeCamera, vehicle.value, delta)
      }
    })

    isReady.value = true
    emit('ready')
  },
})

function updateCamera(cam: FreeCamera, vehicleInstance: Vehicle, delta: number) {
  const targetPosition = vehicleInstance.getPosition()
  const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * delta)

  cameraTarget.x += (targetPosition.x - cameraTarget.x) * lerpFactor
  cameraTarget.y += (targetPosition.y - cameraTarget.y) * lerpFactor
  cameraTarget.z += (targetPosition.z - cameraTarget.z) * lerpFactor

  cam.position.x = cameraTarget.x + CAMERA_OFFSET.x
  cam.position.y = cameraTarget.y + CAMERA_OFFSET.y
  cam.position.z = cameraTarget.z + CAMERA_OFFSET.z
  cam.setTarget(cameraTarget)
}

defineExpose({ speed, isReady })
</script>
