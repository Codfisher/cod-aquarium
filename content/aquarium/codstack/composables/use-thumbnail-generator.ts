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

/** 注意：同時開太多 canvas 會導致 WebGPU 的記憶體耗盡 */
const concurrency = 2

function _useThumbnailGenerator(rootFsHandle: FileSystemDirectoryHandle) {
  const queue = new PQueue({ concurrency })

  /** 指派 index */
  let index = 0
  const generatorList = Array.from({ length: concurrency }, () => createGenerator())
  const blobUrlList: string[] = []

  tryOnScopeDispose(() => {
    blobUrlList.forEach((url) => URL.revokeObjectURL(url))
    generatorList.forEach((g) => g.dispose())
  })

  function createGenerator() {
    let lastContainer: AssetContainer | undefined

    const canvas = document.createElement('canvas')
    canvas.style.visibility = 'hidden'
    canvas.width = 256
    canvas.height = 256
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

    function generateThumbnail(modelFile: ModelFile) {
      return queue.add(async () => {
        // 清掉前一個模型
        if (lastContainer) {
          lastContainer.removeAllFromScene()
          lastContainer.dispose()
          lastContainer = undefined
        }

        const container = await LoadAssetContainerAsync(modelFile.file, scene, {
          pluginOptions: {
            gltf: {
              async preprocessUrlAsync(url) {
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
        lastContainer = container
        container.addAllToScene()

        const meshes = container.meshes.filter((m) => m.getTotalVertices() > 0)
        camera.framingBehavior?.zoomOnMeshesHierarchy(meshes, true)

        engine.runRenderLoop(() => {
          scene.render()
        })
        await scene.whenReadyAsync(true)

        camera.beta = Math.PI / 4
        camera.alpha = Math.PI / 4

        const base64 = await Tools.CreateScreenshotAsync(engine, camera, {
          width: 256,
          height: 256,
        })
        engine.stopRenderLoop()

        const res = await fetch(base64)
        return await res.blob()
      })
    }

    function dispose() {
      canvas.remove()
      engine.dispose()
    }

    return {
      generateThumbnail,
      dispose,
    }
  }

  function generateThumbnail(modelFile: ModelFile) {
    const generator = generatorList[index]
    if (!generator) {
      throw new Error('Generator not found')
    }

    index = (index + 1) % concurrency
    return generator.generateThumbnail(modelFile)
  }

  return { generateThumbnail }
}

export const useThumbnailGenerator = createSharedComposable(_useThumbnailGenerator)
