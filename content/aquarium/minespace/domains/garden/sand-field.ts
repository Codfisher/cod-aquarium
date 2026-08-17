import type { Scene } from '@babylonjs/core'
import type { TexturePack } from '../block/texture-pack'
import { Color3, MeshBuilder, StandardMaterial, Texture } from '@babylonjs/core'
import { resolveTexture } from '../block/texture-pack'
import { WORLD_SIZE } from '../world/world-constants'
import { SAND_LEVEL } from './garden-constants'

/**
 * 沙地往世界外圍延伸的距離
 *
 * 玩家實際走不到那裡——跨過邊界就被送回對面——
 * 但視覺上必須一路延伸出去，「無限」的錯覺才成立
 */
const SAND_FIELD_MARGIN = 1200
/** 與方塊白沙同一組色偏，兩片地才接得起來 */
const WHITE_SAND_PIXEL_TINT: [number, number, number] = [1.1, 1.1, 1.1]

/** 這片地會跟著材質包換皮 */
export interface SandField {
  /** 換一套材質包 */
  applyPack: (pack: TexturePack) => void;
  dispose: () => void;
}

/**
 * 整片白沙地
 *
 * 這是效能上最重要的一塊。白沙鋪滿兩百八十格見方的世界，
 * 若照方塊畫就是五萬八千個實例，佔掉全場六成五的繪製量——
 * 但那整片是完全平的，用一片地面網格就畫完了，一個 draw call 取代五萬八千個實例。
 *
 * 方塊資料照樣留在世界裡：碰撞、腳步聲、雨滴射線都還讀得到，
 * 只有渲染器把 WHITE_SAND 標成不畫（見 block-constants 的 isHidden）。
 * 箱庭甲板上那種沙是另一個方塊（GARDEN_SAND），數量少，照常畫成方塊
 */
export function createSandField(scene: Scene, pack: TexturePack): SandField {
  /**
   * 比方塊頂面低一公分
   *
   * 沙紋、墊腳石這些留著沒被隱藏的方塊，頂面正好都在 SAND_LEVEL + 0.5。
   * 這片地若也擺在同一個高度，兩者的深度值一模一樣，
   * 遠看會出現閃爍的斑塊（z-fighting）。壓低一公分就分得開，
   * 而那一公分的落差肉眼看不出來
   */
  const surfaceY = SAND_LEVEL + 0.5 - 0.01
  /** 鋪到世界之外很遠的地方，地平線才會落在白霧裡而不是一道斷崖 */
  const size = WORLD_SIZE + SAND_FIELD_MARGIN * 2
  const center = (WORLD_SIZE - 1) / 2

  /**
   * 這片地自己做一份材質，不共用方塊那一套
   *
   * 方塊的白沙是用 DynamicTexture 逐像素乘上色偏做出來的，
   * 那條路有兩個地方在這裡會出事：
   *
   * 一、DynamicTexture 的環繞模式預設是 CLAMP。方塊的 uScale 是 1，
   *     UV 落在 0～1 之間看不出差別；但這片地要平鋪兩千多次，
   *     UV 被夾在 0～1 之後整片地都在取同一個邊緣像素——變成一片死白。
   * 二、DynamicTexture 建立時關掉了 mipmap。方塊只有一格見方無所謂，
   *     這片地一路鋪到天邊，沒有 mipmap 遠處會閃成一片雜訊。
   *
   * 銀沙那張貼圖的亮度落在 200～230 之間，乘上 1.1 不會超過 255，
   * 所以色偏直接交給 diffuseColor 就好，結果與逐像素相乘完全一樣
   */
  const material = new StandardMaterial('sand-field', scene)

  /**
   * 換材質包時只換這片地的貼圖
   *
   * 色偏也要跟著換：材質包若說「這張圖本身就是對的白」，
   * 再乘上 1.1 只會把整片沙推成死白
   */
  const applyPack = (currentPack: TexturePack) => {
    material.diffuseTexture?.dispose()

    const resolved = resolveTexture(currentPack, 'whiteSand')
    if (!resolved.url)
      return

    const texture = new Texture(resolved.url, scene, {
      samplingMode: Texture.NEAREST_LINEAR_MIPLINEAR,
    })
    texture.wrapU = Texture.WRAP_ADDRESSMODE
    texture.wrapV = Texture.WRAP_ADDRESSMODE
    /** 一格一張，貼圖密度與箱庭裡的方塊白沙完全一致 */
    texture.uScale = size
    texture.vScale = size
    material.diffuseTexture = texture

    const pixelTint = resolved.pixelTint === null ? undefined : WHITE_SAND_PIXEL_TINT
    material.diffuseColor = pixelTint ? new Color3(...pixelTint) : new Color3(1, 1, 1)
  }

  applyPack(pack)
  material.specularColor = new Color3(0.08, 0.08, 0.08)
  /** 與方塊材質一致，亮度才不會差一階 */
  material.maxSimultaneousLights = 6
  /** 同樣要吃夜裡的補光，否則入夜後這片沙會比木座上的沙暗一階 */
  material.ambientColor = new Color3(1, 1, 1)

  const ground = MeshBuilder.CreateGround('sand-field', { width: size, height: size }, scene)
  ground.material = material
  ground.position.set(center, surfaceY, center)
  ground.isPickable = false
  /**
   * 要接陰影
   *
   * 白沙是整個場景面積最大的一塊地，樹、木座、鳥居的影子全都落在它上面；
   * 不接陰影的話整片沙地會是平的，連木座自己的影子都看不到。
   *
   * 這片地鋪到一千多格外、遠遠超出陰影的投影範圍，但那不成問題：
   * PCF 的著色器對投影範圍外會直接回傳「全亮」
   * （`if (uv.x<0. || uv.x>1.0 ...) return 1.0;`），
   * 再配上 frustumEdgeFalloff 讓邊緣淡出，看不出分界在哪
   */
  ground.receiveShadows = true

  return {
    applyPack,
    dispose() {
      material.diffuseTexture?.dispose()
      material.dispose()
      ground.dispose()
    },
  }
}
