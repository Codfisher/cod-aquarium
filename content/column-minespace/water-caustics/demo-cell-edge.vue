<template>
  <demo-frame
    :setup="setupScene"
    title="細胞邊界是怎麼取出來的"
    caption="關掉「相減取脊線」看到的是 Voronoi 的距離場，一張以細胞中心為零的碗。碗與碗相接的地方在數值上並不特別，挑不出一條線來。再算一次同樣的東西、把 min 換成平滑的 min，兩者相減，一條沿著細胞邊界的脊線就浮出來了。平滑係數給零時整張圖是全黑，因為那時兩趟算的是同一件事。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2"
    :camera-radius="10"
    :interactive="false"
    :height="260"
  >
    <demo-toggle
      v-model="edgeVisible"
      label="相減取脊線"
    />
    <demo-toggle
      v-model="thresholdVisible"
      label="套上門檻"
    />
    <demo-slider
      v-model="cellScale"
      label="網格密度"
      :min="2"
      :max="16"
      :step="0.5"
      :digit="1"
    />
    <demo-slider
      v-model="cellBlend"
      label="平滑係數"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { WATER_CELL_GLSL, WATER_HASH_GLSL } from './cell-noise'

const edgeVisible = shallowRef(true)
const thresholdVisible = shallowRef(true)
const cellScale = shallowRef(7)
const cellBlend = shallowRef(0.45)

const SHADER_NAME = 'demoCellEdge'

/** 這張圖有多寬多高，UV 要照這個比例拉才不會把細胞壓扁 */
const PLANE_WIDTH = 20
const PLANE_HEIGHT = 9

function registerShader(babylon: BabylonModule) {
  if (babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`])
    return

  babylon.Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = `
    precision highp float;

    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 worldViewProjection;
    varying vec2 vCellUv;

    void main(void) {
      gl_Position = worldViewProjection * vec4(position, 1.0);
      vCellUv = uv;
    }
  `

  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = `
    precision highp float;

    varying vec2 vCellUv;
    uniform float cellTime;
    uniform float cellScale;
    uniform float cellBlend;
    uniform float cellAspect;
    uniform float cellEdgeMode;
    uniform float cellThresholdMode;

    ${WATER_HASH_GLSL}
    ${WATER_CELL_GLSL}

    void main(void) {
      vec2 point = vCellUv * vec2(cellAspect, 1.0) * cellScale;

      float nearest = waterCellDistance(point, cellTime);

      if (cellEdgeMode < 0.5) {
        gl_FragColor = vec4(vec3(nearest), 1.0);
        return;
      }

      float edge = waterCellEdge(point, cellTime, max(cellBlend, 0.0001));

      if (cellThresholdMode > 0.5) {
        float caustic = smoothstep(0.055, 0.095, edge);
        gl_FragColor = vec4(vec3(0.72, 0.95, 1.0) * caustic, 1.0);
        return;
      }

      gl_FragColor = vec4(vec3(edge * 6.0), 1.0);
    }
  `
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  registerShader(babylon)

  scene.clearColor = new babylon.Color4(0.04, 0.05, 0.08, 1)

  const material = new babylon.ShaderMaterial(
    'demo-cell-edge-material',
    scene,
    SHADER_NAME,
    {
      attributes: ['position', 'uv'],
      uniforms: [
        'worldViewProjection',
        'cellTime',
        'cellScale',
        'cellBlend',
        'cellAspect',
        'cellEdgeMode',
        'cellThresholdMode',
      ],
    },
  )
  material.backFaceCulling = false

  const plane = babylon.MeshBuilder.CreatePlane(
    'demo-cell-edge-plane',
    { width: PLANE_WIDTH, height: PLANE_HEIGHT },
    scene,
  )
  plane.material = material
  plane.isPickable = false

  let time = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    time += scene.getEngine().getDeltaTime() / 1000

    material.setFloat('cellTime', time * 0.55)
    material.setFloat('cellScale', cellScale.value)
    material.setFloat('cellBlend', cellBlend.value)
    material.setFloat('cellAspect', PLANE_WIDTH / PLANE_HEIGHT)
    material.setFloat('cellEdgeMode', edgeVisible.value ? 1 : 0)
    material.setFloat('cellThresholdMode', thresholdVisible.value ? 1 : 0)
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}
</script>
