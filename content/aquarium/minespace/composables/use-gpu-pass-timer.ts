import type { Engine, Observer, Scene } from '@babylonjs/core'
import { RenderTargetTexture } from '@babylonjs/core'

/**
 * 逐道工序的 GPU 計時器（開發用）
 *
 * 幀 GPU 只有一個總數：知道「慢」，不知道「哪一道工序慢」。
 * 這裡把一幀切成許多段（陰影的每一層、水鏡、場景深度、雲的三道運算、
 * 主畫面的不透明與半透明……），每一段各用一個 GPU 計時查詢夾起來，
 * 讀出每段實際花在 GPU 上的毫秒數。
 *
 * 為什麼不是用時間戳（TIMESTAMP_EXT）：Chrome 在 ANGLE D3D11 上
 * QUERY_COUNTER_BITS_EXT 回報 0，時間戳查詢永遠回零，只有「經過時間」查詢（TIME_ELAPSED_EXT）能用。
 * 那種查詢同一時間只能有一個在跑、不能巢狀，所以標記一律是「接力」的：
 * 每個標記先結束上一段、再開始自己這一段，段與段首尾相接，整幀的 GPU 時間因此一毫秒不漏。
 *
 * 與 Babylon 自己的整幀 GPU 計時（EngineInstrumentation.captureGPUFrameTime）互斥——
 * 它也用 TIME_ELAPSED_EXT 夾住整幀，兩者會在同一時間各開一個查詢而報 INVALID_OPERATION。
 * 所以開這個計時器時探針要先把整幀計時關掉（見 use-performance-probe）。
 *
 * 每一段同時記下 CPU 的牆鐘時間（從這個標記到下一個標記），
 * 看得出「GPU 花得多、CPU 送得少」還是「CPU 送得多」。
 *
 * 平常完全不啟用：查詢本身要花時間，量測不該影響被量的東西。
 */

/** GPU 結果最多晚幾幀才讀，查詢結果沒好之前不能讀，讀了會卡住 CPU 等 GPU */
const MAX_PENDING_FRAME_COUNT = 8
/** 重新掃描有哪些離屏貼圖的間隔（幀），陰影重建、水鏡建好都會長出新的 */
const TARGET_RESCAN_INTERVAL = 60
/** 主畫面最多追到第幾個繪製群組 */
const RENDERING_GROUP_LIST = [0, 1, 2] as const

interface PassSegment {
  label: string;
  query: WebGLQuery;
  startMs: number;
  cpuMs: number;
}

export interface PassReading {
  label: string;
  /** 每幀平均花在 GPU 上幾毫秒 */
  gpuMs: number;
  /** 每幀平均花在 CPU（送出這一段）上幾毫秒 */
  cpuMs: number;
}

export interface GpuPassTimer {
  /** 取走自上次以來的每幀平均並歸零，段名由多到少排 */
  readList: () => PassReading[];
  dispose: () => void;
}

/** 目前啟用中的計時器；其他檔案只透過 markGpuPass 插標記，不必拿到它 */
let activeMarker: ((label: string) => void) | null = null

/**
 * 在這裡切一刀，從這一刻起算到下一個標記的 GPU 時間都記在這個名字底下
 *
 * 沒啟用時只是一次空值檢查，可以放心留在正式程式碼的每幀路徑上；
 * 呼叫端仍應包在 import.meta.env.DEV 裡，正式版連這個檢查都不必有
 */
export function markGpuPass(label: string): void {
  activeMarker?.(label)
}

export function createGpuPassTimer(scene: Scene): GpuPassTimer | null {
  const engine = scene.getEngine() as Engine
  const gl = (engine as Engine & { _gl?: WebGL2RenderingContext })._gl
  if (!gl)
    return null

  const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null
  if (!extension)
    return null

  const queryPool: WebGLQuery[] = []
  const pendingFrameList: PassSegment[][] = []
  const gpuNanosecondMap = new Map<string, number>()
  const cpuMillisecondMap = new Map<string, number>()
  let measuredFrameCount = 0

  let currentFrame: PassSegment[] = []
  let currentSegment: PassSegment | null = null
  let isFrameOpen = false
  let frameIndex = 0

  function closeSegment(nowMs: number): void {
    if (!currentSegment)
      return

    gl.endQuery(extension!.TIME_ELAPSED_EXT)
    currentSegment.cpuMs = nowMs - currentSegment.startMs
    currentFrame.push(currentSegment)
    currentSegment = null
  }

  function mark(label: string): void {
    if (!isFrameOpen)
      return

    const nowMs = performance.now()
    closeSegment(nowMs)

    const query = queryPool.pop() ?? gl.createQuery()
    gl.beginQuery(extension!.TIME_ELAPSED_EXT, query)
    currentSegment = { label, query, startMs: nowMs, cpuMs: 0 }
  }

  function releaseFrame(segmentList: PassSegment[]): void {
    for (const segment of segmentList) {
      queryPool.push(segment.query)
    }
  }

  /**
   * 讀回已經好了的幀
   *
   * 只看最後一段好了沒：GPU 依序執行，最後一段好了，前面的一定都好了。
   * 沒好就留到下一幀，絕不等它——等就是讓 CPU 去等 GPU，量測自己造成停頓
   */
  function collectFinishedFrames(): void {
    while (pendingFrameList.length > 0) {
      const segmentList = pendingFrameList[0]!
      const lastSegment = segmentList[segmentList.length - 1]
      if (lastSegment && !gl.getQueryParameter(lastSegment.query, gl.QUERY_RESULT_AVAILABLE))
        break

      pendingFrameList.shift()
      /** 讀 GPU_DISJOINT_EXT 會一併清掉旗標：期間 GPU 時脈變過，這一幀的數字不可信 */
      const isDisjoint = !!gl.getParameter(extension!.GPU_DISJOINT_EXT)
      if (!isDisjoint) {
        for (const segment of segmentList) {
          const nanosecond = gl.getQueryParameter(segment.query, gl.QUERY_RESULT) as number
          gpuNanosecondMap.set(segment.label, (gpuNanosecondMap.get(segment.label) ?? 0) + nanosecond)
          cpuMillisecondMap.set(segment.label, (cpuMillisecondMap.get(segment.label) ?? 0) + segment.cpuMs)
        }
        measuredFrameCount++
      }
      releaseFrame(segmentList)
    }

    while (pendingFrameList.length > MAX_PENDING_FRAME_COUNT) {
      releaseFrame(pendingFrameList.shift()!)
    }
  }

  const targetSet = new Set<RenderTargetTexture>()
  const targetObserverList: { target: RenderTargetTexture; before: Observer<number>; after: Observer<number> }[] = []

  function watchTarget(target: RenderTargetTexture): void {
    if (targetSet.has(target))
      return

    targetSet.add(target)
    /** 陰影的分層與立方體的面都用同一個事件，參數是第幾層或第幾面 */
    const before = target.onBeforeRenderObservable.add((layerOrFace: number) => {
      mark(layerOrFace > 0 ? `RTT ${target.name} #${layerOrFace}` : `RTT ${target.name}`)
    })
    const after = target.onAfterRenderObservable.add(() => mark('RTT 之間'))
    targetObserverList.push({ target, before, after })
  }

  function scanTargets(): void {
    for (const texture of scene.textures) {
      if (texture instanceof RenderTargetTexture)
        watchTarget(texture)
    }
    for (const target of scene.customRenderTargets) {
      watchTarget(target)
    }
    for (const target of scene.activeCamera?.customRenderTargets ?? []) {
      watchTarget(target)
    }
    for (const light of scene.lights) {
      const shadowMap = light.getShadowGenerator()?.getShadowMap()
      if (shadowMap)
        watchTarget(shadowMap)
    }
  }

  const beforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
    isFrameOpen = true
    currentFrame = []
    if (frameIndex++ % TARGET_RESCAN_INTERVAL === 0)
      scanTargets()
    mark('幀首（動畫與挑選）')
  }, undefined, true)
  const beforeTargetsObserver = scene.onBeforeRenderTargetsRenderObservable.add(() => mark('離屏階段開頭'))
  /** 搶在雲等掛在這個事件上的觀察者之前，它們自己會再插標記 */
  const afterTargetsObserver = scene.onAfterRenderTargetsRenderObservable.add(() => mark('離屏階段之後的掛鉤'), undefined, true)
  const beforeCameraObserver = scene.onBeforeCameraRenderObservable.add(() => mark('鏡頭開始'))
  const beforeGroupObserver = scene.onBeforeRenderingGroupObservable.add((info) => {
    mark(`群組 ${info.renderingGroupId} 不透明與鏤空`)
  })
  const afterGroupObserver = scene.onAfterRenderingGroupObservable.add(() => mark('群組之間'))
  const afterCameraObserver = scene.onAfterCameraRenderObservable.add(() => mark('鏡頭結束'))
  const afterRenderHookObserver = scene.onAfterRenderObservable.add(() => mark('算繪之後的掛鉤（眼睛適應等）'), undefined, true)
  const afterRenderObserver = scene.onAfterRenderObservable.add(() => {
    closeSegment(performance.now())
    isFrameOpen = false
    pendingFrameList.push(currentFrame)
    currentFrame = []
    collectFinishedFrames()
  })

  /** 半透明那一段是繪製群組自己的掛鉤，不是場景事件 */
  for (const groupId of RENDERING_GROUP_LIST) {
    const group = scene.renderingManager.getRenderingGroup(groupId)
    group.onBeforeTransparentRendering = () => mark(`群組 ${groupId} 半透明`)
  }

  scanTargets()
  activeMarker = mark

  return {
    readList() {
      const frameCount = Math.max(1, measuredFrameCount)
      const list: PassReading[] = [...gpuNanosecondMap.entries()].map(([label, nanosecond]) => ({
        label,
        gpuMs: nanosecond / 1e6 / frameCount,
        cpuMs: (cpuMillisecondMap.get(label) ?? 0) / frameCount,
      }))
      gpuNanosecondMap.clear()
      cpuMillisecondMap.clear()
      measuredFrameCount = 0

      return list.sort((left, right) => right.gpuMs - left.gpuMs)
    },
    dispose() {
      activeMarker = null
      isFrameOpen = false
      closeSegment(performance.now())

      scene.onBeforeRenderObservable.remove(beforeRenderObserver)
      scene.onBeforeRenderTargetsRenderObservable.remove(beforeTargetsObserver)
      scene.onAfterRenderTargetsRenderObservable.remove(afterTargetsObserver)
      scene.onBeforeCameraRenderObservable.remove(beforeCameraObserver)
      scene.onBeforeRenderingGroupObservable.remove(beforeGroupObserver)
      scene.onAfterRenderingGroupObservable.remove(afterGroupObserver)
      scene.onAfterCameraRenderObservable.remove(afterCameraObserver)
      scene.onAfterRenderObservable.remove(afterRenderHookObserver)
      scene.onAfterRenderObservable.remove(afterRenderObserver)
      for (const { target, before, after } of targetObserverList) {
        target.onBeforeRenderObservable.remove(before)
        target.onAfterRenderObservable.remove(after)
      }
      for (const groupId of RENDERING_GROUP_LIST) {
        scene.renderingManager.getRenderingGroup(groupId).onBeforeTransparentRendering = () => {}
      }

      for (const segmentList of pendingFrameList) {
        releaseFrame(segmentList)
      }
      for (const query of queryPool) {
        gl.deleteQuery(query)
      }
      queryPool.length = 0
      pendingFrameList.length = 0
    },
  }
}
