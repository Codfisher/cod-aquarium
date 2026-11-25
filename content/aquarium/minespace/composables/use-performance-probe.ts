import type { Scene } from '@babylonjs/core'
import type { PerformanceReading, SectionReading } from './performance-reading'
import { EngineInstrumentation, SceneInstrumentation } from '@babylonjs/core'
import { onScopeDispose, reactive, ref, shallowRef } from 'vue'
import { createEmptyPerformanceReading } from './performance-reading'

/**
 * 效能探針
 *
 * 幀率只告訴你「慢」，不告訴你「慢在哪」。同樣是三十幀，
 * 卡在 CPU 送繪製呼叫、卡在 GPU 填畫素、卡在我們自己每幀跑的 JS，
 * 是三件完全不同的事，處方也完全相反——猜錯就是白做一輪。
 *
 * 所以這裡不挑重點量，是全部都量：
 *
 * 一、Babylon 自己的計時器：繪製呼叫、網格數、三角形數、
 *     CPU 與 GPU 的幀時間、挑選網格、離屏貼圖、粒子、著色器編譯
 * 二、我們自己每一個每幀跑的系統各自掛名計時（見 measureSection）
 * 三、所有 onBeforeRender 觀察者的總時間，用來對帳：
 *     這個總數與各系統的總和之間若有落差，就是還有沒掛上名字的東西
 *
 * 平常完全不啟用。這些量測本身也要花時間，不看的時候不該讓它跑
 */

/** 讀數更新間隔（秒），每幀更新只是白白觸發重繪 */
const READING_INTERVAL = 0.5

/**
 * 各系統這一段期間累積的耗時（毫秒）
 *
 * 放在模組層而不是 composable 裡：各個系統散在十幾個檔案，
 * 要它們全部拿到同一份 composable 的實例太麻煩，
 * 而這是除錯用的工具，一個場景只會有一份
 */
const sectionElapsedMap = new Map<string, number>()
let isProbing = false

/**
 * 替一段每幀跑的程式碼掛名計時
 *
 * 沒開啟探針時只是多一次函式呼叫與一個布林判斷，
 * 這個成本小到可以永遠留在正式程式碼裡——
 * 而它換來的是「出事時馬上知道是誰」
 */
export function measureSection(name: string, run: () => void): void {
  if (!isProbing) {
    run()
    return
  }

  const start = performance.now()
  run()
  sectionElapsedMap.set(name, (sectionElapsedMap.get(name) ?? 0) + performance.now() - start)
}

export function usePerformanceProbe() {
  const visible = ref(false)
  const reading = reactive<PerformanceReading>(createEmptyPerformanceReading())
  /**
   * 第一筆真實讀數到了沒有
   *
   * 讀數每半秒才更新一次。打開面板的那半秒裡，reading 還是空的或上一次留下的：
   * 全是零看起來像「什麼都不花」，舊的數字則像是現在的狀況，兩種都會誤導。
   * 沒有真實讀數時，介面該顯示「量測中」，不要拿這份假的資料來畫
   */
  const hasReading = ref(false)
  /** 陣列每次整份換掉，不需要深層反應式 */
  const sectionList = shallowRef<SectionReading[]>([])

  let instrumentation: SceneInstrumentation | null = null
  let engineProbe: EngineInstrumentation | null = null
  let disposeBracket: (() => void) | null = null

  /** 這一段期間累積了幾幀，用來把總時間換算成每幀平均 */
  let frameCount = 0
  let elapsed = 0
  /** 觀察者鏈的頭尾時間戳，兩者相減就是我們自己的 JS 花掉的 */
  let observerStart = 0
  let observerElapsed = 0

  function stop() {
    isProbing = false
    sectionElapsedMap.clear()

    instrumentation?.dispose()
    instrumentation = null
    engineProbe?.dispose()
    engineProbe = null
    disposeBracket?.()
    disposeBracket = null
  }

  onScopeDispose(stop)

  /**
   * 把整條觀察者鏈夾起來
   *
   * 第一個插在最前面、第二個接在最後面，兩者的時間差
   * 就是「所有每幀跑的 JS」的總時間。
   *
   * 這個總數的用途是對帳：它與各系統掛名計時的總和若差很多，
   * 代表還有沒被掛上名字的東西在吃時間。
   * 只看個別數字會漏東西，只看總數則不知道要修誰
   */
  function bracketObservers(scene: Scene) {
    const first = scene.onBeforeRenderObservable.add(
      () => {
        observerStart = performance.now()
      },
      undefined,
      true,
    )
    const last = scene.onBeforeRenderObservable.add(() => {
      observerElapsed += performance.now() - observerStart
      frameCount++
    })

    return () => {
      scene.onBeforeRenderObservable.remove(first)
      scene.onBeforeRenderObservable.remove(last)
    }
  }

  /**
   * 開關面板
   *
   * 打開時才建立計時器、關掉就地釋放。
   * 這幾個計時器會在算繪流程裡插入額外的量測，
   * 一直開著等於一直付那筆錢
   */
  function toggle(scene: Scene) {
    visible.value = !visible.value

    if (!visible.value) {
      stop()
      return
    }

    Object.assign(reading, createEmptyPerformanceReading())
    hasReading.value = false

    engineProbe = new EngineInstrumentation(scene.getEngine())
    engineProbe.captureGPUFrameTime = true
    engineProbe.captureShaderCompilationTime = true

    instrumentation = new SceneInstrumentation(scene)
    instrumentation.captureActiveMeshesEvaluationTime = true
    instrumentation.captureRenderTargetsRenderTime = true
    instrumentation.captureParticlesRenderTime = true
    instrumentation.captureFrameTime = true
    instrumentation.captureInterFrameTime = true

    disposeBracket = bracketObservers(scene)

    frameCount = 0
    elapsed = 0
    observerElapsed = 0
    sectionElapsedMap.clear()
    isProbing = true
  }

  /** 每幀呼叫，內部自己節流。必須掛在算繪之後，繪製呼叫才數得到 */
  function update(scene: Scene): void {
    if (!instrumentation)
      return

    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < READING_INTERVAL)
      return

    const frames = Math.max(1, frameCount)

    reading.drawCallCount = instrumentation.drawCallsCounter.current
    reading.activeMeshCount = scene.getActiveMeshes().length
    reading.triangleCount = Math.round(scene.getActiveIndices() / 3)
    reading.frameMs = instrumentation.frameTimeCounter.lastSecAverage
    /** GPU 的計時器給的是奈秒 */
    reading.gpuMs = (engineProbe?.gpuFrameTimeCounter.lastSecAverage ?? 0) / 1e6
    reading.interFrameMs = instrumentation.interFrameTimeCounter.lastSecAverage
    reading.meshSelectionMs = instrumentation.activeMeshesEvaluationTimeCounter.lastSecAverage
    reading.renderTargetMs = instrumentation.renderTargetsRenderTimeCounter.lastSecAverage
    reading.particleMs = instrumentation.particlesRenderTimeCounter.lastSecAverage
    reading.shaderCompileMs = engineProbe?.shaderCompilationTimeCounter.lastSecAverage ?? 0
    reading.observerMs = observerElapsed / frames

    sectionList.value = [...sectionElapsedMap.entries()]
      .map(([name, total]) => ({ name, averageMs: total / frames }))
      .sort((left, right) => right.averageMs - left.averageMs)
    reading.sectionList = sectionList.value

    hasReading.value = true

    elapsed = 0
    frameCount = 0
    observerElapsed = 0
    sectionElapsedMap.clear()
  }

  return { visible, reading, hasReading, toggle, update }
}
