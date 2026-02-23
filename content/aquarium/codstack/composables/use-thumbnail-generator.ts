import type { AssetContainer } from '@babylonjs/core'
import type { ModelFile } from '../type'
import {
  ArcRotateCamera,
  Color4,
  Engine,
  FramingBehavior,
  HemisphericLight,
  Scene,
  Tools,
  Vector3,
} from '@babylonjs/core'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { createSharedComposable, tryOnScopeDispose } from '@vueuse/core'
import PQueue from 'p-queue'
import { pipe } from 'remeda'
import { getFileFromPath } from '../utils/fs'

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

function _useThumbnailGenerator(rootFsHandle: FileSystemDirectoryHandle) {
  let index = 0
  const generatorList = Array.from({ length: concurrency }, () => createGenerator())
  const blobUrlList: string[] = []

  tryOnScopeDispose(() => {
    blobUrlList.forEach((url) => URL.revokeObjectURL(url))
    generatorList.forEach((g) => g.dispose())
  })

  function createGenerator() {
    const queue = new PQueue({ concurrency: 1 })

    let lastContainer: AssetContainer | undefined
    function clearLastContainer() {
      lastContainer?.removeAllFromScene()
      lastContainer?.dispose()
      lastContainer = undefined
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
    camera.useFramingBehavior = true
    if (camera.framingBehavior) {
      camera.framingBehavior.mode = FramingBehavior.FitFrustumSidesMode
      camera.framingBehavior.radiusScale = 1
      camera.framingBehavior.framingTime = 0
    }

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)

    // 新增 options 參數來接收 signal
    function generateThumbnail(modelFile: ModelFile, options?: { signal?: AbortSignal }) {
      const { signal } = options || {}

      // 將 signal 傳給 queue，如果任務還在排隊時被取消，p-queue 會自動拋出 AbortError 並拒絕執行
      return queue.add(async () => {
        // 定義檢查取消的 Helper 函式
        function checkAbort() {
          if (signal?.aborted) {
            clearLastContainer()
            throw new DOMException('Aborted by user', 'AbortError')
          }
        }

        checkAbort()

        const container = await LoadAssetContainerAsync(modelFile.file, scene, {
          pluginOptions: {
            gltf: {
              async preprocessUrlAsync(url) {
                checkAbort()

                const file = await pipe(
                  modelFile.path.replace(modelFile.name, ''),
                  (path) => getFileFromPath(rootFsHandle, `${path}${url}`),
                )

                const blobUrl = URL.createObjectURL(file)
                blobUrlList.push(blobUrl)

                return blobUrl
              },
            },
          },
        })

        checkAbort()

        clearLastContainer()
        lastContainer = container
        container.addAllToScene()

        const meshes = container.meshes.filter((m) => m.getTotalVertices() > 0)
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

  function generateThumbnail(modelFile: ModelFile, options?: { signal?: AbortSignal }) {
    const generator = generatorList[index]
    if (!generator) {
      throw new Error('Generator not found')
    }

    index = (index + 1) % concurrency
    return generator.generateThumbnail(modelFile, options)
  }

  return { generateThumbnail }
}

export const useThumbnailGenerator = createSharedComposable(_useThumbnailGenerator)
