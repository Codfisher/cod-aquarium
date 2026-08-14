import type { MemeData } from './type'
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

/** 單一搜尋詞的匹配結果，score 越小越相關 */
interface TermMatch {
  item: MemeData
  score: number
}

/** 取得單一搜尋詞的匹配項目 */
export function matchTerm(dataList: MemeData[], term: string): TermMatch[] {
  /** 單字直接用精確匹配，Fuse 對此長度雜訊過多 */
  const FUSE_MIN_LENGTH = 1
  const COVERAGE_THRESHOLD = 0.5

  if (term.length <= FUSE_MIN_LENGTH) {
    return dataList
      .filter((item) => matchByIncludes(item, term))
      .map((item) => ({ item, score: 0 }))
  }

  const fuse = new Fuse<MemeData>(dataList, {
    keys: [
      'describe',
      { name: 'ocr', weight: 2 },
      { name: 'keyword', weight: 2 },
    ],
    ignoreLocation: true,
    threshold: 0.6,
    includeScore: true,
  })

  const fuseMatchList = fuse.search(term).map(({ item, score }) => ({
    item,
    score: score ?? 0,
  }))
  const fuseItemSet = new Set(fuseMatchList.map(({ item }) => item))

  // 字元覆蓋率補充 Fuse 遺漏的項目，分數固定落在 Fuse 門檻之後
  const coverageMatchList = dataList
    .filter((item) => !fuseItemSet.has(item))
    .map((item) => ({ item, coverage: calcCharCoverage(item, term) }))
    .filter(({ coverage }) => coverage >= COVERAGE_THRESHOLD)
    .map(({ item, coverage }) => ({ item, score: 1 - coverage * 0.5 }))

  return [...fuseMatchList, ...coverageMatchList]
}

/** 搜尋梗圖資料，空格分隔的多詞為 OR 查詢，最接近的項目排在最前面 */
export function searchMeme(dataList: MemeData[], input: string): MemeData[] {
  /**
   * 未命中的搜尋詞給予的懲罰分數，高於任何命中分數，
   * 故命中越多詞越前面，但極差的多詞命中仍會輸給精準的單詞命中
   */
  const MISS_PENALTY = 1.5
  /** 分數差距小於此值時，改用字元覆蓋率決定順序 */
  const SCORE_TIE_RANGE = 0.1

  const termList = input.split(/\s+/).filter(Boolean)
  if (termList.length === 0)
    return []

  const scoreMapList = termList.map(
    (term) => new Map(matchTerm(dataList, term).map(({ item, score }) => [item, score])),
  )

  const matchedItemList = [...new Set(scoreMapList.flatMap((map) => [...map.keys()]))]
  const coverageTerm = termList.join('')

  return matchedItemList
    .map((item) => ({
      item,
      score: scoreMapList.reduce(
        (total, scoreMap) => total + (scoreMap.get(item) ?? MISS_PENALTY),
        0,
      ),
    }))
    .sort((a, b) => {
      const scoreDiff = a.score - b.score
      if (Math.abs(scoreDiff) > SCORE_TIE_RANGE)
        return scoreDiff

      return calcCharCoverage(b.item, coverageTerm)
        - calcCharCoverage(a.item, coverageTerm)
    })
    .map(({ item }) => item)
}

export function useMemeSearch() {
  const { workerFn: searchMemeWorker } = useWebWorkerFn(
    (dataList: MemeData[], input: string) => {
      return searchMeme(dataList, input)
    },
    {
      localDependencies: [matchByIncludes, calcCharCoverage, matchTerm, searchMeme],
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
