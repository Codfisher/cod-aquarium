/**
 * 從彩色貼圖推導法線，讓沒有 PBR 的材質包也立體得起來
 *
 * 附法線的 Minecraft 資源包幾乎清一色是 All Rights Reserved——
 * 掃過 Modrinth 上所有標著 pbr、labpbr、normal-map 的包，
 * 授權乾淨的只有現成已經在用的那兩套。想再多幾套立體的，
 * 只能自己算。
 *
 * 算法本身很老：把貼圖的明度當成高度，相鄰像素的落差就是斜率，
 * 斜率一有就解得出表面朝哪邊。這對像素風的方塊貼圖特別合用，
 * 因為那些圖本來就是「亮的地方凸、暗的地方凹」畫出來的——
 * 磚縫是暗的，木紋的溝是暗的，石頭上的坑也是暗的。
 * 把畫在圖上的明暗還原成真的凹凸之後，那些溝會隨太陽移動改變明暗。
 *
 * 這是衍生著作，不是新素材：來源就是各材質包自己的圖，
 * 授權跟著原包走（CC-BY 4.0，允許改作）。
 *
 * 用法：node scripts/derive-normal-map.mjs
 */

import { Buffer } from 'node:buffer'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const assetRoot = join(projectRoot, 'content/public/assets')

/**
 * 哪幾套要算，以及凹凸要多深
 *
 * strength 是把明度落差放大幾倍，要照著貼圖的性質給：
 * 一格十六像素的像素畫，相鄰兩格的明度動輒差上三成，放大一點就足夠；
 * 解析度高、筆觸連續的那種，相鄰像素幾乎一樣亮，不放大就等於全平。
 *
 * 只剩細描一套，這是挑過的結果而不是還沒做完。
 * 齊整與蠟筆都推過，兩套都退回去了——不是算得不對，是不該算：
 * 齊整賣的是「每一格都在該在的位置」那種乾淨到潔癖的平整，
 * 蠟筆賣的是「這是人用手畫的」，而一張畫本來就沒有厚度。
 * 推一層凹凸上去，等於把兩者最想給的東西各自蓋掉。
 *
 * 細描不一樣：它的每一格塞滿了石頭的裂紋與木板的節疤，
 * 那些細節本來就是「畫上去的凹凸」，還原成真的凹凸剛好
 */
const PACK_LIST = [
  { dir: 'minecraft-pixel-perfection', strength: 1.6 },
]

/**
 * 高光的範圍
 *
 * 這些材質包沒有粗糙度可用，只能從明度推：亮的地方通常是
 * 磨過、濕過或本來就光滑的表面。但推歸推，範圍要壓得很窄——
 * 開太大整個世界會像上了一層漆
 */
const SPECULAR_FLOOR = 24
const SPECULAR_RANGE = 56

/** 授權說明裡那一段的標題，同時也是「補過了沒」的記號 */
const DERIVED_CREDIT_HEADING = '── 法線（_n）與高光（_s）──'

/** 明度。綠色佔最多是因為人眼對綠最敏感，這組係數是 Rec. 601 的 */
function measureLuminance(data, index) {
  return (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255
}

/**
 * 把一張彩色貼圖推成法線與高光
 *
 * 邊界用環繞而不是夾住：方塊貼圖是無縫平鋪的，
 * 最右邊那一行的右鄰居就是最左邊那一行。夾住的話
 * 每一格方塊的四邊都會多出一圈假的平面，並排起來就是一格一格的框
 */
async function deriveMap(sourcePath, strength) {
  const image = sharp(sourcePath)
  const { width, height } = await image.metadata()
  const data = await image.ensureAlpha().raw().toBuffer()

  const normal = Buffer.alloc(width * height * 3)
  const specular = Buffer.alloc(width * height)

  const at = (x, y) => {
    const wrappedX = ((x % width) + width) % width
    const wrappedY = ((y % height) + height) % height
    const index = (wrappedY * width + wrappedX) * 4
    /**
     * 透明的地方一律當成中間高度
     *
     * 鏤空貼圖的透明處沒有顏色可言，照樣讀進來只會得到黑，
     * 於是每一片葉子的輪廓外都圍著一圈陡坡
     */
    return data[index + 3] < 128 ? 0.5 : measureLuminance(data, index)
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const deltaX = (at(x + 1, y) - at(x - 1, y)) * strength
      const deltaY = (at(x, y + 1) - at(x, y - 1)) * strength

      /**
       * 走 NormalGL 而不是 NormalDX
       *
       * 兩者只差在綠色通道的正負，而 Babylon 讀的是 GL 那一套。
       * 選錯的話所有凹凸會上下顛倒：磚縫變成凸起的稜線
       */
      const length = Math.hypot(-deltaX, deltaY, 1)
      const target = (y * width + x) * 3
      normal[target] = Math.round((-deltaX / length * 0.5 + 0.5) * 255)
      normal[target + 1] = Math.round((deltaY / length * 0.5 + 0.5) * 255)
      normal[target + 2] = Math.round((1 / length * 0.5 + 0.5) * 255)

      specular[y * width + x] = Math.round(SPECULAR_FLOOR + at(x, y) * SPECULAR_RANGE)
    }
  }

  return { normal, specular, width, height }
}

async function main() {
  let total = 0

  for (const { dir, strength } of PACK_LIST) {
    const packDir = join(assetRoot, dir)
    if (!existsSync(packDir)) {
      throw new Error(`找不到材質包資料夾：${dir}`)
    }

    const fileList = (await readdir(packDir))
      .filter((name) => name.endsWith('.png'))
      /** 已經是法線或高光的不要再推一次 */
      .filter((name) => !name.endsWith('_n.png') && !name.endsWith('_s.png'))

    for (const name of fileList) {
      const base = name.slice(0, -4)
      const { normal, specular, width, height } = await deriveMap(join(packDir, name), strength)

      await sharp(normal, { raw: { width, height, channels: 3 } })
        .png()
        .toFile(join(packDir, `${base}_n.png`))
      await sharp(specular, { raw: { width, height, channels: 1 } })
        .png()
        .toFile(join(packDir, `${base}_s.png`))
      total++
    }

    writeDerivedCredit(packDir, strength)
    console.log(`${dir.padEnd(28)} 推出 ${fileList.length} 組（強度 ${strength}）`)
  }

  console.log(`\n共 ${total} 組法線與高光`)
}

/**
 * 在原本的出處說明後面補一段
 *
 * 這些 _n 與 _s 不是原作者做的，是從他的圖算出來的。
 * 授權跟著原包走，但要講清楚哪些是後來加的，
 * 免得日後有人以為原包就附了 PBR
 */
function writeDerivedCredit(packDir, strength) {
  const creditPath = join(packDir, 'credit.txt')
  if (!existsSync(creditPath)) {
    return
  }

  /** 這支腳本會重跑，附註只補一次 */
  if (readFileSync(creditPath, 'utf8').includes(DERIVED_CREDIT_HEADING)) {
    return
  }

  appendFileSync(creditPath, [
    '',
    DERIVED_CREDIT_HEADING,
    '',
    '這兩種圖不在原始資源包裡，是由上述彩色貼圖推導而成：',
    `把明度當成高度、取相鄰像素的落差求斜率（強度 ${strength}）。`,
    '屬於原作品的衍生著作，授權與上述相同。',
    '',
    '由 scripts/derive-normal-map.mjs 產生。',
    '',
  ].join('\n'), 'utf8')
}

await main()
