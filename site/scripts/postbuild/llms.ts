import type { DefaultTheme } from '../../../app/theme/types/default-theme'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { CONTENT_PATH, PROJECT_ROOT, SITE_DESCRIPTION, SITE_TITLE } from '../../constants'
import { toRewrittenPath } from '../../pages'
import { getThemeConfig } from '../../theme-config'

/* 產生 llms.txt、llms-full.txt 與每頁的 .md 副本，規則移植自 vitepress-plugin-llms 1.12（MIT）的預設設定 */

/** 不收進 llms 文件的檔案。情緒分類頁是動態路由，原始內容只有參數，收進來只是雜訊；其餘為外掛預設排除項目 */
const IGNORE_PATTERN_LIST = [
  'aquarium/meme-cache/emotion/*',
  'index.md',
  'blog/*',
  'blog.md',
  'team.md',
]

/** markdown 語法樹節點，只宣告用得到的欄位 */
interface MarkdownNode {
  type: string;
  value?: string;
  lang?: string | null;
  meta?: string | null;
  children?: MarkdownNode[];
}

interface MarkdownToolkit {
  /** 解析 → 移除 HTML → 展開 <<< 程式碼片段 → 轉回 markdown，相當於外掛裡的 remark 流程 */
  normalize: (source: string, filePath: string) => string;
}

interface PreparedFile {
  /** 輸出路徑（已去除日期前綴，子目錄的 index.md 改為「目錄.md」） */
  path: string;
  title: string;
  data: Record<string, unknown>;
  content: string;
}

/** 簡易 glob 比對，排除清單只用到 `*` */
function matchGlob(filePath: string, pattern: string): boolean {
  const regexSource = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${regexSource}$`).test(filePath)
}

function isIgnored(filePath: string): boolean {
  return IGNORE_PATTERN_LIST.some((pattern) => matchGlob(filePath, pattern))
}

/** 列出 content 下所有 md（含 public），與 VitePress 收集頁面的範圍相同 */
function getAllMarkdownFileList(dirPath = CONTENT_PATH): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist')
      continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory())
      result.push(...getAllMarkdownFileList(fullPath))
    else if (entry.name.endsWith('.md'))
      result.push(path.relative(CONTENT_PATH, fullPath).replace(/\\/g, '/'))
  }
  return result.sort()
}

// #region 程式碼片段（<<<）展開，移植自外掛的 remark-plugins/snippets
/* eslint-disable regexp/no-super-linear-backtracking, regexp/no-misleading-capturing-group, regexp/no-useless-lazy -- 正規式照抄外掛以確保結果一致，輸入只有站內 md */
const SNIPPET_RE = /^<<<\s*(.*?)$/m
const REGION_MARKER_LIST = [
  { start: /^\s*\/\/\s*#?region\b\s*(.*?)\s*$/, end: /^\s*\/\/\s*#?endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*<!--\s*#?region\b\s*(.*?)\s*-->/, end: /^\s*<!--\s*#?endregion\b\s*(.*?)\s*-->/ },
  { start: /^\s*\/\*\s*#region\b\s*(.*?)\s*\*\//, end: /^\s*\/\*\s*#endregion\b\s*(.*?)\s*\*\// },
  { start: /^\s*#[rR]egion\b\s*(.*?)\s*$/, end: /^\s*#[eE]nd ?[rR]egion\b\s*(.*?)\s*$/ },
  { start: /^\s*#\s*#?region\b\s*(.*?)\s*$/, end: /^\s*#\s*#?endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*(?:--|::|@?REM)\s*#region\b\s*(.*?)\s*$/, end: /^\s*(?:--|::|@?REM)\s*#endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*#pragma\s+region\b\s*(.*?)\s*$/, end: /^\s*#pragma\s+endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*\(\*\s*#region\b\s*(.*?)\s*\*\)/, end: /^\s*\(\*\s*#endregion\b\s*(.*?)\s*\*\)/ },
]
const RAW_PATH_RE = /^(.+?(?:\.([a-z0-9]+))?)(#[\w-]+)?(?: ?\{(\d+(?:[,-]\d+)*)? ?(\S+)? ?(\S+)?\})? ?(?:\[(.+)\])?$/

function dedent(text: string): string {
  const lineList = text.split('\n')
  let minIndentLength = Infinity
  for (const line of lineList) {
    const indentLength = line.search(/[^ \t]/)
    if (indentLength !== -1)
      minIndentLength = Math.min(indentLength, minIndentLength)
  }
  return minIndentLength < Infinity
    ? lineList.map((line) => line.slice(minIndentLength)).join('\n')
    : text
}

function extractRegion(content: string, regionName: string): string {
  const lineList = content.split('\n')
  for (const [startIndex, line] of lineList.entries()) {
    const marker = REGION_MARKER_LIST.find((item) => item.start.exec(line)?.[1] === regionName)
    if (!marker)
      continue

    let depth = 1
    let endIndex = lineList.length
    for (let index = startIndex + 1; index < lineList.length; index++) {
      if (marker.start.exec(lineList[index] ?? '')?.[1] === regionName)
        depth++
      const endName = marker.end.exec(lineList[index] ?? '')?.[1]
      if ((endName === regionName || endName === '') && --depth === 0) {
        endIndex = index
        break
      }
    }
    return dedent(
      lineList
        .slice(startIndex + 1, endIndex)
        .filter((item) => !marker.start.test(item) && !marker.end.test(item))
        .join('\n'),
    )
  }
  return content
}

/** 把 `<<< ./foo.vue` 轉成程式碼節點，找不到檔案時回傳 undefined 保留原文 */
function toSnippetNode(text: string, filePath: string): MarkdownNode | undefined {
  const rawPath = SNIPPET_RE.exec(text)?.[1]?.trim()
  if (!rawPath)
    return undefined

  const isRootPath = rawPath.startsWith('@')
  const [, snippetFile = '', extension = '', region = '', lines = '', lang = '', attrs = '', title = '']
    = RAW_PATH_RE.exec(isRootPath ? rawPath.slice(1) : rawPath) ?? []
  const snippetPath = isRootPath
    ? path.join(CONTENT_PATH, snippetFile)
    : path.resolve(path.dirname(filePath), snippetFile)
  if (!fs.existsSync(snippetPath))
    return undefined

  let code = fs.readFileSync(snippetPath, 'utf-8').replaceAll('\r\n', '\n')
  if (region)
    code = extractRegion(code, region.slice(1))

  const meta = `${lines && `{${lines}}`}${title && `[${title}]`}${attrs && ` ${attrs}`}`.trim()
  return { type: 'code', lang: lang || extension || null, meta: meta || null, value: code }
}
/* eslint-enable regexp/no-super-linear-backtracking, regexp/no-misleading-capturing-group, regexp/no-useless-lazy */
// #endregion

/** 移除 HTML 節點；子節點全被移除的父節點一併移除（同 unist-util-remove 的 cascade） */
function removeHtmlNode(node: MarkdownNode): MarkdownNode | undefined {
  if (node.type === 'html')
    return undefined
  if (!node.children?.length)
    return node

  node.children = node.children
    .map(removeHtmlNode)
    .filter((child): child is MarkdownNode => !!child)
  return node.children.length ? node : undefined
}

function inlineSnippet(node: MarkdownNode, filePath: string) {
  if (!node.children)
    return
  node.children = node.children.map((child) => {
    if (child.type === 'text' && child.value && SNIPPET_RE.test(child.value))
      return toSnippetNode(child.value, filePath) ?? child
    inlineSnippet(child, filePath)
    return child
  })
}

/** 動態載入 mdast 工具。
 *
 * 外掛用 remark（底層即 mdast-util-from-markdown / to-markdown）重新輸出 markdown，用同一套才能得到相同格式。
 * 這幾個套件目前只是間接依賴，未列在 package.json 時改從 pnpm 的 .pnpm/node_modules 載入
 */
async function importPackage<T>(name: string): Promise<T> {
  try {
    return await import(/* @vite-ignore */ name) as T
  }
  catch {
    const hoistedPath = path.join(PROJECT_ROOT, 'node_modules', '.pnpm', 'node_modules', name, 'index.js')
    return await import(/* @vite-ignore */ pathToFileURL(hoistedPath).href) as T
  }
}

async function loadMarkdownToolkit(): Promise<MarkdownToolkit> {
  try {
    type FromMarkdown = (value: string, options: { extensions: unknown[]; mdastExtensions: unknown[] }) => MarkdownNode
    type ToMarkdown = (tree: MarkdownNode, options: { extensions: unknown[] }) => string

    const [{ fromMarkdown }, { toMarkdown }, { frontmatter }, { frontmatterFromMarkdown, frontmatterToMarkdown }] = await Promise.all([
      importPackage<{ fromMarkdown: FromMarkdown }>('mdast-util-from-markdown'),
      importPackage<{ toMarkdown: ToMarkdown }>('mdast-util-to-markdown'),
      importPackage<{ frontmatter: () => unknown }>('micromark-extension-frontmatter'),
      importPackage<{ frontmatterFromMarkdown: () => unknown; frontmatterToMarkdown: () => unknown }>('mdast-util-frontmatter'),
    ])

    return {
      normalize(source, filePath) {
        const tree = fromMarkdown(source, {
          extensions: [frontmatter()],
          mdastExtensions: [frontmatterFromMarkdown()],
        })
        inlineSnippet(tree, filePath)
        const cleanTree = removeHtmlNode(tree) ?? { type: 'root', children: [] }
        // 新版 to-markdown 會把段落結尾的換行編成 &#xA;（拿掉 HTML 後常出現），原站的版本直接輸出換行
        return toMarkdown(cleanTree, { extensions: [frontmatterToMarkdown()] }).replaceAll('&#xA;', '\n')
      },
    }
  }
  catch (error) {
    // 找不到 mdast 工具時退回逐行處理：格式與原站略有差異，但內容完整
    console.warn('[ llms ] 無法載入 mdast 工具，改用簡易轉換：', error)
    return {
      normalize(source, filePath) {
        return source
          .split('\n')
          .map((line) => SNIPPET_RE.test(line) ? toSnippetMarkdown(line, filePath) : line)
          .filter((line) => !/^\s*<\/?[a-z][^>]*>\s*$/i.test(line))
          .join('\n')
      },
    }
  }
}

function toSnippetMarkdown(line: string, filePath: string): string {
  const node = toSnippetNode(line, filePath)
  if (!node)
    return line
  return `\`\`\`${node.lang ?? ''}${node.meta ? ` ${node.meta}` : ''}\n${node.value}\n\`\`\``
}

/** 同 markdown-title 套件：取第一個 # 標題 */
function getMarkdownTitle(content: string): string | undefined {
  // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/no-useless-lazy -- 照抄套件的正規式，標題擷取結果才會一致
  return content.match(/^#[^#]\s*(.+?)#*?$/m)?.pop()?.trim()
}

/** 同外掛的輸出路徑規則：去日期前綴，子目錄的 index.md 改為「目錄.md」 */
function toOutputPath(filePath: string): string {
  const rewrittenPath = toRewrittenPath(filePath)
  const dirName = path.posix.dirname(rewrittenPath)
  if (path.posix.basename(rewrittenPath) === 'index.md' && dirName !== '.')
    return `${dirName}.md`
  return rewrittenPath
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.(?:md|html)$/, '')
}

function toLinkPath(filePath: string): string {
  return `/${stripExtension(filePath)}.md`
}

/** 路徑比對：去副檔名、index 視同目錄 */
function normalizeLinkPath(link: string): string {
  const cleanPath = stripExtension(link)
  return path.posix.basename(cleanPath) === 'index' ? path.posix.dirname(cleanPath) : cleanPath
}

function isPathMatch(filePath: string, sidebarPath: string): boolean {
  const normalizedFilePath = normalizeLinkPath(filePath)
  const normalizedSidebarPath = normalizeLinkPath(sidebarPath)
  return normalizedFilePath === normalizedSidebarPath || normalizedFilePath === `${normalizedSidebarPath}.md`
}

function findFileByLink(fileList: PreparedFile[], link: string): PreparedFile | undefined {
  return fileList.find((file) => isPathMatch(`/${stripExtension(file.path)}`, link))
}

function toTocLine(file: PreparedFile): string {
  const description = typeof file.data.description === 'string' ? `: ${file.data.description.trim()}` : ''
  return `- [${file.title}](${toLinkPath(file.path)})${description}\n`
}

function getSidebarSectionList(): DefaultTheme.SidebarItem[] {
  const sidebar = getThemeConfig().sidebar
  if (Array.isArray(sidebar))
    return sidebar
  if (sidebar && typeof sidebar === 'object')
    // 多組側欄時每組可能是陣列或 { base, items }，與外掛一樣直接攤平成分節清單
    return Object.values(sidebar).flatMap((value) => Array.isArray(value) ? value : [value as DefaultTheme.SidebarItem])
  return []
}

function collectSidebarLinkList(itemList: DefaultTheme.SidebarItem[], base = ''): string[] {
  return itemList.flatMap((item) => [
    ...(typeof item.link === 'string' ? [(item.base ?? base) + item.link] : []),
    ...(Array.isArray(item.items) ? collectSidebarLinkList(item.items, item.base ?? base) : []),
  ])
}

function toSectionToc(section: DefaultTheme.SidebarItem, fileList: PreparedFile[], depth: number): string {
  if (!Array.isArray(section.items))
    return ''

  const sectionBase = section.base ?? ''
  const linkLineList = section.items
    .filter((item) => typeof item.link === 'string')
    .map((item) => {
      const link = normalizeLinkPath(path.posix.join(item.base ?? sectionBase, item.link ?? ''))
      const file = findFileByLink(fileList, link)
      if (!file)
        console.warn(`[ llms ] 側欄連結找不到對應檔案：${item.link}`)
      return file ? toTocLine(file) : undefined
    })
    .filter((line): line is string => !!line)
  const nestedSectionList = section.items
    .filter((item) => Array.isArray(item.items) && item.items.length > 0)
    .map((item) => toSectionToc(item, fileList, depth + 1))
    .filter((content) => content.trim() !== '')

  if (!linkLineList.length && !nestedSectionList.length)
    return ''

  const header = section.text !== undefined ? `${'#'.repeat(depth)} ${section.text}\n\n` : ''
  const separator = linkLineList.length && nestedSectionList.length ? '\n' : ''
  return `${header}${linkLineList.join('')}${separator}${nestedSectionList.join('\n')}`
}

/** 目錄依側欄分節，側欄沒列到的檔案集中在 Other */
function getToc(fileList: PreparedFile[], sectionList: DefaultTheme.SidebarItem[]): string {
  const validSectionList = sectionList.filter((section) => Array.isArray(section.items) && section.items.length > 0)
  let toc = `${validSectionList.map((section) => toSectionToc(section, fileList, 3)).join('\n')}\n`

  const sidebarLinkList = collectSidebarLinkList(validSectionList)
  const unsortedFileList = fileList.filter((file) =>
    !sidebarLinkList.some((link) => isPathMatch(`/${stripExtension(file.path)}`, link)),
  )
  if (unsortedFileList.length) {
    toc += `### Other\n\n${unsortedFileList.map(toTocLine).join('')}`
  }
  return toc
}

/** 依側欄順序排列，其餘維持標題排序 */
function sortBySidebar(fileList: PreparedFile[], sectionList: DefaultTheme.SidebarItem[]): PreparedFile[] {
  const orderedList: PreparedFile[] = []
  const seenPathSet = new Set<string>()
  for (const link of collectSidebarLinkList(sectionList)) {
    const file = findFileByLink(fileList, link)
    if (file && !seenPathSet.has(file.path)) {
      orderedList.push(file)
      seenPathSet.add(file.path)
    }
  }
  return [...orderedList, ...fileList.filter((file) => !seenPathSet.has(file.path))]
}

/** 每頁副本與 llms-full.txt 的內容：frontmatter 只留 url 與 description */
function toPageMarkdown(file: PreparedFile): string {
  const metadata = {
    url: toLinkPath(file.path),
    ...(typeof file.data.description === 'string' ? { description: file.data.description } : {}),
  }
  return matter.stringify(file.content, metadata)
}

export async function writeLlmsFiles(outDir: string) {
  const toolkit = await loadMarkdownToolkit()

  const fileList: PreparedFile[] = getAllMarkdownFileList()
    // 首頁不收（外掛預設 excludeIndexPage）
    .filter((filePath) => filePath !== 'index.md' && !isIgnored(filePath))
    .map((filePath) => {
      const absolutePath = path.join(CONTENT_PATH, filePath)
      const source = fs.readFileSync(absolutePath, 'utf-8')
      const { data, content } = matter(toolkit.normalize(source, absolutePath))
      const titleValue = data.title ?? data.titleTemplate ?? getMarkdownTitle(content)
      return {
        path: toOutputPath(filePath),
        title: typeof titleValue === 'string' ? titleValue.trim() : 'Untitled',
        data,
        content,
      }
    })
    .filter((file) => !isIgnored(file.path))
    // 固定用 en 排序規則（中文依字碼），與原站在 Cloudflare（Linux、預設 en-US）build 的順序相同，不受本機語系影響
    .sort((one, another) => one.title.localeCompare(another.title, 'en'))

  const sectionList = getSidebarSectionList()

  // llms.txt 標題取首頁 frontmatter.title，描述取站台描述（外掛的取值順序）
  const indexData = matter(fs.readFileSync(path.join(CONTENT_PATH, 'index.md'), 'utf-8')).data
  const title = typeof indexData.title === 'string' ? indexData.title : SITE_TITLE
  const llmsTxt = `# ${title}\n\n> ${SITE_DESCRIPTION}\n\n## Table of Contents\n\n${getToc(fileList, sectionList)}`
  fs.writeFileSync(path.join(outDir, 'llms.txt'), llmsTxt)

  const llmsFullTxt = sortBySidebar(fileList, sectionList).map(toPageMarkdown).join('\n---\n\n')
  fs.writeFileSync(path.join(outDir, 'llms-full.txt'), llmsFullTxt)

  for (const file of fileList) {
    const targetPath = path.join(outDir, file.path)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, toPageMarkdown(file))
  }

  console.log(`[ llms ] 已輸出 llms.txt、llms-full.txt 與 ${fileList.length} 個頁面副本`)
}
