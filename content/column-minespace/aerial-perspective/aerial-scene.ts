import type {
  Mesh,
  Scene,
  StandardMaterial,
  UniformBuffer,
} from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 大氣透視的共用場景
 *
 * 一片往遠處退開的山脊、一張天空背板，加上場景內建的線性霧。
 * 四個範例都站在同一個地方看同一片山，差別只在霧怎麼算
 */

/** 山脊有幾排，最後一排差不多剛好落在霧的終點上 */
const RIDGE_ROW_COUNT = 12

/** 兩排山脊之間隔幾格 */
const RIDGE_ROW_GAP = 11

/** 第一排離原點多遠，太近會擋住後面全部的山 */
const RIDGE_ROW_START = 20

/** 一顆山塊多寬 */
const RIDGE_BLOCK_SIZE = 7

/** 一排橫向擺幾顆，要鋪滿整個畫面的寬度 */
const RIDGE_COLUMN_LIMIT = 18

/** 天空背板的漸層切成幾段 */
const SKY_STOP_COUNT = 24

export interface SkyPreset {
  name: string;
  /** 霧色，也就是最遠處收斂到的顏色 */
  fogColor: readonly [number, number, number];
  /** 天頂的顏色 */
  skyTopColor: readonly [number, number, number];
  /** 地平線附近的顏色 */
  skyHorizonColor: readonly [number, number, number];
  /** 中空的天色，中距離那層空氣要往這個顏色偏 */
  skyMidColor: readonly [number, number, number];
  /** 陽光的顏色 */
  sunColor: readonly [number, number, number];
}

/**
 * 三個時刻
 *
 * 中距離的空氣色不必另外調，直接拿日夜循環已經算好的中空天色來用。
 * 中午是藍、清晨是丁香紫、黃昏是橘，顏色自己就對了
 */
export const SKY_PRESET_LIST: readonly SkyPreset[] = [
  {
    name: '清晨',
    fogColor: [0.86, 0.82, 0.86],
    skyTopColor: [0.36, 0.4, 0.66],
    skyHorizonColor: [0.93, 0.74, 0.72],
    skyMidColor: [0.62, 0.56, 0.8],
    sunColor: [1, 0.88, 0.86],
  },
  {
    name: '正午',
    fogColor: [0.9, 0.92, 0.94],
    skyTopColor: [0.26, 0.5, 0.86],
    skyHorizonColor: [0.74, 0.85, 0.96],
    skyMidColor: [0.4, 0.62, 0.9],
    sunColor: [1, 0.98, 0.92],
  },
  {
    name: '黃昏',
    fogColor: [0.92, 0.8, 0.7],
    skyTopColor: [0.24, 0.28, 0.52],
    skyHorizonColor: [0.99, 0.66, 0.36],
    skyMidColor: [0.9, 0.52, 0.3],
    sunColor: [1, 0.82, 0.6],
  },
]

/** 在兩個時刻之間取中間值，滑桿才拉得順 */
export function mixPreset(ratio: number): SkyPreset {
  const clamped = Math.min(SKY_PRESET_LIST.length - 1.0001, Math.max(0, ratio))
  const index = Math.floor(clamped)
  const blend = clamped - index
  const from = SKY_PRESET_LIST[index]!
  const to = SKY_PRESET_LIST[index + 1]!

  function mixColor(
    left: readonly [number, number, number],
    right: readonly [number, number, number],
  ): readonly [number, number, number] {
    return [
      left[0] + (right[0] - left[0]) * blend,
      left[1] + (right[1] - left[1]) * blend,
      left[2] + (right[2] - left[2]) * blend,
    ]
  }

  return {
    name: blend < 0.5 ? from.name : to.name,
    fogColor: mixColor(from.fogColor, to.fogColor),
    skyTopColor: mixColor(from.skyTopColor, to.skyTopColor),
    skyHorizonColor: mixColor(from.skyHorizonColor, to.skyHorizonColor),
    skyMidColor: mixColor(from.skyMidColor, to.skyMidColor),
    sunColor: mixColor(from.sunColor, to.sunColor),
  }
}

/** 太陽仰角低於這個值，貼地濃度給滿 */
export const GROUND_HAZE_LOW_SUN_HEIGHT = 0.12

/** 太陽仰角高過這個值，貼地濃度收回基準值 */
export const GROUND_HAZE_HIGH_SUN_HEIGHT = 0.55

/** 正午前後的貼地濃度基準值 */
export const GROUND_HAZE_BOOST_BASE = 0.6

/** 晨昏貼地濃度加到這麼濃 */
export const GROUND_HAZE_BOOST_DAWN_DUSK = 1.15

/**
 * 依太陽仰角算出貼地濁氣要加濃多少
 *
 * 低於 0.12 給滿，高過 0.55 收回基準值，中間用 smoothstep 的多項式接起來，
 * 太陽爬升的過程才不會看出一道分界
 */
export function computeGroundHazeBoost(sunHeight: number): number {
  const ratio = (sunHeight - GROUND_HAZE_LOW_SUN_HEIGHT)
    / (GROUND_HAZE_HIGH_SUN_HEIGHT - GROUND_HAZE_LOW_SUN_HEIGHT)
  const clamped = Math.min(1, Math.max(0, ratio))
  const smooth = clamped * clamped * (3 - 2 * clamped)

  return GROUND_HAZE_BOOST_DAWN_DUSK
    + (GROUND_HAZE_BOOST_BASE - GROUND_HAZE_BOOST_DAWN_DUSK) * smooth
}

/** 可重現的亂數，山脊每次重整都長一樣 */
function createRandom(seed: number) {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

export interface AerialPerspectiveHandle {
  /** 中距離那層空氣的顏色 */
  setMidColor: (color: readonly [number, number, number]) => void;
  /** 貼地濁氣的頂、往下加厚的速度、以及要濃多少 */
  setGroundHaze: (top: number, falloff: number, boost: number) => void;
}

/**
 * 把大氣透視掛到一份材質上
 *
 * 這裡最值得看的是注入點那個字串。它以驚嘆號開頭，
 * 對 Babylon 來說代表「這是一條正規式」，
 * 找到符合的那一段就整段換掉。材質外掛的機制見 EP05
 */
export function attachAerialPerspective(
  babylon: BabylonModule,
  material: StandardMaterial,
): AerialPerspectiveHandle {
  const state = {
    midRed: 0.9,
    midGreen: 0.92,
    midBlue: 0.94,
    groundTop: 10,
    groundFalloff: 1 / 12,
    groundBoost: 0,
  }

  class AerialPerspectivePlugin extends babylon.MaterialPluginBase {
    getClassName(): string {
      return 'DemoAerialPerspectivePlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'aerialMidColor', size: 3, type: 'vec3' },
          { name: 'aerialGround', size: 3, type: 'vec3' },
        ],
        fragment: `
          uniform vec3 aerialMidColor;
          uniform vec3 aerialGround;
        `,
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat3('aerialMidColor', state.midRed, state.midGreen, state.midBlue)
      uniformBuffer.updateFloat3(
        'aerialGround',
        state.groundTop,
        state.groundFalloff,
        state.groundBoost,
      )
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      /**
       * 換掉霧的那一行
       *
       * 原本是 color.rgb = mix(vFogColor, color.rgb, fog)，
       * 也就是「越遠越靠近那一個顏色」。這裡改成兩段，
       * 先依距離調出這一段空氣該是什麼顏色，再依距離決定蓋多濃
       */
      return {
        '!color\\.rgb\\s*=\\s*mix\\(\\s*vFogColor\\s*,\\s*color\\.rgb\\s*,\\s*fog\\s*\\);': `
          float aerialAmount = clamp(1.0 - fog, 0.0, 1.0);
          float aerialLow = clamp((aerialGround.x - vPositionW.y) * aerialGround.y, 0.0, 1.0);
          aerialAmount = clamp(aerialAmount * (1.0 + aerialLow * aerialGround.z), 0.0, 1.0);
          color.rgb = mix(color.rgb, mix(aerialMidColor, vFogColor, aerialAmount), aerialAmount);
        `,
      }
    }
  }

  /** 第六個參數是「一律啟用」，這個外掛沒有任何開關屬性 */
  // eslint-disable-next-line no-new
  new AerialPerspectivePlugin(material, 'DemoAerialPerspective', 200, {}, true, true)

  return {
    setMidColor(color) {
      state.midRed = color[0]
      state.midGreen = color[1]
      state.midBlue = color[2]
    },
    setGroundHaze(top, falloff, boost) {
      state.groundTop = top
      state.groundFalloff = falloff
      state.groundBoost = boost
    },
  }
}

export interface SkyBackdrop {
  /** 換掉天空的兩個顏色，會重畫那張漸層 */
  update: (
    topColor: readonly [number, number, number],
    horizonColor: readonly [number, number, number],
  ) => void;
}

/**
 * 天空背板
 *
 * 一張立在遠處的漸層，材質關掉霧。
 * 遠處的山比它還淡的那個現象，要有這片天當對照才看得出來
 */
export function createSkyBackdrop(babylon: BabylonModule, scene: Scene): SkyBackdrop {
  const texture = new babylon.DynamicTexture(
    'sky-texture',
    { width: 4, height: 128 },
    scene,
    true,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  const material = new babylon.StandardMaterial('sky-material', scene)
  material.diffuseTexture = texture
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(1, 1, 1)
  material.disableLighting = true
  material.backFaceCulling = false
  /** 天空本身不吃霧，不然它會往自己的顏色收一次 */
  material.fogEnabled = false

  const plane = babylon.MeshBuilder.CreatePlane(
    'sky',
    { width: 560, height: 300 },
    scene,
  )
  plane.position.set(0, 70, 215)
  plane.isPickable = false

  plane.material = material

  function update(
    topColor: readonly [number, number, number],
    horizonColor: readonly [number, number, number],
  ) {
    const gradient = context.createLinearGradient(0, 0, 0, 128)

    for (let index = 0; index <= SKY_STOP_COUNT; index++) {
      const ratio = index / SKY_STOP_COUNT
      /** 地平線那一段收得比較急，天色才不會像一條斜坡 */
      const curve = ratio ** 0.6
      const red = topColor[0] + (horizonColor[0] - topColor[0]) * curve
      const green = topColor[1] + (horizonColor[1] - topColor[1]) * curve
      const blue = topColor[2] + (horizonColor[2] - topColor[2]) * curve

      gradient.addColorStop(
        ratio,
        `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`,
      )
    }

    context.fillStyle = gradient
    context.fillRect(0, 0, 4, 128)
    texture.update()
  }

  return { update }
}

export interface RidgeWorld {
  /** 每一份山脊材質上那個外掛，範例都靠它調參數 */
  aerialList: AerialPerspectiveHandle[];
  sky: SkyBackdrop;
  applyPreset: (preset: SkyPreset, midStrength: number) => void;
  /**
   * 換一個太陽仰角
   *
   * 水平方向維持原本的角度，只調直射光的俯仰。傳入值只是控制量，
   * 正規化之後才是文章裡說的那個仰角，所以回傳正規化後的
   * `-sunLight.direction.y`，門檻 0.12、0.55 要拿這個回傳值去比對
   */
  setSunHeight: (sunHeight: number) => number;
}

export interface CreateRidgeWorldParam {
  babylon: BabylonModule;
  scene: Scene;
  /** 霧從幾格開始、幾格收滿 */
  fogStart?: number;
  fogEnd?: number;
}

/**
 * 一片往遠處退開的山脊
 *
 * 每一排是一整條合併過的網格，十五排剛好鋪到霧的終點。
 * 排與排之間的高度刻意錯開，低處才有「山谷」可以積濁氣
 */
export function createRidgeWorld({
  babylon,
  scene,
  fogStart = 12,
  fogEnd = 150,
}: CreateRidgeWorldParam): RidgeWorld {
  scene.fogMode = babylon.Scene.FOGMODE_LINEAR
  scene.fogStart = fogStart
  scene.fogEnd = fogEnd
  scene.fogColor = new babylon.Color3(0.9, 0.92, 0.94)

  const sun = new babylon.DirectionalLight(
    'sun',
    new babylon.Vector3(-0.4, -0.62, 0.68),
    scene,
  )
  sun.intensity = 1.15
  sun.specular = new babylon.Color3(0, 0, 0)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.55
  ambient.specular = new babylon.Color3(0, 0, 0)

  const aerialList: AerialPerspectiveHandle[] = []
  const random = createRandom(20260822)

  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.3, 0.34, 0.26)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  aerialList.push(attachAerialPerspective(babylon, groundMaterial))

  const ground = babylon.MeshBuilder.CreateGround(
    'ground',
    { width: 420, height: 420 },
    scene,
  )
  ground.position.z = 80
  ground.material = groundMaterial

  const ridgeMaterial = new babylon.StandardMaterial('ridge-material', scene)
  ridgeMaterial.diffuseColor = new babylon.Color3(0.24, 0.3, 0.22)
  ridgeMaterial.specularColor = new babylon.Color3(0, 0, 0)
  aerialList.push(attachAerialPerspective(babylon, ridgeMaterial))

  for (let row = 0; row < RIDGE_ROW_COUNT; row++) {
    const z = RIDGE_ROW_START + row * RIDGE_ROW_GAP
    const blockList: Mesh[] = []

    /**
     * 越遠的那一排越高
     *
     * 眼前的一排要矮到看得過去，遠方那幾道才有山的份量。
     * 這是層層退開的山脊那種畫面的來源
     */
    const heightScale = 0.45 + row * 0.15

    for (let column = -RIDGE_COLUMN_LIMIT; column <= RIDGE_COLUMN_LIMIT; column++) {
      /** 兩道週期不同的正弦疊出起伏，再灑一點亂數 */
      const shape = Math.sin(column * 0.42 + row * 0.9) * 0.5
        + Math.sin(column * 0.17 - row * 0.35) * 0.5
      const height = Math.round((3 + shape * 7) * heightScale + random() * 2)
      if (height <= 0)
        continue

      const block = babylon.MeshBuilder.CreateBox(
        `ridge-${row}-${column}`,
        { width: RIDGE_BLOCK_SIZE, height, depth: RIDGE_BLOCK_SIZE },
        scene,
      )
      block.position.set(column * RIDGE_BLOCK_SIZE, height / 2, z + random() * 3)
      blockList.push(block)
    }

    const merged = babylon.Mesh.MergeMeshes(blockList, true, true)
    if (merged) {
      merged.name = `ridge-row-${row}`
      merged.material = ridgeMaterial
      merged.isPickable = false
    }
  }

  const sky = createSkyBackdrop(babylon, scene)

  /**
   * 換一個時刻
   *
   * midStrength 是中距離那層空氣往天色偏多少。給零就退回單色霧，
   * 那正是 Babylon 內建的樣子
   */
  function applyPreset(preset: SkyPreset, midStrength: number) {
    scene.fogColor.set(preset.fogColor[0], preset.fogColor[1], preset.fogColor[2])
    sun.diffuse.set(preset.sunColor[0], preset.sunColor[1], preset.sunColor[2])
    ambient.diffuse.set(
      preset.skyMidColor[0] * 0.7 + 0.3,
      preset.skyMidColor[1] * 0.7 + 0.3,
      preset.skyMidColor[2] * 0.7 + 0.3,
    )

    const midColor: [number, number, number] = [
      preset.fogColor[0] + (preset.skyMidColor[0] - preset.fogColor[0]) * midStrength,
      preset.fogColor[1] + (preset.skyMidColor[1] - preset.fogColor[1]) * midStrength,
      preset.fogColor[2] + (preset.skyMidColor[2] - preset.fogColor[2]) * midStrength,
    ]

    for (const aerial of aerialList) {
      aerial.setMidColor(midColor)
    }

    sky.update(preset.skyTopColor, preset.skyHorizonColor)
  }

  /**
   * 換一個太陽仰角
   *
   * 水平分量維持原本那顆太陽的方向，只改直射光的俯仰再重新正規化。
   * 正規化會讓 y 分量除以向量長度，傳入的 sunHeight 不等於正規化後的結果，
   * 所以回傳真正的仰角，呼叫端要拿這個回傳值去算貼地濃度
   */
  function setSunHeight(sunHeight: number): number {
    sun.direction.set(-0.4, -sunHeight, 0.68)
    sun.direction.normalize()

    return -sun.direction.y
  }

  return { aerialList, sky, applyPreset, setSunHeight }
}
