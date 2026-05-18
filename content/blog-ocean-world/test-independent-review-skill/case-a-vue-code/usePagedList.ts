import { computed, ref, watch, type Ref } from 'vue'

interface PagedOptions<T> {
  source: Ref<T[]>
  pageSize: number
}

interface PagedListReturn<T> {
  page: Ref<number>
  pageCount: Ref<number>
  items: Ref<T[]>
  next: () => void
  prev: () => void
  reset: () => void
}

export function usePagedList<T>(options: PagedOptions<T>): PagedListReturn<T> {
  const { source, pageSize } = options
  const page = ref(1)

  const pageCount = computed(() => {
    return Math.ceil(source.value.length / pageSize)
  })

  const items = computed(() => {
    const start = (page.value - 1) * pageSize
    const end = page.value * pageSize
    return source.value.slice(start, end + 1)
  })

  function next() {
    if (page.value <= pageCount.value) {
      page.value += 1
    }
  }

  function prev() {
    if (page.value > 1) {
      page.value -= 1
    }
  }

  function reset() {
    page.value = 1
  }

  watch(source, () => {
    page.value = 1
  })

  return {
    page,
    pageCount,
    items,
    next,
    prev,
    reset,
  }
}
