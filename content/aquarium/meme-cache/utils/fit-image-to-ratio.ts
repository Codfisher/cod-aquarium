export interface OutputRatioOption {
  value: string;
  label: string;
  /** 寬高比，null 表示保持原始尺寸 */
  ratio: number | null;
}

/** 各平台常見的版位比例，補邊而非裁切，免得把梗圖的字切掉 */
export const OUTPUT_RATIO_LIST: OutputRatioOption[] = [
  { value: 'origin', label: '原始尺寸', ratio: null },
  { value: 'square', label: '方形 1:1', ratio: 1 },
  { value: 'story', label: '限動 9:16', ratio: 9 / 16 },
  { value: 'landscape', label: '橫幅 16:9', ratio: 16 / 9 },
]

export const DEFAULT_OUTPUT_RATIO_VALUE = 'origin'

export function getOutputRatioOption(value: string | undefined): OutputRatioOption {
  return OUTPUT_RATIO_LIST.find((item) => item.value === value) ?? OUTPUT_RATIO_LIST[0]!
}

/**
 * 將圖片置中補邊成指定比例。
 *
 * 已符合比例、或未指定比例時直接回傳原圖，不做多餘的重新編碼。
 */
export async function fitImageToRatio(
  blob: Blob,
  ratio: number | null,
  backgroundColor = '#FFF',
): Promise<Blob> {
  if (!ratio)
    return blob

  const bitmap = await createImageBitmap(blob)
  const { width: sourceWidth, height: sourceHeight } = bitmap

  const targetWidth = Math.max(sourceWidth, Math.round(sourceHeight * ratio))
  const targetHeight = Math.max(sourceHeight, Math.round(sourceWidth / ratio))

  if (targetWidth === sourceWidth && targetHeight === sourceHeight) {
    bitmap.close()
    return blob
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return blob
  }

  context.fillStyle = backgroundColor
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(
    bitmap,
    Math.round((targetWidth - sourceWidth) / 2),
    Math.round((targetHeight - sourceHeight) / 2),
  )
  bitmap.close()

  const result = await new Promise<Blob | null>(
    (resolve) => canvas.toBlob(resolve, 'image/png'),
  )
  return result ?? blob
}
