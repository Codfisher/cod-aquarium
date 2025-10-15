import { readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  AutoProcessor,
  Florence2ForConditionalGeneration,
  Florence2Processor,
  load_image,
  Tensor,
} from '@huggingface/transformers'

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

  const task = '<MORE_DETAILED_CAPTION>'
  const prompts = processor.construct_prompts(task)

  const memeFiles = await getMemeFiles(FILE_PATH)
  for (const file of memeFiles) {
    const image = await load_image(file)

    // ---------- Pass 1: OCR ----------
    const taskOCR = '<OCR>'
    const promptsOCR = processor.construct_prompts(taskOCR)
    const inputsOCR = await processor(image, promptsOCR)
    const outOCR = await model.generate({
      ...inputsOCR,
      max_new_tokens: 64,
      num_beams: 4,
      do_sample: false,
      no_repeat_ngram_size: 2,
    })
    if (!(outOCR instanceof Tensor)) {
      continue
    }

    const textOCR = processor.batch_decode(outOCR, { skip_special_tokens: false })[0]
    if (!textOCR) {
      continue
    }

    const ocr = processor.post_process_generation(textOCR, taskOCR, image.size)[taskOCR] ?? ''

    // ---------- Pass 2: Caption ----------
    const taskCap = '<MORE_DETAILED_CAPTION>'
    const promptsCap = processor.construct_prompts(taskCap)
    const inputsCap = await processor(image, promptsCap)
    const outCap = await model.generate({
      ...inputsCap,
      max_new_tokens: 120,
      num_beams: 4,
      do_sample: false,
      no_repeat_ngram_size: 2,
    })
    if (!(outCap instanceof Tensor)) {
      continue
    }

    const textCap = processor.batch_decode(outCap, { skip_special_tokens: false })[0]
    if (!textCap) {
      continue
    }

    const cap = processor.post_process_generation(textCap, taskCap, image.size)[taskCap] ?? ''

    // ---------- 合併輸出 ----------
    const merged = ocr ? `${cap} Text on image: ${ocr}` : cap
    console.log(`${path.basename(file)} => ${merged}`)
  }
}

main().catch((e) => {
  console.error(e)
})
