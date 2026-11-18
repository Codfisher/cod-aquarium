/**
 * 產生快取梗圖的社群分享縮圖。
 *
 * 各平台的預覽卡片比例不同，統一一張正方形會被裁切或縮成小卡：
 * - 1200×630（1.91:1）：og:image，FB、LINE、Threads、Discord、Slack、LinkedIn、WhatsApp 通用
 * - 1200×675（16:9）：twitter:image，X 的大圖卡
 * - 1200×900（4:3）、1200×1200（1:1）：連同 16:9 放進結構化資料，Google 建議三種比例都提供
 *
 * 輸出 JPEG 而非 WebP：部分 Slack、Discord 用戶端讀不了 WebP 預覽圖；WhatsApp 要求 600 KB 以下，壓在 300 KB 內較保險。
 *
 * 圖上有中文字，必須在裝有 Noto Sans TC 的本機執行後 commit 產物。
 * Cloudflare 的 Linux 建置環境沒有中文字型，在 build 時產生字會變成方塊。
 *
 * 執行：npm run task:generate-meme-og
 */
import { Buffer } from 'node:buffer'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC_DIR = resolve(ROOT_DIR, 'content/public')
const OUTPUT_DIR = resolve(PUBLIC_DIR, 'og')

/** 插圖本身的底色，背景與它一致才看不出接縫 */
const BACKGROUND_COLOR = '#FFF6E5'
const TITLE_COLOR = '#2B2B2B'
/** 站上 --vp-c-brand-1 的近似值 */
const ACCENT_COLOR = '#0B8A77'
const DESCRIPTION_COLOR = '#5C5650'
const FONT_FAMILY = '\'Noto Sans TC\', \'Microsoft JhengHei\', sans-serif'
const JPEG_SIZE_LIMIT = 300 * 1024

/** 辨識度高、圖中有台詞的梗圖，拼貼用 */
const FEATURED_MEME_FILE_LIST = [
  'meme-59b7afe3-4b37-4fd5-9b09-2ec78fdf6fd8.webp', // 章魚哥：這工作真是超爛的
  'meme-28f8cd6c-9e57-4eff-985d-7a8245549d73.webp', // 貓：大家趁熱吃吧
  'meme-671dac30-ae2b-4fb5-a672-256d6fab4fa2.webp', // 球我鴨
  'meme-d2de0e36-7cc7-459a-ba66-1dd5425f6af4.webp', // 割貢
]

interface Box {
  left: number;
  top: number;
  size: number;
}

interface OgLayout {
  name: string;
  width: number;
  height: number;
  /** 文字區塊左上角 */
  text: { left: number; top: number; titleSize: number };
  mascot: Box;
  tileList: Box[];
}

/** 2×2 拼貼的四個格子 */
function createTileGrid(left: number, top: number, tileSize: number, gap: number): Box[] {
  return [0, 1, 2, 3].map((index) => ({
    left: left + (index % 2) * (tileSize + gap),
    top: top + Math.floor(index / 2) * (tileSize + gap),
    size: tileSize,
  }))
}

/** 各行文字的字級與行距，排版與量高度共用，避免兩邊算的不一樣 */
function getTextLineList(titleSize: number) {
  const subtitleSize = Math.round(titleSize * 0.48)
  const descriptionSize = Math.round(titleSize * 0.3)

  return [
    { text: '快取梗圖', size: titleSize, color: TITLE_COLOR, weight: 900, gap: 0 },
    { text: '梗圖搜尋器', size: subtitleSize, color: ACCENT_COLOR, weight: 900, gap: 20 },
    { text: '只記得畫面或台詞也找得到', size: descriptionSize, color: DESCRIPTION_COLOR, weight: 500, gap: 28 },
    { text: '收錄上千張梗圖・免費使用', size: descriptionSize, color: DESCRIPTION_COLOR, weight: 500, gap: 12 },
  ]
}

/** 文字區塊底緣的 y 座標，留白取一點字級避免下伸部碰到下方物件 */
function getTextBottom(top: number, titleSize: number): number {
  const lineList = getTextLineList(titleSize)
  const lastLine = lineList.at(-1)
  return top + lineList.reduce((sum, line) => sum + line.gap + line.size, 0) + Math.round((lastLine?.size ?? 0) * 0.4)
}

/** 橫向（含 4:3）：左文字與吉祥物、右拼貼 */
function createLandscapeLayout(name: string, width: number, height: number): OgLayout {
  const gap = 16
  const margin = 48
  // 拼貼最多佔一半寬，4:3 這種偏高的比例才不會擠到文字
  const tileSize = Math.round(Math.min((height - margin * 2 - gap) / 2, (width / 2 - gap) / 2))
  const gridSize = tileSize * 2 + gap
  const titleSize = 104
  const textTop = Math.round(height * 0.16)
  const textBottom = getTextBottom(textTop, titleSize)
  const mascotSize = Math.min(height - textBottom, 460)

  return {
    name,
    width,
    height,
    text: { left: 64, top: textTop, titleSize },
    mascot: { left: 24, top: height - mascotSize, size: mascotSize },
    tileList: createTileGrid(width - gridSize - margin, Math.round((height - gridSize) / 2), tileSize, gap),
  }
}

/** 方形：上文字、右下拼貼、左下吉祥物 */
function createSquareLayout(name: string, size: number): OgLayout {
  const gap = 20
  const margin = 64
  const titleSize = 112
  const textTop = 72
  const gridTop = getTextBottom(textTop, titleSize) + 24
  const tileSize = Math.round((size - gridTop - margin - gap) / 2)
  const gridSize = tileSize * 2 + gap
  const gridLeft = size - gridSize - margin
  const mascotSize = Math.min(gridLeft, 420)

  return {
    name,
    width: size,
    height: size,
    text: { left: 72, top: textTop, titleSize },
    mascot: { left: 8, top: size - mascotSize - 16, size: mascotSize },
    tileList: createTileGrid(gridLeft, gridTop, tileSize, gap),
  }
}

const LAYOUT_LIST: OgLayout[] = [
  createLandscapeLayout('meme-cache-1200x630', 1200, 630),
  createLandscapeLayout('meme-cache-1200x675', 1200, 675),
  createLandscapeLayout('meme-cache-1200x900', 1200, 900),
  createSquareLayout('meme-cache-1200x1200', 1200),
]

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function createTextSvg(layout: OgLayout): Buffer {
  const { left, top, titleSize } = layout.text

  let baseline = top
  const textElementList = getTextLineList(titleSize).map((line) => {
    baseline += line.gap + line.size
    return `<text x="${left}" y="${baseline}" font-family="${FONT_FAMILY}" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}">${escapeXml(line.text)}</text>`
  })

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">${textElementList.join('')}</svg>`,
  )
}

/** 圓角梗圖格，外圍加白框讓它從底色浮起來 */
async function createTile(file: string, size: number): Promise<Buffer> {
  const border = Math.round(size * 0.025)
  const radius = Math.round(size * 0.08)
  const innerSize = size - border * 2

  const image = await sharp(resolve(PUBLIC_DIR, 'memes', file), { animated: false })
    .resize(innerSize, innerSize, { fit: 'cover' })
    .composite([{
      input: Buffer.from(`<svg width="${innerSize}" height="${innerSize}"><rect width="${innerSize}" height="${innerSize}" rx="${radius - border}" fill="#fff"/></svg>`),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`) },
      { input: image, left: border, top: border },
    ])
    .png()
    .toBuffer()
}

async function generateOgImage(layout: OgLayout) {
  const mascot = await sharp(resolve(PUBLIC_DIR, 'meme-cache.webp'))
    .resize(layout.mascot.size, layout.mascot.size)
    .png()
    .toBuffer()
  const tileImageList = await Promise.all(
    layout.tileList.map((tile, index) => createTile(FEATURED_MEME_FILE_LIST[index] ?? FEATURED_MEME_FILE_LIST[0]!, tile.size)),
  )

  const outputPath = resolve(OUTPUT_DIR, `${layout.name}.jpg`)
  await sharp({
    create: { width: layout.width, height: layout.height, channels: 3, background: BACKGROUND_COLOR },
  })
    .composite([
      { input: mascot, left: layout.mascot.left, top: layout.mascot.top },
      ...tileImageList.map((input, index) => ({
        input,
        left: layout.tileList[index]!.left,
        top: layout.tileList[index]!.top,
      })),
      { input: createTextSvg(layout), left: 0, top: 0 },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(outputPath)

  const fileSize = statSync(outputPath).size
  const sizeText = `${Math.round(fileSize / 1024)} KB`
  if (fileSize > JPEG_SIZE_LIMIT) {
    console.error(`❌ ${layout.name}.jpg ${sizeText}，超過 ${JPEG_SIZE_LIMIT / 1024} KB`)
    process.exitCode = 1
    return
  }
  console.log(`✅ ${layout.name}.jpg ${sizeText}`)
}

mkdirSync(OUTPUT_DIR, { recursive: true })
for (const layout of LAYOUT_LIST) {
  await generateOgImage(layout)
}
