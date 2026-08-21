import type { BaseTexture, Material, Scene, UniformBuffer } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 岸線的材質外掛
 *
 * 拿場景深度圖比對「我背後那塊實體有多近」，近的地方畫一道亮線。
 * 材質外掛的完整機制見 EP05，這裡只用它的三個切入點：
 * 頂點的結尾、片段的宣告區，以及漫射色算完的地方
 */

/** 白沫的顏色，偏紅是為了抵銷水的藍色調，落到畫面上才是白的 */
const FOAM_COLOR = '1.7, 1.25, 1.05'

export interface ShorelineState {
  /** 亮線有多寬（世界單位），量的是沿著視線的距離 */
  width: number;
  /** 亮線外面那圈暈的衰減距離 */
  glowWidth: number;
  /** 最亮到什麼程度，零就是整段跳過 */
  strength: number;
  /** 量化成幾階，零代表不量化 */
  stepCount: number;
}

export interface CreateShorelinePluginParam {
  babylon: BabylonModule;
  /** 每一份材質共讀這一組，滑桿改的就是它 */
  state: ShorelineState;
  /** 深度圖是每一幀都可能重建的，所以用函式取而不是存下來 */
  getDepthTexture: () => BaseTexture | null;
}

/**
 * 產生外掛類別
 *
 * MaterialPluginBase 是 Babylon 的匯出，動態 import 進來之前
 * 根本沒有那個基底類別可以繼承，所以包成工廠函式
 */
export function createShorelinePluginClass(
  { babylon, state, getDepthTexture }: CreateShorelinePluginParam,
) {
  return class DemoShorelinePlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性，強弱全由 state 決定 */
      super(material, 'DemoShoreline', 215, {}, true, true)
    }

    getClassName(): string {
      return 'DemoShorelinePlugin'
    }

    getSamplers(samplerList: string[]): void {
      samplerList.push('shoreDepthSampler')
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'shoreParam', size: 4, type: 'vec4' },
          { name: 'shoreScreen', size: 4, type: 'vec4' },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer, scene: Scene): void {
      const depthTexture = getDepthTexture()

      uniformBuffer.updateFloat4(
        'shoreParam',
        state.width,
        state.glowWidth,
        depthTexture ? state.strength : 0,
        state.stepCount,
      )

      /**
       * 深度圖與畫面是同一個尺寸，像素座標除以畫面大小就是取樣座標
       *
       * 每一幀重讀，換視窗大小時才不會錯開
       */
      const engine = scene.getEngine()
      uniformBuffer.updateFloat4(
        'shoreScreen',
        1 / engine.getRenderWidth(),
        1 / engine.getRenderHeight(),
        0,
        0,
      )

      if (depthTexture) {
        uniformBuffer.setTexture('shoreDepthSampler', depthTexture)
      }
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      /**
       * 頂點這邊只準備一件事，視空間的 Z
       *
       * 這一行與 Babylon 深度著色器裡的那一行完全相同，
       * 兩邊比的才會是同一個量
       */
      if (shaderType === 'vertex') {
        return {
          CUSTOM_VERTEX_DEFINITIONS: `
            varying float vShoreViewZ;
          `,
          CUSTOM_VERTEX_MAIN_END: `
            vShoreViewZ = (view * worldPos).z;
          `,
        }
      }

      if (shaderType !== 'fragment')
        return null

      return {
        /**
         * 取樣器與 varying 要自己宣告
         *
         * getSamplers 只是把名字報給 Babylon 去查位置，它不會替你寫那一行。
         * 統一緩衝區裡那兩個 uniform 則是自動生成的，這裡再寫一次就是重複宣告
         */
        CUSTOM_FRAGMENT_DEFINITIONS: `
          uniform sampler2D shoreDepthSampler;
          varying float vShoreViewZ;

          /** 透明度那邊還要再用一次，所以放在外面 */
          float shoreFoamMask = 0.0;
        `,
        /**
         * 疊在漫射色上，而不是最後的成品上
         *
         * 這裡的顏色還沒乘上光照，所以白沫會跟著天色走。
         * 疊在成品上的話，那圈白會在半夜的湖面上自己發亮
         */
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
          if (shoreParam.z > 0.0) {
            float shoreSceneZ = texture2D(shoreDepthSampler, gl_FragCoord.xy * shoreScreen.xy).r;
            float shoreGap = max(shoreSceneZ - vShoreViewZ, 0.0);

            float shoreLine = 1.0 - smoothstep(0.0, shoreParam.x, shoreGap);
            float shoreHalo = exp(-shoreGap / shoreParam.y) * 0.55;
            shoreFoamMask = max(shoreLine, shoreHalo) * shoreParam.z;

            if (shoreParam.w > 0.5) {
              shoreFoamMask = floor(shoreFoamMask * shoreParam.w) / shoreParam.w;
            }

            shoreFoamMask = clamp(shoreFoamMask, 0.0, 1.0);
            baseColor.rgb = mix(baseColor.rgb, vec3(${FOAM_COLOR}), shoreFoamMask);
          }
        `,
        /**
         * 白沫的地方要不透明一點
         *
         * 水本身是半透明的，白沫跟著半透明的話，
         * 水底的沙會從那圈沫裡透出來
         */
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          color.a = min(1.0, color.a + shoreFoamMask * 0.4);
        `,
      }
    }
  }
}
