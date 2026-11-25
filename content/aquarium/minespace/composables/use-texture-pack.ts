import type { TexturePack } from '../domains/block/texture-pack'
import { computed } from 'vue'
import { getTexturePack } from '../domains/block/texture-pack'
import { renderSettings } from '../domains/render-host/render-settings'

/**
 * 這一套材質包有沒有法線可用，沒有的話設定頁那個開關要收起來
 *
 * 主執行緒的選單與渲染端都要問，所以獨立成純函式
 */
export function checkSupportsBump(pack: TexturePack): boolean {
  return pack.normalFileSet.size > 0
}

/**
 * 渲染端讀到的材質包
 *
 * 選哪一套、要不要立體紋理都是主執行緒記在瀏覽器裡、再用訊息送來的
 * （見 use-render-preference）。這裡不碰儲存，worker 裡沒有 localStorage
 */
export function useTexturePack() {
  /**
   * 記著的那一套可能已經不在了
   *
   * 材質包被移掉之後，瀏覽器裡存的還是舊的名字。
   * 這時要退回第一套，而不是讓整個世界找不到貼圖
   */
  const pack = computed(() => getTexturePack(renderSettings.texturePackId))

  /**
   * 立體紋理
   *
   * 法線貼圖會讓每一顆方塊的表面真的凹凸起來，石縫與磚縫因此
   * 會隨太陽移動改變明暗——而不是把陰影畫死在圖上。
   *
   * 但它是有代價的：每一份材質多一次貼圖取樣，著色器也多一段
   * 切線空間的計算。開關獨立出來，機器跑不動的人可以只要高解析度的圖。
   * 真正該不該掛法線：包裡有、而且使用者也要
   */
  const bumpActive = computed(() => checkSupportsBump(pack.value) && renderSettings.isBumpEnabled)

  return { pack, bumpActive }
}
