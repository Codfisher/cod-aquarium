/**
 * 範例用的迷你世界與整套全局光烘焙
 *
 * 本體那份跑在 Web Worker 裡、面對的是一整座庭園；這裡把同一套算式
 * 縮到十六格見方的一個牆角，好讓每一步都看得見中間結果。
 * 算式本身完全照抄，只有規模不一樣
 */

export const WORLD_SIZE_X = 16
export const WORLD_SIZE_Y = 8
export const WORLD_SIZE_Z = 16

export const BlockId = {
  AIR: 0,
  STONE: 1,
  RED: 2,
  GREEN: 3,
  LAMP: 4,
} as const

export type BlockIdValue = typeof BlockId[keyof typeof BlockId]

/**
 * 每種方塊的概略反照色
 *
 * 本體那份是從方塊定義的 tint 讀出來的，沒有 tint 的退回中性灰。
 * 這裡直接寫死，因為總共只有四種
 */
export const BLOCK_ALBEDO_LIST: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [0.72, 0.7, 0.66],
  [0.82, 0.2, 0.16],
  [0.24, 0.66, 0.24],
  [0.95, 0.84, 0.56],
]

/** 這一格上面壓幾層實心，天空可見度就收掉多少 */
const SKY_BLOCK_FACTOR = 0.3

/** 沒有任何實心方塊落在這一格時的反照色，不影響傳播，只是占位 */
const EMPTY_CELL_ALBEDO: readonly [number, number, number] = [0.62, 0.6, 0.56]

export interface DemoWorld {
  /** 每一格的方塊編號，索引順序與 toWorldIndex 一致 */
  blockList: Uint8Array;
  /** 會發光的方塊落在哪裡 */
  lampList: { x: number; y: number; z: number; color: readonly [number, number, number] }[];
}

export function toWorldIndex(x: number, y: number, z: number): number {
  return (x * WORLD_SIZE_Y + y) * WORLD_SIZE_Z + z
}

/**
 * 一個紅綠兩面牆的角落
 *
 * 這是最省事、也最看得出間接光的擺法：白色的地板同時挨著兩面
 * 飽和的牆，光反彈一輪之後，地上靠紅牆那側會泛紅、靠綠牆那側會泛綠。
 * 單色的場景做不到這件事，因為反彈回來的顏色跟原本一樣
 */
export function createDemoWorld(): DemoWorld {
  const blockList = new Uint8Array(WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z)

  for (let x = 0; x < WORLD_SIZE_X; x++) {
    for (let z = 0; z < WORLD_SIZE_Z; z++) {
      for (let y = 0; y < 2; y++) {
        blockList[toWorldIndex(x, y, z)] = BlockId.STONE
      }
    }
  }

  /** 紅牆貼著 X 的小端，綠牆貼著 Z 的小端，兩片在角落交會 */
  for (let z = 0; z < WORLD_SIZE_Z; z++) {
    for (let y = 2; y < 7; y++) {
      blockList[toWorldIndex(0, y, z)] = BlockId.RED
      blockList[toWorldIndex(1, y, z)] = BlockId.RED
    }
  }
  for (let x = 0; x < WORLD_SIZE_X; x++) {
    for (let y = 2; y < 7; y++) {
      blockList[toWorldIndex(x, y, 0)] = BlockId.GREEN
      blockList[toWorldIndex(x, y, 1)] = BlockId.GREEN
    }
  }

  /** 一叢懸空的石塊，天空可見度才有東西可以擋 */
  for (let x = 8; x < 13; x++) {
    for (let z = 8; z < 13; z++) {
      blockList[toWorldIndex(x, 6, z)] = BlockId.STONE
    }
  }

  /** 一盞燈嵌在紅牆上，燈火的種子從這裡長出來 */
  const lampX = 1
  const lampY = 4
  const lampZ = 9
  blockList[toWorldIndex(lampX, lampY, lampZ)] = BlockId.LAMP

  return {
    blockList,
    lampList: [{ x: lampX, y: lampY, z: lampZ, color: [1, 0.86, 0.6] }],
  }
}

export interface GiGrid {
  gridX: number;
  gridY: number;
  gridZ: number;
  cellSizeXZ: number;
  cellSizeY: number;
  /** 1 為這格大致是實心的（擋光、也反光），0 為大致開放（光在裡面流動） */
  solidList: Uint8Array;
  /** 每格的概略反照色，長度是格數乘三 */
  albedoList: Float32Array;
  /** 每格能看到多少天空，0 到 1 */
  skyVisibilityList: Float32Array;
}

export function toCellIndex(grid: Pick<GiGrid, 'gridY' | 'gridZ'>, x: number, y: number, z: number): number {
  return (x * grid.gridY + y) * grid.gridZ + z
}

/**
 * 把世界方塊降採樣成一份粗網格
 *
 * 每一粗格記兩件事，「這裡大致是實心的還是開放的」與「這裡的反照色大致是什麼」。
 * 世界不可編輯，所以這一步只跑一次
 */
export function buildGiGrid(world: DemoWorld, cellSizeXZ: number, cellSizeY: number): GiGrid {
  const gridX = Math.ceil(WORLD_SIZE_X / cellSizeXZ)
  const gridZ = Math.ceil(WORLD_SIZE_Z / cellSizeXZ)
  const gridY = Math.ceil(WORLD_SIZE_Y / cellSizeY)
  const cellCount = gridX * gridY * gridZ

  const solidCountList = new Uint32Array(cellCount)
  const totalCountList = new Uint32Array(cellCount)
  const albedoSumList = new Float32Array(cellCount * 3)

  const grid = { gridY, gridZ }

  for (let x = 0; x < WORLD_SIZE_X; x++) {
    const cellX = Math.min(gridX - 1, Math.floor(x / cellSizeXZ))
    for (let y = 0; y < WORLD_SIZE_Y; y++) {
      const cellY = Math.min(gridY - 1, Math.floor(y / cellSizeY))
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        const cellZ = Math.min(gridZ - 1, Math.floor(z / cellSizeXZ))
        const cellIndex = toCellIndex(grid, cellX, cellY, cellZ)

        totalCountList[cellIndex]! += 1

        const blockId = world.blockList[toWorldIndex(x, y, z)] ?? BlockId.AIR
        if (blockId === BlockId.AIR)
          continue

        solidCountList[cellIndex]! += 1

        const albedo = BLOCK_ALBEDO_LIST[blockId] ?? EMPTY_CELL_ALBEDO
        albedoSumList[cellIndex * 3]! += albedo[0]!
        albedoSumList[cellIndex * 3 + 1]! += albedo[1]!
        albedoSumList[cellIndex * 3 + 2]! += albedo[2]!
      }
    }
  }

  const solidList = new Uint8Array(cellCount)
  const albedoList = new Float32Array(cellCount * 3)

  for (let index = 0; index < cellCount; index++) {
    const solidCount = solidCountList[index]!
    /** 過半是實心才算實心，邊界格常常一半空氣一半石頭 */
    solidList[index] = solidCount * 2 > totalCountList[index]! ? 1 : 0

    if (solidCount > 0) {
      albedoList[index * 3] = albedoSumList[index * 3]! / solidCount
      albedoList[index * 3 + 1] = albedoSumList[index * 3 + 1]! / solidCount
      albedoList[index * 3 + 2] = albedoSumList[index * 3 + 2]! / solidCount
    }
    else {
      albedoList[index * 3] = EMPTY_CELL_ALBEDO[0]
      albedoList[index * 3 + 1] = EMPTY_CELL_ALBEDO[1]
      albedoList[index * 3 + 2] = EMPTY_CELL_ALBEDO[2]
    }
  }

  /**
   * 天空可見度：由上往下數，累積「上面已經壓了幾層實心」
   *
   * 最頂上那一格永遠是滿的，往下每過一層實心就收掉一截
   */
  const skyVisibilityList = new Float32Array(cellCount)
  for (let cellX = 0; cellX < gridX; cellX++) {
    for (let cellZ = 0; cellZ < gridZ; cellZ++) {
      let solidAbove = 0
      for (let cellY = gridY - 1; cellY >= 0; cellY--) {
        const index = toCellIndex(grid, cellX, cellY, cellZ)
        skyVisibilityList[index] = Math.max(0, 1 - solidAbove * SKY_BLOCK_FACTOR)
        if (solidList[index] === 1) {
          solidAbove++
        }
      }
    }
  }

  return {
    gridX,
    gridY,
    gridZ,
    cellSizeXZ,
    cellSizeY,
    solidList,
    albedoList,
    skyVisibilityList,
  }
}

/** 六個鄰居的座標位移 */
const NEIGHBOR_OFFSET_LIST: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export interface BakeParam {
  world: DemoWorld;
  sunColor: readonly [number, number, number];
  sunStrength: number;
  bouncePassCount: number;
  /** 每一輪反彈保留多少，本體給 0.35 */
  bounceStrength: number;
  /** 燈火要不要當種子 */
  lampEnabled: boolean;
}

/**
 * 烘一次間接光
 *
 * 只有開放格存光，實心格不存。它們只在每一輪裡「反射」開放格鄰居
 * 送過來的光，反射的量由自己的反照色決定。幾輪之後會收斂成
 * 「附近牆角泛著鄰近表面顏色」的樣子
 */
export function bakeIndirectLight(grid: GiGrid, param: BakeParam): Float32Array {
  const cellCount = grid.gridX * grid.gridY * grid.gridZ
  const [sunRed, sunGreen, sunBlue] = param.sunColor

  /** 燈火的種子只算一次，位置與顏色都是靜態的 */
  const emissiveIncidentList = new Float32Array(cellCount * 3)
  if (param.lampEnabled) {
    for (const lamp of param.world.lampList) {
      const cellX = Math.min(grid.gridX - 1, Math.floor(lamp.x / grid.cellSizeXZ))
      const cellY = Math.min(grid.gridY - 1, Math.floor(lamp.y / grid.cellSizeY))
      const cellZ = Math.min(grid.gridZ - 1, Math.floor(lamp.z / grid.cellSizeXZ))
      const index = toCellIndex(grid, cellX, cellY, cellZ)

      emissiveIncidentList[index * 3]! += lamp.color[0]
      emissiveIncidentList[index * 3 + 1]! += lamp.color[1]
      emissiveIncidentList[index * 3 + 2]! += lamp.color[2]
    }
  }

  /**
   * 直射光的種子，只有開放格有
   *
   * 這是傳播的起點，也是最後要從結果裡扣掉的那一份。
   * 直射光早就由既有的光照處理過了，全局光只補「從鄰居傳播過來」的部分
   */
  const directLight = new Float32Array(cellCount * 3)
  for (let index = 0; index < cellCount; index++) {
    if (grid.solidList[index] === 1)
      continue

    const visibility = grid.skyVisibilityList[index]! * param.sunStrength
    directLight[index * 3] = sunRed * visibility
    directLight[index * 3 + 1] = sunGreen * visibility
    directLight[index * 3 + 2] = sunBlue * visibility
  }

  const light = directLight.slice()
  const incident = new Float32Array(cellCount * 3)

  for (let pass = 0; pass < param.bouncePassCount; pass++) {
    incident.fill(0)

    /** 每個實心格收集開放鄰居目前的光，加上自己的發光量 */
    for (let x = 0; x < grid.gridX; x++) {
      for (let y = 0; y < grid.gridY; y++) {
        for (let z = 0; z < grid.gridZ; z++) {
          const index = toCellIndex(grid, x, y, z)
          if (grid.solidList[index] !== 1)
            continue

          let sumRed = 0
          let sumGreen = 0
          let sumBlue = 0
          let openNeighborCount = 0

          for (const [offsetX, offsetY, offsetZ] of NEIGHBOR_OFFSET_LIST) {
            const nextX = x + offsetX
            const nextY = y + offsetY
            const nextZ = z + offsetZ
            if (nextX < 0 || nextX >= grid.gridX || nextY < 0 || nextY >= grid.gridY || nextZ < 0 || nextZ >= grid.gridZ)
              continue

            const neighborIndex = toCellIndex(grid, nextX, nextY, nextZ)
            if (grid.solidList[neighborIndex] === 1)
              continue

            sumRed += light[neighborIndex * 3]!
            sumGreen += light[neighborIndex * 3 + 1]!
            sumBlue += light[neighborIndex * 3 + 2]!
            openNeighborCount++
          }

          const divisor = openNeighborCount > 0 ? openNeighborCount : 1
          incident[index * 3] = (openNeighborCount > 0 ? sumRed / divisor : 0) + emissiveIncidentList[index * 3]!
          incident[index * 3 + 1] = (openNeighborCount > 0 ? sumGreen / divisor : 0) + emissiveIncidentList[index * 3 + 1]!
          incident[index * 3 + 2] = (openNeighborCount > 0 ? sumBlue / divisor : 0) + emissiveIncidentList[index * 3 + 2]!
        }
      }
    }

    /** 每個開放格收集實心鄰居反射回來的光，疊到目前的光上 */
    for (let x = 0; x < grid.gridX; x++) {
      for (let y = 0; y < grid.gridY; y++) {
        for (let z = 0; z < grid.gridZ; z++) {
          const index = toCellIndex(grid, x, y, z)
          if (grid.solidList[index] === 1)
            continue

          let addRed = 0
          let addGreen = 0
          let addBlue = 0

          for (const [offsetX, offsetY, offsetZ] of NEIGHBOR_OFFSET_LIST) {
            const nextX = x + offsetX
            const nextY = y + offsetY
            const nextZ = z + offsetZ
            if (nextX < 0 || nextX >= grid.gridX || nextY < 0 || nextY >= grid.gridY || nextZ < 0 || nextZ >= grid.gridZ)
              continue

            const neighborIndex = toCellIndex(grid, nextX, nextY, nextZ)
            if (grid.solidList[neighborIndex] !== 1)
              continue

            addRed += incident[neighborIndex * 3]! * grid.albedoList[neighborIndex * 3]! * param.bounceStrength
            addGreen += incident[neighborIndex * 3 + 1]! * grid.albedoList[neighborIndex * 3 + 1]! * param.bounceStrength
            addBlue += incident[neighborIndex * 3 + 2]! * grid.albedoList[neighborIndex * 3 + 2]! * param.bounceStrength
          }

          light[index * 3] = light[index * 3]! + addRed
          light[index * 3 + 1] = light[index * 3 + 1]! + addGreen
          light[index * 3 + 2] = light[index * 3 + 2]! + addBlue
        }
      }
    }
  }

  /** 只留傳播進來的那一份，扣掉一開始種下去的直射光種子 */
  const indirectList = new Float32Array(cellCount * 3)
  for (let index = 0; index < cellCount * 3; index++) {
    indirectList[index] = Math.min(1, Math.max(0, light[index]! - directLight[index]!))
  }

  return indirectList
}

export interface GiAtlas {
  data: Uint8Array;
  width: number;
  height: number;
  tilesPerRow: number;
}

/**
 * 把三維的格子攤平成一張二維的圖集
 *
 * 每一層 Y 切片是一塊磚，磚並排成一張二維的圖。
 * 第 y 層落在第 (y % tilesPerRow) 行、第 floor(y / tilesPerRow) 列，
 * 磚內則是 (x, z) 兩軸
 */
export function buildGiAtlas(grid: GiGrid, indirectList: Float32Array, tilesPerRow: number): GiAtlas {
  const tileRowCount = Math.ceil(grid.gridY / tilesPerRow)
  const width = tilesPerRow * grid.gridX
  const height = tileRowCount * grid.gridZ
  const data = new Uint8Array(width * height * 4)

  for (let x = 0; x < grid.gridX; x++) {
    for (let y = 0; y < grid.gridY; y++) {
      const tileX = y % tilesPerRow
      const tileY = Math.floor(y / tilesPerRow)

      for (let z = 0; z < grid.gridZ; z++) {
        const index = toCellIndex(grid, x, y, z)
        const atlasX = tileX * grid.gridX + x
        const atlasY = tileY * grid.gridZ + z
        const pixel = (atlasY * width + atlasX) * 4

        data[pixel] = Math.round(indirectList[index * 3]! * 255)
        data[pixel + 1] = Math.round(indirectList[index * 3 + 1]! * 255)
        data[pixel + 2] = Math.round(indirectList[index * 3 + 2]! * 255)
        data[pixel + 3] = 255
      }
    }
  }

  return { data, width, height, tilesPerRow }
}

/** 磚排成接近正方形的一張圖，避免撞上顯卡的單邊尺寸上限 */
export function measureTilesPerRow(grid: GiGrid): number {
  return Math.ceil(Math.sqrt(grid.gridY))
}
