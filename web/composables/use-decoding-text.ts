import { promiseTimeout } from '@vueuse/core'
import { computed, ref } from 'vue'

const defaultCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function useChar(
  value: string,
  options?: Partial<{
    charset: string;
    count: number;
    decodeInterval: number;
    initChar: string;
  }>,
) {
  const {
    count = 12,
    decodeInterval = 20,
    charset = defaultCharset,
    initChar: initialChar,
  } = options ?? {}

  const charsetList = charset.split(/.*?/u)

  function getRandomChar() {
    const index = Math.floor(Math.random() * charsetList.length)
    return charsetList.at(index)
  }

  let times = count
  const isPlaying = ref(false)
  const isDone = ref(false)
  const char = ref(initialChar ?? getRandomChar())

  async function start(delay = 0) {
    char.value = getRandomChar() ?? value

    return new Promise<void>((resolve) => {
      if (charsetList.length === 0) {
        return resolve()
      }

      setTimeout(() => {
        isPlaying.value = true

        const timer = setInterval(() => {
          if (times <= 0) {
            char.value = value
            clearInterval(timer)
            isPlaying.value = false
            isDone.value = true
            resolve()
            return
          }

          char.value = getRandomChar() ?? value
          times -= 1
        }, decodeInterval)
      }, delay)
    })
  }

  function stop() {
    char.value = value
    times = 0
    isPlaying.value = false
    isDone.value = false
  }
  function reset() {
    stop()
    char.value = getRandomChar()
  }

  return {
    original: value,
    char,
    isPlaying,
    isDone,
    start,
    stop,
    reset,
  }
}

interface UseDecodingTextOptions {
  /** 每個字元開始解碼的間隔時間（ms），控制字元依序啟動的速度。
   * 值越小，字元越快接連開始解碼。
   *
   * @default 30
   */
  interval?: number;
  /** 初始顯示的字元。若未指定，則使用 charset 中的隨機字元 */
  initChar?: string;
  /** 每個字元在顯示正確值前，隨機變換的次數。
   * 值越大，解碼動畫持續越久。
   *
   * @default 12
   */
  count?: number;
  /** 單一字元每次隨機變換的間隔時間（ms）。
   * 控制單一字元的閃爍速度。
   *
   * @default 20
   */
  decodeInterval?: number;
}
export function useDecodingText(
  textValue: string,
  options: UseDecodingTextOptions = {},
) {
  const { interval = 30 } = options
  const charList = textValue.split(/.*?/u).map((char) => useChar(char, options))

  const text = computed(() => charList.map((c) => c.char.value).join(''))

  async function start() {
    const tasks = charList.map(async ({ isDone, start }, i) => {
      if (isDone.value) {
        return
      }
      await promiseTimeout(i * interval)
      await start()
    })

    return Promise.all(tasks)
  }
  function stop() {
    charList.forEach(({ stop }) => stop())
  }
  function reset() {
    charList.forEach(({ reset }) => reset())
  }

  function restart() {
    reset()
    start()
  }

  return {
    text,
    start,
    restart,
    stop,
    reset,
  }
}
