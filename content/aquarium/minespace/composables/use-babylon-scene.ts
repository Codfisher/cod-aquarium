import type {
  ShaderMaterial,
} from '@babylonjs/core'
import type { GraphicsQuality } from './use-graphics-quality'
import {
  Camera,
  Color3,
  Color4,
  ColorCurves,
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
import { useEventListener } from '@vueuse/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { SAND_LEVEL } from '../domains/garden/garden-constants'
import {
  CAMPFIRE_POINT,
  CAVE_CHAMBER,
  CAVE_MOUTH,
  CAVE_TUNNEL,
  SPAWN_POSITION,
} from '../domains/garden/garden-layout'
import { GARDEN_FOG_COLOR, GARDEN_FOG_END, GARDEN_FOG_START } from '../domains/weather/atmosphere'
import { applyCloudColor, createCloudMaterial } from '../domains/weather/cloud-material'
import { applySkyGradient, createSkyGradientMaterial } from '../domains/weather/sky-gradient'
import { getGroundY } from '../domains/world/world-access'
import { WORLD_SIZE } from '../domains/world/world-constants'
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
export const MOON_DISC_NAME = 'moon-disc'
export const MOON_GLOW_NAME = 'moon-glow'
export const STAR_FIELD_NAME = 'star-field'
export const CLOUD_LAYER_NAME = 'cloud-layer'

/**
 * 繪製順序分成三層
 *
 * Babylon 一律先畫完不透明再畫半透明，順序不固定就會出現
 * 「陰天罩把太陽從中間切開」這類問題。
 * 改成分層繪製：天空層畫完才畫罩在外面的那一層，最後才畫天氣粒子。
 * 各層之間不清除深度，地形擋住天空的關係都還在，只有先後順序被固定下來
 */
const SKY_OVERLAY_RENDERING_GROUP = 1
/** 天氣粒子畫在最後，雨絲才不會被陰天罩蓋掉 */
export const WEATHER_RENDERING_GROUP = 2

/**
 * 雲層高度
 *
 * 抬得比原本高，而且雲本身也做小了。雲太低太大時，
 * 從地面往上看整片是一塊沒有縫的灰天花板——
 * 拉遠、縮小、再降低覆蓋率，才看得出一朵一朵的形狀與中間的藍天
 */
const CLOUD_HEIGHT = 104
/** 單朵雲方塊的邊長 */
const CLOUD_CELL_SIZE = 14
/** 雲的厚度 */
const CLOUD_THICKNESS = 5
/** 雲的飄移速度（格 / 秒） */
const CLOUD_DRIFT_SPEED = 0.6
/** 單一朵雲最多幾格，再大就會連成一片蓋住整片天 */
const MAX_CLOUD_CELL_COUNT = 10

/**
 * 天空的底色
 *
 * 禪庭是一片高明度的白沙，天空若還是原本那種飽和的藍，
 * 整個畫面會被切成上下兩塊互不相干的顏色。
 * 改成很淡的天青，天與地才連得起來，白沙也才顯得出它的白
 */
export const SKY_COLOR = new Color3(0.84, 0.89, 0.94)

/**
 * 太陽方向（光線前進的方向）
 *
 * 這只是日夜循環接上之前的第一幀，之後每一幀都由 use-day-night 覆寫。
 * 仰角壓得低，是午後的斜射光：影子拉得長，木座的三個面亮度也才拉得開。
 * 一整片白沙如果被正午的頂光照著，會平得像一張紙
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

/**
 * 鏡頭的視野角度（弧度）
 *
 * Babylon 預設是 0.8，那個視角很窄，走在箱庭之間會像從管子裡看出去。
 * 一點一五大約是六十六度，寬到看得見兩側的木座，
 * 又還沒到廣角鏡那種邊緣被拉長的程度
 */
export const DEFAULT_CAMERA_FOV = 1.15
/** 視野的可調範圍（弧度），大約是四十六度到九十七度 */
export const CAMERA_FOV_RANGE: [number, number] = [0.8, 1.7]

/**
 * 陰影涵蓋範圍的半邊長
 *
 * 只需要罩住鏡頭附近走得到、看得清楚的那一塊。
 * 再遠的東西不是被霧糊掉，就是小到看不出有沒有影子。
 *
 * 這個值同時決定一個取樣格有多大（範圍 ÷ 貼圖寬度）。
 * 太陽在轉的時候，整張取樣格會跟著光源空間一起轉，邊緣必然重新取樣——
 * 格子越小，每次重新取樣的落差就越小，抖動也就越不明顯。
 * 從四十八收到四十，一格從 0.047 格縮到 0.039 格
 */
const SHADOW_HALF_EXTENT = 40
/** 光源沿著光線反方向退開多遠，要大到把最高的岩體整個含進去 */
const SHADOW_LIGHT_DISTANCE = 90

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

    scene.clearColor = new Color4(GARDEN_FOG_COLOR.r, GARDEN_FOG_COLOR.g, GARDEN_FOG_COLOR.b, 1)

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

    /**
     * 霧
     *
     * 這幾個值每一幀都會被漫遊控制器依大氣狀態覆寫，
     * 這裡給的是還沒開始漫遊前的第一幀，照著禪庭的白霧設定
     */
    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = GARDEN_FOG_COLOR.clone()
    scene.fogStart = GARDEN_FOG_START
    scene.fogEnd = GARDEN_FOG_END

    /** 各層之間保留深度，地形擋住雲、雲擋住太陽的關係才不會被清掉 */
    scene.setRenderingAutoClearDepthStencil(SKY_OVERLAY_RENDERING_GROUP, false)
    scene.setRenderingAutoClearDepthStencil(WEATHER_RENDERING_GROUP, false)

    trackShadowToCamera(scene)
    createSkyDome(scene)
    createStarField(scene)
    createSunDisc(scene)
    createMoonDisc(scene)
    createCloudLayer(scene)
    createOvercastDome(scene)
    createCaveLights(scene)
    createCaveDrips(scene)

    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new UniversalCamera(
      'roam-camera',
      new Vector3(SPAWN_POSITION.x, SAND_LEVEL + 3, SPAWN_POSITION.z),
      scene,
    )

    /** 出生就面向北方的枯山水 */
    camera.setTarget(new Vector3(SPAWN_POSITION.x, SAND_LEVEL + 2, SPAWN_POSITION.z - 20))

    camera.attachControl(canvas, true)
    camera.minZ = 0.1
    /** 要看得到延伸到天邊的沙地 */
    camera.maxZ = 1600
    camera.fov = DEFAULT_CAMERA_FOV
    updateCameraFovMode(camera, canvas)

    return camera
  },
  init: () => Promise.resolve(),
}

/**
 * 天空罩
 *
 * 天色是調出來的，不是算出來的：天頂與天邊各一個顏色，
 * 再往太陽的方向疊一團暖光。整套由日夜的顏色表驅動，
 * 詳見 sky-gradient 裡的說明
 */
function createSkyDome(scene: Scene) {
  const skyMaterial = createSkyGradientMaterial('sky-material', scene)

  /** 還沒開始漫遊前的第一幀，日夜循環一起跑就會接手 */
  applySkyGradient(skyMaterial, {
    zenithColor: new Color3(0.3, 0.55, 0.92),
    horizonColor: GARDEN_FOG_COLOR,
    glowColor: new Color3(1, 0.97, 0.85),
    glowStrength: 0.12,
    sunDirection: SUN_DIRECTION.scale(-1),
  })

  const skyDome = MeshBuilder.CreateBox(SKYBOX_NAME, { size: 260 }, scene)
  skyDome.material = skyMaterial
  skyDome.infiniteDistance = true
  skyDome.isPickable = false
  skyDome.applyFog = false

  return skyMaterial
}

/** 取得場景中的天空材質 */
export function getSkyMaterial(scene: Scene): ShaderMaterial | null {
  const skyDome = scene.getMeshByName(SKYBOX_NAME)
  return (skyDome?.material as ShaderMaterial | undefined) ?? null
}

/**
 * 讓陰影範圍跟著鏡頭移動
 *
 * 投影中心必須對齊到貼圖的取樣格，不能連續地跟著走。
 * 連續移動時投影矩陣一直在變，同一道邊緣每一幀落在不同的深度取樣點上，
 * 影子邊緣會沿著走路的方向不停爬動（俗稱 shadow shimmering）。
 *
 * 關鍵是「對齊到哪個座標系」。這裡曾經直接把鏡頭的世界座標
 * X、Y、Z 各自對齊取樣格——那是錯的：陰影貼圖的格子長在光源空間上，
 * 而光源是斜的。世界座標對齊之後投影到光源空間並不會落在整數格上，
 * 邊緣照樣每一幀重新取樣。更別說「沿著光線退開的那一段」完全沒有對齊，
 * 光是那一項就足以讓整張格子每幀錯開。
 *
 * 正解是先把中心點投影到光源自己的三軸上，在那裡對齊，再轉回世界座標。
 * 三軸的建法必須與 Babylon 算陰影視圖矩陣時完全一致
 * （LookAtLH 以世界的上方為參考），否則對齊的還是另一組格子
 */
function trackShadowToCamera(scene: Scene) {
  /** 光源空間的三軸與暫存，每幀就地覆寫，不重新配置 */
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const center = new Vector3()

  /** 取樣格的大小要照實際的貼圖尺寸算，低畫質那張只有一半寬 */
  let texelSize = 0

  scene.onBeforeRenderObservable.add(() => {
    const light = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
    const camera = scene.activeCamera
    if (!light || !camera)
      return

    if (texelSize === 0) {
      const mapSize = light.getShadowGenerator()?.getShadowMap()?.getSize().width
      if (!mapSize)
        return

      texelSize = (SHADOW_HALF_EXTENT * 2) / mapSize
    }

    /**
     * 讀光源自己的方向，不要讀那個常數
     *
     * 日夜循環每一幀都在轉動這道光：白天從太陽射下、夜裡換成月亮。
     * 這裡若還照著固定的方向退開，投影範圍就會歪到鏡頭以外的地方去
     */
    forward.copyFrom(light.direction).normalize()
    Vector3.CrossToRef(Vector3.UpReadOnly, forward, right)
    right.normalize()
    Vector3.CrossToRef(forward, right, up)

    /** 投影到光源的三軸上，橫向與縱向對齊取樣格；深度方向不必對齊 */
    const alongRight = Math.round(Vector3.Dot(camera.position, right) / texelSize) * texelSize
    const alongUp = Math.round(Vector3.Dot(camera.position, up) / texelSize) * texelSize
    const alongForward = Vector3.Dot(camera.position, forward)

    center.set(
      right.x * alongRight + up.x * alongUp + forward.x * alongForward,
      right.y * alongRight + up.y * alongUp + forward.y * alongForward,
      right.z * alongRight + up.z * alongUp + forward.z * alongForward,
    )

    light.position.set(
      center.x - forward.x * SHADOW_LIGHT_DISTANCE,
      center.y - forward.y * SHADOW_LIGHT_DISTANCE,
      center.z - forward.z * SHADOW_LIGHT_DISTANCE,
    )
  })
}

/**
 * 天體共用的材質
 *
 * 太陽、月亮、星空與兩圈光暈都用這一套：貼圖決定形狀與顏色，
 * 自發光的顏色決定它此刻該露出多少、該染成什麼色。
 *
 * 貼圖必須掛在 diffuseTexture，不能掛在 emissiveTexture——這是關鍵。
 * Babylon 的著色器裡自發光是「顏色加上貼圖」：
 *
 *     emissiveColor = vEmissiveColor + texture * level
 *
 * 掛在自發光上的話，把顏色調成黑色貼圖照樣全亮（白天星星掛在藍天上），
 * 調成白色則是整片加上一層白（夜裡整個天空被灌成一片灰）。
 * 關掉光照之後，diffuse 那條路才是我們要的乘法：
 *
 *     finalDiffuse = clamp(emissiveColor) * 貼圖
 *
 * 於是自發光的顏色就成了一個乾淨的乘數，淡入淡出與染色都靠它
 */
function createSkyBodyMaterial(
  name: string,
  texture: DynamicTexture,
  scene: Scene,
): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.diffuseTexture = texture
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  /** 不吃光照，關掉之後畫面上的顏色就只剩自發光乘上貼圖 */
  material.disableLighting = true
  material.fogEnabled = false
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_ADD
  /** 相加混合要走半透明那條路才生效，alpha 得比 1 小一點點 */
  material.alpha = 0.999
  /** 天體是天空的一部分，不留下深度，雲才蓋得住它 */
  material.disableDepthWrite = true

  return material
}

/**
 * Minecraft 風格的方形太陽
 *
 * 大氣散射算出來的太陽是一顆帶光暈的圓球，那太寫實了。
 * 天空只負責漸層與霞光，太陽本體改掛一張正方形貼圖，
 * 才是方塊世界該有的樣子
 */
function createSunDisc(scene: Scene) {
  /** 太陽本體：一張純白的方形貼圖，用 NEAREST 取樣保住硬邊 */
  const size = 16
  const texture = new DynamicTexture(SUN_DISC_NAME, { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = 'rgba(255, 250, 230, 1)'
  context.fillRect(0, 0, size, size)
  texture.update()

  const material = createSkyBodyMaterial(`${SUN_DISC_NAME}-material`, texture, scene)
  /** 日夜循環拿這個顏色去乘貼圖，升起落下的淡入淡出與染色都靠它 */
  material.emissiveColor = new Color3(1, 1, 1)

  const disc = MeshBuilder.CreatePlane(SUN_DISC_NAME, { size: 15 }, scene)
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

  /**
   * 衰減要畫在顏色上，不能畫在透明度上
   *
   * 天體走的是相加混合，透明度在那條路上完全不起作用——
   * 只有顏色會被加上去。漸層若照一般寫法讓 alpha 從 0.85 收到 0，
   * 顏色卻一路維持在同一個亮度，畫出來就是一塊亮度均勻的圓餅，
   * 邊緣還有一道硬生生的界線，那正是太陽與月亮外圍那一圈白圈的來源。
   *
   * 所以這裡把該有的透明度先乘進顏色裡，一路收到全黑；
   * 黑色加上去等於沒加，暈開的效果自然就出來了
   */
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgb(217, 211, 182)')
  gradient.addColorStop(0.35, 'rgb(77, 73, 59)')
  gradient.addColorStop(0.7, 'rgb(20, 19, 15)')
  gradient.addColorStop(1, 'rgb(0, 0, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()

  const material = createSkyBodyMaterial(`${SUN_GLOW_NAME}-material`, texture, scene)
  material.emissiveColor = new Color3(1, 1, 1)

  const glow = MeshBuilder.CreatePlane(SUN_GLOW_NAME, { size: 48 }, scene)
  glow.material = material
  glow.position = SUN_DIRECTION.scale(-112)
  glow.infiniteDistance = true
  glow.billboardMode = Mesh.BILLBOARDMODE_ALL
  glow.isPickable = false
  glow.applyFog = false

  return material
}

/**
 * Minecraft 風格的月亮
 *
 * 與太陽一樣是填滿的方形——方塊世界的天上不該有圓的東西——
 * 差別在表面：太陽是一片沒有細節的白，月亮則有月海、坑與明暗，
 * 冷色調也與太陽的暖白分得開。同樣是方塊，一眼就認得出誰是誰
 */
function createMoonDisc(scene: Scene) {
  const size = 16
  const texture = new DynamicTexture(MOON_DISC_NAME, { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  /** 底色：偏冷的月白，整片填滿 */
  context.fillStyle = 'rgb(226, 233, 250)'
  context.fillRect(0, 0, size, size)

  /**
   * 月海：暗一階的幾塊斑
   *
   * 位置與大小刻意不規則，也刻意不對稱——
   * 排得整齊會變成一顆骰子，均勻散開又會變成雜訊。
   * 幾塊大的湊在一邊、幾塊小的散在另一邊，那才像月面
   */
  context.fillStyle = 'rgb(196, 206, 231)'
  const seaList: [number, number, number, number][] = [
    [2, 3, 5, 4],
    [8, 2, 3, 3],
    [10, 7, 4, 5],
    [1, 9, 3, 3],
    [5, 11, 4, 3],
    [12, 1, 2, 2],
  ]
  for (const [x, y, width, height] of seaList) {
    context.fillRect(x, y, width, height)
  }

  /** 再暗一階的坑，落在月海裡面，表面才有第三層深度 */
  context.fillStyle = 'rgb(170, 181, 209)'
  const craterList: [number, number, number, number][] = [
    [3, 4, 2, 2],
    [11, 9, 2, 2],
    [6, 12, 2, 1],
    [2, 10, 1, 1],
  ]
  for (const [x, y, width, height] of craterList) {
    context.fillRect(x, y, width, height)
  }

  /**
   * 右下角壓暗一層
   *
   * 一整片同亮度的方塊看起來是平的。讓一角暗下去，
   * 月亮才有一點球的錯覺，卻又沒有真的把它畫成圓
   */
  context.fillStyle = 'rgba(120, 132, 164, 0.32)'
  context.fillRect(9, 12, 7, 4)
  context.fillRect(13, 8, 3, 4)

  texture.update()

  const material = createSkyBodyMaterial(`${MOON_DISC_NAME}-material`, texture, scene)
  /**
   * 比太陽暗一階
   *
   * 月亮是反射的光，不是自己在燒。壓在泛光門檻以下，
   * 月面就維持乾淨的硬邊像素，只有外圈的暈負責散開
   */
  material.emissiveColor = new Color3(0.86, 0.88, 0.95)

  /** 比太陽小一號，天上兩顆方塊才分得出主從 */
  const disc = MeshBuilder.CreatePlane(MOON_DISC_NAME, { size: 12 }, scene)
  disc.material = material
  disc.position = SUN_DIRECTION.scale(110)
  disc.infiniteDistance = true
  disc.billboardMode = Mesh.BILLBOARDMODE_ALL
  disc.isPickable = false
  disc.applyFog = false

  createMoonGlow(scene)

  return material
}

/** 月亮外圍那一圈冷色的暈，夜裡的空氣感靠它 */
function createMoonGlow(scene: Scene) {
  const size = 128
  const texture = new DynamicTexture(MOON_GLOW_NAME, { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D

  /** 與太陽的光暈同一個道理：衰減乘進顏色裡，一路收到全黑 */
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgb(103, 112, 128)')
  gradient.addColorStop(0.4, 'rgb(34, 38, 46)')
  gradient.addColorStop(0.7, 'rgb(10, 11, 14)')
  gradient.addColorStop(1, 'rgb(0, 0, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()

  const material = createSkyBodyMaterial(`${MOON_GLOW_NAME}-material`, texture, scene)
  material.emissiveColor = new Color3(1, 1, 1)

  const glow = MeshBuilder.CreatePlane(MOON_GLOW_NAME, { size: 40 }, scene)
  glow.material = material
  glow.position = SUN_DIRECTION.scale(112)
  glow.infiniteDistance = true
  glow.billboardMode = Mesh.BILLBOARDMODE_ALL
  glow.isPickable = false
  glow.applyFog = false

  return material
}

/**
 * 星空
 *
 * 少了它，夜裡抬頭只有一片沒有東西的深藍，天空會像一塊布。
 * 做法是一張隨機點上星點的貼圖，貼在一個罩住鏡頭的盒子上，
 * 用相加混合疊在天空前面——黑色的底加上去等於沒加，只有星點會亮。
 *
 * 盒子六個面共用同一張圖，圖樣其實重複了六次；
 * 但星點本來就是隨機散布、沒有結構，轉頭時看不出重複
 */
function createStarField(scene: Scene) {
  const size = 512
  const texture = new DynamicTexture(STAR_FIELD_NAME, { width: size, height: size }, scene, true)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = '#000000'
  context.fillRect(0, 0, size, size)

  const random = createSeededRandom('minespace-star')
  const starCount = 460
  for (let index = 0; index < starCount; index++) {
    const x = Math.floor(random() * size)
    const y = Math.floor(random() * size)
    /** 大部分是暗的小星，偶爾幾顆亮而大的，疏密才有層次 */
    const isBright = random() < 0.1
    const brightness = isBright ? 0.85 + random() * 0.15 : 0.25 + random() * 0.45
    const pixelSize = isBright ? 2 : 1
    context.fillStyle = `rgba(255, 252, 242, ${brightness})`
    context.fillRect(x, y, pixelSize, pixelSize)
  }
  texture.update()

  const material = createSkyBodyMaterial(`${STAR_FIELD_NAME}-material`, texture, scene)
  /** 白天為零、夜裡為一，由日夜循環每一幀寫入 */
  material.emissiveColor = new Color3(0, 0, 0)

  const dome = MeshBuilder.CreateBox(STAR_FIELD_NAME, { size: 240 }, scene)
  dome.material = material
  dome.infiniteDistance = true
  dome.isPickable = false
  dome.applyFog = false

  return material
}

/** 取得月亮本體與月暈的材質 */
export function getMoonMaterialList(scene: Scene): StandardMaterial[] {
  return [MOON_DISC_NAME, MOON_GLOW_NAME]
    .map((name) => scene.getMeshByName(name)?.material as StandardMaterial | undefined)
    .filter((material): material is StandardMaterial => !!material)
}

/** 取得星空的材質 */
export function getStarFieldMaterial(scene: Scene): StandardMaterial | null {
  const dome = scene.getMeshByName(STAR_FIELD_NAME)
  return (dome?.material as StandardMaterial | undefined) ?? null
}

/**
 * Minecraft 風格的雲層
 *
 * 每一朵雲都是實際的方塊，不是貼圖，所以看得到厚度與側面。
 * 用 thin instance 一次畫完幾千個方塊，成本只有一個 draw call。
 * 這層雲同時也是投影者，地面上會有雲影慢慢掃過
 */
function createCloudLayer(scene: Scene) {
  /**
   * 圖樣本身的格數
   *
   * 格數乘上格寬必須剛好等於世界寬度（18 × 14 = 252）。
   * 這是循環世界的硬性條件：玩家跨過邊界時位置會平移一整個世界的距離，
   * 雲的圖樣若不是同一個週期，整片天會在那一瞬間換一副樣子——
   * 那是全場景唯一不吃霧氣、藏不住的東西
   */
  const patternCount = 18
  /** 平鋪幾份，鋪得夠大才不會在天邊看到雲層的邊界 */
  const tileCount = 9

  const random = createSeededRandom('minespace-cloud')
  /**
   * 初始填充率
   *
   * 平滑規則會把孤立的格子吃掉，起始值太低整片天最後只剩零星幾朵，
   * 一抬頭常常什麼都沒有。填到接近一半，收斂後才是「多雲」該有的覆蓋率
   */
  let cellList = Array.from({ length: patternCount * patternCount }, () => random() < 0.34)

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

  const material = createCloudMaterial(`${CLOUD_LAYER_NAME}-material`, scene)
  applyCloudColor(material, {
    color: new Color3(1, 1, 1),
    hazeColor: GARDEN_FOG_COLOR,
  })

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
  cloudMesh.renderingGroupId = SKY_OVERLAY_RENDERING_GROUP

  cloudMesh.material = material
  cloudMesh.isPickable = false
  cloudMesh.receiveShadows = false
  cloudMesh.applyFog = false
  cloudMesh.position.set(0, CLOUD_HEIGHT, 0)

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
    cloudMesh.position.x = (elapsed * CLOUD_DRIFT_SPEED) % driftPeriod
  })

  return material
}

/** 取得雲層材質 */
export function getCloudMaterialList(scene: Scene): ShaderMaterial[] {
  const material = scene.getMeshByName(CLOUD_LAYER_NAME)?.material as ShaderMaterial | undefined
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
 * 天空罩、太陽、月亮與星空是四層各自獨立的東西，
 * 要讓它們一起消失，最省事的做法是在外面再罩一層灰：
 * 下雨時淡入把整片天蓋掉，就是名副其實的陰天
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
  dome.renderingGroupId = SKY_OVERLAY_RENDERING_GROUP
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
 * 洞穴裡的光
 *
 * 燈石的光已經由 Worker 烘進方塊表面，這幾盞只負責整體的空間感：
 * 洞口一盞冷色的光模擬透進來的天光，通道與洞窟各補一點暖色的層次
 */
function createCaveLights(scene: Scene) {
  /** 洞口：偏冷的天光，看起來像從外面透進來的 */
  const mouthLight = new PointLight(
    'cave-mouth-light',
    new Vector3(CAVE_MOUTH.x, CAVE_MOUTH.y + 1, CAVE_MOUTH.z),
    scene,
  )
  mouthLight.diffuse = new Color3(0.8, 0.88, 1)
  mouthLight.specular = new Color3(0, 0, 0)
  mouthLight.intensity = 0.8
  mouthLight.range = 22

  /**
   * 通道與洞室原本各有一盞手擺的暖光，現在收掉了
   *
   * 那兩盞是在燈池做出來以前的替代方案：洞裡的燈籠只有烘進反照率的假光，
   * 暗處看不出照明，只好在旁邊補一盞真光。
   * 現在燈池會自己找到洞裡那幾盞燈籠並給它們真光，
   * 留著就是白白佔掉材質僅有的六個光源名額
   */
}

/**
 * 洞頂滴水
 *
 * 洞裡有滴水的音效卻看不到水滴，聲音就會顯得很憑空。
 * 在通道與洞窟各放一組粒子，從洞頂落下
 */
function createCaveDrips(scene: Scene) {
  /**
   * 一滴水的貼圖：硬邊的像素，不是柔邊的光點
   *
   * 柔邊漸層做出來的是攝影機拍到的散景，那是寫實遊戲的語彙。
   * Minecraft 的水滴就是幾格看得出邊界的方塊，
   * 所以這裡畫一顆四格見方的水珠：中間亮、下緣暗一階當作重量，
   * 取樣用 NEAREST 保住硬邊，再交給粒子系統拉長成一條
   */
  const size = 8
  const texture = new DynamicTexture(
    'cave-drip-texture',
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)
  /** 水珠本體 */
  context.fillStyle = 'rgba(206, 233, 255, 1)'
  context.fillRect(2, 1, 4, 6)
  /** 上緣收窄一格，看起來才像一顆水珠而不是一根柱子 */
  context.clearRect(2, 1, 1, 1)
  context.clearRect(5, 1, 1, 1)
  /** 下緣暗一階，水滴才有上輕下重的感覺 */
  context.fillStyle = 'rgba(150, 196, 240, 1)'
  context.fillRect(2, 6, 4, 1)
  /** 一格高光 */
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(3, 2, 1, 1)
  texture.update()
  texture.hasAlpha = true

  /** 通道那一段矮、洞室那一段高，落點的範圍也跟著不同 */
  const dripSpotList = [
    { name: 'tunnel', point: CAVE_TUNNEL, ceilingOffset: 2, spread: 1.2 },
    { name: 'chamber', point: CAVE_CHAMBER, ceilingOffset: 5, spread: 3.4 },
  ]

  for (const spot of dripSpotList) {
    const particleSystem = new ParticleSystem(`cave-drip-${spot.name}`, 60, scene)
    particleSystem.particleTexture = texture
    particleSystem.applyFog = true
    particleSystem.emitter = new Vector3(spot.point.x, spot.point.y + spot.ceilingOffset, spot.point.z)
    /** 從洞頂一小片區域隨機落下 */
    particleSystem.minEmitBox = new Vector3(-spot.spread, 0, -spot.spread)
    particleSystem.maxEmitBox = new Vector3(spot.spread, 0, spot.spread)
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

  /**
   * 由下往上：純白、亮黃、橘、暗紅
   *
   * 最底下那一段是火心，必須是不帶一點雜色的純白。
   * 原本給的是 #fff3c4 這種奶油白，經過 ACES 色調映射之後
   * 會被壓成一片灰撲撲的米色，看起來像燒到一半熄掉的灰
   */
  const colorList = ['#ffffff', '#ffd24a', '#f28a1c', '#c73f12']

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
   * 最終顏色又夾在 1 以內，整團火會被洗成一塊白，只剩下火舌的輪廓。
   *
   * 倍率要推到一以上。只給到一的話，貼圖的白進到 ACES 色調映射時
   * 剛好落在曲線開始壓縮的地方，出來會變成八成亮的灰白，火心因此永遠白不起來。
   * 推到一點六，白才真的是白，而且越過泛光的門檻，火會透出一圈光暈
   */
  material.emissiveColor = new Color3(1.6, 1.6, 1.6)
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
  const { x, z } = CAMPFIRE_POINT
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
  particleSystem.applyFog = true
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

  /**
   * 色調曲線
   *
   * 日夜循環每一幀會改它的色相與濃度：夜裡整片畫面偏冷、黃昏偏暖。
   * 這件事只靠調暗曝光做不到——「暗下來」與「換一種顏色」是兩回事，
   * 而後者才是黃昏之所以是黃昏的原因
   */
  pipeline.imageProcessing.colorCurves = new ColorCurves()
  pipeline.imageProcessing.colorCurvesEnabled = true

  pipeline.bloomEnabled = true
  pipeline.bloomThreshold = 0.86
  pipeline.bloomWeight = 0.22
  pipeline.bloomKernel = 48
  pipeline.bloomScale = 0.5

  pipeline.fxaaEnabled = true

  return pipeline
}

/**
 * 決定實際要渲染多少像素
 *
 * 高畫質原本直接跟著裝置像素比走。在兩倍的螢幕上那代表要畫四倍的像素，
 * 再疊上泛光與抗鋸齒，幀率掉下來之後轉動視角會一段一段跳——
 * 因為視角轉多少是由滑鼠位移決定的，與幀率無關，
 * 幀率一低，同樣的角度就被切成更少、更大的步進。
 *
 * 這裡把倍率壓在一點五以內：畫質幾乎看不出差別，像素量卻少了將近一半。
 * 低畫質維持三分之一
 */
function getHardwareScalingLevel(quality: GraphicsQuality, devicePixelRatio: number): number {
  if (quality === 'low') {
    return 3 / devicePixelRatio
  }

  return 1 / Math.min(devicePixelRatio, 1.5)
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
   * 陰影只照顧鏡頭附近那一塊
   *
   * 原本的投影範圍罩住整個世界（三百五十格見方）。那代表每一幀都要把
   * 全世界的幾何重畫進一張 4096 的深度圖裡，而其中絕大部分
   * 玩家根本看不到——霧在兩百二十格就糊掉了，走遠的東西也沒有影子可看。
   *
   * 改成一塊跟著鏡頭移動的小範圍：邊長只有九十六格，
   * 貼圖降到 2048 反而讓每一格分到的像素從十一個變成二十一個——
   * 成本降到四分之一，影子還更銳利。
   *
   * autoUpdateExtends 要關掉：讓它每幀依投影者重算的話，
   * 範圍會隨著視野裡的東西跳動，影子邊緣跟著抖
   */
  sunLight.autoUpdateExtends = false
  sunLight.orthoLeft = -SHADOW_HALF_EXTENT
  sunLight.orthoRight = SHADOW_HALF_EXTENT
  sunLight.orthoTop = SHADOW_HALF_EXTENT
  sunLight.orthoBottom = -SHADOW_HALF_EXTENT
  /**
   * 深度範圍
   *
   * 關掉 autoUpdateExtends 之後 autoCalcShadowZBounds 就失效了，得自己給。
   * 光源退開的距離加上世界高度，前後各留一點餘裕
   */
  sunLight.shadowMinZ = 10
  sunLight.shadowMaxZ = SHADOW_LIGHT_DISTANCE + 80
  sunLight.position = new Vector3(WORLD_SIZE / 2, SAND_LEVEL, WORLD_SIZE / 2)
    .subtract(SUN_DIRECTION.scale(SHADOW_LIGHT_DISTANCE))

  const { quality } = useGraphicsQuality()

  /**
   * 陰影貼圖的解析度
   *
   * 投影範圍縮到九十六格之後，2048 就有每格二十一個像素，
   * 比原本「4096 罩住整個世界」還要細，成本卻只有四分之一
   */
  const shadowGenerator = new ShadowGenerator(quality.value === 'low' ? 1024 : 2048, sunLight)
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
  /**
   * 陰影要把平行光整個擋掉，不能只擋一半
   *
   * darkness 越大陰影越淡，0 是全擋、1 等於沒有影子。原本給的是 0.5，
   * 結果正午的白沙上完全看不到影子——這不是變淡，是數學上根本不存在。
   *
   * StandardMaterial 算漫射時有一道 clamp：
   *
   *     finalDiffuse = clamp(平行光 + 環境光, 0.0, 1.0) * 貼圖
   *
   * 正午的白沙正對太陽，環境光 0.72 加上平行光 1.03，合計 1.75；
   * 影子裡擋掉一半也還有 1.24。兩個數字都超過 1，clamp 之後
   * 一律變成 1.00——亮處與影子完全相同。
   *
   * 太陽很斜的凌晨黃昏，合計掉到 1 以下，影子就回來了；
   * 月光強度只有 0.3，整晚都遠在天花板以下，所以夜裡的投影一直都在。
   * 那正是「只有斜射時看得到日影、月影卻總是看得到」的原因。
   *
   * 改成全擋之後，影子裡只剩環境光的 0.72，與亮處的 1.00 就分得開了。
   * 留 0.05 是不讓它硬生生地黑掉，白沙上的影子該是柔和偏藍的一片
   */
  shadowGenerator.darkness = 0.05

  /**
   * 一律用 PCF，不用指數陰影
   *
   * 這不只是畫質取捨。投影範圍現在只罩住鏡頭附近九十六格，
   * 範圍外的地面照樣要決定自己有沒有被遮住——
   * PCF 的著色器對範圍外會直接回傳「全亮」，這正是我們要的；
   * 指數陰影那條路沒有這個判斷，範圍外會取到邊界的深度值，
   * 於是遠處的沙地會浮出一圈莫名其妙的陰影
   */
  shadowGenerator.usePercentageCloserFiltering = true
  /**
   * 投影範圍的邊緣淡出
   *
   * 範圍外是全亮的，範圍內有影子，中間若沒有過渡就會是一條筆直的分界線。
   * 讓陰影在接近邊緣時逐漸淡掉，那條線就融進去了
   */
  shadowGenerator.frustumEdgeFalloff = 0.2

  if (quality.value === 'low') {
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW
  }
  else {
    /**
     * 用高等濾波
     *
     * 這裡曾經是中等，理由是「QUALITY_HIGH 的取樣範圍大約有半格寬，
     * 草葉的影子會整條被平均掉」——那個算法是投影範圍還罩著整個世界時
     * 留下來的。範圍收到八十格見方之後，一個取樣格只有 0.039 格，
     * 高等的五乘五核心換算成世界座標也才 0.2 格，草葉的影子撐得住。
     *
     * 換上去是為了太陽移動時的邊緣抖動：光源一轉，取樣格跟著轉，
     * 邊緣必然重新取樣。硬邊會讓每一次重新取樣都看得一清二楚，
     * 邊緣柔一點，那些跳動就融進過渡帶裡了
     */
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH
  }

  /**
   * 陰影貼圖必須每一幀重畫，不要再試著降更新率
   *
   * 這裡曾經設成隔一幀畫一次，想省下那一趟幾何重繪——理由是
   * 「世界是靜態的，太陽十分鐘才走完一整天，慢得不得了」。
   * 那個理由是錯的：慢不等於不動。
   *
   * 比對用的光源矩陣是每一幀從光源當下的位置與方向重算的，
   * 深度資料卻停在上一次重畫的時刻。太陽一移動，兩者就對不起來，
   * 整片地面會浮出自我遮蔽的髒污，下一幀重畫後又消失——
   * 看起來就是地面上有黑影在閃。
   *
   * 光源位置對齊取樣格（見 trackShadowToCamera）也救不了：
   * 走路時每秒會跨過上百個取樣格，位置照樣每一幀都在變。
   *
   * 真要省，得讓光源的方向與位置也停住，只在重畫的那一刻才更新——
   * 但走動時本來就每幀都得重畫，省不到什麼
   */

  /**
   * 雲層也是投影者
   *
   * 雲是半透明的，預設不會被畫進陰影貼圖，要開 transparencyShadow。
   * 雲一邊飄，白沙上的雲影就跟著慢慢掃過去
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
    engine.value.setHardwareScalingLevel(getHardwareScalingLevel(newQuality, devicePixelRatio))

    if (pipeline.value) {
      /** 低畫質保留色調映射，關掉比較吃資源的泛光與抗鋸齒 */
      pipeline.value.bloomEnabled = newQuality !== 'low'
      pipeline.value.fxaaEnabled = newQuality !== 'low'
    }

    if (!shadowGenerator.value)
      return

    shadowGenerator.value.filteringQuality = newQuality === 'low'
      ? ShadowGenerator.QUALITY_LOW
      : ShadowGenerator.QUALITY_HIGH
  })

  onMounted(async () => {
    try {
      if (!canvasRef.value) {
        console.error('無法取得 canvas DOM')
        return
      }

      engine.value = await createEngine({ canvas: canvasRef.value })

      const devicePixelRatio = window?.devicePixelRatio ?? 1
      engine.value.setHardwareScalingLevel(getHardwareScalingLevel(quality.value, devicePixelRatio))

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
    /** 日夜循環要拿它調曝光與色調 */
    pipeline,
    initError,
  }
}
