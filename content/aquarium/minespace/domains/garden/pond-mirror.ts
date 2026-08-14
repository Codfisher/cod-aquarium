import type { Scene, UniversalCamera } from '@babylonjs/core'
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
import { getDeckBlockY, getGarden } from './garden-layout'

/**
 * 水面比方塊頂面矮多少
 *
 * 與渲染器裡液體那一層用的是同一個數字。倒影要貼在那個高度上，
 * 差一點點就會浮在水面上方或沉進水裡
 */
const LIQUID_SURFACE_DROP = 0.125

/**
 * 倒影面比水面再高一點點
 *
 * 兩片幾乎同高的半透明面會互相爭深度，畫面上是一片閃爍的雜訊。
 * 抬高兩公分，深度就分得開了，而兩公分在畫面上量不出來
 */
const SURFACE_LIFT = 0.02

/**
 * 倒影面的半徑
 *
 * 池子的岸線是吃噪音生成的，凹凸不定，大約落在四點六格。
 * 收到四點三再讓邊緣淡出，倒影就不會漫到岸上的草地
 */
const MIRROR_RADIUS = 4.3

/**
 * 倒影貼圖的解析度
 *
 * 這張圖畫的只有天空，而天空是一整片平滑的漸層——
 * 二五六已經看不出差別。倒影本來也不該比實景銳利
 */
const MIRROR_SIZE = 256

/** 倒影在水面上佔多少，剩下的是水自己的顏色 */
const MIRROR_STRENGTH = 0.5

/**
 * 走多近才開始畫倒影
 *
 * 超過這個距離就把整張圖從算繪清單裡拿掉——不是畫得淡一點，
 * 是完全不畫。倒影只有站在池邊時看得到，
 * 沒有理由讓人在半座禪庭以外的地方替它付錢
 */
const ACTIVE_DISTANCE = 30

/** 距離檢查的間隔（秒），這件事不必每一幀做 */
const CHECK_INTERVAL = 0.3

export interface PondMirror {
  dispose: () => void;
}

/**
 * 邊緣淡出的遮罩
 *
 * 中心是滿的、往外收到全透明。倒影面是一片方形的板子，
 * 沒有這層遮罩的話，池子的四個角會露出筆直的邊
 */
function createFadeTexture(scene: Scene): DynamicTexture {
  const size = 128
  const texture = new DynamicTexture('pond-mirror-fade', { width: size, height: size }, scene, true)
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

/**
 * 水鏡池的倒影
 *
 * 這座箱庭叫「水鏡池」，池子卻不映任何東西——名字先於實作存在很久了。
 *
 * 倒影只映天空，不映地景。這不是偷懶：平面倒影的做法是
 * 「把場景照著水面翻過來再畫一次」，而這個世界的方塊是依種類
 * 合併成整片網格的，映一棵岸邊的松就等於把全世界重畫一遍，
 * 八百多次繪製呼叫。天空這一層只有八片網格。
 *
 * 而且靜水本來就是拿來映天的。正午映藍天與雲影、黃昏映一整片橘、
 * 入夜之後池底浮出月亮與星星——那才是這座箱庭的名字。
 * 岸邊那株松的倒影交給水面自己的高光去交代
 */
export function createPondMirror(scene: Scene, camera: UniversalCamera): PondMirror | null {
  const { quality } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()
  /** 低畫質不做倒影，那裡本來就在跟每一次繪製呼叫計較 */
  if (quality.value === 'low')
    return null

  const garden = getGarden('pond')
  const { x: centerX, z: centerZ } = garden.center
  /** 水的最上層佔著甲板那一格，水面則在那一格的頂面往下八分之一 */
  const surfaceY = getDeckBlockY(garden) + 0.5 - LIQUID_SURFACE_DROP

  const mirrorTexture = new MirrorTexture('pond-mirror', MIRROR_SIZE, scene, true)
  /**
   * 鏡面的方程式
   *
   * 法線朝下、位移等於水面高度：平面上的每一點滿足 -y + d = 0，
   * 也就是 y = d。方向弄反的話倒影會映到水面上方去
   */
  mirrorTexture.mirrorPlane = new Plane(0, -1, 0, surfaceY)
  /** 只映天空那一層，地景不進來 */
  mirrorTexture.renderList = [
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

  const material = new StandardMaterial('pond-mirror-material', scene)
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
  material.reflectionTexture = mirrorTexture
  material.reflectionTexture.level = 1
  /** 倒影疊在水上，不是取代水：水自己的顏色與流動都還要看得見 */
  material.alpha = MIRROR_STRENGTH
  material.opacityTexture = createFadeTexture(scene)
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = true
  /**
   * 不吃霧
   *
   * 倒影裡的天空已經是從天空那一層取來的顏色，
   * 那一層本來就不吃霧。這裡再套一次會讓池面比它映的天還灰
   */
  material.fogEnabled = false

  const mirrorMesh = MeshBuilder.CreateGround(
    'pond-mirror-surface',
    { width: MIRROR_RADIUS * 2, height: MIRROR_RADIUS * 2 },
    scene,
  )
  mirrorMesh.material = material
  mirrorMesh.position.set(centerX, surfaceY + SURFACE_LIFT, centerZ)
  mirrorMesh.isPickable = false
  mirrorMesh.receiveShadows = false
  mirrorMesh.freezeWorldMatrix()

  const center = new Vector3(centerX, surfaceY, centerZ)
  let isActive = true
  let elapsed = CHECK_INTERVAL

  function setActive(nextActive: boolean): void {
    if (nextActive === isActive)
      return

    isActive = nextActive
    mirrorMesh.setEnabled(nextActive)
    /**
     * 停用時把更新頻率設成零
     *
     * 只把網格關掉是不夠的：算繪目標是掛在場景上的，
     * 網格看不看得見它都照畫。頻率歸零才是真的不畫
     */
    mirrorTexture.refreshRate = nextActive
      ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
      : 0
  }

  setActive(false)

  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < CHECK_INTERVAL)
      return

    elapsed = 0
    /**
     * 人在水面以下時也關掉
     *
     * 從水裡往上看不會看到天空的倒影，那時該看到的是水面本身。
     * 倒影面是單面的，從底下看過去只會是一片空白
     */
    const isAbove = camera.position.y > surfaceY
    setActive(
      devToggle.pondMirror
      && isAbove
      && Vector3.Distance(camera.position, center) < ACTIVE_DISTANCE,
    )
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mirrorMesh.dispose()
      material.dispose()
      mirrorTexture.dispose()
    },
  }
}
