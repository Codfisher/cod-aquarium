import type { Mesh, Scene, UniversalCamera } from '@babylonjs/core'
import type { GardenId } from './garden-layout'
import {
  Color3,
  DynamicTexture,
  Material,
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
import { BlockId, isWaterBlock, LIQUID_SURFACE_DROP } from '../block/block-constants'
import { BLOCK_MESH_PREFIX } from '../renderer/voxel-renderer'
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
type SurfaceKind = 'water' | 'ice'

interface MirrorTarget {
  garden: GardenId;
  surface: SurfaceKind;
}

/**
 * 哪幾座箱庭要映東西
 *
 * 這是一份刻意的名單，不是「有水就映」。
 * 世界上零星的水窪、湯屋的岩池、海岸那片淺灘都有水，
 * 但倒影是要付錢的——一面鏡子等於那一帶的地景多畫一趟。
 * 值得付的是「那面反光本身就是這座箱庭主題」的那幾座
 */
const MIRROR_TARGET_LIST: MirrorTarget[] = [
  { garden: 'pond', surface: 'water' },
  { garden: 'swamp', surface: 'water' },
  { garden: 'cave', surface: 'water' },
  { garden: 'rainvale', surface: 'water' },
  /** 山腳下那窪凍住的融雪池 */
  { garden: 'alpine', surface: 'ice' },
]

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
 * 走到水邊掉幀的話，這兩個數字是第一個該減半的
 */
const MIRROR_SIZE_SMALL = 256
const MIRROR_SIZE_LARGE = 512

/** 超過這個半徑就換大張的 */
const LARGE_MIRROR_RADIUS = 10

/** 倒影在水面上佔多少，剩下的是水自己的顏色 */
const MIRROR_STRENGTH = 0.5

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
  target: MirrorTarget,
): WaterSurface | null {
  const garden = getGarden(target.garden)
  const minX = Math.floor(garden.center.x - garden.halfSize)
  const maxX = Math.ceil(garden.center.x + garden.halfSize)
  const minZ = Math.floor(garden.center.z - garden.halfSize)
  const maxZ = Math.ceil(garden.center.z + garden.halfSize)

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
 * 必須在渲染器把世界建好之後呼叫，反射清單要撈得到地景網格
 */
export function createWaterMirrors(
  scene: Scene,
  camera: UniversalCamera,
  worldState: Uint8Array,
): WaterMirrors | null {
  const { quality } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()
  /** 低畫質不做倒影，那裡本來就在跟每一次繪製呼叫計較 */
  if (quality.value === 'low')
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

  const blockMeshList = scene.meshes.filter((mesh) => mesh.name.startsWith(BLOCK_MESH_PREFIX))
  const renderList = [...skyMeshList, ...blockMeshList]

  /** 四面鏡子共用同一張遮罩，它只是一圈徑向漸層，與尺寸無關 */
  const fadeTexture = createFadeTexture(scene)

  const mirrorList: Mirror[] = []

  for (const target of MIRROR_TARGET_LIST) {
    const gardenId = target.garden
    const surface = measureReflectiveSurface(worldState, target)
    if (!surface) {
      console.warn(`[water-mirror] ${gardenId} 找不到夠大的反射面，跳過`)
      continue
    }

    const textureSize = surface.radius > LARGE_MIRROR_RADIUS ? MIRROR_SIZE_LARGE : MIRROR_SIZE_SMALL
    const texture = new MirrorTexture(`water-mirror-${gardenId}`, textureSize, scene, true)
    /**
     * 鏡面的方程式
     *
     * 法線朝下、位移等於水面高度：平面上的每一點滿足 -y + d = 0，
     * 也就是 y = d。方向弄反的話倒影會映到水面上方去
     */
    texture.mirrorPlane = new Plane(0, -1, 0, surface.surfaceY)
    texture.renderList = renderList

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
    /** 倒影疊在水上，不是取代水：水自己的顏色與流動都還要看得見 */
    material.alpha = MIRROR_STRENGTH
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
        mirror.texture.dispose()
      }
      fadeTexture.dispose()
    },
  }
}
