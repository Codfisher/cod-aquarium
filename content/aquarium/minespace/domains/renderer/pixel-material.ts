import type { Scene } from '@babylonjs/core'
import type { TextureKey, TexturePack } from '../block/texture-pack'
import {
  Color3,
  DynamicTexture,
  Material,
  StandardMaterial,
  Texture,
} from '@babylonjs/core'
import { measureSection } from '../../composables/use-performance-probe'
import { pickOverride, resolveTexture } from '../block/texture-pack'
import { setLeafTranslucency } from './leaf-translucency'
import { attachWaterCaustics } from './water-caustics'

/** 動畫貼圖每秒播幾格 */
const TEXTURE_FRAME_RATE = 3.5

/**
 * 一份材質是怎麼長出來的
 *
 * 換材質包時不重建材質、只換貼圖：材質物件上還掛著風的擺動、
 * 淋雨會變暗的登記、水面的高光與自發光——那些與貼圖無關，
 * 重建一次全都要重新接一遍。留著這份配方，換包時照著再做一次貼圖就好
 */
export interface PixelMaterialRecipe {
  name: string;
  textureKey: TextureKey;
  /** 疊在基底上的覆蓋層，例如礦點 */
  overlayKey?: TextureKey;
  /** 方塊定義給的色調，材質包可以覆寫 */
  tint?: [number, number, number];
  pixelTint?: [number, number, number];
  /** pixelTint 是目標色而不是倍率，見 block-constants 的 pixelRecolor */
  pixelRecolor?: boolean;
  frameCount?: number;
  /** 鏤空貼圖不能有 mipmap，否則邊界會生出半透明的中間值 */
  noMipmap?: boolean;
  /** 走 alpha test 的鏤空材質 */
  cutout?: boolean;
  /**
   * 網格的法線被改成一律朝上
   *
   * 花草、睡蓮與水面都是這樣打光的（見 voxel-renderer 的 applyUpwardNormals）：
   * 那是刻意造假，為了讓整塊取同一個亮度。
   *
   * 代價是切線空間跟著失真。法線貼圖存的是「相對於表面的偏移」，
   * 得有正確的切線座標系才解得回來——立著的葉片卻宣稱自己朝上，
   * 算出來的偏移方向完全是錯的。所以這種材質一律不掛法線
   */
  flatShaded?: boolean;
  /** 背面用翻轉後的法線打光，樹葉要、花草不要 */
  twoSidedLighting?: boolean;
  /**
   * 逆光時透出來多少，零是不透光
   *
   * 樹葉與花草才有。透出來的顏色由貼圖自己決定（見 leaf-translucency），
   * 所以這裡只需要一個量，不必為每一種葉子各配一個顏色
   */
  translucency?: number;
  /** 高光的顏色，液體會另外調高 */
  specularColor?: Color3;
  /**
   * 這是不是液體
   *
   * 只影響一件事：液體不掛水下焦散。水面自己有一套效果
   * （見 water-surface），兩者共用同一份 GLSL 函式，
   * 同時掛上去等於把同一個函式宣告兩次，整份材質會編譯失敗
   */
  isLiquid?: boolean;
}

interface MaterialEntry {
  material: StandardMaterial;
  recipe: PixelMaterialRecipe;
  /** 這一份材質目前掛著的東西，換包前要全部收乾淨 */
  disposeList: (() => void)[];
}

/**
 * 貼圖工廠
 *
 * 全世界的方塊材質都從這裡出來，也只有這裡知道
 * 「目前是哪一套材質包」。換包時它把每一份材質的貼圖重做一次，
 * 材質物件本身原封不動
 */
export interface TextureSkinner {
  /** 依配方生一份材質，貼圖用目前這套材質包的 */
  create: (recipe: PixelMaterialRecipe) => StandardMaterial;
  /** 換一套材質包，或改變立體紋理的開關 */
  applyPack: (pack: TexturePack, bumpEnabled: boolean) => void;
  dispose: () => void;
}

/**
 * 把 base 與 overlay 合成到 Canvas 上
 *
 * 礦石就是這樣長出來的：石頭當底，礦點那張背景全透明的圖疊上去
 */
function createCompositedTexture(
  name: string,
  basePath: string,
  overlayPath: string,
  size: number,
  scene: Scene,
): DynamicTexture {
  const dynamicTexture = new DynamicTexture(name, size, scene, false, Texture.NEAREST_SAMPLINGMODE)

  const baseImage = new Image()
  const overlayImage = new Image()
  let loadedCount = 0

  const tryComposite = () => {
    loadedCount++
    if (loadedCount < 2)
      return

    const context = dynamicTexture.getContext()
    if (context instanceof CanvasRenderingContext2D) {
      context.imageSmoothingEnabled = false
    }
    context.clearRect(0, 0, size, size)
    context.drawImage(baseImage, 0, 0, size, size)
    context.drawImage(overlayImage, 0, 0, size, size)
    dynamicTexture.update()
  }

  baseImage.onload = tryComposite
  overlayImage.onload = tryComposite
  baseImage.src = basePath
  overlayImage.src = overlayPath

  return dynamicTexture
}

/**
 * 直接在畫布上把貼圖的像素重新上色
 *
 * 材質的 tint 只能把顏色調暗：著色器是先把「光照 × tint」夾在 1 以內，
 * 再乘上貼圖的顏色，所以某個通道最亮就是貼圖本身的值。
 * 一張綠葉貼圖的紅只有 0.26，tint 的紅開到多大都紅不起來。
 *
 * 要把綠葉變成秋天的橘黃，只能在像素層下手：
 * 逐一乘上倍率再寫回畫布，鏤空的透明度原封不動留著
 */
function createRecoloredTexture(
  name: string,
  texturePath: string,
  size: number,
  scene: Scene,
  pixelTint: [number, number, number],
  isRecolor: boolean,
): DynamicTexture {
  const dynamicTexture = new DynamicTexture(name, size, scene, false, Texture.NEAREST_SAMPLINGMODE)

  const image = new Image()
  image.onload = () => {
    const context = dynamicTexture.getContext()
    if (context instanceof CanvasRenderingContext2D) {
      context.imageSmoothingEnabled = false
    }
    context.clearRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)

    const imageData = context.getImageData(0, 0, size, size)
    const { data } = imageData
    for (let index = 0; index < data.length; index += 4) {
      if (isRecolor) {
        /**
         * 先取亮度，再乘上目標色
         *
         * 亮度用的是人眼的加權，不是三個通道的平均：綠色看起來本來就比藍色亮，
         * 平均會讓綠葉整片偏亮、藍花整片偏暗，明暗的層次就跑掉了。
         *
         * 乘二是把中間調當基準——亮度 0.5 的像素剛好染成目標色本身，
         * 比它亮的往上、暗的往下，貼圖原本的紋理都還在
         */
        const luminance = (
          data[index]! * 0.2126
          + data[index + 1]! * 0.7152
          + data[index + 2]! * 0.0722
        ) / 255

        data[index] = Math.min(255, luminance * 2 * pixelTint[0] * 255)
        data[index + 1] = Math.min(255, luminance * 2 * pixelTint[1] * 255)
        data[index + 2] = Math.min(255, luminance * 2 * pixelTint[2] * 255)
        continue
      }

      data[index] = Math.min(255, data[index]! * pixelTint[0])
      data[index + 1] = Math.min(255, data[index + 1]! * pixelTint[1])
      data[index + 2] = Math.min(255, data[index + 2]! * pixelTint[2])
    }
    context.putImageData(imageData, 0, 0)

    dynamicTexture.update()
  }
  image.src = texturePath

  return dynamicTexture
}

/**
 * 讓直向排列的連續畫格動起來
 *
 * 貼圖是 frameCount 張圖上下疊成一條，
 * v 軸縮到只取一格，再逐格往下捲，水面就流動起來了
 */
function playTextureFrames(texture: Texture, frameCount: number, scene: Scene): () => void {
  texture.vScale = 1 / frameCount
  texture.wrapV = Texture.WRAP_ADDRESSMODE

  let elapsed = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    measureSection('方塊動畫', () => {
      elapsed += scene.getEngine().getDeltaTime() / 1000
      texture.vOffset = Math.floor(elapsed * TEXTURE_FRAME_RATE) % frameCount / frameCount
    })
  })

  /** 換材質包時要拆掉，否則每換一次就多一個觀察者在推已經被釋放的貼圖 */
  return () => scene.onBeforeRenderObservable.remove(observer)
}

export function createTextureSkinner(scene: Scene): TextureSkinner {
  const entryList: MaterialEntry[] = []
  let currentPack: TexturePack | null = null
  let isBumpEnabled = false

  /** 把上一套材質包留下的貼圖與觀察者收乾淨 */
  function clearEntry(entry: MaterialEntry) {
    for (const dispose of entry.disposeList) {
      dispose()
    }
    entry.disposeList.length = 0
  }

  /**
   * 依目前的材質包替一份材質換上貼圖
   *
   * 色調要在這裡才算得出來：同一顆方塊在不同材質包裡該不該染、
   * 染多少都不一樣（見 texture-pack.ts 的 PackTexture）
   */
  function skin(entry: MaterialEntry) {
    if (!currentPack)
      return

    clearEntry(entry)

    const { material, recipe } = entry
    const resolved = resolveTexture(currentPack, recipe.textureKey)
    if (!resolved.url)
      return

    const tint = pickOverride(resolved.tint, recipe.tint)
    const pixelTint = pickOverride(resolved.pixelTint, recipe.pixelTint)
    const frameCount = pickOverride(resolved.frameCount, recipe.frameCount)
    /** 畫布合成與重新上色都要一個尺寸，取材質包的解析度才不會被縮糊 */
    const canvasSize = currentPack.resolution

    const overlay = recipe.overlayKey
      ? resolveTexture(currentPack, recipe.overlayKey)
      : null

    let diffuseTexture: Texture
    if (overlay?.url) {
      diffuseTexture = createCompositedTexture(
        `${recipe.name}_tex`,
        resolved.url,
        overlay.url,
        canvasSize,
        scene,
      )
    }
    else if (pixelTint) {
      diffuseTexture = createRecoloredTexture(
        `${recipe.name}_tex`,
        resolved.url,
        canvasSize,
        scene,
        pixelTint,
        recipe.pixelRecolor === true,
      )
    }
    else {
      const texture = new Texture(resolved.url, scene, {
        samplingMode: Texture.NEAREST_SAMPLINGMODE,
        noMipmap: recipe.noMipmap,
      })
      if (frameCount && frameCount > 1) {
        entry.disposeList.push(playTextureFrames(texture, frameCount, scene))
      }
      diffuseTexture = texture
    }

    material.diffuseTexture = diffuseTexture
    entry.disposeList.push(() => diffuseTexture.dispose())

    if (recipe.cutout) {
      diffuseTexture.hasAlpha = true
    }

    /**
     * 色調要每次重設
     *
     * 上一套材質包可能把它染過，這一套若沒有意見就得回到白色，
     * 否則換過去會帶著前一套的顏色
     */
    material.diffuseColor = tint ? new Color3(...tint) : new Color3(1, 1, 1)

    applyBumpTexture(entry, resolved.normalUrl, resolved.specularUrl)
  }

  /**
   * 法線與高光
   *
   * 法線圖的 RGB 是切線空間的法線向量，alpha 是高度。
   * Babylon 的 bumpTexture 正好就吃這個排法，一個像素都不必改寫。
   *
   * 高度那一欄讓視差開得起來：表面會隨視角錯動，
   * 石縫看起來是真的有深度，而不只是一道畫上去的暗線
   */
  function applyBumpTexture(entry: MaterialEntry, normalUrl: string | null, specularUrl: string | null) {
    const { material, recipe } = entry

    /** 法線造假的表面解不回正確的偏移方向，掛上去只會算出一團亂 */
    if (!isBumpEnabled || !normalUrl || recipe.flatShaded) {
      material.bumpTexture = null
      material.specularTexture = null
      material.useParallax = false
      return
    }

    const bumpTexture = new Texture(normalUrl, scene, {
      /**
       * 法線也要用最近鄰
       *
       * 這是像素風的世界，法線若被線性內插，一格貼圖裡的凹凸
       * 會糊成一團圓滑的起伏，與方稜方角的方塊完全對不起來
       */
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      noMipmap: recipe.noMipmap,
    })
    material.bumpTexture = bumpTexture
    entry.disposeList.push(() => bumpTexture.dispose())

    /**
     * 視差
     *
     * 兩個條件缺一不可。
     *
     * 一是材質包的法線 alpha 真的存了高度，否則整片同一個高度，白算一遍。
     *
     * 二是這份材質不鏤空。視差的做法是「依視角把取樣座標推開一點」，
     * 而推開後的座標連漫射的 alpha 一起帶著跑——
     * 於是不透明的像素被拉進本該全透明的地方，alpha test 判定要畫，
     * 草的上方就浮出一圈描邊，那正是兩片交叉立板自己的輪廓。
     * 實心方塊沒有這個問題：它整片都是不透明的，推到哪裡都還是石頭
     */
    if (currentPack?.hasHeightMap && !recipe.cutout) {
      material.useParallax = true
      /**
       * 位移量壓得很小
       *
       * 一格方塊只有一格見方，位移大一點邊緣就會被推出格子外，
       * 相鄰兩顆方塊之間裂出一道縫
       */
      material.parallaxScaleBias = 0.06
    }
    else {
      material.useParallax = false
    }

    if (!specularUrl)
      return

    /**
     * 高光貼圖
     *
     * 紅色通道是這個表面有多光滑。石頭與木頭幾乎是霧面的，
     * 但濕過的磚、金屬礦脈與冰會在斜射的陽光下亮起一條邊，
     * 那條邊是「這是什麼材料」最有效的線索
     */
    const specularTexture = new Texture(specularUrl, scene, {
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      noMipmap: recipe.noMipmap,
    })
    material.specularTexture = specularTexture
    entry.disposeList.push(() => specularTexture.dispose())
  }

  function create(recipe: PixelMaterialRecipe): StandardMaterial {
    const material = new StandardMaterial(recipe.name, scene)

    /**
     * 乾方塊幾乎不反光
     *
     * 平行光的高光已經給滿（見 use-babylon-scene），
     * 所以這個值就是「這種表面有多亮」本身。石頭、泥土與木頭
     * 都是霧面的，留一點點只是讓斜射的陽光在稜線上帶出一絲厚度
     */
    material.specularColor = recipe.specularColor ?? new Color3(0.02, 0.02, 0.02)
    material.backFaceCulling = false
    /** 太陽、環境光，再加上洞裡的幾盞燈 */
    material.maxSimultaneousLights = 6
    /**
     * 接受場景的補光
     *
     * Babylon 的 ambientColor 是「場景的 × 材質的」，材質這一項預設是黑的，
     * 也就是預設完全不吃場景補光。方塊要開起來：
     * 夜裡那道補光是加在光照上、再乘上反照率的，
     * 而方塊光正烘在反照率裡——這是燈火照得出範圍的唯一途徑
     */
    material.ambientColor = new Color3(1, 1, 1)

    if (recipe.cutout) {
      material.useAlphaFromDiffuseTexture = true
      material.transparencyMode = Material.MATERIAL_ALPHATEST
      /**
       * 樹葉這種有體積的方塊，背面用翻轉後的法線計算光照，
       * 從縫隙看進樹冠內部才不會是一片黑。
       *
       * 花草則相反：它們的法線已經統一改成朝上，
       * 再翻轉就會讓背面朝下而變暗，所以要關掉
       */
      material.twoSidedLighting = recipe.twoSidedLighting ?? true
      /**
       * 裁切門檻
       *
       * 關掉 mipmap 之後 alpha 只剩 0 與 1 兩種值，門檻擺在中間最保險。
       * 拉太高會連葉尖那種只有一兩個像素的部分一起啃掉
       */
      material.alphaCutOff = 0.5
    }

    /**
     * 逆光透光
     *
     * 設在這裡而不是換材質包時：透多少是方塊自己的性質——
     * 一片葉子換了貼圖還是一片葉子。材質包只決定它透出來是什麼顏色，
     * 而那件事是著色器拿貼圖的顏色去乘的，不必在這裡管
     */
    if (recipe.translucency) {
      setLeafTranslucency(material, recipe.translucency)
    }

    /**
     * 泡在水裡的東西要有水面聚出來的光網
     *
     * 掛在這裡而不是渲染器那邊：方塊材質全部從這個工廠出來，
     * 而「哪些方塊會被水淹到」是問不出來的——地形是生成的，
     * 沙、石、黏土、水草、走到水裡的羊都可能在水面下。
     * 與其猜，不如全部掛上，由著色器自己判斷這個片元在不在水下
     */
    if (!recipe.isLiquid) {
      attachWaterCaustics(material)
    }

    const entry: MaterialEntry = { material, recipe, disposeList: [] }
    entryList.push(entry)
    skin(entry)

    return material
  }

  return {
    create,
    applyPack(pack, bumpEnabled) {
      if (currentPack === pack && isBumpEnabled === bumpEnabled)
        return

      currentPack = pack
      isBumpEnabled = bumpEnabled
      for (const entry of entryList) {
        skin(entry)
      }
    },
    dispose() {
      for (const entry of entryList) {
        clearEntry(entry)
      }
      entryList.length = 0
    },
  }
}
