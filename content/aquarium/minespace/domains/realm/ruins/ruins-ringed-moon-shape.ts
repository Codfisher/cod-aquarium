/**
 * 石殿遺址環月的形體（純資料，不引用 Babylon，可以單獨測）
 *
 * 環月是體素拼的：一顆方塊堆出來的球，外面套一圈方塊排成的環，中間留一道環縫。
 * 座標是月亮自己的體素格：原點在球心，y 軸是自轉軸（也是環面的法線），每一格體素以整數座標為中心。
 *
 * 月亮掛在天球上、跟著鏡頭走，所以永遠從同一個方向看它，看得到哪些面、誰擋住誰都是固定的。
 * 這裡就照那個固定的視點把事情做完：背對視點的面、被鄰格蓋住的面一律不產生，
 * 剩下的面由遠到近排好。畫的時候照這個順序疊上去就對了，不必寫深度
 * （天上的東西寫了深度會擋掉比天球殼遠的山稜與巨像）。
 *
 * 由遠到近排「格」就夠，不必排「面」：整數格是各自中心的沃羅諾伊格，
 * 而沃羅諾伊格照中心離視點的距離排，一定是對的遮擋順序；同一格的幾個面彼此不重疊
 */

export type MoonTriple = readonly [number, number, number]

/** 球體的半徑（體素）：直徑十八格，掛在天上每格約七八個畫面像素，看得出是方塊堆的 */
export const MOON_BODY_RADIUS = 9

/** 環的內外緣與環縫（離自轉軸的距離，體素） */
export const MOON_RING_INNER_RADIUS = 12.5
export const MOON_RING_OUTER_RADIUS = 21.5
export const MOON_RING_GAP_FROM = 16
export const MOON_RING_GAP_TO = 17.5

/** 環只有一層體素，再壓薄成六成厚：整格厚的話側看像一塊磚 */
export const MOON_RING_HALF_THICKNESS = 0.3

/** 種類的編號，會寫進頂點：球體與環的打光不同 */
export const MOON_KIND = { body: 0, ring: 1 } as const
export type MoonKind = typeof MOON_KIND[keyof typeof MOON_KIND]

export interface MoonCell {
  x: number;
  y: number;
  z: number;
  kind: MoonKind;
  /** 這一格的底色（還沒打光） */
  albedo: MoonTriple;
}

export interface MoonFace {
  /** 四個角（月亮自己的體素格），依序繞一圈 */
  cornerList: MoonTriple[];
  /** 面的法線（月亮自己的軸） */
  normal: MoonTriple;
  cell: MoonCell;
}

/**
 * 隕石坑：朝這個方向的球面上挖掉一個小球（方向不必是單位向量）
 *
 * 視點大約在（−0.5, 0.33, −0.8）那一側（見 createRingedMoonFrame），坑都挖在看得到的這半邊
 */
const CRATER_LIST: { direction: MoonTriple; radius: number }[] = [
  { direction: [-0.75, 0.55, -0.35], radius: 3.1 },
  { direction: [-0.2, -0.35, -0.92], radius: 2.4 },
  { direction: [0.35, 0.3, -0.89], radius: 2.1 },
  { direction: [-0.85, -0.25, -0.46], radius: 1.8 },
  { direction: [0.15, 0.85, -0.5], radius: 2.2 },
]

const BODY_COLOR: MoonTriple = [0.76, 0.86, 0.8]
const RING_COLOR: MoonTriple = [0.94, 0.8, 0.58]

/** 整數座標的雜湊，回傳零到一：同一格每次都拿到同一個數，不靠抽籤的順序 */
function hashCell(x: number, y: number, z: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  value ^= value >>> 16
  return (value >>> 0) / 4294967296
}

function isRingRadius(radius: number): boolean {
  if (radius < MOON_RING_INNER_RADIUS || radius > MOON_RING_OUTER_RADIUS)
    return false
  return radius < MOON_RING_GAP_FROM || radius > MOON_RING_GAP_TO
}

function isInsideCrater(x: number, y: number, z: number): boolean {
  for (const crater of CRATER_LIST) {
    const length = Math.hypot(...crater.direction)
    /** 小球的球心放在球面外一點點，挖出來的坑才淺：一到兩格深 */
    const scale = (MOON_BODY_RADIUS + crater.radius * 0.45) / length
    const distance = Math.hypot(
      x - crater.direction[0] * scale,
      y - crater.direction[1] * scale,
      z - crater.direction[2] * scale,
    )
    if (distance < crater.radius)
      return true
  }
  return false
}

/**
 * 球體一格的底色
 *
 * 一層一層的緯度帶各有深淺（方塊堆的球，一層就是一圈方塊，帶子天生是階梯狀），
 * 再蓋幾塊顏色深的大斑（月海）與每格一點點的雜色
 */
function getBodyAlbedo(x: number, y: number, z: number): MoonTriple {
  const band = 0.84 + 0.16 * hashCell(0, y, 17)
  /** 大斑：把座標縮成四格一塊再取雜湊，三成的塊是深色 */
  const patch = hashCell(Math.floor((x + 40) / 4), Math.floor((y + 40) / 3), Math.floor((z + 40) / 4)) < 0.3 ? 0.78 : 1
  const speckle = 0.95 + 0.1 * hashCell(x, y, z)
  const tone = band * patch * speckle
  return [BODY_COLOR[0] * tone, BODY_COLOR[1] * tone, BODY_COLOR[2] * tone]
}

/** 環一格的底色：一圈一圈同心的深淺，環縫外面那一圈比裡面暗 */
function getRingAlbedo(radius: number): MoonTriple {
  const lane = 0.84 + 0.16 * hashCell(Math.round(radius), 3, 0)
  const tone = (radius > MOON_RING_GAP_TO ? 0.62 : 0.86) * lane
  return [RING_COLOR[0] * tone, RING_COLOR[1] * tone, RING_COLOR[2] * tone]
}

/** 環月所有實心的格子：球體（挖掉隕石坑）加上環 */
export function createRingedMoonCellList(): MoonCell[] {
  const cellList: MoonCell[] = []
  const bodyReach = MOON_BODY_RADIUS
  for (let x = -bodyReach; x <= bodyReach; x++) {
    for (let y = -bodyReach; y <= bodyReach; y++) {
      for (let z = -bodyReach; z <= bodyReach; z++) {
        if (x * x + y * y + z * z > MOON_BODY_RADIUS * MOON_BODY_RADIUS)
          continue
        if (isInsideCrater(x, y, z))
          continue
        cellList.push({ x, y, z, kind: MOON_KIND.body, albedo: getBodyAlbedo(x, y, z) })
      }
    }
  }

  const ringReach = Math.ceil(MOON_RING_OUTER_RADIUS)
  for (let x = -ringReach; x <= ringReach; x++) {
    for (let z = -ringReach; z <= ringReach; z++) {
      const radius = Math.hypot(x, z)
      if (isRingRadius(radius))
        cellList.push({ x, y: 0, z, kind: MOON_KIND.ring, albedo: getRingAlbedo(radius) })
    }
  }
  return cellList
}

function createCellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

const FACE_LIST = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
] as const

const CORNER_LIST = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const

/**
 * 從固定的視點看得到的面，由遠到近排好
 *
 * eye 是視點在月亮體素格裡的位置。被鄰格蓋住的面、背對視點的面都不產生
 */
export function buildRingedMoonFaceList(cellList: readonly MoonCell[], eye: MoonTriple): MoonFace[] {
  const solidSet = new Set(cellList.map((cell) => createCellKey(cell.x, cell.y, cell.z)))
  const measureEyeDistance = (cell: MoonCell): number => (cell.x - eye[0]) ** 2 + (cell.y - eye[1]) ** 2 + (cell.z - eye[2]) ** 2
  const sortedCellList = [...cellList].sort((first, second) => measureEyeDistance(second) - measureEyeDistance(first))

  const faceList: MoonFace[] = []
  for (const cell of sortedCellList) {
    const center: MoonTriple = [cell.x, cell.y, cell.z]
    const halfExtent: MoonTriple = [0.5, cell.kind === MOON_KIND.ring ? MOON_RING_HALF_THICKNESS : 0.5, 0.5]
    for (const face of FACE_LIST) {
      const normal: [number, number, number] = [0, 0, 0]
      normal[face.axis] = face.sign
      if (solidSet.has(createCellKey(cell.x + normal[0], cell.y + normal[1], cell.z + normal[2])))
        continue

      const faceCenter = center.map((value, axis) => value + normal[axis]! * halfExtent[axis]!)
      const facing = normal[0] * (eye[0] - faceCenter[0]!) + normal[1] * (eye[1] - faceCenter[1]!) + normal[2] * (eye[2] - faceCenter[2]!)
      if (facing <= 0)
        continue

      const firstAxis = (face.axis + 1) % 3
      const secondAxis = (face.axis + 2) % 3
      const cornerList = CORNER_LIST.map(([first, second]): MoonTriple => {
        const corner: [number, number, number] = [faceCenter[0]!, faceCenter[1]!, faceCenter[2]!]
        corner[firstAxis] = center[firstAxis]! + first * halfExtent[firstAxis]!
        corner[secondAxis] = center[secondAxis]! + second * halfExtent[secondAxis]!
        return corner
      })
      faceList.push({ cornerList, normal, cell })
    }
  }
  return faceList
}

/** 環面朝看的人掀開多少、整顆在畫面上歪多少、體素格繞自轉軸轉多少（弧度） */
const MOON_TILT_RADIAN = 0.36
const MOON_ROLL_RADIAN = 0.4
const MOON_YAW_RADIAN = 0.55

/** 月亮自己的三根軸（天球上的單位向量）與視點在體素格裡的位置 */
export interface MoonFrame {
  xAxis: MoonTriple;
  yAxis: MoonTriple;
  zAxis: MoonTriple;
  eye: MoonTriple;
}

function dot(first: MoonTriple, second: MoonTriple): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

function cross(first: MoonTriple, second: MoonTriple): MoonTriple {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ]
}

function combine(first: MoonTriple, firstScale: number, second: MoonTriple, secondScale: number): MoonTriple {
  return [
    first[0] * firstScale + second[0] * secondScale,
    first[1] * firstScale + second[1] * secondScale,
    first[2] * firstScale + second[2] * secondScale,
  ]
}

function normalize(vector: MoonTriple): MoonTriple {
  const length = Math.hypot(vector[0], vector[1], vector[2])
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

/**
 * 月亮的姿態
 *
 * forward 是從看的人指向月心的單位向量，distance 是月心離看的人多遠、voxelSize 是一格體素多大（同一個單位）。
 * 自轉軸先朝看的人倒一點（看得到環的正面），再在畫面上歪一個角度；
 * 體素格另外繞自轉軸轉半個弧度，方塊才不會正面對著人——斜著看一次露出三個面，才讀得出是立體的方塊
 */
export function createRingedMoonFrame(forward: MoonTriple, distance: number, voxelSize: number): MoonFrame {
  const right = normalize(cross([0, 1, 0], forward))
  const up = cross(forward, right)
  const tilted = combine(up, Math.cos(MOON_TILT_RADIAN), forward, -Math.sin(MOON_TILT_RADIAN))
  /** 繞著視線轉：右與上在畫面上轉一個角度，朝著人的那一份不變 */
  const rolledUp = combine(up, Math.cos(MOON_ROLL_RADIAN), right, Math.sin(MOON_ROLL_RADIAN))
  const yAxis = normalize(combine(rolledUp, dot(tilted, up), forward, dot(tilted, forward)))

  /** 環面上「離看的人最遠」的方向，與它垂直的另一根 */
  const far = normalize(combine(forward, 1, yAxis, -dot(forward, yAxis)))
  const side = cross(yAxis, far)
  const xAxis = combine(side, Math.cos(MOON_YAW_RADIAN), far, Math.sin(MOON_YAW_RADIAN))
  const zAxis = combine(side, -Math.sin(MOON_YAW_RADIAN), far, Math.cos(MOON_YAW_RADIAN))

  const reach = -distance / voxelSize
  return {
    xAxis,
    yAxis,
    zAxis,
    eye: [dot(forward, xAxis) * reach, dot(forward, yAxis) * reach, dot(forward, zAxis) * reach],
  }
}
