import type { DefaultTheme } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const PAGES_PATH = path.resolve(__dirname, '../content') // 把 content 設定成根目錄

// 判斷是否是資料夾
function isDirectory(path: string) {
  return fs.lstatSync(path).isDirectory()
}

// 取得 FrontMatter
function getFrontMatter(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const { data } = matter(content)

  return data || null
}

function getList(params: string[], absolutePath: string, startPath: string): DefaultTheme.SidebarItem[] {
  const res: DefaultTheme.Sidebar = []

  for (const file of params) {
    const dir = path.join(absolutePath, file) // 組合路徑
    const isDir = isDirectory(dir) // 判斷是否是資料夾

    if (isDir) { // 如果是資料夾，遞迴進下一次
      const files = fs.readdirSync(dir)
      res.push({
        text: file,
        collapsed: true,
        items: getList(files, dir, `${startPath}/${file}`),
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

    res.push({
      text: frontmatter.title as string || fileName.replace('.md', ''),
      link: `${startPath}/${fileName.replace('.md', '')}`,
    })
  }

  return res
}

export async function getSidebar(
  startPath: string,
  text: string,
) {
  const absolutePath = path.join(PAGES_PATH, startPath) // 轉換出絕對路徑

  const files = fs.readdirSync(absolutePath) // 讀取目錄下的資料夾&文件

  const result = {
    [startPath]: [{
      text,
      items: getList(files, absolutePath, startPath),
    }],
  }

  return result
}
