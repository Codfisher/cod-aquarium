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
  interval?: number;
  initChar?: string;
  count?: number;
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
