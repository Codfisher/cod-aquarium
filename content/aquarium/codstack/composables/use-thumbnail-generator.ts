import type { AssetContainer } from '@babylonjs/core'
import {
  ArcRotateCamera,
  Color4,
  Engine,
  EngineStore,
  HemisphericLight,
  Scene,
  Tools,
  Vector3,
} from '@babylonjs/core'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { FilesInputStore } from '@babylonjs/core/Misc/filesInputStore'
import { createSharedComposable } from '@vueuse/core'
import PQueue from 'p-queue'
import '@babylonjs/loaders'

function _useThumbnailGenerator() {
  const queue = new PQueue({ concurrency: 1 })

  let _canvas: HTMLCanvasElement | null = null
  let _engine: Engine | null = null
  let _scene: Scene | null = null

  const init = () => {
    if (_scene) {
      return
    }

    _canvas = document.createElement('canvas')
    _canvas.width = 256
    _canvas.height = 256
    document.body.appendChild(_canvas)

    _engine = new Engine(_canvas, true)
    _scene = new Scene(_engine)

    const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2.5, 3, Vector3.Zero(), _scene)
    camera.attachControl(_canvas, true)
    camera.useAutoRotationBehavior = true

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), _scene)
  }

  const generateThumbnail = async (file: File, parentHandle?: FileSystemDirectoryHandle) => {
    init()

    _engine?.runRenderLoop(() => {
      _scene?.render()
    })

    const base64 = _canvas?.toDataURL('image/png')
    console.log('🚀 ~ generateThumbnail ~ _canvas:', _canvas)
    console.log('🚀 ~ generateThumbnail ~ base64:', base64)

    return base64
  }

  return { generateThumbnail }
}

export const useThumbnailGenerator = createSharedComposable(_useThumbnailGenerator)
