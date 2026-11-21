import type { AssetContainer } from '@babylonjs/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 原本有 preloadTrackAssets 預先載入全部賽道零件，但載入的 container 並沒有被使用（見 domains/track-segment 的註解），
 * 每個零件實例仍各自 ImportMeshAsync。本機 preview 慢速 4G＋CPU 4 倍量測，移除預載後賽道建好的時間由 158 秒降到 133 秒，所以拿掉
 */
export const useAssetStore = defineStore('asset', () => {
  const assetCache: Map<string, AssetContainer> = new Map()

  const isLoading = ref(false)

  return {
    isLoading,
    assetCache,
  }
})
