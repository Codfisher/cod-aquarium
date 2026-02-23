import type { AssetContainer } from '@babylonjs/core'
import type { BlockType } from '../domains/block/type'
import {
  ArcRotateCamera,
  Color4,
  Engine,
  FramingBehavior,
  HemisphericLight,
  Quaternion,
  Scene,
  Tools,
  Vector3,
} from '@babylonjs/core'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { createSharedComposable, tryOnScopeDispose } from '@vueuse/core'
import PQueue from 'p-queue'
import { blockDefinitions } from '../domains/block/builder/data'

function getOptimalConcurrency(): number {
  // 如果不在瀏覽器環境，給一個最保守的預設值
  if (typeof window === 'undefined' || !window.navigator) {
    return 2
  }

  // 1. CPU 核心數 (預設當作 4 核)
  const cores = navigator.hardwareConcurrency || 4

  // 2. 設備記憶體大小 (單位 GB，為保護隱私，多數瀏覽器最大只會回傳 8)
  // 注意：deviceMemory 並非所有瀏覽器都支援，所以要轉型並給預設值
  const memory = (navigator as any).deviceMemory || 4

  let optimal = 2

  if (cores >= 8 && memory >= 8) {
    optimal = 6
  }
  else if (cores >= 4 && memory >= 4) {
    optimal = 4
  }
  else {
    optimal = 2
  }

  return Math.min(optimal, 6)
}

const concurrency = getOptimalConcurrency()
const size = 128

function _useThumbnailGenerator() {
  let index = 0
  const generatorList = Array.from({ length: concurrency }, () => createGenerator())
  const blobUrlList: string[] = []

  tryOnScopeDispose(() => {
    blobUrlList.forEach((url) => URL.revokeObjectURL(url))
    generatorList.forEach((g) => g.dispose())
  })

  function createGenerator() {
    const queue = new PQueue({ concurrency: 1 })

    let lastContainerList: AssetContainer[] = []
    function clearLastContainer() {
      lastContainerList.forEach((c) => {
        c.removeAllFromScene()
        c.dispose()
      })
      lastContainerList = []
    }

    const canvas = document.createElement('canvas')
    canvas.style.visibility = 'hidden'
    canvas.width = size
    canvas.height = size
    document.body.appendChild(canvas)

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0, 0, 0, 0)

    const camera = new ArcRotateCamera('camera', Math.PI / 4, Math.PI / 4, 5, Vector3.Zero(), scene)

    camera.lowerBetaLimit = 0.05
    camera.upperBetaLimit = Math.PI / 2 - 0.05
    camera.minZ = 0.001

    camera.useFramingBehavior = true
    if (camera.framingBehavior) {
      camera.framingBehavior.mode = FramingBehavior.FitFrustumSidesMode
      camera.framingBehavior.radiusScale = 1
      camera.framingBehavior.framingTime = 0
    }

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)

    function generateThumbnail(blockType: BlockType, options?: { signal?: AbortSignal }) {
      const { signal } = options || {}

      return queue.add(async () => {
        function checkAbort() {
          if (signal?.aborted) {
            clearLastContainer()
            throw new DOMException('Aborted by user', 'AbortError')
          }
        }

        checkAbort()

        const blockData = blockDefinitions[blockType]

        const tasks = blockData.content.partList.map(async (part) => {
          const modelPath = `${blockData.content.rootFolderName}/${part.path}`
          const model = await LoadAssetContainerAsync(modelPath, scene)
          const root = model.meshes[0]

          if (root) {
            root.position.copyFrom(Vector3.FromArray(part.position))
            root.rotationQuaternion?.copyFrom(Quaternion.FromArray(part.rotationQuaternion))
            root.scaling.copyFrom(Vector3.FromArray(part.scaling))
          }

          return model
        })

        const containerList = await Promise.all(tasks)

        checkAbort()

        clearLastContainer()
        lastContainerList = containerList
        containerList.forEach((c) => c.addAllToScene())

        const meshes = containerList.flatMap((c) => c.meshes).filter((m) => m.getTotalVertices() > 0)
        camera.framingBehavior?.zoomOnMeshesHierarchy(meshes, true)

        engine.runRenderLoop(() => {
          scene.render()
        })

        await scene.whenReadyAsync(true)

        checkAbort()

        camera.beta = Math.PI / 4
        camera.alpha = Math.PI / 4

        const base64 = await Tools.CreateScreenshotAsync(engine, camera, {
          width: size,
          height: size,
        })
        engine.stopRenderLoop()

        const res = await fetch(base64)
        return await res.blob()
      }, { signal })
    }

    function dispose() {
      queue.clear()
      canvas.remove()
      engine.dispose()
    }

    return {
      generateThumbnail,
      dispose,
    }
  }

  function generateThumbnail(blockType: BlockType, options?: { signal?: AbortSignal }) {
    const generator = generatorList[index]
    if (!generator) {
      throw new Error('Generator not found')
    }

    index = (index + 1) % concurrency
    return generator.generateThumbnail(blockType, options)
  }

  return { generateThumbnail }
}

export const useThumbnailGenerator = createSharedComposable(_useThumbnailGenerator)
