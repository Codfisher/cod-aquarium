import { ref } from 'vue'

export function useChar(
  value: string,
  charset: string,
  options?: Partial<{
    count: number;
    interval: number;
  }>,
) {
  const {
    count = 10,
    interval = 20,
  } = options ?? {}

  const charsetList = charset.split(/.*?/u)

  function getRandomChar() {
    const index = Math.floor(Math.random() * charsetList.length)
    return charsetList.at(index)
  }

  let times = count
  const isPlaying = ref(false)
  const char = ref(value)

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
  }

  return {
    original: value,
    char,
    isPlaying,
    start,
    stop,
  }
}
