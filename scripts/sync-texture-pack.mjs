/**
 * 把外部材質包的貼圖搬進 content/public/assets
 *
 * minespace 的材質包對照表（domains/block/texture-pack.ts）決定要哪些檔案，
 * 這支腳本照著那份表去材質包裡撿，只撿用得到的那一百多張——
 * 完整的包動輒兩三千個檔案，其中九成五這個世界永遠不會畫到。
 *
 * 撿完之後順手寫出 texture-pack-manifest.ts：
 * 哪一套有哪些圖、哪些附了法線，執行期照著這份清單決定要不要退回原版，
 * 一個 404 都不會發出去。
 *
 * 用法：node scripts/sync-texture-pack.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { downloadZip, readZipEntry } from './read-zip.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const assetRoot = join(projectRoot, 'content/public/assets')
const texturePackPath = join(projectRoot, 'content/aquarium/minespace/domains/block/texture-pack.ts')
const manifestPath = join(projectRoot, 'content/aquarium/minespace/domains/block/texture-pack-manifest.ts')

/**
 * 要同步的材質包
 *
 * 兩套都是授權可以隨專案一起散布的：
 * Excalibur - justPBR 是 CC-BY 4.0，Bare Bones PBR 是 MIT。
 * 換成別套之前務必先確認授權，非商業或保留全部權利的包不能簽進 repo
 */
const PACK_LIST = [
  {
    name: 'Excalibur - justPBR',
    /** 只有法線與高光，彩色圖沿用原版那一套 */
    outputDir: 'minecraft-pbr',
    withDiffuse: false,
    url: 'https://cdn.modrinth.com/data/Pn3cui3D/versions/wgiv5f0A/Excalibur_justPBR_V1.21.1.zip',
    credit: [
      'Excalibur - justPBR',
      '-------------------',
      '',
      '法線（_n）與高光（_s）貼圖來源：',
      'Excalibur - justPBR',
      'https://modrinth.com/resourcepack/excalibur-justpbr',
      '',
      '授權：CC-BY-4.0（姓名標示 4.0 國際）',
      'https://creativecommons.org/licenses/by/4.0/',
      '',
      '此處只收錄 minespace 用得到的貼圖，檔案內容未經修改。',
      '彩色貼圖本身不在此資料夾，沿用 /assets/minecraft/textures/block。',
      '',
      '本資料夾由 scripts/sync-texture-pack.mjs 產生。',
    ].join('\n'),
  },
  {
    name: 'rE-oCd',
    /**
     * 只有彩色圖
     *
     * 這一套的賣點是把原版每一格對齊、清乾淨，是純粹的重繪。
     * 刻意不給它法線：法線是照原版的像素位置畫的，
     * 而 oCd 動過的正是那些位置，硬套上去凹凸會對不準紋路
     */
    outputDir: 'minecraft-ocd',
    withDiffuse: true,
    url: 'https://cdn.modrinth.com/data/lkoaSYls/versions/CBZsB4cr/rE-oCd-262.zip',
    credit: [
      'rE-oCd',
      '------',
      '',
      '彩色貼圖來源：',
      'rE-oCd（FVDisco 的 oCd 資源包的非官方續作）',
      'https://modrinth.com/resourcepack/re-ocd',
      '',
      '授權：Apache-2.0',
      '',
      '此處只收錄 minespace 用得到的貼圖，檔案內容未經修改。',
      '缺少的幾張沿用 /assets/minecraft/textures/block。',
      '',
      '本資料夾由 scripts/sync-texture-pack.mjs 產生。',
    ].join('\n'),
  },
  {
    name: 'Pixel Perfection Legacy',
    setName: 'PIXEL_PERFECTION',
    outputDir: 'minecraft-pixel-perfection',
    withDiffuse: true,
    url: 'https://cdn.modrinth.com/data/6w3F4SEu/versions/M27tmode/Pixel%20Perfection%20Legacy%2026.2-88.0-1.zip',
    credit: [
      'Pixel Perfection Legacy',
      '-----------------------',
      '',
      '彩色貼圖來源：',
      'Pixel Perfection Legacy（XSSheep 的 Pixel Perfection 的續作）',
      'https://modrinth.com/resourcepack/pixel-perfection-legacy',
      '',
      '授權：CC-BY-4.0（姓名標示 4.0 國際）',
      'https://creativecommons.org/licenses/by/4.0/',
      '',
      '此處只收錄 minespace 用得到的貼圖，檔案內容未經修改。',
      '缺少的幾張沿用 /assets/minecraft/textures/block。',
      '',
      '本資料夾由 scripts/sync-texture-pack.mjs 產生。',
    ].join('\n'),
  },
  {
    name: 'CrayonCraft',
    setName: 'CRAYON',
    outputDir: 'minecraft-crayon',
    withDiffuse: true,
    /**
     * 這一套原圖是兩百三十九格見方的手繪稿
     *
     * 蠟筆的筆觸本來就是糊的，縮到一半完全看不出差別，
     * 檔案卻小掉四分之三
     */
    resize: 128,
    url: 'https://cdn.modrinth.com/data/Tohi4USg/versions/m3mFEqxb/%C2%A78Crayon%C2%A76Craft%C2%A7r%20%C2%A77%28b.1.1.1%29%20%C2%A7b%5B1.21.x%5D%C2%A70%20%281%29.zip',
    credit: [
      'CrayonCraft',
      '-----------',
      '',
      '彩色貼圖來源：',
      'CrayonCraft（手繪蠟筆風格）',
      'https://modrinth.com/resourcepack/crayoncraft',
      '',
      '授權：CC-BY-4.0（姓名標示 4.0 國際）',
      'https://creativecommons.org/licenses/by/4.0/',
      '',
      '此處只收錄 minespace 用得到的貼圖，並縮到 128 格見方。',
      '缺少的幾張沿用 /assets/minecraft/textures/block。',
      '',
      '本資料夾由 scripts/sync-texture-pack.mjs 產生。',
    ].join('\n'),
  },
  {
    name: 'Bare Bones PBR x128',
    outputDir: 'minecraft-bare-bones',
    withDiffuse: true,
    url: 'https://cdn.modrinth.com/data/IAEOKZEA/versions/mfXsrE4e/Bare%20Bones%20PBR.zip',
    credit: [
      'Bare Bones PBR x128',
      '-------------------',
      '',
      '彩色、法線（_n）與高光（_s）貼圖來源：',
      'Bare Bones PBR x128',
      'https://modrinth.com/resourcepack/bare-bones-pbr-x128',
      '',
      '授權：MIT',
      '',
      '此處只收錄 minespace 用得到的貼圖，檔案內容未經修改。',
      '缺少的幾張（水面與流水）沿用 /assets/minecraft/textures/block。',
      '',
      '本資料夾由 scripts/sync-texture-pack.mjs 產生。',
    ].join('\n'),
  },
]

/**
 * 從對照表撈出用得到的原版檔名
 *
 * 直接讀原始碼而不是 import：這支腳本是純 node，
 * 不想為了一份字串清單把整套 TypeScript 工具鏈拖進來
 */
function readNeededFileList() {
  const source = readFileSync(texturePackPath, 'utf8')
  const start = source.indexOf('const MINECRAFT_TEXTURE_MAP')
  const end = source.indexOf('/** 材質包的識別名 */')
  if (start < 0 || end < 0) {
    throw new Error('找不到 MINECRAFT_TEXTURE_MAP，對照表的結構可能改過了')
  }

  const block = source.slice(start, end)
  const pattern = /^\s{2}\w+:\s*(?:'([a-z0-9_]+)'|\{[^}]*file:\s*'([a-z0-9_]+)')/gm
  const nameSet = new Set()
  for (const match of block.matchAll(pattern)) {
    nameSet.add(match[1] ?? match[2])
  }

  return [...nameSet].sort()
}

/** 把用得到的那幾張搬過去，回傳這一套實際有哪些 */
async function collectPack(pack, archive, neededFileList) {
  const outputDir = join(assetRoot, pack.outputDir)
  mkdirSync(outputDir, { recursive: true })

  /** zip 裡的路徑前綴不一定一致，用檔名索引最保險 */
  const fileMap = new Map()
  for (const [path, entry] of archive.entryMap) {
    if (path.includes('/textures/block/') && path.endsWith('.png')) {
      fileMap.set(path.slice(path.lastIndexOf('/') + 1), entry)
    }
  }

  const diffuseList = []
  const normalList = []

  for (const name of neededFileList) {
    const suffixList = pack.withDiffuse ? ['', '_n', '_s'] : ['_n', '_s']
    for (const suffix of suffixList) {
      const fileName = `${name}${suffix}.png`
      const entry = fileMap.get(fileName)
      if (!entry)
        continue

      const data = readZipEntry(archive.buffer, entry)
      /**
       * 縮圖是可選的
       *
       * 大部分的包都照原樣搬過去——動過就不再是「未經修改」了。
       * 只有原圖大到不合理的那幾套才縮，並在授權說明裡寫清楚
       */
      if (pack.resize) {
        await sharp(data)
          .resize(pack.resize, pack.resize)
          /**
           * 手繪稿的顏色本來就不多
           *
           * 轉成調色盤之後檔案小掉一半以上，而蠟筆那種糊糊的筆觸
           * 根本看不出少了哪幾階顏色
           */
          .png({ palette: true })
          .toFile(join(outputDir, fileName))
      }
      else {
        writeFileSync(join(outputDir, fileName), data)
      }

      if (suffix === '') {
        diffuseList.push(name)
      }
    }

    if (fileMap.has(`${name}_n.png`)) {
      normalList.push(name)
    }
  }

  /** 授權標示要跟著貼圖走，不能只寫在設定頁上 */
  writeFileSync(join(outputDir, 'credit.txt'), `${pack.credit}\n`, 'utf8')

  console.log(`  ${pack.name}：彩色 ${diffuseList.length} 張、法線 ${normalList.length} 張`)

  return { diffuseList, normalList }
}

function formatSet(name, itemList) {
  const body = itemList.map((item) => `  '${item}',`).join('\n')
  return `export const ${name}: ReadonlySet<string> = new Set([\n${body}\n])\n`
}

async function main() {
  const neededFileList = readNeededFileList()
  console.log(`對照表要用到 ${neededFileList.length} 張原版貼圖`)

  const resultList = []
  for (const pack of PACK_LIST) {
    console.log(`下載 ${pack.name}⋯`)
    const archive = await downloadZip(pack.url)
    resultList.push(await collectPack(pack, archive, neededFileList))
  }

  const [vanillaPbr, ocd, pixelPerfection, crayon, bareBones] = resultList
  const manifest = [
    '/**',
    ' * 材質包實際有哪些檔案',
    ' *',
    ' * 這份清單是掃描材質包壓縮檔產生的，不要手改：',
    ' * 執行 `node scripts/sync-texture-pack.mjs` 會重新寫過。',
    ' *',
    ' * 有了它，缺圖的那幾張在建材質之前就退回原版，',
    ' * 執行期一個 404 都不會發出去',
    ' */',
    '',
    formatSet('VANILLA_NORMAL_SET', vanillaPbr.normalList),
    formatSet('OCD_FILE_SET', ocd.diffuseList),
    formatSet('PIXEL_PERFECTION_FILE_SET', pixelPerfection.diffuseList),
    formatSet('CRAYON_FILE_SET', crayon.diffuseList),
    formatSet('BARE_BONES_FILE_SET', bareBones.diffuseList),
    formatSet('BARE_BONES_NORMAL_SET', bareBones.normalList),
  ].join('\n')

  writeFileSync(manifestPath, manifest, 'utf8')
  console.log('已更新 texture-pack-manifest.ts')
}

await main()
