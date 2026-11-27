import { createSeededRandom } from '../../../utils/noise'

/**
 * 石殿遺址遠景的形體資料（純資料，不碰 Babylon）
 *
 * 每一處遠景是一串方盒（區域座標：x 往右、y 往上、z 往前、單位是「區域格」，
 * 渲染端再乘上這一處的縮放）。盒子越多，遠看的剪影越碎、越像風化過的石頭，
 * 所以斷口、衣褶、碎石堆、拱石、台階都用小方盒一塊一塊疊出來；
 * 整組控制在八千個三角形以內，渲染端合成一個網格、一次繪製
 */

/** 一個方盒（區域座標，含兩端的面） */
export interface ColossusBox {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  /** 青苔的程度，零到一 */
  moss: number;
  /** 額外的明暗倍率：眼窩、裂縫給暗一點 */
  shade: number;
}

type BoxTuple = readonly [number, number, number, number, number, number]

function box(tuple: BoxTuple, moss = 0, shade = 1): ColossusBox {
  return { from: [tuple[0], tuple[1], tuple[2]], to: [tuple[3], tuple[4], tuple[5]], moss, shade }
}

/** 在一塊區域裡撒碎石：塌下來的石塊一堆一堆躺在腳下，用來把巨物接回地面 */
function scatterRubble(
  boxList: ColossusBox[],
  random: () => number,
  area: readonly [number, number, number, number],
  count: number,
  maxSize: number,
  moss = 0.45,
): void {
  for (let index = 0; index < count; index++) {
    const sizeX = 1 + random() * maxSize
    const sizeZ = 1 + random() * maxSize
    const height = 0.8 + random() * maxSize * 0.7
    const centerX = area[0] + random() * (area[2] - area[0])
    const centerZ = area[1] + random() * (area[3] - area[1])
    boxList.push(box(
      [centerX - sizeX / 2, -4, centerZ - sizeZ / 2, centerX + sizeX / 2, -4 + 4 + height, centerZ + sizeZ / 2],
      moss * (0.6 + random() * 0.8),
      0.85 + random() * 0.25,
    ))
  }
}

/** 一排垂直的衣褶（或柱槽）：一條一條凸出來，高低與深淺交錯 */
function addFoldList(
  boxList: ColossusBox[],
  random: () => number,
  range: readonly [number, number, number, number],
  frontZ: number,
  count: number,
  depth = 1.2,
): void {
  const [xFrom, xTo, yFrom, yTo] = range
  const width = (xTo - xFrom) / count
  for (let index = 0; index < count; index++) {
    const fromX = xFrom + index * width
    const isEven = index % 2 === 0
    boxList.push(box(
      [
        fromX + 0.12,
        yFrom + random() * 3,
        frontZ,
        fromX + width - 0.12,
        yTo - random() * 2.2,
        frontZ + depth * (isEven ? 0.55 : 0.95) + random() * 0.3,
      ],
      0.05,
      isEven ? 1 : 0.84,
    ))
  }
}

/**
 * 無頭的坐像
 *
 * 坐在寶座上，雙手原本擱在膝上：右手還在，左臂從肘部斷掉、半截躺在台座前；
 * 頭整個沒了，只剩一截斷頸。台座一角崩落，正面刻著一排浮雕與一道小門，
 * 西側一道石階爬上台座：那道門與石階是看出它有多大的尺
 */
function createSeatedColossus(): ColossusBox[] {
  const random = createSeededRandom('ruins-seated')
  const boxList: ColossusBox[] = [
    /** 台座第一層：東南角崩掉，剩下一階一階的殘塊 */
    box([-15, -4, -13, 9, 6, 15], 0.4),
    box([9, -4, -13, 15, 6, 5], 0.45),
    box([9, -4, 5, 15, 3, 15], 0.5),
    box([11, 3, 8, 15, 4.5, 11], 0.5, 0.9),
    /** 台座簷線與第二層 */
    box([-14.4, 5, -13.4, 8.6, 6.4, 15.4], 0.2),
    box([-13, 6, -11, 13, 9, 13], 0.25),
    box([-13.5, 8.2, -11.5, 13.5, 9.4, 13.5], 0.15),
    box([16, -4, 8, 21, 3, 14], 0.5),
    /** 寶座：座面、扶手與兩截高低不一的椅背，椅背頂缺口參差 */
    box([-12, 9, -11, 12, 19, 3], 0.15),
    box([-14, 19, -4, -12, 25, 8], 0.2),
    box([12, 19, -4, 14, 22, 8], 0.2),
    box([-12, 19, -11, -1, 42, -6], 0.1),
    box([-12, 42, -11, -8, 46, -6], 0.1, 0.92),
    box([-6, 42, -11, -3, 44.5, -6], 0.1, 0.9),
    box([-1, 19, -11, 12, 34, -6], 0.1),
    box([4, 34, -11, 9, 37, -6], 0.1, 0.92),
    box([10.5, 34, -11, 12, 35.5, -6], 0.05, 0.9),
    /** 椅背後的飛扶壁 */
    box([-11, 9, -15, -7, 30, -11], 0.25),
    box([6, 9, -15, 10, 22, -11], 0.3),
    /** 腿 */
    box([-9, 19, -4, -1, 25, 12], 0.1),
    box([1, 19, -4, 9, 25, 12], 0.1),
    box([-8.5, 25, 7, -1.5, 27, 12], 0.15),
    box([1.5, 25, 7, 8.5, 26.4, 12], 0.15, 0.92),
    box([-9, 9, 7, -2, 19, 13], 0.3),
    box([2, 9, 7, 9, 19, 13], 0.3),
    box([-9, 9, 13, -2, 12, 17], 0.45),
    box([2, 9, 13, 9, 12, 17], 0.45),
    /** 腳趾：左腳完整三趾，右腳斷了一趾 */
    box([-8.6, 9, 17, -6.8, 11.4, 19.2], 0.4),
    box([-6.2, 9, 17, -4.4, 11.8, 19.6], 0.4),
    box([-3.8, 9, 17, -2.2, 11.2, 18.8], 0.4),
    box([2.4, 9, 17, 4.2, 11.6, 19.4], 0.45),
    box([4.8, 9, 17, 6.4, 10.2, 18.2], 0.45, 0.9),
    /** 身軀與肩、腰帶、胸甲 */
    box([-9, 24, -7, 9, 34, 3]),
    box([-9.6, 29, -7.6, 9.6, 31, 3.9], 0, 0.9),
    box([-8, 34, -6, 8, 45, 4]),
    box([-7, 35, 4, 7, 42, 5.2], 0, 1.05),
    box([-12, 41, -6, 12, 47, 3]),
    /** 右肩的肩甲一階一階疊上去 */
    box([-15, 44, -7, -8, 47, 4]),
    box([-14, 47, -6, -9, 49, 3], 0, 0.9),
    /** 右臂：擱在大腿上，手指一根一根 */
    box([-15, 30, -5, -10, 46, 1]),
    box([-14, 25, -3, -8, 30, 10]),
    box([-13, 25, 9, -7, 28, 13], 0.1),
    box([-12.6, 25, 13, -11.6, 27.4, 15.4], 0.1),
    box([-11.2, 25, 13, -10.2, 27.8, 15.8], 0.1),
    box([-9.8, 25, 13, -8.8, 27.4, 15.2], 0.1),
    box([-8.4, 25, 13, -7.4, 26.6, 14.4], 0.1, 0.9),
    /** 左臂從肘部斷掉，斷口參差 */
    box([10, 33, -5, 15, 46, 1]),
    box([9.5, 43, -6, 14.5, 46.5, 2], 0.05),
    box([11, 30, -4, 14, 33, 0], 0, 0.85),
    box([12, 28, -3, 13.6, 30, -1], 0, 0.8),
    box([10.2, 32, 1, 11.4, 34, 2.4], 0, 0.85),
    /** 斷頸：一圈石環，斷口高低不一 */
    box([-3, 47, -4, 3, 50, 2]),
    box([-2, 50, -3, 1, 51, 0], 0, 0.85),
    box([1, 50, -1, 2, 52, 1], 0, 0.85),
    box([-3, 50, 0, -2, 51.4, 2], 0, 0.8),
    /** 斷下來的前臂，躺在台座前，手掌朝天 */
    box([14, -4, 17, 27, 2, 22], 0.55),
    box([24, -4, 15, 29, 3, 21], 0.5),
    box([29, -4, 15.5, 31, 1.5, 17], 0.5),
    box([29, -4, 17.5, 31.4, 2, 19], 0.5),
    box([29, -4, 19.5, 31, 1, 21], 0.5),
    /** 台座正面一道小門：框、楣、門內的黑 */
    box([-2.4, 0, 15, 2.4, 4.6, 15.5], 0, 0.18),
    box([-3.4, 0, 15, -2.4, 5, 16], 0.1),
    box([2.4, 0, 15, 3.4, 5, 16], 0.1),
    box([-3.8, 5, 15, 3.8, 6, 16.4], 0.1),
    /** 門前三級小階，與門一樣是看出有多大的尺 */
    box([-2.6, -4, 16, 2.6, 0.5, 17.2], 0.3),
    box([-2.2, -4, 17.2, 2.2, 0.1, 18.2], 0.35),
  ]
  /** 台座正面的浮雕：一格一格的深色壁龕，門兩旁各三格 */
  for (let index = -4; index <= 4; index++) {
    const centerX = index * 3.4
    if (Math.abs(centerX) < 4.5 || centerX > 8)
      continue
    boxList.push(box([centerX - 1.3, 0.4, 15, centerX + 1.3, 4.8, 15.4], 0.05, 0.5))
  }
  /** 西側的石階：一階一階爬上台座，每階一塊 */
  for (let step = 0; step < 8; step++) {
    boxList.push(box([-15 - (8 - step) * 1.4, -4, -2.5, -15, (step + 1) * 0.75, 2.5], 0.3 - step * 0.02))
  }
  /** 兩段裙襬的衣褶：小腿前、腹前 */
  addFoldList(boxList, random, [-9, -2, 12, 19], 13, 4)
  addFoldList(boxList, random, [2, 9, 12, 19], 13, 4)
  addFoldList(boxList, random, [-8, 8, 24, 29], 3, 7, 1.4)
  /** 腳下與台座旁的碎石堆 */
  scatterRubble(boxList, random, [-26, 17, 12, 34], 14, 4)
  scatterRubble(boxList, random, [16, -16, 30, 6], 8, 3.5)
  scatterRubble(boxList, random, [-34, -16, -17, 14], 8, 3.2)
  return boxList
}

/**
 * 持劍的守門巨像
 *
 * 雙手交握在胸前、劍尖拄地。isBroken 的那一尊頭沒了、右臂只剩肩頭一截，頭盔倒在腳邊
 */
function createGuardian(isBroken: boolean): ColossusBox[] {
  const random = createSeededRandom(isBroken ? 'ruins-guardian-broken' : 'ruins-guardian')
  const boxList: ColossusBox[] = [
    box([-8, -4, -7, 8, 5, 7], 0.45),
    box([-8.6, 3.6, -7.6, 8.6, 5, 7.6], 0.3),
    box([-6, 5, -3, -1, 24, 3], 0.25),
    box([1, 5, -3, 6, 24, 3], 0.25),
    /** 腰裙與腰帶 */
    box([-7, 14, -4, 7, 28, 4], 0.1),
    box([-7.5, 23, -4.5, 7.5, 25, 4.5], 0, 0.9),
    box([-7, 28, -4, 7, 44, 4]),
    box([-6, 31, 4, 6, 40, 5.2], 0, 1.05),
    /** 肩甲兩階 */
    box([-10, 40, -5, 10, 46, 4]),
    box([-12, 42, -5.5, -7, 47, 4.5], 0, 0.95),
    box([-11, 24, -3, -8, 44, 2]),
    /** 劍：交握的雙手、護手、劍柄 */
    box([-3, 27, 4, 3, 31, 7]),
    box([-4, 31, 4, 4, 33, 7]),
    box([-1, 33, 5, 1, 37, 6]),
    box([-1.6, 36.6, 4.6, 1.6, 38, 6.4], 0, 0.9),
    /** 台座正面的小壁龕 */
    box([-5, 0.4, 7, -2, 3.6, 7.3], 0, 0.5),
    box([2, 0.4, 7, 5, 3.6, 7.3], 0, 0.5),
  ]
  /** 劍身：一截一截拄在台座上，寬窄與缺口不一，缺的那幾處是被砍崩的 */
  for (let segment = 0; segment < 7; segment++) {
    const fromY = 5 + segment * 3.14
    const halfWidth = 1.05 + (random() - 0.5) * 0.5
    boxList.push(box([-halfWidth, fromY, 5, halfWidth, fromY + 3.14, 6.2], 0.18 - segment * 0.02, 0.9 + random() * 0.15))
  }
  boxList.push(
    box([0.9, 11, 5.2, 1.6, 12.4, 6.4], 0, 0.8),
    box([-1.6, 18, 5.2, -0.9, 19.2, 6.4], 0, 0.8),
  )
  addFoldList(boxList, random, [-7, 7, 5, 22], 3, 7, 1.5)
  if (isBroken) {
    boxList.push(
      /** 右臂只剩肩頭，斷口參差 */
      box([8, 38, -3, 11, 44, 2], 0, 0.9),
      box([8.4, 34, -2, 10.2, 38, 0], 0, 0.82),
      /** 斷頸 */
      box([-3, 46, -3, 3, 48, 3], 0, 0.9),
      box([-1.6, 48, -2, 1.4, 49.6, 1.4], 0, 0.82),
      /** 倒在腳邊的頭盔，面甲朝上 */
      box([10, -4, 9, 20, 5, 19], 0.5),
      box([11, 5, 10, 19, 6, 18], 0.4),
      box([12, 3, 18.6, 18, 4.4, 19.4], 0, 0.3),
      box([15, 5, 11, 16, 8.2, 17], 0.3),
    )
    scatterRubble(boxList, random, [-14, 8, 22, 22], 7, 3.4)
    return boxList
  }
  boxList.push(
    box([8, 24, -3, 11, 44, 2]),
    /** 頭：面甲、眼縫、鼻樑、兩側護頰、盔頂的冠與冠上缺的幾顆 */
    box([-4, 46, -4, 4, 55, 4]),
    box([-3.2, 50, 4, 3.2, 51.2, 4.3], 0, 0.28),
    box([-0.6, 47, 4, 0.6, 50, 5.2], 0, 1.05),
    box([-5, 46, -3, -4, 52, 3], 0.1, 0.9),
    box([4, 46, -3, 5, 52, 3], 0.1, 0.9),
    box([-1, 49, 4, 1, 52, 5]),
    box([-1, 55, -4, 1, 59, 3]),
    box([-4.4, 55, -3, -2.8, 57, 3], 0, 0.95),
    box([2.8, 55, -3, 4.4, 56.2, 3], 0, 0.9),
  )
  scatterRubble(boxList, random, [-14, 8, 14, 20], 5, 3)
  return boxList
}

/** 一個沿 X、Z 平移過的方盒清單（把幾件東西拼成一處遺跡） */
function shiftBoxList(boxList: ColossusBox[], offsetX: number, offsetZ = 0): ColossusBox[] {
  return boxList.map((item) => ({
    ...item,
    from: [item.from[0] + offsetX, item.from[1], item.from[2] + offsetZ],
    to: [item.to[0] + offsetX, item.to[1], item.to[2] + offsetZ],
  }))
}

/**
 * 守門巨像夾著的一座塌門
 *
 * 兩座方塔撐一道拱：左半的拱石還一塊一塊卡在原位，右塔塌了一截，右半的拱石掉了大半，
 * 躺在門洞裡。塔身有腰線與狹窗
 */
function createGuardianGate(): ColossusBox[] {
  const random = createSeededRandom('ruins-gate')
  const boxList: ColossusBox[] = [
    /** 左塔完整，右塔塌到一半 */
    box([-16, -4, -4, -9, 38, 4], 0.2),
    box([9, -4, -4, 16, 27, 4], 0.25),
    box([-16.8, -4, -4.8, -8.2, 3, 4.8], 0.35),
    box([8.2, -4, -4.8, 16.8, 2, 4.8], 0.4),
    /** 腰線與狹窗 */
    box([-16.6, 12, -4.6, -8.4, 13.4, 4.6], 0.1),
    box([-16.6, 24, -4.6, -8.4, 25.4, 4.6], 0.1),
    box([-16.6, 35.4, -4.6, -8.4, 38, 4.6], 0.05),
    box([-13.6, 16, 4, -11.4, 21, 4.3], 0, 0.22),
    box([-13.6, 28, 4, -11.4, 33, 4.3], 0, 0.22),
    box([11.4, 12, 4, 13.6, 17, 4.3], 0, 0.22),
    box([8.6, 24, -4.6, 16.6, 25.6, 4.6], 0.1),
    /** 右塔的斷頂：參差的石塊 */
    box([9, 27, -4, 12, 30.5, 0], 0.05, 0.9),
    box([12.5, 27, -2, 16, 29, 4], 0.05, 0.88),
    box([9.5, 27, 1, 11.5, 29.4, 4], 0.05, 0.85),
    /** 門內掉下來的幾塊 */
    box([4, -4, -6, 14, 1, 2], 0.5),
    box([-2, -4, 2, 6, 3, 8], 0.45),
    box([-6, -4, -3, -1, 1.6, 2], 0.4),
  ]
  /** 拱石：圓心在 (0, 27)、半徑九格的半圈，左半一路到拱頂，右半只剩接近塔頂的兩塊 */
  const ARCH_CENTER_Y = 27
  const ARCH_RADIUS = 9.4
  const VOUSSOIR_COUNT = 9
  for (let index = 0; index < VOUSSOIR_COUNT; index++) {
    const angle = Math.PI - (index / (VOUSSOIR_COUNT - 1)) * Math.PI
    const isFallen = index > 5 || index === 4
    if (isFallen) {
      /** 掉下來的拱石：散在門洞底下 */
      const fallenX = -3 + random() * 14
      boxList.push(box([fallenX, -4, -3.5 + random() * 3, fallenX + 3.4, 1.2 + random() * 2.2, 0.5 + random() * 3], 0.45, 0.9))
      continue
    }
    const centerX = Math.cos(angle) * ARCH_RADIUS
    const centerY = ARCH_CENTER_Y + Math.sin(angle) * ARCH_RADIUS
    boxList.push(box([centerX - 1.9, centerY - 1.7, -4.4, centerX + 1.9, centerY + 1.7, 4.4], 0.1, 0.9 + (index % 2) * 0.12))
  }
  /** 拱頂上方左塔那一側殘留的楣與簷 */
  boxList.push(
    box([-16, 38, -5, -3, 41, 5], 0.1),
    box([-17, 40.4, -5.6, -5, 42, 5.6], 0.05, 0.92),
    box([-9, 42, -4, -5, 44.4, 4], 0, 0.88),
  )
  boxList.push(
    ...shiftBoxList(createGuardian(false), -29),
    ...shiftBoxList(createGuardian(true), 29),
  )
  scatterRubble(boxList, random, [-18, 8, 18, 20], 10, 3.6)
  return boxList
}

/**
 * 半埋在土裡的巨大頭顱
 *
 * 下巴以下埋進岩地：眉骨、斷了鼻尖的鼻、顴骨、唇、耳，額上一道裂縫；
 * 頭冠斷了半邊，掉下來的那一截冠帶與冠刺躺在旁邊
 */
function createFallenHead(): ColossusBox[] {
  const random = createSeededRandom('ruins-head')
  const boxList: ColossusBox[] = [
    box([-11, -8, -10, 11, 14, 10], 0.3),
    box([-11.6, -8, -9, -11, 12, 8], 0.3),
    /** 眉骨、眼窩、顴骨、鼻（鼻尖斷了）、唇、口 */
    box([-10, 8, 10, 10, 10, 12.2], 0.15),
    box([-8, 5, 10, -3, 8, 10.4], 0, 0.3),
    box([3, 5, 10, 8, 8, 10.4], 0, 0.3),
    box([-2, 1, 10, 2, 7, 14], 0.1),
    box([-1.4, 7, 10, 1.4, 8.2, 12.4], 0.05, 0.9),
    box([-9.4, -2, 10, -5, 3.4, 11.6], 0.2),
    box([5, -2, 10, 9.4, 3.4, 11.6], 0.2),
    box([-4.4, -2, 10.4, 4.4, 0, 11.8], 0.1),
    box([-4, -2.6, 10, 4, -2, 10.6], 0, 0.4),
    /** 耳 */
    box([-12.4, 1, -3, -11, 9, 2.4], 0.2),
    box([11, 1, -3, 12.4, 9, 2.4], 0.2),
    /** 額上的裂縫：一小段一小段錯開 */
    box([-0.6, 10.2, 10, 0.2, 12, 10.3], 0, 0.25),
    box([0, 12, 10, 0.8, 13.6, 10.3], 0, 0.25),
    box([0.8, 13.4, 10, 1.4, 14, 10.3], 0, 0.25),
    /** 頭冠：一圈石帶，右半邊斷了，剩下一段段的冠刺 */
    box([-11.6, 14, -10.6, 4, 17, 10.6], 0.2),
    box([-9, 17, -6, -1, 20, 6], 0.2),
    box([4, 14, -10.6, 8.6, 15.6, 6], 0.25, 0.9),
    box([-10.4, 17, 7, -8.4, 22.4, 9], 0.15),
    box([-6.4, 17, 7.4, -4.4, 24, 9.4], 0.15),
    box([-2.4, 17, 7.4, -0.4, 21, 9.4], 0.12, 0.9),
    /** 掉在一旁的冠帶斷片，三根冠刺朝上 */
    box([-30, -4, 4, -17, 1.6, 12], 0.5),
    box([-28.6, 1.6, 5, -26.6, 6.4, 7], 0.4),
    box([-24.6, 1.6, 6, -22.6, 5.2, 8], 0.4),
    box([-20.6, 1.6, 7, -18.8, 3.6, 9], 0.4, 0.9),
  ]
  /** 髮卷：頭頂一排一排的石卷，左半完整、右半被壓碎 */
  for (let index = -4; index <= 3; index++) {
    const topY = index >= 1 ? 13 + random() * 1.6 : 14 + random() * 0.4
    boxList.push(box([index * 2.6 - 1.2, 11, -10.2, index * 2.6 + 1.2, topY, -6], 0.2, 0.92))
  }
  scatterRubble(boxList, random, [-14, 12, 16, 26], 12, 3.6)
  scatterRubble(boxList, random, [-26, -14, 20, -6], 8, 4, 0.55)
  return boxList
}

/** 一節柱鼓：外加兩圈凸出的接縫與正面的柱槽 */
function addColumnDrum(
  boxList: ColossusBox[],
  random: () => number,
  range: readonly [number, number, number, number],
  moss: number,
): void {
  const [xFrom, xTo, yFrom, yTo] = range
  boxList.push(
    box([xFrom, yFrom, -3, xTo, yTo, 3], moss),
    box([xFrom - 0.5, yFrom, -3.5, xTo + 0.5, yFrom + 1.1, 3.5], moss, 0.92),
  )
  addFoldList(boxList, random, [xFrom + 0.3, xTo - 0.3, yFrom + 1.1, yTo - 0.2], 3, 4, 0.4)
}

/** 倒下的巨柱：兩根還站著（一根斷在半截、一根頂著殘樑），幾截躺在地上 */
function createToppledColumns(): ColossusBox[] {
  const random = createSeededRandom('ruins-columns')
  const boxList: ColossusBox[] = [
    /** 斷在半截的柱：柱礎、鼓節、參差的斷口 */
    box([-4.6, -4, -4.6, 4.6, 2, 4.6], 0.5),
    box([-5.2, -4, -5.2, 5.2, 0.4, 5.2], 0.55),
    box([-2, 27, -2, 3, 31, 2], 0, 0.85),
    box([-3, 31, -1, -0.4, 32.4, 1.6], 0, 0.8),
    /** 還撐著殘樑的那一根 */
    box([16, -4, -4.6, 24, 2, 4.6], 0.5),
    box([15.4, -4, -5.2, 24.6, 0.4, 5.2], 0.55),
    /** 柱頭與殘樑 */
    box([14.4, 46, -5.6, 25.6, 48.4, 5.6], 0.12),
    box([15, 48.4, -5, 25, 50, 5], 0.1),
    box([14, 50, -4, 34, 54, 4], 0.05),
    box([26, 54, -3, 33, 56.4, 3], 0, 0.9),
    box([34, 49, -3.4, 38, 52, 3.4], 0.05, 0.86),
    /** 躺著的那幾截：鼓節一節一節錯開，其中一節斷成兩半 */
    box([-8, -4, 12, 3, 3, 19], 0.5),
    box([5, -4, 10, 11, 5, 20], 0.45),
    box([12, -4, 12, 16, 2, 18], 0.5, 0.9),
    box([30, -4, -20, 37, 2, -6], 0.55),
    box([31, -4, -5, 38, 2, 7], 0.5),
    box([-36, -4, -10, -30, 1, 0], 0.5),
  ]
  for (const [fromY, toY] of [[2, 8.4], [8.4, 14.6], [14.6, 21], [21, 27]] as const)
    addColumnDrum(boxList, random, [-3, 3, fromY, toY], 0.2)
  for (const [fromY, toY] of [[2, 11], [11, 20], [20, 29], [29, 38], [38, 46]] as const)
    addColumnDrum(boxList, random, [17, 23, fromY, toY], 0.15)
  /** 躺著的鼓節：沿 X 排開，各自帶接縫與柱槽 */
  for (const [fromX, toX, fromZ, toZ] of [[-34, -22, 10, 17], [-21, -10, 11, 18]] as const) {
    boxList.push(
      box([fromX, -4, fromZ, toX, 3, toZ], 0.55),
      box([fromX, -4, fromZ - 0.5, fromX + 1.1, 3.6, toZ + 0.5], 0.55, 0.9),
      box([toX - 1.1, -4, fromZ - 0.5, toX, 3.6, toZ + 0.5], 0.55, 0.9),
    )
    addFoldList(boxList, random, [fromX + 1, toX - 1, 0, 3], toZ, 4, 0.4)
  }
  scatterRubble(boxList, random, [-12, -6, 14, 8], 9, 3.8)
  scatterRubble(boxList, random, [18, 8, 40, 24], 10, 3.4)
  scatterRubble(boxList, random, [-40, -16, -24, 4], 6, 3.4)
  return boxList
}

/**
 * 斷了的水道橋
 *
 * 沿 X 一排橋墩（有腳座與腰線），墩與墩之間是一階一階挑出去、頂上卡一塊拱心石的疊澀拱，
 * 墩頂一條兩側有矮牆的渠，矮牆缺了幾段；中間三跨塌了，兩座斷墩的頂缺口參差，
 * 兩邊殘留的渠面向缺口伸出去一截，斷口底下是塌下來的堆
 */
function createAqueduct(): ColossusBox[] {
  const random = createSeededRandom('ruins-aqueduct')
  const boxList: ColossusBox[] = []
  const PIER_SPACING = 14
  const PIER_COUNT = 11
  const DECK_Y = 30
  const brokenPierSet = new Set([5, 6])
  const brokenSpanSet = new Set([4, 5, 6])
  const startX = -((PIER_COUNT - 1) * PIER_SPACING) / 2

  for (let index = 0; index < PIER_COUNT; index++) {
    const pierX = startX + index * PIER_SPACING
    const isBrokenPier = brokenPierSet.has(index)
    const pierTop = isBrokenPier ? 10 + index * 2 : DECK_Y
    boxList.push(
      box([pierX - 2, -4, -2, pierX + 2, pierTop, 2], 0.35),
      box([pierX - 2.9, -4, -2.9, pierX + 2.9, 3, 2.9], 0.5),
      box([pierX - 2.4, 14, -2.4, pierX + 2.4, 15.2, 2.4], 0.2, 0.92),
    )
    if (isBrokenPier) {
      /** 斷口的參差 */
      boxList.push(
        box([pierX - 2, pierTop, -2, pierX, pierTop + 2.6 + random() * 2.4, 0], 0.2, 0.86),
        box([pierX, pierTop, 0, pierX + 2, pierTop + 1 + random() * 1.6, 2], 0.2, 0.84),
      )
    }
    if (index === PIER_COUNT - 1 || brokenSpanSet.has(index)) {
      /** 缺口兩側的渠面伸出去一截：第四座向右、第七座向左 */
      if (index === 4)
        boxList.push(box([pierX - 2, DECK_Y, -3, pierX + 6, DECK_Y + 1.6, 3], 0.1, 0.92), box([pierX - 2, DECK_Y + 1.6, -3, pierX + 4, DECK_Y + 6, -2], 0.1))
      continue
    }
    if (index === 7) {
      boxList.push(box([pierX - 6, DECK_Y, -3, pierX + 2, DECK_Y + 1.6, 3], 0.1, 0.92))
    }
    /** 渠：渠底一整條，兩側矮牆缺幾段 */
    boxList.push(box([pierX - 2, DECK_Y, -3, pierX + PIER_SPACING + 2, DECK_Y + 1.6, 3], 0.1))
    for (let segment = 0; segment < 2; segment++) {
      const wallFrom = pierX - 2 + segment * (PIER_SPACING + 4) / 2
      const wallTo = wallFrom + (PIER_SPACING + 4) / 2
      for (const wallZ of [-3, 2] as const) {
        if (random() < 0.28)
          continue
        boxList.push(box([wallFrom, DECK_Y + 1.6, wallZ, wallTo, DECK_Y + 5.4 + random() * 1.2, wallZ + 1], 0.12, 0.88 + random() * 0.12))
      }
    }
    /** 疊澀拱：兩側各四階向中間挑出，頂上卡拱心石 */
    for (let step = 0; step < 4; step++) {
      const reach = 1.2 * (step + 1)
      boxList.push(
        box([pierX + 2, DECK_Y - 3 * (step + 1), -2, pierX + 2 + reach, DECK_Y - 3 * step, 2], 0.15),
        box([pierX + PIER_SPACING - 2 - reach, DECK_Y - 3 * (step + 1), -2, pierX + PIER_SPACING - 2, DECK_Y - 3 * step, 2], 0.15),
      )
    }
    boxList.push(box([pierX + PIER_SPACING / 2 - 1.2, DECK_Y - 2.4, -2.4, pierX + PIER_SPACING / 2 + 1.2, DECK_Y, 2.4], 0.1, 1.08))
  }
  /** 塌下來的渠與拱，一堆一堆躺在斷口底下 */
  boxList.push(
    box([-6, -4, -6, 8, 3, 5], 0.55),
    box([10, -4, -4, 20, 5, 6], 0.5),
    box([-14, -4, -3, -8, 2, 4], 0.5),
  )
  scatterRubble(boxList, random, [-26, -8, 34, 10], 14, 3.6, 0.5)
  return boxList
}

/**
 * 山稜上的階梯神殿
 *
 * 五層一層比一層小的石台（每層有出簷與壁龕），正面一道一階一階的石階直上頂上的小殿，
 * 小殿四根柱、屋頂斷了半邊；右前那一角塌了，塌的地方是高低不一的碎塊，碎石沿著坡堆下來
 */
function createZiggurat(): ColossusBox[] {
  const random = createSeededRandom('ruins-ziggurat')
  const boxList: ColossusBox[] = []
  const halfList = [44, 36, 28, 20, 12]
  const TIER_HEIGHT = 12
  for (const [tier, half] of halfList.entries()) {
    const fromY = tier === 0 ? -4 : tier * TIER_HEIGHT
    const toY = (tier + 1) * TIER_HEIGHT
    const moss = tier < 2 ? 0.35 : 0.1
    /** 出簷：每層頂上凸出一圈薄石帶 */
    boxList.push(box([-half - 1.2, toY - 1.4, -half - 1.2, half + 1.2, toY, half + 1.2], moss, 0.92))
    if (tier < 2) {
      boxList.push(box([-half, fromY, -half, half, toY - 1.4, half], moss))
    }
    else {
      /** 右前那一塊（+X、+Z）塌了：剩下的三塊完整，塌的那一塊是高低不一的碎塊 */
      boxList.push(
        box([-half, fromY, -half, half, toY - 1.4, 0], moss),
        box([-half, fromY, 0, 0, toY - 1.4, half], moss),
      )
      const cellCount = 4
      const cellSize = half / cellCount
      for (let cellX = 0; cellX < cellCount; cellX++) {
        for (let cellZ = 0; cellZ < cellCount; cellZ++) {
          const rubbleHeight = fromY + (toY - 1.4 - fromY) * (0.15 + random() * 0.7)
          boxList.push(box([cellX * cellSize, fromY, cellZ * cellSize, (cellX + 1) * cellSize, rubbleHeight, (cellZ + 1) * cellSize], moss + 0.1, 0.85 + random() * 0.2))
        }
      }
    }
    /** 正面與兩側的壁龕：一排深色凹口 */
    for (let niche = -2; niche <= 2; niche++) {
      const nicheX = niche * (half / 3)
      if (tier < 2 || nicheX < 0) {
        boxList.push(box([nicheX - 1.6, fromY + 3, half, nicheX + 1.6, fromY + 8, half + 0.3], 0, 0.3))
      }
    }
  }
  /** 正面的石階：沿著五層的正面往上，一階 2 深 3 高，頂部到小殿的台 */
  for (let step = 0; step < 20; step++) {
    boxList.push(box([-5, -4, 52 - (step + 1) * 2, 5, (step + 1) * 3, 52 - step * 2], 0.3 - step * 0.012))
  }
  /** 階梯兩側的矮欄 */
  boxList.push(box([-6.4, -4, 14, -5, 30, 52], 0.25, 0.92), box([5, -4, 22, 6.4, 24, 52], 0.25, 0.9))
  boxList.push(
    /** 頂上的小殿：台、四根柱、半邊屋頂 */
    box([-9, 60, -9, 9, 62, 9], 0.05),
    box([-7, 62, -7, -5, 69, -5], 0, 0.95),
    box([5, 62, -7, 7, 69, -5], 0, 0.95),
    box([-7, 62, 5, -5, 66.6, 7], 0, 0.9),
    box([5, 62, 5, 7, 69, 7], 0, 0.95),
    box([-8, 69, -8, 1, 72, 8]),
    box([-7, 72, -6, -1, 74, 6], 0, 0.95),
    box([2, 69, -8, 8, 70.6, -3], 0, 0.9),
    /** 塌下來的碎石坡 */
    box([4, -4, 4, 40, 10, 40], 0.4),
    box([4, 10, 4, 26, 20, 26], 0.3),
  )
  scatterRubble(boxList, random, [-52, 40, 52, 70], 16, 4.4, 0.4)
  scatterRubble(boxList, random, [30, -20, 64, 44], 14, 4.2, 0.4)
  return boxList
}

/** 一處遠景：放在哪、多大、方盒清單 */
export interface ColossusSite {
  /** 從遺址中心看過去的方位（度，東為零、順時針，同 garden-layout 的 getRingPosition）與距離 */
  degree: number;
  distance: number;
  scale: number;
  /** 正面（區域 +Z）朝遺址中心；水道橋沿區域 X 排開，所以是長長的側面對著人 */
  boxList: ColossusBox[];
}

export const SITE_LIST: ColossusSite[] = [
  /** 正北，長廊的軸線上：從回程門往北看，兩排石柱夾著它 */
  { degree: 270, distance: 190, scale: 1.6, boxList: createSeatedColossus() },
  { degree: 308, distance: 225, scale: 1.35, boxList: createGuardianGate() },
  { degree: 186, distance: 165, scale: 1.6, boxList: createFallenHead() },
  { degree: 140, distance: 185, scale: 1.3, boxList: createToppledColumns() },
  { degree: 14, distance: 205, scale: 1.2, boxList: createAqueduct() },
  { degree: 50, distance: 280, scale: 1.2, boxList: createZiggurat() },
]

/** 盤旋的鳥：圍著哪一處、離地多高（區域格）、繞多大一圈、幾隻 */
export interface BirdFlock {
  siteIndex: number;
  /** 圓心離該處腳下的高度（世界格） */
  height: number;
  radius: number;
  count: number;
}

export const BIRD_FLOCK_LIST: BirdFlock[] = [
  { siteIndex: 0, height: 100, radius: 46, count: 6 },
  { siteIndex: 1, height: 80, radius: 38, count: 4 },
]
