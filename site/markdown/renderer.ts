import type { ShikiTransformer } from 'shiki'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { componentPlugin } from '@mdit-vue/plugin-component'
import { frontmatterPlugin } from '@mdit-vue/plugin-frontmatter'
import { headersPlugin } from '@mdit-vue/plugin-headers'
import { sfcPlugin } from '@mdit-vue/plugin-sfc'
import { titlePlugin } from '@mdit-vue/plugin-title'
import { tocPlugin } from '@mdit-vue/plugin-toc'
import {
  transformerCompactLineOptions,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers'
import MarkdownIt from 'markdown-it'
import anchorPlugin from 'markdown-it-anchor'
import attrsPlugin from 'markdown-it-attrs'
import containerPlugin from 'markdown-it-container'
import { full as emojiPlugin } from 'markdown-it-emoji'
import { customAlphabet } from 'nanoid'
import { bundledLanguages, bundledLanguagesAlias, createHighlighter } from 'shiki'
import { getImageSizeMap, markdownItThemeImage } from '../plugins/markdown-it-theme-image'
import { markdownItCodeBlockName } from '../plugins/markdown-it-code-block-name'
import { markdownItMermaid } from '../plugins/markdown-it-mermaid'
import { markdownItNowrap } from '../plugins/markdown-it-nowrap'
import { CONTENT_PATH } from '../constants'

/** 渲染時帶入的環境資料，外掛會讀寫其中欄位 */
export interface MarkdownEnv {
  /** md 檔的絕對路徑，片段引入（<<<）以此為基準解析相對路徑 */
  path: string;
  relativePath: string;
  cleanUrls: boolean;
  frontmatter?: Record<string, unknown>;
  sfcBlocks?: import('@mdit-vue/types').MarkdownSfcBlocks;
  title?: string;
  headers?: import('@mdit-vue/types').MarkdownItHeader[];
  references?: unknown;
}

/* 以下多數規則移植自 VitePress 1.6.4 的 markdown 外掛（MIT），讓文章輸出的 HTML 與原站一致 */

const EXTERNAL_URL_RE = /^(?:[a-z]+:|\/\/)/i
/** 程式碼區塊主題：亮暗模式都用深色 */
const CODE_THEME = { light: 'github-dark', dark: 'github-dark' } as const
const CODE_COPY_BUTTON_TITLE = '複製程式碼'
/** 雙主題時加上 vp-adaptive-theme，樣式依此切換 */
const ADAPTIVE_THEME_MARKER = ' vp-adaptive-theme'

const CONTROL_CHAR_RE = /[\u0000-\u001F]/g
const SPECIAL_CHAR_RE = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g
const COMBINING_MARK_RE = /[̀-ͯ]/g
/** 標題錨點的 id 產生規則，與 VitePress 相同才不會讓既有的 #錨點 網址失效 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARK_RE, '')
    .replace(CONTROL_CHAR_RE, '')
    .replace(SPECIAL_CHAR_RE, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}

/** 已知的檔案類型副檔名，與 VitePress 相同；不在其中的（含 .md、.html、沒有副檔名）都視為站內頁面 */
const KNOWN_FILE_EXTENSION_SET = new Set((
  '3g2,3gp,aac,ai,apng,au,avif,bin,bmp,cer,class,conf,crl,css,csv,dll,'
  + 'doc,eps,epub,exe,gif,gz,ics,ief,jar,jpe,jpeg,jpg,js,json,jsonld,m4a,'
  + 'man,mid,midi,mjs,mov,mp2,mp3,mp4,mpe,mpeg,mpg,mpp,oga,ogg,ogv,ogx,'
  + 'opus,otf,p10,p7c,p7m,p7s,pdf,png,ps,qt,roff,rtf,rtx,ser,svg,t,tif,'
  + 'tiff,tr,ts,tsv,ttf,txt,vtt,wav,weba,webm,webp,woff,woff2,xhtml,xml,'
  + 'yaml,yml,zip'
).split(','))
function treatAsHtml(filename: string): boolean {
  const extension = filename.split('.').pop()
  return extension == null || !KNOWN_FILE_EXTENSION_SET.has(extension.toLowerCase())
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const nanoidLower = customAlphabet('abcdefghijklmnopqrstuvwxyz', 10)
const nanoidShort = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-', 7)

function extractLang(info: string): string {
  return info
    .trim()
    .replace(/=(\d*)/, '')
    .replace(/:(no-)?line-numbers(\{| |$|=\d*).*/, '')
    .replace(/(-vue|\{| ).*$/, '')
    .replace(/^vue-html$/, 'template')
    .replace(/^ansi$/, '')
}

function extractTitle(info: string, isHtml = false): string {
  if (isHtml)
    return info.replace(/<!--[\s\S]*?-->/g, '').match(/data-title="(.*?)"/)?.[1] || ''
  return info.match(/\[(.*)\]/)?.[1] || extractLang(info) || 'txt'
}

/** {1,3-5} 這類行號轉成 shiki 的行選項 */
function attrsToLines(attrs: string) {
  const value = attrs.replace(/^(?:\[.*?\])?.*?([\d,-]+).*/, '$1').trim()
  if (!value)
    return []

  const result: number[] = []
  value
    .split(',')
    .map((range) => range.split('-').map((item) => Number.parseInt(item, 10)))
    .forEach(([start, end]) => {
      if (start && end)
        result.push(...Array.from({ length: end - start + 1 }, (_, index) => start + index))
      else if (start)
        result.push(start)
    })
  return result.map((line) => ({ line, classes: ['highlighted'] }))
}

/** 建立 shiki 語法高亮函式 */
async function createHighlight() {
  const highlighter = await createHighlighter({
    themes: [CODE_THEME.light, CODE_THEME.dark],
    langs: [],
  })

  const loadedLangSet = new Set<string>(['text', 'txt', 'plaintext', 'ansi'])
  function loadLanguage(lang: string): boolean {
    if (loadedLangSet.has(lang) || highlighter.getLoadedLanguages().includes(lang))
      return true
    if (!(lang in bundledLanguages))
      return false
    // markdown-it 的 highlight 是同步函式，語言改在預先掃描時載入，見 preloadLanguages
    return false
  }

  async function preloadLanguages(langList: string[]) {
    for (const lang of langList) {
      if (loadedLangSet.has(lang))
        continue
      // md、sh 這類別名在 bundledLanguagesAlias，載入後別名同樣可用
      const languageLoader = bundledLanguages[lang as keyof typeof bundledLanguages]
        ?? bundledLanguagesAlias[lang as keyof typeof bundledLanguagesAlias]
      if (!languageLoader)
        continue
      await highlighter.loadLanguage(languageLoader)
      loadedLangSet.add(lang)
    }
  }

  const baseTransformerList: ShikiTransformer[] = [
    transformerNotationDiff({ matchAlgorithm: 'v3' }),
    transformerNotationFocus({
      matchAlgorithm: 'v3',
      classActiveLine: 'has-focus',
      classActivePre: 'has-focused-lines',
    }),
    transformerNotationHighlight({ matchAlgorithm: 'v3' }),
    transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
    {
      name: 'vitepress:add-class',
      pre(node) {
        this.addClassToHast(node, 'vp-code')
      },
    },
    {
      name: 'vitepress:clean-up',
      pre(node) {
        delete node.properties.style
      },
    },
  ]

  const vueRE = /-vue(?=:|$)/
  const lineNoStartRE = /=(\d*)/
  const lineNoRE = /:(no-)?line-numbers(=\d*)?$/
  const mustacheRE = /\{\{.*?\}\}/g

  function highlight(code: string, rawLang: string, attrs: string): string {
    // 語言帶 -vue 後綴時，區塊內的 {{ }} 交給 Vue 解析；其餘一律 v-pre
    const vPre = vueRE.test(rawLang) ? '' : 'v-pre'
    let lang = rawLang.replace(lineNoStartRE, '').replace(lineNoRE, '').replace(vueRE, '').toLowerCase() || 'txt'
    if (!loadLanguage(lang)) {
      if (lang !== 'mermaid')
        console.warn(`[markdown] 未支援的語言 '${lang}'，改用純文字`)
      lang = 'txt'
    }

    const lineOptionList = attrsToLines(attrs)
    const mustacheMap = new Map<string, string>()
    const removeMustache = (value: string) => {
      if (vPre)
        return value
      return value.replace(mustacheRE, (match) => {
        let marker = mustacheMap.get(match)
        if (!marker) {
          marker = nanoidLower()
          mustacheMap.set(match, marker)
        }
        return marker
      })
    }
    const restoreMustache = (value: string) => {
      let result = value
      mustacheMap.forEach((marker, match) => {
        result = result.replaceAll(marker, match)
      })
      return result
    }

    const highlighted = highlighter.codeToHtml(removeMustache(code).trimEnd(), {
      lang,
      themes: CODE_THEME,
      defaultColor: false,
      meta: { __raw: attrs },
      transformers: [
        ...baseTransformerList,
        transformerCompactLineOptions(lineOptionList),
        {
          name: 'vitepress:v-pre',
          pre(node) {
            if (vPre)
              node.properties['v-pre'] = ''
          },
        },
        {
          name: 'vitepress:empty-line',
          code(hast) {
            hast.children.forEach((span) => {
              if (
                span.type === 'element'
                && span.tagName === 'span'
                && Array.isArray(span.properties.class)
                && span.properties.class.includes('line')
                && span.children.length === 0
              ) {
                span.children.push({ type: 'element', tagName: 'wbr', properties: {}, children: [] })
              }
            })
          },
        },
      ],
    })
    return restoreMustache(highlighted)
  }

  return { highlight, preloadLanguages }
}

/** markdown-it 會把 &lt; 之類的實體拆成獨立 token，這裡接回去並保持跳脫 */
function restoreEntities(md: MarkdownIt) {
  md.core.ruler.at('text_join', (state: StateCore) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type !== 'inline')
        continue
      const tokenList = blockToken.children ?? []
      for (const token of tokenList) {
        if (token.type === 'text_special')
          token.type = 'text'
      }
      let last = 0
      for (let current = 0; current < tokenList.length; current++) {
        const token = tokenList[current]!
        const nextToken = tokenList[current + 1]
        if (token.type === 'text' && nextToken?.type === 'text') {
          nextToken.content = getTokenContent(token) + getTokenContent(nextToken)
          nextToken.info = ''
          nextToken.markup = ''
        }
        else {
          if (current !== last)
            tokenList[last] = token
          last++
        }
      }
      tokenList.length = last
    }
  })
  md.renderer.rules.text = (tokens, idx) => escapeHtml(tokens[idx]!.content)
}
function getTokenContent(token: Token): string {
  if (token.info === 'entity')
    return token.markup
  if (token.info === 'escape' && token.content === '&')
    return '&amp;'
  return token.content
}

/** ```ts {1,3} 的行號標記，轉成 info 尾端的數字供 highlight 解析 */
function highlightLinePlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  const lineRE = /\{([\d,-]+)\}/
  md.renderer.rules.fence = (...args) => {
    const [tokens, idx] = args
    const token = tokens[idx]!
    const attr = token.attrs?.[0]
    let lines: string | null = null
    if (!attr) {
      const rawInfo = token.info
      if (!rawInfo || !lineRE.test(rawInfo))
        return fence(...args)
      token.info = rawInfo.replace(lineRE, '').trim()
      lines = lineRE.exec(rawInfo)![1]!
    }
    if (!lines) {
      lines = attr![0]
      if (!lines || !/[\d,-]+/.test(lines))
        return fence(...args)
    }
    token.info += ` ${lines}`
    return fence(...args)
  }
}

/** 程式碼區塊外層：語言標籤與複製按鈕 */
function preWrapperPlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const [tokens, idx] = args
    const token = tokens[idx]!
    token.info = token.info.replace(/\[.*\]/, '')
    const active = / active( |$)/.test(token.info) ? ' active' : ''
    token.info = token.info.replace(/ active$/, '').replace(/ active /, ' ')
    const lang = extractLang(token.info)
    return `<div class="language-${lang}${ADAPTIVE_THEME_MARKER}${active}"><button title="${CODE_COPY_BUTTON_TITLE}" class="copy"></button><span class="lang">${lang}</span>${fence(...args)}</div>`
  }
}

/** 行號欄 */
function lineNumberPlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const rawCode = fence(...args)
    const [tokens, idx] = args
    const info = tokens[idx]!.info
    if (/:no-line-numbers($| )/.test(info))
      return rawCode

    let startLineNumber = 1
    const matchStartLineNumber = info.match(/=(\d*)/)
    if (matchStartLineNumber?.[1])
      startLineNumber = Number.parseInt(matchStartLineNumber[1], 10)

    const code = rawCode.slice(rawCode.indexOf('<code>'), rawCode.indexOf('</code>'))
    const lineList = code.split('\n')
    const lineNumbersCode = lineList
      .map((_, index) => `<span class="line-number">${index + startLineNumber}</span><br>`)
      .join('')
    const lineNumbersWrapperCode = `<div class="line-numbers-wrapper" aria-hidden="true">${lineNumbersCode}</div>`
    return rawCode
      .replace(/<\/div>$/, `${lineNumbersWrapperCode}</div>`)
      .replace(/"(language-[^"]*?)"/, '"$1 line-numbers-mode"')
  }
}

/** ::: tip 等提示區塊與 ::: code-group */
function containerListPlugin(md: MarkdownIt) {
  const createContainer = (klass: string, defaultTitle: string) => {
    md.use(containerPlugin, klass, {
      render(tokens: Token[], idx: number, _options: unknown, env: MarkdownEnv) {
        const token = tokens[idx]!
        const info = token.info.trim().slice(klass.length).trim()
        const attrs = md.renderer.renderAttrs(token)
        if (token.nesting === 1) {
          const title = md.renderInline(info || defaultTitle, { references: env.references })
          if (klass === 'details')
            return `<details class="${klass} custom-block"${attrs}><summary>${title}</summary>\n`
          return `<div class="${klass} custom-block"${attrs}><p class="custom-block-title">${title}</p>\n`
        }
        return klass === 'details' ? '</details>\n' : '</div>\n'
      },
    })
  }
  createContainer('tip', 'TIP')
  createContainer('info', 'INFO')
  createContainer('warning', 'WARNING')
  createContainer('danger', 'DANGER')
  createContainer('details', 'Details')

  md.use(containerPlugin, 'v-pre', {
    render: (tokens: Token[], idx: number) => tokens[idx]!.nesting === 1 ? '<div v-pre>\n' : '</div>\n',
  })
  md.use(containerPlugin, 'raw', {
    render: (tokens: Token[], idx: number) => tokens[idx]!.nesting === 1 ? '<div class="vp-raw">\n' : '</div>\n',
  })
  md.use(containerPlugin, 'code-group', {
    render(tokens: Token[], idx: number) {
      if (tokens[idx]!.nesting !== 1)
        return '</div></div>\n'

      const name = nanoidShort().slice(0, 5)
      let tabs = ''
      let checked = 'checked'
      for (let index = idx + 1; !(tokens[index]!.nesting === -1 && tokens[index]!.type === 'container_code-group_close'); ++index) {
        const token = tokens[index]!
        const isHtml = token.type === 'html_block'
        if ((token.type === 'fence' && token.tag === 'code') || isHtml) {
          const title = extractTitle(isHtml ? token.content : token.info, isHtml)
          if (title) {
            const id = nanoidShort()
            tabs += `<input type="radio" name="group-${name}" id="tab-${id}" ${checked}><label data-title="${md.utils.escapeHtml(title)}" for="tab-${id}">${title}</label>`
            if (checked && !isHtml)
              token.info += ' active'
            checked = ''
          }
        }
      }
      return `<div class="vp-code-group${ADAPTIVE_THEME_MARKER}"><div class="tabs">${tabs}</div><div class="blocks">\n`
    },
  })
}

/** 外部連結開新分頁；站內 .md 連結轉成網址 */
function linkPlugin(md: MarkdownIt) {
  const indexRE = /(^|.*\/)index.md(#?.*)$/i
  md.renderer.rules.link_open = (tokens, idx, options, env: MarkdownEnv, self) => {
    const token = tokens[idx]!
    const hrefIndex = token.attrIndex('href')
    const targetIndex = token.attrIndex('target')
    const downloadIndex = token.attrIndex('download')
    if (hrefIndex >= 0 && targetIndex < 0 && downloadIndex < 0) {
      const hrefAttr = token.attrs![hrefIndex]!
      const url = hrefAttr[1]
      if (EXTERNAL_URL_RE.test(url)) {
        token.attrSet('target', '_blank')
        token.attrSet('rel', 'noreferrer')
      }
      else {
        const { pathname, protocol } = new URL(url, 'http://a.com')
        if (!url.startsWith('#') && protocol.startsWith('http') && treatAsHtml(pathname)) {
          let normalizedUrl = url
          const indexMatch = normalizedUrl.match(indexRE)
          if (indexMatch) {
            normalizedUrl = `${indexMatch[1]}${indexMatch[2]}`
          }
          else {
            let cleanUrl = normalizedUrl.replace(/[?#].*$/, '')
            if (cleanUrl.endsWith('.md'))
              cleanUrl = cleanUrl.replace(/\.md$/, env.cleanUrls ? '' : '.html')
            const parsed = new URL(normalizedUrl, 'http://a.com')
            normalizedUrl = cleanUrl + parsed.search + parsed.hash
          }
          if (!normalizedUrl.startsWith('/') && !normalizedUrl.startsWith('./'))
            normalizedUrl = `./${normalizedUrl}`
          hrefAttr[1] = decodeURI(normalizedUrl)
        }
        else if (url.startsWith('#')) {
          hrefAttr[1] = decodeURI(hrefAttr[1])
        }
        if (hrefAttr[1].startsWith('/'))
          hrefAttr[1] = hrefAttr[1].replace(/\/+/g, '/')
      }
    }
    return self.renderToken(tokens, idx, options)
  }
}

/** 片段引入：<<< ./path/file.ts#region{1,2} */
function snippetPlugin(md: MarkdownIt) {
  const rawPathRegexp = /^(.+?(?:\.([a-z0-9]+))?)(#[\w-]+)?(?: ?\{(\d+(?:[,-]\d+)*)? ?(\S+)? ?(\S+)?\})? ?(?:\[(.+)\])?$/
  function rawPathToToken(rawPath: string) {
    const [filepath = '', extension = '', region = '', lines = '', lang = '', attrs = '', rawTitle = '']
      = (rawPathRegexp.exec(rawPath) || []).slice(1)
    const title = rawTitle || filepath.split('/').pop() || ''
    return { filepath, extension, region, lines, lang, attrs, title }
  }
  function dedent(text: string): string {
    const lineList = text.split('\n')
    const minIndentLength = lineList.reduce((acc, line) => {
      for (let index = 0; index < line.length; index++) {
        if (line[index] !== ' ' && line[index] !== '\t')
          return Math.min(index, acc)
      }
      return acc
    }, Infinity)
    if (minIndentLength < Infinity)
      return lineList.map((line) => line.slice(minIndentLength)).join('\n')
    return text
  }
  function testLine(line: string, regexp: RegExp, regionName: string, isEnd = false) {
    const [full, tag, name] = regexp.exec(line.trim()) || []
    return full && tag && name === regionName && tag.match(isEnd ? /^[Ee]nd ?[rR]egion$/ : /^[rR]egion$/)
  }
  function findRegion(lineList: string[], regionName: string) {
    const regionRegexpList = [
      /^\/\/ ?#?((?:end)?region) ([\w*-]+)$/,
      /^\/\* ?#((?:end)?region) ([\w*-]+) ?\*\/$/,
      /^#pragma ((?:end)?region) ([\w*-]+)$/,
      /^<!-- #?((?:end)?region) ([\w*-]+) -->$/,
      /^#((?:End )Region) ([\w*-]+)$/,
      /^::#((?:end)region) ([\w*-]+)$/,
      /^# ?((?:end)?region) ([\w*-]+)$/,
    ]
    let regexp: RegExp | null = null
    let start = -1
    for (const [lineIndex, line] of lineList.entries()) {
      if (regexp === null) {
        for (const candidate of regionRegexpList) {
          if (testLine(line, candidate, regionName)) {
            start = lineIndex + 1
            regexp = candidate
            break
          }
        }
      }
      else if (testLine(line, regexp, regionName, true)) {
        return { start, end: lineIndex, regexp }
      }
    }
    return null
  }

  const parser = (state: StateBlock, startLine: number, _endLine: number, silent: boolean) => {
    const CH = '<'.charCodeAt(0)
    const position = state.bMarks[startLine]! + state.tShift[startLine]!
    const max = state.eMarks[startLine]!
    if (state.sCount[startLine]! - state.blkIndent >= 4)
      return false
    for (let index = 0; index < 3; ++index) {
      const char = state.src.charCodeAt(position + index)
      if (char !== CH || position + index >= max)
        return false
    }
    if (silent)
      return true

    const start = position + 3
    const end = state.skipSpacesBack(max, position)
    // 開頭的 @ 代表 content 目錄，與 VitePress 的 srcDir 別名相同
    const rawPath = state.src.slice(start, end).trim().replace(/^@/, CONTENT_PATH).trim()
    const { filepath, extension, region, lines, lang, attrs, title } = rawPathToToken(rawPath)
    state.line = startLine + 1
    const token = state.push('fence', 'code', 0)
    token.info = `${lang || extension}${lines ? `{${lines}}` : ''}${title ? `[${title}]` : ''}  ${attrs ?? ''}`
    const env = state.env as MarkdownEnv
    const resolvedPath = path.resolve(path.dirname(env.path), filepath)
    token.meta = { snippetSource: [resolvedPath, region.slice(1)] }
    token.markup = '```'
    token.map = [startLine, startLine + 1]
    return true
  }

  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const [tokens, idx] = args
    const token = tokens[idx]!
    const [source, regionName] = (token.meta?.snippetSource ?? []) as [string?, string?]
    if (!source)
      return fence(...args)

    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      token.content = `Code snippet path not found: ${source}`
      token.info = ''
      return fence(...args)
    }
    let content = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n')
    if (regionName) {
      const lineList = content.split('\n')
      const region = findRegion(lineList, regionName)
      if (region) {
        content = dedent(
          lineList
            .slice(region.start, region.end)
            .filter((line) => !region.regexp.test(line.trim()))
            .join('\n'),
        )
      }
    }
    token.content = content
    return fence(...args)
  }
  md.block.ruler.before('fence', 'snippet', parser)
}

/** GitHub 風格的提示區塊：> [!TIP] 標題，輸出與 ::: tip 相同的 custom-block */
function gitHubAlertsPlugin(md: MarkdownIt) {
  const markerRE = /^\[!(TIP|NOTE|INFO|IMPORTANT|WARNING|CAUTION|DANGER)\]([^\n\r]*)/i
  const defaultTitleMap: Record<string, string> = {
    tip: 'TIP',
    note: 'NOTE',
    info: 'INFO',
    important: 'IMPORTANT',
    warning: 'WARNING',
    caution: 'CAUTION',
    danger: 'DANGER',
  }

  md.core.ruler.after('block', 'github-alerts', (state) => {
    const tokenList = state.tokens
    for (let index = 0; index < tokenList.length; index++) {
      const openToken = tokenList[index]!
      if (openToken.type !== 'blockquote_open')
        continue

      let endIndex = index + 1
      while (endIndex < tokenList.length && (tokenList[endIndex]!.type !== 'blockquote_close' || tokenList[endIndex]!.level !== openToken.level))
        endIndex++
      const closeToken = tokenList[endIndex]
      if (!closeToken)
        continue

      const firstContent = tokenList.slice(index, endIndex + 1).find((token) => token.type === 'inline')
      const match = firstContent?.content.match(markerRE)
      if (!firstContent || !match)
        continue

      const type = match[1]!.toLowerCase()
      const title = match[2]!.trim() || defaultTitleMap[type] || type
      firstContent.content = firstContent.content.slice(match[0].length).trimStart()
      openToken.type = 'github_alert_open'
      openToken.tag = 'div'
      openToken.meta = { title, type }
      closeToken.type = 'github_alert_close'
      closeToken.tag = 'div'
    }
  })
  md.renderer.rules.github_alert_open = (tokens, idx) => {
    const { title, type } = tokens[idx]!.meta as { title: string; type: string }
    return `<div class="${type} custom-block github-alert"><p class="custom-block-title">${title}</p>\n`
  }
}

/** 掃描文章用到的程式語言，讓 shiki 先載好 */
function collectLanguageList(source: string): string[] {
  const langSet = new Set<string>()
  for (const match of source.matchAll(/^ *(?:```|~~~)+ *([\w+-]+)/gm)) {
    langSet.add(match[1]!.toLowerCase().replace(/-vue$/, ''))
  }
  // 片段引入以副檔名判斷語言
  for (const match of source.matchAll(/^<<< *([^\s#{[]+)/gm)) {
    const extension = path.extname(match[1]!).slice(1).toLowerCase()
    if (extension)
      langSet.add(extension)
  }
  return [...langSet]
}

let rendererPromise: Promise<{ md: MarkdownIt; preloadLanguages: (source: string) => Promise<void> }> | undefined

/** 建立全站共用的 markdown-it 實例 */
export function getMarkdownRenderer() {
  rendererPromise ??= (async () => {
    const { highlight, preloadLanguages } = await createHighlight()
    const imageSizeMap = getImageSizeMap()
    const md = MarkdownIt({
      html: true,
      linkify: true,
      highlight: (code, lang, attrs) => highlight(code, lang, attrs),
    })
    md.linkify.set({ fuzzyLink: false })
    md.use(restoreEntities)

    md.use(componentPlugin)
      .use(highlightLinePlugin)
      .use(preWrapperPlugin)
      .use(snippetPlugin)
      .use(containerListPlugin)
      .use(linkPlugin)
      .use(lineNumberPlugin)

    md.renderer.rules.table_open = () => '<table tabindex="0">\n'

    md.use(gitHubAlertsPlugin)
    md.use(attrsPlugin)
    md.use(emojiPlugin)
    md.use(anchorPlugin, {
      slugify,
      permalink: anchorPlugin.permalink.linkInsideHeader({
        symbol: '&ZeroWidthSpace;',
        renderAttrs: (slug: string, state: StateCore) => {
          const index = state.tokens.findIndex((token) => token.attrs?.find((attr) => attr[0] === 'id')?.[1] === slug)
          const title = state.tokens[index + 1]?.content ?? ''
          return { 'aria-label': `Permalink to "${title}"` }
        },
      }),
    })
    md.use(frontmatterPlugin)
    md.use(headersPlugin, { level: [2, 3, 4, 5, 6], slugify })
    md.use(sfcPlugin)
    md.use(titlePlugin)
    md.use(tocPlugin, { slugify })

    // 自訂語法
    md.use(markdownItThemeImage, imageSizeMap)
    md.use(markdownItNowrap)
    md.use(markdownItCodeBlockName)
    md.use(markdownItMermaid)

    return {
      md,
      preloadLanguages: (source: string) => preloadLanguages(collectLanguageList(source)),
    }
  })()
  return rendererPromise
}
