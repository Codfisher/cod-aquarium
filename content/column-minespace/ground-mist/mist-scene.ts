import type { DynamicTexture, Scene } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 晨霧的時間窗
 *
 * 破曉是 0.18、日出是 0.24。霧要在天還沒亮的時候就已經積在那裡，
 * 太陽一出來才被曬散。那個「曬散」的過程本身就是晨霧最好看的一段，
 * 所以淡出拖得比淡入長
 */
const MIST_RISE_FROM = 0.09
const MIST_RISE_TO = 0.18
const MIST_FADE_FROM = 0.27
const MIST_FADE_TO = 0.41

/** 平滑地把一段區間映射到 0 到 1 */
function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 這一刻該有多濃的晨霧，0 為沒有、1 為最濃
 *
 * 只看時刻。要不要真的鋪出來還得看人在哪裡，
 * 洞裡、雨中與沼澤上都不該有它，那是呼叫端的事
 */
export function getDawnMistRatio(timeOfDay: number): number {
  if (timeOfDay <= MIST_RISE_FROM || timeOfDay >= MIST_FADE_TO)
    return 0

  if (timeOfDay < MIST_RISE_TO)
    return smoothRange(timeOfDay, MIST_RISE_FROM, MIST_RISE_TO)

  if (timeOfDay > MIST_FADE_FROM)
    return 1 - smoothRange(timeOfDay, MIST_FADE_FROM, MIST_FADE_TO)

  return 1
}

/**
 * 一片霧的貼圖
 *
 * 這個世界的顆粒平常都用硬邊，霧是例外。霧本來就沒有輪廓，
 * 硬邊會露出貼圖的形狀，所以這裡走柔邊，靠幾十片疊起來
 * 才成為一團看得見厚度的霧
 */
export function createMistTexture(babylon: BabylonModule, scene: Scene): DynamicTexture {
  const size = 64
  const texture = new babylon.DynamicTexture(
    'ground-mist',
    { width: size, height: size },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  )
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.45)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  return texture
}

/** 一座木座的位置與高度 */
const PLATFORM_LIST: [number, number, number, number][] = [
  [-8, -6, 6, 2.6],
  [2, -9, 7, 1.4],
  [9, 3, 6, 3.2],
  [-6, 8, 8, 1],
  [1, 4, 5, 2],
]

/**
 * 一座高低差明顯的庭園
 *
 * 木座抬高、木座之間是白沙。霧要不要真的貼著地形走，
 * 只有在這種高低差之下才看得出差別
 */
export function createMistTerrain(babylon: BabylonModule, scene: Scene): void {
  const sandMaterial = new babylon.StandardMaterial('sand-material', scene)
  sandMaterial.diffuseColor = new babylon.Color3(0.74, 0.72, 0.66)
  sandMaterial.specularColor = new babylon.Color3(0, 0, 0)

  const sand = babylon.MeshBuilder.CreateGround('sand', { width: 80, height: 80 }, scene)
  sand.material = sandMaterial

  const woodMaterial = new babylon.StandardMaterial('wood-material', scene)
  woodMaterial.diffuseColor = new babylon.Color3(0.42, 0.32, 0.24)
  woodMaterial.specularColor = new babylon.Color3(0, 0, 0)

  for (const [index, [x, z, size, height]] of PLATFORM_LIST.entries()) {
    const platform = babylon.MeshBuilder.CreateBox(
      `platform-${index}`,
      { width: size, depth: size, height },
      scene,
    )
    platform.position.set(x, height / 2, z)
    platform.material = woodMaterial
  }
}

/** 仰角低於這裡，貼地加厚一律給到晨昏的滿檔 */
export const GROUND_HAZE_LOW_SUN_HEIGHT = 0.12
/** 仰角高於這裡，貼地加厚一律收回正午的基準 */
export const GROUND_HAZE_HIGH_SUN_HEIGHT = 0.55
/** 晨昏那一段的加厚倍率 */
export const GROUND_HAZE_BOOST_DAWN_DUSK = 1.15
/** 正午的加厚倍率 */
export const GROUND_HAZE_BOOST_BASE = 0.6

/**
 * 貼地加厚的倍率該給多少，只看太陽仰角
 *
 * 零是貼著地平線、一是正上方。仰角低的時候給到晨昏的滿檔，
 * 高的時候收回正午的基準，中間用平滑曲線接起來，
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

/**
 * 從天上往下打一道射線，問這一格的地面在哪裡
 *
 * 霧片要貼著地表長出來，就得先知道地表有多高。
 * 專案裡走的是自己的方塊資料，這裡直接問場景，兩者是同一件事。
 *
 * 結果照格子快取。地形是靜止的，同一格問第二次答案不會變，
 * 而射線一秒要打好幾次
 */
export function createSurfaceProbe(
  babylon: BabylonModule,
  scene: Scene,
): (x: number, z: number) => number {
  const heightMap = new Map<string, number>()
  const origin = new babylon.Vector3()
  const down = new babylon.Vector3(0, -1, 0)

  return (x: number, z: number) => {
    const cellX = Math.floor(x)
    const cellZ = Math.floor(z)
    const key = `${cellX},${cellZ}`

    const cached = heightMap.get(key)
    if (cached !== undefined)
      return cached

    origin.set(cellX + 0.5, 40, cellZ + 0.5)
    const ray = new babylon.Ray(origin, down, 80)
    const hit = scene.pickWithRay(ray, (mesh) => mesh.isPickable)
    const surfaceY = hit?.pickedPoint?.y ?? 0

    heightMap.set(key, surfaceY)

    return surfaceY
  }
}
