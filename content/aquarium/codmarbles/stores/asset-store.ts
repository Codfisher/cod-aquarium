import type { AbstractMesh, AssetContainer, Scene } from '@babylonjs/core'
import { AssetsManager, ImportMeshAsync, LoadAssetContainerAsync, PBRMaterial } from '@babylonjs/core'
import { defineStore } from 'pinia'
import { flatMap, pipe, unique, uniqueBy } from 'remeda'
import { ref } from 'vue'
import { trackSegmentData } from '../track-segment/data'

export const useAssetStore = defineStore('asset', () => {
  const assetCache: Map<string, AssetContainer> = new Map()

  const isLoading = ref(false)

  async function preloadTrackAssets(
    scene: Scene,
  ) {
    // const assetsManager = new AssetsManager(scene)
    // assetsManager.useDefaultLoadingScreen = false

    const uniquePartList = pipe(
      Object.values(trackSegmentData),
      flatMap((data) => data.partList.map((part) => ({
        rootFolderName: data.rootFolderName,
        path: part.path,
      }))),
      uniqueBy(({ rootFolderName, path }) => `${rootFolderName}/${path}`),
    )

    const tasks = uniquePartList.map(async (partData) => {
      const fullPath = `${partData.rootFolderName}/${partData.path}`
      if (assetCache.has(fullPath))
        return

      const container = await LoadAssetContainerAsync(
        `/assets/${fullPath}`,
        scene,
      )
      container.removeAllFromScene()
      assetCache.set(partData.path, container)

      return container
    })

    isLoading.value = true
    await Promise.all(tasks)
    isLoading.value = false
  }

  return {
    isLoading,
    assetCache,
    preloadTrackAssets,
  }
})
