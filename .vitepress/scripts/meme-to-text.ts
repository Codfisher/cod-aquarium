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
  const modelId = 'onnx-community/Florence-2-base-ft'
  const processor = (await AutoProcessor.from_pretrained(modelId))
  if (!(processor instanceof Florence2Processor)) {
    return
  }

  const model = await Florence2ForConditionalGeneration.from_pretrained(modelId, { dtype: 'q8' })

  const task = '<MORE_DETAILED_CAPTION>'
  const prompts = processor.construct_prompts(task)

  const memeFiles = await getMemeFiles(FILE_PATH)
  for (const file of memeFiles) {
    // ✅ 1) load_image 只吃檔案路徑/URL
    const image = await load_image(file)

    // ✅ 2) 把「image + prompts」一起丟給 processor，才會產生 attention_mask 等文字張量
    const inputs = await processor(image, prompts)

    const generatedIds = await model.generate({ ...inputs, max_new_tokens: 120 })
    if (!(generatedIds instanceof Tensor)) {
      continue
    }

    const generatedText = processor.batch_decode(generatedIds, { skip_special_tokens: false })[0]
    if (!generatedText) {
      continue
    }
    const result = processor.post_process_generation(generatedText, task, image.size)

    console.log(`${path.basename(file)} => ${result[task]}`)
  }
}

main().catch((e) => {
  console.error(e)
})
