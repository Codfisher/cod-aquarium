import type { NuxtApp } from 'nuxt/app'
import type { Router } from 'vue-router'
import { isStandalonePath, loadPageData } from '#vp'
import { defineNuxtPlugin, loadPayload, preloadRouteComponents } from 'nuxt/app'
import { getHashScrollPosition, requestSmoothScroll } from '../theme/scroll'
import { treatAsHtml } from '../theme/shared'

/** 移植 VitePress client 的全域行為（dist/client/app）：
 * - 站內連結改用 router 換頁（router.js 的 click handler）
 * - 程式碼區塊的複製按鈕（composables/copyCode.js）
 * - code-group 分頁切換（composables/codeGroups.js）
 */
/** 文章內文畫面外的區塊有 content-visibility: auto（見 style.css），未渲染的區塊只以估計高度佔位。
 * 跳到錨點時若沿用估計高度，捲過去後區塊才渲染撐開，標題會被推離目標位置（實測偏差達 600px）。
 * 跳轉前解除整篇的 content-visibility，讓位置以實際高度計算；首次載入仍保有延後排版的好處
 */
function revealFullContent() {
  document.documentElement.classList.add('is-content-revealed')
}

export default defineNuxtPlugin({
  name: 'vitepress-client',
  setup(nuxtApp) {
    const router = nuxtApp.$router

    /** 首次載入不播入場動畫，站內換頁的新內容才淡入（見 style.css 的 content-enter）。
     * 跳過首次的 page:finish：那時加上 class，已顯示的內文會符合選擇器而從透明重播一次。
     * 第一次站內換頁完成時加上，當下剛換上的內容開始淡入，之後插入的新內容也都會淡入
     */
    let pageFinishCount = 0
    nuxtApp.hook('page:finish', () => {
      pageFinishCount++
      if (pageFinishCount > 1)
        document.documentElement.classList.add('is-hydrated')
    })

    /** md 轉出的是原生 <a>，主題的導覽連結也是；攔截後改用 router 換頁，避免整頁重新載入 */
    window.addEventListener('click', (event) => {
      if (
        event.defaultPrevented
        || !(event.target instanceof Element)
        || event.target.closest('button')
        || event.button !== 0
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.metaKey
      ) {
        return
      }

      const link = event.target.closest('a')
      if (
        !link
        || link.closest('.vp-raw')
        || link.hasAttribute('download')
        || link.hasAttribute('target')
      ) {
        return
      }

      const linkHref = link.getAttribute('href')
      if (linkHref == null)
        return

      const { href, origin, pathname, hash, search } = new URL(linkHref, link.baseURI)
      const currentUrl = new URL(location.href)
      if (origin !== currentUrl.origin || !treatAsHtml(pathname))
        return

      if (hash)
        revealFullContent()

      /** 不是 Nuxt 頁面的站內網址（例如 public 下的靜態 html）交給瀏覽器 */
      const targetPath = `${pathname}${search}${hash}`
      if (router.resolve(targetPath).matched.length === 0)
        return

      event.preventDefault()

      const isSamePage = pathname === currentUrl.pathname && search === currentUrl.search
      if (!isSamePage) {
        router.push(targetPath)
        return
      }

      /** 同頁且 hash 相同：不重複推入歷史，直接捲動 */
      if (hash === currentUrl.hash) {
        if (!hash) {
          window.scrollTo(0, 0)
          return
        }
        const position = getHashScrollPosition(hash, link.classList.contains('header-anchor'))
        if (position)
          window.scrollTo(position)
        return
      }

      /** 點標題錨點用平滑捲動，實際捲動由 router.options.ts 的 scrollBehavior 處理 */
      if (link.classList.contains('header-anchor'))
        requestSmoothScroll()

      router.push(targetPath).then(() => {
        /** 與 VitePress 相同，仍發出 hashchange 讓主題或頁面能監聽 */
        window.dispatchEvent(new HashChangeEvent('hashchange', {
          oldURL: currentUrl.href,
          newURL: href,
        }))
      })
    }, { capture: true })

    /** 帶錨點直接開啟的網址，site-layout 會在內容載入後重新定位，同樣需要以實際高度計算 */
    if (location.hash)
      revealFullContent()

    /** 上一頁／下一頁回到帶錨點的網址時，同樣先讓整篇渲染再捲動 */
    window.addEventListener('popstate', () => {
      if (location.hash)
        revealFullContent()
    })

    initLinkPreload(nuxtApp, router)
    initCopyCode()
    initCodeGroups()

    if (import.meta.dev) {
      /** 開發時 HMR 後重設 code-group 為第一個分頁 */
      nuxtApp.hook('page:finish', () => {
        document.querySelectorAll('.vp-code-group > .blocks').forEach((blocksElement) => {
          Array.from(blocksElement.children).forEach((child) => {
            child.classList.remove('active')
          })
          blocksElement.children[0]?.classList.add('active')
        })
      })
    }
  },
})

/** 滑鼠移入或手指按下站內連結時，先載入目標頁的元件、頁面資料與 payload。
 *
 * md 與主題的連結都是原生 <a>，不會觸發 NuxtLink 的預載；換頁時又要依序等這三樣，
 * 比 VitePress 慢一拍。從移入到點下通常有一兩百毫秒，足夠把大部分請求做完。
 * 只在互動時預載，不像 VitePress 對視窗內所有連結預取，避免行動網路白載
 */
function initLinkPreload(nuxtApp: NuxtApp, router: Router) {
  const preloadedPathSet = new Set<string>()

  function preloadLink(event: Event) {
    if (!(event.target instanceof Element))
      return
    const link = event.target.closest('a')
    if (!link || link.hasAttribute('download') || link.hasAttribute('target'))
      return

    const linkHref = link.getAttribute('href')
    if (!linkHref || linkHref.startsWith('#'))
      return

    const { origin, pathname } = new URL(linkHref, link.baseURI)
    if (origin !== location.origin || pathname === location.pathname || preloadedPathSet.has(pathname))
      return
    // 整頁載入的 app 頁用不到 SPA 的預載
    if (isStandalonePath(pathname) || router.resolve(pathname).matched.length === 0)
      return

    preloadedPathSet.add(pathname)
    // 預載失敗（離線等）不影響點擊後的正常換頁，忽略即可
    preloadRouteComponents(pathname, router).catch(() => {})
    // 兩者內部用到 useState、useNuxtApp，事件處理函式不在 Nuxt context 內；
    // loadPayload 會與換頁時的載入共用同一個請求，不像 preloadPayload 重複抓
    nuxtApp.runWithContext(() => Promise.all([loadPageData(pathname), loadPayload(pathname)])).catch(() => {})
  }

  window.addEventListener('mouseover', preloadLink, { passive: true })
  window.addEventListener('touchstart', preloadLink, { passive: true })
}

function initCopyCode() {
  const timeoutIdMap = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

  window.addEventListener('click', (event) => {
    const button = event.target
    if (!(button instanceof HTMLElement) || !button.matches('div[class*="language-"] > button.copy'))
      return

    const parent = button.parentElement
    const codeElement = button.nextElementSibling?.nextElementSibling
    if (!parent || !codeElement)
      return

    const isShell = /language-(?:shellscript|shell|bash|sh|zsh)/.test(parent.className)
    const ignoredSelectorList = ['.vp-copy-ignore', '.diff.remove']

    /** 複製一份再移除不該被複製的節點 */
    const clone = codeElement.cloneNode(true) as HTMLElement
    clone.querySelectorAll(ignoredSelectorList.join(',')).forEach((node) => node.remove())

    let text = clone.textContent || ''
    if (isShell)
      text = text.replace(/^ *([$>]) /gm, '').trim()

    copyToClipboard(text).then(() => {
      button.classList.add('copied')
      clearTimeout(timeoutIdMap.get(button))
      const timeoutId = setTimeout(() => {
        button.classList.remove('copied')
        button.blur()
        timeoutIdMap.delete(button)
      }, 2000)
      timeoutIdMap.set(button, timeoutId)
    })
  })
}

async function copyToClipboard(text: string) {
  try {
    return await navigator.clipboard.writeText(text)
  }
  catch {
    /** 不支援 Clipboard API（例如非 https）時，退回 textarea + execCommand */
    const element = document.createElement('textarea')
    const previouslyFocusedElement = document.activeElement

    element.value = text
    // 避免行動裝置跳出鍵盤
    element.setAttribute('readonly', '')
    element.style.contain = 'strict'
    element.style.position = 'absolute'
    element.style.left = '-9999px'
    // 避免 iOS 自動放大
    element.style.fontSize = '12pt'

    const selection = document.getSelection()
    const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    document.body.appendChild(element)
    element.select()
    // iOS 需要明確指定選取範圍
    element.selectionStart = 0
    element.selectionEnd = text.length

    document.execCommand('copy')
    document.body.removeChild(element)

    if (selection && originalRange) {
      selection.removeAllRanges()
      selection.addRange(originalRange)
    }

    if (previouslyFocusedElement instanceof HTMLElement)
      previouslyFocusedElement.focus()
  }
}

function initCodeGroups() {
  window.addEventListener('click', (event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.matches('.vp-code-group input'))
      return

    // input <- .tabs <- .vp-code-group
    const group = input.parentElement?.parentElement
    if (!group)
      return

    const index = Array.from(group.querySelectorAll('input')).indexOf(input)
    if (index < 0)
      return

    const blocksElement = group.querySelector('.blocks')
    if (!blocksElement)
      return

    const currentBlock = Array.from(blocksElement.children).find((child) => child.classList.contains('active'))
    if (!currentBlock)
      return

    const nextBlock = blocksElement.children[index]
    if (!nextBlock || currentBlock === nextBlock)
      return

    currentBlock.classList.remove('active')
    nextBlock.classList.add('active')

    const label = group.querySelector(`label[for="${input.id}"]`)
    label?.scrollIntoView({ block: 'nearest' })
  })
}
