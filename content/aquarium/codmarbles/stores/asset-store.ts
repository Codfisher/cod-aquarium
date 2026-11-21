import type { AssetContainer } from '@babylonjs/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 原本有 preloadTrackAssets 預先載入全部賽道零件，但載入的 container 並沒有被使用（見 domains/track-segment 的註解），
 * 每個零件實例仍各自 ImportMeshAsync。本機 preview 慢速 4G＋CPU 4 倍量測，移除預載後賽道建好的時間由 158 秒降到 133 秒，所以拿掉
 */
export interface TrackAsset {
  container: AssetContainer;
  /** 零件主網格（掛物理、調材質的那顆）在 rootNodes[0].getChildMeshes() 中的位置 */
  geometryMeshIndex: number;
}

export const useAssetStore = defineStore('asset', () => {
  const assetCache: Map<string, Promise<TrackAsset>> = new Map()

  const isLoading = ref(false)

  return {
    isLoading,
    assetCache,
  }
})
