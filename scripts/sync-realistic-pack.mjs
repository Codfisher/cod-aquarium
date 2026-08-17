/**
 * 用 ambientCG 的實拍材質組出「實景」材質包
 *
 * 高擬真的 Minecraft 資源包幾乎清一色是 All Rights Reserved，
 * 沒有一套簽得進 repo。但材質包在這裡本來就是「語意名稱 → 檔案」的對照，
 * 來源不必是 Minecraft 資源包——ambientCG 有數千組實地拍攝、
 * 附完整 PBR 貼圖的材質，而且全部是 CC0：商用、修改、再散布都不必問，
 * 連標註都不是必要的。授權比前面幾套都乾淨。
 *
 * 這支腳本把選定的材質下載下來，轉成這個世界要的三張圖：
 *
 * - 彩色：直接縮到方塊用得上的尺寸
 * - 法線：RGB 放法線，alpha 放位移圖——渲染器的視差正是讀 alpha 那一欄，
 *   所以石縫與磚縫是真的有深度，不是畫上去的暗線
 * - 高光：把粗糙度反過來變成光滑度的灰階圖
 *
 * 檔名一律用原版 Minecraft 的名字，這樣它與別的原版命名材質包共用同一份
 * 對照表，沒做的那幾張也會自動退回原版。
 *
 * 用法：node scripts/sync-realistic-pack.mjs
 * 注意：會下載約 190 MB（每組材質一個壓縮檔），跑一次要幾分鐘
 */

import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  composeBillboard,
  composeScatter,
  createRandom,
  loadAtlas,
  measureCoverage,
  renderLayerList,
  segmentPartList,
} from './plant-atlas.mjs'
import { downloadZip, readZipEntry, readZipEntryMap } from './read-zip.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(projectRoot, 'content/public/assets/minecraft-realistic')
const texturePackPath = join(projectRoot, 'content/aquarium/minespace/domains/block/texture-pack.ts')

/**
 * 彩色貼圖的邊長
 *
 * 走近一顆方塊時看的就是這張圖，是整套「擬真」成不成立的關鍵，
 * 所以給得比法線大一階
 */
const COLOR_SIZE = 256
/**
 * 法線的邊長
 *
 * 只有彩色圖的一半。法線描述的是「表面朝哪邊」，那是一片連續而平緩的變化，
 * 縮一半肉眼分不出來，檔案卻小掉四分之三——
 * 這一套本來就是全場最重的，省得掉的地方要省
 */
const NORMAL_SIZE = 128
/** 高光只是一張平滑的灰階遮罩，縮小完全看不出來 */
const SPECULAR_SIZE = 128

/**
 * 原版檔名對到哪一組 ambientCG 材質
 *
 * 只做正立方體的方塊。花草、玻璃、燈籠那些要嘛是鏤空的立板、
 * 要嘛形狀特殊，貼一張無縫的實拍材質上去只會變成一塊方形的石頭——
 * 那些一律留給原版。
 *
 * 值可以只寫材質編號，也可以連著一組色調修正一起寫。
 * 修正是給那種「拍得沒錯，但這個世界要的不是這個顏色」的情況用的
 */
const MATERIAL_MAP = {
  // ── 地表 ──
  grass_block_top: 'Grass005',
  dirt: 'Ground048',
  sand: 'Ground054',
  /**
   * 枯山水的白沙
   *
   * 實拍的沙沒有真正白的——曬過的沙一律帶著暖黃，
   * 而枯山水要的是一片近乎無色的白，紋路才看得出來是耙出來的。
   * 挑最淺的那一組，再把彩度壓掉三分之二、亮度提一成：
   * 顆粒的明暗還在，顏色退成灰白
   */
  white_concrete_powder: { asset: 'Ground101', tone: { saturation: 0.34, brightness: 1.12 } },
  gravel: 'Gravel023',
  clay: 'Ground103',
  snow: 'Snow010A',
  grass_block_snow: 'Snow010A',
  ice: 'Ice003',
  packed_ice: 'Ice002',

  // ── 石 ──
  stone: 'Rock051',
  cobblestone: 'PavingStones046',
  mossy_cobblestone: 'PavingStones138',
  stone_bricks: 'Bricks085',
  polished_andesite: 'Tiles143',
  bricks: 'Bricks097',
  obsidian: 'Onyx015',
  polished_blackstone_bricks: 'Onyx013',
  sandstone: 'Rock061',
  quartz_block_side: 'Travertine009',

  // ── 木 ──
  oak_planks: 'WoodFloor043',
  dark_oak_planks: 'WoodFloor040',
  bamboo_planks: 'WoodFloor051',
  oak_log: 'Bark001',
  spruce_log: 'Bark012',
  birch_log: 'Bark014',
  /** 三種樹的年輪端面共用同一張，反正都是被鋸開的木頭 */
  oak_log_top: 'TreeEnd003',
  spruce_log_top: 'TreeEnd003',
  birch_log_top: 'TreeEnd003',

  // ── 其他 ──
  hay_block_side: 'ThatchedRoof001A',
  bamboo_mosaic: 'Bamboo001A',
}

/**
 * 花草的邊長
 *
 * 比方塊那些小一階，而且是刻意的。花草走的是 alpha test，
 * 那條路上不能開 mipmap——鏤空的邊界一旦被平均出中間值，
 * 花草的正上方就會浮出一道十字。沒有 mipmap 的貼圖愈細，
 * 遠看愈會閃爍成一片雜訊，所以解析度要收著給
 */
const PLANT_SIZE = 128

/**
 * 切圖集時的取樣邊長
 *
 * 要切得準就得在原尺寸上切。縮小之後再切，
 * 葉柄那種一兩個像素寬的地方會先斷掉，一片葉子被切成兩塊
 */
const ATLAS_SIZE = 1024

/**
 * 花草長什麼樣
 *
 * 這些不是無縫的表面材質，是 ambientCG 另一類叫 Atlas 的東西：
 * 一整張圖上散著十幾片各自去過背的葉子或草葉。
 * 切開、挑幾片、重新排成一株草或一叢樹葉，才是這個世界要的東西。
 *
 * - billboard：一株從底部長上來的植物，給交叉立板用
 * - scatter：散成一整片而且左右接得起來，給樹葉方塊與鋪地的落葉用
 * - single：正中央一片，給睡蓮那種俯視的葉子用
 */
const PLANT_MAP = {
  /**
   * ── 草 ──
   *
   * widthRatio 是把草葉橫向撐胖的倍率，幾張乾草特別需要。
   * 那些圖集拍的是真的草，一根莖在一千格見方的圖上不過十來個像素寬；
   * 縮到一百二十八格之後只剩一個像素，而 alpha test 是全有全無的——
   * 半個像素寬的東西直接消失，整株草只剩幾點浮在空中
   */
  short_grass: { source: 'Foliage001', mode: 'billboard', seed: 11, count: 10, height: [0.5, 0.92], spread: 0.26, tilt: 20, widthRatio: 1.5 },
  tall_grass_bottom: { source: 'Foliage001', mode: 'billboard', seed: 23, count: 12, height: [0.8, 1], spread: 0.2, tilt: 12, widthRatio: 1.3 },
  large_fern_bottom: { source: 'Foliage006', mode: 'billboard', seed: 31, count: 10, height: [0.66, 0.98], spread: 0.24, tilt: 14, widthRatio: 1.5 },
  /** 乾草另外開一張。原版的枯灌木同時被枯枝與乾草共用，那兩者在這裡長得不一樣 */
  dry_grass: { source: 'Foliage002', mode: 'billboard', seed: 43, count: 12, height: [0.4, 0.7], spread: 0.32, tilt: 34, widthRatio: 3 },
  dead_bush: { source: 'Foliage002', mode: 'billboard', seed: 53, count: 12, height: [0.5, 0.88], spread: 0.3, tilt: 32, widthRatio: 3 },
  /** 麥子站得直，穗子沉在頂上 */
  wheat_stage7: { source: 'Foliage002', mode: 'billboard', seed: 61, count: 13, height: [0.72, 1], spread: 0.2, tilt: 9, widthRatio: 3 },
  sugar_cane: { source: 'Foliage006', mode: 'billboard', seed: 71, count: 7, height: [0.85, 1], spread: 0.18, tilt: 6, widthRatio: 1.8 },
  /** 垂下來的草，從上緣往下長 */
  hanging_roots: { source: 'Foliage001', mode: 'billboard', seed: 83, count: 10, height: [0.6, 1], spread: 0.28, tilt: 26, widthRatio: 1.4, anchor: 'top' },

  // ── 葉子做的植物 ──
  fern: { source: 'LeafSet002', mode: 'billboard', seed: 97, count: 8, height: [0.5, 0.9], spread: 0.24, tilt: 22 },
  azalea_plant: { source: 'LeafSet018', mode: 'billboard', seed: 101, count: 12, height: [0.3, 0.56], spread: 0.3, tilt: 34 },
  glow_lichen: { source: 'LeafSet020', mode: 'scatter', seed: 103, count: 28, scale: [0.2, 0.36] },
  vine: { source: 'LeafSet017', mode: 'scatter', seed: 107, count: 15, scale: [0.2, 0.34] },
  /** 睡蓮是從上往下看的一片葉子，心形的那種剛好 */
  lily_pad: { source: 'LeafSet023', mode: 'single', seed: 109 },

  // ── 樹葉方塊 ──
  oak_leaves: { source: 'LeafSet016', mode: 'scatter', seed: 113, count: 24, scale: [0.24, 0.4] },
  /**
   * 白楊葉換成秋葉
   *
   * 這個 key 只有琥珀與金黃兩種轉色的葉子在用，
   * 而它們原本是拿一張兩階綠的貼圖乘上倍率推出來的。
   * 實拍的葉子本來就有整片的層次，乘那組倍率只會爆成一片死紅，
   * 所以直接換成一堆真的秋葉，倍率在對照表那邊關掉
   */
  birch_leaves: { source: 'LeafSet027', mode: 'scatter', seed: 127, count: 28, scale: [0.22, 0.36] },
  /** 針葉細得像頭髮，往內削邊會把它整根削掉 */
  spruce_leaves: { source: 'LeafSet019', mode: 'scatter', seed: 131, count: 7, scale: [0.4, 0.72], segment: { erodeRadius: 1 } },
  acacia_leaves: { source: 'LeafSet010', mode: 'scatter', seed: 137, count: 24, scale: [0.24, 0.4] },
  jungle_leaves: { source: 'LeafSet004', mode: 'scatter', seed: 139, count: 26, scale: [0.24, 0.42] },

  // ── 鋪在地上的 ──
  fallen_leaves: { source: 'LeafSet030', mode: 'scatter', seed: 149, count: 22, scale: [0.24, 0.42] },
  forest_litter: { source: 'PineNeedles001', mode: 'scatter', seed: 151, count: 24, scale: [0.3, 0.62], segment: { erodeRadius: 0, minimumAreaRatio: 0.0002 } },
}

/**
 * 花
 *
 * ambientCG 上去過背的花只有一組雛菊。
 * 但一朵白花是可以染成任何顏色的——白色乘上什麼就是什麼，
 * 而且花瓣上的明暗層次會跟著一起保留。
 * 於是同一組雛菊分頭長成罌粟、鬱金香、堇與月見草。
 *
 * 這比「一片兩百五十六格的實拍草地旁邊插著一朵十六格的像素花」好得多
 */
const FLOWER_SOURCE = 'FlowerSet001'
/** 花莖拿最直的那組草葉壓窄而成，比畫一條綠線像得多 */
const FLOWER_STEM_SOURCE = 'Foliage006'
const FLOWER_STEM_WIDTH_RATIO = 0.32

const FLOWER_MAP = {
  oxeye_daisy: { seed: 211, count: 3, headScale: [0.3, 0.4], stemHeight: [0.55, 0.8] },
  poppy: { seed: 223, count: 3, headScale: [0.3, 0.42], stemHeight: [0.5, 0.76], colorRatio: [0.96, 0.18, 0.15] },
  red_tulip: { seed: 227, count: 3, headScale: [0.26, 0.36], stemHeight: [0.5, 0.74], colorRatio: [1, 0.42, 0.5] },
  dandelion: { seed: 229, count: 5, headScale: [0.18, 0.26], stemHeight: [0.44, 0.7], colorRatio: [1.05, 0.86, 0.2] },
  allium: { seed: 233, count: 3, headScale: [0.24, 0.34], stemHeight: [0.56, 0.82], colorRatio: [0.72, 0.46, 1.05] },
  rose_bush_top: { seed: 239, count: 3, headScale: [0.36, 0.48], stemHeight: [0.5, 0.72], colorRatio: [1, 0.36, 0.62] },
  lily_of_the_valley: { seed: 241, count: 5, headScale: [0.16, 0.24], stemHeight: [0.5, 0.78], colorRatio: [0.92, 0.96, 1.02] },
  orange_tulip: { seed: 251, count: 3, headScale: [0.28, 0.38], stemHeight: [0.48, 0.72], colorRatio: [1.05, 0.6, 0.18] },
  torchflower: { seed: 257, count: 3, headScale: [0.3, 0.4], stemHeight: [0.52, 0.78], colorRatio: [1.05, 0.44, 0.18] },
}

/**
 * 草地方塊側面那一圈草
 *
 * 原版是一張鏤空的疊圖，蓋在泥土的側面上。實拍材質裡沒有這種東西，
 * 只好自己做：拿草的彩色圖，上緣留著、往下逐漸透明，
 * 再讓邊界隨機起伏成鋸齒。沒有它的話，草地方塊的側面會是一塊乾淨的泥土，
 * 遠看整片草原像是被人剃過
 */
const GRASS_OVERLAY_FILE = 'grass_block_side_overlay'
/** 草皮往下垂多少（佔整張圖的比例） */
const GRASS_OVERLAY_DEPTH = 0.42

/**
 * 從對照表撈出「實景」這一套自己有哪些檔案，用來對帳
 *
 * 表面與花草分成兩份，兩份都要讀。少讀一份的下場是
 * 這支腳本以為某幾張沒人要、悄悄不生，而畫面上那幾顆方塊
 * 默默退回原版——不會報錯，只會有一天發現草是像素的
 */
function readDeclaredFileList() {
  const source = readFileSync(texturePackPath, 'utf8')
  const fileSet = new Set()

  for (const name of ['REALISTIC_SURFACE_MAP', 'REALISTIC_PLANT_MAP']) {
    const start = source.indexOf(`const ${name}`)
    if (start < 0) {
      throw new Error(`找不到 ${name}，對照表的結構可能改過了`)
    }

    const block = source.slice(start, source.indexOf('\n}', start))
    const pattern = /'([a-z0-9_]+)'|file:\s*'([a-z0-9_]+)'/g
    for (const match of block.matchAll(pattern)) {
      fileSet.add(match[1] ?? match[2])
    }
  }

  return fileSet
}

/**
 * 從 zip 裡找出某一種貼圖
 *
 * ambientCG 的檔名長這樣：Grass005_1K-JPG_Color.jpg。
 * 壓縮檔裡還躺著 .blend、.usdc 這些給 3D 軟體用的東西，
 * 以及一張同名的預覽圖，所以副檔名與種類都要對上才算數
 */
function findMap(archive, kind) {
  for (const [path, entry] of archive.entryMap) {
    if (path.endsWith(`_${kind}.jpg`) || path.endsWith(`_${kind}.png`)) {
      return readZipEntry(archive.buffer, entry)
    }
  }

  return null
}

/**
 * 把一組材質轉成這個世界要的三張圖
 *
 * 回傳它到底做出了哪幾張，缺的那些渲染器會自己退回原版
 */
async function convertMaterial(fileName, archive, tone) {
  const color = findMap(archive, 'Color')
  if (!color) {
    throw new Error(`${fileName} 缺少彩色貼圖`)
  }

  const colorPipeline = sharp(color).resize(COLOR_SIZE, COLOR_SIZE)
  /**
   * 顏色修正只動彩色圖
   *
   * 法線與高光描述的是形狀與反光程度，不是顏色。
   * 一起調的話沙子會連凹凸都被改掉，紋路整片扁下去
   */
  if (tone) {
    colorPipeline.modulate(tone)
  }
  await colorPipeline.png().toFile(join(outputDir, `${fileName}.png`))

  /**
   * 法線與位移併成一張
   *
   * 渲染器讀的是「RGB 是法線、alpha 是高度」這個排法（見 pixel-material），
   * 而 ambientCG 把兩者分成兩個檔案，所以在這裡合起來。
   * 用 NormalGL 而不是 NormalDX：兩者的綠色通道是相反的，
   * 選錯的話光影會整個上下顛倒
   */
  const normal = findMap(archive, 'NormalGL')
  const displacement = findMap(archive, 'Displacement')
  let hasNormal = false

  if (normal) {
    const pipeline = sharp(normal).resize(NORMAL_SIZE, NORMAL_SIZE).removeAlpha()

    if (displacement) {
      const heightChannel = await sharp(displacement)
        .resize(NORMAL_SIZE, NORMAL_SIZE)
        .greyscale()
        .raw()
        .toBuffer()

      pipeline.joinChannel(heightChannel, {
        raw: { width: NORMAL_SIZE, height: NORMAL_SIZE, channels: 1 },
      })
    }

    await pipeline.png().toFile(join(outputDir, `${fileName}_n.png`))
    hasNormal = true
  }

  /**
   * 粗糙度要反過來
   *
   * ambientCG 存的是「有多粗糙」，渲染器要的是「有多光滑」，
   * 兩者正好互補。反相之後濕過的石頭與打磨過的木頭才會在斜射的陽光下亮起來
   */
  const roughness = findMap(archive, 'Roughness')
  if (roughness && hasNormal) {
    await sharp(roughness)
      .resize(SPECULAR_SIZE, SPECULAR_SIZE)
      .greyscale()
      .negate({ alpha: false })
      .png()
      .toFile(join(outputDir, `${fileName}_s.png`))
  }

  return hasNormal
}

/**
 * 把圖集切成一片一片，切過的留著
 *
 * 一組圖集常常餵好幾張成品：同一批雛菊要長成九種花，
 * 同一批針葉要鋪成樹葉方塊與地上的腐葉。切一次要掃過一百萬個像素，
 * 沒必要為了同一組圖再掃一遍
 */
const partListCache = new Map()

async function loadPartList(assetId, archive, options) {
  const key = `${assetId}:${JSON.stringify(options ?? {})}`
  const cached = partListCache.get(key)
  if (cached) {
    return cached
  }

  const color = findMap(archive, 'Color')
  const opacity = findMap(archive, 'Opacity')
  if (!color || !opacity) {
    throw new Error(`${assetId} 不是去背的圖集，缺少彩色圖或遮罩`)
  }

  const atlas = await loadAtlas(color, opacity, ATLAS_SIZE)
  const partList = segmentPartList(atlas, options)
  if (partList.length === 0) {
    throw new Error(`${assetId} 一片都切不出來`)
  }

  partListCache.set(key, partList)

  return partList
}

/** 把疊好的成品寫成檔案，順便回報有幾成是實心的 */
async function writePlant(fileName, pixelList) {
  await sharp(pixelList, { raw: { width: PLANT_SIZE, height: PLANT_SIZE, channels: 4 } })
    .png()
    .toFile(join(outputDir, `${fileName}.png`))

  return measureCoverage(pixelList, PLANT_SIZE)
}

/** 照著配方排出一株植物或一片樹葉 */
async function convertPlant(fileName, recipe, archive) {
  const partList = await loadPartList(recipe.source, archive, recipe.segment)
  const random = createRandom(recipe.seed)
  const size = PLANT_SIZE

  if (recipe.mode === 'single') {
    /**
     * 只擺一片，而且要擺滿
     *
     * 睡蓮那種俯視的葉子沒有「根」也沒有方向，
     * 排成一叢反而像是水面上飄著一堆碎葉
     */
    const plan = await composeBillboard([partList[0]], {
      size,
      count: 1,
      random,
      heightRange: [0.92, 0.92],
      spreadRatio: 0,
      tiltDegree: 0,
      /** 一片葉子本來就要佔滿整格，不受「一株草不該橫著長」那條限制 */
      maxWidthRatio: 1,
    })
    /** 一片葉子貼在正中央，不是站在底邊上 */
    const layer = plan.layerList[0]
    layer.top = Math.round(plan.origin + (size - layer.raw.height) / 2)
    layer.left = Math.round(plan.origin + (size - layer.raw.width) / 2)

    return writePlant(fileName, await renderLayerList(plan, size))
  }

  if (recipe.mode === 'scatter') {
    const plan = await composeScatter(partList, {
      size,
      count: recipe.count,
      random,
      scaleRange: recipe.scale,
    })

    return writePlant(fileName, await renderLayerList(plan, size))
  }

  const plan = await composeBillboard(partList, {
    size,
    count: recipe.count,
    random,
    heightRange: recipe.height,
    spreadRatio: recipe.spread,
    tiltDegree: recipe.tilt,
    widthRatio: recipe.widthRatio,
    anchor: recipe.anchor,
  })

  return writePlant(fileName, await renderLayerList(plan, size))
}

/**
 * 長一株帶花的植物
 *
 * 先讓花莖從底部長上來，記住每一根的頂端在哪，再把花朵按在那些點上。
 * 花莖與花朵分開排是必要的：花不是長在莖的中間，
 * 而莖轉了角度之後頂端會跑到哪，只有排完才知道
 */
async function convertFlower(fileName, recipe, headArchive, stemArchive) {
  const headPartList = await loadPartList(FLOWER_SOURCE, headArchive)
  const stemPartList = await loadPartList(FLOWER_STEM_SOURCE, stemArchive)
  const random = createRandom(recipe.seed)
  const size = PLANT_SIZE

  const plan = await composeBillboard(stemPartList, {
    size,
    count: recipe.count,
    random,
    heightRange: recipe.stemHeight,
    spreadRatio: 0.24,
    tiltDegree: 12,
    widthRatio: FLOWER_STEM_WIDTH_RATIO,
  })

  for (const tip of plan.tipList) {
    const head = headPartList[Math.floor(random() * headPartList.length)]
    const targetSize = size * (recipe.headScale[0] + random() * (recipe.headScale[1] - recipe.headScale[0]))
    const shaped = await shapeFlowerHead(head, targetSize, random() * 360, recipe.colorRatio)
    plan.layerList.push({
      input: shaped.input,
      raw: shaped.raw,
      left: Math.round(tip.x - shaped.raw.width / 2),
      top: Math.round(tip.y - shaped.raw.height / 2),
    })
  }

  return writePlant(fileName, await renderLayerList(plan, size))
}

/** 把一朵花縮到要的大小、轉個角度，順便染成該有的顏色 */
async function shapeFlowerHead(part, targetSize, angle, colorRatio) {
  const scale = targetSize / Math.max(part.width, part.height)
  let pipeline = sharp(part.data, { raw: { width: part.width, height: part.height, channels: 4 } })
    .resize(Math.max(1, Math.round(part.width * scale)), Math.max(1, Math.round(part.height * scale)))

  if (colorRatio) {
    pipeline = pipeline.linear(colorRatio, [0, 0, 0])
  }

  const { data, info } = await pipeline
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return { input: data, raw: { width: info.width, height: info.height, channels: 4 } }
}

/** 把草的彩色圖做成一片上緣有鋸齒、往下淡出的疊圖 */
async function createGrassOverlay(archive) {
  const color = findMap(archive, 'Color')
  const size = COLOR_SIZE
  const grass = await sharp(color).resize(size, size).removeAlpha().raw().toBuffer()

  /**
   * 邊界的鋸齒
   *
   * 一整條水平線切下去會像貼了一張膠帶。每一欄各自決定草垂到哪，
   * 相鄰的欄之間只差一點點，看起來才是草尖參差不齊的樣子
   */
  const alpha = Buffer.alloc(size * size)
  const baseDepth = size * GRASS_OVERLAY_DEPTH
  let ragged = baseDepth

  for (let column = 0; column < size; column++) {
    /** 隨機游走，但拉回基準線，才不會一路飄到圖外 */
    ragged += (Math.random() - 0.5) * size * 0.06
    ragged += (baseDepth - ragged) * 0.12
    const depth = Math.max(4, Math.min(size - 1, ragged))

    for (let row = 0; row < size; row++) {
      /** 越接近下緣越透明，草與土之間才不會有一條硬邊 */
      const fade = 1 - row / depth
      alpha[row * size + column] = row < depth ? Math.round(Math.min(1, fade * 2.2) * 255) : 0
    }
  }

  await sharp(grass, { raw: { width: size, height: size, channels: 3 } })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toFile(join(outputDir, `${GRASS_OVERLAY_FILE}.png`))
}

const CREDIT = [
  'ambientCG 實拍材質',
  '------------------',
  '',
  '彩色、法線（_n）與高光（_s）貼圖，以及全部的花草，來源皆為：',
  'ambientCG',
  'https://ambientcg.com/',
  '',
  '授權：CC0 1.0 Universal（公眾領域貢獻）',
  'https://creativecommons.org/publicdomain/zero/1.0/',
  '',
  'CC0 不要求標註，這份說明純粹是出於感謝。',
  '',
  '表面材質經過縮放與通道重組：法線的 alpha 換成位移圖、',
  '高光由粗糙度反相而來，草地側面那張疊圖則是從草的彩色圖生出來的。',
  '',
  '花草來自 ambientCG 的 Atlas 類素材（Foliage、LeafSet、PineNeedles、',
  'FlowerSet），那些是一整張圖上散著十幾片各自去過背的葉子。',
  '這裡把它們切成一片一片，再重新排成一株草、一叢樹葉或一朵花；',
  '花的顏色是把同一組白色雛菊分別染出來的。',
  '',
  '本資料夾由 scripts/sync-realistic-pack.mjs 產生。',
].join('\n')

/**
 * 壓縮檔存一份在系統暫存區
 *
 * 整批將近兩百 MB。調一次輸出尺寸就要再等一遍實在難用，
 * 留一份在暫存區，之後重跑只花在轉檔上。
 * 暫存區被系統清掉也無所謂，下次自己會再抓
 */
const CACHE_DIR = join(tmpdir(), 'minespace-ambientcg')

async function loadArchive(assetId) {
  const cachePath = join(CACHE_DIR, `${assetId}_1K-JPG.zip`)

  if (existsSync(cachePath)) {
    const buffer = await readFile(cachePath)

    return { buffer, entryMap: readZipEntryMap(buffer) }
  }

  process.stdout.write(`  下載 ${assetId}⋯`)
  const archive = await downloadZip(`https://ambientcg.com/get?file=${assetId}_1K-JPG.zip`)
  mkdirSync(CACHE_DIR, { recursive: true })
  await writeFile(cachePath, archive.buffer)
  process.stdout.write(' 完成\n')

  return archive
}

async function main() {
  const declaredFileSet = readDeclaredFileList()
  const surfaceNameList = Object.keys(MATERIAL_MAP)
  const generatedNameSet = new Set([
    ...surfaceNameList,
    ...Object.keys(PLANT_MAP),
    ...Object.keys(FLOWER_MAP),
    GRASS_OVERLAY_FILE,
  ])

  /** 對照表與這支腳本各自維護一份清單，對不起來就是有一邊漏改了 */
  const missing = [...declaredFileSet].filter((name) => !generatedNameSet.has(name))
  if (missing.length > 0) {
    throw new Error(`對照表宣告了這幾張，但腳本裡沒有對應的材質：${missing.join(', ')}`)
  }

  mkdirSync(outputDir, { recursive: true })

  /** 同一組材質可能被好幾個檔名共用（三種樹的年輪端面），下載過就不再抓 */
  const archiveCache = new Map()
  const loadCached = async (assetId) => {
    let archive = archiveCache.get(assetId)
    if (!archive) {
      archive = await loadArchive(assetId)
      archiveCache.set(assetId, archive)
    }

    return archive
  }

  console.log(`表面材質 ${surfaceNameList.length} 組⋯`)
  let normalCount = 0
  for (const [fileName, entry] of Object.entries(MATERIAL_MAP)) {
    const { asset, tone } = typeof entry === 'string' ? { asset: entry } : entry
    if (await convertMaterial(fileName, await loadCached(asset), tone)) {
      normalCount++
    }
  }

  await createGrassOverlay(archiveCache.get(MATERIAL_MAP.grass_block_top))

  console.log(`花草圖集 ${Object.keys(PLANT_MAP).length} 張⋯`)
  for (const [fileName, recipe] of Object.entries(PLANT_MAP)) {
    const coverage = await convertPlant(fileName, recipe, await loadCached(recipe.source))
    console.log(`  ${fileName.padEnd(20)} ${recipe.source.padEnd(15)} 實心 ${(coverage * 100).toFixed(0)}%`)
  }

  console.log(`花 ${Object.keys(FLOWER_MAP).length} 張⋯`)
  const headArchive = await loadCached(FLOWER_SOURCE)
  const stemArchive = await loadCached(FLOWER_STEM_SOURCE)
  for (const [fileName, recipe] of Object.entries(FLOWER_MAP)) {
    const coverage = await convertFlower(fileName, recipe, headArchive, stemArchive)
    console.log(`  ${fileName.padEnd(20)} 實心 ${(coverage * 100).toFixed(0)}%`)
  }

  writeFileSync(join(outputDir, 'credit.txt'), `${CREDIT}\n`, 'utf8')
  const plantCount = Object.keys(PLANT_MAP).length + Object.keys(FLOWER_MAP).length
  console.log(`\n實景：表面 ${surfaceNameList.length + 1} 張（法線 ${normalCount} 張）、花草 ${plantCount} 張`)
}

await main()
