import type { BlockLightSource } from '../world/light-source'
import { BlockId, isPassableBlock } from '../block/block-constants'
import { getBlockAlbedo } from '../world/block-albedo'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'

/**
 * 粗網格一格對應幾格世界方塊
 *
 * 水平方向粗一點沒關係，垂直方向不能——世界只有四十格高，
 * 等向的粗細會讓天空可見度的判斷只剩十格解析度，洞穴口與林冠交界
 * 那種一兩格內就從露天變陰暗的地方會整格連著暗（或連著亮）。
 * 垂直切細一倍，水平維持粗的，總格數也才不會爆。
 *
 * 這兩個數字現在由畫質設定表給（giCellSizeXZ / giCellSizeY），
 * 它們同時決定 3D 貼圖的大小與每一輪傳播要走過幾格——
 * 是整套全局光最有效的一根旋鈕
 */
export interface VoxelGiCellSize {
  xz: number;
  y: number;
}

/**
 * 這一格上面壓幾層實心，天空可見度就收掉多少
 *
 * 三到四層粗格（六到八格世界方塊）大致就該完全遮住天光了
 */
const SKY_BLOCK_FACTOR = 0.3

/** 沒有任何實心方塊落在這一格時的反照色，不影響傳播，只是占位 */
const EMPTY_CELL_ALBEDO: readonly [number, number, number] = [0.62, 0.6, 0.56]

export interface VoxelGiGrid {
  gridX: number;
  gridY: number;
  gridZ: number;
  /** 1 為這格大致是實心的（擋光、也反光），0 為大致開放（光在裡面流動） */
  solidList: Uint8Array;
  /** 每格的概略反照色，長度是格數乘三，[r,g,b] 連續排列 */
  albedoList: Float32Array;
  /** 每格能看到多少天空，0~1，只有開放格用得到 */
  skyVisibilityList: Float32Array;
}

/** 粗網格的一維索引，寫法比照 world-constants 的 coordinateToIndex */
export function giCoordinateToIndex(grid: Pick<VoxelGiGrid, 'gridY' | 'gridZ'>, x: number, y: number, z: number): number {
  return (x * grid.gridY + y) * grid.gridZ + z
}

/**
 * 把世界方塊降採樣成一份粗網格
 *
 * 只在世界生成完之後跑一次——這個世界不可編輯，方塊的位置與顏色
 * 從頭到尾不會變，值得記住的只有「這裡大致是實心的還是開放的」
 * 與「這裡的反照色大致是什麼」，不必每次重烘全局光都重新掃一次
 */
export function buildVoxelGiGrid(worldState: Uint8Array, cellSize: VoxelGiCellSize): VoxelGiGrid {
  const gridX = Math.ceil(WORLD_SIZE / cellSize.xz)
  const gridZ = gridX
  const gridY = Math.ceil(WORLD_HEIGHT / cellSize.y)
  const cellCount = gridX * gridY * gridZ

  const solidCountList = new Uint32Array(cellCount)
  const totalCountList = new Uint32Array(cellCount)
  const albedoSumList = new Float32Array(cellCount * 3)

  for (let x = 0; x < WORLD_SIZE; x++) {
    const cx = Math.min(gridX - 1, Math.floor(x / cellSize.xz))
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      const cy = Math.min(gridY - 1, Math.floor(y / cellSize.y))
      for (let z = 0; z < WORLD_SIZE; z++) {
        const cz = Math.min(gridZ - 1, Math.floor(z / cellSize.xz))
        const cellIndex = (cx * gridY + cy) * gridZ + cz

        totalCountList[cellIndex]! += 1

        const blockId = worldState[coordinateToIndex(x, y, z)] as BlockId
        if (blockId === BlockId.AIR || isPassableBlock(blockId))
          continue

        solidCountList[cellIndex]! += 1

        const albedo = getBlockAlbedo(blockId)
        albedoSumList[cellIndex * 3]! += albedo[0]
        albedoSumList[cellIndex * 3 + 1]! += albedo[1]
        albedoSumList[cellIndex * 3 + 2]! += albedo[2]
      }
    }
  }

  const solidList = new Uint8Array(cellCount)
  const albedoList = new Float32Array(cellCount * 3)

  for (let i = 0; i < cellCount; i++) {
    const solidCount = solidCountList[i]!
    /** 過半是實心才算實心，邊界格常常一半空氣一半石頭 */
    solidList[i] = solidCount * 2 > totalCountList[i]! ? 1 : 0

    if (solidCount > 0) {
      albedoList[i * 3] = albedoSumList[i * 3]! / solidCount
      albedoList[i * 3 + 1] = albedoSumList[i * 3 + 1]! / solidCount
      albedoList[i * 3 + 2] = albedoSumList[i * 3 + 2]! / solidCount
    }
    else {
      albedoList[i * 3] = EMPTY_CELL_ALBEDO[0]
      albedoList[i * 3 + 1] = EMPTY_CELL_ALBEDO[1]
      albedoList[i * 3 + 2] = EMPTY_CELL_ALBEDO[2]
    }
  }

  /**
   * 天空可見度：由上往下數，累積「上面已經壓了幾層實心」
   *
   * 最頂上那一格永遠是滿的（上面什麼都沒有），往下每過一層實心就收掉一截
   */
  const skyVisibilityList = new Float32Array(cellCount)
  for (let cx = 0; cx < gridX; cx++) {
    for (let cz = 0; cz < gridZ; cz++) {
      let solidAbove = 0
      for (let cy = gridY - 1; cy >= 0; cy--) {
        const index = (cx * gridY + cy) * gridZ + cz
        skyVisibilityList[index] = Math.max(0, 1 - solidAbove * SKY_BLOCK_FACTOR)
        if (solidList[index] === 1) {
          solidAbove++
        }
      }
    }
  }

  return { gridX, gridY, gridZ, solidList, albedoList, skyVisibilityList }
}

/**
 * 把燈火清單裡的每一盞燈歸進它所在的粗格
 *
 * 燈的位置與顏色是靜態的（世界不可編輯），只有這一步的分類結果需要傳給
 * 烘焙用的 worker；worker 那邊不必知道燈原本站在世界座標的哪一點
 */
export interface VoxelGiLightSeed {
  cellIndex: number;
  level: number;
  color: readonly [number, number, number];
}

export function collectVoxelGiLightSeedList(
  grid: Pick<VoxelGiGrid, 'gridX' | 'gridY' | 'gridZ'>,
  lightSourceList: readonly BlockLightSource[],
  cellSize: VoxelGiCellSize,
): VoxelGiLightSeed[] {
  return lightSourceList.map((source) => {
    const cx = Math.min(grid.gridX - 1, Math.floor(source.x / cellSize.xz))
    const cy = Math.min(grid.gridY - 1, Math.floor(source.y / cellSize.y))
    const cz = Math.min(grid.gridZ - 1, Math.floor(source.z / cellSize.xz))

    return {
      cellIndex: (cx * grid.gridY + cy) * grid.gridZ + cz,
      level: source.level,
      color: source.color,
    }
  })
}
