import type { MemeData } from '../type'
import { useWebWorkerFn } from '@vueuse/core'
import Fuse from 'fuse.js'

function matchByIncludes(item: MemeData, term: string): boolean {
  const keyList: Array<keyof MemeData> = ['describe', 'ocr', 'keyword']
  return keyList.some((key) => item[key].includes(term))
}

/** 計算搜尋詞的字元在候選文字中出現的比例，用於二次排序 */
export function calcCharCoverage(item: MemeData, term: string): number {
  const keyList: Array<keyof MemeData> = ['describe', 'ocr', 'keyword']
  const text = keyList.map((key) => item[key]).join(' ')
  const matchedCount = [...term].filter((char) => text.includes(char)).length
  return matchedCount / term.length
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
    threshold: 0.6,
    includeScore: true,
  })

  // Fuse 模糊搜尋，以分數為主、字元覆蓋率為輔排序
  const fuseResultList = fuse.search(primaryTerm)

  fuseResultList.sort((a, b) => {
    const scoreDiff = (a.score ?? 0) - (b.score ?? 0)
    if (Math.abs(scoreDiff) > 0.1)
      return scoreDiff

    const coverageA = calcCharCoverage(a.item, primaryTerm)
    const coverageB = calcCharCoverage(b.item, primaryTerm)
    return coverageB - coverageA
  })

  const fuseItemSet = new Set(fuseResultList.map(({ item }) => item))

  // 字元覆蓋率補充 Fuse 遺漏的項目
  const COVERAGE_THRESHOLD = 0.5
  const coverageResultList = resultList
    .filter((item) => !fuseItemSet.has(item))
    .map((item) => ({ item, coverage: calcCharCoverage(item, primaryTerm) }))
    .filter(({ coverage }) => coverage >= COVERAGE_THRESHOLD)
    .sort((a, b) => b.coverage - a.coverage)
    .map(({ item }) => item)

  resultList = [...fuseResultList.map(({ item }) => item), ...coverageResultList]

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
      localDependencies: [matchByIncludes, calcCharCoverage, searchMeme],
      dependencies: [
        'https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js',
      ],
    },
  )

  async function search(dataList: MemeData[], input: string): Promise<MemeData[]> {
    try {
      const result = await searchMemeWorker(dataList, input)
      if (Array.isArray(result))
        return result
    }
    catch (error) {
      console.warn('[meme-search] Worker 失敗，fallback 到主執行緒', error)
    }

    return searchMeme(dataList, input)
  }

  return { search }
}
