import { createWriteStream } from 'node:fs' // ⬅️ 新增
import { readdir } from 'node:fs/promises'
import path from 'node:path'
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
/** 目標路徑 */
const NDJSON_PATH = path.resolve(__dirname, '../../content/public/memes/memes.ndjson')

async function getMemeFiles(dir: string, { recursive = true } = {}) {
  const files: string[] = []
  async function walk(dirPath: string) {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (recursive)
          await walk(fullPath)
      }
      else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath)
      }
    }
  }
  await walk(dir)
  return files
}

async function main() {
  // OCR
  const ocrWorker = await createWorker('chi_tra')

  // 描述
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

  const ndjsonStream = createWriteStream(NDJSON_PATH, { flags: 'w', encoding: 'utf8' })

  const memeFiles = await getMemeFiles(FILE_PATH)
  for (const file of memeFiles) {
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

    const result = {
      file: path.basename(file),
      describe: {
        en: caption ?? '',
        zh: '',
      },
      ocr: ocrResult.data.text.replaceAll(' ', ''),
    }

    // console.log(result)

    ndjsonStream.write(`${JSON.stringify(result)}\n`)
  }

  await new Promise<void>((resolve, reject) => {
    ndjsonStream.on('finish', resolve)
    ndjsonStream.on('error', reject)
    ndjsonStream.end()
  })

  ocrWorker.terminate()
}

main().catch((e) => {
  console.error(e)
})
