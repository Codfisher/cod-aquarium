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
import { pipe } from 'remeda'
import { createWorker } from 'tesseract.js'

const __dirname = import.meta.dirname

const FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/** 附加資料。版本等等 */
const MEME_META_PATH = path.resolve(__dirname, '../../content/public/memes/memes-meta.json')
/** 圖片資料 */
const MEME_DATA_PATH = path.resolve(__dirname, '../../content/public/memes/memes-data.ndjson')

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

async function main() {
  const ocrWorker = await createWorker('chi_tra')

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

    const image = await load_image(file)

    const ocrResult = await ocrWorker.recognize(file)

    const caption = await pipe(undefined, async () => {
      const taskCap = '<MORE_DETAILED_CAPTION>'
      const promptsCap = processor.construct_prompts(taskCap)

      const inputsCap = await processor(image, promptsCap)

      const outCaption = await model.generate({
        ...inputsCap,
        max_new_tokens: 120,
        num_beams: 4,
        do_sample: false,
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
        ocr: ocrResult.data.text.replaceAll(' ', ''),
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
