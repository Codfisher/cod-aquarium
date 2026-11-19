import { getScrollOffset } from '#vp'

/** 下一次錨點捲動是否用平滑捲動，點擊標題錨點（.header-anchor）時由連結攔截設定 */
let isSmoothScrollRequested = false

export function requestSmoothScroll() {
  isSmoothScrollRequested = true
}

/** 取出並重設平滑捲動請求 */
export function consumeSmoothScrollRequest(): boolean {
  const result = isSmoothScrollRequested
  isSmoothScrollRequested = false
  return result
}

/** 以 id 找錨點目標；hash 可能含百分比編碼或非法字元，失敗時回傳 null */
export function getHashTarget(hash: string): HTMLElement | null {
  try {
    return document.getElementById(decodeURIComponent(hash).slice(1))
  }
  catch (error) {
    console.warn(error)
    return null
  }
}

/** 錨點目標的捲動位置，與 VitePress scrollTo 相同：扣掉導覽列高度、加回目標的 padding-top。
 * 平滑捲動只在距離小於一個畫面高時使用，太遠直接跳
 */
export function getHashScrollPosition(hash: string, isSmooth = false): ScrollToOptions | undefined {
  const target = getHashTarget(hash)
  if (!target)
    return undefined

  const targetPadding = Number.parseInt(window.getComputedStyle(target).paddingTop, 10) || 0
  const targetTop = window.scrollY
    + target.getBoundingClientRect().top
    - getScrollOffset()
    + targetPadding

  const shouldSmooth = isSmooth && Math.abs(targetTop - window.scrollY) <= window.innerHeight
  return {
    left: 0,
    top: targetTop,
    behavior: shouldSmooth ? 'smooth' : 'instant',
  }
}
