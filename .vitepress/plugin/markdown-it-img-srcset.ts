import type { RequiredDeep } from 'type-fest'
import type { UserConfig } from 'vitepress'
import path from 'node:path'
import { pipe } from 'remeda'
import sharp from 'sharp'
import { then } from '../../common/remeda'

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

async function generateSrcset(src: string) {
  const srcset: string[] = []

  // 從 /content/public 讀取原始圖片的寬度
  const originalWidth = await pipe(
    path.join(IMAGE_PATH, src),
    (value) => sharp(value).metadata(),
    then((metadata) => metadata.width),
  )
  if (!originalWidth) {
    throw new Error(`無法取得目標圖片 width: ${src}`)
  }
  console.log('🚀 ~ originalWidth:', originalWidth)

  // 根據 Tailwind 的斷點生成不同尺寸的圖片
  Object.keys(tailwindBreakpoints).forEach((breakpoint) => {
    const width = tailwindBreakpoints[breakpoint]
    const size = Math.min(width, originalWidth) // 保證不超過原始圖片的寬度
    const resizedImagePath = src.replace(path.extname(src), `-${size}${path.extname(src)}`)

    // 假設生成了新的圖片，並將其加入 srcset
    srcset.push(`${resizedImagePath} ${size}w`)
  })

  return srcset.join(', ')
}

/** https://vitepress.dev/guide/markdown#advanced-configuration */
export function markdownItImgSrcset(md: MarkdownIt) {
  md.renderer.rules.image = async (tokens, idx) => {
    const token = tokens[idx]
    const imagePath = token.attrGet('src')
    if (!imagePath) {
      return ''
    }

    const srcset = await generateSrcset(imagePath)
    console.log('🚀 ~ srcset:', srcset)

    return ''
  }
}
