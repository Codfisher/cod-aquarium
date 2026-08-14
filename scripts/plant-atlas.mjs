/**
 * 從去背的植物圖集裁出單株植物
 *
 * ambientCG 除了無縫的表面材質，還有一類叫 Atlas 的東西：
 * 一整張圖上散佈著十幾片各自獨立、去過背的葉子或草葉，
 * 拍完之後連 opacity 一起附上。同樣是 CC0。
 *
 * 但那不是能直接貼上去的東西。這個世界的花草是兩片交叉的立板，
 * 要的是「一株從底部長上來的草」；圖集給的是「散落在畫布上的十片葉子」。
 * 中間差的就是這支模組：
 *
 * 1. 把圖集切成一片一片（連通區域標記）
 * 2. 挑幾片、縮放、旋轉，重新排成一株植物或一叢樹葉
 * 3. 把 alpha 壓成全有全無——渲染器走的是 alpha test，
 *    半透明的邊緣會在花草上方描出一圈輪廓線
 */

import { Buffer } from 'node:buffer'
import sharp from 'sharp'

/**
 * 種子亂數
 *
 * 不能用 Math.random：這些圖是簽進 repo 的，
 * 每跑一次腳本就換一批排列的話，改個尺寸都會讓整批檔案變成新的差異。
 * 同一個種子永遠排出同一株草
 */
export function createRandom(seed) {
  let state = seed >>> 0

  return function random() {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** 在區間裡取一個值 */
function pickBetween(random, [low, high]) {
  return low + random() * (high - low)
}

/**
 * 把圖集的彩色與遮罩合成一張 RGBA
 *
 * ambientCG 的 JPG 版把去背資訊放在另一個檔案（_Opacity.jpg），
 * 因為 JPG 本身沒有 alpha。合起來才是能裁的圖
 */
export async function loadAtlas(colorBuffer, opacityBuffer, size) {
  const color = await sharp(colorBuffer).resize(size, size).removeAlpha().raw().toBuffer()
  const opacity = await sharp(opacityBuffer).resize(size, size).greyscale().raw().toBuffer()

  const data = Buffer.alloc(size * size * 4)
  for (let index = 0; index < size * size; index++) {
    data[index * 4] = color[index * 3]
    data[index * 4 + 1] = color[index * 3 + 1]
    data[index * 4 + 2] = color[index * 3 + 2]
    data[index * 4 + 3] = opacity[index]
  }

  return { data, size }
}

/**
 * 把遮罩往外撐開幾個像素
 *
 * 標記連通區域之前要先做這一步。葉片與它的葉柄之間常常只剩一兩個像素寬，
 * 拍攝時稍微糊掉就斷開了——不撐開的話一片葉子會被切成「葉」與「柄」兩塊，
 * 柄那塊細得像根針，挑到就等於挑了一根毛
 */
function dilateMask(maskList, size, radius) {
  const rowPass = new Uint8Array(maskList.length)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0
      for (let offset = -radius; offset <= radius && !hit; offset++) {
        const nx = x + offset
        if (nx >= 0 && nx < size && maskList[y * size + nx])
          hit = 1
      }
      rowPass[y * size + x] = hit
    }
  }

  const result = new Uint8Array(maskList.length)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0
      for (let offset = -radius; offset <= radius && !hit; offset++) {
        const ny = y + offset
        if (ny >= 0 && ny < size && rowPass[ny * size + x])
          hit = 1
      }
      result[y * size + x] = hit
    }
  }

  return result
}

/**
 * 把遮罩往內縮幾個像素
 *
 * 葉緣那一兩圈像素的顏色是混過的：拍攝時的背景是一片白，
 * 半透明的邊緣於是把那片白吃了進來。門檻切下去只是把它們變成不透明，
 * 白還在——整片葉子於是鑲上一圈亮邊，貼到樹上就是每片葉子都在發光。
 *
 * 往內削掉那一圈，剩下的才全是葉子自己的顏色
 */
function erodeMask(maskList, size, radius) {
  if (radius <= 0)
    return maskList

  const inverted = new Uint8Array(maskList.length)
  for (let index = 0; index < maskList.length; index++) {
    inverted[index] = maskList[index] ? 0 : 1
  }

  const grown = dilateMask(inverted, size, radius)
  const result = new Uint8Array(maskList.length)
  for (let index = 0; index < maskList.length; index++) {
    result[index] = grown[index] ? 0 : 1
  }

  return result
}

/**
 * 把圖集切成一片一片
 *
 * 走的是連通區域標記：從一個還沒編號的實心像素出發，
 * 把八個方向連得上的全部收成同一片，直到收不到為止。
 * 不假設圖集排成幾行幾列——那些圖有的排成一列、有的散在畫布上，
 * 照著格線切遲早會切到一半
 */
export function segmentPartList(atlas, {
  alphaThreshold = 128,
  solidThreshold = 190,
  dilateRadius = 3,
  erodeRadius = 2,
  minimumAreaRatio = 0.0004,
} = {}) {
  const { data, size } = atlas
  const rawMask = new Uint8Array(size * size)
  const solidMask = new Uint8Array(size * size)
  for (let index = 0; index < size * size; index++) {
    rawMask[index] = data[index * 4 + 3] >= alphaThreshold ? 1 : 0
    solidMask[index] = data[index * 4 + 3] >= solidThreshold ? 1 : 0
  }

  const mask = dilateMask(rawMask, size, dilateRadius)
  const keepMask = erodeMask(solidMask, size, erodeRadius)
  const labelList = new Int32Array(size * size).fill(-1)
  const minimumArea = size * size * minimumAreaRatio
  const partList = []
  const stack = []

  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || labelList[seed] >= 0)
      continue

    const label = partList.length
    labelList[seed] = label
    stack.push(seed)

    let minX = size
    let minY = size
    let maxX = 0
    let maxY = 0
    let area = 0

    while (stack.length > 0) {
      const index = stack.pop()
      const x = index % size
      const y = (index - x) / size
      area++
      if (x < minX)
        minX = x
      if (x > maxX)
        maxX = x
      if (y < minY)
        minY = y
      if (y > maxY)
        maxY = y

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= size || ny < 0 || ny >= size)
            continue
          const next = ny * size + nx
          if (mask[next] && labelList[next] < 0) {
            labelList[next] = label
            stack.push(next)
          }
        }
      }
    }

    partList.push({ label, minX, minY, maxX, maxY, area })
  }

  return partList
    .filter((part) => part.area >= minimumArea)
    .map((part) => extractPart(atlas, part, labelList, keepMask))
    .sort((left, right) => right.width * right.height - left.width * left.height)
}

/**
 * 把一片從圖集上摳下來
 *
 * 只複製屬於這一片的像素。外接矩形裡常常擠進隔壁那片的一角，
 * 照矩形整塊切下來的話，一株草的旁邊會多出半片別人的葉子。
 *
 * alpha 在這裡就先壓成全有全無，而且門檻抓得比判定連通時更嚴。
 * 兩個理由：拍攝時葉緣本來就是半透明的漸層，那些像素的顏色混進了背景，
 * 留著會在成品的葉緣描出一圈灰邊；另外，這張圖等一下要縮到八分之一，
 * 縮小會自己生出乾淨的漸層，反倒是現在留著的雜訊縮完會變成葉面上的破洞
 */
function extractPart(atlas, part, labelList, keepMask) {
  const { data, size } = atlas
  const width = part.maxX - part.minX + 1
  const height = part.maxY - part.minY + 1
  const out = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (part.minY + y) * size + (part.minX + x)
      if (labelList[source] !== part.label || !keepMask[source])
        continue
      const target = (y * width + x) * 4
      out[target] = data[source * 4]
      out[target + 1] = data[source * 4 + 1]
      out[target + 2] = data[source * 4 + 2]
      out[target + 3] = 255
    }
  }

  return { width, height, data: out }
}

/**
 * 把一片縮放、旋轉之後交出來
 *
 * 除了尺寸，還回報根部與頂端各自落在哪裡。
 * 旋轉是繞著圖的正中心轉的，一根一百二十像素高的草葉轉個十八度，
 * 根部就往旁邊挪了二十像素——照著圖框的左右中線去對齊的話，
 * 一叢草會散成各自站在各自位置的幾根，看不出是從同一點長出來的
 */
async function shapePart(part, { width, height, angle, colorRatio }) {
  let pipeline = sharp(part.data, { raw: { width: part.width, height: part.height, channels: 4 } })
    .resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), { fit: 'fill' })

  if (colorRatio) {
    pipeline = pipeline.linear(colorRatio, [0, 0, 0])
  }
  if (angle) {
    pipeline = pipeline.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })

  return {
    input: data,
    raw: { width: info.width, height: info.height, channels: 4 },
    width: info.width,
    height: info.height,
    base: measureEdge(data, info.width, info.height, 'bottom'),
    tip: measureEdge(data, info.width, info.height, 'top'),
  }
}

/**
 * 找出最上或最下那一端在哪
 *
 * 取那一端起算幾列之內所有實心像素的橫向平均。
 * 只看最邊上那一列不行：草葉尖端常常只剩一個像素，
 * 而那一個像素是重新取樣之後隨機落在左或右的
 */
function measureEdge(data, width, height, side) {
  const step = side === 'bottom' ? -1 : 1
  const start = side === 'bottom' ? height - 1 : 0

  for (let scanned = 0; scanned < height; scanned++) {
    const y = start + step * scanned
    let sumX = 0
    let count = 0
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        sumX += x
        count++
      }
    }
    if (count > 0) {
      return { x: sumX / count, y }
    }
  }

  return { x: width / 2, y: side === 'bottom' ? height - 1 : 0 }
}

/**
 * 排成一株從底部長上來的植物
 *
 * 畫布開成三倍再從中間裁回來：草葉轉個角度就會探到框外，
 * 直接畫在正確尺寸的畫布上，sharp 會拒絕負的座標，
 * 於是每一株都被推回框內、擠成一束直挺挺的柱子
 */
export async function composeBillboard(partList, options) {
  const {
    size,
    count,
    random,
    heightRange = [0.6, 1],
    spreadRatio = 0.26,
    tiltDegree = 18,
    widthRatio = 1,
    maxWidthRatio = 0.55,
    anchor = 'bottom',
    colorRatio,
  } = options

  const origin = size
  const layerList = []
  /** 每一株的頂端在哪，花朵要疊在這些位置上 */
  const tipList = []

  for (let index = 0; index < count; index++) {
    const part = partList[Math.floor(random() * partList.length)]
    const targetHeight = size * pickBetween(random, heightRange)
    let scale = targetHeight / part.height

    /**
     * 太寬的就整片縮小，不能只照高度算
     *
     * 有幾組圖集裡的草葉是拱起來的，外接矩形寬得比高還多。
     * 照高度縮到滿版的話寬度會是成品的兩倍，
     * 一株草於是變成一片橫過整格的綠色斜坡
     */
    const widthLimit = size * maxWidthRatio
    if (part.width * scale * widthRatio > widthLimit) {
      scale = widthLimit / (part.width * widthRatio)
    }

    /**
     * 根平均分佈，再各自抖一點
     *
     * 純亂數會整叢擠到一邊去。分好位置再抖，才是「一叢」而不是「幾根剛好長在附近的草」
     */
    const spot = ((index + 0.5) / count) * 2 - 1
    const offsetRatio = Math.max(-1, Math.min(1, spot + (random() * 2 - 1) / count))
    /**
     * 往外撇
     *
     * 左邊的葉子往左倒、右邊的往右倒，中間的站直。
     * 一叢草的輪廓是這樣張開的，全部同一個方向就成了被風壓倒的一片
     */
    const angle = tiltDegree * (offsetRatio * 0.75 + (random() * 2 - 1) * 0.35)
    const shaped = await shapePart(part, {
      width: part.width * scale * widthRatio,
      height: targetHeight,
      angle,
      colorRatio,
    })

    /** 根紮在哪，就把圖挪到那一點對得上為止 */
    const rootX = origin + size / 2 + offsetRatio * size * spreadRatio
    const anchorPoint = anchor === 'top' ? shaped.tip : shaped.base
    const rootY = anchor === 'top' ? origin : origin + size - 1
    const left = Math.round(rootX - anchorPoint.x)
    const top = Math.round(rootY - anchorPoint.y)

    layerList.push({ input: shaped.input, raw: shaped.raw, left, top })
    const tipPoint = anchor === 'top' ? shaped.base : shaped.tip
    tipList.push({
      x: left + tipPoint.x,
      y: top + tipPoint.y,
      height: Math.abs(tipPoint.y - anchorPoint.y),
    })
  }

  return { origin, layerList, tipList }
}

/**
 * 散佈成一整片，而且左右上下接得起來
 *
 * 樹葉方塊是一整顆立方體，相鄰的兩顆會把同一張圖並排擺在一起——
 * 邊緣對不上就會看到一條接縫。所以每一片都在九宮格的位置各畫一次，
 * 再從正中央裁下來：探出右邊的那一角，正好從左邊長回來
 */
export async function composeScatter(partList, options) {
  const {
    size,
    count,
    random,
    scaleRange = [0.3, 0.5],
    colorRatio,
  } = options

  const origin = size
  const layerList = []

  for (let index = 0; index < count; index++) {
    const part = partList[Math.floor(random() * partList.length)]
    const targetHeight = size * pickBetween(random, scaleRange)
    const scale = targetHeight / part.height
    const shaped = await shapePart(part, {
      width: part.width * scale,
      height: targetHeight,
      angle: random() * 360,
      colorRatio,
    })

    const x = Math.round(random() * size - shaped.width / 2)
    const y = Math.round(random() * size - shaped.height / 2)

    for (let tileY = -1; tileY <= 1; tileY++) {
      for (let tileX = -1; tileX <= 1; tileX++) {
        layerList.push({
          input: shaped.input,
          raw: shaped.raw,
          left: origin + x + tileX * size,
          top: origin + y + tileY * size,
        })
      }
    }
  }

  return { origin, layerList }
}

/**
 * 把圖層疊出一整張大畫布，畫布大小由圖層自己決定
 *
 * 不能先開一張固定尺寸的畫布再往上擺。一片拱起來的長草葉轉過角度之後
 * 可以比成品寬上一倍，而 sharp 不接受落在畫布外的座標——
 * 換成別的圖集就整支腳本停在那裡。
 * 反過來讓畫布去遷就圖層，順手把整批往回推到座標全部為正，
 * 裁切的原點也跟著推一樣的距離。
 *
 * 另外，疊圖與裁切一定要分成兩趟：sharp 的管線是先裁切、最後才疊圖，
 * 寫在同一條上的話，畫布會先被裁成成品的大小，
 * 那些照著大畫布算出來的座標於是全部落在框外，成品一片空白
 */
async function paintLayerList(origin, size, layerList) {
  let minLeft = origin
  let minTop = origin
  let maxRight = origin + size
  let maxBottom = origin + size

  for (const layer of layerList) {
    minLeft = Math.min(minLeft, layer.left)
    minTop = Math.min(minTop, layer.top)
    maxRight = Math.max(maxRight, layer.left + layer.raw.width)
    maxBottom = Math.max(maxBottom, layer.top + layer.raw.height)
  }

  const shiftX = -minLeft
  const shiftY = -minTop
  const canvas = await sharp({
    create: {
      width: maxRight + shiftX,
      height: maxBottom + shiftY,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layerList.map((layer) => ({
      ...layer,
      left: layer.left + shiftX,
      top: layer.top + shiftY,
    })))
    .png()
    .toBuffer()

  return { canvas, left: origin + shiftX, top: origin + shiftY }
}

/**
 * 把疊好的圖層畫出來、裁回原尺寸，再把 alpha 壓成全有全無
 *
 * 中間那些半透明的像素一定要處理掉。渲染器對花草走的是 alpha test：
 * 超過門檻就整格畫、沒超過就整格不畫，中間沒有第三種可能。
 * 留著半透明的邊緣，在不同視角下會忽有忽無地閃
 */
export async function renderLayerList({ origin, layerList }, size) {
  const painted = await paintLayerList(origin, size, layerList)
  const composed = await sharp(painted.canvas)
    .extract({ left: painted.left, top: painted.top, width: size, height: size })
    .raw()
    .toBuffer()

  for (let index = 0; index < size * size; index++) {
    const alpha = composed[index * 4 + 3]
    if (alpha >= 128) {
      composed[index * 4 + 3] = 255
      continue
    }
    composed[index * 4] = 0
    composed[index * 4 + 1] = 0
    composed[index * 4 + 2] = 0
    composed[index * 4 + 3] = 0
  }

  despeckle(composed, size)

  return composed
}

/**
 * 掃掉孤零零的一個像素，補起孤零零的一個洞
 *
 * 草葉在圖集上是一整根，縮到八分之一再轉個角度之後，
 * 葉尖那幾個像素會被重新取樣成半透明；門檻一切，
 * 有的過關、有的沒過，於是葉子周圍飄著一撮浮空的綠點，
 * 葉面上則出現幾個看得穿的針孔。
 *
 * 判準只看鄰居：一個實心像素周圍全是空的，它就不該存在；
 * 一個空像素周圍全是實心的，那是取樣漏掉的。
 * 只動這兩種極端，草葉本身的輪廓一個像素都不會被磨掉
 */
function despeckle(buffer, size) {
  const original = Buffer.from(buffer)
  const countSolid = (x, y) => {
    let count = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0)
          continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= size || ny < 0 || ny >= size)
          continue
        if (original[(ny * size + nx) * 4 + 3] > 0)
          count++
      }
    }

    return count
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4
      const neighbourCount = countSolid(x, y)

      if (original[index + 3] > 0) {
        if (neighbourCount <= 1) {
          buffer[index] = 0
          buffer[index + 1] = 0
          buffer[index + 2] = 0
          buffer[index + 3] = 0
        }
        continue
      }

      if (neighbourCount < 7)
        continue

      /** 補起來的洞要用鄰居的顏色填，不然會是一個黑點 */
      let red = 0
      let green = 0
      let blue = 0
      let total = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= size || ny < 0 || ny >= size)
            continue
          const source = (ny * size + nx) * 4
          if (original[source + 3] === 0)
            continue
          red += original[source]
          green += original[source + 1]
          blue += original[source + 2]
          total++
        }
      }

      buffer[index] = Math.round(red / total)
      buffer[index + 1] = Math.round(green / total)
      buffer[index + 2] = Math.round(blue / total)
      buffer[index + 3] = 255
    }
  }
}

/** 量一張成品有幾成是實心的，用來檢查樹葉夠不夠密、花草會不會太擠 */
export function measureCoverage(buffer, size) {
  let solid = 0
  for (let index = 0; index < size * size; index++) {
    if (buffer[index * 4 + 3] > 0)
      solid++
  }

  return solid / (size * size)
}
