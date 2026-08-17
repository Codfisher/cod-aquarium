import type { MemeData } from '../domains/meme/type'
import { useStorage } from '@vueuse/core'
import { computed, ref } from 'vue'

const FAVORITE_KEY = 'meme-cache:favorite'
const RECENT_KEY = 'meme-cache:recent'

/** 最近使用只留這麼多筆，再多就失去「最近」的意義，也讓 localStorage 無限膨脹 */
const RECENT_MAX_COUNT = 60

export type CollectionMode = 'all' | 'favorite' | 'recent'

export const COLLECTION_MODE_LABEL: Record<CollectionMode, string> = {
  all: '全部',
  favorite: '收藏',
  recent: '最近使用',
}

export function useMemeCollection() {
  /** 兩份清單都以「新的在前」儲存，切到收藏模式時順序即為加入順序的反向 */
  const favoriteFileList = useStorage<string[]>(FAVORITE_KEY, [])
  const recentFileList = useStorage<string[]>(RECENT_KEY, [])

  const favoriteFileSet = computed(() => new Set(favoriteFileList.value))

  const mode = ref<CollectionMode>('all')

  function hasFavorite(file: string): boolean {
    return favoriteFileSet.value.has(file)
  }

  function toggleFavorite(file: string) {
    if (hasFavorite(file)) {
      favoriteFileList.value = favoriteFileList.value.filter((item) => item !== file)
      return
    }

    favoriteFileList.value = [file, ...favoriteFileList.value]
  }

  /** 開過編輯器就算用過，重複開啟則移到最前 */
  function markRecent(file: string) {
    recentFileList.value = [
      file,
      ...recentFileList.value.filter((item) => item !== file),
    ].slice(0, RECENT_MAX_COUNT)
  }

  const currentFileList = computed(() => {
    if (mode.value === 'favorite')
      return favoriteFileList.value
    if (mode.value === 'recent')
      return recentFileList.value
    return []
  })

  const currentFileSet = computed(() => new Set(currentFileList.value))

  /** 收藏與最近使用的清單已刪除的圖不會自動消失，故僅在此過濾掉找不到的項目 */
  function filterByMode(list: MemeData[]): MemeData[] {
    if (mode.value === 'all')
      return list

    return list.filter((item) => currentFileSet.value.has(item.file))
  }

  /** 依收藏／使用順序排序，讓剛加入的排最前面 */
  function sortByCollection(list: MemeData[]): MemeData[] {
    if (mode.value === 'all')
      return list

    const orderMap = new Map(currentFileList.value.map((file, index) => [file, index]))
    return [...list].sort(
      (a, b) => (orderMap.get(a.file) ?? Infinity) - (orderMap.get(b.file) ?? Infinity),
    )
  }

  return {
    mode,
    favoriteFileList,
    favoriteFileSet,
    recentFileList,
    hasFavorite,
    toggleFavorite,
    markRecent,
    filterByMode,
    sortByCollection,
  }
}
