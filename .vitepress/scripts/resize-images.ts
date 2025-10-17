import fs from 'node:fs'
import path from 'node:path'
import { map, pipe } from 'remeda'
import sharp from 'sharp'

const IMAGE_PATH = path.resolve(__dirname, '../../content/public')
const OUTPUT_PATH = path.resolve(__dirname, '../../.vitepress/dist')

const IGNORE_NAME_LIST = [
  'favicon',
  // meme 檔案固定開頭
  'meme-',
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
    console.log('🚀 ~ file:', file)
    const filePath = path.join(dirPath, file)
    const isDir = isDirectory(filePath)

    if (isDir) {
      result.push(...getImagePathList(filePath))
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
    const filePath = imgPath.replace(IMAGE_PATH, '').split('.')[0]

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
            .webp({ quality: 90 })
            .toFile(outputPath)
        }),
        // 輸出一張原圖 quality 90 版本
        (list) => {
          const outputPath = path.join(
            OUTPUT_PATH,
            `${filePath}.webp`,
          )

          list.push(
            sharp(img)
              .webp({ quality: 90 })
              .toFile(outputPath),
          )

          return list
        },
      )

      await Promise.all(tasks)
    }
    catch (error) {
      console.error(`[ generateImages ] 圖片 ${imgPath} 產生失敗 :`, error)
    }
  }

  console.log(`[ generateImages ] 產生完成`)
}
