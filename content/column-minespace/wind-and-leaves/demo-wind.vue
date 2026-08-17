<template>
  <demo-frame
    :setup="setupScene"
    title="三層風各自負責什麼"
    caption="三個開關可以單獨關掉每一層。只留陣風的話整片草是同時動的，像一塊布；加上行進波才會一株接一株倒下去；再加顫動，同一小塊裡的草才不會整齊得像剪過。"
    :camera-alpha="-Math.PI / 2.15"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="17"
    :camera-target="[0, 0.8, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasGust"
      label="陣風（柏林噪聲）"
    />
    <demo-toggle
      v-model="hasRipple"
      label="行進波"
    />
    <demo-toggle
      v-model="hasFlutter"
      label="顫動"
    />
    <demo-toggle
      v-model="isBendingFromBase"
      label="從根部彎"
    />
    <demo-slider
      v-model="amplitude"
      label="擺幅"
      :min="0"
      :max="0.4"
      :step="0.01"
    />
    <demo-slider
      v-model="rippleWavelength"
      label="波長"
      :min="2"
      :max="30"
      :step="1"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Engine, Scene, StandardMaterial, SubMesh, UniformBuffer } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPlantTexture, createSandTexture } from '../demo/pixel-texture'

const hasGust = shallowRef(true)
const hasRipple = shallowRef(true)
const hasFlutter = shallowRef(true)
const amplitude = shallowRef(0.14)
/**
 * 一為從底部彎（花草），零為整塊一起移動（樹葉）
 *
 * 關掉之後整株草會像一片浮在空中的布，
 * 那正是為什麼樹葉那一路要另外處理
 */
const isBendingFromBase = shallowRef(true)
/** 花草的波長是六格，樹葉要拉到二十四格才會整棵同步 */
const rippleWavelength = shallowRef(6)

/** 與本體同一組數字 */
const WIND_FIELD_SCALE = 0.09
const WIND_SPEED = 2.6
const PLANT_RIPPLE_WAVELENGTH = 6
const FLUTTER_RATIO = 0.25
const FLUTTER_SPEED = 2.2
const SQUALL_PERIOD_LIST = [79, 32, 153]
const SQUALL_RANGE: [number, number] = [0.3, 1.75]

const VERTEX_DEFINITIONS = `
vec2 windHash(vec2 point) {
  point = vec2(dot(point, vec2(127.1, 311.7)), dot(point, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(point) * 43758.5453123);
}

float windNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);
  vec2 weight = offset * offset * (3.0 - 2.0 * offset);

  return mix(
    mix(
      dot(windHash(cell), offset),
      dot(windHash(cell + vec2(1.0, 0.0)), offset - vec2(1.0, 0.0)),
      weight.x
    ),
    mix(
      dot(windHash(cell + vec2(0.0, 1.0)), offset - vec2(0.0, 1.0)),
      dot(windHash(cell + vec2(1.0, 1.0)), offset - vec2(1.0, 1.0)),
      weight.x
    ),
    weight.y
  );
}
`

/**
 * 與本體幾乎一樣，只多了三個開關
 *
 * windLayer 的三個分量分別是陣風、行進波與顫動要不要算。
 * 給零時那一層的貢獻直接歸零，讀者就看得到少了它是什麼樣子
 */
const VERTEX_UPDATE_POSITION = `
{
  #ifdef INSTANCES
    vec3 plantOrigin = world3.xyz;
  #else
    vec3 plantOrigin = vec3(0.0);
  #endif

  vec2 windDirection = normalize(vec2(0.940, 0.340));

  vec2 samplePoint = plantOrigin.xz * ${WIND_FIELD_SCALE.toFixed(3)}
    - windDirection * windTime * ${WIND_FIELD_SCALE.toFixed(3)} * ${WIND_SPEED.toFixed(3)};
  float gust = windNoise(samplePoint) * 0.68
    + windNoise(samplePoint * 2.3 + 17.0) * 0.32;

  float gustStrength = mix(1.0, clamp(0.7 + gust * 0.45, 0.35, 1.15), windLayer.x);
  float strength = clamp(gustStrength * windSquall, 0.1, 1.7);

  float rippleTravel = dot(plantOrigin.xz, windDirection) - windTime * ${WIND_SPEED.toFixed(3)};
  float ripple = sin(windRippleFrequency * rippleTravel) * windLayer.y;

  float flutterPhase = plantOrigin.x * 1.7 + plantOrigin.z * 2.3;
  float flutter = sin(windFlutterPhase + flutterPhase) * windLayer.z;

  float height = clamp(positionUpdated.y + 0.5, 0.0, 1.0);
  float leverage = mix(1.0, height * height, windHeightLeverage);

  float amplitude = windAmplitude * strength * (ripple + flutter * ${FLUTTER_RATIO.toFixed(3)});
  vec2 sway = windDirection * amplitude * leverage;

  positionUpdated.x += sway.x;
  positionUpdated.z += sway.y;
}
`

/** 這一份由 Vue 這側每幀寫入，著色器綁定時來讀 */
const windState = {
  elapsedSecond: 0,
  squall: 1,
  flutterPhase: 0,
  amplitude: 0.14,
  gust: 1,
  ripple: 1,
  flutter: 1,
  heightLeverage: 1,
  rippleFrequency: Math.PI * 2 / PLANT_RIPPLE_WAVELENGTH,
}

function measureSquall(elapsedSecond: number): number {
  let total = 0
  for (const [index, period] of SQUALL_PERIOD_LIST.entries()) {
    total += Math.sin(elapsedSecond * (Math.PI * 2 / period) + index * 1.7)
  }

  const normalized = total / SQUALL_PERIOD_LIST.length
  const [min, max] = SQUALL_RANGE

  return min + (max - min) * (normalized * 0.5 + 0.5)
}

function createPluginClass(babylon: BabylonModule) {
  return class DemoWindSwayPlugin extends babylon.MaterialPluginBase {
    constructor(material: StandardMaterial) {
      super(material, 'DemoWindSway', 200, { DEMO_WIND_SWAY: true })
      this._enable(true)
    }

    getClassName(): string {
      return 'DemoWindSwayPlugin'
    }

    /**
     * 只登記 ubo，不要再給 vertex 宣告字串
     *
     * 兩個都給的話同一個名字會被宣告兩次，著色器編不過，
     * 而編不過的材質不會報錯，只會整片草消失
     */
    getUniforms() {
      return {
        ubo: [
          { name: 'windTime', size: 1, type: 'float' },
          { name: 'windAmplitude', size: 1, type: 'float' },
          { name: 'windHeightLeverage', size: 1, type: 'float' },
          { name: 'windRippleFrequency', size: 1, type: 'float' },
          { name: 'windSquall', size: 1, type: 'float' },
          { name: 'windFlutterPhase', size: 1, type: 'float' },
          { name: 'windLayer', size: 3, type: 'vec3' },
        ],
      }
    }

    bindForSubMesh(
      uniformBuffer: UniformBuffer,
      _scene: Scene,
      _engine: Engine,
      _subMesh: SubMesh,
    ): void {
      uniformBuffer.updateFloat('windTime', windState.elapsedSecond)
      uniformBuffer.updateFloat('windAmplitude', windState.amplitude)
      uniformBuffer.updateFloat('windHeightLeverage', windState.heightLeverage)
      uniformBuffer.updateFloat('windRippleFrequency', windState.rippleFrequency)
      uniformBuffer.updateFloat('windSquall', windState.squall)
      uniformBuffer.updateFloat('windFlutterPhase', windState.flutterPhase)
      uniformBuffer.updateFloat3('windLayer', windState.gust, windState.ripple, windState.flutter)
    }

    getCustomCode(shaderType: string): Record<string, string> | null {
      if (shaderType !== 'vertex')
        return null

      return {
        CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS,
        CUSTOM_VERTEX_UPDATE_POSITION: VERTEX_UPDATE_POSITION,
      }
    }
  }
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    Material,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.7, -0.45), scene)
  sun.intensity = 1.15
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  const plantTexture = createPlantTexture({ babylon, scene, name: 'plant-texture', hasMipmap: false })
  plantTexture.hasAlpha = true

  const plantMaterial = new StandardMaterial('plant', scene)
  plantMaterial.diffuseTexture = plantTexture
  plantMaterial.useAlphaFromDiffuseTexture = true
  plantMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  plantMaterial.alphaCutOff = 0.5
  plantMaterial.backFaceCulling = false
  plantMaterial.twoSidedLighting = false
  plantMaterial.specularColor = new Color3(0, 0, 0)

  const PluginClass = createPluginClass(babylon)
  // eslint-disable-next-line no-new
  new PluginClass(plantMaterial)

  /** 兩片交叉的立板，與本體的 cross 方塊同一個做法 */
  const bladeA = MeshBuilder.CreatePlane('blade-a', { size: 1 }, scene)
  bladeA.rotation.y = Math.PI / 4
  bladeA.bakeCurrentTransformIntoVertices()
  bladeA.material = plantMaterial

  const bladeB = MeshBuilder.CreatePlane('blade-b', { size: 1 }, scene)
  bladeB.rotation.y = -Math.PI / 4
  bladeB.bakeCurrentTransformIntoVertices()
  bladeB.material = plantMaterial

  for (const mesh of [bladeA, bladeB]) {
    const normalList = mesh.getVerticesData('normal')
    if (normalList) {
      for (let index = 0; index < normalList.length; index += 3) {
        normalList[index] = 0
        normalList[index + 1] = 1
        normalList[index + 2] = 0
      }
      mesh.setVerticesData('normal', normalList)
    }
  }

  /**
   * 一整片草原
   *
   * 「一株接一株倒下去」要有夠多株才看得出來，
   * 只放五株的話三層風長得都差不多
   */
  const columnCount = 42
  const rowCount = 42
  const matrixList = new Float32Array(columnCount * rowCount * 16)
  let offset = 0

  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < columnCount; column++) {
      const x = (column - columnCount / 2) * 0.62
      const z = (row - rowCount / 2) * 0.62
      babylon.Matrix.Translation(x, 0.5, z).copyToArray(matrixList, offset * 16)
      offset++
    }
  }

  for (const mesh of [bladeA, bladeB]) {
    mesh.thinInstanceSetBuffer('matrix', matrixList, 16, true)
    mesh.alwaysSelectAsActiveMesh = true
    mesh.doNotSyncBoundingInfo = true
  }

  /**
   * 相位每幀累積，不能寫成時間乘速度
   *
   * 速度是會變的，而 t 乘上一個變動的速度，t 一大就會在
   * 速度改變的瞬間把相位甩出去一大段
   */
  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = scene.getEngine().getDeltaTime() / 1000
    windState.elapsedSecond += deltaSecond
    windState.squall = measureSquall(windState.elapsedSecond)
    windState.flutterPhase += deltaSecond * FLUTTER_SPEED * (0.55 + windState.squall * 0.5)
  })

  applySetting()

  return () => scene.onBeforeRenderObservable.remove(observer)
}

function applySetting() {
  windState.amplitude = amplitude.value
  windState.gust = hasGust.value ? 1 : 0
  windState.ripple = hasRipple.value ? 1 : 0
  windState.flutter = hasFlutter.value ? 1 : 0
  windState.heightLeverage = isBendingFromBase.value ? 1 : 0
  windState.rippleFrequency = Math.PI * 2 / rippleWavelength.value
}

watch(
  [hasGust, hasRipple, hasFlutter, amplitude, isBendingFromBase, rippleWavelength],
  applySetting,
)
</script>
