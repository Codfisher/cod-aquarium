import type { StandardMaterial } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

export interface HeightFogState {
  /** 貼地那一層濁氣的頂，高過這裡就沒有額外的霧 */
  top: number;
  /** 往下加厚的速度，倒數是「幾格內從沒有變成滿」 */
  falloff: number;
  /** 貼著地面時霧要濃多少，這是倍率不是加法 */
  boost: number;
}

/**
 * 換掉場景霧的那一行
 *
 * 原本是 color.rgb = mix(vFogColor, color.rgb, fog)，也就是
 * 「越遠越靠近那一個顏色」。這裡在濃度上再乘一個看高度的倍率，
 * 低處的東西因此比同樣距離的高處更糊。
 *
 * 整段都在 #ifdef FOG 裡面，所以不吃霧的材質一個字都不會被動到。
 * 哪天 Babylon 改了那一行的寫法，正規式會找不到而靜靜地不做事，
 * 畫面退回原本的單色霧，不會壞掉
 */
const FOG_LINE_PATTERN = '!color\\.rgb\\s*=\\s*mix\\(\\s*vFogColor\\s*,\\s*color\\.rgb\\s*,\\s*fog\\s*\\);'

const FOG_LINE_REPLACEMENT = `
  float fogAmount = clamp(1.0 - fog, 0.0, 1.0);
  /** 離濁氣的頂還有多深，越低越接近一 */
  float lowRatio = clamp((demoHeightFog.x - vPositionW.y) * demoHeightFog.y, 0.0, 1.0);
  fogAmount = clamp(fogAmount * (1.0 + lowRatio * demoHeightFog.z), 0.0, 1.0);
  color.rgb = mix(color.rgb, vFogColor, fogAmount);
`

/**
 * 把高度霧掛上一份材質
 *
 * 材質外掛的完整機制見 EP05，這裡只用到它的兩件事：
 * 登記幾個 uniform，以及換掉片段著色器裡的一行
 */
export function attachHeightFog(
  babylon: BabylonModule,
  material: StandardMaterial,
  state: HeightFogState,
) {
  class HeightFogPlugin extends babylon.MaterialPluginBase {
    constructor() {
      /** 第六個參數是「一律啟用」，這個外掛沒有任何開關屬性 */
      super(material, 'DemoHeightFog', 200, {}, true, true)
    }

    getClassName(): string {
      return 'DemoHeightFogPlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'demoHeightFog', size: 3, type: 'vec3' },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: {
      updateFloat3: (name: string, x: number, y: number, z: number) => void;
    }): void {
      uniformBuffer.updateFloat3('demoHeightFog', state.top, state.falloff, state.boost)
    }

    getCustomCode(shaderType: string): Record<string, string> | null {
      if (shaderType !== 'fragment')
        return null

      return { [FOG_LINE_PATTERN]: FOG_LINE_REPLACEMENT }
    }
  }

  return new HeightFogPlugin()
}
