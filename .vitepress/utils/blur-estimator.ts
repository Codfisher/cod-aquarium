import type { Buffer } from 'node:buffer'
import sharp from 'sharp'

/** 圖片模糊等級，分成 3 級 */
export enum BlurLevel {
  /** 清晰 */
  LEVEL_0,
  /** 稍微模糊 */
  LEVEL_1,
  /** 非常模糊 */
  LEVEL_2,
}

const RESIZE_TARGET = 200
const EDGE_THRESHOLD = 25
const MAX_EDGE_WIDTH = 20
const GRID = 4

interface ImageFeatures {
  /** 分塊 Laplacian P75 的 P25 */
  laplacianP25: number;
  /** 邊緣寬度 P75（量化邊緣柔化程度） */
  edgeWidthP75: number;
  /** 梯度 P90 / P50 比值 */
  gradientRatio: number;
  /** 雙階 Haar 小波 HH 能量比 (HH1 / HH2) */
  waveletRatio: number;
  /** 多尺度 Laplacian 能量比（尺度 1 / 尺度 3） */
  laplacianScaleRatio: number;
}

/** 判定圖片的模糊等級
 *
 * 分類規則針對 16 張示範圖人工調校，屬示範性質。
 * 若要推廣到更大資料集，閾值需要重新擬合
 */
export async function computeBlurLevel(filePath: string): Promise<BlurLevel> {
  const { data, info } = await sharp(filePath)
    .rotate()
    .resize(RESIZE_TARGET, RESIZE_TARGET, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  if (width < 10 || height < 10) {
    throw new Error(`圖片尺寸過小（${width}x${height}），無法判定模糊程度`)
  }

  const features = extractFeatures(data, width, height)
  return classifyByFeatures(features)
}

function extractFeatures(data: Buffer, width: number, height: number): ImageFeatures {
  return {
    laplacianP25: computeLaplacianP25(data, width, height),
    edgeWidthP75: computeEdgeWidthP75(data, width, height),
    gradientRatio: computeGradientRatio(data, width, height),
    waveletRatio: computeWaveletRatio(data, width, height),
    laplacianScaleRatio: computeLaplacianScaleRatio(data, width, height),
  }
}

function classifyByFeatures(features: ImageFeatures): BlurLevel {
  const { laplacianP25, edgeWidthP75, gradientRatio, waveletRatio, laplacianScaleRatio } = features

  // 邊緣寬度明顯偏大：對焦失準或低解析度放大
  if (edgeWidthP75 >= 9) {
    return BlurLevel.LEVEL_2
  }

  // 高頻細節近乎消失：整體柔化的模糊相片
  if (waveletRatio < 2.15) {
    return BlurLevel.LEVEL_2
  }

  // 邊緣對比弱且高頻偏低：缺乏清晰的邊緣
  if (gradientRatio < 7 && waveletRatio < 3) {
    return BlurLevel.LEVEL_2
  }

  // 多尺度下細節不足且高頻偏低：整體細節模糊
  if (laplacianScaleRatio < 0.7
    && waveletRatio < 3
    && laplacianP25 < 30
    && gradientRatio < 20) {
    return BlurLevel.LEVEL_2
  }

  // 密集細文字（古籍、捲軸風格），尚能辨識但不夠清爽
  if (laplacianP25 >= 40 && laplacianScaleRatio >= 1.2) {
    return BlurLevel.LEVEL_1
  }

  // 相片有細節但整體銳利度不足
  if (waveletRatio >= 3
    && waveletRatio < 3.8
    && edgeWidthP75 >= 5
    && laplacianP25 < 20
    && laplacianScaleRatio < 0.9) {
    return BlurLevel.LEVEL_1
  }

  return BlurLevel.LEVEL_0
}

function computeLaplacianP25(data: Buffer, width: number, height: number): number {
  const blockWidth = Math.floor(width / GRID)
  const blockHeight = Math.floor(height / GRID)
  const blockScoreList: number[] = []

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const score = computeBlockLaplacianP75(
        data,
        width,
        height,
        gx * blockWidth,
        gy * blockHeight,
        blockWidth,
        blockHeight,
      )
      blockScoreList.push(score)
    }
  }

  blockScoreList.sort((a, b) => a - b)
  return blockScoreList[Math.floor(blockScoreList.length / 4)] ?? 0
}

function computeBlockLaplacianP75(
  data: Buffer,
  width: number,
  height: number,
  startX: number,
  startY: number,
  blockWidth: number,
  blockHeight: number,
): number {
  const bucketList = new Uint32Array(1021)
  let total = 0
  const endY = startY + blockHeight
  const endX = startX + blockWidth

  for (let y = Math.max(startY, 1); y < Math.min(endY, height - 1); y++) {
    for (let x = Math.max(startX, 1); x < Math.min(endX, width - 1); x++) {
      const index = y * width + x
      const center = data[index] ?? 0
      const top = data[(y - 1) * width + x] ?? 0
      const bottom = data[(y + 1) * width + x] ?? 0
      const left = data[y * width + (x - 1)] ?? 0
      const right = data[y * width + (x + 1)] ?? 0
      const value = Math.abs(-4 * center + top + bottom + left + right)
      bucketList[value] = (bucketList[value] ?? 0) + 1
      total++
    }
  }

  if (total === 0) {
    return 0
  }

  const target = Math.floor(total * 0.75)
  let cumulative = 0
  for (let i = 0; i < bucketList.length; i++) {
    cumulative += bucketList[i]!
    if (cumulative > target) {
      return i
    }
  }
  return 0
}

function computeEdgeWidthP75(data: Buffer, width: number, height: number): number {
  const widthList: number[] = []

  // 垂直邊緣（水平梯度的局部極值）
  for (let y = 1; y < height - 1; y++) {
    for (let x = 2; x < width - 2; x++) {
      const index = y * width + x
      const dxCenter = (data[index + 1] ?? 0) - (data[index - 1] ?? 0)
      const dxMagnitude = Math.abs(dxCenter)
      if (dxMagnitude < EDGE_THRESHOLD) {
        continue
      }

      const dxBefore = (data[index] ?? 0) - (data[index - 2] ?? 0)
      const dxAfter = (data[index + 2] ?? 0) - (data[index] ?? 0)
      if (Math.abs(dxBefore) > dxMagnitude || Math.abs(dxAfter) >= dxMagnitude) {
        continue
      }

      const direction = Math.sign(dxCenter)
      const centerPixel = data[index] ?? 0

      let leftBound = x
      let leftPixel = centerPixel
      while (leftBound > 1 && x - leftBound < MAX_EDGE_WIDTH) {
        const neighborPixel = data[y * width + leftBound - 1] ?? 0
        if (Math.sign(neighborPixel - leftPixel) === direction) {
          break
        }
        leftPixel = neighborPixel
        leftBound--
      }

      let rightBound = x
      let rightPixel = centerPixel
      while (rightBound < width - 2 && rightBound - x < MAX_EDGE_WIDTH) {
        const neighborPixel = data[y * width + rightBound + 1] ?? 0
        if (Math.sign(neighborPixel - rightPixel) === -direction) {
          break
        }
        rightPixel = neighborPixel
        rightBound++
      }

      const edgeWidth = rightBound - leftBound
      if (edgeWidth > 0 && edgeWidth <= MAX_EDGE_WIDTH) {
        widthList.push(edgeWidth)
      }
    }
  }

  // 水平邊緣（垂直梯度的局部極值）
  for (let x = 1; x < width - 1; x++) {
    for (let y = 2; y < height - 2; y++) {
      const index = y * width + x
      const dyCenter = (data[index + width] ?? 0) - (data[index - width] ?? 0)
      const dyMagnitude = Math.abs(dyCenter)
      if (dyMagnitude < EDGE_THRESHOLD) {
        continue
      }

      const dyBefore = (data[index] ?? 0) - (data[index - 2 * width] ?? 0)
      const dyAfter = (data[index + 2 * width] ?? 0) - (data[index] ?? 0)
      if (Math.abs(dyBefore) > dyMagnitude || Math.abs(dyAfter) >= dyMagnitude) {
        continue
      }

      const direction = Math.sign(dyCenter)
      const centerPixel = data[index] ?? 0

      let topBound = y
      let topPixel = centerPixel
      while (topBound > 1 && y - topBound < MAX_EDGE_WIDTH) {
        const neighborPixel = data[(topBound - 1) * width + x] ?? 0
        if (Math.sign(neighborPixel - topPixel) === direction) {
          break
        }
        topPixel = neighborPixel
        topBound--
      }

      let bottomBound = y
      let bottomPixel = centerPixel
      while (bottomBound < height - 2 && bottomBound - y < MAX_EDGE_WIDTH) {
        const neighborPixel = data[(bottomBound + 1) * width + x] ?? 0
        if (Math.sign(neighborPixel - bottomPixel) === -direction) {
          break
        }
        bottomPixel = neighborPixel
        bottomBound++
      }

      const edgeWidth = bottomBound - topBound
      if (edgeWidth > 0 && edgeWidth <= MAX_EDGE_WIDTH) {
        widthList.push(edgeWidth)
      }
    }
  }

  if (widthList.length === 0) {
    return 0
  }

  widthList.sort((a, b) => a - b)
  return widthList[Math.floor(widthList.length * 0.75)] ?? 0
}

function computeGradientRatio(data: Buffer, width: number, height: number): number {
  const gradientList: number[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      const gradientX = (data[index + 1] ?? 0) - (data[index - 1] ?? 0)
      const gradientY = (data[index + width] ?? 0) - (data[index - width] ?? 0)
      gradientList.push(Math.sqrt(gradientX * gradientX + gradientY * gradientY))
    }
  }

  gradientList.sort((a, b) => a - b)
  const p50 = gradientList[Math.floor(gradientList.length * 0.5)] ?? 0
  const p90 = gradientList[Math.floor(gradientList.length * 0.9)] ?? 0
  if (p50 === 0) {
    return 0
  }
  return p90 / p50
}

function computeWaveletRatio(data: Buffer, width: number, height: number): number {
  const pixels = bufferToFloat32(data)
  const level1 = haarDecompose(pixels, width, height)
  const level2 = haarDecompose(level1.ll, level1.width, level1.height)
  if (level2.hhEnergy === 0) {
    return 0
  }
  return level1.hhEnergy / level2.hhEnergy
}

interface HaarResult {
  ll: Float32Array;
  hhEnergy: number;
  width: number;
  height: number;
}

/** 單階 Haar 小波分解。LL 取 2×2 平均（非標準正交變換），
 * 因後續只用比值不影響結論
 */
function haarDecompose(data: Float32Array, width: number, height: number): HaarResult {
  const halfWidth = Math.floor(width / 2)
  const halfHeight = Math.floor(height / 2)
  const ll = new Float32Array(halfWidth * halfHeight)
  let hhEnergy = 0

  for (let y = 0; y < halfHeight; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const topLeft = data[(2 * y) * width + 2 * x] ?? 0
      const topRight = data[(2 * y) * width + 2 * x + 1] ?? 0
      const bottomLeft = data[(2 * y + 1) * width + 2 * x] ?? 0
      const bottomRight = data[(2 * y + 1) * width + 2 * x + 1] ?? 0
      ll[y * halfWidth + x] = (topLeft + topRight + bottomLeft + bottomRight) / 4
      const lh = (topLeft + topRight - bottomLeft - bottomRight) / 4
      const hl = (topLeft - topRight + bottomLeft - bottomRight) / 4
      const hh = (topLeft - topRight - bottomLeft + bottomRight) / 4
      hhEnergy += lh * lh + hl * hl + hh * hh
    }
  }
  return { ll, hhEnergy, width: halfWidth, height: halfHeight }
}

function computeLaplacianScaleRatio(data: Buffer, width: number, height: number): number {
  const pixels = bufferToFloat32(data)
  const level1Energy = computeLaplacianEnergy(pixels, width, height)
  const down1 = haarDecompose(pixels, width, height)
  const down2 = haarDecompose(down1.ll, down1.width, down1.height)
  const level3Energy = computeLaplacianEnergy(down2.ll, down2.width, down2.height)

  if (level3Energy === 0) {
    return 0
  }
  return level1Energy / level3Energy
}

function computeLaplacianEnergy(data: Float32Array, width: number, height: number): number {
  let energy = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      const center = data[index] ?? 0
      const top = data[index - width] ?? 0
      const bottom = data[index + width] ?? 0
      const left = data[index - 1] ?? 0
      const right = data[index + 1] ?? 0
      const laplacianValue = -4 * center + top + bottom + left + right
      energy += laplacianValue * laplacianValue
    }
  }
  return Math.sqrt(energy / (width * height))
}

function bufferToFloat32(data: Buffer): Float32Array {
  const pixels = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) {
    pixels[i] = data[i] ?? 0
  }
  return pixels
}
