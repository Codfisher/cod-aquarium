import type { AssetContainer } from '@babylonjs/core'
import type { GLTFFileLoader } from '@babylonjs/loaders'
import type { ModelFile } from '../type'
import {
  ArcRotateCamera,
  Color4,
  Engine,
  EngineStore,
  FramingBehavior,
  HemisphericLight,
  Scene,
  Tools,
  Vector3,
} from '@babylonjs/core'
import { AppendSceneAsync, LoadAssetContainerAsync, SceneLoader } from '@babylonjs/core/Loading/sceneLoader'
import { FilesInputStore } from '@babylonjs/core/Misc/filesInputStore'
import { createSharedComposable, promiseTimeout, tryOnScopeDispose } from '@vueuse/core'
import PQueue from 'p-queue'
import { pipe } from 'remeda'

/**
 * 根據路徑字串，從根目錄 Handle 逐層尋找檔案
 * @param rootHandle 根目錄 Handle
 * @param path 相對路徑 (e.g. "models/furniture/chair.bin")
 */
async function getFileFromPath(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
): Promise<File> {
  const cleanPath = path.replace(/^\.\/|^\//, '')
  const parts = cleanPath.split('/')
  const filename = parts.pop()

  if (!filename)
    throw new Error('Invalid path')

  let currentDir = rootHandle
  for (const dirName of parts) {
    currentDir = await currentDir.getDirectoryHandle(dirName)
  }

  const fileHandle = await currentDir.getFileHandle(filename)
  return await fileHandle.getFile()
}

function _useThumbnailGenerator(rootFSHandle: FileSystemDirectoryHandle) {
  const queue = new PQueue({ concurrency: 1 })

  let _canvas: HTMLCanvasElement | undefined
  let _engine: Engine | undefined
  let _scene: Scene | undefined
  let _camera: ArcRotateCamera | undefined

  let lastContainer: AssetContainer | undefined
  let currentModelFile: ModelFile | undefined
  const blobUrlList: string[] = []

  tryOnScopeDispose(() => {
    blobUrlList.forEach((url) => URL.revokeObjectURL(url))
  })

  const observer = SceneLoader.OnPluginActivatedObservable.add((loader) => {
    if (loader.name === 'gltf') {
      const gltfLoader = loader as GLTFFileLoader

      gltfLoader.preprocessUrlAsync = async (url) => {
        if (!currentModelFile) {
          return url
        }

        // 組成完整路徑
        const targetPath = pipe(
          currentModelFile.path.replace(currentModelFile.name, ''),
          (path) => `${path}${url}`,
        )

        const file = await getFileFromPath(rootFSHandle, targetPath)

        const blobUrl = URL.createObjectURL(file)
        blobUrlList.push(blobUrl)

        return blobUrl
      }
    }
  })

  const init = () => {
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
    _camera.useFramingBehavior = true
    if (_camera.framingBehavior) {
      _camera.framingBehavior.mode = FramingBehavior.FitFrustumSidesMode
      _camera.framingBehavior.radiusScale = 1.2
      _camera.framingBehavior.framingTime = 0
      _camera.framingBehavior.elevationReturnTime = -1
    }

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), _scene)
  }

  const generateThumbnail = (modelFile: ModelFile) => {
    return queue.add(async () => {
      currentModelFile = modelFile

      init()

      const engine = _engine
      const scene = _scene
      const camera = _camera
      if (!engine || !scene || !camera) {
        throw new Error('Engine or Scene or Camera not initialized')
      }

      // 清掉上一個模型
      if (lastContainer) {
        lastContainer.removeAllFromScene()
        lastContainer.dispose()
        lastContainer = undefined
      }

      const container = await LoadAssetContainerAsync(modelFile.file, scene)
      lastContainer = container
      container.addAllToScene()

      const rootMesh = scene.meshes[0]
      if (rootMesh && camera) {
        camera.framingBehavior?.zoomOnMeshHierarchy(rootMesh, true)
      }

      engine.runRenderLoop(() => {
        scene.render()
      })
      await scene.whenReadyAsync(true)

      const base64 = await Tools.CreateScreenshotAsync(engine, camera, {
        width: 256,
        height: 256,
      })
      engine.stopRenderLoop()

      return base64
    })
  }

  return { generateThumbnail }
}

export const useThumbnailGenerator = createSharedComposable(_useThumbnailGenerator)
