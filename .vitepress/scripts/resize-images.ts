import fs from 'node:fs'
import path from 'node:path'

const IMAGE_PATH = path.resolve(__dirname, '../../content/public')

const IGNORE_NAME_LIST = [
  'favicon',
]

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
  console.log('🚀 ~ IMAGE_PATH:', IMAGE_PATH)

  /** 取得所有圖片 */
  const imgList = getImagePathList(IMAGE_PATH)
  console.log('🚀 ~ imgList:', imgList)
}
