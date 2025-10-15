import { readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  AutoProcessor,
  Florence2ForConditionalGeneration,
  Florence2Processor,
  load_image,
  pipeline,
  Tensor,
} from '@huggingface/transformers'
import { get } from 'lodash-es'
import { createWorker } from 'tesseract.js'

const __dirname = import.meta.dirname

const FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

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

  const translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {
    dtype: 'fp16',
  })

  const memeFiles = await getMemeFiles(FILE_PATH)
  for (const file of memeFiles) {
    const image = await load_image(file)

    // ---------- Pass 1: OCR ----------
    const ocrResult = await ocrWorker.recognize(file)

    // ---------- Pass 2: Caption ----------
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
      continue
    }

    const decodeCaption = processor.batch_decode(outCaption, { skip_special_tokens: false })[0]
    if (!decodeCaption) {
      continue
    }

    const caption = processor.post_process_generation(decodeCaption, taskCap, image.size)[taskCap] ?? ''
    if (typeof caption !== 'string') {
      continue
    }

    // 翻譯為中文
    const translatorResult = await translator(caption, {
      // @ts-expect-error 文件說有
      src_lang: 'eng_Latn',
      tgt_lang: 'zho_Hant',
    })

    console.log({
      file: path.basename(file),
      describe: {
        en: caption,
        zh: get(translatorResult, '[0].translation_text', ''),
      },
      ocr: ocrResult.data.text.replaceAll(' ', ''),
    })
  }

  ocrWorker.terminate()
}

main().catch((e) => {
  console.error(e)
})
