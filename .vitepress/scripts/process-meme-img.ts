import type {
  RawImage,
} from '@huggingface/transformers'
import type { Buffer } from 'node:buffer'
import type sharp from 'sharp'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import {
  AutoProcessor,
  Florence2ForConditionalGeneration,
  Florence2Processor,
  load_image,
  Tensor,
} from '@huggingface/transformers'
import { pipe, tap } from 'remeda'

import { createWorker, PSM } from 'tesseract.js'

const __dirname = import.meta.dirname

const FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/** 附加資料。版本等等 */
const MEME_META_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-meta.json')
/** 圖片資料 */
const MEME_DATA_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data.ndjson')

async function readExistingFilenames(ndjsonPath: string): Promise<Set<string>> {
  const names = new Set<string>()
  if (!existsSync(ndjsonPath))
    return names

  const stream = createReadStream(ndjsonPath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    const string = line.trim()
    if (!string)
      continue

    try {
      const obj = JSON.parse(string)
      const name = typeof obj?.file === 'string' ? obj.file : undefined
      if (name)
        names.add(name)
    }
    catch { }
  }
  return names
}

/** 取得不重複的檔案 */
async function getMemeFiles(dir: string, { recursive = true } = {}) {
  const files: string[] = []

  const existingNames = await readExistingFilenames(MEME_DATA_PATH)

  const pickedNames = new Set<string>(existingNames)

  async function walk(dirPath: string) {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (recursive) {
          await walk(fullPath)
        }
      }
      else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        const baseName = path.basename(entry.name)
        if (!pickedNames.has(baseName)) {
          pickedNames.add(baseName)
          files.push(fullPath)
        }
      }
    }
  }

  await walk(dir)
  return files
}

/** 產生圖片變體 */
async function preprocessVariants(input: sharp.Sharp, opts?: { targetWidth?: number }) {
  const base = input
    .rotate() // auto-orient
    .flatten({ background: '#ffffff' }) // 去 alpha，填白底
    .grayscale()
    .normalize() // 拉開動態範圍
    .gamma(1.15) // 提升中階亮度
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#ffffff' })

  const meta = await base.metadata()
  const targetW = opts?.targetWidth ?? 1800
  const resized = (meta.width ?? 0) < targetW
    ? base.resize({ width: targetW, kernel: 'lanczos3' })
    : base.clone()

  // A: 灰階高對比
  const A = await resized.clone()
    .linear(1.25, -10) // 增加對比 (slope, intercept)
    .sharpen(1) // 輕度銳利
    .png()
    .toBuffer()

  // B: 全局二值化 (預設門檻)
  const B = await resized.clone()
    .threshold() // 相當於 ~128
    .png()
    .toBuffer()

  // C: 二值化（偏亮一點的門檻）
  const C = await resized.clone()
    .blur(0.4) // 先抑制噪點
    .threshold(150)
    .png()
    .toBuffer()

  // D: 深色底反白情境（自動偵測平均亮度再決定是否反相）
  let D: Buffer | null = null
  const stats = await resized.clone().stats()
  const mean = stats.channels[0]?.mean ?? 128
  if (mean < 110) {
    D = await resized.clone()
      .negate() // 反相
      .linear(1.2, -12)
      .threshold(140)
      .png()
      .toBuffer()
  }

  // E/F: 微幅去斜（可選，稍耗時）
  const E = await resized.clone().rotate(-1).sharpen(1).png().toBuffer()
  const F = await resized.clone().rotate(1).sharpen(1).png().toBuffer()

  return [A, B, C, D, E, F].filter(Boolean) as Buffer[]
}

/** OCR 所有變體，取信心值最高者 */
async function ocrBestVariant(ocrWorker: Tesseract.Worker, variants: Buffer[]) {
  const results = await Promise.all(
    variants.map(async (buf) => {
      const res = await ocrWorker.recognize(buf)
      return res.data
    }),
  )
  results.sort((a, b) => b.confidence - a.confidence)
  const best = results[0]
  if (best && best.confidence > 60) {
    return best
  }
}

async function main() {
  const ocrWorker = await pipe(
    await createWorker(['chi_tra', 'eng']),
    async (worker) => {
      await worker.setParameters({
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
        preserve_interword_spaces: '0',
        // SPARSE_TEXT 對零散字更穩，也比較不會幻覺出長句
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        // 統一 DPI，避免圖檔 metadata 缺失造成效果不穩
        user_defined_dpi: '300',
      })

      return worker
    },
  )

  // 圖片描述
  const modelId = 'onnx-community/Florence-2-large-ft'
  const processor = (await AutoProcessor.from_pretrained(modelId))
  if (!(processor instanceof Florence2Processor)) {
    return
  }

  const model = await Florence2ForConditionalGeneration.from_pretrained(modelId, {
    dtype: {
      embed_tokens: 'fp16',
      vision_encoder: 'fp16',
      encoder_model: 'q4',
      decoder_model_merged: 'q4',
    },
  })

  // const translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype: 'fp16' })

  const ndjsonStream = createWriteStream(MEME_DATA_PATH, { flags: 'a', encoding: 'utf8' })

  const memeFiles = await getMemeFiles(FILE_PATH)
  console.log(`[meme] ${memeFiles.length} 個檔案待處理`)

  let count = 0
  for (const file of memeFiles) {
    count++

    const image: RawImage = await load_image(file)

    const ocrResult = await pipe(
      undefined,
      async () => {
        const variants = await preprocessVariants(image.toSharp())

        const result = await ocrBestVariant(ocrWorker, variants)
        if (!result) {
          return ''
        }

        return result.text
          .replaceAll(/\s+/g, '')
          .replaceAll(
            /[^\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{L}\p{N}\p{P}]/gu,
            '',
          )
      },
    )

    const caption = await pipe(undefined, async () => {
      const taskCap = '<MORE_DETAILED_CAPTION>'
      const promptsCap = processor.construct_prompts(taskCap)

      const inputsCap = await processor(image, promptsCap)

      const outCaption = await model.generate({
        ...inputsCap,
        max_new_tokens: 320,
        num_beams: 6,
        do_sample: false,
        length_penalty: 1.2,
        repetition_penalty: 1.08,
        no_repeat_ngram_size: 2,
      })

      if (!(outCaption instanceof Tensor)) {
        return
      }

      const decodeCaption = processor.batch_decode(outCaption, { skip_special_tokens: false })[0]
      if (!decodeCaption) {
        return
      }

      const captionValue = processor.post_process_generation(decodeCaption, taskCap, image.size)[taskCap] ?? ''
      if (typeof captionValue !== 'string') {
        return
      }

      return captionValue
    })

    const result = pipe(
      {
        file: path.basename(file),
        describe: caption,
        ocr: ocrResult,
        keyword: '',
      },
      (data) => JSON.stringify(data).replaceAll('\n', ''),
    )

    // console.log(result)
    console.log(`[meme] ${count}/${memeFiles.length}`)

    ndjsonStream.write(`${result}\n`)
  }

  await new Promise<void>((resolve, reject) => {
    ndjsonStream.on('finish', resolve)
    ndjsonStream.on('error', reject)
    ndjsonStream.end()
  })

  await writeFile(
    MEME_META_PATH,
    JSON.stringify({
      updatedAt: Math.floor(Date.now() / 1000),
    }),
    'utf8',
  )

  ocrWorker.terminate()
  console.log('[meme] done')
}

main().catch((e) => {
  console.error(e)
})
