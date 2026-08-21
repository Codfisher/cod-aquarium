import type {
  DirectionalLight,
  HemisphericLight,
  Mesh,
  Scene,
  StandardMaterial,
  UniformBuffer,
} from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 水面高光的共用場景
 *
 * 陽光的方向與鏡頭的位置在四個範例裡是一樣的，
 * 太陽反在水面上那一點剛好落在畫面中央
 */

/** 貼圖邊長，維持十六格見方的像素味 */
const PIXEL_TEXTURE_SIZE = 16

/**
 * 陽光前進的方向
 *
 * 往鏡頭這一側斜射下來，反射之後正好進到眼睛裡
 */
export const SUN_DIRECTION: readonly [number, number, number] = [0, -0.5, -0.866]

/** 專案裡那三種表面各自的高光強度 */
export const DRY_SPECULAR = 0.02

export const WET_SPECULAR = 0.42

export const WATER_SPECULAR = 0.8

/** 可重現的亂數 */
function createRandom(seed: number) {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

/**
 * 一張帶著顆粒的純色貼圖
 *
 * 最近鄰取樣，維持像素畫的樣子
 */
export function createPixelTexture(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
  color: readonly [number, number, number],
  contrast = 0.28,
) {
  const texture = new babylon.DynamicTexture(
    name,
    { width: PIXEL_TEXTURE_SIZE, height: PIXEL_TEXTURE_SIZE },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  const random = createRandom(20260823)

  const [red, green, blue] = color
  for (let y = 0; y < PIXEL_TEXTURE_SIZE; y++) {
    for (let x = 0; x < PIXEL_TEXTURE_SIZE; x++) {
      const shade = 1 - contrast / 2 + random() * contrast
      context.fillStyle = `rgb(${Math.round(red * shade)}, ${Math.round(green * shade)}, ${Math.round(blue * shade)})`
      context.fillRect(x, y, 1, 1)
    }
  }

  texture.update()
  texture.updateSamplingMode(babylon.Texture.NEAREST_SAMPLINGMODE)

  return texture
}

export interface WaterGlintHandle {
  /** 法線被推歪多少，零等於整片水是一個光學上的平面 */
  setStrength: (value: number) => void;
  /** 波紋的空間頻率 */
  setScale: (value: number) => void;
  /** 取樣座標對齊到幾分之一格，零代表不對齊 */
  setTexelScale: (value: number) => void;
  /** 推動時間，由場景每一幀呼叫 */
  advance: (deltaSecond: number) => void;
}

/**
 * 把水面的法線擾動掛到一份材質上
 *
 * 該動的是法線。法線一歪，那道反日光的高光自己就碎成一片。
 * 材質外掛的機制見 EP05
 */
export function attachWaterGlint(
  babylon: BabylonModule,
  material: StandardMaterial,
): WaterGlintHandle {
  const state = {
    time: 0,
    strength: 1,
    scale: 1,
    texelScale: 0,
  }

  class WaterGlintPlugin extends babylon.MaterialPluginBase {
    getClassName(): string {
      return 'DemoWaterGlintPlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'glintParam', size: 4, type: 'vec4' },
        ],
        fragment: `
          uniform vec4 glintParam;
        `,
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat4(
        'glintParam',
        state.time,
        state.strength,
        state.scale,
        state.texelScale,
      )
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          float demoGlintHeight(vec2 point, float time) {
            return sin(point.x * 1.7 + time * 1.3) * 0.5
              + sin(point.y * 2.3 - time * 1.1) * 0.35
              + sin((point.x + point.y) * 3.1 + time * 1.9) * 0.22
              + sin((point.x - point.y * 1.4) * 4.7 - time * 2.3) * 0.14;
          }
        `,
        /**
         * 光照之前把法線推歪
         *
         * 這個位置 normalW 已經算好、還沒有人用過它，
         * 換掉之後漫射與高光吃到的都是新的那一根
         */
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
          if (glintParam.y > 0.0) {
            vec2 glintPoint = vPositionW.xz * glintParam.z;

            if (glintParam.w > 0.0) {
              glintPoint = floor(glintPoint * glintParam.w) / glintParam.w;
            }

            float glintStep = 0.08;
            float glintCenter = demoGlintHeight(glintPoint, glintParam.x);
            float glintSlopeX = demoGlintHeight(glintPoint + vec2(glintStep, 0.0), glintParam.x) - glintCenter;
            float glintSlopeZ = demoGlintHeight(glintPoint + vec2(0.0, glintStep), glintParam.x) - glintCenter;

            normalW = normalize(
              normalW + vec3(-glintSlopeX, 0.0, -glintSlopeZ) * glintParam.y
            );
          }
        `,
      }
    }
  }

  /** 第六個參數是「一律啟用」，強弱全由 uniform 決定 */
  // eslint-disable-next-line no-new
  new WaterGlintPlugin(material, 'DemoWaterGlint', 215, {}, true, true)

  return {
    setStrength(value) {
      state.strength = value
    },
    setScale(value) {
      state.scale = value
    },
    setTexelScale(value) {
      state.texelScale = value
    },
    advance(deltaSecond) {
      state.time += deltaSecond
    },
  }
}

export interface Studio {
  sun: DirectionalLight;
  ambient: HemisphericLight;
}

/**
 * 基本佈置
 *
 * 光源端的高光給滿，「這個表面有多亮」交還給各自的材質。
 * 這一行是整章的前提
 */
export function createStudio(babylon: BabylonModule, scene: Scene): Studio {
  const sun = new babylon.DirectionalLight(
    'sun',
    new babylon.Vector3(...SUN_DIRECTION),
    scene,
  )
  sun.intensity = 1.1
  sun.diffuse = new babylon.Color3(1, 0.95, 0.86)
  sun.specular = new babylon.Color3(1, 1, 1)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.42
  ambient.diffuse = new babylon.Color3(0.62, 0.72, 0.92)
  ambient.groundColor = new babylon.Color3(0.22, 0.24, 0.26)
  ambient.specular = new babylon.Color3(0, 0, 0)

  return { sun, ambient }
}

export interface WaterStage extends Studio {
  waterMaterial: StandardMaterial;
  glint: WaterGlintHandle;
  dispose: () => void;
}

/**
 * 一池水
 *
 * 水的法線統一朝上，整池水因此是一個光學上的平面，
 * 太陽在上面只反得出一個點
 */
export function createWaterStage(babylon: BabylonModule, scene: Scene): WaterStage {
  const studio = createStudio(babylon, scene)

  const waterMaterial = new babylon.StandardMaterial('water-material', scene)
  waterMaterial.diffuseTexture = createPixelTexture(
    babylon,
    scene,
    'water-texture',
    [52, 108, 158],
    0.16,
  )
  waterMaterial.specularColor = new babylon.Color3(
    WATER_SPECULAR,
    WATER_SPECULAR + 0.02,
    WATER_SPECULAR + 0.05,
  )
  waterMaterial.specularPower = 160

  const water = babylon.MeshBuilder.CreateGround(
    'water',
    { width: 48, height: 48 },
    scene,
  )
  water.material = waterMaterial

  /** 幾顆石頭，才看得出這是一池水而不是一張藍色的紙 */
  const rockMaterial = new babylon.StandardMaterial('rock-material', scene)
  rockMaterial.diffuseTexture = createPixelTexture(babylon, scene, 'rock-texture', [124, 118, 108])
  rockMaterial.specularColor = new babylon.Color3(DRY_SPECULAR, DRY_SPECULAR, DRY_SPECULAR)

  const rockList: Mesh[] = []
  const layout = [
    [-8, -6, 1.6],
    [-5.5, -6.5, 1],
    [7, -4, 1.2],
    [9, 3, 2],
    [-9, 5, 1.4],
  ] as const

  for (const [index, [x, z, size]] of layout.entries()) {
    const rock = babylon.MeshBuilder.CreateBox(`rock-${index}`, { size }, scene)
    rock.position.set(x, size * 0.2, z)
    rock.rotation.y = index * 0.7
    rockList.push(rock)
  }

  const merged = babylon.Mesh.MergeMeshes(rockList, true, true)
  if (merged) {
    merged.name = 'rock'
    merged.material = rockMaterial
    merged.isPickable = false
  }

  const glint = attachWaterGlint(babylon, waterMaterial)
  /** 預設先關掉，範例自己決定要不要推歪法線 */
  glint.setStrength(0)

  const observer = scene.onBeforeRenderObservable.add(() => {
    glint.advance(scene.getEngine().getDeltaTime() / 1000)
  })

  return {
    ...studio,
    waterMaterial,
    glint,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
    },
  }
}

export interface SpherePanel {
  material: StandardMaterial;
  mesh: Mesh;
}

export interface CreateSpherePanelParam {
  babylon: BabylonModule;
  scene: Scene;
  name: string;
  offsetX: number;
  color: readonly [number, number, number];
  specular: number;
  specularPower?: number;
}

/**
 * 一顆用來比高光的球
 *
 * 球面上一定找得到一個方向剛好把太陽反進眼睛裡，
 * 所以不論高光收得多緊都看得到那一點
 */
export function createSpherePanel({
  babylon,
  scene,
  name,
  offsetX,
  color,
  specular,
  specularPower = 64,
}: CreateSpherePanelParam): SpherePanel {
  const material = new babylon.StandardMaterial(`${name}-material`, scene)
  material.diffuseTexture = createPixelTexture(babylon, scene, `${name}-texture`, color)
  material.specularColor = new babylon.Color3(specular, specular, specular)
  material.specularPower = specularPower

  const mesh = babylon.MeshBuilder.CreateSphere(
    name,
    { diameter: 4, segments: 24 },
    scene,
  )
  mesh.position.set(offsetX, 0, 0)
  mesh.material = material

  return { material, mesh }
}
