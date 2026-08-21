import type { DynamicTexture, Scene } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 一顆顆粒的貼圖只有四乘四
 *
 * 顆粒在畫面上本來就只佔幾個像素，貼圖再大也是白算的取樣
 */
const TEXTURE_SIZE = 4

/**
 * 一顆硬邊的方形顆粒
 *
 * 柔邊的漸層做出來的是相機拍到的散景，那是寫實遊戲的語彙。
 * 方塊世界裡連水滴與煙都看得出邊界，浮塵沒有理由例外，
 * 所以這裡畫的是中央兩格見方的白點，取樣走 NEAREST 保住硬邊
 */
export function createMoteTexture(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
): DynamicTexture {
  const texture = new babylon.DynamicTexture(
    name,
    { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )

  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(1, 1, 2, 2)

  texture.update()
  texture.hasAlpha = true

  return texture
}

/**
 * 幾顆當參照物的方塊
 *
 * 空氣感是比較出來的。畫面上要先有幾個位置明確的東西，
 * 顆粒飄過它們前面時那段距離才量得出來
 */
export function createLandmarkList(babylon: BabylonModule, scene: Scene): void {
  const layoutList: [number, number, number][] = [
    [-5.5, 1, -3],
    [4.5, 1.5, -6],
    [1.5, 1, 3.5],
    [-2.5, 2, -9],
    [7, 1, 1],
  ]

  for (const [index, [x, height, z]] of layoutList.entries()) {
    const pillar = babylon.MeshBuilder.CreateBox(
      `landmark-${index}`,
      { width: 1, depth: 1, height: height * 2 },
      scene,
    )
    pillar.position.set(x, height, z)
    pillar.isPickable = false

    const material = new babylon.StandardMaterial(`landmark-material-${index}`, scene)
    material.diffuseColor = new babylon.Color3(0.38, 0.33, 0.26)
    material.specularColor = new babylon.Color3(0, 0, 0)
    pillar.material = material
  }
}
