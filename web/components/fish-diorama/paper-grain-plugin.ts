/** 紙紋材質外掛：把灰階噪點 tile 混進每個面的著色結果。
 *
 * 程序化網格沒有 UV，改用「世界座標三平面投影」（triplanar）：
 * 依面法線的三軸權重，分別從 xy/xz/zy 三個平面取樣噪點再混合，
 * 任何朝向的面都有均勻不拉伸的紋理，並跟著物件移動旋轉。
 * 取樣值以中灰 0.5 為中性，乘在最終顏色上（亮部提亮、暗部壓暗）。
 */
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines'
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { Scene } from '@babylonjs/core/scene'
import { Material } from '@babylonjs/core/Materials/material'
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'

/** 紋理濃度：最終顏色的明暗起伏 ±(0.5 × 此值) */
const GRAIN_STRENGTH = 2
/** 世界座標 → 紋理座標的縮放：愈大顆粒愈細（1 / 值 = 一個 tile 覆蓋的世界單位） */
const GRAIN_SCALE = 0.22

let sharedGrainTexture: Texture | null = null

class PaperGrainPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'PaperGrain', 200, { PAPER_GRAIN: false })
    this._enable(true)
  }

  override getClassName(): string {
    return 'PaperGrainPlugin'
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines.PAPER_GRAIN = sharedGrainTexture !== null
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('paperGrainSampler')
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'paperGrainStrength', size: 1, type: 'float' },
        { name: 'paperGrainScale', size: 1, type: 'float' },
      ],
      fragment: `#ifdef PAPER_GRAIN
        uniform float paperGrainStrength;
        uniform float paperGrainScale;
        #endif`,
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    if (sharedGrainTexture) {
      uniformBuffer.updateFloat('paperGrainStrength', GRAIN_STRENGTH)
      uniformBuffer.updateFloat('paperGrainScale', GRAIN_SCALE)
      uniformBuffer.setTexture('paperGrainSampler', sharedGrainTexture)
    }
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') {
      return null
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef PAPER_GRAIN
        uniform sampler2D paperGrainSampler;
        #endif`,
      CUSTOM_FRAGMENT_MAIN_END: `#ifdef PAPER_GRAIN
        {
          vec3 paperWeightList = abs(normalize(vNormalW));
          paperWeightList /= (paperWeightList.x + paperWeightList.y + paperWeightList.z);
          float paperGrainX = texture2D(paperGrainSampler, vPositionW.zy * paperGrainScale).r;
          float paperGrainY = texture2D(paperGrainSampler, vPositionW.xz * paperGrainScale).r;
          float paperGrainZ = texture2D(paperGrainSampler, vPositionW.xy * paperGrainScale).r;
          float paperGrainValue = paperGrainX * paperWeightList.x
            + paperGrainY * paperWeightList.y
            + paperGrainZ * paperWeightList.z;
          gl_FragColor.rgb *= 1.0 + (paperGrainValue - 0.5) * paperGrainStrength;
        }
        #endif`,
    }
  }
}

/** 在「材質首次用於渲染前」把外掛掛到場景所有受光的 StandardMaterial。
 * Babylon 的 material plugin 必須在材質首次編譯前掛上，之後才能靠 define 開關；
 * 此時 PAPER_GRAIN 為 false，不影響原本的著色成本。
 * disableLighting 的材質（點擊漣漪、眼睛高光）著色器沒有 vNormalW，跳過。
 */
export function attachPaperGrainPlugins(scene: Scene): void {
  // ShadowOnlyMaterial（地板陰影）的著色器也有注入點與 vNormalW/vPositionW，
  // 一併掛上讓陰影同樣帶紙紋
  const eligibleClassNameList = ['StandardMaterial', 'ShadowOnlyMaterial']
  const pluginList: PaperGrainPlugin[] = []
  for (const material of scene.materials) {
    if (!eligibleClassNameList.includes(material.getClassName())) {
      continue
    }
    if ((material as StandardMaterial).disableLighting) {
      continue
    }
    pluginList.push(new PaperGrainPlugin(material))
  }
}

/** 灰階紙紋 texture 就緒後呼叫：翻開 PAPER_GRAIN define，讓已掛外掛的材質重編譯生效 */
export function setPaperGrainTexture(scene: Scene, grainTexture: Texture): void {
  sharedGrainTexture = grainTexture
  scene.markAllMaterialsAsDirty(Material.AllDirtyFlag)
}
