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

/** 計算讓魚「背鰭朝上、不翻滾」的螢幕旋轉角。
 *
 * 直接用平面內分量的方向角（atan2(y, x)）在魚朝向／背對鏡頭時會出錯：
 * 殘餘的垂直漂移會把正面照整隻轉 90 度（躺平）。
 * 這裡對投影後的「前向、上向」兩軸做最小平方擬合：
 * φ = atan2(hy·(inPlane + hx), inPlane·hx + 1 − hy²)
 *
 * - 平面內游動（inPlane = 1）→ 精確等於前進方向角
 * - 正對／背對鏡頭（inPlane → 0）→ 0，維持直立
 */
export function computeUprightRotation(
  headingX: number,
  headingY: number,
  inPlaneLength: number,
) {
  return Math.atan2(
    headingY * (inPlaneLength + headingX),
    inPlaneLength * headingX + 1 - headingY * headingY,
  )
}
