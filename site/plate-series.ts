import type { DefaultTheme } from '../app/theme/types/default-theme'
import type { Article } from './articles'

/** 圖版帶上的一張圖版，對應同系列的一篇文章 */
export interface Plate {
  title: string;
  link: string;
  /** 封面圖路徑（站內絕對路徑，例如 /vue-shallow-ref-and-ref.webp） */
  image: string;
  /** 發布日期，例如 2024-10-07；草稿日期不完整時為空字串 */
  date: string;
}

/** 文章所屬系列（主題或專欄）的圖版資料，只放進該篇文章自己的頁面資料 chunk */
export interface PlateSeries {
  /** 系列名稱，例如 Vue、從 Minecraft 開始的 babylon.js 之路 */
  title: string;
  /** 專欄（依序閱讀）或主題（隨興挑讀） */
  isColumn: boolean;
  /** 依發布日期由舊到新排列 */
  plateList: Plate[];
  /** 目前文章在 plateList 的位置 */
  currentIndex: number;
}

type SidebarItem = DefaultTheme.SidebarItem & { frontmatter?: Article['frontmatter'] }

/** 草稿的 pubDate 可能還沒填完整（例如 202），不足八碼就不顯示日期 */
function toDateText(pubDate: number) {
  const text = String(pubDate)
  if (text.length !== 8)
    return ''
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
}

/** 封面網址統一成站內路徑，Nuxt Image 才會產生縮圖、theme-image 才認得暗色版 */
function toImagePath(image: string) {
  return new URL(image, 'https://codlin.me').pathname
}

function flattenItemList(itemList: SidebarItem[]): SidebarItem[] {
  return itemList.flatMap((item) => item.items ? flattenItemList(item.items as SidebarItem[]) : [item])
}

/** 依側欄設定建立「文章網址 → 所屬系列圖版」對照，只處理主題與專欄目錄（blog-*、column-*） */
export function getPlateSeriesMap(sidebar: DefaultTheme.Sidebar | undefined) {
  const plateSeriesMap = new Map<string, PlateSeries>()
  if (!sidebar || Array.isArray(sidebar))
    return plateSeriesMap

  for (const [sidebarPath, groupList] of Object.entries(sidebar)) {
    const isColumn = sidebarPath.startsWith('/column-')
    if (!isColumn && !sidebarPath.startsWith('/blog-'))
      continue

    const group = (Array.isArray(groupList) ? groupList : groupList.items)[0] as SidebarItem | undefined
    if (!group?.items)
      continue

    const plateList: Plate[] = flattenItemList(group.items as SidebarItem[])
      .filter((item): item is SidebarItem & { link: string; frontmatter: Article['frontmatter'] } => !!item.link && !!item.frontmatter)
      .sort((a, b) => a.frontmatter.pubDate - b.frontmatter.pubDate)
      .map((item) => ({
        title: item.frontmatter.title ?? item.text ?? '',
        link: item.link,
        image: toImagePath(item.frontmatter.image),
        date: toDateText(item.frontmatter.pubDate),
      }))

    plateList.forEach((plate, index) => {
      plateSeriesMap.set(plate.link, {
        title: group.text ?? '',
        isColumn,
        plateList,
        currentIndex: index,
      })
    })
  }

  return plateSeriesMap
}
