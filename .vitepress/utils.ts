import type { DefaultTheme } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import matter from 'gray-matter'
import { filter, find, flatMap, map, pipe, sort } from 'remeda'
import { z } from 'zod'

const isDev = process.env.NODE_ENV !== 'production'
const CONTENT_PATH = path.resolve(__dirname, '../content')

function isDirectory(path: string) {
  return fs.lstatSync(path).isDirectory()
}

const docFrontMatterSchema = z.object({
  title: z.string().nullish(),
  description: z.string(),
  tags: z.array(z.string()),
  image: z.string().url(),
  date: z.coerce.number(),
  draft: z.boolean().optional(),
})

/** 從 markdown 內容中提取第一個 # 標題 */
function extractFirstHeading(content: string): string | null {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('# ')) {
      return trimmedLine.substring(2).trim()
    }
  }
  return null
}

export function getFrontMatter(filePath: string) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    return
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const result = matter(content)

  const data = docFrontMatterSchema.parse(result.data)
  // 如果 title 不存在，嘗試從文章內容的第一個 # 標題取得
  if (!data.title) {
    const h1 = extractFirstHeading(result.content)
    if (h1) {
      data.title = h1
    }
  }

  return data || null
}

/** 遞迴產生目錄結構的階層式側邊欄項目清單 */
function getNestedList(
  files: string[],
  absolutePath: string,
  startPath: string,
  order: 'asc' | 'desc' = 'desc',
) {
  const res: Array<DefaultTheme.SidebarItem & {
    frontmatter?: z.infer<typeof docFrontMatterSchema>;
  }> = []

  for (const file of files) {
    const dir = path.join(absolutePath, file)
    const isDir = isDirectory(dir)

    // 如果是目錄，則遞迴取得子目錄的項目
    if (isDir) {
      const files = fs.readdirSync(dir)
      const items = getNestedList(files, dir, `${startPath}/${file}`, order)
      if (items.length === 0) {
        continue
      }

      res.push({
        text: file,
        collapsed: true,
        items,
      })
      continue
    }

    const fileName = path.basename(file)

    // 排除非md檔案
    const suffix = path.extname(file)
    if (suffix !== '.md') {
      continue
    }

    const frontmatter = getFrontMatter(`${absolutePath}/${file}`)
    if (!frontmatter) {
      continue
    }
    if (!isDev && frontmatter.draft) {
      continue
    }

    const text = `${frontmatter.title}` || fileName.replace('.md', '')
    res.push({
      text,
      link: `${startPath}/${fileName.replace('.md', '')}`
        .replace(/\d{6}\./, '')
        .replace(/\/\//, '/'),
      frontmatter,
    })
  }

  res.sort((a, b) => (b.frontmatter?.date ?? 0) - (a.frontmatter?.date ?? 0))

  if (order === 'asc') {
    res.reverse()
  }

  return res
}

export function getSidebar(
  startPath: string,
  text: string,
  order: 'asc' | 'desc' = 'desc',
) {
  const absolutePath = path.join(CONTENT_PATH, startPath)
  const files = fs.readdirSync(absolutePath)

  const result = {
    [startPath]: [{
      text,
      items: getNestedList(files, absolutePath, startPath, order),
    }],
  }

  if (isDev && result?.[startPath]?.[0]?.items.length === 0) {
    return undefined
  }

  return result
}

/** 取得目標目錄中最新的文章 */
export function getLatestDocPath(
  docPath: string,
) {
  const target = pipe(
    path.join(CONTENT_PATH, docPath),
    (value) => fs.readdirSync(value),
    map((value) => path.basename(value)),
    sort((a, b) => b.localeCompare(a)),
    find((file) => {
      const fullPath = path.join(CONTENT_PATH, docPath, file)
      const frontmatter = getFrontMatter(fullPath)
      if (!isDev) {
        return !frontmatter?.draft
      }

      return true
    }),
  )
  if (!target) {
    return ''
  }

  return `${docPath}/${target.replace('.md', '')}`
    .replace(/\d{6}\./, '')
    .replace(/\/\//, '/')
}

/** 取得目標目錄中最舊的文章 */
export function getOldestDocPath(
  docPath: string,
) {
  const target = pipe(
    path.join(CONTENT_PATH, docPath),
    (value) => fs.readdirSync(value),
    map((value) => path.basename(value)),
    sort((a, b) => a.localeCompare(b)),
    find((file) => {
      const fullPath = path.join(CONTENT_PATH, docPath, file)
      const frontmatter = getFrontMatter(fullPath)
      if (!isDev) {
        return !frontmatter?.draft
      }

      return true
    }),
  )
  if (!target) {
    return ''
  }

  return `${docPath}/${target.replace('.md', '')}`
    .replace(/\d{6}\./, '')
    .replace(/\/\//, '/')
}

export interface Article {
  text: string;
  link: string;
  frontmatter: z.infer<typeof docFrontMatterSchema>;
}
/** 取得所有文章 */
export function getArticleList(): Article[] {
  const result = pipe(
    fs.readdirSync(CONTENT_PATH),
    filter((value) =>
      isDirectory(path.join(CONTENT_PATH, value))
      && (value.includes('blog') || value.includes('column')),
    ),
    flatMap((dirPath) => {
      const absolutePath = path.join(CONTENT_PATH, dirPath)
      const files = fs.readdirSync(absolutePath)

      return getNestedList(files, absolutePath, dirPath)
    }),
    filter((data): data is Article => {
      if (isDev) {
        return !!data.text && !!data.link && !!data.frontmatter
      }

      return !!data.text && !!data.link && !data.frontmatter?.draft
    }),
  )

  return result
}
