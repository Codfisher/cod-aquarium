import type { MemeData } from '../type'
import { useWebWorkerFn } from '@vueuse/core'
import Fuse from 'fuse.js'

function matchByIncludes(item: MemeData, term: string): boolean {
  const keyList: Array<keyof MemeData> = ['describe', 'ocr', 'keyword']
  return keyList.some((key) => item[key].includes(term))
}

/** 搜尋梗圖資料，支援空格分隔的多詞 AND 查詢與模糊匹配 */
export function searchMeme(dataList: MemeData[], input: string): MemeData[] {
  const FUSE_MIN_LENGTH = 1

  /** 空格表示多單字 AND 查詢 */
  const termList = input.split(/\s+/).filter(Boolean)
  if (termList.length === 0)
    return []

  const shortTermList = termList.filter((term) => term.length <= FUSE_MIN_LENGTH)
  const longTermList = termList.filter((term) => term.length > FUSE_MIN_LENGTH)

  // 先用短詞精確匹配縮小範圍
  let resultList = shortTermList.length > 0
    ? dataList.filter((item) =>
        shortTermList.every((term) => matchByIncludes(item, term)),
      )
    : dataList

  const [primaryTerm, ...otherTermList] = longTermList
  if (!primaryTerm)
    return resultList

  const fuse = new Fuse<MemeData>(resultList, {
    keys: [
      'describe',
      { name: 'ocr', weight: 2 },
      { name: 'keyword', weight: 2 },
    ],
    ignoreLocation: true,
  })

  // 資料依序對每個長詞進行模糊過濾
  resultList = fuse.search(primaryTerm).map(({ item }) => item)

  for (const term of otherTermList) {
    resultList = resultList.filter((item) =>
      fuse.search(term).some(({ item: matched }) => matched === item),
    )
  }

  return resultList
}

export function useMemeSearch() {
  const { workerFn: searchMemeWorker } = useWebWorkerFn(
    (dataList: MemeData[], input: string) => {
      return searchMeme(dataList, input)
    },
    {
      localDependencies: [matchByIncludes, searchMeme],
      dependencies: [
        'https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js',
      ],
    },
  )

  async function search(dataList: MemeData[], input: string): Promise<MemeData[]> {
    return searchMemeWorker(dataList, input)
  }

  return { search }
}
