import type { AssetContainer, Scene } from '@babylonjs/core'
import { AssetsManager, PBRMaterial } from '@babylonjs/core'
import { defineStore } from 'pinia'
import { flatMap, pipe, unique } from 'remeda'
import { trackSegmentData } from '../track-segment/data'

export const useAssetStore = defineStore('asset', () => {
  const assetCache: Map<string, AssetContainer> = new Map()

  async function preloadTrackAssets(
    scene: Scene,
  ) {
    const assetsManager = new AssetsManager(scene)
    assetsManager.useDefaultLoadingScreen = false

    const uniquePathList = pipe(
      Object.values(trackSegmentData),
      flatMap((data) => data.partList.map((part) => `${data.rootFolderName}/${part.path}`)),
      unique(),
    )

    uniquePathList.forEach((fullPath) => {
      if (assetCache.has(fullPath))
        return

      // 解析路徑
      const lastSlash = fullPath.lastIndexOf('/')
      const rootUrl = `/assets/${fullPath.substring(0, lastSlash + 1)}`
      const fileName = fullPath.substring(lastSlash + 1)

      const task = assetsManager.addContainerTask(
        `load_${fullPath}`,
        '',
        rootUrl,
        fileName,
      )

      task.onSuccess = (taskResult) => {
        const container = taskResult.loadedContainer
        container.removeAllFromScene()

        assetCache.set(fullPath, container)
      }
    })

    await assetsManager.loadAsync()
  }

  return {
    assetCache,
    preloadTrackAssets,
  }
})
