import {
  Camera,
  Color3,
  Color4,
  Constants,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Material,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  UniversalCamera,
  Vector3,
  VertexData,
} from '@babylonjs/core'
import { SkyMaterial } from '@babylonjs/materials'
import { useEventListener } from '@vueuse/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { CAMPFIRE_POSITION } from '../domains/world/structure-generator'
import { getGroundY } from '../domains/world/world-access'
import { SEA_LEVEL, WORLD_SIZE } from '../domains/world/world-constants'
import { CAVE_PATH, SPAWN_POSITION } from '../domains/world/world-generator'
import { createSeededRandom } from '../utils/noise'
import { useGraphicsQuality } from './use-graphics-quality'

export interface InitParams {
  canvas: HTMLCanvasElement;
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
}

interface UseBabylonSceneParam {
  createEngine?: (param: Omit<InitParams, 'camera' | 'scene' | 'engine'>) => Promise<Engine>;
  createScene?: (param: Omit<InitParams, 'camera' | 'scene'>) => Scene;
  createCamera?: (param: Omit<InitParams, 'camera'>) => UniversalCamera;
  init?: (param: InitParams) => Promise<void>;
}

export const SUN_LIGHT_NAME = 'sun-directional'
export const AMBIENT_LIGHT_NAME = 'ambient-hemispheric'
export const SKYBOX_NAME = 'sky-dome'
export const OVERCAST_NAME = 'overcast-dome'
export const SUN_DISC_NAME = 'sun-disc'
export const SUN_GLOW_NAME = 'sun-glow'
export const CLOUD_LAYER_NAME = 'cloud-layer'

/**
 * 繪製順序分成三層
 *
 * Babylon 一律先畫完不透明再畫半透明，所以雲（不透明）永遠比太陽（相加混合）早畫，
 * 兩者只能靠深度決勝負——太陽掛在一百格外、雲卻遠得多，
 * 於是雲被太陽從中間切開，看起來像太陽插在雲裡面。
 *
 * 改成分層繪製：天空層畫完才畫雲，雲畫完才畫天氣粒子。
 * 各層之間不清除深度，地形擋住雲、雲擋住太陽的關係都還在，
 * 只有先後順序被固定下來
 */
const CLOUD_RENDERING_GROUP = 1
/** 天氣粒子畫在最後，雨絲才不會被陰天罩蓋掉 */
export const WEATHER_RENDERING_GROUP = 2

/** 雲層高度 */
const CLOUD_HEIGHT = 78
/** 單朵雲方塊的邊長 */
const CLOUD_CELL_SIZE = 26
/** 雲的厚度 */
const CLOUD_THICKNESS = 7
/** 雲的飄移速度（格 / 秒） */
const CLOUD_DRIFT_SPEED = 0.6
/**
 * 單一朵雲最多幾格
 *
 * 一格 26 單位，上限 22 格大約是 130 x 150 單位，
 * 抬頭看是一朵有頭有尾的雲；再大就會連成一片蓋住整片天
 */
const MAX_CLOUD_CELL_COUNT = 22

/** 地表的天空與霧氣顏色 */
export const SKY_COLOR = new Color3(0.58, 0.76, 0.94)

/**
 * 太陽方向（光線前進的方向）
 *
 * 方位定成「雪山 → 出生點 → 太陽」連成一線：
 * 太陽掛在出生點後方，從出生點望過去整面山是受光的正面，
 * 而不是逆著光只看到一片剪影。
 * 仰角壓低成午後的斜射光，影子才拉得長，方塊的三個面亮度也才拉得開
 */
export const SUN_DIRECTION = new Vector3(0.666, -0.62, -0.416).normalize()

/**
 * 晴天的環境光強度
 *
 * 這是背光面唯一的光源，太低的話沒照到太陽的那幾面會全黑。
 * 但補太多整個世界會像打了無影燈，方塊的立體感全被抹平，
 * 所以環境光只補到看得見細節，剩下的交給陽光與環境遮蔽拉開層次
 */
export const AMBIENT_INTENSITY = 0.82
/** 晴天的陽光強度 */
export const SUN_INTENSITY = 1.3

/** 外海往世界外圍延伸的距離，大到看不見盡頭 */
const OPEN_SEA_MARGIN = 900
/** 外海海床的高度，與島邊的海床同高 */
const SEA_FLOOR_LEVEL = 5.5
/** 與方塊海水同一張的水面動畫圖，六張畫格直向排列 */
const ANIMATED_WATER_TEXTURE_PATH = '/assets/minecraft-mini8x/default_water_source_animated.png'
const WATER_FRAME_COUNT = 6
const WATER_FRAME_RATE = 3.5
/** 單一畫格的邊長（像素） */
const WATER_FRAME_SIZE = 8

/** 建立一張可平鋪的外海水面貼圖，內容由動畫圖逐格複製過來 */
function createOpenSeaTexture(name: string, scene: Scene, frameSource: HTMLImageElement): DynamicTexture {
  const texture = new DynamicTexture(
    name,
    { width: WATER_FRAME_SIZE, height: WATER_FRAME_SIZE },
    scene,
    true,
  )
  /**
   * 遠處改用三線性過濾與非等向性過濾
   *
   * 方塊要的是硬邊，所以島上一律用 NEAREST；
   * 但這片水鋪了近千格，遠方每個像素涵蓋成百上千張貼圖，
   * NEAREST 不會在 mipmap 層級之間內插，
   * 於是不同距離各自落在不同層級，海面被切成一條一條深淺不同的橫帶
   */
  texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE)
  texture.anisotropicFilteringLevel = 8

  frameSource.addEventListener('load', () => drawWaterFrame(texture, frameSource, 0), { once: true })

  return texture
}

/** 把動畫圖的第 frameIndex 張畫格複製到貼圖上 */
function drawWaterFrame(
  texture: DynamicTexture,
  frameSource: HTMLImageElement,
  frameIndex: number,
): void {
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, WATER_FRAME_SIZE, WATER_FRAME_SIZE)
  context.drawImage(
    frameSource,
    0,
    frameIndex * WATER_FRAME_SIZE,
    WATER_FRAME_SIZE,
    WATER_FRAME_SIZE,
    0,
    0,
    WATER_FRAME_SIZE,
    WATER_FRAME_SIZE,
  )
  texture.update()
}

const defaultParam: Required<UseBabylonSceneParam> = {
  /**
   * 一律使用 WebGL2
   *
   * WebGPU 在部分裝置上會出現難以重現的異常，
   * 這個場景也吃不到 WebGPU 的效能優勢，穩定優先。
   */
  async createEngine({ canvas }) {
    return new Engine(canvas, true, {
      antialias: true,
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)

    scene.clearColor = new Color4(SKY_COLOR.r, SKY_COLOR.g, SKY_COLOR.b, 1)

    /**
     * 環境補光（不投射陰影）
     *
     * 天空色由上往下、地面反射色由下往上，
     * 方塊的頂面、側面、底面才會有三層不同的亮度
     */
    const ambientLight = new HemisphericLight(
      AMBIENT_LIGHT_NAME,
      new Vector3(0, 1, 0),
      scene,
    )
    ambientLight.intensity = AMBIENT_INTENSITY
    /**
     * 天空偏冷、地面反射偏暖
     *
     * 陽光是暖的，補光是冷的，兩者的色溫差就是畫面活起來的關鍵；
     * 全部都用同一種白光，再多層次也只會是灰階的濃淡
     */
    ambientLight.diffuse = new Color3(0.78, 0.88, 1)
    /**
     * 由下往上的地面反射色
     *
     * 背光面全靠這道光，太暗會黑成一片。
     * 立體感交給烘進方塊的環境遮蔽去做，不必靠壓暗背光面換取
     */
    ambientLight.groundColor = new Color3(0.82, 0.77, 0.72)
    ambientLight.specular = new Color3(0, 0, 0)

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = SKY_COLOR.clone()
    scene.fogStart = 60
    scene.fogEnd = 280

    /** 各層之間保留深度，地形擋住雲、雲擋住太陽的關係才不會被清掉 */
    scene.setRenderingAutoClearDepthStencil(CLOUD_RENDERING_GROUP, false)
    scene.setRenderingAutoClearDepthStencil(WEATHER_RENDERING_GROUP, false)

    createSkyDome(scene)
    createSunDisc(scene)
    createCloudLayer(scene)
    createOvercastDome(scene)
    createOpenSea(scene)
    createCaveLights(scene)
    createCaveDrips(scene)

    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new UniversalCamera(
      'roam-camera',
      new Vector3(SPAWN_POSITION.x, SEA_LEVEL + 8, SPAWN_POSITION.z),
      scene,
    )

    /** 出生就面向西北方的森林 */
    camera.setTarget(new Vector3(SPAWN_POSITION.x - 20, SEA_LEVEL + 6, SPAWN_POSITION.z - 20))

    camera.attachControl(canvas, true)
    camera.minZ = 0.1
    /** 要看得到延伸到天邊的海面 */
    camera.maxZ = 1200
    /** 擴大 FOV 讓視野寬廣一些（預設 0.8） */
    camera.fov = 1.15
    updateCameraFovMode(camera, canvas)

    return camera
  },
  init: () => Promise.resolve(),
}

/**
 * 天空罩
 *
 * SkyMaterial 會依大氣散射參數即時算出天色，
 * 比單一底色多了地平線漸層與太陽光暈，天氣變化也只要調參數
 */
function createSkyDome(scene: Scene) {
  const skyMaterial = new SkyMaterial('sky-material', scene)
  skyMaterial.backFaceCulling = false
  /** 天空不吃霧氣，否則整片天會被霧染成一塊死板的顏色 */
  skyMaterial.fogEnabled = false
  skyMaterial.useSunPosition = true
  skyMaterial.sunPosition = SUN_DIRECTION.scale(-120)
  skyMaterial.luminance = 0.55
  skyMaterial.turbidity = 6
  skyMaterial.rayleigh = 1.6
  /** 把大氣散射的太陽壓到幾乎看不見，太陽改由方形貼圖負責 */
  skyMaterial.mieCoefficient = 0.0005
  skyMaterial.mieDirectionalG = 0.05

  /**
   * 天空罩不寫深度
   *
   * 這個盒子邊長只有 260，跟著鏡頭走，所以永遠在一百三十格外。
   * 它照常寫深度的話，比它遠的東西全部會被擋掉——
   * 外海鋪了近千格，超過一百三十格的部分整片消失，
   * 露出來的就是天空罩地平線以下那塊深藍。
   * 那正是「遠方海面顏色不一樣」的真正原因：那根本不是海，是天空。
   *
   * 天空罩是所有東西的背景，關掉深度寫入，
   * 它就只負責填底色，不會擋住任何東西
   */
  skyMaterial.disableDepthWrite = true

  const skyDome = MeshBuilder.CreateBox(SKYBOX_NAME, { size: 260 }, scene)
  skyDome.material = skyMaterial
  skyDome.infiniteDistance = true
  skyDome.isPickable = false
  skyDome.applyFog = false

  return skyMaterial
}

/** 取得場景中的天空材質 */
export function getSkyMaterial(scene: Scene): SkyMaterial | null {
  const skyDome = scene.getMeshByName(SKYBOX_NAME)
  return (skyDome?.material as SkyMaterial | undefined) ?? null
}

/**
 * Minecraft 風格的方形太陽
 *
 * SkyMaterial 自己會算出一顆帶光暈的圓太陽，那太寫實了。
 * 把它的散射壓掉，改掛一張正方形貼圖，才是方塊世界該有的太陽
 */
function createSunDisc(scene: Scene) {
  /** 太陽本體：一張純白的方形貼圖，用 NEAREST 取樣保住硬邊 */
  const size = 16
  const texture = new DynamicTexture(SUN_DISC_NAME, { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = 'rgba(255, 250, 230, 1)'
  context.fillRect(0, 0, size, size)
  texture.update()

  const material = new StandardMaterial(`${SUN_DISC_NAME}-material`, scene)
  material.emissiveTexture = texture
  /** 拉高自發光讓它衝過泛光門檻，太陽才有在發亮的感覺 */
  material.emissiveColor = new Color3(2.4, 2.3, 2)
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  material.disableLighting = true
  material.fogEnabled = false
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_ADD
  material.alpha = 0.999
  /** 太陽是天空的一部分，不留下深度，雲才蓋得住它 */
  material.disableDepthWrite = true

  const disc = MeshBuilder.CreatePlane(SUN_DISC_NAME, { size: 7.5 }, scene)
  disc.material = material
  /** 掛在天上固定的方位，跟著鏡頭走但不隨鏡頭轉 */
  disc.position = SUN_DIRECTION.scale(-110)
  disc.infiniteDistance = true
  disc.billboardMode = Mesh.BILLBOARDMODE_ALL
  disc.isPickable = false
  disc.applyFog = false

  createSunGlow(scene)

  return material
}

/** 太陽外圍的光暈，讓方形太陽不至於像貼上去的白紙 */
function createSunGlow(scene: Scene) {
  const size = 128
  const texture = new DynamicTexture(SUN_GLOW_NAME, { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 248, 214, 0.85)')
  gradient.addColorStop(0.35, 'rgba(255, 242, 196, 0.3)')
  gradient.addColorStop(1, 'rgba(255, 238, 190, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()

  const material = new StandardMaterial(`${SUN_GLOW_NAME}-material`, scene)
  material.emissiveTexture = texture
  material.emissiveColor = new Color3(1.4, 1.35, 1.2)
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  material.disableLighting = true
  material.fogEnabled = false
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_ADD
  material.alpha = 0.999
  /** 光暈跟太陽本體一樣不留深度，否則雲邊會被光暈糊掉一圈 */
  material.disableDepthWrite = true

  const glow = MeshBuilder.CreatePlane(SUN_GLOW_NAME, { size: 24 }, scene)
  glow.material = material
  glow.position = SUN_DIRECTION.scale(-112)
  glow.infiniteDistance = true
  glow.billboardMode = Mesh.BILLBOARDMODE_ALL
  glow.isPickable = false
  glow.applyFog = false

  return material
}

/**
 * Minecraft 風格的雲層
 *
 * 每一朵雲都是實際的方塊，不是貼圖，所以看得到厚度與側面。
 * 用 thin instance 一次畫完幾千個方塊，成本只有一個 draw call。
 * 這層雲同時也是投影者，地面上會有雲影慢慢掃過
 */
function createCloudLayer(scene: Scene) {
  /** 圖樣本身的格數，整片雲是這張圖樣平鋪出來的 */
  const patternCount = 32
  /** 平鋪幾份，鋪得夠大才不會在霧裡看到雲的邊界 */
  const tileCount = 3

  const random = createSeededRandom('minespace-cloud')
  /**
   * 初始填充率
   *
   * 平滑規則會把孤立的格子吃掉，起始值太低整片天最後只剩零星幾朵，
   * 一抬頭常常什麼都沒有。填到接近一半，收斂後才是「多雲」該有的覆蓋率
   */
  let cellList = Array.from({ length: patternCount * patternCount }, () => random() < 0.46)

  const readCell = (grid: boolean[], x: number, z: number) => {
    /** 座標繞回去，圖樣才能無縫平鋪 */
    const wrappedX = ((x % patternCount) + patternCount) % patternCount
    const wrappedZ = ((z % patternCount) + patternCount) % patternCount
    return grid[wrappedZ * patternCount + wrappedX] === true
  }

  /** 平滑幾輪，讓零散的格子聚成一朵一朵的雲 */
  for (let pass = 0; pass < 4; pass++) {
    const nextList = cellList.slice()
    for (let x = 0; x < patternCount; x++) {
      for (let z = 0; z < patternCount; z++) {
        let neighborCount = 0
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            if (offsetX === 0 && offsetZ === 0)
              continue
            if (readCell(cellList, x + offsetX, z + offsetZ))
              neighborCount++
          }
        }
        nextList[z * patternCount + x] = neighborCount > 4
          || (neighborCount === 4 && readCell(cellList, x, z))
      }
    }
    cellList = nextList
  }

  /**
   * 把過大的雲團削小
   *
   * 平滑規則會讓相鄰的雲黏成一片，覆蓋率一高就連成一大塊蓋住半邊天。
   * 這裡標記出每一團的大小，只對超標的那幾團由外往內剝一圈，
   * 剝到符合上限為止：大塊會縮小，細長的一團也會自然斷成幾朵
   */
  const labelComponentSizeList = (grid: boolean[]): number[] => {
    const labelList = Array.from({ length: grid.length }, () => -1)
    const sizeList: number[] = []

    for (let index = 0; index < grid.length; index++) {
      if (!grid[index] || labelList[index] !== -1)
        continue

      const label = sizeList.length
      const queue = [index]
      labelList[index] = label
      let size = 0

      for (let head = 0; head < queue.length; head++) {
        const current = queue[head]!
        size++
        const x = current % patternCount
        const z = Math.floor(current / patternCount)

        for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nextX = ((x + step[0]!) % patternCount + patternCount) % patternCount
          const nextZ = ((z + step[1]!) % patternCount + patternCount) % patternCount
          const nextIndex = nextZ * patternCount + nextX
          if (!grid[nextIndex] || labelList[nextIndex] !== -1)
            continue

          labelList[nextIndex] = label
          queue.push(nextIndex)
        }
      }

      sizeList.push(size)
    }

    return labelList.map((label) => (label === -1 ? 0 : sizeList[label]!))
  }

  for (let pass = 0; pass < 6; pass++) {
    const sizeList = labelComponentSizeList(cellList)
    if (sizeList.every((size) => size <= MAX_CLOUD_CELL_COUNT))
      break

    const nextList = cellList.slice()
    for (let x = 0; x < patternCount; x++) {
      for (let z = 0; z < patternCount; z++) {
        const index = z * patternCount + x
        if (sizeList[index]! <= MAX_CLOUD_CELL_COUNT)
          continue

        /** 只剝外圍那一圈 */
        const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some((step) => !readCell(cellList, x + step[0]!, z + step[1]!))
        if (isEdge) {
          nextList[index] = false
        }
      }
    }
    cellList = nextList
  }

  const material = new StandardMaterial(`${CLOUD_LAYER_NAME}-material`, scene)
  material.diffuseColor = new Color3(0, 0, 0)
  material.emissiveColor = new Color3(1, 1, 1)
  material.specularColor = new Color3(0, 0, 0)
  material.disableLighting = true
  material.backFaceCulling = true
  /** 半透明的雲，飛過頭頂時還看得到後面的天色 */
  material.alpha = 0.72
  /**
   * 先寫一次深度再上色
   *
   * 少了這一步，同一片雲自己的前後面會互相疊色，
   * 邊緣會出現一塊深一塊淺的髒污
   */
  material.needDepthPrePass = true

  /**
   * 整片雲是一個網格，只畫露在外面的那些面
   *
   * 原本每一格都是獨立的方塊，相鄰兩格之間那兩片牆照樣畫出來，
   * 隔著半透明的雲面看過去就是一格一格的框線交錯在一起，
   * 看起來像用積木拼的而不是一朵雲。
   * 這裡照方塊世界的面剔除做法：鄰居是空的才畫那一面
   */
  const halfCount = (patternCount * tileCount) / 2
  const positionList: number[] = []
  const normalList: number[] = []
  const indexList: number[] = []

  const addQuad = (
    cornerList: [number, number, number][],
    normal: [number, number, number],
  ) => {
    const baseIndex = positionList.length / 3
    for (const corner of cornerList) {
      positionList.push(corner[0], corner[1], corner[2])
      normalList.push(normal[0], normal[1], normal[2])
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  const isFilled = (x: number, z: number) => {
    if (x < -halfCount || x >= halfCount || z < -halfCount || z >= halfCount)
      return false
    return readCell(cellList, x, z)
  }

  const halfThickness = CLOUD_THICKNESS / 2
  for (let x = -halfCount; x < halfCount; x++) {
    for (let z = -halfCount; z < halfCount; z++) {
      if (!isFilled(x, z))
        continue

      const minX = x * CLOUD_CELL_SIZE
      const maxX = minX + CLOUD_CELL_SIZE
      const minZ = z * CLOUD_CELL_SIZE
      const maxZ = minZ + CLOUD_CELL_SIZE

      addQuad([
        [minX, halfThickness, minZ],
        [minX, halfThickness, maxZ],
        [maxX, halfThickness, maxZ],
        [maxX, halfThickness, minZ],
      ], [0, 1, 0])

      addQuad([
        [minX, -halfThickness, maxZ],
        [minX, -halfThickness, minZ],
        [maxX, -halfThickness, minZ],
        [maxX, -halfThickness, maxZ],
      ], [0, -1, 0])

      if (!isFilled(x - 1, z)) {
        addQuad([
          [minX, halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, -halfThickness, maxZ],
          [minX, halfThickness, maxZ],
        ], [-1, 0, 0])
      }
      if (!isFilled(x + 1, z)) {
        addQuad([
          [maxX, halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, -halfThickness, minZ],
          [maxX, halfThickness, minZ],
        ], [1, 0, 0])
      }
      if (!isFilled(x, z - 1)) {
        addQuad([
          [maxX, halfThickness, minZ],
          [maxX, -halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, halfThickness, minZ],
        ], [0, 0, -1])
      }
      if (!isFilled(x, z + 1)) {
        addQuad([
          [minX, halfThickness, maxZ],
          [minX, -halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, halfThickness, maxZ],
        ], [0, 0, 1])
      }
    }
  }

  const cloudMesh = new Mesh(CLOUD_LAYER_NAME, scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.indices = indexList
  vertexData.applyToMesh(cloudMesh)
  /** 雲畫在天空層之後，太陽只能整顆躲在雲後面 */
  cloudMesh.renderingGroupId = CLOUD_RENDERING_GROUP

  cloudMesh.material = material
  cloudMesh.isPickable = false
  cloudMesh.receiveShadows = false
  cloudMesh.applyFog = false
  cloudMesh.position.set(WORLD_SIZE / 2, CLOUD_HEIGHT, WORLD_SIZE / 2)

  /**
   * 飄移
   *
   * 圖樣每 patternCount 格重複一次，位移滿一個週期就回到完全相同的排列，
   * 所以直接取餘數歸零，看不出接縫
   */
  const driftPeriod = patternCount * CLOUD_CELL_SIZE
  let elapsed = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    cloudMesh.position.x = WORLD_SIZE / 2 + ((elapsed * CLOUD_DRIFT_SPEED) % driftPeriod)
  })

  return material
}

/** 取得雲層材質 */
export function getCloudMaterialList(scene: Scene): StandardMaterial[] {
  const material = scene.getMeshByName(CLOUD_LAYER_NAME)?.material as StandardMaterial | undefined
  return material ? [material] : []
}

/** 取得太陽本體與光暈的材質 */
export function getSunMaterialList(scene: Scene): StandardMaterial[] {
  return [SUN_DISC_NAME, SUN_GLOW_NAME]
    .map((name) => scene.getMeshByName(name)?.material as StandardMaterial | undefined)
    .filter((material): material is StandardMaterial => !!material)
}

/**
 * 陰天罩
 *
 * 光靠調暗 SkyMaterial 沒辦法讓太陽消失，太陽是它算出來的一部分。
 * 直接在天空外面再罩一層灰，下雨時淡入把整片天蓋掉，就是名副其實的陰天
 */
function createOvercastDome(scene: Scene) {
  const material = new StandardMaterial('overcast-material', scene)
  material.disableLighting = true
  material.emissiveColor = new Color3(0.62, 0.65, 0.7)
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  material.backFaceCulling = false
  material.fogEnabled = false
  material.alpha = 0
  /**
   * 陰天罩不留深度
   *
   * 它罩在鏡頭外一百多格，照常寫深度的話，
   * 比它遠的半透明東西全部會被判定為擋住而消失
   */
  material.disableDepthWrite = true

  const dome = MeshBuilder.CreateBox(OVERCAST_NAME, { size: 250 }, scene)
  dome.material = material
  /** 跟雲同一層，而且畫在雲之後，陰天時灰罩才蓋得住雲 */
  dome.renderingGroupId = CLOUD_RENDERING_GROUP
  dome.infiniteDistance = true
  dome.isPickable = false
  dome.applyFog = false

  return material
}

/** 取得陰天罩的材質 */
export function getOvercastMaterial(scene: Scene): StandardMaterial | null {
  const dome = scene.getMeshByName(OVERCAST_NAME)
  return (dome?.material as StandardMaterial | undefined) ?? null
}

/**
 * 外海
 *
 * 島只有 128 格，方塊做的海到邊界就沒了。
 * 鋪一片大到看不見盡頭的水面接在後面，海平線才會落在霧氣裡而不是虛空
 */
function createOpenSea(scene: Scene) {
  /**
   * 外海鋪成環繞世界的四塊，中間讓給方塊海水
   *
   * 若用一整片蓋過去，這片水面會從島的內部橫切過去，
   * 山腹裡的洞穴會被一片藍色平面攔腰截斷
   */
  /** 對齊島上方塊海水的水面：方塊頂面再矮八分之一格 */
  const seaLevel = SEA_LEVEL + 0.5 - 0.125
  /**
   * 方塊世界的實際邊界
   *
   * 方塊中心在整數座標，所以第一格的外緣是 -0.5、最後一格的外緣是 WORLD_SIZE - 0.5。
   * 外海若從 0 與 WORLD_SIZE 起算，兩邊各會空出半格，
   * 那條縫看下去是海床，就是海面上那條黑線
   */
  const worldMin = -0.5
  const worldMax = WORLD_SIZE - 0.5
  const worldCenter = (worldMin + worldMax) / 2
  const worldSpan = worldMax - worldMin
  const outerSize = worldSpan + OPEN_SEA_MARGIN * 2
  const bandList = [
    { width: outerSize, depth: OPEN_SEA_MARGIN, x: worldCenter, z: worldMin - OPEN_SEA_MARGIN / 2 },
    { width: outerSize, depth: OPEN_SEA_MARGIN, x: worldCenter, z: worldMax + OPEN_SEA_MARGIN / 2 },
    { width: OPEN_SEA_MARGIN, depth: worldSpan, x: worldMin - OPEN_SEA_MARGIN / 2, z: worldCenter },
    { width: OPEN_SEA_MARGIN, depth: worldSpan, x: worldMax + OPEN_SEA_MARGIN / 2, z: worldCenter },
  ]

  const materialList: StandardMaterial[] = []

  /**
   * 海床
   *
   * 島上的海水是半透明方塊疊在深色海床上，看到的是兩者混色的結果。
   * 外海若只鋪一片不透明的水，顏色永遠對不上，交界必定有一條線。
   * 這裡照著島上的做法先鋪一層海床，水再半透明疊上去，混色方式完全相同
   */
  /**
   * 外海的水面用的是與方塊海水完全相同的那幾張畫格
   *
   * 之前外海貼的是另一張靜態的 default_water.png，
   * 島上的方塊海水播的卻是 default_water_source_animated 的六張畫格，
   * 兩張圖的平均亮度本來就不一樣，接縫處自然對不上。
   * 這裡把動畫圖的當前畫格逐格複製到一張 8x8 的畫布上，
   * 平鋪與捲動都能照常做，顏色則保證一模一樣
   */
  const frameSource = new Image()
  frameSource.src = ANIMATED_WATER_TEXTURE_PATH
  const textureList: DynamicTexture[] = []

  let elapsed = 0
  let currentFrame = -1
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    /** 慢慢捲動，遠遠看過去才是活的 */
    for (const texture of textureList) {
      texture.uOffset = (elapsed * 0.05) % 1
      texture.vOffset = (elapsed * 0.03) % 1
    }

    const nextFrame = Math.floor(elapsed * WATER_FRAME_RATE) % WATER_FRAME_COUNT
    if (nextFrame === currentFrame || !frameSource.complete)
      return

    currentFrame = nextFrame
    for (const texture of textureList) {
      drawWaterFrame(texture, frameSource, currentFrame)
    }
  })

  const bedMaterial = new StandardMaterial('open-sea-bed', scene)
  /** 對齊島邊海床的礫石亮度：default_gravel.png 的平均值就是 0.642 */
  bedMaterial.diffuseColor = new Color3(0.642, 0.642, 0.642)
  bedMaterial.specularColor = new Color3(0, 0, 0)

  for (const [index, band] of bandList.entries()) {
    const bed = MeshBuilder.CreateGround(
      `open-sea-bed-${index}`,
      { width: band.width, height: band.depth },
      scene,
    )
    bed.material = bedMaterial
    bed.position.set(band.x, SEA_FLOOR_LEVEL, band.z)
    bed.isPickable = false
    bed.receiveShadows = false

    /**
     * 每一塊各配一份貼圖
     *
     * 四塊的長寬差了好幾倍，共用一份貼圖的話 uScale 只能取一個值，
     * 每塊的貼圖密度就會差到十倍，交界處便出現筆直的分隔線。
     * 改成一格一張，密度與島上的方塊海水完全一致
     */
    const texture = createOpenSeaTexture(`open-sea-texture-${index}`, scene, frameSource)
    texture.uScale = band.width
    texture.vScale = band.depth
    textureList.push(texture)

    const material = new StandardMaterial(`open-sea-${index}`, scene)
    material.diffuseTexture = texture
    /** 與方塊海水同一組色調與透明度，混色結果才會一致 */
    material.diffuseColor = new Color3(0.55, 0.78, 1)
    material.specularColor = new Color3(0.08, 0.08, 0.08)
    material.alpha = 0.72
    material.transparencyMode = Material.MATERIAL_ALPHABLEND
    /**
     * 兩面都要畫
     *
     * 剔除背面的話，潛到水裡抬頭看到的是這片水面的底面，
     * 整片外海會直接消失，只剩海床往外延伸到天邊
     */
    material.backFaceCulling = false

    const sea = MeshBuilder.CreateGround(
      `open-sea-${index}`,
      { width: band.width, height: band.depth },
      scene,
    )
    sea.material = material
    sea.position.set(band.x, seaLevel, band.z)
    sea.isPickable = false
    sea.receiveShadows = false

    materialList.push(material)
  }

  return materialList
}

/**
 * 洞穴裡的光
 *
 * 燈石的光已經由 Worker 烘進方塊表面，這幾盞只負責整體的空間感：
 * 洞口一盞冷色的光模擬透進來的天光，通道與洞窟各補一點暖色的層次
 */
function createCaveLights(scene: Scene) {
  const entrance = CAVE_PATH[0]
  const chamber = CAVE_PATH[CAVE_PATH.length - 1]
  if (!entrance || !chamber)
    return

  /** 洞口：偏冷的天光，看起來像從外面透進來的 */
  const mouthLight = new PointLight(
    'cave-mouth-light',
    new Vector3(entrance.x, entrance.y, entrance.z),
    scene,
  )
  mouthLight.diffuse = new Color3(0.8, 0.88, 1)
  mouthLight.specular = new Color3(0, 0, 0)
  mouthLight.intensity = 0.8
  mouthLight.range = 30

  /** 通道中段：兩盞暖光，對應牆上的柱燈 */
  for (const index of [2, 4]) {
    const point = CAVE_PATH[index]
    if (!point)
      continue

    const light = new PointLight(
      `cave-tunnel-light-${index}`,
      new Vector3(point.x, point.y, point.z),
      scene,
    )
    light.diffuse = new Color3(1, 0.82, 0.56)
    light.specular = new Color3(0, 0, 0)
    light.intensity = 0.85
    light.range = 24
  }

  /** 洞窟深處：暖光當作指引 */
  const chamberLight = new PointLight(
    'cave-chamber-light',
    new Vector3(chamber.x, chamber.y + 1, chamber.z),
    scene,
  )
  chamberLight.diffuse = new Color3(1, 0.84, 0.6)
  chamberLight.specular = new Color3(0, 0, 0)
  chamberLight.intensity = 0.9
  chamberLight.range = 38
}

/**
 * 洞頂滴水
 *
 * 洞裡有滴水的音效卻看不到水滴，聲音就會顯得很憑空。
 * 在通道與洞窟各放一組粒子，從洞頂落下
 */
function createCaveDrips(scene: Scene) {
  const size = 16
  const texture = new DynamicTexture('cave-drip-texture', { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(210, 235, 255, 0.95)')
  gradient.addColorStop(1, 'rgba(190, 225, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  for (const index of [2, 3, 4, 5]) {
    const point = CAVE_PATH[index]
    if (!point)
      continue

    const particleSystem = new ParticleSystem(`cave-drip-${index}`, 60, scene)
    particleSystem.particleTexture = texture
    particleSystem.emitter = new Vector3(point.x, point.y + point.radius - 1.2, point.z)
    /** 從洞頂一小片區域隨機落下 */
    particleSystem.minEmitBox = new Vector3(-point.radius * 0.6, 0, -point.radius * 0.6)
    particleSystem.maxEmitBox = new Vector3(point.radius * 0.6, 0, point.radius * 0.6)
    particleSystem.color1 = new Color4(0.82, 0.92, 1, 0.9)
    particleSystem.color2 = new Color4(0.7, 0.85, 1, 0.7)
    particleSystem.colorDead = new Color4(0.7, 0.85, 1, 0)
    particleSystem.minSize = 0.07
    particleSystem.maxSize = 0.13
    particleSystem.minScaleY = 2.2
    particleSystem.maxScaleY = 3.4
    particleSystem.minLifeTime = 0.5
    particleSystem.maxLifeTime = 1.1
    particleSystem.emitRate = 7
    particleSystem.gravity = new Vector3(0, -22, 0)
    particleSystem.direction1 = new Vector3(0, -1, 0)
    particleSystem.direction2 = new Vector3(0, -1, 0)
    particleSystem.minEmitPower = 0.2
    particleSystem.maxEmitPower = 0.6
    particleSystem.updateSpeed = 0.02
    particleSystem.billboardMode = ParticleSystem.BILLBOARDMODE_Y
    particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
    particleSystem.start()
  }
}

/** 火焰動畫的畫格數與播放速度 */
const FLAME_FRAME_COUNT = 4
const FLAME_FRAME_RATE = 7

/**
 * 畫一張 Minecraft 風格的像素火焰
 *
 * 底部寬而亮、往上收成幾道細火舌，背景全透明。
 * 每一格的高度由固定的波形決定，換畫格時整排火舌上下抽動，
 * 不做漸層也不做柔邊，維持方塊世界的硬邊像素感
 */
function drawFlameFrame(context: CanvasRenderingContext2D, size: number, frameIndex: number): void {
  context.clearRect(0, 0, size, size)

  /** 由下往上：白黃、亮黃、橘、暗紅 */
  const colorList = ['#fff3c4', '#ffd24a', '#f28a1c', '#c73f12']

  for (let column = 0; column < size; column++) {
    /** 中間高、兩側低，再疊一道會跑的波，火舌才會左右竄動 */
    const center = 1 - Math.abs(column - (size - 1) / 2) / (size / 2)
    const wave = Math.sin((column + frameIndex * 2.4) * 0.9) * 0.18
      + Math.sin((column * 2.3 - frameIndex * 1.7)) * 0.1
    const height = Math.max(2, Math.round((center * 0.78 + 0.2 + wave) * size))

    for (let row = 0; row < height; row++) {
      /** row 由下往上數，越高顏色越冷 */
      const ratio = row / Math.max(1, height - 1)
      const colorIndex = Math.min(colorList.length - 1, Math.floor(ratio * colorList.length))
      context.fillStyle = colorList[colorIndex]!
      context.fillRect(column, size - 1 - row, 1, 1)
    }
  }
}

/**
 * 營火的火焰
 *
 * 與 Minecraft 同一套做法：兩片交叉的立板貼上像素火焰貼圖，
 * 用 alpha test 把背景整個丟掉，再逐格換貼圖做出跳動。
 * 粒子做出來的是寫實的煙火，跟方塊世界格格不入
 */
function createCampfireFlame(scene: Scene, x: number, groundY: number, z: number): void {
  const size = 16
  const texture = new DynamicTexture(
    'campfire-flame-texture',
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  drawFlameFrame(context, size, 0)
  texture.update()
  texture.hasAlpha = true

  const material = new StandardMaterial('campfire-flame-material', scene)
  material.diffuseTexture = texture
  material.emissiveTexture = texture
  material.useAlphaFromDiffuseTexture = true
  material.transparencyMode = Material.MATERIAL_ALPHATEST
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  /**
   * 火自己會發光，不吃場景光照
   *
   * 自發光給滿即可，讓火焰以貼圖原本的顏色全亮呈現。
   * 千萬別開 useEmissiveAsIllumination：那會讓自發光跳過貼圖直接加在最後，
   * 最終顏色又夾在 1 以內，整團火會被洗成一塊白，只剩下火舌的輪廓
   */
  material.emissiveColor = new Color3(1, 1, 1)
  material.disableLighting = true
  material.backFaceCulling = false

  /** 火焰底部貼著餘燼的頂面 */
  const emberTopY = groundY - 0.5
  const flameHeight = 1.15

  for (const [index, angle] of [Math.PI / 4, -Math.PI / 4].entries()) {
    const plane = MeshBuilder.CreatePlane(
      `campfire-flame-${index}`,
      { width: 1.05, height: flameHeight },
      scene,
    )
    plane.material = material
    plane.rotation.y = angle
    plane.position.set(x, emberTopY + flameHeight / 2, z)
    plane.isPickable = false
    plane.receiveShadows = false
  }

  let elapsed = 0
  let currentFrame = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    const nextFrame = Math.floor(elapsed * FLAME_FRAME_RATE) % FLAME_FRAME_COUNT
    if (nextFrame === currentFrame)
      return

    currentFrame = nextFrame
    drawFlameFrame(context, size, currentFrame)
    texture.update()
  })
}

/**
 * 營火的火焰與煙
 *
 * 火焰是兩片交叉的像素立板，煙則是一顆顆硬邊的灰方塊往上飄。
 * 火堆高度得等世界生成完才知道，所以由外面帶 worldState 進來
 */
export function createCampfireSmoke(scene: Scene, worldState: Uint8Array): void {
  const { x, z } = CAMPFIRE_POSITION
  const groundY = getGroundY(worldState, x, z)

  createCampfireFlame(scene, x, groundY, z)

  /**
   * 煙的貼圖：一塊硬邊的像素方塊
   *
   * Minecraft 的煙是一顆一顆看得出邊界的方塊，
   * 柔邊漸層做出來的是寫實的煙霧，跟方塊世界對不起來。
   * 這裡畫一塊帶幾格深淺的灰方塊，取樣用 NEAREST 保住硬邊
   */
  const size = 8
  const texture = new DynamicTexture(
    'campfire-smoke-texture',
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.fillStyle = '#d8d5cf'
  context.fillRect(0, 0, size, size)
  /** 幾格較暗的像素，一顆煙才不是純色色塊 */
  context.fillStyle = '#b4b1ab'
  const darkPixelList: [number, number][] = [[1, 2], [5, 1], [2, 5], [6, 4], [3, 6], [0, 4]]
  for (const [pixelX, pixelY] of darkPixelList) {
    context.fillRect(pixelX, pixelY, 2, 2)
  }
  texture.update()
  texture.hasAlpha = true

  const particleSystem = new ParticleSystem('campfire-smoke', 60, scene)
  particleSystem.particleTexture = texture
  /** 煙從火焰上緣冒出來，接在火舌的高度才連得起來 */
  particleSystem.emitter = new Vector3(x, groundY + 0.7, z)
  particleSystem.minEmitBox = new Vector3(-0.16, 0, -0.16)
  particleSystem.maxEmitBox = new Vector3(0.16, 0.1, 0.16)
  /** 靠近火口偏暖，越往上越灰、越淡 */
  particleSystem.color1 = new Color4(0.86, 0.82, 0.76, 0.9)
  particleSystem.color2 = new Color4(0.7, 0.7, 0.72, 0.75)
  particleSystem.colorDead = new Color4(0.68, 0.69, 0.72, 0)
  /**
   * 顆粒大、數量少
   *
   * 一顆一顆分得開才看得出是方塊，
   * 密密麻麻疊在一起又會糊成一團寫實的煙
   */
  particleSystem.minSize = 0.28
  particleSystem.maxSize = 0.52
  particleSystem.minLifeTime = 1.6
  particleSystem.maxLifeTime = 3.2
  particleSystem.emitRate = 7
  particleSystem.gravity = new Vector3(0.25, 0.5, 0.12)
  particleSystem.direction1 = new Vector3(-0.12, 1.2, -0.12)
  particleSystem.direction2 = new Vector3(0.12, 1.8, 0.12)
  particleSystem.minEmitPower = 0.35
  particleSystem.maxEmitPower = 0.7
  /** 不旋轉，方塊要維持正的才像 Minecraft */
  particleSystem.minAngularSpeed = 0
  particleSystem.maxAngularSpeed = 0
  particleSystem.updateSpeed = 0.012
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  particleSystem.start()
}

/**
 * 後製程管線
 *
 * 色調映射把過曝的天空拉回來，加一點對比與暗角，
 * 整體才不會像沒調過色的預設畫面
 */
function createRenderingPipeline(scene: Scene, camera: UniversalCamera) {
  const pipeline = new DefaultRenderingPipeline('minespace-pipeline', false, scene, [camera])

  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES
  /** 曝光壓低一點，陽光調亮後才不會整片過曝把影子洗掉 */
  pipeline.imageProcessing.exposure = 1.06
  /** 對比拉太高會把暗部壓成死黑，洞穴與背光面會整片糊掉 */
  pipeline.imageProcessing.contrast = 1.05
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = 2.2
  pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0)

  pipeline.bloomEnabled = true
  pipeline.bloomThreshold = 0.86
  pipeline.bloomWeight = 0.22
  pipeline.bloomKernel = 48
  pipeline.bloomScale = 0.5

  pipeline.fxaaEnabled = true

  return pipeline
}

/** 直螢幕時以寬度為基準計算 FOV，避免鏡頭過度放大 */
function updateCameraFovMode(camera: UniversalCamera, canvas: HTMLCanvasElement) {
  const isPortrait = canvas.clientHeight > canvas.clientWidth
  camera.fovMode = isPortrait
    ? Camera.FOVMODE_HORIZONTAL_FIXED
    : Camera.FOVMODE_VERTICAL_FIXED
}

function createShadowGenerator({ scene }: { scene: Scene }) {
  const sunLight = new DirectionalLight(SUN_LIGHT_NAME, SUN_DIRECTION, scene)
  sunLight.intensity = SUN_INTENSITY
  /** 午後的暖色陽光，跟偏冷的環境光形成色溫差 */
  sunLight.diffuse = new Color3(1, 0.93, 0.78)
  sunLight.specular = new Color3(0.1, 0.1, 0.1)

  /**
   * ShadowGenerator 需要明確的光源位置與正交投影範圍
   *
   * autoUpdateExtends 預設會每幀依投影者重算範圍，
   * 關掉改用固定範圍，投影矩陣穩定，影子邊緣才不會隨著鏡頭移動抖動
   */
  /** 從世界中心沿著光線反方向退開，整座島才會落在深度範圍中段 */
  sunLight.position = new Vector3(WORLD_SIZE / 2, SEA_LEVEL + 20, WORLD_SIZE / 2)
    .subtract(SUN_DIRECTION.scale(220))
  const halfSize = WORLD_SIZE / 1.6
  sunLight.autoUpdateExtends = false
  sunLight.orthoLeft = -halfSize
  sunLight.orthoRight = halfSize
  sunLight.orthoTop = halfSize
  sunLight.orthoBottom = -halfSize
  /**
   * 深度範圍也要自己給
   *
   * 關掉 autoUpdateExtends 之後 autoCalcShadowZBounds 就失效了。
   * 範圍抓寬一點，山頂與雲層才不會被裁掉而投不出影子
   */
  sunLight.shadowMinZ = 60
  sunLight.shadowMaxZ = 400

  const { quality } = useGraphicsQuality()

  /**
   * 陰影貼圖的解析度
   *
   * 投影範圍是整座島的 240 格，2048 只有每格 8.5 個像素，
   * 花草那種細到只有幾個像素寬的東西，投出來的影子撐不過一個取樣點。
   * 拉到 4096 等於每格 17 個像素，同時也讓 bias 可以縮小一半
   */
  const shadowGenerator = new ShadowGenerator(quality.value === 'low' ? 1024 : 4096, sunLight)
  /**
   * bias 是正規化深度，要換算成世界單位才有意義
   *
   * 深度範圍 340 格，bias 0.0005 大約是 0.17 格。
   * 原本用 0.0012（約半格）壓住方塊表面的自我遮蔽條紋，代價是
   * 一格高的花草整個落在偏移量以內，投出來的影子被抹掉了。
   *
   * 改成把工作交給 normalBias：它是沿著法線推開投影者，
   * 對付平面的自我遮蔽特別有效，又不會像 bias 那樣連帶吃掉貼地的短影子
   */
  shadowGenerator.bias = 0.0005
  /**
   * normalBias 是「把投影者沿著法線的反方向推進去」
   *
   * 平面自我遮蔽靠它處理很有效，但花草的法線被我們統一改成朝上了
   * （為了讓交叉的兩片立板亮度一致），推的方向剛好是往地底下。
   * 值一大整株草就沉進地面，影子自然消失。
   * 這裡只留剛好夠壓住條紋的量，其餘交給提高解析度
   */
  shadowGenerator.normalBias = 0.08
  /** darkness 越大陰影越淡，0 全黑、1 等於沒有影子 */
  shadowGenerator.darkness = 0.5

  if (quality.value === 'low') {
    shadowGenerator.useBlurExponentialShadowMap = true
    shadowGenerator.blurKernel = 24
  }
  else {
    shadowGenerator.usePercentageCloserFiltering = true
    /**
     * 用中等濾波
     *
     * QUALITY_HIGH 的取樣範圍換算成世界座標大約有半格寬，
     * 草葉的影子本身還不到那個寬度，整條會被平均掉。
     * 換成中等，邊緣硬一點，但細的東西留得住
     */
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
  }

  /**
   * 雲層也是投影者
   *
   * 雲是半透明的，預設不會被畫進陰影貼圖，要開 transparencyShadow。
   * 雲一邊飄，地面上的雲影就跟著慢慢掃過去
   */
  shadowGenerator.transparencyShadow = true

  const cloudLayer = scene.getMeshByName(CLOUD_LAYER_NAME)
  if (cloudLayer) {
    shadowGenerator.addShadowCaster(cloudLayer)
  }

  return shadowGenerator
}

export function useBabylonScene(param?: UseBabylonSceneParam) {
  const { quality } = useGraphicsQuality()

  const canvasRef = ref<HTMLCanvasElement>()

  const engine = shallowRef<Engine>()
  const scene = shallowRef<Scene>()
  const camera = shallowRef<UniversalCamera>()
  const shadowGenerator = shallowRef<ShadowGenerator>()
  const pipeline = shallowRef<DefaultRenderingPipeline>()

  const {
    createEngine,
    createScene,
    createCamera,
    init,
  } = defaults(param, defaultParam)

  const initError = ref<string>()

  watch(quality, (newQuality) => {
    if (!engine.value)
      return

    const devicePixelRatio = window?.devicePixelRatio ?? 1
    engine.value.setHardwareScalingLevel(newQuality === 'low' ? 3 / devicePixelRatio : 1 / devicePixelRatio)

    if (pipeline.value) {
      /** 低畫質保留色調映射，關掉比較吃資源的泛光與抗鋸齒 */
      pipeline.value.bloomEnabled = newQuality !== 'low'
      pipeline.value.fxaaEnabled = newQuality !== 'low'
    }

    if (!shadowGenerator.value)
      return

    if (newQuality === 'low') {
      shadowGenerator.value.useBlurExponentialShadowMap = true
      shadowGenerator.value.usePercentageCloserFiltering = false
      shadowGenerator.value.blurKernel = 24
    }
    else {
      shadowGenerator.value.useBlurExponentialShadowMap = false
      shadowGenerator.value.usePercentageCloserFiltering = true
      shadowGenerator.value.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
    }
  })

  onMounted(async () => {
    try {
      if (!canvasRef.value) {
        console.error('無法取得 canvas DOM')
        return
      }

      engine.value = await createEngine({ canvas: canvasRef.value })

      const devicePixelRatio = window?.devicePixelRatio ?? 1
      engine.value.setHardwareScalingLevel(
        quality.value === 'low' ? 3 / devicePixelRatio : 1 / devicePixelRatio,
      )

      scene.value = createScene({
        canvas: canvasRef.value,
        engine: engine.value,
      })
      camera.value = createCamera({
        canvas: canvasRef.value,
        engine: engine.value,
        scene: scene.value,
      })
      shadowGenerator.value = createShadowGenerator({ scene: scene.value })
      pipeline.value = createRenderingPipeline(scene.value, camera.value)
      pipeline.value.bloomEnabled = quality.value !== 'low'
      pipeline.value.fxaaEnabled = quality.value !== 'low'

      useEventListener(window, 'resize', handleResize)
      useEventListener(canvasRef, 'webglcontextlost', (event) => {
        event.preventDefault()
        console.error('[Babylon] WebGL context lost')
        initError.value = 'WebGL context lost'
      })

      engine.value.runRenderLoop(() => {
        scene.value?.render()
      })

      await init({
        canvas: canvasRef.value,
        engine: engine.value,
        scene: scene.value,
        camera: camera.value,
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Babylon] 初始化失敗:', error)
      initError.value = message
    }
  })

  onBeforeUnmount(() => {
    engine.value?.dispose()
    scene.value?.dispose()
  })

  function handleResize() {
    engine.value?.resize()

    if (camera.value && canvasRef.value) {
      updateCameraFovMode(camera.value, canvasRef.value)
    }
  }

  return {
    canvasRef,
    engine,
    scene,
    camera,
    initError,
  }
}
