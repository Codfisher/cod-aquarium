import { promiseTimeout } from '@vueuse/core'
import { computed, ref } from 'vue'

const defaultCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function useChar(
  value: string,
  options?: Partial<{
    charset: string;
    count: number;
    interval: number;
    initChar: string;
  }>,
) {
  const {
    count = 12,
    interval = 50,
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
        }, interval)
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
}
export function useDecodingText(
  textValue: string,
  options: UseDecodingTextOptions = {},
) {
  const { interval = 30, initChar } = options
  const charList = textValue.split(/.*?/u).map((char) => useChar(char, { initChar }))

  const text = computed(() => charList.map((c) => c.char.value).join(''))

  function start() {
    charList.forEach(async ({ start, isDone }, i) => {
      if (isDone.value) {
        return
      }
      await promiseTimeout(i * interval)
      start()
    })
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
