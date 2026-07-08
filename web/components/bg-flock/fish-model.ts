import Zdog from 'zdog'

export interface FishPosition { x: number; y: number; z: number }
export type Fish = InstanceType<typeof Zdog.Group>

interface CreateFishOptions {
  /** 掛載目標，可以是 Illustration 或 Anchor */
  addTo: InstanceType<typeof Zdog.Anchor>;
  position: FishPosition;
  /** 魚體尺寸 */
  size: number;
  /** 第一隻魚為金色領頭魚 */
  isFirst?: boolean;
  /** 尾鰭擺動角度（rad），供圖集烘焙多個擺動相位 */
  tailAngle?: number;
}

/** 建立單隻 zdog 小魚（身體、腹部、背鰭、雙眼、尾巴，領頭魚加皇冠） */
export function createFish(options: CreateFishOptions): Fish {
  const { addTo, position, size, isFirst = false, tailAngle = 0 } = options

  const color = isFirst ? '#ffd752' : '#bfebff'
  /** 眼睛採身體同色系的深色調，不用近黑色，避免太過突兀 */
  const eyeColor = isFirst ? '#ab8c2b' : '#3f7fa6'
  const thickness = size / 5
  const group = new Zdog.Group({ addTo, translate: position })

  // 背鰭：先畫，讓身體蓋住相接處
  void new Zdog.Shape({
    addTo: group,
    path: [
      { x: size * 0.16, y: size * -0.24 },
      { x: size * -0.04, y: size * -0.52 },
      { x: size * -0.2, y: size * -0.26 },
    ],
    closed: true,
    stroke: thickness * 0.6,
    color,
    fill: true,
  })

  // 身體
  void new Zdog.Ellipse({
    addTo: group,
    width: size,
    height: size * 0.6,
    stroke: thickness,
    color,
    fill: true,
  })

  const eye = new Zdog.Ellipse({
    addTo: group,
    width: size / 10,
    height: size / 10,
    color: eyeColor,
    translate: { x: size / 4, y: size / -20, z: thickness / 2 + 1 },
    fill: true,
    backface: false,
  })
  eye.copy({
    translate: { x: size / 4, y: size / -20, z: thickness / -2 - 1 },
    rotate: { x: Math.PI },
  })

  // 尾巴：掛在尾根 anchor 上，繞垂直軸（y）旋轉，呈現魚類的左右擺尾
  const tailAnchor = new Zdog.Anchor({
    addTo: group,
    translate: { x: size / -2 },
    rotate: { y: tailAngle },
  })
  void new Zdog.Shape({
    addTo: tailAnchor,
    path: [
      { x: 0, y: 0 },
      { x: thickness * -1.5, y: -thickness },
      { x: thickness * -1.5, y: thickness },
      { x: 0, y: 0 },
    ],
    closed: false,
    stroke: thickness,
    color,
    fill: true,
  })

  // 領頭魚的小皇冠
  if (isFirst) {
    void new Zdog.Shape({
      addTo: group,
      path: [
        { x: size * 0.04, y: size * -0.4 },
        { x: size * 0.08, y: size * -0.56 },
        { x: size * 0.13, y: size * -0.46 },
        { x: size * 0.18, y: size * -0.6 },
        { x: size * 0.23, y: size * -0.46 },
        { x: size * 0.28, y: size * -0.56 },
        { x: size * 0.32, y: size * -0.4 },
      ],
      closed: true,
      stroke: thickness * 0.4,
      color: '#f5b301',
      fill: true,
    })
  }

  return group
}

/** canvas 像素總量預算。
 *
 * 全螢幕 canvas 每幀送進 GPU 合成器的頻寬與像素總量成正比，
 * 實測超過此量級時合成器開始掉幀（執行緒都滿幀、上屏卻不足 60），
 * 因此超過預算就等比降低 DPR、由 CSS 放大
 */
const CANVAS_PIXEL_BUDGET = 2_600_000

interface CanvasPixelRatioOptions {
  devicePixelRatio: number;
  fishCount: number;
  /** canvas 的 CSS 尺寸 */
  width: number;
  height: number;
}

/** 依魚群數量與畫面尺寸調整 canvas DPR，換取繪製與合成效能 */
export function computeCanvasPixelRatio(options: CanvasPixelRatioOptions) {
  const { devicePixelRatio, fishCount, width, height } = options

  let maxRatio = 2
  if (fishCount > 600) {
    maxRatio = 1.25
  }
  else if (fishCount > 300) {
    maxRatio = 1.5
  }

  const area = width * height
  if (area > 0) {
    maxRatio = Math.min(maxRatio, Math.sqrt(CANVAS_PIXEL_BUDGET / area))
  }

  return Math.max(0.5, Math.min(devicePixelRatio, maxRatio))
}
