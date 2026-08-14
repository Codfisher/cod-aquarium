import type { TexturePackId } from '../domains/block/texture-pack'
import { createSharedComposable, useStorage } from '@vueuse/core'
import { computed } from 'vue'
import { getTexturePack, TEXTURE_PACK_LIST } from '../domains/block/texture-pack'

/**
 * 目前用哪一套材質包
 *
 * 記在瀏覽器裡。挑材質包這件事比畫質更「這是我的世界該長什麼樣」，
 * 下次進來當然要還是同一套
 */
export function _useTexturePack() {
  const packId = useStorage<TexturePackId>('minespace-texture-pack', 'miniPixel')

  /**
   * 立體紋理
   *
   * 法線貼圖會讓每一顆方塊的表面真的凹凸起來，石縫與磚縫因此
   * 會隨太陽移動改變明暗——而不是把陰影畫死在圖上。
   *
   * 但它是有代價的：每一份材質多一次貼圖取樣，著色器也多一段
   * 切線空間的計算。開關獨立出來，機器跑不動的人可以只要高解析度的圖
   */
  const bumpEnabled = useStorage('minespace-texture-bump', true)

  /**
   * 記著的那一套可能已經不在了
   *
   * 材質包被移掉之後，瀏覽器裡存的還是舊的名字。
   * 這時要退回第一套，而不是讓整個世界找不到貼圖
   */
  const pack = computed(() => getTexturePack(packId.value))

  /** 這一套有沒有法線可用，沒有的話設定頁那個開關要收起來 */
  const supportsBump = computed(() => pack.value.normalFileSet.size > 0)
  /** 真正該不該掛法線：包裡有、而且使用者也要 */
  const bumpActive = computed(() => supportsBump.value && bumpEnabled.value)

  return {
    packId,
    pack,
    packList: TEXTURE_PACK_LIST,
    bumpEnabled,
    supportsBump,
    bumpActive,
  }
}

export const useTexturePack = createSharedComposable(_useTexturePack)
