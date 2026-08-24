import type { DepthRenderer, DirectionalLight, HemisphericLight, Mesh, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

/**
 * 這一篇的共用場景
 *
 * 岸線、量化與漣漪三個範例看的是同一片水，差別只在水面材質上掛了什麼。
 * 場景本身抽出來，讀者比較的時候才不會因為地形換了而分心
 */

/** 水面的高度，底床的起伏都是相對它算的 */
export const WATER_SURFACE_Y = 0

/** 水面有多寬，底床用同一個尺寸 */
const SURFACE_SIZE = 26

/**
 * 底床的形狀
 *
 * 中間深、往外一路爬上岸。三道週期不同的三角函式讓岸線歪一點，
 * 完全的正圓看不出「淺的地方才有白沫」這件事
 */
function measureBedHeight(x: number, z: number): number {
  const radius = Math.hypot(x, z)
  const wobble = Math.sin(x * 0.42) * 0.55
    + Math.cos(z * 0.37) * 0.45
    + Math.sin((x + z) * 0.24) * 0.35

  return (radius + wobble - 4.6) * 0.34
}

export interface ShoreScene {
  /** 水面那份材質，岸線與漣漪都掛在它上面 */
  waterMaterial: StandardMaterial;
  waterMesh: Mesh;
  /** 太陽，示範白沫疊在哪一層時用得到，調暗它才看得出差別 */
  sun: DirectionalLight;
  /** 補光，隨著太陽一起調暗，天色才不會半明半暗 */
  ambient: HemisphericLight;
}

/**
 * 一片水、一塊底床，加上幾顆從水裡站起來的石頭
 *
 * 石頭是刻意放的。岸線量的是深度差，所以水與石頭的交界會自己浮出一圈白沫，
 * 完全不必知道那裡站著什麼東西
 */
export function createShoreScene({ babylon, scene }: BabylonDemoContext): ShoreScene {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
    VertexBuffer,
  } = babylon

  scene.clearColor = new Color4(0.63, 0.77, 0.92, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.48, -0.74, -0.42), scene)
  sun.intensity = 1.15
  sun.diffuse = new Color3(1, 0.95, 0.84)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.72
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.78, 0.7)
  ambient.specular = new Color3(0, 0, 0)

  const sandTexture = createSandTexture({ babylon, scene, name: 'shore-sand-texture' })
  sandTexture.uScale = SURFACE_SIZE
  sandTexture.vScale = SURFACE_SIZE

  const sandMaterial = new StandardMaterial('shore-sand', scene)
  sandMaterial.diffuseTexture = sandTexture
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 底床用一片切碎的地面去推頂點
   *
   * 本體是一格一格的方塊，這裡改成平滑的斜坡，
   * 「水愈淺白沫愈濃」那條漸變才看得清楚
   */
  const bed = MeshBuilder.CreateGround(
    'shore-bed',
    { width: SURFACE_SIZE, height: SURFACE_SIZE, subdivisions: 72 },
    scene,
  )
  const positionList = bed.getVerticesData(VertexBuffer.PositionKind)
  if (positionList) {
    for (let index = 0; index < positionList.length; index += 3) {
      positionList[index + 1] = measureBedHeight(positionList[index]!, positionList[index + 2]!)
    }
    bed.setVerticesData(VertexBuffer.PositionKind, positionList, true)
    bed.createNormals(true)
  }
  bed.material = sandMaterial
  bed.isPickable = false

  const stoneMaterial = new StandardMaterial('shore-stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'shore-stone-texture' })
  stoneMaterial.specularColor = new Color3(0.03, 0.03, 0.03)

  for (const [index, [x, z, size]] of ([[-2.2, 1.6, 1.4], [1.9, -2.4, 1.1], [3.1, 2.2, 0.8]] as const).entries()) {
    const stone = MeshBuilder.CreateBox(`shore-stone-${index}`, { size }, scene)
    /** 頂面剛好探出水面一點點，交界那圈白沫才看得到 */
    stone.position.set(x, WATER_SURFACE_Y + size / 2 - 0.35, z)
    stone.material = stoneMaterial
    stone.isPickable = false
  }

  /**
   * 水面
   *
   * 半透明是必要的，不只為了看得到水底：深度圖那一趟不畫半透明的東西，
   * 水面因此不在圖上，著色器問到的才會是水底下那塊實體
   */
  const waterMaterial = new StandardMaterial('shore-water', scene)
  waterMaterial.diffuseColor = new Color3(0.55, 0.78, 1)
  waterMaterial.specularColor = new Color3(0.55, 0.6, 0.65)
  waterMaterial.specularPower = 128
  waterMaterial.alpha = 0.72

  const waterMesh = MeshBuilder.CreateGround(
    'shore-water-surface',
    { width: SURFACE_SIZE, height: SURFACE_SIZE },
    scene,
  )
  waterMesh.position.y = WATER_SURFACE_Y
  waterMesh.material = waterMaterial
  waterMesh.isPickable = false

  return { waterMaterial, waterMesh, sun, ambient }
}

/**
 * 場景深度圖
 *
 * 存視空間的 Z，取樣用最近鄰。沒有東西的地方要當成無限遠，
 * 底色給零的話等於「實體就貼在鏡頭上」，整片水會被判成貼著岸。
 *
 * 回傳整個 depthRenderer 而不是只回傳貼圖，是因為 demo-depth-map
 * 要示範「沒修正遠平面會怎樣」，得留一條路讓它事後再改 clearColor
 */
export function createSceneDepth({ babylon, scene, camera }: BabylonDemoContext): DepthRenderer {
  const depthRenderer = scene.enableDepthRenderer(
    camera,
    false,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
    true,
  )
  depthRenderer.clearColor = new babylon.Color4(camera.maxZ, 0, 0, 1)

  const depthMap = depthRenderer.getDepthMap()

  /** 換視窗大小時要跟著換，不然深度與畫面會錯開 */
  const engine = scene.getEngine()
  engine.onResizeObservable.add(() => {
    depthMap.resize({
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
    })
  })

  return depthRenderer
}
