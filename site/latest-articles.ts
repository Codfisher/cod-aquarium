import type { Article } from './articles'

/** 首頁「最新文章」顯示的篇數 */
const LATEST_ARTICLE_COUNT = 4

/** 文章所在目錄對應的主題名稱，其餘目錄都是專欄 */
const SECTION_NAME_MAP: Record<string, string> = {
  'blog-ocean-world': '蔚藍世界',
  'blog-program': '程式浮潛',
  'blog-vue': 'Vue',
}

/** 依文章連結（例如 /blog-vue/xxx 或 blog-vue/xxx）取得主題名稱；專欄文章為「專欄」。首頁最新文章與文章總覽共用 */
export function getSectionName(link: string) {
  const directory = link.replace(/^\//, '').split('/')[0] ?? ''
  return SECTION_NAME_MAP[directory] ?? '專欄'
}

export interface LatestArticle {
  title: string;
  /** 站內絕對路徑，例如 /blog-vue/vue-shallow-ref-and-ref */
  link: string;
  /** 封面站內路徑，例如 /vue-shallow-ref-and-ref.webp */
  image: string;
  /** 發布日期，例如 2024-10-07 */
  date: string;
  /** 主題名稱；專欄文章為「專欄」 */
  sectionName: string;
}

function toDateText(pubDate: number) {
  const text = String(pubDate)
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
}

/** 取最新幾篇文章的精簡資料（articleList 已排除草稿） */
export function getLatestArticleList(articleList: Article[]): LatestArticle[] {
  return [...articleList]
    .sort((a, b) => b.frontmatter.pubDate - a.frontmatter.pubDate)
    .slice(0, LATEST_ARTICLE_COUNT)
    .map((article) => {
      const link = `/${article.link.replace(/^\//, '')}`
      return {
        title: article.frontmatter.title ?? article.text,
        link,
        image: new URL(article.frontmatter.image, 'https://codlin.me').pathname,
        date: toDateText(article.frontmatter.pubDate),
        sectionName: getSectionName(link),
      }
    })
}
