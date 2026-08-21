import type { VoxelGiBakeMessage, VoxelGiBakeResponse, VoxelGiInitMessage, VoxelGiWorkerMessage } from './type'

// eslint-disable-next-line no-restricted-globals
const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

/**
 * 每一輪反彈保留多少
 *
 * 現實裡牆面不會把打在它身上的光原封不動吐回去，
 * 這個係數就是那道折損。給太高會越滾越亮（每一輪都在疊加），
 * 給太低則四輪跑完幾乎沒有效果
 */
const BOUNCE_STRENGTH = 0.35

let gridX = 0
let gridY = 0
let gridZ = 0
let cellCount = 0
/** 圖集的排法，見 type.ts 的 tilesPerRow */
let tilesPerRow = 1
let atlasWidth = 0
let atlasHeight = 0
let solidList: Uint8Array | null = null
let albedoList: Float32Array | null = null
let skyVisibilityList: Float32Array | null = null

/**
 * 每個實心格自己的發光量（燈火），只算一次
 *
 * 燈的位置與顏色是靜態的，這裡不隨太陽變化——簡化掉「燈火隨晝夜
 * 明暗變化」那一截，全局光只要抓到「這裡有一盞燈在照亮牆角」這件事，
 * 燈本身的明暗自有真光與光暈兩層去表現
 */
let emissiveIncidentList: Float32Array | null = null

function cellIndex(x: number, y: number, z: number): number {
  return (x * gridY + y) * gridZ + z
}

/** 六個鄰居的座標位移 */
const NEIGHBOR_OFFSET_LIST: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

function handleInit(message: VoxelGiInitMessage): void {
  gridX = message.gridX
  gridY = message.gridY
  gridZ = message.gridZ
  cellCount = gridX * gridY * gridZ
  tilesPerRow = message.tilesPerRow
  atlasWidth = message.atlasWidth
  atlasHeight = message.atlasHeight
  solidList = message.solidList
  albedoList = message.albedoList
  skyVisibilityList = message.skyVisibilityList

  emissiveIncidentList = new Float32Array(cellCount * 3)
  for (const seed of message.lightSeedList) {
    emissiveIncidentList[seed.cellIndex * 3]! += seed.color[0] * seed.level
    emissiveIncidentList[seed.cellIndex * 3 + 1]! += seed.color[1] * seed.level
    emissiveIncidentList[seed.cellIndex * 3 + 2]! += seed.color[2] * seed.level
  }
}

/**
 * 烘一次間接光
 *
 * 只有開放格存光，實心格不存——它們只在每一輪裡「反射」開放格鄰居
 * 送過來的光，反射的量由自己的反照色決定。這不是真的多重反彈全局光，
 * 是能在瀏覽器裡即時跑的簡化版：幾輪之後收斂成「附近牆角泛著鄰近
 * 表面顏色」的效果，換不到真正的多次彈射，但那正是這個場景付得起的價錢
 *
 * 直射光的種子只看「這格頭頂有多少實心」，不看太陽真正的方位角——
 * 少算了「西曬的牆比東邊亮」這種方向性，換到的是不必在粗網格裡
 * 沿著太陽方向做一次三維射線行進。全局光本來就只是個提示，
 * 這個簡化在畫面上幾乎看不出來
 */
function handleBake(message: VoxelGiBakeMessage): void {
  if (!solidList || !albedoList || !skyVisibilityList || !emissiveIncidentList)
    return

  const [sunR, sunG, sunB] = message.sunColor
  const strength = message.sunStrength

  /**
   * 直射光的種子，只有開放格有
   *
   * 這是傳播的起點，也是最後要從結果裡扣掉的那一份——
   * 直射光早就由既有的頂點烘焙處理過了，這裡只補「從鄰居傳播過來」的部分
   */
  const directLight = new Float32Array(cellCount * 3)
  for (let i = 0; i < cellCount; i++) {
    if (solidList[i] === 1)
      continue

    const visibility = skyVisibilityList[i]! * strength
    directLight[i * 3] = sunR * visibility
    directLight[i * 3 + 1] = sunG * visibility
    directLight[i * 3 + 2] = sunB * visibility
  }

  const light = directLight.slice()
  const incident = new Float32Array(cellCount * 3)

  for (let pass = 0; pass < message.bouncePassCount; pass++) {
    incident.fill(0)

    /** 每個實心格收集開放鄰居目前的光，加上自己的發光量 */
    for (let x = 0; x < gridX; x++) {
      for (let y = 0; y < gridY; y++) {
        for (let z = 0; z < gridZ; z++) {
          const index = cellIndex(x, y, z)
          if (solidList[index] !== 1)
            continue

          let sumR = 0
          let sumG = 0
          let sumB = 0
          let openNeighborCount = 0

          for (const [dx, dy, dz] of NEIGHBOR_OFFSET_LIST) {
            const nx = x + dx
            const ny = y + dy
            const nz = z + dz
            if (nx < 0 || nx >= gridX || ny < 0 || ny >= gridY || nz < 0 || nz >= gridZ)
              continue

            const neighborIndex = cellIndex(nx, ny, nz)
            if (solidList[neighborIndex] === 1)
              continue

            sumR += light[neighborIndex * 3]!
            sumG += light[neighborIndex * 3 + 1]!
            sumB += light[neighborIndex * 3 + 2]!
            openNeighborCount++
          }

          incident[index * 3] = (openNeighborCount > 0 ? sumR / openNeighborCount : 0) + emissiveIncidentList[index * 3]!
          incident[index * 3 + 1] = (openNeighborCount > 0 ? sumG / openNeighborCount : 0) + emissiveIncidentList[index * 3 + 1]!
          incident[index * 3 + 2] = (openNeighborCount > 0 ? sumB / openNeighborCount : 0) + emissiveIncidentList[index * 3 + 2]!
        }
      }
    }

    /** 每個開放格收集實心鄰居反射回來的光，疊到目前的光上 */
    for (let x = 0; x < gridX; x++) {
      for (let y = 0; y < gridY; y++) {
        for (let z = 0; z < gridZ; z++) {
          const index = cellIndex(x, y, z)
          if (solidList[index] === 1)
            continue

          let addR = 0
          let addG = 0
          let addB = 0

          for (const [dx, dy, dz] of NEIGHBOR_OFFSET_LIST) {
            const nx = x + dx
            const ny = y + dy
            const nz = z + dz
            if (nx < 0 || nx >= gridX || ny < 0 || ny >= gridY || nz < 0 || nz >= gridZ)
              continue

            const neighborIndex = cellIndex(nx, ny, nz)
            if (solidList[neighborIndex] !== 1)
              continue

            const albedoR = albedoList[neighborIndex * 3]!
            const albedoG = albedoList[neighborIndex * 3 + 1]!
            const albedoB = albedoList[neighborIndex * 3 + 2]!

            addR += incident[neighborIndex * 3]! * albedoR * BOUNCE_STRENGTH
            addG += incident[neighborIndex * 3 + 1]! * albedoG * BOUNCE_STRENGTH
            addB += incident[neighborIndex * 3 + 2]! * albedoB * BOUNCE_STRENGTH
          }

          light[index * 3] = light[index * 3]! + addR
          light[index * 3 + 1] = light[index * 3 + 1]! + addG
          light[index * 3 + 2] = light[index * 3 + 2]! + addB
        }
      }
    }
  }

  /**
   * 照圖集的像素順序寫出去，不是照格子的順序
   *
   * 每一層 Y 切片是一塊磚，磚並排成一張二維的圖：
   * 第 y 層落在第 (y % tilesPerRow) 行、第 floor(y / tilesPerRow) 列，
   * 磚內則是 (x, z) 兩軸。著色器那邊照同一套算式反推回來
   */
  const textureData = new Uint8Array(atlasWidth * atlasHeight * 4)
  for (let x = 0; x < gridX; x++) {
    for (let y = 0; y < gridY; y++) {
      const tileX = y % tilesPerRow
      const tileY = Math.floor(y / tilesPerRow)

      for (let z = 0; z < gridZ; z++) {
        const index = cellIndex(x, y, z)
        const atlasX = tileX * gridX + x
        const atlasY = tileY * gridZ + z
        const pixel = (atlasY * atlasWidth + atlasX) * 4

        /** 只留傳播進來的那一份，扣掉一開始種下去的直射光種子 */
        const r = Math.min(1, Math.max(0, light[index * 3]! - directLight[index * 3]!))
        const g = Math.min(1, Math.max(0, light[index * 3 + 1]! - directLight[index * 3 + 1]!))
        const b = Math.min(1, Math.max(0, light[index * 3 + 2]! - directLight[index * 3 + 2]!))

        textureData[pixel] = Math.round(r * 255)
        textureData[pixel + 1] = Math.round(g * 255)
        textureData[pixel + 2] = Math.round(b * 255)
        /**
         * alpha 沒有人在用了，固定給滿
         *
         * 這一欄曾經存「這一格照得到多少陽光」，給光束行進用。
         * 那條路走不通——粗格是水平四格、垂直兩格，一叢樹冠只佔一兩格，
         * 遮不出邊界分明的陰影體積，量出來是地表以上每一層
         * 四千九百格裡有四千八百格以上都照得到，可見度場處處是一，
         * 光束因此沒有東西可以顯現。
         *
         * 光束改成自己畫一張逐方塊解析度的深度圖（見 volumetric-shadow.ts），
         * 這一欄就成了每次烘焙都在白算的死路：幾十萬次射線行進，
         * 算完沒有人讀。留著 RGB 的間接光就好
         */
        textureData[pixel + 3] = 255
      }
    }
  }

  const response: VoxelGiBakeResponse = {
    type: 'bake-ready',
    requestId: message.requestId,
    textureData,
  }
  workerSelf.postMessage(response, [textureData.buffer])
}

workerSelf.onmessage = (event: MessageEvent<VoxelGiWorkerMessage>) => {
  if (event.data.type === 'init') {
    handleInit(event.data)
    return
  }

  handleBake(event.data)
}
