import { useWebWorkerFn } from '@vueuse/core'
import { BLOCK_DEFS, BlockId, isDecorationBlock } from '../block/block-constants'
import {
  CHUNK_SIZE,
  CHUNKS_PER_AXIS,
  WORLD_HEIGHT,
  WORLD_SIZE,
} from './world-constants'

/** Worker 算完一個 chunk 之後交給渲染器的資料 */
export interface ChunkMeshData {
  /** 每個網格 key 對應的實例矩陣 */
  matrixMap: Record<string, Float32Array>;
  /**
   * 每個實例的環境遮蔽色，每筆四個浮點數（RGBA）
   *
   * 夾在牆角、階梯內側的面會暗一些，方塊的立體感就是靠這個出來的
   */
  shadeMap: Record<string, Float32Array>;
}

export type ChunkResultCallback = (
  chunkX: number,
  chunkZ: number,
  meshData: ChunkMeshData,
) => void

/** 方塊旗標位元 */
const FLAG_RENDERABLE = 1
const FLAG_TRANSPARENT = 2
const FLAG_PER_FACE = 4
const FLAG_DECORATION = 8
const FLAG_ALWAYS_DRAW = 16
const FLAG_CONNECT = 32
const FLAG_LIQUID = 64

/** 光源方塊的最大亮度等級，與 Minecraft 相同用 0～15 表示 */
const MAX_LIGHT_LEVEL = 15

/**
 * 預先計算每個 BlockId 的發光等級
 *
 * BlockDef 的 emissive 只會讓方塊自己看起來在發亮，
 * 周圍一格都不會被照到，所以另外算一份亮度拿去做光線擴散
 */
function prepareLightEmissionList(): Uint8Array {
  const idList = Object.values(BlockId).filter((value) => typeof value === 'number') as number[]
  const emissionList = new Uint8Array(Math.max(...idList) + 1)

  for (const id of idList) {
    const blockDef = BLOCK_DEFS[id as BlockId]
    /** 沒特別指定就跟著自發光走：多數方塊「看起來多亮」與「照多遠」是同一件事 */
    const level = blockDef.lightLevel ?? blockDef.emissive ?? 0
    emissionList[id] = Math.round(level * MAX_LIGHT_LEVEL)
  }

  return emissionList
}

/** 預先計算每個 BlockId 的旗標（只算一次） */
function prepareBlockFlags(): Uint8Array {
  const idList = Object.values(BlockId).filter((value) => typeof value === 'number') as number[]
  const flags = new Uint8Array(Math.max(...idList) + 1)

  for (const id of idList) {
    const blockDef = BLOCK_DEFS[id as BlockId]
    let flag = 0

    if (!blockDef.isHidden && blockDef.textures)
      flag |= FLAG_RENDERABLE
    if (blockDef.alpha !== undefined && blockDef.alpha < 1)
      flag |= FLAG_TRANSPARENT

    /** 靜水與流水只差貼圖，相鄰時中間不該冒出一層水面 */
    if (blockDef.isLiquid)
      flag |= FLAG_LIQUID

    if (blockDef.cutout) {
      /** 鏤空方塊擋不住後面的東西，也不能被相鄰的同類剔除掉 */
      flag |= FLAG_TRANSPARENT
      flag |= FLAG_ALWAYS_DRAW
    }

    if (isDecorationBlock(id as BlockId)) {
      /** 裝飾方塊不參與面剔除，對鄰居而言也等同透明 */
      flag |= FLAG_DECORATION
      flag |= FLAG_TRANSPARENT

      /** 圍籬與玻璃片還要看鄰居決定往哪幾側延伸 */
      if (blockDef.shape === 'fence' || blockDef.shape === 'pane') {
        flag |= FLAG_CONNECT
      }
    }
    else if (
      blockDef.textures
      && !blockDef.textures.all
      && !!(blockDef.textures.top || blockDef.textures.side || blockDef.textures.bottom)
    ) {
      flag |= FLAG_PER_FACE
    }

    flags[id] = flag
  }

  return flags
}

/**
 * 在 Worker 執行緒中運行的 chunk 矩陣計算函式
 *
 * 此函式完全自包含，不引用任何外部模組或閉包變數。
 * useWebWorkerFn 會將此函式序列化後在 Web Worker 中執行。
 */
function computeChunkMatricesInWorker(
  worldState: Uint8Array,
  chunkListJson: string,
  blockFlags: Uint8Array,
  lightEmissionList: Uint8Array,
  chunkSize: number,
  worldHeight: number,
  worldSize: number,
): Record<string, { matrixMap: Record<string, Float32Array>; shadeMap: Record<string, Float32Array> }> {
  const F_RENDERABLE = 1
  const F_TRANSPARENT = 2
  const F_PER_FACE = 4
  const F_DECORATION = 8
  const F_ALWAYS_DRAW = 16
  const F_CONNECT = 32
  const F_LIQUID = 64

  /** 環境遮蔽的最深程度，0 等於沒有遮蔽 */
  const AO_STRENGTH = 0.3
  /**
   * 方塊光打在表面上的強度，會直接加在貼圖亮度上
   *
   * 這個數字是「燈火照到的地方比沒照到的地方亮幾成」。
   * 它乘的是反照率不是光照，所以夜裡還要靠場景的補光把它撐起來
   * （見 day-night 的 NIGHT_FILL_COLOR），兩者是一組的
   */
  const BLOCK_LIGHT_STRENGTH = 1.55
  /** 燈火是暖色的，照到的地方會偏黃 */
  const BLOCK_LIGHT_COLOR = [1, 0.84, 0.58]
  const MAX_LIGHT = 15
  /** 頭頂疊到幾層就算完全照不到天光 */
  const SKY_FULL_COVER = 3
  /** 沒有天光時花草要暗多少，太重會變成黑色剪影 */
  const SKY_SHADE_STRENGTH = 0.4

  /** 與 voxel-renderer 的 CONNECT_DIRECTION_LIST 對應 */
  const connectDirectionList = [
    { key: 'px', offsetX: 1, offsetZ: 0 },
    { key: 'nx', offsetX: -1, offsetZ: 0 },
    { key: 'pz', offsetX: 0, offsetZ: 1 },
    { key: 'nz', offsetX: 0, offsetZ: -1 },
  ]

  function coordinateToIndex(x: number, y: number, z: number): number {
    return x * worldHeight * worldSize + y * worldSize + z
  }

  /** 這一格是不是液體的最上面一層，也就是矮八分之一格的那一種 */
  function isSurfaceLiquid(x: number, y: number, z: number): boolean {
    if (y + 1 >= worldHeight)
      return true

    const aboveId = worldState[coordinateToIndex(x, y + 1, z)]!
    return !(blockFlags[aboveId]! & F_LIQUID)
  }

  /** 會擋光的方塊：花草與半透明的水、玻璃都不算 */
  function isOccluder(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= worldSize || z < 0 || z >= worldSize || y < 0 || y >= worldHeight)
      return false

    const blockId = worldState[coordinateToIndex(x, y, z)]!
    if (blockId === 0)
      return false

    const flag = blockFlags[blockId]!
    return !!(flag & F_RENDERABLE) && !(flag & (F_DECORATION | F_TRANSPARENT))
  }

  /**
   * 單一面的環境遮蔽
   *
   * 看這一面外側那一格的周圍八格被塞住幾格，
   * 塞得越滿越暗。牆角、階梯內側、樹底下自然就會沉下去，
   * 光靠一盞平行光是做不出這種層次的
   */
  function computeFaceShade(
    x: number,
    y: number,
    z: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ): number {
    const outX = x + offsetX
    const outY = y + offsetY
    const outZ = z + offsetZ

    /** 取兩個垂直於法線的軸，掃過這一面正對著的那圈鄰居 */
    const axisA = offsetX !== 0 ? [0, 1, 0] : [1, 0, 0]
    const axisB = offsetZ !== 0 ? [0, 1, 0] : [0, 0, 1]

    let occlusionCount = 0
    for (let stepA = -1; stepA <= 1; stepA++) {
      for (let stepB = -1; stepB <= 1; stepB++) {
        if (stepA === 0 && stepB === 0)
          continue

        const isBlocked = isOccluder(
          outX + axisA[0]! * stepA + axisB[0]! * stepB,
          outY + axisA[1]! * stepA + axisB[1]! * stepB,
          outZ + axisA[2]! * stepA + axisB[2]! * stepB,
        )
        if (isBlocked)
          occlusionCount++
      }
    }

    return 1 - AO_STRENGTH * (occlusionCount / 8)
  }

  /**
   * 方塊光擴散
   *
   * 燈籠、餘燼這類方塊只是自己看起來亮，照不到旁邊的岩壁，
   * 所以洞裡點再多燈還是一片黑。
   * 這裡照 Minecraft 的做法從每個光源做一次廣度優先擴散，
   * 每往外一格衰減一級，結果烘進實例顏色，執行期不用多一盞燈
   */
  function createLightLevelList(): Uint8Array {
    const lightLevelList = new Uint8Array(worldSize * worldHeight * worldSize)
    const queue: number[] = []

    for (let x = 0; x < worldSize; x++) {
      for (let y = 0; y < worldHeight; y++) {
        for (let z = 0; z < worldSize; z++) {
          const index = coordinateToIndex(x, y, z)
          const emission = lightEmissionList[worldState[index]!]!
          if (emission <= 0)
            continue

          lightLevelList[index] = emission
          queue.push(index)
        }
      }
    }

    const stepList = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]

    for (let head = 0; head < queue.length; head++) {
      const index = queue[head]!
      const level = lightLevelList[index]!
      if (level <= 1)
        continue

      const x = Math.floor(index / (worldHeight * worldSize))
      const y = Math.floor((index - x * worldHeight * worldSize) / worldSize)
      const z = index - x * worldHeight * worldSize - y * worldSize

      for (const step of stepList) {
        const nextX = x + step[0]!
        const nextY = y + step[1]!
        const nextZ = z + step[2]!
        if (
          nextX < 0 || nextX >= worldSize
          || nextY < 0 || nextY >= worldHeight
          || nextZ < 0 || nextZ >= worldSize
        ) {
          continue
        }

        /** 光穿得過空氣、水與花草，遇到實心方塊就停在表面 */
        if (isOccluder(nextX, nextY, nextZ))
          continue

        const nextIndex = coordinateToIndex(nextX, nextY, nextZ)
        if (lightLevelList[nextIndex]! >= level - 1)
          continue

        lightLevelList[nextIndex] = level - 1
        queue.push(nextIndex)
      }
    }

    return lightLevelList
  }

  const lightLevelList = createLightLevelList()

  /** 這一面照到多少燈火，0～1 */
  function readFaceLight(x: number, y: number, z: number): number {
    if (x < 0 || x >= worldSize || z < 0 || z >= worldSize || y < 0 || y >= worldHeight)
      return 0

    return lightLevelList[coordinateToIndex(x, y, z)]! / MAX_LIGHT
  }

  /**
   * 這一格照得到多少天光，0 為完全被蓋住、1 為一路通到天空
   *
   * 花草是交叉的立板，實心方塊那套逐面遮蔽套不上去，
   * 而且它們的法線全部朝上，即時陰影落在上面也幾乎看不出深淺。
   * 改成照 Minecraft 的做法直接量頭頂的遮蔽：
   * 樹冠底下的草會跟著地面一起沉下去，空地上的草維持全亮
   */
  function computeSkyExposure(x: number, y: number, z: number): number {
    let blockedCount = 0

    for (let scanY = y + 1; scanY < worldHeight; scanY++) {
      const blockId = worldState[coordinateToIndex(x, scanY, z)]!
      if (blockId === 0)
        continue

      const flag = blockFlags[blockId]!
      /** 花草擋不住天光，樹葉與岩層才算 */
      if (!(flag & F_RENDERABLE) || (flag & F_DECORATION))
        continue

      blockedCount++
      if (blockedCount >= SKY_FULL_COVER)
        break
    }

    return 1 - Math.min(1, blockedCount / SKY_FULL_COVER)
  }

  /** 花草整株共用一個亮度：天光決定明暗，燈火再加回暖光 */
  function computeDecorationColor(x: number, y: number, z: number): [number, number, number] {
    const shade = 1 - SKY_SHADE_STRENGTH * (1 - computeSkyExposure(x, y, z))
    const light = readFaceLight(x, y, z) * BLOCK_LIGHT_STRENGTH

    return [
      shade + light * BLOCK_LIGHT_COLOR[0]!,
      shade + light * BLOCK_LIGHT_COLOR[1]!,
      shade + light * BLOCK_LIGHT_COLOR[2]!,
    ]
  }

  /**
   * 單一面最終要乘上貼圖的顏色
   *
   * 環境遮蔽把凹處壓暗，燈火再把暖光加回去，
   * 兩者相加就是這一面的基底亮度
   */
  function computeFaceColor(
    x: number,
    y: number,
    z: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ): [number, number, number] {
    const shade = computeFaceShade(x, y, z, offsetX, offsetY, offsetZ)
    const light = readFaceLight(x + offsetX, y + offsetY, z + offsetZ) * BLOCK_LIGHT_STRENGTH

    return [
      shade + light * BLOCK_LIGHT_COLOR[0]!,
      shade + light * BLOCK_LIGHT_COLOR[1]!,
      shade + light * BLOCK_LIGHT_COLOR[2]!,
    ]
  }

  const chunkList: { chunkX: number; chunkZ: number }[] = JSON.parse(chunkListJson)
  const allResults: Record<string, { matrixMap: Record<string, Float32Array>; shadeMap: Record<string, Float32Array> }> = {}

  for (const { chunkX, chunkZ } of chunkList) {
    const matricesMap: Record<string, number[]> = {}
    const shadeListMap: Record<string, number[]> = {}

    for (let blockId = 0; blockId < blockFlags.length; blockId++) {
      if (!(blockFlags[blockId]! & F_RENDERABLE))
        continue

      /** 半透明方塊不做環境遮蔽，水面壓暗只會像髒掉 */
      const hasShade = !(blockFlags[blockId]! & F_TRANSPARENT)
        || !!(blockFlags[blockId]! & F_DECORATION)

      if (blockFlags[blockId]! & F_PER_FACE) {
        for (const face of ['top', 'bottom', 'front', 'back', 'left', 'right']) {
          matricesMap[`${blockId}_${face}`] = []
          if (hasShade)
            shadeListMap[`${blockId}_${face}`] = []
        }
      }
      else {
        matricesMap[`${blockId}`] = []
        if (hasShade)
          shadeListMap[`${blockId}`] = []
      }

      /** 液體的水面那一層會矮八分之一格，用另一組網格畫 */
      if (blockFlags[blockId]! & F_LIQUID) {
        matricesMap[`${blockId}_surface`] = []
      }

      if (blockFlags[blockId]! & F_CONNECT) {
        for (const direction of connectDirectionList) {
          matricesMap[`${blockId}_${direction.key}`] = []
          if (hasShade)
            shadeListMap[`${blockId}_${direction.key}`] = []
        }
      }
    }

    const startX = chunkX * chunkSize
    const startZ = chunkZ * chunkSize

    for (let x = startX; x < startX + chunkSize; x++) {
      for (let z = startZ; z < startZ + chunkSize; z++) {
        for (let y = 0; y < worldHeight; y++) {
          const blockId = worldState[coordinateToIndex(x, y, z)]!
          if (blockId === 0)
            continue
          if (!(blockFlags[blockId]! & F_RENDERABLE))
            continue

          /** 花草欄杆與樹葉這類方塊四面都看得到，直接畫出來 */
          if (blockFlags[blockId]! & (F_DECORATION | F_ALWAYS_DRAW)) {
            matricesMap[`${blockId}`]!.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1)

            const decorationShadeList = shadeListMap[`${blockId}`]
            const decorationColor = decorationShadeList
              ? computeDecorationColor(x, y, z)
              : null
            if (decorationShadeList && decorationColor) {
              decorationShadeList.push(decorationColor[0], decorationColor[1], decorationColor[2], 1)
            }

            /**
             * 圍籬與玻璃片：哪一側有東西才往那一側接
             *
             * 鄰居是同類（連成一排）或實心方塊（接到牆上）都算，
             * 沒有這個判斷的話每一根柱子都會長出四根懸空的橫桿
             */
            if (blockFlags[blockId]! & F_CONNECT) {
              for (const direction of connectDirectionList) {
                const neighborX = x + direction.offsetX
                const neighborZ = z + direction.offsetZ
                if (
                  neighborX < 0 || neighborX >= worldSize
                  || neighborZ < 0 || neighborZ >= worldSize
                ) {
                  continue
                }

                const neighborId = worldState[coordinateToIndex(neighborX, y, neighborZ)]!
                const isSameKind = neighborId === blockId
                const isSolidNeighbor = neighborId !== 0
                  && !!(blockFlags[neighborId]! & F_RENDERABLE)
                  && !(blockFlags[neighborId]! & F_DECORATION)

                if (isSameKind || isSolidNeighbor) {
                  matricesMap[`${blockId}_${direction.key}`]!.push(
                    1,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    x,
                    y,
                    z,
                    1,
                  )

                  /** 橫桿要跟柱子同一個亮度，否則同一根圍籬會深淺不一 */
                  const railShadeList = shadeListMap[`${blockId}_${direction.key}`]
                  if (railShadeList && decorationColor) {
                    railShadeList.push(decorationColor[0], decorationColor[1], decorationColor[2], 1)
                  }
                }
              }
            }

            continue
          }

          /**
           * 判斷某一面是否需要繪製
           *
           * - 世界邊界外一律剔除（玩家走不出去，看不到外牆）
           * - 相同方塊相鄰剔除，海面與湖水才不會把內部的面全畫出來
           * - 鄰居不透明就會擋住這一面
           */
          const shouldDrawFace = (
            neighborX: number,
            neighborY: number,
            neighborZ: number,
          ): boolean => {
            if (
              neighborX < 0 || neighborX >= worldSize
              || neighborZ < 0 || neighborZ >= worldSize
              || neighborY < 0
            ) {
              return false
            }
            if (neighborY >= worldHeight)
              return true

            const neighborId = worldState[coordinateToIndex(neighborX, neighborY, neighborZ)]!
            if (neighborId === 0)
              return true

            /**
             * 兩格都是水（靜水碰流水也算同一片）
             *
             * 水面那一層矮八分之一格，滿格的那一側必須把高出來的那一小截畫出來，
             * 否則兩格之間會露出一條看得穿的縫。
             * 上下相鄰的兩格高度一致，中間畫面只會多出一層水皮，一律剔除
             */
            if ((blockFlags[blockId]! & F_LIQUID) && (blockFlags[neighborId]! & F_LIQUID)) {
              if (neighborY !== y)
                return false

              return isSurfaceLiquid(x, y, z) !== isSurfaceLiquid(neighborX, neighborY, neighborZ)
            }

            if (neighborId === blockId)
              return false

            /**
             * 鄰居是液面
             *
             * 與上面那段是同一件事，只是換成實心方塊靠著液面：
             * 液面矮八分之一格，那一小截靠不到任何東西，
             * 剔掉就會露出一條看得穿的縫——地獄谷的岩漿岸邊正是這樣。
             *
             * 水沒事只是因為它本來就算半透明，這一行永遠輪不到；
             * 岩漿是不透明的，非得問這一句不可。
             *
             * 只管側面與底面：液面壓在頭上時，擋住的是滿滿一整格
             */
            if (
              neighborY <= y
              && (blockFlags[neighborId]! & F_LIQUID)
              && isSurfaceLiquid(neighborX, neighborY, neighborZ)
            ) {
              return true
            }

            return !!(blockFlags[neighborId]! & F_TRANSPARENT)
          }

          const hasTop = shouldDrawFace(x, y + 1, z)
          const hasBottom = shouldDrawFace(x, y - 1, z)
          const hasFront = shouldDrawFace(x, y, z + 1)
          const hasBack = shouldDrawFace(x, y, z - 1)
          const hasLeft = shouldDrawFace(x - 1, y, z)
          const hasRight = shouldDrawFace(x + 1, y, z)

          if (!hasTop && !hasBottom && !hasFront && !hasBack && !hasLeft && !hasRight)
            continue

          const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

          const faceList = [
            { key: 'top', isDrawn: hasTop, offsetX: 0, offsetY: 1, offsetZ: 0 },
            { key: 'bottom', isDrawn: hasBottom, offsetX: 0, offsetY: -1, offsetZ: 0 },
            { key: 'front', isDrawn: hasFront, offsetX: 0, offsetY: 0, offsetZ: 1 },
            { key: 'back', isDrawn: hasBack, offsetX: 0, offsetY: 0, offsetZ: -1 },
            { key: 'left', isDrawn: hasLeft, offsetX: -1, offsetY: 0, offsetZ: 0 },
            { key: 'right', isDrawn: hasRight, offsetX: 1, offsetY: 0, offsetZ: 0 },
          ]

          if (blockFlags[blockId]! & F_PER_FACE) {
            for (const face of faceList) {
              if (!face.isDrawn)
                continue

              matricesMap[`${blockId}_${face.key}`]!.push(...matrix)

              const shadeList = shadeListMap[`${blockId}_${face.key}`]
              if (shadeList) {
                const color = computeFaceColor(x, y, z, face.offsetX, face.offsetY, face.offsetZ)
                shadeList.push(color[0], color[1], color[2], 1)
              }
            }
          }
          else {
            /**
             * 液體的最上面一層改用矮八分之一格的網格
             *
             * 頭頂還有水的那些格子維持滿格，兩層之間才不會出現縫隙
             */
            let singleKey = `${blockId}`
            if (blockFlags[blockId]! & F_LIQUID) {
              const aboveId = y + 1 < worldHeight
                ? worldState[coordinateToIndex(x, y + 1, z)]!
                : 0
              if (!(blockFlags[aboveId]! & F_LIQUID)) {
                singleKey = `${blockId}_surface`
              }
            }

            matricesMap[singleKey]!.push(...matrix)

            /**
             * 六面共用一個實例，只能取所有露出面的平均值
             *
             * 石頭、沙這類單一材質的方塊整顆是一個盒子，
             * 沒辦法各面給各面的亮度
             */
            const shadeList = shadeListMap[`${blockId}`]
            if (shadeList) {
              const colorSum = [0, 0, 0]
              let drawnCount = 0
              for (const face of faceList) {
                if (!face.isDrawn)
                  continue

                const color = computeFaceColor(x, y, z, face.offsetX, face.offsetY, face.offsetZ)
                colorSum[0]! += color[0]
                colorSum[1]! += color[1]
                colorSum[2]! += color[2]
                drawnCount++
              }

              if (drawnCount === 0) {
                shadeList.push(1, 1, 1, 1)
              }
              else {
                shadeList.push(
                  colorSum[0]! / drawnCount,
                  colorSum[1]! / drawnCount,
                  colorSum[2]! / drawnCount,
                  1,
                )
              }
            }
          }
        }
      }
    }

    const matrixMap: Record<string, Float32Array> = {}
    for (const [key, valueList] of Object.entries(matricesMap)) {
      matrixMap[key] = new Float32Array(valueList)
    }

    const shadeMap: Record<string, Float32Array> = {}
    for (const [key, valueList] of Object.entries(shadeListMap)) {
      shadeMap[key] = new Float32Array(valueList)
    }

    allResults[`${chunkX}_${chunkZ}`] = { matrixMap, shadeMap }
  }

  return allResults
}

/**
 * 封裝 Chunk 矩陣計算 Worker
 *
 * 把面剔除與矩陣生成移到 Worker 執行緒，避免建構世界時畫面凍結。
 */
export function useChunkWorker() {
  const blockFlags = prepareBlockFlags()
  const lightEmissionList = prepareLightEmissionList()
  const { workerFn, workerTerminate } = useWebWorkerFn(computeChunkMatricesInWorker)

  let onChunkResult: ChunkResultCallback | null = null

  async function rebuildAll(worldState: Uint8Array): Promise<void> {
    const chunkList: { chunkX: number; chunkZ: number }[] = []
    for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
      for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
        chunkList.push({ chunkX, chunkZ })
      }
    }

    try {
      const results = await workerFn(
        worldState,
        JSON.stringify(chunkList),
        blockFlags,
        lightEmissionList,
        CHUNK_SIZE,
        WORLD_HEIGHT,
        WORLD_SIZE,
      )

      for (const [key, meshData] of Object.entries(results)) {
        const [chunkX, chunkZ] = key.split('_')
        onChunkResult?.(Number(chunkX), Number(chunkZ), meshData)
      }
    }
    catch (error) {
      console.error('[ChunkWorker] 計算失敗:', error)
    }
  }

  return {
    rebuildAll,
    setOnChunkResult(callback: ChunkResultCallback) {
      onChunkResult = callback
    },
    terminate: workerTerminate,
  }
}

export type ChunkWorkerComposable = ReturnType<typeof useChunkWorker>
