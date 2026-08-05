/** 讓程序化幾何長出 low poly 面感的共用工具。
 *
 * `CreateBox` / `CreateSphere` 直接用出來的東西，每個實例都一模一樣、
 * 每個面都平得像 CAD 圖。low poly 的美感不在「面很少」，而在
 * **每個面各自吃到不同角度的光**——所以面的朝向必須彼此不同，
 * 規規矩矩的對稱幾何反而是最沒有 low poly 味道的。
 *
 * 這裡把那份不規則程序化：頂點抖動改變每個面的法線、
 * 高度漸層讓同一塊形體由下而上有明暗，兩者一起才讀得出體積。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { applyHeightGradient } from '../geometry-utils'

/** 位置雜湊：同一個世界座標永遠得到同一組位移。
 *
 * 關鍵在於「按位置」而非「按頂點索引」——flat shading 會把共用頂點拆散成
 * 每面獨立的一份，若按索引各自抖動，相鄰面會在接縫處裂開。
 * 同位置同位移，網格才會整體變形而不破面。
 *
 * 對外開放給需要自訂變形規則的呼叫者（例如只准往某一側位移的牆面），
 * 這類需求用不上 applyVertexJitter 的等向抖動，但仍要同一套「同位置同結果」的保證
 */
export function hashPosition(x: number, y: number, z: number, seed: number, channel: number): number {
  // 座標先量化，浮點誤差才不會讓「同一個點」算出兩組位移
  const quantizedX = Math.round(x * 2048)
  const quantizedY = Math.round(y * 2048)
  const quantizedZ = Math.round(z * 2048)
  let hashValue = seed * 374761393 + channel * 668265263
  hashValue = Math.imul(hashValue ^ quantizedX, 2246822519)
  hashValue = Math.imul(hashValue ^ quantizedY, 3266489917)
  hashValue = Math.imul(hashValue ^ quantizedZ, 668265263)
  hashValue ^= hashValue >>> 15
  hashValue = Math.imul(hashValue, 2246822519)
  hashValue ^= hashValue >>> 13
  // 映射到 -1 ~ 1
  return ((hashValue >>> 0) / 2147483648) - 1
}

/** 一維值雜訊（-1 ~ 1）：整數格點各取一個雜湊值，格內以 smoothstep 內插。
 *
 * 要的是「連續但不重複」的起伏。正弦疊加寫起來簡單，但幾個波長一疊就會
 * 出現看得出來的節拍；值雜訊沒有週期，沿著同一條軸走多遠都不會回到原樣。
 * 位置吃的是無界的座標（例如世界 y），所以跨物件取樣也接得起來——
 * 相鄰的兩塊網格只要餵同一個種子，接縫處自然就對上，不必特別收邊
 */
export function sampleValueNoise(seed: number, channel: number, position: number): number {
  const cellIndex = Math.floor(position)
  const cellRatio = position - cellIndex
  const low = hashPosition(cellIndex, channel, 0, seed, 40)
  const high = hashPosition(cellIndex + 1, channel, 0, seed, 40)
  // smoothstep：線性內插會在格點留下折角，讀起來像一節節的
  const blend = cellRatio * cellRatio * (3 - 2 * cellRatio)
  return low + (high - low) * blend
}

/** 二維值雜訊（-1 ~ 1）：格點取雜湊值，格內雙線性內插。
 *
 * 一維版本只能做出整條橫紋。表面要讀成石頭而不是燈芯絨，
 * 起伏得同時沿兩個方向變化——但又不能退化成逐頂點亂數：
 * 細節的尺度必須由世界座標決定，網格加密時顆粒感才不會跟著碎成砂紙
 */
export function sampleValueNoise2d(
  seed: number,
  channel: number,
  x: number,
  y: number,
): number {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const ratioX = x - cellX
  const ratioY = y - cellY
  const blendX = ratioX * ratioX * (3 - 2 * ratioX)
  const blendY = ratioY * ratioY * (3 - 2 * ratioY)
  const lowLeft = hashPosition(cellX, cellY, channel, seed, 41)
  const lowRight = hashPosition(cellX + 1, cellY, channel, seed, 41)
  const highLeft = hashPosition(cellX, cellY + 1, channel, seed, 41)
  const highRight = hashPosition(cellX + 1, cellY + 1, channel, seed, 41)
  const low = lowLeft + (lowRight - lowLeft) * blendX
  const high = highLeft + (highRight - highLeft) * blendX
  return low + (high - low) * blendY
}

/** 二維細胞雜訊（-1 ~ 1）：位置落在哪一塊碎片，就取那塊碎片的雜湊值。
 *
 * 值雜訊給的是平滑的丘陵，石頭要的卻是「一塊塊平面，交界是硬稜」。
 * 同一塊碎片內的頂點拿到完全相同的值，那一片面就共平面，
 * 碎片邊界自然成為銳利的裂縫——低多邊形讀成岩石而不是皺紙的關鍵
 */
export function sampleCellNoise(
  seed: number,
  channel: number,
  x: number,
  y: number,
): number {
  const baseX = Math.floor(x)
  const baseY = Math.floor(y)
  let nearestDistance = Number.POSITIVE_INFINITY
  let nearestValue = 0
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const cellX = baseX + offsetX
      const cellY = baseY + offsetY
      // 碎片中心各自偏離格心，切出來才不是棋盤格
      const centerX = cellX + 0.5 + hashPosition(cellX, cellY, channel, seed, 42) * 0.45
      const centerY = cellY + 0.5 + hashPosition(cellX, cellY, channel, seed, 43) * 0.45
      const distance = (x - centerX) ** 2 + (y - centerY) ** 2
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestValue = hashPosition(cellX, cellY, channel, seed, 44)
      }
    }
  }
  return nearestValue
}

export interface VertexJitterOptions {
  /** 種子。同種子同形狀，所以要讓每個實例長得不一樣就換種子 */
  seed: number;
  /** 位移量（本地座標單位）。
   * low poly 要的是「每個面朝向都不同」，所以下手要比想像中重——
   * 抓網格最短邊的 6%~14%；低於 3% 看起來仍像規整的幾何體
   */
  amount: number;
  /** 各軸的位移倍率，預設等向。壓扁的物件把對應軸調小才不會變形過頭 */
  axisScale?: { x?: number; y?: number; z?: number };
  /** 底部不抖動的高度門檻（本地座標）。
   * 放在地上的東西若底面也抖，會浮起來或陷進地板
   */
  flatBottomBelowY?: number;
  /** 抖動後是否重算法線。flat shaded 網格必須重算，
   * 否則光影仍停留在抖動前的朝向，面就分不出來
   */
  shouldRecomputeNormals?: boolean;
}

/** 對網格頂點加入可重現的隨機位移。
 * 必須在 `convertToFlatShadedMesh()` 之後呼叫——先抖再轉會被重新分頂點蓋掉
 */
export function applyVertexJitter(mesh: Mesh, options: VertexJitterOptions): void {
  const {
    seed,
    amount,
    axisScale,
    flatBottomBelowY,
    shouldRecomputeNormals = true,
  } = options

  const positionList = mesh.getVerticesData(VertexBuffer.PositionKind)
  if (!positionList) {
    return
  }

  const scaleX = axisScale?.x ?? 1
  const scaleY = axisScale?.y ?? 1
  const scaleZ = axisScale?.z ?? 1

  for (let vertexIndex = 0; vertexIndex < positionList.length; vertexIndex += 3) {
    const originalX = positionList[vertexIndex]!
    const originalY = positionList[vertexIndex + 1]!
    const originalZ = positionList[vertexIndex + 2]!

    // 貼地的那一圈頂點保持原樣，物件才站得穩
    const isPinnedToGround = flatBottomBelowY !== undefined && originalY <= flatBottomBelowY

    positionList[vertexIndex] = originalX + hashPosition(originalX, originalY, originalZ, seed, 0) * amount * scaleX
    if (!isPinnedToGround) {
      positionList[vertexIndex + 1] = originalY + hashPosition(originalX, originalY, originalZ, seed, 1) * amount * scaleY
    }
    positionList[vertexIndex + 2] = originalZ + hashPosition(originalX, originalY, originalZ, seed, 2) * amount * scaleZ
  }

  // 這裡必須用 setVerticesData 而不是 updateVerticesData。
  // 內建產生器（CreateGround、CreateSphere⋯⋯）與 VertexData.applyToMesh 建出來的頂點緩衝
  // 預設不可更新，convertToFlatShadedMesh 又會原樣沿用這個旗標；
  // 而 Babylon 的 updateVerticesData 對不可更新的緩衝是靜靜地什麼都不做——
  // CPU 這份陣列改到了、法線與頂點色也照著新座標重算，唯獨 GPU 拿到的還是原始格點，
  // 於是畫面上看到的是「平整幾何配上碎面打光」。第三個參數就是把緩衝標成可更新
  mesh.setVerticesData(VertexBuffer.PositionKind, positionList, true)
  // 改頂點不會重算範圍。少了這行，變形過的網格會沿用
  // 建立時（例如半徑 1 的原始球）的包圍盒，視錐剔除因此形同虛設
  mesh.refreshBoundingInfo()
  if (shouldRecomputeNormals) {
    mesh.createNormals(true)
  }
}

export interface LowPolyMeshOptions extends VertexJitterOptions {
  /** 高度漸層的底部壓暗量。low poly 靠明暗階差讀形體，
   * 預設比紙材時期更重一些
   */
  darkenBottom?: number;
  /** 高度漸層的色相偏移（底冷頂暖） */
  hueShift?: number;
}

/** 低多邊形收尾的一站式處理：flat shading → 頂點抖動 → 高度漸層頂點色。
 *
 * 這是所有程序化建模的預設收尾動作。少了它，低多邊看起來就是塑膠。
 */
export function finishLowPolyMesh(mesh: Mesh, options: LowPolyMeshOptions): void {
  mesh.convertToFlatShadedMesh()
  applyVertexJitter(mesh, options)
  applyHeightGradient(mesh, options.darkenBottom ?? 0.28, options.hueShift ?? 0.06)
}

/** 給已經 flat shaded 的網格（例如 createBeveledBox 的產物）補上不規則。
 *
 * 與 finishLowPolyMesh 的差別只在不重複做 flat shading——
 * 對已分裂過頂點的網格再轉一次會白白多一份頂點資料。
 */
export function roughenLowPolyMesh(mesh: Mesh, options: LowPolyMeshOptions): void {
  applyVertexJitter(mesh, options)
  // 抖動改動了高度範圍，漸層重算才對得上新的頂與底
  applyHeightGradient(mesh, options.darkenBottom ?? 0.28, options.hueShift ?? 0.06)
}

export interface InstanceVariationOptions {
  seed: number;
  /** 縮放浮動幅度（0.08 = ±8%） */
  scaleRange?: number;
  /** 繞 Y 軸的隨機轉角上限（rad）。整圈隨機就填 Math.PI */
  yawRange?: number;
  /** 傾斜幅度（rad）。放在地上的東西給一點點就有「沒擺正」的自然感 */
  tiltRange?: number;
  /** 各軸獨立縮放，讓同一份幾何看起來胖瘦不一 */
  shouldVaryAxisScale?: boolean;
}

/** 讓同一份幾何的多個實例彼此不同：微幅縮放、轉向、傾斜。
 *
 * 頂點抖動處理「這一顆長得不規則」，這支處理「這一顆和旁邊那顆不一樣」。
 * 兩者都要有，一整排物件才不會看起來像複製貼上。
 */
export function applyInstanceVariation(
  node: TransformNode,
  options: InstanceVariationOptions,
): void {
  const {
    seed,
    scaleRange = 0.08,
    yawRange = Math.PI * 2,
    tiltRange = 0.05,
    shouldVaryAxisScale = true,
  } = options

  const baseScale = 1 + hashPosition(seed, 0, 0, seed, 3) * scaleRange
  if (shouldVaryAxisScale) {
    node.scaling.set(
      baseScale * (1 + hashPosition(seed, 1, 0, seed, 4) * scaleRange * 0.6),
      baseScale * (1 + hashPosition(seed, 2, 0, seed, 5) * scaleRange * 0.6),
      baseScale * (1 + hashPosition(seed, 3, 0, seed, 6) * scaleRange * 0.6),
    )
  }
  else {
    node.scaling.setAll(baseScale)
  }

  node.rotation.y += hashPosition(seed, 4, 0, seed, 7) * yawRange
  node.rotation.x += hashPosition(seed, 5, 0, seed, 8) * tiltRange
  node.rotation.z += hashPosition(seed, 6, 0, seed, 9) * tiltRange
}

export interface ClusteredAngleOptions {
  seed: number;
  count: number;
  /** 間隔不均勻度 0~1：0 = 等分。0.6 以上才看得出疏密群聚 */
  unevenness?: number;
  /** 整圈留白缺口的比例（0~0.5）。手作的放射物幾乎都有一側偏疏 */
  gapRatio?: number;
  /** 起始角。省略時由種子隨機，讓缺口方向每顆不同 */
  startAngle?: number;
}

/** 產生一圈「不等分」的放射角度：隨機間隔累加後正規化，自然形成疏密與群聚。
 *
 * `(index / count) * 2π` 加小抖動救不了等分——人眼抓的是節奏不是精度，
 * 等分骨架一眼就讀出程式味。間隔本身隨機（可差到數倍）再帶一個缺口，
 * 才是手插出來的樣子。
 */
export function createClusteredAngleList(options: ClusteredAngleOptions): number[] {
  const {
    seed,
    count,
    unevenness = 0.65,
    gapRatio = 0,
    startAngle,
  } = options

  const intervalList: number[] = []
  let intervalTotal = 0
  for (let index = 0; index < count; index++) {
    // 間隔下限 0.2：再擠也不會兩根疊在同一角度
    const interval = Math.max(0.2, 1 + hashPosition(index + 1, 0, 0, seed, 10) * unevenness)
    intervalList.push(interval)
    intervalTotal += interval
  }

  const usableAngle = Math.PI * 2 * (1 - Math.min(0.5, Math.max(0, gapRatio)))
  let cursor = startAngle ?? hashPosition(0, 0, 0, seed, 11) * Math.PI
  const angleList: number[] = []
  for (const interval of intervalList) {
    angleList.push(cursor)
    cursor += (interval / intervalTotal) * usableAngle
  }
  return angleList
}

/** 對稱迴圈（`for side of [-1, 1]`）用的左右差異量：同種子下左右各拿到
 * 一個穩定但不同的 0~1 值，乘上變化幅度就能讓鏡像零件「像同一對但不相等」。
 * 完美鏡像是程式味的重災區——真實生物與手作的左右一定有差。
 */
export function createSideVariation(seed: number, side: number, channel = 0): number {
  return (hashPosition(side * 7.3, channel, 0, seed, 12) + 1) / 2
}

/** 取一個穩定的整數種子。用物件的識別資訊（索引、座標）餵進去，
 * 同一顆石頭每次載入都長一樣，玩家記得住地形
 */
export function createSeedFrom(...valueList: number[]): number {
  let seedValue = 2166136261
  for (const value of valueList) {
    seedValue = Math.imul(seedValue ^ Math.round(value * 1000), 16777619)
  }
  return seedValue >>> 0
}
