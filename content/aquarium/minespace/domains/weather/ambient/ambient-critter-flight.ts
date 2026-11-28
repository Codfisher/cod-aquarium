import type { AmbientKindSpec } from './ambient-kind-spec'

/**
 * 環境生物的飛行（純計算，不引用 Babylon，可以單獨測）
 *
 * 像素方片那一路是 Babylon 的粒子系統在管位移與壽命，再由更新函式逐顆改速度（見 ambient-layer）。
 * 換成方盒之後不再走粒子系統，這裡把同一套動法搬過來：一樣的生成速度、壽命、初速、
 * 轉彎（含蜻蜓的急轉與蛾的繞圈）、上下起伏、順風與垂直速度的靠攏，種類表的數字不必改。
 *
 * 多出來的只有方片用不到的幾樣：朝向、轉彎時的側傾、上升下降時的俯仰，以及蜻蜓的懸停。
 * 整群的狀態放在幾條定長的陣列裡，活著的永遠排在前面（死掉的那一格由最後一隻補上），不配置新物件
 */

/** 黃金角：每一隻依編號取一個彼此錯開的相位，與方片那一路同一個數 */
const GOLDEN_ANGLE = 2.399963

/** 黃金比例的小數：懸停的輪次依編號錯開 */
const GOLDEN_RATIO_FRACTION = 0.61803398875

/** 一幀最多當成這麼長：分頁切回來那一幀不能讓整群瞬間飛走 */
const MAX_DELTA_SECOND = 0.1

/** 水平速度低於這個值就不更新朝向：幾乎沒在動的時候，速度的方向只是雜訊，照著轉會原地亂轉 */
const MIN_HEADING_SPEED = 0.05

/** 朝向、側傾、俯仰各以多快的速度跟上目標（每秒） */
const HEADING_FOLLOW_RATE = 12
const BANK_FOLLOW_RATE = 6
const PITCH_FOLLOW_RATE = 6

/** 俯仰：照爬升角打幾折、最多仰（俯）到哪裡（弧度） */
const PITCH_GAIN = 0.7
const MAX_PITCH_RADIAN = 0.45

/** 一生的明暗：出生後這一段淡入、最後這一段淡出，與方片的 soft 同一組數字 */
const FADE_IN_END = 0.15
const FADE_OUT_START = 0.8

/** 懸停的頭尾各用一輪的這麼多來收放速度，才不會急煞 */
const HOVER_EASE = 0.06

export interface CritterFlock {
  capacity: number;
  /** 活著的有幾隻，都排在各陣列的最前面 */
  aliveCount: number;
  /** 下一隻的編號：編號決定轉彎與起伏的相位 */
  nextId: number;
  /** 還沒滿一隻的生成量，累積到下一幀 */
  spawnExcess: number;
  /** 位置與速度（格、格／秒），三個一組 */
  positionList: Float32Array;
  directionList: Float32Array;
  ageList: Float32Array;
  lifeList: Float32Array;
  idList: Int32Array;
  /** 頭朝哪裡（弧度，速度在水平面上的方位） */
  headingList: Float32Array;
  /** 往轉彎內側傾多少、仰起多少（弧度） */
  bankList: Float32Array;
  pitchList: Float32Array;
  /** 大小與顏色各抽一個零到一的數，怎麼換算由層決定 */
  sizeRatioList: Float32Array;
  colorRatioList: Float32Array;
}

export function createCritterFlock(capacity: number): CritterFlock {
  return {
    capacity,
    aliveCount: 0,
    nextId: 0,
    spawnExcess: 0,
    positionList: new Float32Array(capacity * 3),
    directionList: new Float32Array(capacity * 3),
    ageList: new Float32Array(capacity),
    lifeList: new Float32Array(capacity),
    idList: new Int32Array(capacity),
    headingList: new Float32Array(capacity),
    bankList: new Float32Array(capacity),
    pitchList: new Float32Array(capacity),
    sizeRatioList: new Float32Array(capacity),
    colorRatioList: new Float32Array(capacity),
  }
}

/** 一生的明暗（零到一）：淡入、撐住、淡出 */
export function measureCritterFade(ageRatio: number): number {
  if (ageRatio <= 0 || ageRatio >= 1)
    return 0
  if (ageRatio < FADE_IN_END)
    return ageRatio / FADE_IN_END
  if (ageRatio > FADE_OUT_START)
    return (1 - ageRatio) / (1 - FADE_OUT_START)
  return 1
}

function smoothstep(from: number, to: number, value: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 懸停時水平速度剩幾成（零到一）
 *
 * 每一輪的開頭那一段停在半空，其餘時間照常飛；每一隻的輪次依編號錯開
 */
export function measureHoverFactor(age: number, id: number, hover: { period: number; ratio: number }): number {
  const cycle = (age / hover.period + id * GOLDEN_RATIO_FRACTION) % 1
  return smoothstep(hover.ratio, hover.ratio + HOVER_EASE, cycle) * (1 - smoothstep(1 - HOVER_EASE, 1, cycle))
}

/** 兩個方位之間最短的那一段差（−π 到 π） */
function measureAngleDifference(from: number, to: number): number {
  const difference = to - from
  return difference - Math.round(difference / (Math.PI * 2)) * Math.PI * 2
}

function pickBetween(range: readonly [number, number], random: () => number): number {
  return range[0] + (range[1] - range[0]) * random()
}

/** 把最後一隻搬到這一格，補掉死掉的那一隻 */
function moveCritter(flock: CritterFlock, from: number, to: number): void {
  for (let axis = 0; axis < 3; axis++) {
    flock.positionList[to * 3 + axis] = flock.positionList[from * 3 + axis]!
    flock.directionList[to * 3 + axis] = flock.directionList[from * 3 + axis]!
  }
  flock.ageList[to] = flock.ageList[from]!
  flock.lifeList[to] = flock.lifeList[from]!
  flock.idList[to] = flock.idList[from]!
  flock.headingList[to] = flock.headingList[from]!
  flock.bankList[to] = flock.bankList[from]!
  flock.pitchList[to] = flock.pitchList[from]!
  flock.sizeRatioList[to] = flock.sizeRatioList[from]!
  flock.colorRatioList[to] = flock.colorRatioList[from]!
}

export interface CritterFlightParam {
  /** 這一種的動法，直接讀環境粒子的種類表 */
  spec: AmbientKindSpec;
  /** 轉彎時的側傾（見 ambient-critter-shape 的 bank） */
  bank: { gain: number; maxRadian: number };
  deltaSecond: number;
  /** 此刻的風（格／秒），已含這一層的風速倍率 */
  windX: number;
  windZ: number;
  /** 每秒該生幾隻；零就是不再生新的，已經在飛的讓牠飛完 */
  emitRate: number;
  /** 幫新的一隻挑出生位置，寫進 positionList 的 offset 起三格 */
  placeCritter: (positionList: Float32Array, offset: number) => void;
  random?: () => number;
}

/**
 * 整群往前走一幀
 *
 * 順序與粒子系統那一路相同：先讓活著的變老、移動、回收死掉的，再生新的，最後逐隻調整速度
 */
export function stepCritterFlock(flock: CritterFlock, param: CritterFlightParam): void {
  const { spec, bank } = param
  const random = param.random ?? Math.random
  const deltaSecond = Math.min(MAX_DELTA_SECOND, Math.max(0, param.deltaSecond))
  const meander = spec.meander
  const hover = meander?.hover
  const gravity = spec.gravity ?? 0

  /** 變老、移動、回收 */
  for (let index = 0; index < flock.aliveCount; index++) {
    flock.ageList[index] = flock.ageList[index]! + deltaSecond
    if (flock.ageList[index]! >= flock.lifeList[index]!) {
      flock.aliveCount--
      if (index < flock.aliveCount) {
        /** 補上來的那一隻這一幀還沒走，同一格再跑一次 */
        moveCritter(flock, flock.aliveCount, index)
        index--
      }
      continue
    }

    /** 懸停只收水平的速度：停在半空時照樣上下輕輕起伏 */
    const hoverFactor = hover ? measureHoverFactor(flock.ageList[index]!, flock.idList[index]!, hover) : 1
    const offset = index * 3
    flock.positionList[offset] = flock.positionList[offset]! + flock.directionList[offset]! * deltaSecond * hoverFactor
    flock.positionList[offset + 1] = flock.positionList[offset + 1]! + flock.directionList[offset + 1]! * deltaSecond
    flock.positionList[offset + 2] = flock.positionList[offset + 2]! + flock.directionList[offset + 2]! * deltaSecond * hoverFactor
    flock.directionList[offset + 1] = flock.directionList[offset + 1]! + gravity * deltaSecond
  }

  /** 生新的：不滿一隻的份量留到下一幀；滿了就不生，多出來的份量丟掉（不囤到之後一次補） */
  flock.spawnExcess += Math.max(0, param.emitRate) * deltaSecond
  while (flock.spawnExcess >= 1) {
    flock.spawnExcess -= 1
    if (flock.aliveCount >= flock.capacity)
      continue

    const index = flock.aliveCount++
    const offset = index * 3
    param.placeCritter(flock.positionList, offset)

    const horizontal = pickBetween(spec.horizontalSpeed, random)
    const hasWind = Math.hypot(param.windX, param.windZ) > 0.01
    const angle = spec.isWindAligned && hasWind
      ? Math.atan2(param.windZ, param.windX) + (random() - 0.5) * 0.6
      : random() * Math.PI * 2
    flock.directionList[offset] = Math.cos(angle) * horizontal
    flock.directionList[offset + 1] = pickBetween(spec.verticalSpeed, random)
    flock.directionList[offset + 2] = Math.sin(angle) * horizontal

    flock.ageList[index] = 0
    flock.lifeList[index] = pickBetween(spec.life, random)
    flock.idList[index] = flock.nextId++
    flock.headingList[index] = angle
    flock.bankList[index] = 0
    flock.pitchList[index] = 0
    flock.sizeRatioList[index] = random()
    flock.colorRatioList[index] = random()
  }

  /** 飛行：轉彎、順風、上浮下沉，再由速度推出朝向、側傾與俯仰 */
  const windRate = Math.min(1, spec.windFollow * deltaSecond * 1.5)
  const verticalRate = spec.verticalTarget ? Math.min(1, spec.verticalTarget.rate * deltaSecond) : 0
  const headingRate = Math.min(1, HEADING_FOLLOW_RATE * deltaSecond)
  const bankRate = Math.min(1, BANK_FOLLOW_RATE * deltaSecond)
  const pitchRate = Math.min(1, PITCH_FOLLOW_RATE * deltaSecond)

  for (let index = 0; index < flock.aliveCount; index++) {
    const offset = index * 3
    const age = flock.ageList[index]!
    const id = flock.idList[index]!
    const phase = id * GOLDEN_ANGLE
    let directionX = flock.directionList[offset]!
    let directionY = flock.directionList[offset + 1]!
    let directionZ = flock.directionList[offset + 2]!

    if (meander) {
      const wave = Math.sin(age * meander.frequency + phase)
      let turn = meander.isSharp ? wave * wave * wave : wave
      turn *= meander.turn
      if (meander.isCircling)
        turn = meander.turn * (id % 2 === 0 ? 1 : -1) * (0.75 + 0.25 * wave)

      /** 水平速度繞 Y 軸轉過去，速率不變，路徑就是一條彎彎的線 */
      const angle = turn * deltaSecond
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const nextX = directionX * cos - directionZ * sin
      directionZ = directionX * sin + directionZ * cos
      directionX = nextX

      if (meander.bob !== undefined)
        directionY = Math.cos(age * (meander.bobFrequency ?? meander.frequency) + phase * 1.7) * meander.bob
    }

    if (windRate > 0) {
      directionX += (param.windX - directionX) * windRate
      directionZ += (param.windZ - directionZ) * windRate
    }

    if (verticalRate > 0)
      directionY += (spec.verticalTarget!.speed - directionY) * verticalRate

    flock.directionList[offset] = directionX
    flock.directionList[offset + 1] = directionY
    flock.directionList[offset + 2] = directionZ

    /** 朝向跟著速度的方向走；幾乎沒在動就維持原本的朝向 */
    const horizontalSpeed = Math.hypot(directionX, directionZ)
    let turnRate = 0
    if (horizontalSpeed > MIN_HEADING_SPEED && deltaSecond > 0) {
      const heading = flock.headingList[index]!
      const turnStep = measureAngleDifference(heading, Math.atan2(directionZ, directionX)) * headingRate
      flock.headingList[index] = heading + turnStep
      turnRate = turnStep / deltaSecond
    }

    /** 朝向的方位增加時，內側是「右」那一邊（見 ambient-critter-layer 的座標），側傾為正就是右翅壓低 */
    const bankTarget = Math.min(bank.maxRadian, Math.max(-bank.maxRadian, turnRate * bank.gain))
    flock.bankList[index] = flock.bankList[index]! + (bankTarget - flock.bankList[index]!) * bankRate

    const pitchTarget = Math.min(
      MAX_PITCH_RADIAN,
      Math.max(-MAX_PITCH_RADIAN, Math.atan2(directionY, Math.max(horizontalSpeed, 0.2)) * PITCH_GAIN),
    )
    flock.pitchList[index] = flock.pitchList[index]! + (pitchTarget - flock.pitchList[index]!) * pitchRate
  }
}
