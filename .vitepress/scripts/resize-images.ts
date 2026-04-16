import fs from 'node:fs'
import path from 'node:path'
import { map, pipe } from 'remeda'
import sharp from 'sharp'

const IMAGE_PATH = path.resolve(__dirname, '../../content/public')
const OUTPUT_PATH = path.resolve(__dirname, '../../.vitepress/dist')

const IGNORE_NAME_LIST = [
  'favicon',
]
const IGNORE_PATH_LIST = [
  'public/memes/',
  'public/assets/',
  'public/codstack/',
  'public/hexazen/',
]
const WIDTH_LIST = [700, 300]
const SUFFIX_NAME_LIST = ['.png', '.jpg', '.jpeg', '.webp']

// 是否為資料夾
function isDirectory(path: string) {
  return fs.lstatSync(path).isDirectory()
}

/** 取得所有圖片路徑 */
function getImagePathList(dirPath: string) {
  const files = fs.readdirSync(dirPath)
  const result: string[] = []

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const isDir = isDirectory(filePath)

    if (isDir) {
      const relativePath = path.relative(path.resolve(__dirname, '../..'), filePath).replace(/\\/g, '/')
      const isIgnoredPath = IGNORE_PATH_LIST.some(
        (ignorePath) => relativePath.includes(ignorePath.replace(/\/$/, '')),
      )

      if (!isIgnoredPath) {
        result.push(...getImagePathList(filePath))
      }
      continue
    }

    if (IGNORE_NAME_LIST.some((name) => file.includes(name))) {
      continue
    }

    const suffix = path.extname(file)
    if (!SUFFIX_NAME_LIST.includes(suffix)) {
      continue
    }

    result.push(filePath)
  }

  return result
}

export async function generateImages() {
  /** 取得所有圖片 */
  const imgList = getImagePathList(IMAGE_PATH)
  console.log(`[ generateImages ] 找到 ${imgList.length} 張圖片`)

  // 產生對應寬度圖片至 .vitepress/dist，檔名後面加上寬度
  for (const imgPath of imgList) {
    const img = fs.readFileSync(imgPath)
    const relativePath = imgPath.replace(IMAGE_PATH, '')
    const parsed = path.parse(relativePath)
    const filePath = path.join(parsed.dir, parsed.name)

    try {
      const tasks = pipe(
        WIDTH_LIST,
        map((width) => {
          const outputPath = path.join(
            OUTPUT_PATH,
            `${filePath}-${width}.webp`,
          )

          return sharp(img)
            .resize({ width })
            .sharpen({ sigma: 0.5 })
            .webp({ quality: 80, effort: 6 })
            .toFile(outputPath)
        }),
        // 輸出一張原圖 quality 60 版本
        (list) => {
          const outputPath = path.join(
            OUTPUT_PATH,
            `${filePath}.webp`,
          )

          list.push(sharp(img)
            .webp({ quality: 80, effort: 6 })
            .toFile(outputPath))

          return list
        },
      )

      await Promise.all(tasks)
    }
    catch (error) {
      console.error(`[ generateImages ] 圖片 ${imgPath} 產生失敗 :`, error)
    }
  }

  // 清理 sharp 的 libvips 執行緒池與快取，避免 process 無法退出
  sharp.cache(false)

  console.log(`[ generateImages ] 產生完成`)
}
