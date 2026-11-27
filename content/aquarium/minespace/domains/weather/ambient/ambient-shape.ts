import type { Scene } from '@babylonjs/core'
import { DynamicTexture, Texture } from '@babylonjs/core'

/**
 * 環境粒子的貼圖
 *
 * 世界是方塊，連水滴與煙都是看得出邊界的像素塊，所以粒子也用硬邊的點陣小圖（NEAREST 取樣）。
 * 例外只有煙霧、水氣這類本來就沒有輪廓的東西，用柔邊的漸層（與沼澤霧、晨霧同一個道理）。
 *
 * 圖樣用字元畫在這裡：# 是白、o 是淺灰（陰影與蟲身），. 是透明；
 * 顏色一律留給粒子系統染，這裡只管形狀與明暗。
 * 多格的圖（拍翅的兩格）橫排成一張精靈圖，由粒子系統輪流播
 */
export type AmbientShapeKey =
  | 'dot'
  | 'sparkle'
  | 'petal'
  | 'fluff'
  | 'feather'
  | 'flake'
  | 'ring'
  | 'butterfly'
  | 'dragonfly'
  | 'soft'

interface PixelShape {
  /** 每一格動畫各一份，每份是一列一列的字串 */
  frameList: string[][];
}

const PIXEL_SHAPE_MAP: Record<Exclude<AmbientShapeKey, 'soft'>, PixelShape> = {
  /** 與空氣顆粒同一顆：四格見方裡中央兩格 */
  dot: { frameList: [['....', '.##.', '.##.', '....']] },
  /** 十字的閃光，中心最亮、四個尖端淡 */
  sparkle: { frameList: [['..o..', '..#..', 'o###o', '..#..', '..o..']] },
  petal: { frameList: [['.##.', '####', '###o', '.oo.']] },
  /** 蒲公英的種絨：一個小十字，比閃光小 */
  fluff: { frameList: [['.o.', 'o#o', '.o.']] },
  feather: { frameList: [['...#', '..##', '.##.', '.#o.', '#o..', 'o...']] },
  flake: { frameList: [['##.', '###', '.#o']] },
  /** 氣泡：一圈空心，右下角暗一點 */
  ring: { frameList: [['.###.', '#...o', '#...o', '#...o', '.ooo.']] },
  /** 翅膀攤開與闔起兩格，七格見方；中間那一列是蟲身 */
  butterfly: {
    frameList: [
      ['.......', '.......', '##.o.##', '###o###', '###o###', '.##o##.', '.......'],
      ['.......', '...o...', '..#o#..', '..#o#..', '..#o#..', '...o...', '.......'],
    ],
  },
  /** 蜻蜓：細長的身子與兩對翅，翅膀兩格是攤平與微微後掠 */
  dragonfly: {
    frameList: [
      ['...o...', '##.o.##', '.#.o.#.', '...o...', '##.o.##', '.#.o.#.', '...o...'],
      ['...o...', '..#o#..', '.#.o.#.', '...o...', '..#o#..', '.#.o.#.', '...o...'],
    ],
  },
}

const SHADE_COLOR: Record<string, string> = {
  '#': 'rgba(255, 255, 255, 1)',
  'o': 'rgba(176, 176, 176, 1)',
}

/** 柔邊貼圖的邊長 */
const SOFT_SIZE = 32

export interface AmbientTexture {
  texture: DynamicTexture;
  /** 一格動畫的像素寬高；單格的圖與整張同大 */
  cellWidth: number;
  cellHeight: number;
  frameCount: number;
}

/**
 * 畫一張環境粒子的貼圖
 *
 * 每一層自己建一張、跟著自己的粒子系統一起釋放（粒子系統 dispose 時預設連貼圖一起收），
 * 換場景時不會留下孤兒貼圖。每張都只有幾十個像素
 */
export function createAmbientTexture(scene: Scene, name: string, shape: AmbientShapeKey): AmbientTexture {
  if (shape === 'soft')
    return createSoftTexture(scene, name)

  const { frameList } = PIXEL_SHAPE_MAP[shape]
  const rowList = frameList[0]!
  const cellWidth = rowList[0]!.length
  const cellHeight = rowList.length
  const texture = new DynamicTexture(
    name,
    { width: cellWidth * frameList.length, height: cellHeight },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, cellWidth * frameList.length, cellHeight)

  frameList.forEach((frame, frameIndex) => {
    frame.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column++) {
        const color = SHADE_COLOR[row[column]!]
        if (!color)
          continue
        context.fillStyle = color
        context.fillRect(frameIndex * cellWidth + column, rowIndex, 1, 1)
      }
    })
  })

  texture.update()
  texture.hasAlpha = true
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE

  return { texture, cellWidth, cellHeight, frameCount: frameList.length }
}

/** 柔邊的一團：煙、霧與水氣沒有輪廓，硬邊會露出貼圖的形狀 */
function createSoftTexture(scene: Scene, name: string): AmbientTexture {
  const texture = new DynamicTexture(name, { width: SOFT_SIZE, height: SOFT_SIZE }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D
  const gradient = context.createRadialGradient(SOFT_SIZE / 2, SOFT_SIZE / 2, 0, SOFT_SIZE / 2, SOFT_SIZE / 2, SOFT_SIZE / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, SOFT_SIZE, SOFT_SIZE)
  texture.update()
  texture.hasAlpha = true

  return { texture, cellWidth: SOFT_SIZE, cellHeight: SOFT_SIZE, frameCount: 1 }
}

/** 各種貼圖的圖樣，給 Node 端檢查每一格都等寬、不含不認得的字元 */
export function getPixelShapeFrameListMap(): Record<string, string[][]> {
  return Object.fromEntries(Object.entries(PIXEL_SHAPE_MAP).map(([key, shape]) => [key, shape.frameList]))
}
