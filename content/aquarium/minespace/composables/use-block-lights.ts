import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { BlockLightSource } from '../domains/world/light-source'
import { ClusteredLightContainer, Color3, PointLight, Vector3 } from '@babylonjs/core'
import { onBeforeUnmount } from 'vue'
import { measureSection } from './use-performance-probe'

/** 滿等的燈有多亮 */
const MAX_INTENSITY = 1.15
/** 光照得到多遠，會隨亮度等級縮放 */
const MAX_LIGHT_RANGE = 20

/**
 * 白天燈火還剩多少存在感
 *
 * 大白天點著的燈當然照不出什麼，但也不是完全沒有——
 * 屋簷下、樹蔭裡那一點暖色正是它該有的樣子
 */
const DAY_INTENSITY_RATIO = 0.22

/**
 * 火比燈籠亮多少
 *
 * 一團燒著的營火跟一盞紙燈本來就不是同一個量級。
 * 光靠亮度等級分不出來——那個值是給光的傳播距離用的
 */
const FIRE_INTENSITY_BOOST = 1.6

/**
 * 火光晃動的幅度
 *
 * 火焰不是穩定的光源，它一直在變。這一段起伏是整團火最有生命力的地方：
 * 沒有它，營火只是一顆擺在那裡的橘色燈泡。
 *
 * 原本給 0.16，安全但幾乎看不出來——那個幅度在明亮的白天完全被日光蓋掉，
 * 只有夜裡貼著火站著才勉強察覺。真正的火光是會把周圍的牆掃亮又掃暗的，
 * 加到三成才有那個味道。
 *
 * 再往上就會變成壞掉的日光燈：關鍵不只是幅度，也在下面那三道波的比例——
 * 慢的那道要佔一半以上，快的只是疊在上面的抽動。
 * 全部給等權重的話，同樣的幅度會變成高頻的抖，而不是火的呼吸
 */
const FLICKER_DEPTH = 0.3

/**
 * 退回燈池時同時點亮幾盞
 *
 * 材質的 maxSimultaneousLights 是六：太陽、環境光、洞口那盞天光，
 * 剩下三個名額就是這個池子
 */
const POOL_SIZE = 3

/**
 * 燈池的候選半徑
 *
 * 比光本身照得到的距離再大一點點。點光源的衰減在 range 之外就是零，
 * 所以一盞燈被納入名單的那一刻，它的貢獻本來就還是零，
 * 之後才隨著走近自然亮起來——那是距離衰減，不是「燈被打開」
 */
const CANDIDATE_RANGE = MAX_LIGHT_RANGE + 4

/** 重新挑燈的間隔（秒），這件事不必每一幀做 */
const PICK_INTERVAL = 0.2

/** 換燈時亮度追過去的速度，才不會啪一下切換 */
const INTENSITY_RESPONSE = 5

interface StartParams {
  scene: Scene;
  camera: UniversalCamera;
  /**
   * 世界裡所有的光源方塊
   *
   * 由外面掃好帶進來，不在這裡自己掃：夜裡的光暈用的是同一份清單，
   * 各掃一次等於把三百萬格走兩遍，而且兩邊只要有一邊改了門檻，
   * 燈的真光與它的暈就會對不起來
   */
  sourceList: BlockLightSource[];
  /** 白晝的程度，0 為全暗、1 為大白天 */
  getDayRatio: () => number;
}

interface LightEntry {
  light: PointLight;
  source: BlockLightSource;
}

/**
 * 世界裡所有燈火的真光
 *
 * 方塊光是烘進實例顏色的，那是乘在貼圖上的假光：白天看得出來，
 * 夜裡光照一小就跟著被壓掉，燈只照得亮自己。要讓燈真的照亮周圍，
 * 就得是真正的光源。
 *
 * 難處在於材質同時能吃的光源只有六個，而世界上有幾十盞燈。
 * v9 的叢集光照（clustered lighting）正是為這件事來的：
 * 把光源分進螢幕空間的方格與深度切片，每個像素只計算真正照到它的那幾盞。
 * 整組燈在材質眼中只佔一個名額，於是幾十盞可以同時亮著。
 *
 * 引擎不支援時退回燈池：三盞燈輪流去認領離玩家最近的光源。
 * 那是叢集光照出現以前的做法，畫面上的差別是「遠處的燈不會亮」
 */
export function useBlockLights() {
  let cleanup: (() => void) | null = null

  onBeforeUnmount(() => cleanup?.())

  function start({ scene, camera, sourceList, getDayRatio }: StartParams): void {
    cleanup?.()

    if (sourceList.length === 0)
      return

    const entryList = sourceList.map((source, index) => createLightEntry(scene, source, index))
    const container = createClusteredContainer(scene, entryList)

    const observer = container
      ? trackAllLights(scene, entryList, getDayRatio)
      : trackNearestLights(scene, camera, entryList, getDayRatio)

    cleanup = () => {
      scene.onBeforeRenderObservable.remove(observer)
      container?.dispose()
      for (const entry of entryList) {
        entry.light.dispose()
      }
    }
  }

  return { start }
}

function createLightEntry(scene: Scene, source: BlockLightSource, index: number): LightEntry {
  const light = new PointLight(
    `block-light-${index}`,
    new Vector3(source.x, source.y, source.z),
    scene,
  )
  light.diffuse = new Color3(source.color[0], source.color[1], source.color[2])
  light.specular = new Color3(0, 0, 0)
  light.intensity = 0
  light.range = MAX_LIGHT_RANGE * source.level
  /**
   * 燈不投射陰影
   *
   * 這是叢集光照的硬性條件（IsLightSupported 會擋），
   * 而幾十盞燈各自畫一張陰影貼圖本來也不可能。
   * 遮蔽感交給烘進方塊的環境遮蔽就夠了
   */
  light.shadowEnabled = false

  return { light, source }
}

/**
 * 建立叢集光照，引擎不支援時回傳 null
 *
 * WebGL2 那條路需要 texelFetch、浮點色彩緩衝與浮點混合三項能力，
 * 桌機幾乎都有，行動裝置就不一定了。這裡老實地問過引擎再決定，
 * 不支援就讓上層退回燈池
 */
function createClusteredContainer(
  scene: Scene,
  entryList: LightEntry[],
): ClusteredLightContainer | null {
  const sample = entryList[0]
  if (!sample || !ClusteredLightContainer.IsLightSupported(sample.light))
    return null

  const container = new ClusteredLightContainer(
    'block-light-cluster',
    entryList.map((entry) => entry.light),
    scene,
  )
  if (!container.isSupported) {
    container.dispose()
    return null
  }

  /** 分群時的範圍上限，與單盞燈照得到的最遠距離對齊 */
  container.maxRange = MAX_LIGHT_RANGE

  return container
}

/**
 * 叢集光照：所有燈一直亮著
 *
 * 不必挑、不必換，每一幀只要更新亮度。
 * 這正是叢集光照換來的東西——遠處那一排燈籠也是亮的
 */
function trackAllLights(
  scene: Scene,
  entryList: LightEntry[],
  getDayRatio: () => number,
) {
  let elapsed = 0

  return scene.onBeforeRenderObservable.add(() => {
    measureSection('方塊燈火', () => {
      elapsed += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
      const dayFactor = measureDayFactor(getDayRatio())

      for (const [index, entry] of entryList.entries()) {
        entry.light.intensity = measureIntensity(entry.source, dayFactor, elapsed, index)
      }
    })
  })
}

/**
 * 燈池：三盞燈輪流認領離玩家最近的光源
 *
 * 引擎不支援叢集光照時的退路。玩家身邊那幾盞照樣是真光，
 * 只有遠處的燈得靠烘進方塊的假光交代
 */
function trackNearestLights(
  scene: Scene,
  camera: UniversalCamera,
  entryList: LightEntry[],
  getDayRatio: () => number,
) {
  /** 沒被選上的燈要熄著，只有名單上的那幾盞會被點亮 */
  const activeIndexList: number[] = []
  const intensityList = entryList.map(() => 0)
  let pickElapsed = PICK_INTERVAL
  let elapsed = 0

  function pickNearest(): void {
    activeIndexList.length = 0
    const { x, y, z } = camera.position

    const measureDistance = (index: number) => {
      const { source } = entryList[index]!

      return Math.hypot(source.x - x, source.y - y, source.z - z)
    }

    for (const [index, entry] of entryList.entries()) {
      const { source } = entry
      const distance = Math.hypot(source.x - x, source.y - y, source.z - z)
      if (distance > CANDIDATE_RANGE)
        continue

      /** 插入排序，名單只有三個，比整串排序便宜得多 */
      let position = activeIndexList.length
      while (position > 0 && measureDistance(activeIndexList[position - 1]!) > distance) {
        position--
      }
      if (position >= POOL_SIZE)
        continue

      activeIndexList.splice(position, 0, index)
      if (activeIndexList.length > POOL_SIZE) {
        activeIndexList.length = POOL_SIZE
      }
    }
  }

  return scene.onBeforeRenderObservable.add(() => {
    measureSection('方塊燈火', () => {
      const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
      elapsed += deltaTime

      pickElapsed += deltaTime
      if (pickElapsed >= PICK_INTERVAL) {
        pickElapsed = 0
        pickNearest()
      }

      const dayFactor = measureDayFactor(getDayRatio())

      for (const [index, entry] of entryList.entries()) {
        const target = activeIndexList.includes(index)
          ? measureIntensity(entry.source, dayFactor, elapsed, index)
          : 0

        /**
         * 名單換人時亮度是追過去的
         *
         * 直接設定的話，走過一排燈籠會看到光一盞一盞地跳
         */
        const current = intensityList[index]!
        const next = current + (target - current) * Math.min(1, deltaTime * INTENSITY_RESPONSE)
        intensityList[index] = next
        entry.light.intensity = next
      }
    })
  })
}

/** 白天的燈火只剩一點存在感 */
function measureDayFactor(dayRatio: number): number {
  return DAY_INTENSITY_RATIO + (1 - DAY_INTENSITY_RATIO) * (1 - dayRatio)
}

/**
 * 一盞燈此刻該有多亮
 *
 * 亮度只看燈自己的等級，不看距離——遠近交給點光源本身的衰減，
 * 那是物理上該有的樣子。這裡再乘一次距離的話，燈會在半路上憑空亮起來
 */
function measureIntensity(
  source: BlockLightSource,
  dayFactor: number,
  elapsed: number,
  index: number,
): number {
  const base = MAX_INTENSITY * source.level * dayFactor

  return source.isFire
    ? base * FIRE_INTENSITY_BOOST * measureFlicker(elapsed, index)
    : base
}

/**
 * 火光此刻的亮度倍率
 *
 * 三道頻率不同、彼此除不盡的正弦疊起來：
 * 慢的那道是整團火的呼吸，快的兩道是火舌的抽動。
 * 週期互相除不盡，疊出來的波形就不會重複，看不出規律。
 *
 * 每一團火用自己的相位起算，同一個畫面裡的兩團火才不會一起明滅
 */
function measureFlicker(elapsed: number, index: number): number {
  const phase = index * 2.4

  const wave = Math.sin(elapsed * 2.7 + phase) * 0.5
    + Math.sin(elapsed * 7.3 + phase * 1.7) * 0.3
    + Math.sin(elapsed * 13.1 + phase * 2.3) * 0.2

  return 1 + wave * FLICKER_DEPTH
}
