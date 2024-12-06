import type { RequiredDeep } from 'type-fest'
import type { UserConfig } from 'vitepress'
import path from 'node:path'

const IMAGE_PATH = path.resolve(__dirname, '../../content/public')

type MarkdownIt = Parameters<
  RequiredDeep<
    UserConfig['markdown']
  >['config']
>[0]

// Tailwind 斷點寬度，這裡可以根據需要調整
const tailwindBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
}

function getSrcset(src: string) {
  const srcset: string[] = []

  // 從 /content/public 讀取原始圖片的寬度
  // const originalWidth = await pipe(
  //   path.join(IMAGE_PATH, src),
  //   (value) => sharp(value).metadata(),
  //   then((metadata) => metadata.width),
  // )
  // if (!originalWidth) {
  //   throw new Error(`無法取得目標圖片 width: ${src}`)
  // }
  // console.log('🚀 ~ originalWidth:', originalWidth)

  // 根據 Tailwind 的斷點生成不同尺寸的圖片
  Object.keys(tailwindBreakpoints).forEach((breakpoint) => {
    const width = tailwindBreakpoints[breakpoint]
    const size = width
    const resizedImagePath = src.replace(path.extname(src), `-${size}${path.extname(src)}`)

    // 假設生成了新的圖片，並將其加入 srcset
    srcset.push(`${resizedImagePath} ${size}w`)
  })

  return srcset.join(', ')
}

/** FIX: rollup 在建構時會自動 import src，但是因為圖片還沒產生，所以會導致錯誤 */
async function generateImages(src: string) {
  // 從 /content/public 讀取原始圖片的寬度
  const filePath = path.join(IMAGE_PATH, src)
  console.log('🚀 ~ filePath:', filePath)
}

/**
 * https://vitepress.dev/guide/markdown#advanced-configuration
 *
 * @param md
 * @param mode 用於判斷是否為開發模式，dev 不產生 srcset
 */
export function markdownItImgSrcset(md: MarkdownIt, mode: string) {
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx]
    const imagePath = token.attrGet('src')
    if (!imagePath) {
      return ''
    }

    if (mode.includes('dev')) {
      return [
        `<img`,
        `src="${imagePath}"`,
        `alt="${token.content}"`,
        `loading="lazy"`,
        `decoding="async"`,
        `>`,
      ].join(' ')
    }

    try {
      const srcset = getSrcset(imagePath)
      // 非開發模式才產生圖片
      if (!mode.includes('dev')) {
        generateImages(imagePath)
      }

      return [
        `<img`,
        `src="${imagePath}"`,
        `alt="${token.content}"`,
        `srcset="${srcset}"`,
        `sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"`,
        `loading="lazy"`,
        `decoding="async"`,
        `>`,
      ].join(' ')
    }
    catch (err) {
      console.error(`Error processing image: ${err.message}`)

      return [
        `<img`,
        `src="${imagePath}"`,
        `alt="${token.content}"`,
        `loading="lazy"`,
        `decoding="async"`,
        `>`,
      ].join(' ')
    }
  }
}
