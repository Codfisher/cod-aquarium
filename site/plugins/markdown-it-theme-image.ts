import type MarkdownIt from 'markdown-it'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { imageSize } from 'image-size'
import { map, pipe } from 'remeda'
import { CONTENT_PUBLIC_DIR } from '../constants'

/** 不是 md 文章會引用的大型圖庫，不掃描尺寸 */
/** readdirSync 在 Windows 回傳反斜線路徑，兩種分隔符都要比對 */
const IGNORE_DIR_RE = /^(?:memes|meme-posters|meme-sprites|assets|codstack|hexazen|og)[\\/]/
const IMAGE_FILE_RE = /\.(?:webp|png|jpe?g|gif|avif)$/i

export type ImageSizeMap = Map<string, { width: number; height: number }>

/** 讀出 content/public 底下每張圖的實際尺寸，key 為站內路徑（例如 /cover.webp）。新增圖片後要重開 dev server 才會讀到。
 *
 * 用 image-size（只讀檔頭的純 JS）而不用 sharp：sharp 若在 build 程序先載入，
 * Nitro 預先渲染時 ipx 再載入自己那份 sharp 會失敗（Could not load the "sharp" module），圖片全部回 500
 */
export function getImageSizeMap(): ImageSizeMap {
  const fileList = readdirSync(CONTENT_PUBLIC_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((file) => IMAGE_FILE_RE.test(file) && !IGNORE_DIR_RE.test(file))
  const entryList = fileList.map((file) => {
    try {
      const { width, height } = imageSize(readFileSync(path.join(CONTENT_PUBLIC_DIR, file)))
      if (!width || !height)
        return undefined
      return [`/${file.split(path.sep).join('/')}`, { width, height }] as const
    }
    catch {
      return undefined
    }
  })
  return new Map(entryList.filter((entry) => entry !== undefined))
}

/** md 圖片在文章欄內隨版面縮放，最寬 688px。
 * 每個寬度都要帶斷點前綴：Nuxt Image 會把沒有前綴的 100vw 算成寬度 1（產生 w_1 的網址）
 */
const CONTENT_IMAGE_SIZES = 'xs:100vw sm:100vw md:688px'

/** 站內且原圖存在才交給 Nuxt Image。
 * 草稿的封面常常還沒做，原圖不存在時 ipx 會回 IPX_FILE_NOT_FOUND，讓預先渲染整個失敗；外部網址也不經 ipx
 */
function isOptimizableImage(src: string) {
  // GIF 交給 ipx 轉換會只剩第一格，動畫消失
  if (!src.startsWith('/') || /\.gif$/i.test(src))
    return false

  try {
    return existsSync(path.join(CONTENT_PUBLIC_DIR, decodeURIComponent(src)))
  }
  catch {
    return false
  }
}

/** 將 md 的圖片轉成 theme-image 元件（Nuxt Image 產生響應式尺寸與 webp，見 web/components/theme-image.vue） */
export function markdownItThemeImage(md: MarkdownIt, imageSizeMap: ImageSizeMap) {
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx]
    if (!token) {
      return ''
    }

    const getAttrList = () => pipe(
      token.attrs ?? [],
      map(([key, value]) => {
        if (key === 'alt') {
          return `alt="${token.content}"`
        }

        return `${key}="${value}"`
      }),
    )

    const src = token.attrGet('src') ?? ''

    /** 補上原圖的實際尺寸，圖片載入前就依比例預留空間。
     * 首次繪製比圖片早時（關鍵 CSS 內嵌後 FCP 約提前 0.4 秒），沒預留空間的圖片一到就把下方內容推開（首頁封面曾造成 CLS 0.09）。
     * md 已寫了 width 或 height 的保持原樣
     */
    const imageSize = (() => {
      try {
        return imageSizeMap.get(decodeURIComponent(src))
      }
      catch {
        return undefined
      }
    })()
    /** 作者在 md 明確寫了寬度的圖片，以那個寬度輸出單一尺寸，不套用隨欄寬縮放的 sizes */
    const hasAuthorSize = !!token.attrGet('width') || !!token.attrGet('sizes')
    if (imageSize && !token.attrGet('width') && !token.attrGet('height')) {
      token.attrSet('width', String(imageSize.width))
      token.attrSet('height', String(imageSize.height))
    }
    const attrList = getAttrList()
    if (!isOptimizableImage(src)) {
      // md 已寫了 loading、decoding 就不再補，重複的屬性會讓 Vue 編譯失敗
      const defaultAttrList = [
        token.attrGet('loading') ? undefined : 'loading="lazy"',
        token.attrGet('decoding') ? undefined : 'decoding="async"',
      ].filter((item) => item !== undefined)
      /** src 改用 :src 綁定字串：Vue 的資源網址轉換會把靜態的絕對路徑 src 轉成模組匯入，原圖不存在時 build 直接失敗 */
      const plainAttrList = attrList.map((attr) => attr.startsWith('src="')
        ? `:src="'${attr.slice(5, -1).replace(/'/g, '\\\'')}'"`
        : attr)
      return ['<img', ...plainAttrList, ...defaultAttrList, '/>'].join(' ')
    }

    return [
      `<theme-image`,
      ...attrList,
      ...(hasAuthorSize ? [] : [`sizes="${CONTENT_IMAGE_SIZES}"`]),
      `/>`,
    ].join(' ')
  }
}
