/** 箱庭風格的標準燈光組：冷暖半球天光、主陽光＋陰影、對側補光、假 GI 反彈光。
 *
 * 低多邊 flat shading 之所以不顯死板，靠的就是「每個面隨朝向拿到不同冷暖」，
 * 這組燈是配方的另一半（另一半是後製 split toning）。
 */
import type { Scene } from '@babylonjs/core/scene'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'

/** 四盞燈的預設強度。
 *
 * Babylon 的燈光預設 intensity 都是 1，四盞加起來會把淺色材質推到純白——
 * 箱庭因為畫布透明、疊在中等深度的 CSS 漸層上還撐得住，
 * 遊戲場景是不透明的淺色背景，同一組強度就整片曝掉。
 *
 * 抓法：朝上的面吃得到半球天光全力加主光約 0.85 的入射餘弦，
 * 兩者相加要讓最亮的紙色（沙色 #e2c49a，最大分量 0.886）落在 1.0 附近不溢出。
 * 0.5 + 0.82 × 0.85 ≈ 1.2，乘上色值約 1.06，再由後製曝光 0.92 收回到 0.98。
 */
const DEFAULT_HEMISPHERIC_INTENSITY = 0.5
const DEFAULT_SUN_INTENSITY = 0.82
const DEFAULT_FILL_INTENSITY = 0.28
const DEFAULT_BOUNCE_INTENSITY = 0.18

export interface DioramaLightingOptions {
  namePrefix: string;
  /** 陰影貼圖解析度。大場景可調高，小舞台 1024 已足夠 */
  shadowMapSize?: number;
  /** 陰影濃度（0 = 全黑、1 = 無影） */
  shadowDarkness?: number;
  /** 主光方向。預設由左上前方打下 */
  sunDirection?: Vector3;
  /** 主光位置，決定陰影投射範圍中心 */
  sunPosition?: Vector3;
  /** 整體曝光縮放。場景用色偏深就調高、偏淺就調低，四盞燈等比縮放不破壞冷暖平衡 */
  intensityScale?: number;
}

export interface DioramaLighting {
  hemisphericLight: HemisphericLight;
  sunLight: DirectionalLight;
  fillLight: DirectionalLight;
  bounceLight: DirectionalLight;
  shadowGenerator: ShadowGenerator;
  /** 把網格加入投影者清單（可傳多個） */
  addShadowCaster: (...meshList: Parameters<ShadowGenerator['addShadowCaster']>[0][]) => void;
  dispose: () => void;
}

export function createDioramaLighting(
  scene: Scene,
  options: DioramaLightingOptions,
): DioramaLighting {
  const {
    namePrefix,
    shadowMapSize = 1024,
    shadowDarkness = 0.45,
    sunDirection = new Vector3(-0.45, -1, -0.35).normalize(),
    sunPosition = new Vector3(7, 12, 6),
    intensityScale = 1,
  } = options

  const hemisphericLight = new HemisphericLight(
    `${namePrefix}HemisphericLight`,
    new Vector3(0.2, 1, 0.1),
    scene,
  )
  // 天光偏暖橘、地光偏藍紫，讓每個面隨朝向產生冷暖明暗層次
  hemisphericLight.diffuse = new Color3(1, 0.9, 0.74)
  hemisphericLight.groundColor = new Color3(0.33, 0.32, 0.52)
  hemisphericLight.intensity = DEFAULT_HEMISPHERIC_INTENSITY * intensityScale
  hemisphericLight.specular = new Color3(0, 0, 0)

  const sunLight = new DirectionalLight(`${namePrefix}SunLight`, sunDirection, scene)
  sunLight.position = sunPosition
  sunLight.diffuse = new Color3(1, 0.9, 0.76)
  sunLight.intensity = DEFAULT_SUN_INTENSITY * intensityScale
  // 紙不反光。少了這行，淺色材質的高光會在主光方向糊成一片白斑
  sunLight.specular = new Color3(0, 0, 0)

  // 對側藍紫補光，讓背光面不死黑、立體感更明確
  const fillLight = new DirectionalLight(
    `${namePrefix}FillLight`,
    new Vector3(0.5, -0.55, 0.45).normalize(),
    scene,
  )
  fillLight.diffuse = new Color3(0.58, 0.56, 0.92)
  fillLight.specular = new Color3(0, 0, 0)
  fillLight.intensity = DEFAULT_FILL_INTENSITY * intensityScale

  // 假 GI：地面反彈光。由下往上的暖沙色低強度平行光，
  // 近似陽光打在地面後的一次間接反射，物體底面不再死暗
  const bounceLight = new DirectionalLight(
    `${namePrefix}BounceLight`,
    new Vector3(0.15, 1, 0.1).normalize(),
    scene,
  )
  bounceLight.diffuse = Color3.FromHexString('#e2c49a')
  bounceLight.specular = new Color3(0, 0, 0)
  bounceLight.intensity = DEFAULT_BOUNCE_INTENSITY * intensityScale

  const shadowGenerator = new ShadowGenerator(shadowMapSize, sunLight)
  shadowGenerator.usePercentageCloserFiltering = true
  // 陰影不全黑：留近半環境光，柔和陰天的影子
  shadowGenerator.setDarkness(shadowDarkness)

  return {
    hemisphericLight,
    sunLight,
    fillLight,
    bounceLight,
    shadowGenerator,
    addShadowCaster(...meshList) {
      for (const mesh of meshList) {
        shadowGenerator.addShadowCaster(mesh)
      }
    },
    dispose() {
      shadowGenerator.dispose()
      bounceLight.dispose()
      fillLight.dispose()
      sunLight.dispose()
      hemisphericLight.dispose()
    },
  }
}
