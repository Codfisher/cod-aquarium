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

function _useThumbnailGenerator(rootFsHandle: FileSystemDirectoryHandle) {
  const queue = new PQueue({ concurrency: 1 })

  let _canvas: HTMLCanvasElement | undefined
  let _engine: Engine | undefined
  let _scene: Scene | undefined
  let _camera: ArcRotateCamera | undefined

  let lastContainer: AssetContainer | undefined
  const blobUrlList: string[] = []

  tryOnScopeDispose(() => {
    blobUrlList.forEach((url) => URL.revokeObjectURL(url))
  })

  function init() {
    if (_scene) {
      return
    }

    _canvas = document.createElement('canvas')
    _canvas.style.visibility = 'hidden'
    _canvas.width = 256
    _canvas.height = 256
    document.body.appendChild(_canvas)

    _engine = new Engine(_canvas, true)
    _scene = new Scene(_engine)
    _scene.clearColor = new Color4(0, 0, 0, 0)

    _camera = new ArcRotateCamera('camera', Math.PI / 4, Math.PI / 4, 5, Vector3.Zero(), _scene)
    _camera.attachControl(_canvas, true)
    _camera.lowerBetaLimit = 0.05
    _camera.upperBetaLimit = Math.PI / 2 - 0.05
    _camera.useFramingBehavior = true
    if (_camera.framingBehavior) {
      _camera.framingBehavior.mode = FramingBehavior.FitFrustumSidesMode
      _camera.framingBehavior.radiusScale = 1
      _camera.framingBehavior.framingTime = 0
    }

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), _scene)
  }

  function generateThumbnail(modelFile: ModelFile) {
    return queue.add(async () => {
      init()

      const [engine, scene, camera] = [_engine, _scene, _camera]
      if (!engine || !scene || !camera) {
        throw new Error('Engine or Scene or Camera not initialized')
      }

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

  return { generateThumbnail }
}

export const useThumbnailGenerator = createSharedComposable(_useThumbnailGenerator)
