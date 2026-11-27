import type { ImageProcessingConfiguration, Mesh, Observer, Scene, UniformBuffer, UniversalCamera } from '@babylonjs/core'
import type { RealmMirrorTarget } from '../realm/realm-definition'
import type { GardenId } from './garden-layout'
import {
  Color3,
  DynamicTexture,
  Material,
  MaterialPluginBase,
  MeshBuilder,
  MirrorTexture,
  Plane,
  RenderTargetTexture,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import {
  CLOUD_LAYER_NAME,
  MOON_DISC_NAME,
  MOON_GLOW_NAME,
  OVERCAST_NAME,
  SKYBOX_NAME,
  STAR_FIELD_NAME,
  SUN_DISC_NAME,
  SUN_GLOW_NAME,
} from '../../composables/use-babylon-scene'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { BLOCK_DEFS, BlockId, isWaterBlock, LIQUID_SURFACE_DROP } from '../block/block-constants'
import { BLOCK_MESH_PREFIX } from '../renderer/voxel-renderer'
import { CLOUD_REFLECTION_MATERIAL_NAME } from '../weather/volumetric-cloud/volumetric-cloud'
import { getBlock } from '../world/world-access'
import { WORLD_HEIGHT } from '../world/world-constants'
import { getGarden } from './garden-layout'

/**
 * 反射面是哪一種東西
 *
 * 兩者的差別不只在方塊種類，還在頂面的高度：
 * 水是液體，最上層那一格會矮掉八分之一格；冰是實心方塊，頂面就是格子的頂面。
 * 差的那一點點會讓倒影浮在冰面上方或沉進冰裡
 */
type SurfaceKind = RealmMirrorTarget['surface']

/**
 * 哪幾座箱庭要映東西
 *
 * 這是一份刻意的名單，不是「有水就映」。
 * 世界上零星的水窪、湯屋的岩池、海岸那片淺灘都有水，
 * 但倒影是要付錢的——一面鏡子等於那一帶的地景多畫一趟。
 * 值得付的是「那面反光本身就是這座箱庭主題」的那幾座
 */
const HUB_MIRROR_GARDEN_LIST: { garden: GardenId; surface: SurfaceKind }[] = [
  { garden: 'pond', surface: 'water' },
  { garden: 'swamp', surface: 'water' },
  { garden: 'cave', surface: 'water' },
  { garden: 'rainvale', surface: 'water' },
  /** 山腳下那窪凍住的融雪池 */
  { garden: 'alpine', surface: 'ice' },
]

/**
 * 大廳的鏡面：上面那份名單換成各箱庭木座的範圍
 *
 * 大場景沒有箱庭，鏡面直接寫在 RealmDefinition 的 mirrorTargetList；
 * 兩邊用同一種格式，createWaterMirrors 不必知道自己在哪個場景
 */
export const HUB_MIRROR_TARGET_LIST: RealmMirrorTarget[] = HUB_MIRROR_GARDEN_LIST.map(({ garden, surface }) => {
  const { center, halfSize } = getGarden(garden)
  return { id: garden, centerX: center.x, centerZ: center.z, halfSize, surface }
})

/** 這一格算不算反射面 */
function isSurfaceBlock(blockId: BlockId, surface: SurfaceKind): boolean {
  if (surface === 'ice')
    return blockId === BlockId.ICE || blockId === BlockId.PACKED_ICE

  return isWaterBlock(blockId)
}

/**
 * 倒影面比水面再高一點點
 *
 * 兩片幾乎同高的半透明面會互相爭深度，畫面上是一片閃爍的雜訊。
 * 抬高兩公分，深度就分得開了，而兩公分在畫面上量不出來
 */
const SURFACE_LIFT = 0.02

/**
 * 倒影面比水面實際範圍再收窄多少
 *
 * 岸線是吃噪音生成的，凹凸不定。量出來的半徑是最外那一格的距離，
 * 照著鋪會讓倒影漫到岸上的草地。收掉三分之一格再讓邊緣淡出剛好
 */
const RADIUS_INSET = 0.35

/**
 * 一片水要多少格才值得給它一面鏡子
 *
 * 箱庭裡常有一兩格的水缽或滴水，那種東西給了鏡子也看不出來，
 * 只是白白多一張算繪目標
 */
const MIN_WATER_COLUMN_COUNT = 9

/**
 * 倒影貼圖的解析度
 *
 * 倒影本來就不該比實景銳利，一方水池用二五六看不出差別。
 * 但蛙聲澤那片水量出來半徑將近二十格，同一張圖攤在四十格見方的面上
 * 只剩每格六個像素，倒影會糊成一片色塊——解析度得跟著範圍走。
 *
 * 走到水邊掉幀的話，這兩個數字是第一個該減半的——
 * 現在它們住在畫質設定表裡（mirrorSizeSmall / mirrorSizeLarge），
 * 每一級各有一組，最省的那一級給零就是整個不做
 */

/** 超過這個半徑就換大張的 */
const LARGE_MIRROR_RADIUS = 10

/**
 * 倒影在水面上佔多少，剩下的是水自己的顏色
 *
 * 第一版整面一律五成，看起來像一張半透明的照片平鋪在水上。
 * 真的水面是菲涅耳：低頭往下看幾乎是透明的，看得到池底的黏土與睡蓮；
 * 越貼著水面望過去越像鏡子，對岸的松、石與紙燈完整地倒過來。
 * 中間照 (1 - 視線與法線夾角的餘弦) 的平方混過去
 */
const MIRROR_STRENGTH_FACING = 0.22
const MIRROR_STRENGTH_GRAZING = 0.9

/**
 * 倒影的微微晃動（倒影貼圖座標的位移量）
 *
 * 鏡水涵虛：池面是靜的，只有一點點呼吸。兩組慢的正弦交疊，
 * 位移量只有千分之二點五的畫面，倒影的邊緣輕輕地抖，不會碎成一片。
 * 只動倒影的取樣座標，睡蓮、木板與水本身都不動
 */
const MIRROR_RIPPLE_STRENGTH = 0.0025

/** 把菲涅耳與晃動掛上倒影的材質；外掛建構時就把自己登記在材質上，不必留著參考 */
function attachMirrorSurface(material: StandardMaterial): void {
  // eslint-disable-next-line no-new
  new MirrorSurfacePlugin(material)
}

/** 方塊網格的名字（block_<id>、block_<id>_surface、block_face_<id>…）是不是液體 */
function isLiquidMesh(name: string): boolean {
  const match = /^(?:deco_|face_)?(\d+)/.exec(name.slice(BLOCK_MESH_PREFIX.length))
  return !!match && !!BLOCK_DEFS[Number(match[1]) as BlockId]?.isLiquid
}

/**
 * 倒影的模糊（像素）
 *
 * 倒影貼圖只有兩三百像素見方，攤在池面上一格一格的像素很明顯；
 * 輕輕糊一點，倒影才是柔的。兩道模糊都畫在那張小圖上
 */
const MIRROR_BLUR_KERNEL = 4

/**
 * 倒影的表面：菲涅耳透明度與微微的晃動
 *
 * StandardMaterial 內建的透明度菲涅耳是「加」在透明度上的，會把邊緣淡出的遮罩加回來，
 * 池子四個角就露出方形的邊；鏡面的反射座標是投影算的，凹凸貼圖也擾動不到它。
 * 兩件事都只好自己寫：取樣之前把座標推一點，畫完之前把透明度乘上菲涅耳
 */
class MirrorSurfacePlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性 */
    super(material, 'MinespaceMirrorSurface', 220, {}, true, true)
  }

  getClassName(): string {
    return 'MirrorSurfacePlugin'
  }

  getUniforms() {
    return {
      ubo: [{ name: 'mirrorSurface', size: 4, type: 'vec4' }],
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    /** 秒數取一千的餘數，浮點數才不會因為開著太久而失去精度 */
    uniformBuffer.updateFloat4(
      'mirrorSurface',
      (performance.now() / 1000) % 1000,
      MIRROR_RIPPLE_STRENGTH,
      MIRROR_STRENGTH_FACING,
      MIRROR_STRENGTH_GRAZING,
    )
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      'CUSTOM_FRAGMENT_DEFINITIONS': `
        vec2 measureMirrorRipple(vec2 position) {
          float time = mirrorSurface.x;
          return vec2(
            sin(position.x * 1.7 + time * 0.9) * sin(position.y * 1.3 - time * 0.7),
            sin(position.y * 1.9 + time * 0.8) * sin(position.x * 1.1 + time * 0.6)
          ) * mirrorSurface.y;
        }
      `,
      /** 倒影貼圖的取樣座標：Babylon 在翻轉 y 之後馬上取樣，就插在那一行後面 */
      '!coords\\.y\\s*=\\s*1\\.0\\s*-\\s*coords\\.y;': 'coords.y=1.0-coords.y;coords+=measureMirrorRipple(vPositionW.xz);',
      'CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR': `
        float mirrorGrazing = 1.0 - clamp(abs(dot(viewDirectionW, normalW)), 0.0, 1.0);
        color.a *= mix(mirrorSurface.z, mirrorSurface.w, mirrorGrazing * mirrorGrazing);
      `,
    }
  }
}

/**
 * 走多近才開始畫倒影
 *
 * 超過這個距離就把整張圖從算繪清單裡拿掉——不是畫得淡一點，
 * 是完全不畫。倒影只有站在水邊時看得到，
 * 沒有理由讓人在半座禪庭以外的地方替它付錢。
 *
 * 四座箱庭彼此相距數十格，所以同一刻至多只有一面鏡子在畫
 */
const ACTIVE_DISTANCE = 30

/** 距離檢查的間隔（秒），這件事不必每一幀做 */
const CHECK_INTERVAL = 0.3

export interface WaterMirrors {
  dispose: () => void;
}

/**
 * 邊緣淡出的遮罩
 *
 * 中心是滿的、往外收到全透明。倒影面是一片方形的板子，
 * 沒有這層遮罩的話，水池的四個角會露出筆直的邊
 */
function createFadeTexture(scene: Scene): DynamicTexture {
  const size = 128
  const texture = new DynamicTexture('water-mirror-fade', { width: size, height: size }, scene, true)
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.62, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  return texture
}

interface WaterSurface {
  centerX: number;
  centerZ: number;
  /** 水面的世界高度，倒影面就貼在這裡 */
  surfaceY: number;
  /** 水真正佔到的範圍，兩個軸各自量 */
  halfWidth: number;
  halfDepth: number;
  /** 兩個半徑取長的那一個，挑貼圖解析度與判斷遠近用 */
  radius: number;
}

/**
 * 從世界資料量出這座箱庭的水面
 *
 * 這件事原本是寫死的：水鏡池的半徑 4.3、高度取木座那一格。
 * 四座箱庭的水各有各的高度與形狀——岩響窟的水在洞裡、
 * 聽雨亭的是一方淺池——照著抄四組座標，只要地形生成改一次就全錯，
 * 而且錯的樣子是「倒影浮在半空中」，沒走到那裡不會發現。
 *
 * 改成掃：逐格柱找最上層的水，照高度分組，取格數最多的那一層。
 * 分組是必要的，一座箱庭可能同時有主池與岸邊的小水窪，
 * 兩者高度不同，混在一起算出來的中心會落在兩池之間的岸上
 */
function measureReflectiveSurface(
  worldState: Uint8Array,
  target: RealmMirrorTarget,
): WaterSurface | null {
  const minX = Math.floor(target.centerX - target.halfSize)
  const maxX = Math.ceil(target.centerX + target.halfSize)
  const minZ = Math.floor(target.centerZ - target.halfSize)
  const maxZ = Math.ceil(target.centerZ + target.halfSize)

  /** 水面高度 → 落在那一層的格柱 */
  const layerMap = new Map<number, { x: number; z: number }[]>()

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        if (!isSurfaceBlock(getBlock(worldState, x, y, z), target.surface))
          continue

        const columnList = layerMap.get(y)
        if (columnList) {
          columnList.push({ x, z })
        }
        else {
          layerMap.set(y, [{ x, z }])
        }
        break
      }
    }
  }

  let topLayerY = -1
  let topColumnList: { x: number; z: number }[] = []
  for (const [y, columnList] of layerMap) {
    if (columnList.length <= topColumnList.length)
      continue
    topLayerY = y
    topColumnList = columnList
  }

  if (topColumnList.length < MIN_WATER_COLUMN_COUNT)
    return null

  /**
   * 用外接矩形，不用「重心加最遠一格的距離」
   *
   * 那個算法會把面積灌水，而且水愈散愈嚴重。蛙聲澤的水鋪滿整座箱庭，
   * 重心落在正中央、最遠的是四個角，量出來的半徑是 14 × √2 ≈ 19.8，
   * 於是鋪出一面四十格見方的鏡子——而那座箱庭的木座只有三十二格寬。
   *
   * 多出來的那四格從台座邊緣探出去，懸在外圈的石板路上方。
   * 那面鏡子是半透明的，貼著地平視過去就是一整片washed 的倒影
   * 蓋在路面與台壁上，看起來像整個水面漏了出來。
   *
   * 外接矩形量的是水真正佔到的範圍，鋪不出水面以外的地方。
   * 中心也一起改成矩形的中心：水池偏在箱庭一角時，
   * 重心與外接矩形的中心是兩個位置，用錯了鏡子會歪一邊
   */
  let waterMinX = Number.POSITIVE_INFINITY
  let waterMaxX = Number.NEGATIVE_INFINITY
  let waterMinZ = Number.POSITIVE_INFINITY
  let waterMaxZ = Number.NEGATIVE_INFINITY
  for (const column of topColumnList) {
    waterMinX = Math.min(waterMinX, column.x)
    waterMaxX = Math.max(waterMaxX, column.x)
    waterMinZ = Math.min(waterMinZ, column.z)
    waterMaxZ = Math.max(waterMaxZ, column.z)
  }

  /** 格子的中心到邊還有半格，外接矩形要往外各補半格才蓋得住最外那一圈 */
  const halfWidth = Math.max(1, (waterMaxX - waterMinX) / 2 + 0.5 - RADIUS_INSET)
  const halfDepth = Math.max(1, (waterMaxZ - waterMinZ) / 2 + 0.5 - RADIUS_INSET)

  return {
    centerX: (waterMinX + waterMaxX) / 2,
    centerZ: (waterMinZ + waterMaxZ) / 2,
    /** 液體的最上層會矮掉八分之一格，實心的冰則是整格 */
    surfaceY: topLayerY + 0.5 - (target.surface === 'water' ? LIQUID_SURFACE_DROP : 0),
    halfWidth,
    halfDepth,
    /** 挑貼圖解析度與判斷遠近用的，取長邊 */
    radius: Math.max(halfWidth, halfDepth),
  }
}

interface Mirror {
  mesh: Mesh;
  texture: MirrorTexture;
  /** MirrorTexture 自己掛在影像處理設定上的觀察者，收的時候要自己拔，見 dispose */
  imageProcessingObserver: Observer<ImageProcessingConfiguration> | null;
  material: StandardMaterial;
  center: Vector3;
  surfaceY: number;
  isActive: boolean;
}

/**
 * 水面的倒影
 *
 * 天空與地景都要進來。只映天空的話，池面上看得到雲飄過去，
 * 岸邊那圈石燈籠與松樹卻不在水裡——那不是一面鏡子，
 * 是一塊開在地上的天窗。
 *
 * 地景是逐方塊類型一個網格配 thin instance 畫的，所以加進來的成本
 * 是「每種方塊多一次繪製呼叫」，而不是每一顆方塊多一次。
 * 真正的代價在頂點：那一帶的世界會為了倒影再走一趟。
 *
 * 之所以付得起，是因為鏡子只有走近時才畫（見 setActive，
 * 離開時更新頻率歸零），四座箱庭又彼此相距數十格，
 * 同一刻至多只有一面在畫。低畫質則整個不做。
 *
 * 必須在渲染器把世界建好之後呼叫，反射清單要撈得到地景網格。
 * targetList 是要映的範圍：大廳給 HUB_MIRROR_TARGET_LIST，大場景給自己的 mirrorTargetList
 */
export function createWaterMirrors(
  scene: Scene,
  camera: UniversalCamera,
  worldState: Uint8Array,
  targetList: readonly RealmMirrorTarget[],
): WaterMirrors | null {
  const { preset } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()
  /**
   * 邊長為零的那一級不做倒影
   *
   * 一面鏡子等於那一帶的地景多畫一趟，最省的那一級本來就在跟
   * 每一次繪製呼叫計較。中間幾級則是照樣做、只是把圖開小一半
   */
  const { mirrorSizeSmall, mirrorSizeLarge } = preset.value
  if (mirrorSizeSmall <= 0)
    return null

  const skyMeshList = [
    SKYBOX_NAME,
    STAR_FIELD_NAME,
    SUN_DISC_NAME,
    SUN_GLOW_NAME,
    MOON_DISC_NAME,
    MOON_GLOW_NAME,
    CLOUD_LAYER_NAME,
    OVERCAST_NAME,
  ]
    .map((name) => scene.getMeshByName(name))
    .filter((mesh): mesh is NonNullable<typeof mesh> => !!mesh)

  const cloudDome = scene.getMeshByName(CLOUD_LAYER_NAME)
  const cloudReflectionMaterial = scene.getMaterialByName(CLOUD_REFLECTION_MATERIAL_NAME)

  /**
   * 液體不進倒影
   *
   * 每一種方塊是一個橫跨整個世界的網格，倒影一畫就是全世界那一種方塊都畫一遍。
   * 湖中島四周七萬格湖面，倒影一開三角形數多出一倍、高畫質整幀多六毫秒；
   * 而水映在水裡本來就幾乎看不出來（水是半透明的，倒影裡那一圈湖面只剩一線）
   */
  const blockMeshList = scene.meshes.filter((mesh) => mesh.name.startsWith(BLOCK_MESH_PREFIX) && !isLiquidMesh(mesh.name))
  const renderList = [...skyMeshList, ...blockMeshList]

  /** 四面鏡子共用同一張遮罩，它只是一圈徑向漸層，與尺寸無關 */
  const fadeTexture = createFadeTexture(scene)

  const mirrorList: Mirror[] = []

  for (const target of targetList) {
    const gardenId = target.id
    const surface = measureReflectiveSurface(worldState, target)
    if (!surface) {
      console.warn(`[water-mirror] ${gardenId} 找不到夠大的反射面，跳過`)
      continue
    }

    const textureSize = surface.radius > LARGE_MIRROR_RADIUS ? mirrorSizeLarge : mirrorSizeSmall
    /**
     * 記下 MirrorTexture 掛上去的那個觀察者
     *
     * 它在建構時往場景的影像處理設定掛一個觀察者，dispose 時才拔；
     * 但 Babylon 9.20 的 MirrorTexture.dispose 先呼叫父類別的 dispose（會把 _scene 清成 null），
     * 再用 getScene() 去拔——拿到的是 null，觀察者永遠留在場景上，
     * 連帶把整面鏡子留在記憶體裡。換場景每拆一次大廳就漏一份（走過水鏡池才會出現，
     * 鏡子要走近才有畫過）。那個觀察者是私有欄位，這裡比對建構前後的清單把它找出來，收的時候自己拔
     */
    const imageProcessingObservable = scene.imageProcessingConfiguration.onUpdateParameters
    const observerSetBefore = new Set(imageProcessingObservable.observers)
    const texture = new MirrorTexture(`water-mirror-${gardenId}`, textureSize, scene, true)
    const imageProcessingObserver = imageProcessingObservable.observers.find((observer) => !observerSetBefore.has(observer)) ?? null
    /**
     * 鏡面的方程式
     *
     * 法線朝下、位移等於水面高度：平面上的每一點滿足 -y + d = 0，
     * 也就是 y = d。方向弄反的話倒影會映到水面上方去
     */
    texture.mirrorPlane = new Plane(0, -1, 0, surface.surfaceY)
    texture.renderList = renderList
    texture.blurKernel = MIRROR_BLUR_KERNEL
    /**
     * 雲在倒影裡換一份材質
     *
     * 主畫面的雲是先在降解析度的圖上行進、再按螢幕座標貼回來的；
     * 倒影的鏡頭是翻過來的，那張圖的方向對不上它。
     * 倒影改用直接行進的那一份，步數少、只畫這兩三百格見方的小圖
     */
    if (cloudDome && cloudReflectionMaterial) {
      texture.setMaterialForRendering(cloudDome, cloudReflectionMaterial)
    }

    const material = new StandardMaterial(`water-mirror-${gardenId}-material`, scene)
    /**
     * 只留倒影，其他通道全部關掉
     *
     * 反射在 StandardMaterial 裡是加在最後的一項，
     * 漫射與自發光留著的話會在倒影上疊一層灰
     */
    material.diffuseColor = new Color3(0, 0, 0)
    material.specularColor = new Color3(0, 0, 0)
    material.emissiveColor = new Color3(0, 0, 0)
    material.disableLighting = true
    material.reflectionTexture = texture
    material.reflectionTexture.level = 1
    /**
     * 倒影疊在水上，不是取代水：水自己的顏色與流動都還要看得見。
     * 疊多少由 MirrorSurfacePlugin 照視角決定（菲涅耳），這裡留滿；
     * 下面把混合模式寫死成半透明，外掛乘上去的透明度才算數
     */
    material.alpha = 1
    attachMirrorSurface(material)
    material.opacityTexture = fadeTexture
    material.transparencyMode = Material.MATERIAL_ALPHABLEND
    material.backFaceCulling = true
    /**
     * 不吃霧
     *
     * 倒影裡的東西已經是從場景取來的顏色，各自吃過自己那一份霧了。
     * 這裡再套一次會讓水面比它映的東西更灰
     */
    material.fogEnabled = false

    const mesh = MeshBuilder.CreateGround(
      `water-mirror-${gardenId}-surface`,
      { width: surface.halfWidth * 2, height: surface.halfDepth * 2 },
      scene,
    )
    mesh.material = material
    mesh.position.set(surface.centerX, surface.surfaceY + SURFACE_LIFT, surface.centerZ)
    mesh.isPickable = false
    mesh.receiveShadows = false
    mesh.freezeWorldMatrix()

    mirrorList.push({
      mesh,
      texture,
      imageProcessingObserver,
      material,
      center: new Vector3(surface.centerX, surface.surfaceY, surface.centerZ),
      surfaceY: surface.surfaceY,
      isActive: true,
    })
  }

  if (mirrorList.length === 0) {
    fadeTexture.dispose()
    return null
  }

  function setActive(mirror: Mirror, nextActive: boolean): void {
    if (nextActive === mirror.isActive)
      return

    mirror.isActive = nextActive
    mirror.mesh.setEnabled(nextActive)
    /**
     * 停用時把更新頻率設成零
     *
     * 只把網格關掉是不夠的：算繪目標是掛在場景上的，
     * 網格看不看得見它都照畫。頻率歸零才是真的不畫
     */
    mirror.texture.refreshRate = nextActive
      ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
      : 0
  }

  for (const mirror of mirrorList) {
    setActive(mirror, false)
  }

  let elapsed = CHECK_INTERVAL

  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < CHECK_INTERVAL)
      return

    elapsed = 0

    for (const mirror of mirrorList) {
      /**
       * 人在水面以下時也關掉
       *
       * 從水裡往上看不會看到倒影，那時該看到的是水面本身。
       * 倒影面是單面的，從底下看過去只會是一片空白
       */
      const isAbove = camera.position.y > mirror.surfaceY
      setActive(
        mirror,
        devToggle.pondMirror
        && isAbove
        && Vector3.Distance(camera.position, mirror.center) < ACTIVE_DISTANCE,
      )
    }
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      for (const mirror of mirrorList) {
        mirror.mesh.dispose()
        mirror.material.dispose()
        scene.imageProcessingConfiguration.onUpdateParameters.remove(mirror.imageProcessingObserver)
        mirror.texture.dispose()
      }
      fadeTexture.dispose()
    },
  }
}
