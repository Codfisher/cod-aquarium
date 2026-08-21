import { Logger } from '@babylonjs/core'
import { onBeforeUnmount, ref } from 'vue'

/** 記錄的錯誤種類上限，避免真的失控時把記憶體吃光 */
const MAX_ENTRY_COUNT = 200

/** 第一批錯誤冒出來之後，等這麼久再試著自動下載一次 */
const AUTO_FLUSH_DELAY_MS = 2000

/**
 * 這一筆是錯誤還是警告
 *
 * 兩者都要收。查一個「畫面上什麼都沒有，但沒有任何錯誤」的問題時，
 * 唯一的線索往往就在警告裡——WebGL 對「貼圖不完整」「取樣器型別對不上」
 * 這類會讓整個繪製呼叫作廢的狀況，多半只丟一句警告
 */
export type IssueLevel = 'error' | 'warn'

interface ErrorEntry {
  level: IssueLevel;
  message: string;
  stack?: string;
  count: number;
  firstAt: number;
  lastAt: number;
}

/**
 * 這份紀錄是模組層級的單例，不是掛在某個元件上
 *
 * 錯誤不是只有主執行緒才會丟：worker 有自己獨立的全域環境，
 * window.onerror 接不到那邊的例外。reportError 得是隨處都呼叫得到的
 * 一般函式，worker 那端的封裝（見 use-voxel-gi-worker.ts）才有辦法
 * 把它接進來的錯誤送進同一份清單，跟主執行緒的錯誤一起匯出
 */
const entryMap = new Map<string, ErrorEntry>()

/**
 * 執行時的狀態快照
 *
 * 與錯誤不同，這裡每個名目只留最新的值，不累計次數——
 * 要回答的是「現在到底是什麼狀況」，不是「發生過幾次」。
 *
 * 這是拿一次教訓換來的：光束查了好幾輪都沒有結果，因為著色器
 * 編得過、也沒有任何錯誤，問題出在餵進去的資料與掛載狀態，
 * 而那些東西從畫面上與錯誤紀錄裡都看不到。缺的不是更多錯誤訊息，
 * 是「這一刻各個環節分別是什麼值」
 */
const diagnosticMap = new Map<string, string>()
const errorCount = ref(0)
let hasAutoFlushed = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let isInstalled = false

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error)
        return arg.stack ?? arg.message
      if (typeof arg === 'string')
        return arg

      try {
        return JSON.stringify(arg)
      }
      catch {
        return String(arg)
      }
    })
    .join(' ')
}

function buildReport(): string {
  const now = new Date()
  const entryList = [...entryMap.values()]
  const errorTotal = entryList.filter((entry) => entry.level === 'error').length

  const lineList: string[] = [
    `Minespace 問題紀錄 — ${now.toISOString()}`,
    `共 ${entryList.length} 種：錯誤 ${errorTotal}、警告 ${entryList.length - errorTotal}`,
    '',
    '註：瀏覽器自己丟的 WebGL 訊息（[.WebGL-0x…] GL_INVALID_… 那一類）',
    '收不進來——那些是 GPU 行程直接寫進主控台的，不經過 JS 的 console，',
    '攔不到。畫面壞掉卻查不出原因時，記得順手看一眼主控台',
    '',
  ]

  /**
   * 執行時狀態排在最前面
   *
   * 沒有錯誤卻「畫面上什麼都沒有」時，答案幾乎一定在這一段裡
   */
  if (diagnosticMap.size > 0) {
    lineList.push('── 執行時狀態 ──', '')
    for (const [label, value] of diagnosticMap) {
      lineList.push(`${label}：${value}`)
    }
    lineList.push('')
  }

  /** 錯誤排在警告前面，掃一眼先看到嚴重的那些 */
  const sortedList = [...entryList].sort((left, right) =>
    Number(right.level === 'error') - Number(left.level === 'error'))

  for (const entry of sortedList) {
    const levelText = entry.level === 'error' ? '錯誤' : '警告'
    lineList.push(`[${levelText}｜出現 ${entry.count} 次，${new Date(entry.firstAt).toLocaleTimeString()} ~ ${new Date(entry.lastAt).toLocaleTimeString()}] ${entry.message}`)
    if (entry.stack) {
      lineList.push(entry.stack)
    }
    lineList.push('')
  }

  return lineList.join('\n')
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

/**
 * 記一筆問題
 *
 * 隨處可呼叫，不限於這個檔案自己裝的那幾個監聽器——
 * worker 的錯誤、Babylon 內部吞掉又自己印出來的例外，都走這一個入口
 */
export function reportIssue(level: IssueLevel, message: string, stack?: string): void {
  if (!import.meta.env.DEV)
    return

  const key = `${level}\n${message}\n${stack ?? ''}`.slice(0, 500)
  const now = Date.now()
  const existing = entryMap.get(key)

  if (existing) {
    existing.count++
    existing.lastAt = now
  }
  else if (entryMap.size < MAX_ENTRY_COUNT) {
    entryMap.set(key, { level, message, stack, count: 1, firstAt: now, lastAt: now })
  }

  errorCount.value = entryMap.size

  /**
   * 自動下載只試這一次，而且是盡力而為
   *
   * 瀏覽器對「沒有使用者手勢觸發的下載」有各自的防護，
   * 靜靜地擋掉是常態，擋掉也不當一回事——累積的紀錄還在 entryMap 裡，
   * F6 隨時可以手動匯出，那條路徑是真的會動的
   */
  /**
   * 只有錯誤會觸發自動下載，警告不會
   *
   * 警告本來就常有（Babylon 對材質、著色器的各種提醒），
   * 讓它們也跳下載視窗只會變成噪音。警告照樣記著，
   * 跟著下一次錯誤或 F6 一起匯出
   */
  if (level === 'error' && !hasAutoFlushed && !flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      hasAutoFlushed = true
      try {
        downloadTextFile(`minespace-errors-${Date.now()}.txt`, buildReport())
      }
      catch {
        /** 下載被擋下來就算了，F6 還在 */
      }
    }, AUTO_FLUSH_DELAY_MS)
  }
}

/** 記一筆錯誤，這是 reportIssue 最常用的那條路 */
export function reportError(message: string, stack?: string): void {
  reportIssue('error', message, stack)
}

/** 記一筆警告 */
export function reportWarning(message: string, stack?: string): void {
  reportIssue('warn', message, stack)
}

/**
 * 記下某個名目此刻的值
 *
 * 同一個名目重複寫只會蓋掉，不累計——這裡要的是最新狀態。
 * 每一幀呼叫也不貴（一次 Map 寫入），不必自己節流
 */
export function reportDiagnostic(label: string, value: unknown): void {
  if (!import.meta.env.DEV)
    return

  diagnosticMap.set(label, typeof value === 'string' ? value : JSON.stringify(value))
}

/**
 * 手動匯出目前累積的紀錄，按鍵觸發——這是真的使用者手勢，瀏覽器不會擋
 *
 * 沒有任何錯誤也照樣匯得出來：多數時候要查的正是
 * 「沒有錯誤，但東西就是沒出現」，那份答案在執行時狀態那一段
 */
export function exportErrorLog(): void {
  if (entryMap.size === 0 && diagnosticMap.size === 0)
    return

  downloadTextFile(`minespace-errors-${Date.now()}.txt`, buildReport())
}

/**
 * 錯誤紀錄
 *
 * 開發模式才會裝：把 console.error、沒接住的例外、沒接住的 Promise
 * 拒絕全部攔下來歸進同一份清單。回傳目前累積的錯誤種類數，
 * 呼叫端可以顯示一個小提示，並接一個按鍵去呼叫 exportErrorLog
 *
 * 只在 import.meta.env.DEV 時啟用：這是本地除錯用的，正式站上的訪客
 * 不該被裝這一層攔截
 */
export function useErrorLogger() {
  if (!import.meta.env.DEV || isInstalled)
    return { errorCount }

  isInstalled = true

  function handleWindowError(event: ErrorEvent): void {
    reportError(event.message, event.error instanceof Error ? event.error.stack : undefined)
  }

  function handleRejection(event: PromiseRejectionEvent): void {
    const { reason } = event
    reportError(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    )
  }

  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args)
    reportError(formatArgs(args))
  }

  /**
   * Babylon 自己的 Logger 不走 console.error 這條路
   *
   * Logger.js 在模組載入的那一刻就把當下的 console.error 存進一個常數
   * （見 logFunc），之後全部呼叫都是打那份存好的參照，不是重新查
   * console.error——這裡再怎麼改寫 console.error 都攔不到它，
   * 得直接換掉 Logger.Error 這個進入點。
   *
   * 換掉之後不再呼叫原本那份，著色器編譯錯誤這類引擎層級的雜訊
   * 就不會洗到主控台，只會靜靜地進這份紀錄——真的要看即時輸出，
   * 那份紀錄裡什麼都在，F6 隨時匯得出來
   */
  const originalLoggerError = Logger.Error
  Logger.Error = (...args: unknown[]) => {
    reportError(formatArgs(args))
  }

  /**
   * 警告也要收
   *
   * 這是拿一次教訓換來的：光束整整四輪查不出原因，因為
   * 「貼圖不完整」這種會讓整個繪製呼叫作廢的狀況，WebGL 只丟警告
   * 不丟錯誤——而紀錄裡當時只收錯誤，畫面上什麼都沒有、
   * 紀錄裡也乾乾淨淨，唯一的線索躺在主控台裡沒人看。
   *
   * console.warn 這一份照樣印出去，不像 Logger 那邊是攔下來的：
   * 它裝的多半是別人（瀏覽器、第三方套件）的訊息，收進紀錄是為了
   * 事後查得到，但不該連即時看的機會都一起拿掉
   */
  const originalConsoleWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    originalConsoleWarn(...args)
    reportWarning(formatArgs(args))
  }

  const originalLoggerWarn = Logger.Warn
  Logger.Warn = (...args: unknown[]) => {
    reportWarning(formatArgs(args))
  }

  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleRejection)

  onBeforeUnmount(() => {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    Logger.Error = originalLoggerError
    Logger.Warn = originalLoggerWarn
    window.removeEventListener('error', handleWindowError)
    window.removeEventListener('unhandledrejection', handleRejection)
    if (flushTimer) {
      clearTimeout(flushTimer)
    }
    isInstalled = false
  })

  return { errorCount }
}
