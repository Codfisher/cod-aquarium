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
import { auditFogOptOut, optOutOfFog } from '../domains/renderer/fog-opt-out'
import { createGlowTexture } from '../domains/renderer/glow-texture'
import { registerLeafTranslucency } from '../domains/renderer/leaf-translucency'
import { registerPixelShadow } from '../domains/renderer/pixel-shadow'
import { registerAerialPerspective } from '../domains/weather/aerial-perspective'
import { GARDEN_FOG_COLOR, GARDEN_FOG_END, GARDEN_FOG_START } from '../domains/weather/atmosphere'
import { applyCloudColor, createCloudMaterial } from '../domains/weather/cloud-material'
import { disposeCloudShadow, registerCloudShadow, setCloudShadowDrift, setCloudShadowPattern } from '../domains/weather/cloud-shadow'
import { applySkyGradient, createSkyGradientMaterial } from '../domains/weather/sky-gradient'
import { getGroundY } from '../domains/world/world-access'
import { WORLD_SIZE } from '../domains/world/world-constants'
import { createSeededRandom } from '../utils/noise'
import { useDevToggles } from './use-dev-toggles'
import { useGraphicsQuality } from './use-graphics-quality'
import { measureSection } from './use-performance-probe'

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
/**
 * 天空被雲蓋掉幾成
 *
 * 這個數字同時決定地面有多少機會走進雲影裡，兩件事是同一份圖樣。
 * 給太多，貼著地平線那一圈會糊成一條連續的白帶——
 * 越遠的雲落在越低的仰角上，一成四看起來就已經是「有幾朵雲」了。
 *
 * 給太少則會回到雲影查不出來的那個老問題。雲只往 +X 飄，
 * 所以真正的下限不是「雲夠不夠多」，而是「每一條 Z 列上都要有雲經過」。
 * 量過的數字，最後那一欄是整條 Z 列從頭到尾都曬不到雲影的數量：
 *
 *   0.16 → 25 朵，地面兩成六有影，0 條
 *   0.14 → 24 朵，地面兩成四有影，0 條
 *   0.12 → 23 朵，地面兩成一有影，2 條 ← 開始有地方永遠沒有雲影
 *
 * 一成四是踩在那條線上面一點
 */
const CLOUD_COVERAGE = 0.14
/**
 * 疊出雲形狀的兩層噪音
 *
 * 密度是相對於圖樣格數的比例：低頻那一層每兩格一個格點，決定一朵雲多大；
 * 高頻那一層每格一個，權重只有三分之一，負責在邊緣咬出缺口。
 * 少了高頻那一層，每朵雲都是圓滾滾的一團，看起來像水滴不像雲
 */
const CLOUD_NOISE_OCTAVE_LIST = [
  { density: 1 / 2, weight: 1 },
  { density: 1, weight: 0.35 },
]

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
    /**
     * 不要開 canvas 的多重取樣
     *
     * 場景是畫進 DefaultRenderingPipeline 的離屏貼圖，
     * canvas 那份 MSAA 緩衝區只接得到最後那一張全螢幕方塊——
     * 上面沒有任何幾何邊緣可以抗鋸齒，等於白配置一份記憶體與頻寬。
     * 真正在做抗鋸齒的是管線裡的 FXAA
     */
    return new Engine(canvas, false, {
      antialias: false,
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })
  },
  createScene({ engine }) {
    /**
     * 大氣透視要搶在所有材質之前掛上
     *
     * 材質外掛是靠「材質被建立」這個事件自己接上去的，
     * 註冊晚一步，先建好的那幾份材質就永遠收不到——
     * 畫面上會看到部分方塊有兩層空氣、部分只有單色霧
     */
    registerAerialPerspective()
    /**
     * 另外三道也是材質外掛，同樣要搶在材質之前
     *
     * 雲影與像素陰影改的是光照那一段，葉片透光是加在霧之前的一項。
     * 三者互不相干，掛上去的先後順序沒有影響——
     * 要緊的只有「比第一份材質早」這件事
     */
    registerCloudShadow()
    registerLeafTranslucency()
    registerPixelShadow()

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
    trackDevToggles(scene)
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
 * 除錯開關裡直接掛在場景上的那幾項
 *
 * 日月的光暈是兩顆有名字的網格，關掉就是把它們藏起來。
 * 每一幀查兩個布林是不划算的，但這是除錯用的路徑，
 * 開關要立刻反應才有意義——而它的成本也就只有兩次查詢
 */
function trackDevToggles(scene: Scene) {
  const { state } = useDevToggles()

  scene.onBeforeRenderObservable.add(() => {
    for (const name of [SUN_GLOW_NAME, MOON_GLOW_NAME]) {
      const mesh = scene.getMeshByName(name)
      if (mesh && mesh.isEnabled(false) !== state.skyGlow) {
        mesh.setEnabled(state.skyGlow)
      }
    }
  })
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
    zenithColor: new Color3(0.26, 0.52, 0.98),
    midColor: new Color3(0.6, 0.78, 0.99),
    horizonColor: GARDEN_FOG_COLOR,
    glowColor: new Color3(1, 0.98, 0.9),
    counterColor: new Color3(0.8, 0.88, 0.98),
    glowStrength: 0.12,
    sunDirection: SUN_DIRECTION.scale(-1),
  })

  const skyDome = MeshBuilder.CreateBox(SKYBOX_NAME, { size: 260 }, scene)
  skyDome.material = skyMaterial
  skyDome.infiniteDistance = true
  skyDome.isPickable = false
  optOutOfFog(skyDome, '天色本身就是白幕的顏色，由 sky-gradient 每幀收成霧色')

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
  /** 上一次拿到的貼圖寬度，換過就得重算取樣格 */
  let knownMapSize = 0

  scene.onBeforeRenderObservable.add(() => {
    measureSection('陰影追蹤', () => {
      const light = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
      const camera = scene.activeCamera
      if (!light || !camera)
        return

      const mapSize = light.getShadowGenerator()?.getShadowMap()?.getSize().width
      if (!mapSize)
        return

      /** 貼圖尺寸換了就重算，不然會拿舊的格子去對齊新的貼圖 */
      if (mapSize !== knownMapSize) {
        knownMapSize = mapSize
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

      /**
       * 投影到光源的三軸上，三軸都要對齊取樣格
       *
       * 橫向與縱向對齊是為了讓邊緣落在同一批取樣點上，這是老問題。
       *
       * 深度那一軸原本沒對齊，理由是「不影響取樣格的位置」——那是對的，
       * 但它影響存進去的深度值。光源沿著光線連續前後移動時，
       * 同一個表面每一幀被記下來的深度都差一點點，
       * 而比較深度是有門檻的：那些剛好卡在門檻上的取樣點會在
       * 「被自己擋住」與「沒被擋住」之間反覆翻面，看起來就是邊緣在閃。
       *
       * 三軸一起對齊之後，只要人沒有跨過一格取樣格，
       * 整張陰影貼圖就是上一幀那一張，一個像素都不會變
       */
      const alongRight = Math.round(Vector3.Dot(camera.position, right) / texelSize) * texelSize
      const alongUp = Math.round(Vector3.Dot(camera.position, up) / texelSize) * texelSize
      const alongForward = Math.round(Vector3.Dot(camera.position, forward) / texelSize) * texelSize

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
  optOutOfFog(disc, '交給 atmosphere.skyBodyFade 淡出，貼近邊界時歸零')

  createSunGlow(scene)

  return material
}

/**
 * 光暈的網格半徑要對應貼圖的內切圓
 *
 * 圓盤的 UV 是「邊緣落在貼圖內切圓上」，而放射狀漸層的外徑正是那個圓。
 * 所以圓盤半徑等於原本方片邊長的一半，暈的大小才不會變
 */
function createGlowMesh(name: string, planeSize: number, scene: Scene): Mesh {
  /**
   * 用圓盤，不要用方片
   *
   * 光暈的衰減是放射狀的，網格的形狀本來就該跟著它。
   * 方片的四個角落在衰減曲線之外，那一圈永遠是浪費掉的片元；
   * 更要緊的是，一旦邊界上還剩下任何一點亮度，
   * 露出來的會是一個方形——而圓盤露出來的至少是一圈圓
   */
  const mesh = MeshBuilder.CreateDisc(
    name,
    { radius: planeSize / 2, tessellation: 48 },
    scene,
  )
  mesh.isPickable = false
  optOutOfFog(mesh, '交給 atmosphere.skyBodyFade 淡出，貼近邊界時歸零')
  mesh.infiniteDistance = true
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL

  return mesh
}

/** 太陽外圍的光暈，讓方形太陽不至於像貼上去的白紙 */
function createSunGlow(scene: Scene) {
  const texture = createGlowTexture(SUN_GLOW_NAME, scene, [217, 211, 182])

  const material = createSkyBodyMaterial(`${SUN_GLOW_NAME}-material`, texture, scene)
  material.emissiveColor = new Color3(1, 1, 1)

  const glow = createGlowMesh(SUN_GLOW_NAME, 48, scene)
  glow.material = material
  glow.position = SUN_DIRECTION.scale(-112)

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
  optOutOfFog(disc, '交給 atmosphere.skyBodyFade 淡出，貼近邊界時歸零')

  createMoonGlow(scene)

  return material
}

/** 月亮外圍那一圈冷色的暈，夜裡的空氣感靠它 */
function createMoonGlow(scene: Scene) {
  const texture = createGlowTexture(MOON_GLOW_NAME, scene, [103, 112, 128])

  const material = createSkyBodyMaterial(`${MOON_GLOW_NAME}-material`, texture, scene)
  material.emissiveColor = new Color3(1, 1, 1)

  const glow = createGlowMesh(MOON_GLOW_NAME, 40, scene)
  glow.material = material
  glow.position = SUN_DIRECTION.scale(112)

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
  optOutOfFog(dome, '星空整層交給 atmosphere.skyBodyFade 淡出')

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
 * 平滑內插用的曲線
 *
 * 兩端的斜率都是零，接起來的格點之間才看不出直線的痕跡
 */
function smoothRatio(ratio: number): number {
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 可平鋪的值噪音
 *
 * 先在稀疏的格點上灑亂數，再平滑內插放大到圖樣的大小。
 * 讀格點時座標繞回去，所以放大出來的結果本身就是無縫平鋪的。
 *
 * 這是循環世界的硬性條件，一般的連續噪音給不了：
 * simplex 那類函式沒有週期，接縫上兩側的值對不起來
 */
function createTileableNoise(
  random: () => number,
  size: number,
  pointCount: number,
): number[] {
  const pointList = Array.from({ length: pointCount * pointCount }, () => random())
  const readPoint = (x: number, z: number) => {
    const wrappedX = ((x % pointCount) + pointCount) % pointCount
    const wrappedZ = ((z % pointCount) + pointCount) % pointCount
    return pointList[wrappedZ * pointCount + wrappedX] ?? 0
  }

  const scale = pointCount / size
  return Array.from({ length: size * size }, (_, index) => {
    const x = (index % size) * scale
    const z = Math.floor(index / size) * scale
    const baseX = Math.floor(x)
    const baseZ = Math.floor(z)
    const ratioX = smoothRatio(x - baseX)
    const ratioZ = smoothRatio(z - baseZ)

    const top = readPoint(baseX, baseZ) * (1 - ratioX)
      + readPoint(baseX + 1, baseZ) * ratioX
    const bottom = readPoint(baseX, baseZ + 1) * (1 - ratioX)
      + readPoint(baseX + 1, baseZ + 1) * ratioX

    return top * (1 - ratioZ) + bottom * ratioZ
  })
}

/**
 * 雲的圖樣
 *
 * 原本這裡是細胞自動機（相鄰滿五格就長雲）加上「削掉過大的雲團」兩道。
 * 那組規則其實是收斂到空的：起始填充率不到一半時，四回合下來剩不到一成，
 * 而削雲團那一段又是整團由外往內剝一圈、連剝六回——
 * 一大塊會被剝到只剩正中心幾格。
 *
 * 實際跑出來全世界只有十二格雲，而且全擠在同一條 Z 帶上。
 * 雲只往 +X 飄，那條帶以外的地面於是從頭到尾都不會有雲經過——
 * 雲影查了很久查不出來，真正的原因就在這裡，著色器一直是好的。
 *
 * 改成兩層噪音疊起來、取分位數當門檻。覆蓋率是指定的而不是算出來的，
 * 低頻那一層決定一朵雲多大，高頻那一層負責咬出邊緣的缺口
 */
function createCloudPattern(random: () => number, size: number): boolean[] {
  const fieldList = Array.from({ length: size * size }, () => 0)

  for (const octave of CLOUD_NOISE_OCTAVE_LIST) {
    const noiseList = createTileableNoise(random, size, Math.round(size * octave.density))
    for (let index = 0; index < fieldList.length; index++) {
      fieldList[index] = (fieldList[index] ?? 0) + (noiseList[index] ?? 0) * octave.weight
    }
  }

  /**
   * 門檻取分位數而不是給定值
   *
   * 兩層噪音疊起來的分布會隨權重跑，寫死一個值就得重新試一輪。
   * 由大到小排完取第 N 名當門檻，說覆蓋幾成就真的是幾成
   */
  const sortedList = fieldList.slice().sort((a, b) => b - a)
  const threshold = sortedList[Math.floor(sortedList.length * CLOUD_COVERAGE)] ?? Infinity

  return fieldList.map((value) => value > threshold)
}

/**
 * Minecraft 風格的雲層
 *
 * 每一朵雲都是實際的方塊，不是貼圖，所以看得到厚度與側面。
 * 整片雲是一個網格，成本只有一個 draw call。
 * 這層雲同時也是投影者，地面上會有雲影慢慢掃過
 */
function createCloudLayer(scene: Scene) {
  /**
   * 圖樣本身的格數
   *
   * 格數乘上格寬必須剛好等於世界寬度。這是循環世界的硬性條件：
   * 玩家跨過邊界時位置會平移一整個世界的距離，
   * 雲的圖樣若不是同一個週期，整片天會在那一瞬間換一副樣子——
   * 那是全場景唯一不吃霧氣、藏不住的東西。
   *
   * 直接由世界寬度除出來。原本這裡寫死 18，乘上格寬 14 是 252，
   * 而世界寬度是 280，兩個數字其實從來沒對上過；除出來就不會再有下一次
   */
  const patternCount = Math.round(WORLD_SIZE / CLOUD_CELL_SIZE)
  /** 平鋪幾份，鋪得夠大才不會在天邊看到雲層的邊界 */
  const tileCount = 9

  const random = createSeededRandom('minespace-cloud')
  const cellList = createCloudPattern(random, patternCount)

  const readCell = (grid: boolean[], x: number, z: number) => {
    /** 座標繞回去，圖樣才能無縫平鋪 */
    const wrappedX = ((x % patternCount) + patternCount) % patternCount
    const wrappedZ = ((z % patternCount) + patternCount) % patternCount
    return grid[wrappedZ * patternCount + wrappedX] === true
  }

  /**
   * 地上那塊暗要與頭頂這朵雲是同一朵
   *
   * 雲影拿的就是這份圖樣。與其在著色器裡另外鋪一張噪聲——
   * 那會是另一副雲——不如把算好的結果交過去。
   * 何況這個世界是循環的，雲影的週期非得與雲一樣不可
   */
  setCloudShadowPattern(scene, cellList, patternCount, CLOUD_CELL_SIZE, CLOUD_HEIGHT)

  const material = createCloudMaterial(`${CLOUD_LAYER_NAME}-material`, scene)
  applyCloudColor(material, {
    color: new Color3(1, 1, 1),
    hazeColor: GARDEN_FOG_COLOR,
    visibleRatio: 1,
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
  optOutOfFog(cloudMesh, '交給 use-weather 的 cloudFadeRatio 淡到全透明')
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
    measureSection('雲飄移', () => {
      elapsed += scene.getEngine().getDeltaTime() / 1000
      cloudMesh.position.x = (elapsed * CLOUD_DRIFT_SPEED) % driftPeriod
      /** 地上的雲影要跟著一起飄，不然影子會停在原地 */
      setCloudShadowDrift(cloudMesh.position.x)
    })
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
  optOutOfFog(dome, '它自己就是那道白幕，由 use-weather 的 overcastRatio 蓋滿')

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
    measureSection('營火動畫', () => {
      elapsed += scene.getEngine().getDeltaTime() / 1000
      const nextFrame = Math.floor(elapsed * FLAME_FRAME_RATE) % FLAME_FRAME_COUNT
      if (nextFrame === currentFrame)
        return

      currentFrame = nextFrame
      drawFlameFrame(context, size, currentFrame)
      texture.update()
    })
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

  /**
   * 這裡不做色彩分級
   *
   * 曾經掛過一張算出來的立體查找表，想在日夜的色調曲線底下
   * 再墊一層「這個世界是什麼調子」——抬暗部、補亮部的暖、
   * 一條 S 形曲線、把過飽和的綠收一點。
   *
   * 拿掉的理由有兩個。收益太小是其一：實測下來最大的變化是 8/255，
   * 多數落在 1 到 5 之間，是並排比較才看得出來的量級。
   *
   * 代價卻不小，這是其二。查找表的取樣走三線性內插，等於把一條平滑的
   * 曲線換成幾十段折線，而每個節點上斜率會跳一下。天空的漸層加上
   * 光暈那層放射狀的亮度都是極平滑的東西，兩者相加之後，
   * 某一圈等亮度線壓在節點上就會浮出一道看得見的輪廓——
   * 光源外面那個「淡淡的圓」正是這麼來的。
   *
   * 一個看不太出來的效果，換一個看得很清楚的瑕疵，不划算
   */

  /**
   * 打散色階
   *
   * 天空那個著色器自己已經加過雜訊了，但那是在它那一層。
   * 畫面之後還要經過色調映射、查找表與色調曲線，出來時重新量化成八位元，
   * 一整片從天頂到天邊的漸層又會浮出一圈圈的等高線。
   *
   * 以前這件事有一半是 FXAA 順手做掉的——它把落差大的地方抹開，
   * 色階的邊界剛好也算落差。抗鋸齒換成多重取樣之後那個副作用沒了，
   * 得由這一項正面處理。成本是每個像素一次雜訊，
   * 換來的是肉眼看不見的顆粒取代看得見的圈
   */
  pipeline.imageProcessing.ditheringEnabled = true

  /**
   * 泛光關掉
   *
   * 這是量出來的決定，不是取捨。
   *
   * 泛光跑在色調映射之前，看到的是線性值。這個場景的光是滿的，
   * 被曬到的白沙算出來大約一點九，門檻原本擺在 0.86 等於整片地、
   * 整片霧、連藍天的藍通道都在發光，天地交界因此糊出一圈白暈。
   * 為了治那圈白暈，門檻被拉到兩點二——
   * 但那個高度已經超過場景裡最亮的東西，於是泛光什麼都沒做。
   *
   * 而它的成本是無條件的：不管有沒有東西夠亮，那三趟全螢幕的
   * 取樣、模糊與合併每一幀都要跑（官方論壇量過，關掉泛光是
   * 五成五的 GPU、開著就滿載，連把模糊半徑收到 1 都還有九成）。
   *
   * 一個什麼都沒做卻每幀收費的效果，就該關掉。
   * 日後若想要燈火在夜裡發光，該做的是把門檻降到燈火那一階，
   * 而不是把它一直開著
   */
  pipeline.bloomEnabled = false

  /**
   * 抗鋸齒交給多重取樣，不要用 FXAA
   *
   * 這兩者處理的根本不是同一件事。FXAA 是一道後製：它拿畫好的成品去找
   * 亮度落差大的地方，再把那一帶抹開。它分不出「這條邊是幾何的邊緣」
   * 還是「這是貼圖上本來就該有的兩格不同顏色的像素」——
   * 而這個世界的貼圖是十六格見方的像素畫，滿滿都是後者。
   * 開著 FXAA 等於把整片牆的圖案輕輕糊掉一層，
   * 那正是這套美術最不該失去的東西。
   *
   * 多重取樣則發生在光柵化的當下，只對真正的幾何邊緣多取幾個樣本：
   * 方塊的稜線平順了，貼圖一個像素都沒被動到。
   *
   * 代價是它得配置一份多重取樣的緩衝區、每一幀多一次解析。
   * 低畫質維持原樣（兩者都不開），那裡本來就在跟頻寬計較
   */
  pipeline.fxaaEnabled = false

  return pipeline
}

/**
 * 幾何邊緣的取樣數
 *
 * 四倍是甜蜜點：方塊的斜稜線已經看不出階梯，
 * 再往上加只換得到量不出來的差別，頻寬卻是線性成長
 */
const HIGH_QUALITY_SAMPLE_COUNT = 4

/** 依畫質決定多重取樣的樣本數，一是關閉 */
function getSampleCount(quality: GraphicsQuality): number {
  return quality === 'low' ? 1 : HIGH_QUALITY_SAMPLE_COUNT
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

/**
 * 接觸硬化時，光源在陰影貼圖上佔多寬
 *
 * 這個數字就是「太陽有多大」。太陽在天上只張開半度，
 * 給得太大，一根柱子離地兩格影子就散得看不出形狀；
 * 給得太小則與硬邊的 PCF 沒有分別。
 * 這裡的投影範圍是八十格見方，0.05 換算下來大約是四格的光源直徑——
 * 貼著地的那一段仍然銳利，樹冠那一段已經化開
 */
const CONTACT_HARDENING_LIGHT_SIZE = 0.05

/**
 * 陰影的濾波方式
 *
 * 高畫質走接觸硬化（PCSS）：先找出擋在前面的是什麼、離得多遠，
 * 再依那段距離決定要模糊多寬。影子因此在物體的根部是銳利的、
 * 離遠了才散開——鳥居的柱腳、樹幹的底部會真的「站」在地上，
 * 而不是浮在一片同樣柔軟的灰上。
 *
 * 這是整份清單裡最貴的一項：中等品質是十六次遮蔽搜尋加三十二次比較，
 * 大約是原本 PCF 五乘五的兩倍。所以只給高畫質，
 * 低畫質維持最省的那條路。要退回去的話，把這裡換成
 * usePercentageCloserFiltering 就是原本的樣子
 */
function applyShadowFiltering(shadowGenerator: ShadowGenerator, quality: GraphicsQuality): void {
  if (quality === 'low') {
    shadowGenerator.usePercentageCloserFiltering = true
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW
    return
  }

  shadowGenerator.useContactHardeningShadow = true
  shadowGenerator.contactHardeningLightSizeUVRatio = CONTACT_HARDENING_LIGHT_SIZE
  /**
   * 用中等，不用高等
   *
   * 高等是三十二次遮蔽搜尋加六十四次比較，那個級距是給
   * 「畫面上只有幾樣東西」的展示場景用的。這裡整片視野都是方塊，
   * 中等已經看不出顆粒，成本只有一半
   */
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
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
  /**
   * 高光給滿，讓材質自己決定要反射多少
   *
   * 這裡原本是 0.1。乘上方塊材質的 0.08 之後只剩 0.008——
   * 也就是整個場景實質上沒有高光這回事。
   * 那在只有乾方塊的時候看不出問題，但高光是這套渲染裡
   * 唯一能突破亮度上限的通道（漫射與自發光在乘上貼圖之前
   * 就被夾在 1.0，高光則是加在那道 clamp 外面的），
   * 濕掉的木板與水面能不能真的反出一道光，全靠它。
   *
   * 所以光源這一端給滿，「這個表面有多亮」交還給各自的材質：
   * 乾方塊 0.02 幾乎是霧面、淋濕的表面 0.42、水面 0.8。
   * 高光也會跟著光源強度縮放，所以夜裡的月光只留下很淡的一道
   */
  sunLight.specular = new Color3(1, 1, 1)

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
   * 不用指數陰影
   *
   * 這不只是畫質取捨。投影範圍現在只罩住鏡頭附近九十六格，
   * 範圍外的地面照樣要決定自己有沒有被遮住——
   * PCF 與接觸硬化的著色器對範圍外都會直接回傳「全亮」，
   * 這正是我們要的；指數陰影那條路沒有這個判斷，
   * 範圍外會取到邊界的深度值，於是遠處的沙地會浮出一圈莫名其妙的陰影
   */
  applyShadowFiltering(shadowGenerator, quality.value)
  /**
   * 投影範圍的邊緣淡出
   *
   * 範圍外是全亮的，範圍內有影子，中間若沒有過渡就會是一條筆直的分界線。
   * 讓陰影在接近邊緣時逐漸淡掉，那條線就融進去了
   */
  shadowGenerator.frustumEdgeFalloff = 0.2

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
   * 雲影不走陰影貼圖，走的是材質外掛
   *
   * 這裡曾經把雲層加進投影者，還為此開了 transparencyShadow
   * （雲是半透明的，預設不會被畫進陰影貼圖）。那條路走不通，原因在數字上：
   *
   * 投影用的鏡頭只沿著光線退開九十格，而雲在一百零四格高。
   * 沙面在六格，太陽仰角約三十八度時，遮住腳下這一點的那朵雲
   * 位在光線上游一百五十三格處——遠在投影鏡頭的近截面之外，
   * 根本沒被畫進深度圖。太陽要爬到六十三度以上雲才進得了範圍，
   * 而這個世界的太陽從來沒那麼高。
   *
   * 就算進得了範圍也只罩得住鏡頭附近八十格見方那一塊，
   * 而雲影該是鋪滿整片視野、一路延伸到天邊的東西。
   *
   * 改由 cloud-shadow 那支材質外掛直接在著色器裡算：
   * 沿著光線往上找雲的圖樣，沒有距離上限，也不必把雲畫進深度圖
   */

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

  const { state: devToggle } = useDevToggles()

  /**
   * 除錯開關：管線與陰影那幾項
   *
   * 這幾樣都是設一個屬性就生效的，用 watch 接就好，
   * 不必像光暈那樣每一幀去查
   */
  watch(
    () => [devToggle.dithering, devToggle.multiSample, devToggle.contactShadow],
    () => {
      if (pipeline.value) {
        pipeline.value.imageProcessing.ditheringEnabled = devToggle.dithering
        pipeline.value.samples = devToggle.multiSample ? getSampleCount(quality.value) : 1
        /** 關掉多重取樣時補回 FXAA，才比較得出兩者的差別 */
        pipeline.value.fxaaEnabled = !devToggle.multiSample && quality.value !== 'low'
      }

      if (shadowGenerator.value) {
        applyShadowFiltering(
          shadowGenerator.value,
          devToggle.contactShadow ? quality.value : 'low',
        )
      }
    },
  )

  watch(quality, (newQuality) => {
    if (!engine.value)
      return

    const devicePixelRatio = window?.devicePixelRatio ?? 1
    engine.value.setHardwareScalingLevel(getHardwareScalingLevel(newQuality, devicePixelRatio))

    if (pipeline.value) {
      /** 低畫質保留色調映射，關掉比較吃頻寬的多重取樣 */
      pipeline.value.samples = getSampleCount(newQuality)
    }

    if (!shadowGenerator.value)
      return

    applyShadowFiltering(shadowGenerator.value, newQuality)
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
      pipeline.value.samples = getSampleCount(quality.value)

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

      /**
       * 東西都建好了才掃
       *
       * 掃的是「有誰跳出了霧卻沒交代到邊界怎麼收」。
       * 世界邊界那道白幕靠霧遮，跳出霧的每一個都得自己接一條路，
       * 而漏掉的症狀是走到邊界還看得到它——通常沒人會特地走過去確認
       */
      if (import.meta.env.DEV) {
        auditFogOptOut(scene.value)
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Babylon] 初始化失敗:', error)
      initError.value = message
    }
  })

  onBeforeUnmount(() => {
    /**
     * 雲的覆蓋圖存在模組層，場景收掉不會連它一起收
     *
     * 那張圖是掛在場景上的，隨場景一起釋放沒錯，
     * 但模組裡那個參照會指著一張已經死掉的貼圖——
     * 下一次進來時若還沒重新生出圖樣，材質就會綁到它
     */
    disposeCloudShadow()
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
