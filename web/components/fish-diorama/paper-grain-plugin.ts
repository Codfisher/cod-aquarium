/** 紙紋材質外掛：把灰階噪點 tile 混進每個面的著色結果。
 *
 * 程序化網格沒有 UV，改用「世界座標三平面投影」（triplanar）：
 * 依面法線的三軸權重，分別從 xy/xz/zy 三個平面取樣噪點再混合，
 * 任何朝向的面都有均勻不拉伸的紋理，並跟著物件移動旋轉。
 * 取樣值以中灰 0.5 為中性，乘在最終顏色上（亮部提亮、暗部壓暗）。
 *
 * 手繪感三層處理：
 * 1. 雙尺度取樣：細顆粒（紙 tooth）混大尺度斑塊（顏料塗抹不均的暈染）。
 * 2. 濃度隨明暗變化：暗部紋理加重、亮部讓紙白透出，像顏料在陰影處堆積。
 * 3. 蠟筆疊色：紋理亮處往暖橘、暗處往藍紫微偏色，呼應場景 split toning。
 */
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines'
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { Scene } from '@babylonjs/core/scene'
import { Material } from '@babylonjs/core/Materials/material'
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { Color3 } from '@babylonjs/core/Maths/math.color'

/** 紋理濃度：最終顏色的明暗起伏 ±(0.5 × 此值) */
const GRAIN_STRENGTH = 2
/** 世界座標 → 紋理座標的縮放：愈大顆粒愈細（1 / 值 = 一個 tile 覆蓋的世界單位） */
const GRAIN_SCALE = 0.22

let sharedGrainTexture: Texture | null = null
/** 輪廓光（rim light）：面向邊緣混入的環境色光，日夜切換時由場景更新 */
let sharedRimColor = new Color3(1, 0.86, 0.63)
let sharedRimStrength = 0.08

/** 材質分層的顆粒個性。全場均一的顆粒參數本身就是均質感的來源——
 * 真實材質的紋理密度天差地遠：岩石粗、葉片細、金屬近乎無紋。
 */
export interface PaperGrainProfile {
  /** 顆粒濃度倍率：岩石 > 1、葉片 < 1、金屬與玻璃趨近 0 */
  strengthScale?: number;
  /** 顆粒尺度倍率：> 1 顆粒更細 */
  scaleScale?: number;
  /** 輪廓光強度倍率 */
  rimStrengthScale?: number;
}

interface PaperGrainMetadata {
  paperGrain?: PaperGrainProfile;
}

/** 指定材質的顆粒個性。在 attachPaperGrainPlugins 前後設定皆可，每幀 bind 時讀取 */
export function setPaperGrainProfile(material: Material, profile: PaperGrainProfile): void {
  const metadata = (material.metadata ?? {}) as PaperGrainMetadata
  metadata.paperGrain = profile
  material.metadata = metadata
}

function readPaperGrainProfile(material: Material): PaperGrainProfile {
  return (material.metadata as PaperGrainMetadata | null)?.paperGrain ?? {}
}

class PaperGrainPlugin extends MaterialPluginBase {
  /** 輪廓光只掛在 StandardMaterial：ShadowOnly 的著色器沒有 vEyePosition */
  private readonly hasRimSupport: boolean
  private readonly targetMaterial: Material

  constructor(material: Material) {
    super(material, 'PaperGrain', 200, { PAPER_GRAIN: false, PAPER_GRAIN_RIM: false })
    this.hasRimSupport = material.getClassName() === 'StandardMaterial'
    this.targetMaterial = material
    this._enable(true)
  }

  override getClassName(): string {
    return 'PaperGrainPlugin'
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines.PAPER_GRAIN = sharedGrainTexture !== null
    // 輪廓光與表面顆粒解耦：low poly 不鋪顆粒，但仍需要輪廓光把切面托出來
    defines.PAPER_GRAIN_RIM = this.hasRimSupport
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('paperGrainSampler')
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'paperGrainStrength', size: 1, type: 'float' },
        { name: 'paperGrainScale', size: 1, type: 'float' },
        { name: 'paperGrainRimColor', size: 3, type: 'vec3' },
        { name: 'paperGrainRimStrength', size: 1, type: 'float' },
      ],
      fragment: `#ifdef PAPER_GRAIN
        uniform float paperGrainStrength;
        uniform float paperGrainScale;
        #endif
        #ifdef PAPER_GRAIN_RIM
        uniform vec3 paperGrainRimColor;
        uniform float paperGrainRimStrength;
        #endif`,
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const profile = readPaperGrainProfile(this.targetMaterial)
    // 輪廓光不依賴表面顆粒，所以無條件寫入——沒鋪顆粒時仍要有輪廓
    if (this.hasRimSupport) {
      uniformBuffer.updateColor3('paperGrainRimColor', sharedRimColor)
      uniformBuffer.updateFloat('paperGrainRimStrength', sharedRimStrength * (profile.rimStrengthScale ?? 1))
    }
    if (sharedGrainTexture) {
      uniformBuffer.updateFloat('paperGrainStrength', GRAIN_STRENGTH * (profile.strengthScale ?? 1))
      uniformBuffer.updateFloat('paperGrainScale', GRAIN_SCALE * (profile.scaleScale ?? 1))
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
        float samplePaperGrain(vec3 positionValue, vec3 weightList, float scale) {
          float grainX = texture2D(paperGrainSampler, positionValue.zy * scale).r;
          float grainY = texture2D(paperGrainSampler, positionValue.xz * scale).r;
          float grainZ = texture2D(paperGrainSampler, positionValue.xy * scale).r;
          return grainX * weightList.x + grainY * weightList.y + grainZ * weightList.z;
        }
        #endif`,
      CUSTOM_FRAGMENT_MAIN_END: `#ifdef PAPER_GRAIN
        {
          vec3 paperWeightList = abs(normalize(vNormalW));
          paperWeightList /= (paperWeightList.x + paperWeightList.y + paperWeightList.z);
          // 細顆粒為主，混入大尺度斑塊：顏料塗抹不均的暈染感
          float paperGrainFine = samplePaperGrain(vPositionW, paperWeightList, paperGrainScale);
          float paperGrainCoarse = samplePaperGrain(vPositionW, paperWeightList, paperGrainScale * 0.3);
          float paperGrainValue = mix(paperGrainFine, paperGrainCoarse, 0.45);
          // 暗部紋理加重、亮部讓紙白透出：像顏料在陰影處堆積
          float paperLuminance = clamp(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
          float paperGrainDelta = (paperGrainValue - 0.5) * paperGrainStrength * mix(1.35, 0.65, paperLuminance);
          gl_FragColor.rgb *= max(0.0, 1.0 + paperGrainDelta);
          // 蠟筆疊色：紋理亮處往暖橘、暗處往藍紫微偏色，表面像多色蠟筆層層疊出來
          vec3 paperTintColor = mix(
            vec3(0.94, 0.96, 1.07),
            vec3(1.06, 1.0, 0.93),
            smoothstep(-0.35, 0.35, paperGrainValue - 0.5)
          );
          gl_FragColor.rgb *= paperTintColor;
        }
        #endif
        // 輪廓光獨立於表面顆粒之外：面向邊緣混入環境色光，把物件從背景托出。
        // flat shading 下呈塊面提亮（面愈側向愈亮），這正是 low poly 讀出切面的關鍵
        #ifdef PAPER_GRAIN_RIM
        {
          vec3 paperViewDirection = normalize(vEyePosition.xyz - vPositionW);
          float paperRimFactor = pow(1.0 - clamp(dot(normalize(vNormalW), paperViewDirection), 0.0, 1.0), 4.0);
          gl_FragColor.rgb += paperGrainRimColor * (paperRimFactor * paperGrainRimStrength);
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

/** 設定輪廓光顏色與強度（日夜切換用）。每幀 bind 時讀取，不需重編譯 */
export function setPaperGrainRimLight(color: Color3, strength: number): void {
  sharedRimColor = color
  sharedRimStrength = strength
}
