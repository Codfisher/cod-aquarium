import type { Mesh, Scene } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 雲的圖樣
 *
 * 這一章的四個範例共用同一組函式。雲長什麼樣、影子落在哪，
 * 兩邊必須拿同一份資料，各算各的就會是兩朵不同的雲
 */

/** 一朵雲的圖樣所需要的噪音疊層 */
export interface CloudNoiseOctave {
  /** 格點密度，相對於圖樣邊長的比例 */
  density: number;
  /** 這一層佔的權重 */
  weight: number;
}

export interface TileableNoiseOption {
  /** 讀格點時座標要不要繞回去，關掉就不是可平鋪的了 */
  isWrapped?: boolean;
  /** 平滑內插，關掉就是直線內插 */
  isSmooth?: boolean;
}

/** 一段固定的亂數 */
export function createSeededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

/**
 * 平滑內插用的曲線
 *
 * 兩端的斜率都是零，接起來的格點之間才看不出直線的痕跡
 */
function smoothRatio(ratio: number): number {
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 可平鋪的值噪音
 *
 * 先在稀疏的格點上灑亂數，再平滑內插放大到圖樣的大小。
 * 讀格點時座標繞回去，所以放大出來的結果本身就是無縫平鋪的
 */
export function createTileableNoise(
  random: () => number,
  size: number,
  pointCount: number,
  option: TileableNoiseOption = {},
): number[] {
  const { isWrapped = true, isSmooth = true } = option
  const pointList = Array.from({ length: pointCount * pointCount }, () => random())

  const readPoint = (x: number, z: number) => {
    if (!isWrapped) {
      /** 繞不回去就只能夾住，圖樣的兩側於是對不起來 */
      const clampedX = Math.min(pointCount - 1, Math.max(0, x))
      const clampedZ = Math.min(pointCount - 1, Math.max(0, z))

      return pointList[clampedZ * pointCount + clampedX] ?? 0
    }

    const wrappedX = ((x % pointCount) + pointCount) % pointCount
    const wrappedZ = ((z % pointCount) + pointCount) % pointCount

    return pointList[wrappedZ * pointCount + wrappedX] ?? 0
  }

  const scale = pointCount / size

  return Array.from({ length: size * size }, (_, index) => {
    const x = (index % size) * scale
    const z = Math.floor(index / size) * scale
    const baseX = Math.floor(x)
    const baseZ = Math.floor(z)
    const ratioX = isSmooth ? smoothRatio(x - baseX) : x - baseX
    const ratioZ = isSmooth ? smoothRatio(z - baseZ) : z - baseZ

    const top = readPoint(baseX, baseZ) * (1 - ratioX)
      + readPoint(baseX + 1, baseZ) * ratioX
    const bottom = readPoint(baseX, baseZ + 1) * (1 - ratioX)
      + readPoint(baseX + 1, baseZ + 1) * ratioX

    return top * (1 - ratioZ) + bottom * ratioZ
  })
}

/**
 * 雲的圖樣
 *
 * 兩層噪音疊起來、取分位數當門檻。低頻那一層決定一朵雲多大，
 * 高頻那一層負責咬出邊緣的缺口
 */
export function createCloudPattern(
  random: () => number,
  size: number,
  coverage: number,
  octaveList: readonly CloudNoiseOctave[],
): boolean[] {
  const fieldList = Array.from({ length: size * size }, () => 0)

  for (const octave of octaveList) {
    const noiseList = createTileableNoise(random, size, Math.round(size * octave.density))
    for (let index = 0; index < fieldList.length; index++) {
      fieldList[index] = (fieldList[index] ?? 0) + (noiseList[index] ?? 0) * octave.weight
    }
  }

  /**
   * 門檻取分位數
   *
   * 兩層噪音疊起來的分布會隨權重跑，寫死一個值就得重新試一輪。
   * 由大到小排完取第 N 名當門檻，說覆蓋幾成就真的是幾成
   */
  const sortedList = fieldList.slice().sort((a, b) => b - a)
  const threshold = sortedList[Math.floor(sortedList.length * coverage)] ?? Number.POSITIVE_INFINITY

  return fieldList.map((value) => value > threshold)
}

/** 繞著圖樣邊界讀，這與雲層那邊的規則是同一套 */
function readWrapped(valueList: number[], size: number, x: number, z: number): number {
  const wrappedX = ((x % size) + size) % size
  const wrappedZ = ((z % size) + size) % size

  return valueList[wrappedZ * size + wrappedX] ?? 0
}

/**
 * 把每一格雲切成 factor 個紋素
 *
 * 純放大，不內插。要的只是讓後面的模糊有比較細的格子可以糊
 */
export function upsamplePattern(cellList: boolean[], size: number, factor: number): number[] {
  const fineSize = size * factor

  return Array.from({ length: fineSize * fineSize }, (_, index) => {
    const x = Math.floor((index % fineSize) / factor)
    const z = Math.floor(Math.floor(index / fineSize) / factor)

    return cellList[z * size + x] ? 1 : 0
  })
}

/**
 * 把全有全無的雲格糊成有濃淡的覆蓋率
 *
 * 三乘三取平均，跑幾輪。邊界要繞回去，否則圖樣接縫上會出現一條亮線，
 * 而這張圖是要拿去無限平鋪的
 */
export function blurPattern(cellValueList: number[], size: number, passCount = 2): number[] {
  let valueList: number[] = cellValueList.slice()

  for (let pass = 0; pass < passCount; pass++) {
    const nextList = valueList.slice()
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        let total = 0
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            total += readWrapped(valueList, size, x + offsetX, z + offsetZ)
          }
        }
        nextList[z * size + x] = total / 9
      }
    }
    valueList = nextList
  }

  /**
   * 糊完之後把最濃的一格拉回滿格
   *
   * 三乘三取平均只有在「一朵雲寬到中心那格的鄰居全是雲」時才留得住 1.0，
   * 而多數雲不到那麼大。門檻卻是照著 0 到 1 訂的，
   * 不正規化的話最深的雲影也永遠踩不到滿格
   */
  const peak = Math.max(...valueList)
  if (peak <= 0) {
    return valueList
  }

  return valueList.map((value) => value / peak)
}

export interface CloudMeshParam {
  babylon: BabylonModule;
  scene: Scene;
  name: string;
  cellList: boolean[];
  patternCount: number;
  cellSize: number;
  thickness: number;
  /** 平鋪幾份 */
  tileCount: number;
  /** 鄰居是雲的那一面要不要剔除 */
  isCulled: boolean;
}

/**
 * 整片雲做成一個網格
 *
 * 每一朵雲都是實際的方塊，所以看得到厚度與側面。
 * 面剔除打開時只畫露在外面的那些面，關掉就是每一格各畫六面
 */
export function createCloudMesh(param: CloudMeshParam): Mesh {
  const { babylon, scene, name, cellList, patternCount, cellSize, thickness, tileCount, isCulled } = param

  const readCell = (x: number, z: number) => {
    /** 座標繞回去，圖樣才能無縫平鋪 */
    const wrappedX = ((x % patternCount) + patternCount) % patternCount
    const wrappedZ = ((z % patternCount) + patternCount) % patternCount

    return cellList[wrappedZ * patternCount + wrappedX] === true
  }

  const halfCount = (patternCount * tileCount) / 2
  const positionList: number[] = []
  const normalList: number[] = []
  const indexList: number[] = []

  const addQuad = (
    cornerList: [number, number, number][],
    normal: [number, number, number],
  ) => {
    const baseIndex = positionList.length / 3
    for (const corner of cornerList) {
      positionList.push(corner[0], corner[1], corner[2])
      normalList.push(normal[0], normal[1], normal[2])
    }
    indexList.push(
      baseIndex,
      baseIndex + 1,
      baseIndex + 2,
      baseIndex,
      baseIndex + 2,
      baseIndex + 3,
    )
  }

  const isFilled = (x: number, z: number) => {
    if (x < -halfCount || x >= halfCount || z < -halfCount || z >= halfCount)
      return false

    return readCell(x, z)
  }

  /** 鄰居是雲就跳過那一面，關掉剔除時一律畫出來 */
  const isFaceVisible = (x: number, z: number) => !isCulled || !isFilled(x, z)

  const halfThickness = thickness / 2
  for (let x = -halfCount; x < halfCount; x++) {
    for (let z = -halfCount; z < halfCount; z++) {
      if (!isFilled(x, z))
        continue

      const minX = x * cellSize
      const maxX = minX + cellSize
      const minZ = z * cellSize
      const maxZ = minZ + cellSize

      addQuad([
        [minX, halfThickness, minZ],
        [minX, halfThickness, maxZ],
        [maxX, halfThickness, maxZ],
        [maxX, halfThickness, minZ],
      ], [0, 1, 0])

      addQuad([
        [minX, -halfThickness, maxZ],
        [minX, -halfThickness, minZ],
        [maxX, -halfThickness, minZ],
        [maxX, -halfThickness, maxZ],
      ], [0, -1, 0])

      if (isFaceVisible(x - 1, z)) {
        addQuad([
          [minX, halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, -halfThickness, maxZ],
          [minX, halfThickness, maxZ],
        ], [-1, 0, 0])
      }
      if (isFaceVisible(x + 1, z)) {
        addQuad([
          [maxX, halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, -halfThickness, minZ],
          [maxX, halfThickness, minZ],
        ], [1, 0, 0])
      }
      if (isFaceVisible(x, z - 1)) {
        addQuad([
          [maxX, halfThickness, minZ],
          [maxX, -halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, halfThickness, minZ],
        ], [0, 0, -1])
      }
      if (isFaceVisible(x, z + 1)) {
        addQuad([
          [minX, halfThickness, maxZ],
          [minX, -halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, halfThickness, maxZ],
        ], [0, 0, 1])
      }
    }
  }

  const mesh = new babylon.Mesh(name, scene)
  const vertexData = new babylon.VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  mesh.isPickable = false

  return mesh
}
