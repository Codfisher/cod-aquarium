// composables/useThumbnailGenerator.ts
import {
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  SceneLoader,
  Tools,
  Vector3,
} from '@babylonjs/core'
import '@babylonjs/loaders' // 載入所有檔案格式支援 (GLB, OBJ etc)

// 定義工作任務介面
interface ThumbnailJob {
  file: File;
  resolve: (base64: string) => void;
  reject: (err: any) => void;
}

// 單例變數 (模組層級變數，確保全域唯一)
let _engine: Engine | null = null
let _scene: Scene | null = null
let _camera: ArcRotateCamera | null = null
let _canvas: HTMLCanvasElement | null = null
const _queue: ThumbnailJob[] = []
let _isProcessing = false

// 初始化隱藏的 Babylon 環境
function initGenerator() {
  if (_engine)
    return

  // 建立一個隱藏的 canvas
  _canvas = document.createElement('canvas')
  _canvas.width = 256 // 設定縮圖解析度
  _canvas.height = 256
  _canvas.style.display = 'none' // 不需要顯示在畫面上
  document.body.appendChild(_canvas)

  _engine = new Engine(_canvas, true, { preserveDrawingBuffer: true, stencil: true })
  _scene = new Scene(_engine)
  _scene.clearColor = new Color4(0, 0, 0, 0) // 背景透明

  // 建立通用攝影機
  _camera = new ArcRotateCamera('ThumbCamera', 0, 0, 10, Vector3.Zero(), _scene)

  // 建立通用燈光
  const light = new HemisphericLight('light', new Vector3(0, 1, 0), _scene)
}

// 處理佇列中的下一個任務
async function processQueue() {
  if (_queue.length === 0) {
    _isProcessing = false
    return
  }

  _isProcessing = true
  const job = _queue.shift()! // 取出第一個任務

  if (!_scene || !_engine || !_camera)
    return

  try {
    // 1. 讀取檔案為 ObjectURL
    const url = URL.createObjectURL(job.file)

    // 2. 載入模型 (使用 LoadAssetContainer 以便乾淨移除)
    // 這裡假設副檔名判斷由 SceneLoader 自動處理，或需指定 pluginExtension
    const container = await SceneLoader.LoadAssetContainerAsync('', url, _scene, undefined, job.file.name)

    // 3. 將模型加入場景
    container.addAllToScene()

    // 4. 自動計算邊界並調整攝影機位置 (Framing)
    _scene.createDefaultCameraOrLight(true, true, true)
    const helperCamera = _scene.activeCamera as ArcRotateCamera
    if (helperCamera) {
      helperCamera.alpha = Math.PI / 4 // 設定一個好看的 45度角
      helperCamera.beta = Math.PI / 3
      helperCamera.useAutoRotationBehavior = false
    }

    // 5. 強制渲染一幀
    _scene.render()

    // 6. 截圖
    const base64 = await Tools.CreateScreenshotAsync(_engine, _camera, { width: 256, height: 256 })

    // 7. 完成任務
    job.resolve(base64)

    // 8. 清理場景 (非常重要！)
    container.removeAllFromScene()
    container.dispose() // 釋放記憶體
    URL.revokeObjectURL(url) // 釋放 URL
  }
  catch (err) {
    console.error('Thumbnail generation failed', err)
    job.reject(err)
  }

  // 稍作延遲讓 UI 執行緒喘口氣，然後處理下一個
  setTimeout(() => processQueue(), 50)
}

// 對外暴露的 Composable
export function useThumbnailGenerator() {
  // 確保環境已初始化
  initGenerator()

  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // 加入佇列
      _queue.push({ file, resolve, reject })

      // 如果目前閒置，就開始處理
      if (!_isProcessing) {
        processQueue()
      }
    })
  }

  return {
    generateThumbnail,
  }
}
