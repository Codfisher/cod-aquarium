/**
 * 神遊的分幀工作
 *
 * 規劃下一趟路徑、算鏡位、收集停留點這些事一次做完要好幾毫秒，鏡頭運鏡的那一幀就會頓一下。
 * 這裡把它們寫成 generator：做一小段就 yield，由 `createJobQueue` 每幀只給一點時間（預算）往下跑，
 * 做不完的留到下一幀。規劃發生在停留的開頭，停留要八秒以上，慢慢算也來得及。
 *
 * 約定：每個 yield 之間的工作量要小（零點一毫秒上下），預算才守得住
 */

/** 分段執行的工作：yield 是可以暫停的地方，結尾回傳結果 */
export type DriftSteps<T = void> = Generator<void, T, void>

/** 一口氣跑完（呼叫端不在乎分幀時用：離開神遊的落點搜尋、驗證腳本） */
export function runStepsSync<T>(steps: DriftSteps<T>): T {
  while (true) {
    const result = steps.next()
    if (result.done)
      return result.value
  }
}

export interface DriftJob {
  /** 除錯用的名字，開發模式下單一段耗時過長會用它回報 */
  name: string;
  steps: DriftSteps<void>;
}

/** 開發模式下，單一段（兩個 yield 之間）超過這麼久（毫秒）就在 console 警告，提醒要再切細 */
const SLOW_STEP_WARN_MS = 2

export interface DriftJobQueue {
  push: (job: DriftJob) => void;
  /** 丟掉所有還沒做完的工作（換場景、離開神遊、需要重算時） */
  clear: () => void;
  /** 還有沒有工作 */
  isBusy: () => boolean;
  /** 這一幀最多花 budgetMs 毫秒往下跑；至少會跑一段，所以再慢的機器也推得動 */
  pump: (budgetMs: number) => void;
}

/**
 * 先進先出的工作佇列：一次只跑最前面那一個，做完才換下一個
 *
 * 計時用 performance.now（渲染 worker 與 Node 都有）；只用來決定「這一幀還要不要再跑一段」，
 * 不影響結果——同一組工作不論分成幾幀跑完，答案都一樣
 */
export function createJobQueue(now: () => number = () => performance.now()): DriftJobQueue {
  const queue: DriftJob[] = []
  let isPumping = false

  function push(job: DriftJob) {
    queue.push(job)
  }

  function clear() {
    /** 先把佇列清空（pump 途中被清掉時，迴圈看到空佇列就停），再讓每個沒做完的工作跑 finally（歸還借用的緩衝） */
    const dropped = queue.splice(0, queue.length)
    for (const job of dropped) {
      try {
        job.steps.return()
      }
      catch {
        /** 正在執行中的 generator 不能被 return（工作自己呼叫了 clear）：丟掉就好，它不會再被 next */
      }
    }
  }

  function isBusy(): boolean {
    return queue.length > 0
  }

  function pump(budgetMs: number) {
    if (isPumping || queue.length === 0)
      return

    isPumping = true
    try {
      const deadline = now() + budgetMs
      while (queue.length > 0) {
        const job = queue[0] as DriftJob
        const stepStart = import.meta.env.DEV ? now() : 0
        const result = job.steps.next()
        if (import.meta.env.DEV) {
          const elapsed = now() - stepStart
          if (elapsed > SLOW_STEP_WARN_MS)
            console.warn(`[Drift] 分幀工作「${job.name}」單段耗時 ${elapsed.toFixed(1)} 毫秒，要再切細`)
        }
        /** 工作中途呼叫了 clear（queue 已換人）就不要動 queue */
        if (result.done && queue[0] === job)
          queue.shift()
        if (now() >= deadline)
          break
      }
    }
    finally {
      isPumping = false
    }
  }

  return { push, clear, isBusy, pump }
}
