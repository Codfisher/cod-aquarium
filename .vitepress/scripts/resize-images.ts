import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const IMAGE_PATH = path.resolve(__dirname, '../../content/public')

const IGNORE_NAME_LIST = [
  'favicon',
]
const WIDTH_LIST = [1024, 640, 320, 160]

// 是否為資料夾
function isDirectory(path: string) {
  return fs.lstatSync(path).isDirectory()
}

const SUFFIX_NAME_LIST = ['.png', '.jpg', '.jpeg', '.webp']
/** 取得所有圖片路徑 */
function getImagePathList(dirPath: string) {
  const files = fs.readdirSync(dirPath)
  const result: string[] = []

  for (const file of files) {
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
    const imgName = path.basename(imgPath)
    const imgDir = path.dirname(imgPath)

    try {
      for (const width of WIDTH_LIST) {
        const outputPath = path.resolve(
          __dirname,
          `../../.vitepress/dist/public/${imgName}-${width}`,
        )

        await sharp(img).resize({ width }).toFile(outputPath)
      }
    }
    catch (error) {
      console.error(`[ generateImages ] 圖片 ${imgPath} 產生失敗 :`, error)
    }
  }

  console.log(`[ generateImages ] 產生完成`)
}
