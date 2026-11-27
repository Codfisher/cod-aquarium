import type { Scene, StandardMaterial, UniversalCamera } from '@babylonjs/core'
import type { useBlockLights } from '../../composables/use-block-lights'
import type { TexturePack } from '../block/texture-pack'
import type { useSheepFlock } from '../fauna/use-sheep-flock'
import type { VoxelGi } from '../renderer/voxel-gi'
import type { AtmosphereState } from '../weather/atmosphere'
import type { WaterMap } from '../world/water-body'
import type { RealmDefinition, RealmId } from './realm-definition'
import { createCampfireSmoke } from '../../composables/use-babylon-scene'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { createSandField } from '../garden/sand-field'
import { createWaterMirrors, HUB_MIRROR_TARGET_LIST } from '../garden/water-mirror'
import { createLampGlow } from '../renderer/lamp-glow'
import { createTextureSkinner } from '../renderer/pixel-material'
import { createVoxelGi } from '../renderer/voxel-gi'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { createWaterCaustics } from '../renderer/water-caustics'
import { createWaterSurface } from '../renderer/water-surface'
import { collectLightSourceList } from '../world/light-source'
import { useChunkWorker } from '../world/use-chunk-worker'
import { useTerrainWorker } from '../world/use-terrain-worker/use-terrain-worker'
import { scanWaterMap } from '../world/water-body'
import { createBackdrop } from './backdrop'
import { createPortalGateList } from './portal-gate'
import { createRealmDecoration } from './realm-decoration'

/**
 * 世界層
 *
 * 一個場景自己的那一整套：方塊資料、區塊網格與它們的材質、箱庭造景附帶的東西
 * （外圍白沙、水鏡池倒影、羊群、營火）、水面與焦散、全局光、燈火的光暈與真光。
 * 換場景時整層拆掉重建。
 *
 * 引擎層（引擎、場景、鏡頭、後製、天空、體積雲、日夜、自動曝光、玩家控制器、
 * 天氣粒子、場景深度圖、行進版光束）不在這裡，整個工作階段只建一次，見 render-runtime
 */
export interface WorldLayer {
  realm: RealmDefinition;
  worldState: Uint8Array;
  /** 世界上的水在哪裡，漣漪、焦散與雨滴的水花都要問它 */
  waterMap: WaterMap;
  /** 低畫質不建全局光，那時是 null */
  voxelGi: VoxelGi | null;
  /** 淋得到雨、也淋濕得起來的那些材質，天氣的濕潤要掛上去 */
  getWetMaterialList: () => StandardMaterial[];
  /** 換材質包：方塊、羊與外圍白沙的材質都留著，只換貼圖 */
  applyPack: (pack: TexturePack, isBumpActive: boolean) => void;
  /** 開關水面的日照高光，除錯面板用 */
  setWaterGlintEnabled: (isEnabled: boolean) => void;
  dispose: () => void;
}

interface CreateWorldLayerParam {
  realm: RealmDefinition;
  /** 已經生好的方塊資料，見 generateRealmWorld */
  worldState: Uint8Array;
  scene: Scene;
  camera: UniversalCamera;
  texturePack: { pack: TexturePack; isBumpActive: boolean };
  /** 羊群與燈池是引擎層建的 composable（要在 effect scope 裡建），世界層只負責 start 與 stop */
  sheepFlock: ReturnType<typeof useSheepFlock>;
  blockLights: ReturnType<typeof useBlockLights>;
  /** 傳送門的霧面與遠景布景都要讀此刻的天色 */
  atmosphere: AtmosphereState;
  getDayRatio: () => number;
  /**
   * 建到一半要不要停
   *
   * 建網格是 await 的，等的這段時間整個渲染端可能已經收掉了。
   * 醒來之後若不檢查，會繼續往一個已經釋放的場景上建東西
   */
  shouldAbort: () => boolean;
}

/**
 * 在地形 worker 裡生出某個場景的方塊資料
 *
 * 與建網格分開：生成可能失敗或逾時，先生好再拆舊的世界，
 * 失敗時人還留在原本的場景裡
 */
export async function generateRealmWorld(realmId: RealmId): Promise<Uint8Array> {
  const terrainWorker = useTerrainWorker()
  try {
    return await terrainWorker.generate(realmId)
  }
  finally {
    /** 逾時或出錯時也要收，不然這支一次性的 worker 會一直掛著 */
    terrainWorker.terminate()
  }
}

/**
 * 建立世界層
 *
 * 建的順序照搬原本 render-runtime 的 buildWorld，有先後關係的地方都寫在各段的註解裡。
 * 中途被叫停就把已經建好的收掉並回傳 null
 */
export async function createWorldLayer({
  realm,
  worldState,
  scene,
  camera,
  texturePack,
  sheepFlock,
  blockLights,
  atmosphere,
  getDayRatio,
  shouldAbort,
}: CreateWorldLayerParam): Promise<WorldLayer | null> {
  const { state: devToggle } = useDevToggles()
  /** 建好一樣就記一筆收尾，拆的時候倒過來收 */
  const disposeList: (() => void)[] = []

  function disposeAll(): void {
    for (const dispose of [...disposeList].reverse()) {
      dispose()
    }
    disposeList.length = 0
  }

  const chunkWorker = useChunkWorker()
  const skinner = createTextureSkinner(scene)
  disposeList.push(() => skinner.dispose())
  skinner.applyPack(texturePack.pack, texturePack.isBumpActive)

  /**
   * 世界上的水掃一次記著
   *
   * 要在渲染器之前：水面材質是建網格時掛上去的，
   * 而掛上去之後第一幀就會去讀這份資料
   */
  const waterMap = scanWaterMap(worldState)

  /** 渲染器收尾時連區塊 worker 一起收 */
  const renderer = createVoxelRenderer(scene, chunkWorker, skinner)
  disposeList.push(() => renderer.dispose())
  await renderer.build(worldState)
  if (shouldAbort()) {
    disposeAll()
    return null
  }

  /**
   * 除錯面板關過水面高光的話，新的網格也要照著關
   *
   * 開關只在變的那一刻通知一次（見 render-runtime 的 watchSettings），
   * 新建的材質是預設的開著
   */
  if (!devToggle.waterGlint) {
    renderer.setWaterGlintEnabled(false)
  }

  /** 方塊做的沙只到世界邊界，外面那片得等渲染器準備好材質再接上去 */
  const sandField = realm.hasGardens ? createSandField(scene, texturePack.pack) : null
  if (sandField) {
    disposeList.push(() => sandField.dispose())
  }

  /**
   * 水鏡池那種天空倒影，走近才畫
   *
   * 大廳映的是那幾座箱庭（HUB_MIRROR_TARGET_LIST），大場景映自己列的那幾池（mirrorTargetList）
   */
  const mirrorTargetList = realm.hasGardens ? HUB_MIRROR_TARGET_LIST : (realm.mirrorTargetList ?? [])
  const waterMirrors = mirrorTargetList.length > 0
    ? createWaterMirrors(scene, camera, worldState, mirrorTargetList)
    : null
  if (waterMirrors) {
    disposeList.push(() => waterMirrors.dispose())
  }

  /**
   * 水面的泡沫、岸線與漣漪，以及水底的焦散
   *
   * 兩者都是材質外掛，網格那邊早就掛好了；這裡建的是推動它們的那一份，
   * 負責寫時間、挑出離玩家最近的那片水、以及把腳步濺成一圈波。
   * 拆的時候倒過來：焦散先收，它會把兩者共用的水面地圖貼圖一起釋放，水面再放掉參考
   */
  const waterSurface = createWaterSurface({
    scene,
    camera,
    waterMap,
    swellArea: realm.swellArea ?? null,
  })
  disposeList.push(() => waterSurface.dispose())
  const waterCaustics = createWaterCaustics({
    scene,
    camera,
    waterMap,
    getDayRatio,
  })
  disposeList.push(() => waterCaustics.dispose())

  /** 羊群：大廳放牧野那一群，大場景有給 sheepFlock 的（羊鳴谷）放自己那一群 */
  if (realm.hasGardens || realm.sheepFlock) {
    sheepFlock.start({ scene, worldState, camera, getDayRatio, skinner, area: realm.sheepFlock })
    disposeList.push(() => sheepFlock.stop())
  }

  if (realm.hasGardens) {
    const campfireSmoke = createCampfireSmoke(scene, worldState)
    disposeList.push(() => campfireSmoke.dispose())
  }

  /**
   * 世界裡的燈火只掃這一次
   *
   * 真光與夜裡的光暈用的是同一份清單，兩者本來就是同一盞燈的兩種表現
   */
  const lightSourceList = collectLightSourceList(worldState)

  /**
   * 體素全局光
   *
   * 世界生成完就能把粗網格建好、丟給 worker——這一步每個場景只做一次，
   * 之後隨太陽角度變化的重烘節流交給它自己的 update
   */
  const voxelGi = createVoxelGi(scene, worldState, lightSourceList)
  disposeList.push(() => voxelGi.dispose())

  /**
   * 燈火的光暈
   *
   * 方塊的自發光只讓燈自己看起來是亮的，光並沒有溢出它的邊界。
   * 夜裡在每一盞燈前面掛一片面向鏡頭的加法圓盤，光才會溢出來。
   *
   * 要帶鏡頭進去：圓盤得每一幀往鏡頭的方向挪出方塊之外，
   * 否則整團暈會被它自己那顆燈籠擋在後面
   */
  const lampGlow = createLampGlow({
    scene,
    camera,
    sourceList: lightSourceList,
    getDayRatio,
  })
  if (lampGlow) {
    disposeList.push(() => lampGlow.dispose())
  }

  /**
   * 燈池：燈籠與營火的真光
   *
   * 烘進方塊的那份光是乘在貼圖上的，夜裡會跟著光照一起被壓掉，
   * 燈只照得亮自己。這裡拿三盞真光輪流去認領離玩家最近的光源方塊，
   * 成本固定，與世界上有幾盞燈無關
   */
  blockLights.start({
    scene,
    camera,
    sourceList: lightSourceList,
    getDayRatio,
  })
  disposeList.push(() => blockLights.stop())

  /** 傳送門的霧面與木牌上的字，門框本身是方塊，已經在網格裡了 */
  const portalGateList = createPortalGateList({ scene, realm, atmosphere })
  disposeList.push(() => portalGateList.dispose())

  /** 場景自己的渲染端裝飾（地底湖窟洞頂的螢光蟲），見 realm-decoration */
  const realmDecoration = createRealmDecoration(realm.id, { scene, worldState })
  if (realmDecoration) {
    disposeList.push(() => realmDecoration.dispose())
  }

  /** 遠山與湖面，只有不循環的大場景有；大廳靠循環與白霧撐出無限 */
  const backdrop = realm.backdrop
    ? createBackdrop({ scene, backdrop: realm.backdrop, atmosphere, pack: texturePack.pack })
    : null
  if (backdrop) {
    disposeList.push(() => backdrop.dispose())
  }

  return {
    realm,
    worldState,
    waterMap,
    voxelGi,
    getWetMaterialList: () => renderer.getWetMaterialList(),
    applyPack(pack, isBumpActive) {
      skinner.applyPack(pack, isBumpActive)
      sandField?.applyPack(pack)
      backdrop?.applyPack(pack)
    },
    setWaterGlintEnabled: (isEnabled) => renderer.setWaterGlintEnabled(isEnabled),
    dispose: disposeAll,
  }
}
