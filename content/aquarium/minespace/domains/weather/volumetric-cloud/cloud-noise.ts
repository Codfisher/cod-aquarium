import { createSeededRandom } from '../../../utils/noise'

/**
 * 體積雲的三張雜訊
 *
 * 這一支只做純計算，不碰 Babylon、不碰 DOM：同一份程式碼在 worker 裡跑，
 * 也能直接用 node 量時間與數值分布（體積雲的參數全是量出來的，這點很要緊）。
 *
 * 三張圖的分工照 Guerrilla 在《Horizon Zero Dawn》提出的那套
 * （Schneider 2015〈The Real-time Volumetric Cloudscapes of Horizon Zero Dawn〉，
 * 後來 2017 的 Nubis 與 2022 的 Nubis Evolved 都沿用這個骨架）：
 *
 *   基底：低頻的 Perlin-Worley，決定一朵雲的大形——鼓起來的一團一團
 *   細節：高頻的 Worley，只在雲的邊緣啃出捲曲的缺口
 *   天氣圖：二維，決定哪裡有雲、是哪一種雲
 *
 * ── 為什麼要 Perlin 與 Worley 混著用 ──
 *
 * Perlin 是連續起伏的丘陵，拿來當雲的密度會長出一片一片糊開的霧；
 * Worley（離最近特徵點的距離）反過來取，則是一顆一顆圓鼓鼓的泡泡，
 * 正好是積雲頂上那種花椰菜的質地。兩者相乘取長補短：
 * Perlin 給整體的連貫，Worley 給邊緣的鼓起。
 *
 * ── 全部都要能無縫平鋪 ──
 *
 * 三張圖在著色器裡都是重複定址、無限平鋪的。所以格點的亂數都要繞回去取，
 * 圖的這一端與那一端才接得起來；這與雲影圖樣當年的硬性條件是同一件事
 */

/** 一張三維雜訊的邊長與資料，資料照 x + y·size + z·size² 排，四通道 */
export interface CloudNoiseVolume {
  size: number;
  data: Uint8Array;
}

export interface CloudNoiseSet {
  base: CloudNoiseVolume;
  detail: CloudNoiseVolume;
  weather: { size: number; data: Uint8Array };
  cirrus: { size: number; data: Uint8Array };
}

export interface CloudNoiseSizeOption {
  /**
   * 基底的邊長
   *
   * Nubis 的規格是 128，但那一張在 JS 裡要算七秒半（node 實測，
   * 五個頻率的 Worley 每一格各查二十七個鄰居）；64 只要一秒出頭。
   * 基底只負責雲的大形，攤在幾百格寬的天上一格六格多，
   * 再加上三線性內插，看不出差別——細節本來就是另一張圖的事
   */
  baseSize: number;
  /** 細節的邊長 */
  detailSize: number;
  /** 天氣圖的邊長 */
  weatherSize: number;
  /** 卷雲貼圖的邊長 */
  cirrusSize: number;
}

/** 把 value 從 [low, high] 線性對應到 [newLow, newHigh]，Nubis 整套都靠這個運算 */
function remap(value: number, low: number, high: number, newLow: number, newHigh: number): number {
  return newLow + ((value - low) / (high - low)) * (newHigh - newLow)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** 五次的平滑曲線，Perlin 原作的改良版，二階導數在格點上也連續 */
function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function wrapIndex(value: number, period: number): number {
  return ((value % period) + period) % period
}

/**
 * 可平鋪的三維梯度雜訊（Perlin）
 *
 * 每個格點一支隨機單位向量，格點座標對週期取餘數，所以 period 格之後
 * 回到同一組向量——這就是平鋪的全部祕訣。回傳的函式吃格點單位的座標
 */
function createPeriodicGradient3D(
  random: () => number,
  periodX: number,
  periodY = periodX,
  periodZ = periodX,
) {
  const latticeCount = periodX * periodY * periodZ
  const gradientList = new Float32Array(latticeCount * 3)

  for (let index = 0; index < latticeCount; index++) {
    /** 球面上均勻取向：z 均勻、方位角均勻，不會往兩極擠 */
    const z = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(1 - z * z)
    gradientList[index * 3] = radius * Math.cos(angle)
    gradientList[index * 3 + 1] = radius * Math.sin(angle)
    gradientList[index * 3 + 2] = z
  }

  const dotCorner = (cellX: number, cellY: number, cellZ: number, offsetX: number, offsetY: number, offsetZ: number) => {
    const index = (wrapIndex(cellX, periodX)
      + wrapIndex(cellY, periodY) * periodX
      + wrapIndex(cellZ, periodZ) * periodX * periodY) * 3

    return (gradientList[index] ?? 0) * offsetX
      + (gradientList[index + 1] ?? 0) * offsetY
      + (gradientList[index + 2] ?? 0) * offsetZ
  }

  return (x: number, y: number, z: number): number => {
    const cellX = Math.floor(x)
    const cellY = Math.floor(y)
    const cellZ = Math.floor(z)
    const localX = x - cellX
    const localY = y - cellY
    const localZ = z - cellZ
    const weightX = fade(localX)
    const weightY = fade(localY)
    const weightZ = fade(localZ)

    const corner000 = dotCorner(cellX, cellY, cellZ, localX, localY, localZ)
    const corner100 = dotCorner(cellX + 1, cellY, cellZ, localX - 1, localY, localZ)
    const corner010 = dotCorner(cellX, cellY + 1, cellZ, localX, localY - 1, localZ)
    const corner110 = dotCorner(cellX + 1, cellY + 1, cellZ, localX - 1, localY - 1, localZ)
    const corner001 = dotCorner(cellX, cellY, cellZ + 1, localX, localY, localZ - 1)
    const corner101 = dotCorner(cellX + 1, cellY, cellZ + 1, localX - 1, localY, localZ - 1)
    const corner011 = dotCorner(cellX, cellY + 1, cellZ + 1, localX, localY - 1, localZ - 1)
    const corner111 = dotCorner(cellX + 1, cellY + 1, cellZ + 1, localX - 1, localY - 1, localZ - 1)

    const edge00 = corner000 + (corner100 - corner000) * weightX
    const edge10 = corner010 + (corner110 - corner010) * weightX
    const edge01 = corner001 + (corner101 - corner001) * weightX
    const edge11 = corner011 + (corner111 - corner011) * weightX
    const face0 = edge00 + (edge10 - edge00) * weightY
    const face1 = edge01 + (edge11 - edge01) * weightY

    return face0 + (face1 - face0) * weightZ
  }
}

/**
 * 可平鋪的三維 Worley（離最近特徵點的距離），反過來取
 *
 * 每一格放一個隨機特徵點，問「離我最近的點有多遠」只要查自己與四周
 * 二十六格。回傳一減距離：靠近特徵點是一、格子交界處趨近零，
 * 長出來的是一顆一顆鼓起的泡泡，正是積雲頂端那種花椰菜的樣子
 */
function createPeriodicWorley3D(random: () => number, cellCount: number) {
  const pointList = new Float32Array(cellCount * cellCount * cellCount * 3)
  for (let index = 0; index < pointList.length; index++) {
    pointList[index] = random()
  }

  /** x、y、z 都是 0 到 1 的平鋪座標 */
  return (x: number, y: number, z: number): number => {
    const scaledX = x * cellCount
    const scaledY = y * cellCount
    const scaledZ = z * cellCount
    const cellX = Math.floor(scaledX)
    const cellY = Math.floor(scaledY)
    const cellZ = Math.floor(scaledZ)
    let nearest = Infinity

    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighborX = cellX + offsetX
          const neighborY = cellY + offsetY
          const neighborZ = cellZ + offsetZ
          /** 鄰格的特徵點從繞回去的那一格讀，位置卻要留在沒繞回去的這一側 */
          const index = (wrapIndex(neighborX, cellCount)
            + wrapIndex(neighborY, cellCount) * cellCount
            + wrapIndex(neighborZ, cellCount) * cellCount * cellCount) * 3
          const deltaX = neighborX + (pointList[index] ?? 0) - scaledX
          const deltaY = neighborY + (pointList[index + 1] ?? 0) - scaledY
          const deltaZ = neighborZ + (pointList[index + 2] ?? 0) - scaledZ
          const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ
          if (distanceSquared < nearest) {
            nearest = distanceSquared
          }
        }
      }
    }

    return 1 - clamp01(Math.sqrt(nearest))
  }
}

/** 同上，二維版，給天氣圖用 */
function createPeriodicWorley2D(random: () => number, cellCount: number) {
  const pointList = new Float32Array(cellCount * cellCount * 2)
  for (let index = 0; index < pointList.length; index++) {
    pointList[index] = random()
  }

  return (x: number, y: number): number => {
    const scaledX = x * cellCount
    const scaledY = y * cellCount
    const cellX = Math.floor(scaledX)
    const cellY = Math.floor(scaledY)
    let nearest = Infinity

    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const neighborX = cellX + offsetX
        const neighborY = cellY + offsetY
        const index = (wrapIndex(neighborX, cellCount) + wrapIndex(neighborY, cellCount) * cellCount) * 2
        const deltaX = neighborX + (pointList[index] ?? 0) - scaledX
        const deltaY = neighborY + (pointList[index + 1] ?? 0) - scaledY
        nearest = Math.min(nearest, deltaX * deltaX + deltaY * deltaY)
      }
    }

    return 1 - clamp01(Math.sqrt(nearest))
  }
}

/**
 * 可平鋪的二維梯度雜訊，兩軸可以給不同的週期
 *
 * 給卷雲用：X 軸週期短、Z 軸週期長，拉出來的就是順著風向的長條。
 * 直接拿三維那支在 z = 0.5 的切片上取，第三軸週期給一就好。
 * 回傳的函式吃 0 到 1 的平鋪座標
 */
function createPeriodicGradient2D(random: () => number, periodX: number, periodY: number) {
  const gradient = createPeriodicGradient3D(random, periodX, periodY, 1)

  return (x: number, y: number): number => gradient(x * periodX, y * periodY, 0.5)
}

/**
 * 把一層一層的 Worley 疊成分形
 *
 * 權重 0.625、0.25、0.125 是 Nubis 的那組：低頻主導形狀，
 * 高頻只在表面加一層顆粒
 */
function sumWorleyOctave(first: number, second: number, third: number): number {
  return first * 0.625 + second * 0.25 + third * 0.125
}

/**
 * 依名次重新分配，讓數值在零到一之間均勻分布
 *
 * 天氣圖的覆蓋率是交給著色器那邊用一個門檻去切的。
 * 原始的雜訊集中在中間，門檻往上推一點點覆蓋率就掉一大截，
 * 「雲量給三成五」跟畫面上看到的雲量對不起來。
 * 拉成均勻分布之後，門檻切在哪裡，天空就有那麼多比例的地方可能長雲——
 * 與舊雲層「取分位數當門檻」（createCloudPattern）是同一個道理
 */
function equalize(valueList: Float32Array): Float32Array {
  const orderList = Array.from(valueList.keys()).sort((a, b) => (valueList[a] ?? 0) - (valueList[b] ?? 0))
  const result = new Float32Array(valueList.length)
  const lastIndex = Math.max(1, orderList.length - 1)

  for (const [rank, index] of orderList.entries()) {
    result[index] = rank / lastIndex
  }

  return result
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255)
}

/**
 * 基底雜訊
 *
 * 紅：Perlin-Worley，雲的大形。
 * 綠藍透明：三個頻率的 Worley 分形，著色器拿它們疊成一個低頻 FBM，
 * 再用那個 FBM 去「削」紅色通道——Nubis 的寫法，雲的輪廓因此一層包一層
 */
export function createBaseNoise(size: number, seed: string): CloudNoiseVolume {
  const random = createSeededRandom(`${seed}-base`)
  /** Perlin 的週期以格點計，每一個八度翻倍才平鋪得起來 */
  const perlinOctaveList = [4, 8, 16, 32].map((period) => ({
    period,
    sample: createPeriodicGradient3D(random, period),
  }))
  const worley4 = createPeriodicWorley3D(random, 4)
  const worley8 = createPeriodicWorley3D(random, 8)
  const worley16 = createPeriodicWorley3D(random, 16)
  const worley32 = createPeriodicWorley3D(random, 32)

  const data = new Uint8Array(size * size * size * 4)
  const inverseSize = 1 / size

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        /** 取格子中心，三軸對稱，平鋪接縫上兩側取到的距離一樣 */
        const u = (x + 0.5) * inverseSize
        const v = (y + 0.5) * inverseSize
        const w = (z + 0.5) * inverseSize

        let perlin = 0
        let amplitude = 1
        let amplitudeSum = 0
        for (const octave of perlinOctaveList) {
          perlin += octave.sample(u * octave.period, v * octave.period, w * octave.period) * amplitude
          amplitudeSum += amplitude
          amplitude *= 0.5
        }
        /**
         * 梯度雜訊疊完的值大多落在正負零點三之間，除以零點四五拉到接近正負一，
         * 再換到零到一。不拉開的話整個通道擠在中間，Worley 托上來之後
         * 幾乎每一格都是滿的（量過：平均零點九三，九成以上落在最高那一段），
         * 著色器那邊再怎麼調門檻都切不出形狀
         */
        const perlinValue = clamp01((perlin / amplitudeSum) / 0.45 * 0.5 + 0.5)

        const sample4 = worley4(u, v, w)
        const sample8 = worley8(u, v, w)
        const sample16 = worley16(u, v, w)
        const sample32 = worley32(u, v, w)

        const worleyLow = sumWorleyOctave(sample4, sample8, sample16)
        const worleyMid = sumWorleyOctave(sample8, sample16, sample32)
        /** 六十四格的圖上放不下六十四顆特徵點（一格一顆會疊成雜點），最高頻只到三十二 */
        const worleyHigh = sample16 * 0.7 + sample32 * 0.3

        /**
         * Perlin 被 Worley 托住底（Schneider 2015 的原式）
         *
         * Worley 鼓起來的地方，Perlin 的低谷也被抬上來，
         * 所以雲團的形狀是 Perlin 的連貫、邊緣卻是 Worley 的一顆一顆
         */
        const perlinWorley = clamp01(remap(perlinValue, 0, 1, worleyLow, 1))

        const index = (x + y * size + z * size * size) * 4
        data[index] = toByte(perlinWorley)
        data[index + 1] = toByte(worleyLow)
        data[index + 2] = toByte(worleyMid)
        data[index + 3] = toByte(worleyHigh)
      }
    }
  }

  return { size, data }
}

/**
 * 細節雜訊
 *
 * 三個頻率的 Worley 分形。只在雲的邊緣用來啃缺口，
 * 雲的內部密度高、被削掉一點也看不出來
 */
export function createDetailNoise(size: number, seed: string): CloudNoiseVolume {
  const random = createSeededRandom(`${seed}-detail`)
  const cellCountList = [2, 4, 8, 16, 32]
  const worleyList = cellCountList.map((count) => createPeriodicWorley3D(random, count))

  const data = new Uint8Array(size * size * size * 4)
  const inverseSize = 1 / size

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) * inverseSize
        const v = (y + 0.5) * inverseSize
        const w = (z + 0.5) * inverseSize
        const sampleList = worleyList.map((worley) => worley(u, v, w))

        const index = (x + y * size + z * size * size) * 4
        data[index] = toByte(sumWorleyOctave(sampleList[0] ?? 0, sampleList[1] ?? 0, sampleList[2] ?? 0))
        data[index + 1] = toByte(sumWorleyOctave(sampleList[1] ?? 0, sampleList[2] ?? 0, sampleList[3] ?? 0))
        data[index + 2] = toByte(sumWorleyOctave(sampleList[2] ?? 0, sampleList[3] ?? 0, sampleList[4] ?? 0))
        data[index + 3] = 255
      }
    }
  }

  return { size, data }
}

/**
 * 天氣圖
 *
 * 紅：這一帶多容易長雲，已經拉成均勻分布（見 equalize）。
 * 綠：雲的種類，零是扁平的層積雲、一是往上長的積雲。
 * 藍：高空卷雲的濃淡，順著一個方向拉長。
 *
 * 紅色是低頻 Perlin 與 Worley 混出來的：Perlin 決定「哪一大片天比較多雲」，
 * Worley 讓雲一團一團聚起來，中間留出藍天，不會均勻地灑一層
 */
export function createWeatherMap(size: number, seed: string): { size: number; data: Uint8Array } {
  const random = createSeededRandom(`${seed}-weather`)
  const coverageOctaveList = [3, 6, 12, 24].map((period) => ({
    period,
    sample: createPeriodicGradient3D(random, period),
  }))
  const clusterWorley = createPeriodicWorley2D(random, 10)
  const clusterWorleyFine = createPeriodicWorley2D(random, 22)
  const typeNoise = createPeriodicGradient3D(random, 3)
  const cirrusNoise = createPeriodicGradient2D(random, 6, 24)
  const cirrusNoiseFine = createPeriodicGradient2D(random, 12, 48)

  const coverageList = new Float32Array(size * size)
  const typeList = new Float32Array(size * size)
  const cirrusList = new Float32Array(size * size)
  const inverseSize = 1 / size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * inverseSize
      const v = (y + 0.5) * inverseSize
      const index = x + y * size

      let perlin = 0
      let amplitude = 1
      let amplitudeSum = 0
      for (const octave of coverageOctaveList) {
        perlin += octave.sample(u * octave.period, v * octave.period, 0.5) * amplitude
        amplitudeSum += amplitude
        amplitude *= 0.55
      }
      const cluster = clusterWorley(u, v) * 0.7 + clusterWorleyFine(u, v) * 0.3
      coverageList[index] = (perlin / amplitudeSum) * 0.6 + cluster

      typeList[index] = clamp01(typeNoise(u * 3, v * 3, 0.5) * 1.4 + 0.5)

      cirrusList[index] = cirrusNoise(u, v) + cirrusNoiseFine(u, v) * 0.45
    }
  }

  const equalizedCoverageList = equalize(coverageList)
  const equalizedCirrusList = equalize(cirrusList)

  const data = new Uint8Array(size * size * 4)
  for (let index = 0; index < size * size; index++) {
    data[index * 4] = toByte(equalizedCoverageList[index] ?? 0)
    data[index * 4 + 1] = toByte(typeList[index] ?? 0)
    data[index * 4 + 2] = toByte(equalizedCirrusList[index] ?? 0)
    data[index * 4 + 3] = 255
  }

  return { size, data }
}

/** 在可平鋪的灰階圖上做雙線性取樣，座標以格為單位，超出範圍會繞回去 */
function sampleWrapped(valueList: Float32Array, size: number, x: number, y: number): number {
  const baseX = Math.floor(x)
  const baseY = Math.floor(y)
  const ratioX = x - baseX
  const ratioY = y - baseY
  const read = (offsetX: number, offsetY: number) =>
    valueList[wrapIndex(baseX + offsetX, size) + wrapIndex(baseY + offsetY, size) * size] ?? 0

  const top = read(0, 0) * (1 - ratioX) + read(1, 0) * ratioX
  const bottom = read(0, 1) * (1 - ratioX) + read(1, 1) * ratioX
  return top * (1 - ratioY) + bottom * ratioY
}

/**
 * 沿著流場做線積分卷積（Line Integral Convolution）
 *
 * 從每一格出發，順著流向往前、往後各走一段，把沿路的雜訊加權平均。
 * 同一條流線上的格子平均到幾乎同一組雜訊，彼此很像；
 * 相鄰兩條流線則各自平均到不同的雜訊——於是長出一絲一絲順著流向的紋理，
 * 而且會跟著流場一起彎。這正是卷雲被高空風扯成馬尾的樣子。
 *
 * 權重用 Hann 窗：兩端漸弱，條紋的頭尾才是慢慢收掉，不是一刀切
 */
function convolveAlongFlow(
  noiseList: Float32Array,
  angleList: Float32Array,
  size: number,
  halfLength: number,
  stepSize: number,
): Float32Array {
  const result = new Float32Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let total = sampleWrapped(noiseList, size, x, y)
      let weightTotal = 1

      for (const direction of [1, -1]) {
        let positionX = x
        let positionY = y
        for (let step = 1; step <= halfLength; step++) {
          const angle = sampleWrapped(angleList, size, positionX, positionY)
          positionX += Math.cos(angle) * direction * stepSize
          positionY += Math.sin(angle) * direction * stepSize
          const weight = 0.5 + 0.5 * Math.cos((step / halfLength) * Math.PI)
          total += sampleWrapped(noiseList, size, positionX, positionY) * weight
          weightTotal += weight
        }
      }

      result[x + y * size] = total / weightTotal
    }
  }

  return result
}

/** 拉開對比：以平均與標準差為準，把多數的值攤到零到一之間 */
function stretchContrast(valueList: Float32Array, spread: number): Float32Array {
  let mean = 0
  for (const value of valueList) {
    mean += value
  }
  mean /= valueList.length

  let variance = 0
  for (const value of valueList) {
    variance += (value - mean) ** 2
  }
  const deviation = Math.sqrt(variance / valueList.length) || 1

  return valueList.map((value) => clamp01(0.5 + ((value - mean) / deviation) * spread))
}

/**
 * 卷雲貼圖
 *
 * 紅：纖維。綠：這一帶有沒有卷雲（成片、成帶，均勻分布，著色器拿覆蓋率去切）。
 *
 * ── 為什麼是一張 2D 貼圖 ──
 *
 * 卷雲在積雲上面幾百格，薄得幾乎沒有厚度，從地面看過去沒有任何體積感，
 * 行進它是白花錢。Guerrilla 在《Horizon Zero Dawn》也是這樣做的：
 * 低空的雲用體積行進，卷雲只查一張 2D 貼圖（Schneider 2017，Nubis）。
 *
 * ── 為什麼要沿著流場卷積 ──
 *
 * 卷雲的樣子是冰晶被高空的風扯成一絲一絲的長條，末端常帶著彎鉤。
 * 第一版直接拿 Worley 鋪，平鋪出來是整齊的點陣；
 * 第二版在著色器裡扭曲雜訊座標，扭出來像大理石紋與液體漩渦——兩者都不像卷雲。
 * 「順著氣流拉出來的細絲」這件事，紋理合成裡現成的做法就是沿著向量場做
 * 線積分卷積：絲的走向由流場決定，自然地跟著彎（Perlin 與 Neyret 的 flow noise
 * 也是同一個想法：讓雜訊沿著流動被帶著走）。
 *
 * 流場大致順著貼圖的 X 軸（著色器會把 X 軸轉到高空風的方向），
 * 再疊兩層低頻雜訊讓它緩緩彎曲；兩種粗細的雜訊各卷一次，
 * 粗的給一束一束的雲帶，細的給雲帶裡的髮絲
 */
export function createCirrusMap(size: number, seed: string): { size: number; data: Uint8Array } {
  const random = createSeededRandom(`${seed}-cirrus`)
  const bendCoarse = createPeriodicGradient3D(random, 3)
  const bendFine = createPeriodicGradient3D(random, 7)
  const maskOctaveList = [2, 4, 8].map((period) => createPeriodicGradient2D(random, period, period * 2))

  const angleList = new Float32Array(size * size)
  const fineNoiseList = new Float32Array(size * size)
  const coarseNoiseList = new Float32Array(size * size)
  const maskList = new Float32Array(size * size)
  const inverseSize = 1 / size
  /** 粗雜訊每八格才換一個亂數，卷出來的條紋比較寬、比較稀；格寬必須整除邊長，否則繞回的索引會變成小數 */
  const coarseCellSize = 8
  const coarseCount = size / coarseCellSize
  const coarseSeedList = Float32Array.from({ length: coarseCount * coarseCount }, () => random())

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * inverseSize
      const v = (y + 0.5) * inverseSize
      const index = x + y * size

      angleList[index] = bendCoarse(u * 3, v * 3, 0.5) * 1.1 + bendFine(u * 7, v * 7, 0.5) * 0.45
      fineNoiseList[index] = random()

      let mask = 0
      let amplitude = 1
      for (const octave of maskOctaveList) {
        mask += octave(u, v) * amplitude
        amplitude *= 0.5
      }
      maskList[index] = mask
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      coarseNoiseList[x + y * size] = sampleWrapped(
        coarseSeedList,
        coarseCount,
        x / coarseCellSize,
        y / coarseCellSize,
      )
    }
  }

  const fineFiberList = stretchContrast(convolveAlongFlow(fineNoiseList, angleList, size, 10, 1), 0.22)
  const coarseFiberList = stretchContrast(convolveAlongFlow(coarseNoiseList, angleList, size, 24, 2), 0.25)
  const equalizedMaskList = equalize(maskList)

  const data = new Uint8Array(size * size * 4)
  for (let index = 0; index < size * size; index++) {
    const coarse = coarseFiberList[index] ?? 0
    const fine = fineFiberList[index] ?? 0
    /** 粗的決定一束一束在哪，細的在束裡刻出髮絲；相乘而不是相加，束與束之間才是空的 */
    const fiber = clamp01(coarse * 1.3 - 0.3) ** 1.6 * (0.7 + fine * 0.5)
    data[index * 4] = toByte(fiber)
    data[index * 4 + 1] = toByte(equalizedMaskList[index] ?? 0)
    data[index * 4 + 2] = 0
    data[index * 4 + 3] = 255
  }

  return { size, data }
}

/** 三張一起做，worker 只要呼叫這一支 */
export function createCloudNoiseSet(option: CloudNoiseSizeOption, seed: string): CloudNoiseSet {
  return {
    base: createBaseNoise(option.baseSize, seed),
    detail: createDetailNoise(option.detailSize, seed),
    weather: createWeatherMap(option.weatherSize, seed),
    cirrus: createCirrusMap(option.cirrusSize, seed),
  }
}
