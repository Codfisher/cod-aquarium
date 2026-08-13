import type { Scene } from '@babylonjs/core'
import { SceneInstrumentation } from '@babylonjs/core'
import { onBeforeUnmount, reactive, ref } from 'vue'

/**
 * 效能探針
 *
 * 幀率只告訴你「慢」，不告訴你「慢在哪」。
 * 同樣是三十幀，卡在 CPU 挑選網格與卡在 GPU 畫陰影是兩件完全不同的事，
 * 對應的處理方式也完全相反——盲目套用最佳化清單是沒有意義的。
 *
 * 這裡把 Babylon 自己的計時器接出來，分成四個數字：
 *
 * - 繪製呼叫：一幀送出幾批。這是 CPU 端最常見的瓶頸
 * - 挑選網格：CPU 決定「哪些東西要畫」花的時間，視錐剔除算在這裡
 * - 離屏貼圖：幾乎就是陰影貼圖的時間，這個場景只有它在用
 * - 粒子：雨、水花、霧、落葉、營火的煙全部加起來
 *
 * 平常完全不啟用——SceneInstrumentation 自己也要花時間，
 * 不看的時候不該讓它跑
 */
export interface PerformanceReading {
  /** 一幀送出幾批繪製呼叫 */
  drawCallCount: number;
  /** 這一幀有幾顆網格被判定為要畫 */
  activeMeshCount: number;
  /** CPU 挑選要畫哪些網格花了幾毫秒 */
  meshSelectionMs: number;
  /** 離屏貼圖（陰影）花了幾毫秒 */
  renderTargetMs: number;
  /** 粒子花了幾毫秒 */
  particleMs: number;
  /** 整幀花了幾毫秒 */
  frameMs: number;
}

/** 讀數更新間隔（秒），每幀更新只是白白觸發重繪 */
const READING_INTERVAL = 0.5

export function usePerformanceProbe() {
  const visible = ref(false)
  const reading = reactive<PerformanceReading>({
    drawCallCount: 0,
    activeMeshCount: 0,
    meshSelectionMs: 0,
    renderTargetMs: 0,
    particleMs: 0,
    frameMs: 0,
  })

  let instrumentation: SceneInstrumentation | null = null
  let elapsed = 0

  function stop() {
    instrumentation?.dispose()
    instrumentation = null
  }

  onBeforeUnmount(stop)

  /**
   * 開關面板
   *
   * 打開時才建立計時器、關掉時就地釋放。
   * 這幾個計時器會在算繪流程裡插入額外的量測，
   * 一直開著等於一直付那筆錢
   */
  function toggle(scene: Scene) {
    visible.value = !visible.value

    if (!visible.value) {
      stop()
      return
    }

    instrumentation = new SceneInstrumentation(scene)
    instrumentation.captureActiveMeshesEvaluationTime = true
    instrumentation.captureRenderTargetsRenderTime = true
    instrumentation.captureParticlesRenderTime = true
    instrumentation.captureFrameTime = true
    elapsed = 0
  }

  /**
   * 每幀呼叫，內部自己節流
   *
   * 必須掛在算繪之後
   *
   * 繪製呼叫的計數器每一幀開始時歸零，一路數到那一幀畫完。
   * 在算繪之前讀它，讀到的永遠是剛歸零的那個零——
   * 面板上那個「0 draw」就是這麼來的
   */
  function update(scene: Scene): void {
    if (!instrumentation)
      return

    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < READING_INTERVAL)
      return

    elapsed = 0
    reading.drawCallCount = instrumentation.drawCallsCounter.current
    reading.activeMeshCount = scene.getActiveMeshes().length
    reading.meshSelectionMs = instrumentation.activeMeshesEvaluationTimeCounter.lastSecAverage
    reading.renderTargetMs = instrumentation.renderTargetsRenderTimeCounter.lastSecAverage
    reading.particleMs = instrumentation.particlesRenderTimeCounter.lastSecAverage
    reading.frameMs = instrumentation.frameTimeCounter.lastSecAverage
  }

  return { visible, reading, toggle, update }
}
