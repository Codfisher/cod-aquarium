<template>
  <demo-frame
    :setup="setupScene"
    title="疊色順序決定白沫亮不亮"
    caption="漫射色還沒乘上光照，疊在這裡的白沫會跟著天色一起變暗，這是正確的那條路。切到「疊在最終成品」再打開夜晚，白沫維持著正午的亮度，像是自己在湖面上發光。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="19"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="finalColorMixEnabled"
      label="疊在最終成品"
    />
    <demo-toggle
      v-model="isNight"
      label="夜晚"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BaseTexture, Material, Scene, UniformBuffer } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSceneDepth, createShoreScene } from './shore-scene'

/** 疊在最終成品，也就是文章裡說的那個錯誤示範 */
const finalColorMixEnabled = shallowRef(false)
const isNight = shallowRef(false)

/** 亮線寬度與外圈暈，固定給一組看得清楚的值就好，這支範例的重點不在這裡 */
const LINE_WIDTH = 0.34
const GLOW_WIDTH = 0.8
const SHORELINE_STRENGTH = 0.85

const DAY_SUN_INTENSITY = 1.15
const DAY_AMBIENT_INTENSITY = 0.72
/** 夜晚沒有關到全黑，留一點點月色，湖面才看得出形狀 */
const NIGHT_SUN_INTENSITY = 0.06
const NIGHT_AMBIENT_INTENSITY = 0.1

interface CreateLayerPluginParam {
  babylon: BabylonModule;
  /** 深度圖每次建立可能是新的一份，所以用函式取而不是存值 */
  getDepthTexture: () => BaseTexture | null;
}

/**
 * 這支的白沫疊色寫成兩條路，用 layerParam.w 切換
 *
 * 0：疊在 CUSTOM_FRAGMENT_UPDATE_DIFFUSE，也就是漫射色，還沒乘上光照
 * 1：疊在 CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR，也就是光照算完的最終成品
 *
 * 兩條路共用同一份 gap 計算，唯一的差別只有「插在管線的哪個位置」
 */
function createLayerPluginClass({ babylon, getDepthTexture }: CreateLayerPluginParam) {
  return class DemoShorelineLayerPlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      super(material, 'DemoShorelineLayer', 217, {}, true, true)
    }

    getClassName(): string {
      return 'DemoShorelineLayerPlugin'
    }

    getSamplers(samplerList: string[]): void {
      samplerList.push('layerDepthSampler')
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'layerParam', size: 4, type: 'vec4' },
          { name: 'layerScreen', size: 4, type: 'vec4' },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer, scene: Scene): void {
      const depthTexture = getDepthTexture()

      uniformBuffer.updateFloat4(
        'layerParam',
        LINE_WIDTH,
        GLOW_WIDTH,
        depthTexture ? SHORELINE_STRENGTH : 0,
        finalColorMixEnabled.value ? 1 : 0,
      )

      const engine = scene.getEngine()
      uniformBuffer.updateFloat4(
        'layerScreen',
        1 / engine.getRenderWidth(),
        1 / engine.getRenderHeight(),
        0,
        0,
      )

      if (depthTexture) {
        uniformBuffer.setTexture('layerDepthSampler', depthTexture)
      }
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType === 'vertex') {
        return {
          CUSTOM_VERTEX_DEFINITIONS: `
            varying float vLayerViewZ;
          `,
          CUSTOM_VERTEX_MAIN_END: `
            vLayerViewZ = (view * worldPos).z;
          `,
        }
      }

      if (shaderType !== 'fragment')
        return null

      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          uniform sampler2D layerDepthSampler;
          varying float vLayerViewZ;

          float layerFoamMask = 0.0;
        `,
        /** layerParam.w 是 0 才在這裡疊，也就是正確的那條路 */
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
          if (layerParam.z > 0.0) {
            float layerSceneZ = texture2D(layerDepthSampler, gl_FragCoord.xy * layerScreen.xy).r;
            float layerGap = max(layerSceneZ - vLayerViewZ, 0.0);

            float layerLine = 1.0 - smoothstep(0.0, layerParam.x, layerGap);
            float layerHalo = exp(-layerGap / layerParam.y) * 0.55;
            layerFoamMask = clamp(max(layerLine, layerHalo) * layerParam.z, 0.0, 1.0);

            if (layerParam.w < 0.5) {
              baseColor.rgb = mix(baseColor.rgb, vec3(1.7, 1.25, 1.05), layerFoamMask);
            }
          }
        `,
        /** layerParam.w 是 1 才在這裡疊，光照已經算完了，白沫不會再跟著變暗 */
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          if (layerParam.w > 0.5) {
            color.rgb = mix(color.rgb, vec3(1.7, 1.25, 1.05), layerFoamMask);
          }
          color.a = min(1.0, color.a + layerFoamMask * 0.4);
        `,
      }
    }
  }
}

/** 白天與夜晚的天色，夜晚留一點點藍，湖面的輪廓才不會整片沒入黑裡 */
const DAY_CLEAR_COLOR: [number, number, number, number] = [0.63, 0.77, 0.92, 1]
const NIGHT_CLEAR_COLOR: [number, number, number, number] = [0.03, 0.05, 0.1, 1]

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context

  const { waterMaterial, sun, ambient } = createShoreScene(context)
  let depthTexture: BaseTexture | null = createSceneDepth(context).getDepthMap()

  const PluginClass = createLayerPluginClass({
    babylon,
    getDepthTexture: () => depthTexture,
  })
  // eslint-disable-next-line no-new
  new PluginClass(waterMaterial)

  const stopNightWatch = watch(isNight, (night) => {
    sun.intensity = night ? NIGHT_SUN_INTENSITY : DAY_SUN_INTENSITY
    ambient.intensity = night ? NIGHT_AMBIENT_INTENSITY : DAY_AMBIENT_INTENSITY
    scene.clearColor = new babylon.Color4(...(night ? NIGHT_CLEAR_COLOR : DAY_CLEAR_COLOR))
  }, { immediate: true })

  return () => {
    stopNightWatch()
    depthTexture = null
  }
}
</script>
