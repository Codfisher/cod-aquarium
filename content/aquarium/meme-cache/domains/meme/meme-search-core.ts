import type { IFuseOptions } from 'fuse.js'
import type { MemeData } from './type'
import Fuse from 'fuse.js'
import { partition } from 'remeda'

/** 參與搜尋的欄位，權重越高越優先 */
export const FUSE_OPTIONS: IFuseOptions<MemeData> = {
  keys: [
    'describe',
    { name: 'ocr', weight: 2 },
    { name: 'keyword', weight: 2 },
    { name: 'emotion', weight: 2 },
  ],
  ignoreLocation: true,
  threshold: 0.6,
  includeScore: true,
}

const MATCH_KEY_LIST: Array<keyof MemeData> = ['describe', 'ocr', 'keyword', 'emotion']

function getMatchText(item: MemeData, key: keyof MemeData): string {
  const value = item[key]
  return typeof value === 'string' ? value : ''
}

function matchByIncludes(item: MemeData, term: string): boolean {
  return MATCH_KEY_LIST.some((key) => getMatchText(item, key).includes(term))
}

/** 所有參與搜尋的欄位串成一段文字，欄位間以空格隔開，詞不含空白，故不會跨欄位湊出假命中 */
function getSearchText(item: MemeData): string {
  return MATCH_KEY_LIST.map((key) => getMatchText(item, key)).join(' ')
}

/** 計算搜尋詞的字元在候選文字中出現的比例，用於二次排序 */
export function calcCharCoverage(item: MemeData, term: string): number {
  const text = getSearchText(item)
  const matchedCount = [...term].filter((char) => text.includes(char)).length
  return matchedCount / term.length
}

/**
 * 搜尋情境，持有建好的 Fuse 實例。
 *
 * 建索引是整個搜尋最貴的一步，過去每個搜尋詞都重建一次，
 * 打字時等於每次按鍵重算數次；改成建一次重複使用。
 */
export interface SearchContext {
  dataList: MemeData[];
  fuse: Fuse<MemeData>;
}

export function createSearchContext(dataList: MemeData[], indexData?: unknown): SearchContext {
  const index = indexData
    ? Fuse.parseIndex<MemeData>(indexData as Parameters<typeof Fuse.parseIndex>[0])
    : undefined

  return {
    dataList,
    fuse: new Fuse(dataList, FUSE_OPTIONS, index),
  }
}

/** 產生可序列化的索引資料，供建置期預先產出 */
export function createSearchIndexData(dataList: MemeData[]) {
  return Fuse.createIndex(FUSE_OPTIONS.keys!, dataList).toJSON()
}

/** 單一搜尋詞的匹配結果，score 越小越相關 */
interface TermMatch {
  item: MemeData;
  score: number;
}

/** 取得單一搜尋詞的匹配項目 */
export function matchTerm(context: SearchContext, term: string): TermMatch[] {
  /** 單字直接用精確匹配，Fuse 對此長度雜訊過多 */
  const FUSE_MIN_LENGTH = 1
  const COVERAGE_THRESHOLD = 0.5

  if (term.length <= FUSE_MIN_LENGTH) {
    return context.dataList
      .filter((item) => matchByIncludes(item, term))
      .map((item) => ({ item, score: 0 }))
  }

  const fuseMatchList = context.fuse.search(term).map(({ item, score }) => ({
    item,
    score: score ?? 0,
  }))
  const fuseItemSet = new Set(fuseMatchList.map(({ item }) => item))

  // 字元覆蓋率補充 Fuse 遺漏的項目，分數固定落在 Fuse 門檻之後
  const coverageMatchList = context.dataList
    .filter((item) => !fuseItemSet.has(item))
    .map((item) => ({ item, coverage: calcCharCoverage(item, term) }))
    .filter(({ coverage }) => coverage >= COVERAGE_THRESHOLD)
    .map(({ item, coverage }) => ({ item, score: 1 - coverage * 0.5 }))

  return [...fuseMatchList, ...coverageMatchList]
}

/** 搜尋輸入拆解後的結果 */
export interface ParsedSearchInput {
  /** 要找的詞，多詞為 OR */
  termList: string[];
  /** 含有任一個就剔除的詞 */
  excludedTermList: string[];
}

/**
 * 排除詞的記號，例如「貓 -小八」。
 * 除了半形 `-`，輸入法常打出全形的 `－`，連同 `−`、`–`、`—` 一併視同。
 * 記號後面緊接文字或數字才算排除詞，`-_-`、`--` 這類顏文字與符號仍是一般搜尋詞。
 */
const EXCLUDED_TOKEN_PATTERN = /^[-－−–—](?=[\p{L}\p{N}])/u
/** 單獨一個記號，代表排除詞還沒打完 */
const DANGLING_MARK_PATTERN = /^[-－−–—]$/u

/**
 * 以空白拆詞，記號開頭的詞為排除詞，其餘為搜尋詞。
 *
 * 只認詞首，`T-shirt` 這類詞中間的連字號不受影響。
 * 單獨一個記號要略過：留著會被當成搜尋詞去比對「-」，
 * 若當成空字串的排除詞，又會命中所有項目，打到一半整份結果就被清空。
 */
export function parseSearchInput(input: string): ParsedSearchInput {
  const tokenList = input
    .split(/\s+/)
    .filter((token) => token !== '' && !DANGLING_MARK_PATTERN.test(token))
  const [excludedTokenList, termList] = partition(
    tokenList,
    (token) => EXCLUDED_TOKEN_PATTERN.test(token),
  )

  return {
    termList,
    // 記號都是單一字元，去掉就是排除詞本身
    excludedTermList: excludedTokenList.map((token) => token.slice(1)),
  }
}

/** 多詞為 OR 查詢，命中越多詞、越接近的項目排在越前面 */
function rankByTermList(context: SearchContext, termList: string[]): MemeData[] {
  /**
   * 未命中的搜尋詞給予的懲罰分數，高於任何命中分數，
   * 故命中越多詞越前面，但極差的多詞命中仍會輸給精準的單詞命中
   */
  const MISS_PENALTY = 1.5
  /** 分數差距小於此值時，改用字元覆蓋率決定順序 */
  const SCORE_TIE_RANGE = 0.1

  const scoreMapList = termList.map(
    (term) => new Map(matchTerm(context, term).map(({ item, score }) => [item, score])),
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

/**
 * 剔除含有任一排除詞的項目。
 *
 * 只做精確比對（忽略大小寫），不走 Fuse：模糊匹配與字元覆蓋率只要沾到一半的字就算命中，
 * 拿來排除會誤砍大量無關項目，使用者也看不出圖為什麼不見。
 */
function excludeByTermList(itemList: MemeData[], excludedTermList: string[]): MemeData[] {
  if (excludedTermList.length === 0)
    return itemList

  const lowerTermList = excludedTermList.map((term) => term.toLowerCase())

  return itemList.filter((item) => {
    const text = getSearchText(item).toLowerCase()
    return !lowerTermList.some((term) => text.includes(term))
  })
}

/**
 * 以既有情境搜尋。空格分隔的多詞為 OR 查詢，最接近的項目排在最前面；
 * `-` 接著文字的詞為排除詞（`貓 -小八`），含有該詞的項目不論相關度一律剔除。
 * 沒有搜尋詞時（只有排除詞，或排除詞還沒打完）沒有相關度可排，
 * 從全部資料中扣除，順序維持資料原序。空白輸入沒有任何條件，回傳空陣列。
 */
export function searchWithContext(context: SearchContext, input: string): MemeData[] {
  if (!input.trim())
    return []

  const { termList, excludedTermList } = parseSearchInput(input)

  const candidateList = termList.length === 0
    ? [...context.dataList]
    : rankByTermList(context, termList)

  return excludeByTermList(candidateList, excludedTermList)
}

/** 一次性搜尋，每次自建索引，供測試與 fallback 使用 */
export function searchMeme(dataList: MemeData[], input: string): MemeData[] {
  return searchWithContext(createSearchContext(dataList), input)
}
