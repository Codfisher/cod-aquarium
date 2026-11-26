import type { Scene, StandardMaterial } from '@babylonjs/core'
import { measureSection } from '../../composables/use-performance-probe'

/**
 * 凍結方塊材質，省下每幀對上百份材質重新檢查「著色器要不要重編」
 *
 * Babylon 預設每一幀、每個網格、每一道工序（主畫面、陰影、水鏡……）
 * 都會問材質一次「準備好了沒」。這一問不是查旗標：
 * 它要重算光源與霧的定義字串、跑一遍所有材質外掛的 isReady、
 * 把定義轉成字串去查著色器快取，確認結果與上一幀一樣。
 * 這個世界的方塊材質建好之後定義幾乎不會變，這些全是白做的。
 *
 * 凍結（material.freeze）讓材質第一次準備好之後就直接回答「好了」，跳過整段檢查。
 * 量到（本機、720p、出生點、交錯 A/B 各三輪；幀率是 F3 面板上的讀數）：
 * 最省畫質 57 → 82 FPS（CPU 幀 17.4 → 11.9 毫秒）、標準畫質 48 → 58 FPS。
 * 高畫質以上瓶頸在 GPU，看不出差別；這份成本主要是手機與低階機器在付。
 *
 * 代價是之後材質定義真的變了也不會自動重編。能改變定義的事分三類：
 *
 * 一、已知會發生的：開發面板的開關、換材質包（凹凸與視差的有無）、換畫質。
 *     呼叫端遇到這些要呼叫 refresh。
 * 二、凍結之前就定案的：光源數量（方塊燈火在凍結前就建好了）、霧的模式、
 *     材質外掛的啟用（建材質時就決定了）。所以凍結要排在世界與所有系統都建好之後。
 * 三、沒預料到的：靠一個慢速的輪流重驗兜底——每幀讓一份材質重新檢查一次，
 *     所有材質大約每三、四秒輪完一圈，漏掉的變化最慢也在那時候補上。
 *     每份的成本只有一次完整檢查，攤在每幀幾乎量不出來
 */

/** 平常每幀輪流重驗幾份 */
const REVALIDATE_PER_FRAME = 1
/** 收到 refresh 之後每幀重驗幾份，一口氣全做會在那一幀卡一下 */
const REFRESH_PER_FRAME = 12

export interface MaterialFreezer {
  /** 已知定義會變的事發生了，盡快讓所有材質重新檢查 */
  refresh: () => void;
  dispose: () => void;
}

export function createMaterialFreezer(scene: Scene, materialList: StandardMaterial[]): MaterialFreezer {
  for (const material of materialList) {
    material.freeze()
  }

  let cursor = 0
  let pendingRefreshCount = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (materialList.length === 0)
      return

    measureSection('材質重驗', () => {
      const isRefreshing = pendingRefreshCount > 0
      const batchSize = isRefreshing ? REFRESH_PER_FRAME : REVALIDATE_PER_FRAME

      for (let index = 0; index < batchSize; index++) {
        /** 傳 true 才會強制重算定義；不傳的話凍結的材質只重置「準備好了」的旗標，定義仍沿用舊的 */
        materialList[cursor]!.markDirty(true)
        cursor = (cursor + 1) % materialList.length
      }

      if (isRefreshing) {
        pendingRefreshCount = Math.max(0, pendingRefreshCount - batchSize)
      }
    })
  })

  return {
    refresh() {
      pendingRefreshCount = materialList.length
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      for (const material of materialList) {
        material.unfreeze()
      }
    },
  }
}
