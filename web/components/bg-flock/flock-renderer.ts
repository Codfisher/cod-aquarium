import type { Boid } from './boid'
import Zdog from 'zdog'
import { computeUprightRotation, createFish } from './fish-model'
import { computeShellCountScale } from './flock'
import { clamp01 } from './utils'

/** 深度角（朝向偏出螢幕平面的角度）量化格數，範圍 -90°～+90°。
 *
 * zdog 即時渲染每幀要處理數千個 shape，數量多時跑不到 60fps。
 * 改成把魚的深度角量化成固定格數，用 zdog 預先畫進 sprite 圖集，
 * 之後每幀只剩 drawImage：像素仍是 zdog 畫的，質感不變。
 *
 * 姿態不用 yaw/pitch（尤拉角在垂直方向有萬向鎖，垂直游動時會亂跳），
 * 而是以朝向向量拆成「深度角（挑圖集格）＋螢幕平面旋轉＋左右鏡像」：
 * 這組參數的奇異點在正對鏡頭的方向，該視角下魚只是小圓點，抖動不可見
 */
const DEPTH_STEP_COUNT = 25
const ATLAS_COLUMN_COUNT = 8
/** 魚含尾巴與圓頭線帽的整體外接範圍，約為身長的倍數 */
const FISH_BOUNDS_RATIO = 2.6
const TWO_PI = Math.PI * 2

/** 尾鰭擺動的相位角度（rad），繞垂直軸左右擺，逐一烘進圖集。
 * 正側面視角只看得到透視收縮，擺幅取大一點補償。
 * 相位數影響擺動的平滑度：相位太少每步跳動大，看起來像卡頓
 */
const TAIL_PHASE_ANGLE_LIST = [-0.6, -0.3, 0, 0.3, 0.6]
/** 擺動循環順序（乒乓來回），索引對應 TAIL_PHASE_ANGLE_LIST */
const WAG_SEQUENCE = [0, 1, 2, 3, 4, 3, 2, 1]

/** 景深霧化的量化等級數。
 *
 * 霧色預先合成進圖集變體，繪製時依等級挑一張，
 * 每隻魚只需一次 drawImage，避免「原色＋霧色」兩層疊畫讓填充量翻倍
 */
const FOG_LEVEL_COUNT = 16
/** 最遠處的魚混向背景色的最大比例 */
const MAX_DEPTH_FOG = 0.7

/** 最遠霧化等級對應的繪製縮放，用來配置變體解析度。
 *
 * 霧化等級與距離對應：等級越高越遠、繪製尺寸越小，
 * 變體解析度照各等級實際的繪製尺寸線性配置——
 * 近的等級維持全解析度（避免放大模糊），遠的等級才降低省記憶體
 */
const FAR_VARIANT_DEPTH_SCALE = 0.75

/** 圖集超取樣倍率中，景深縮放貢獻的上限。
 * 完整涵蓋最近景深（約 2 倍）會讓圖集記憶體翻倍，
 * 最貼近鏡頭的魚輕微柔邊可接受
 */
const MAX_SUPERSAMPLE_DEPTH_SCALE = 1.6

/** 顯示朝向的追隨速率（每秒）。
 *
 * boid 的轉向力讓朝向每幀微幅抖動，抖動騎在量化格邊界上時，
 * sprite 會在相鄰格之間來回翻、看起來像卡頓。
 * 顯示用朝向以指數平滑追隨實際朝向，濾掉微抖、保留真正的轉向
 */
const ORIENTATION_SMOOTH_RATE = 12

/** 左右鏡像切換的遲滯量。
 *
 * 垂直游動時朝向的水平分量在 0 附近抖動，
 * 沒有遲滯的話魚會左右來回鏡像閃爍。
 * 實測 0.1 擋不住往上游時的左右搖擺（每秒上百次翻面），加寬到 0.25
 */
const FLIP_HYSTERESIS = 0.25

/** 鏡像切換後的冷卻秒數，搖擺超過遲滯帶時的最後保險 */
const FLIP_COOLDOWN_SECONDS = 0.4

/** 鏡像過渡速率（每秒）。
 *
 * 往上游時魚會左右蛇行，翻面無法避免（遲滯只能降低頻率）；
 * 改用約 150ms 的交叉淡化取代瞬間鏡像，讓翻面本身不可見
 */
const MIRROR_BLEND_RATE = 7

const BUBBLE_LIMIT = 60

interface SpriteAtlasVariant {
  canvas: HTMLCanvasElement;
  /** 相對原色圖集的解析度比例（遠處等級較低以省記憶體） */
  scaleRatio: number;
}

interface SpriteAtlas {
  /** 各霧化等級的圖集變體；索引 0 為原色，其餘等級首次使用時才合成 */
  variantList: (SpriteAtlasVariant | undefined)[];
  /** 單格邊長（實體像素） */
  cellSize: number;
  /** 圖集繪製時的縮放倍率（含 DPR 與景深縮放的超取樣） */
  renderScale: number;
}

interface FishRenderConfig {
  /** 建立當下的魚體尺寸（之後尺寸變更不影響既有的魚） */
  size: number;
  /** 第一隻魚為金色領頭魚 */
  isFirst: boolean;
  /** 尾擺相位（0~1），逐幀累加 */
  wagPhase: number;
  /** 個體擺動速率差異，避免整群魚同步擺尾 */
  wagRateScale: number;
  /** 顯示用朝向向量（指數平滑追隨實際值），初始為 NaN、首幀直接對齊 */
  displayHeadingX: number;
  displayHeadingY: number;
  displayHeadingZ: number;
  /** 是否左右鏡像（魚頭朝左時鏡像 nose-right 的 sprite），帶遲滯 */
  mirrored: boolean;
  /** 鏡像切換的剩餘冷卻秒數 */
  mirrorCooldown: number;
  /** 鏡像過渡進度（0 = 未鏡像、1 = 鏡像），朝 mirrored 對應值滑動 */
  mirrorBlend: number;
  /** 開發模式姿態跳變偵測用的前一幀狀態 */
  lastDepthIndex: number;
  lastAppliedRotation: number;
}

interface Bubble {
  x: number;
  y: number;
  riseSpeed: number;
  driftPhase: number;
  radius: number;
  age: number;
  lifetime: number;
}

/** 依深度角取得圖集格索引 */
function computeDepthIndex(depthAngle: number) {
  const ratio = clamp01(depthAngle / Math.PI + 0.5)
  return Math.round(ratio * (DEPTH_STEP_COUNT - 1))
}

/** 圖集格索引對應的深度角 */
function computeBucketAngle(depthIndex: number) {
  return (depthIndex / (DEPTH_STEP_COUNT - 1) - 0.5) * Math.PI
}

/** boid 景深縮放（越近越大） */
function computeDepthScale(z: number) {
  return 1 + z / 500
}

/** 將角度差正規化到 -π～π */
function wrapAngleDifference(difference: number) {
  return ((difference + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI
}

/** 主執行緒 sprite 渲染器：管理圖集快取、魚外觀設定與泡泡。
 *
 * 作為不支援 WebGL2 環境的 fallback，主要路徑見 fish-shader-renderer
 */
export class FlockRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D | null

  /** 依（尺寸、配色）快取 sprite 圖集，尺寸或霧色變更時整批失效重建 */
  private readonly atlasMap = new Map<number, SpriteAtlas>()
  private readonly fishConfigList: FishRenderConfig[] = []
  private readonly bubbleList: Bubble[] = []
  /** 畫家演算法的繪製順序索引，重複利用陣列 */
  private readonly drawOrderScratch: number[] = []

  private width = 0
  private height = 0
  private pixelRatio = 1
  /** 景深霧化的混合色（亮色模式為白、深色模式為黑） */
  private fogColor = '#ffffff'
  /** 景深淡化的半徑，通常等於殼半徑＋殼厚度 */
  private depthFadeRange = 200
  private bubbleSpawnCooldown = 1

  /** 開發模式姿態跳變統計 */
  private poseSampleFrameCount = 0
  private mirrorFlipCount = 0
  private depthCellJumpCount = 0
  private rotationJumpCount = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.context = canvas.getContext('2d')
  }

  setSize(width: number, height: number, pixelRatio: number) {
    if (
      width === this.width
      && height === this.height
      && pixelRatio === this.pixelRatio
    ) {
      return
    }

    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
    // 超取樣倍率隨尺寸與 DPR 變動，圖集整批重建
    this.atlasMap.clear()
  }

  setFogColor(color: string) {
    if (color === this.fogColor) {
      return
    }

    this.fogColor = color
    this.atlasMap.clear()
  }

  setDepthFadeRange(range: number) {
    this.depthFadeRange = range
  }

  /** 差量同步魚的外觀設定 */
  syncFishCount(count: number, fishSize: number) {
    while (this.fishConfigList.length < count) {
      this.fishConfigList.push({
        size: fishSize,
        isFirst: this.fishConfigList.length === 0,
        wagPhase: Math.random(),
        wagRateScale: 0.85 + Math.random() * 0.3,
        displayHeadingX: Number.NaN,
        displayHeadingY: Number.NaN,
        displayHeadingZ: Number.NaN,
        mirrored: false,
        mirrorCooldown: 0,
        mirrorBlend: 0,
        lastDepthIndex: -1,
        lastAppliedRotation: Number.NaN,
      })
    }

    if (this.fishConfigList.length > count) {
      this.fishConfigList.length = count
    }
  }

  spawnBubbles(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.bubbleList.length >= BUBBLE_LIMIT) {
        this.bubbleList.shift()
      }

      this.bubbleList.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        riseSpeed: 18 + Math.random() * 22,
        driftPhase: Math.random() * TWO_PI,
        radius: 0.8 + Math.random() * 1.2,
        age: 0,
        lifetime: 1.5 + Math.random() * 1.5,
      })
    }
  }

  render(boidList: Boid[], deltaSeconds: number) {
    const { canvas, context } = this
    if (!context) {
      return
    }

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    // canvas 尺寸變更會重置 context 狀態，每幀設定一次確保縮放品質
    context.imageSmoothingQuality = 'high'

    const count = Math.min(boidList.length, this.fishConfigList.length)

    // 畫家演算法：z 小（遠）的先畫，與 zdog 的 z 排序一致
    const drawOrder = this.drawOrderScratch
    drawOrder.length = count
    for (let i = 0; i < count; i++) {
      drawOrder[i] = i
    }
    drawOrder.sort(
      (a, b) => boidList[a]!.position.z - boidList[b]!.position.z,
    )

    /** 指數平滑係數：與幀率無關的追隨比例 */
    const orientationAlpha = 1 - Math.exp(-ORIENTATION_SMOOTH_RATE * deltaSeconds)

    for (const index of drawOrder) {
      const boid = boidList[index]!
      const config = this.fishConfigList[index]!
      const atlas = this.getAtlas(config)

      // 顯示朝向平滑追隨實際朝向（向量內插，無尤拉角的繞角問題）
      if (Number.isNaN(config.displayHeadingX)) {
        config.displayHeadingX = boid.heading.x
        config.displayHeadingY = boid.heading.y
        config.displayHeadingZ = boid.heading.z
      }
      else {
        config.displayHeadingX
          += (boid.heading.x - config.displayHeadingX) * orientationAlpha
        config.displayHeadingY
          += (boid.heading.y - config.displayHeadingY) * orientationAlpha
        config.displayHeadingZ
          += (boid.heading.z - config.displayHeadingZ) * orientationAlpha
      }

      const headingX = config.displayHeadingX
      const headingY = config.displayHeadingY
      const headingZ = config.displayHeadingZ

      /** 朝向在螢幕平面內的分量長度 */
      const inPlaneLength = Math.hypot(headingX, headingY)
      /** 深度角：朝向偏出螢幕平面的角度，決定圖集格 */
      const depthAngle = Math.atan2(headingZ, inPlaneLength)
      /** 兩個面的螢幕旋轉角；鏡像面以鏡像座標（x 取反）計算 */
      const rotationNormal = computeUprightRotation(headingX, headingY, inPlaneLength)
      const rotationMirrored = computeUprightRotation(-headingX, headingY, inPlaneLength)

      // 魚頭朝左時左右鏡像（遲滯＋冷卻，垂直游動的左右搖擺不會造成翻面風暴）
      const wasMirrored = config.mirrored
      config.mirrorCooldown = Math.max(0, config.mirrorCooldown - deltaSeconds)
      if (config.mirrorCooldown <= 0) {
        if (config.mirrored) {
          if (headingX > FLIP_HYSTERESIS) {
            config.mirrored = false
          }
        }
        else if (headingX < -FLIP_HYSTERESIS) {
          config.mirrored = true
        }

        if (config.mirrored !== wasMirrored) {
          config.mirrorCooldown = FLIP_COOLDOWN_SECONDS
        }
      }

      if (import.meta.env.DEV && config.mirrored !== wasMirrored) {
        this.mirrorFlipCount++
      }

      // 尾擺相位逐幀累加，游速越快擺越快
      const wagRate = (0.8 + boid.velocity.length() / 60) * config.wagRateScale
      config.wagPhase = (config.wagPhase + wagRate * deltaSeconds) % 1
      const tailPhaseIndex = WAG_SEQUENCE[
        Math.floor(config.wagPhase * WAG_SEQUENCE.length) % WAG_SEQUENCE.length
      ]!

      const depthIndex = computeDepthIndex(depthAngle)

      if (import.meta.env.DEV) {
        if (
          config.lastDepthIndex >= 0
          && Math.abs(depthIndex - config.lastDepthIndex) > 1
        ) {
          this.depthCellJumpCount++
        }
        config.lastDepthIndex = depthIndex

        const appliedRotation = config.mirrored
          ? rotationMirrored
          : rotationNormal
        if (
          !Number.isNaN(config.lastAppliedRotation)
          && config.mirrored === wasMirrored
          && Math.abs(
            wrapAngleDifference(appliedRotation - config.lastAppliedRotation),
          ) > 0.3
        ) {
          this.rotationJumpCount++
        }
        config.lastAppliedRotation = appliedRotation
      }

      const cellIndex = tailPhaseIndex * DEPTH_STEP_COUNT + depthIndex
      const sourceX = (cellIndex % ATLAS_COLUMN_COUNT) * atlas.cellSize
      const sourceY = Math.floor(cellIndex / ATLAS_COLUMN_COUNT) * atlas.cellSize

      /** 深度角量化的跨格補間：相鄰格的主要視覺差是身長的透視收縮，
       * 以實際深度角與格深度角的餘弦比做水平縮放，讓過渡連續。
       * 接近正對鏡頭（cos 趨近 0）時比值不穩定，直接跳過補間
       */
      const cosBucketAngle = Math.cos(computeBucketAngle(depthIndex))
      let stretch = 1
      if (Math.abs(cosBucketAngle) > 0.2) {
        stretch = Math.min(
          1.25,
          Math.max(0.8, Math.cos(depthAngle) / cosBucketAngle),
        )
      }

      // 依景深霧量挑選對應等級的圖集變體，一次 drawImage 完成混色
      const fogLevel = Math.round(
        (this.computeDepthFog(boid.position.z) / MAX_DEPTH_FOG) * (FOG_LEVEL_COUNT - 1),
      )

      const drawSize = (atlas.cellSize / atlas.renderScale)
        * computeDepthScale(boid.position.z)

      // 鏡像過渡進度朝目標滑動
      const mirrorBlendTarget = config.mirrored ? 1 : 0
      if (config.mirrorBlend !== mirrorBlendTarget) {
        const maxStep = MIRROR_BLEND_RATE * deltaSeconds
        config.mirrorBlend += Math.max(
          -maxStep,
          Math.min(maxStep, mirrorBlendTarget - config.mirrorBlend),
        )
      }

      const variant = this.getAtlasVariant(atlas, fogLevel)
      // 變體解析度依等級不同，來源座標同步縮放
      const variantSourceX = sourceX * variant.scaleRatio
      const variantSourceY = sourceY * variant.scaleRatio
      const variantCellSize = atlas.cellSize * variant.scaleRatio

      if (config.mirrorBlend <= 0.001) {
        this.drawFishSprite(variant.canvas, variantSourceX, variantSourceY, variantCellSize, boid, rotationNormal, stretch, drawSize, false, 1)
      }
      else if (config.mirrorBlend >= 0.999) {
        this.drawFishSprite(variant.canvas, variantSourceX, variantSourceY, variantCellSize, boid, rotationMirrored, stretch, drawSize, true, 1)
      }
      else {
        // 翻面過渡中：兩面交叉淡化
        this.drawFishSprite(variant.canvas, variantSourceX, variantSourceY, variantCellSize, boid, rotationNormal, stretch, drawSize, false, 1 - config.mirrorBlend)
        this.drawFishSprite(variant.canvas, variantSourceX, variantSourceY, variantCellSize, boid, rotationMirrored, stretch, drawSize, true, config.mirrorBlend)
      }
    }

    context.globalAlpha = 1

    this.updateBubbles(boidList, deltaSeconds)
    this.drawBubbles()

    if (import.meta.env.DEV) {
      this.poseSampleFrameCount++
      if (this.poseSampleFrameCount >= 120) {
        // eslint-disable-next-line no-console
        console.log(
          `[bg-flock:pose] mirror flips: ${this.mirrorFlipCount}, `
          + `cell jumps: ${this.depthCellJumpCount}, `
          + `rotation jumps: ${this.rotationJumpCount}`,
        )
        this.poseSampleFrameCount = 0
        this.mirrorFlipCount = 0
        this.depthCellJumpCount = 0
        this.rotationJumpCount = 0
      }
    }
  }

  /** 繪製單面魚 sprite。
   *
   * 參數採位置引數而非物件，避免高頻迴圈中配置暫時物件
   */
  private drawFishSprite(
    variant: HTMLCanvasElement,
    sourceX: number,
    sourceY: number,
    cellSize: number,
    boid: Boid,
    rotation: number,
    stretch: number,
    drawSize: number,
    mirrored: boolean,
    alpha: number,
  ) {
    const { context } = this
    if (!context) {
      return
    }

    const halfDrawSize = drawSize / 2

    context.setTransform(
      this.pixelRatio,
      0,
      0,
      this.pixelRatio,
      boid.position.x * this.pixelRatio,
      boid.position.y * this.pixelRatio,
    )

    // 鏡像面先水平翻轉；rotation 已由呼叫端以鏡像座標計算
    if (mirrored) {
      context.scale(-1, 1)
    }
    context.rotate(rotation)

    if (stretch !== 1) {
      context.scale(stretch, 1)
    }

    context.globalAlpha = alpha
    context.drawImage(
      variant,
      sourceX,
      sourceY,
      cellSize,
      cellSize,
      -halfDrawSize,
      -halfDrawSize,
      drawSize,
      drawSize,
    )
  }

  /** 景深霧量：z 越小（越遠）混入越多背景色，靠近鏡頭時為 0。
   *
   * 淡化範圍套用與殼相同的數量縮放，魚少、殼縮小時濃淡層次不會消失
   */
  private computeDepthFog(z: number) {
    const range = this.depthFadeRange
      * computeShellCountScale(this.fishConfigList.length)
    const ratio = clamp01((z + range) / (2 * range))
    return MAX_DEPTH_FOG * (1 - ratio)
  }

  private getAtlas(config: FishRenderConfig): SpriteAtlas {
    const key = config.size * 2 + (config.isFirst ? 1 : 0)

    let atlas = this.atlasMap.get(key)
    if (!atlas) {
      atlas = this.buildAtlas(config.size, config.isFirst)
      this.atlasMap.set(key, atlas)
    }
    return atlas
  }

  /** 用 zdog 把「25 個深度角 × 3 個尾擺相位」的魚預先畫進圖集 */
  private buildAtlas(size: number, isFirst: boolean): SpriteAtlas {
    const maxDepthScale = Math.min(
      computeDepthScale(Math.min(this.width, this.height) / 2),
      MAX_SUPERSAMPLE_DEPTH_SCALE,
    )
    const renderScale = Math.max(1, this.pixelRatio * maxDepthScale)
    const cellSize = Math.ceil(size * FISH_BOUNDS_RATIO * renderScale)
    const cellCount = TAIL_PHASE_ANGLE_LIST.length * DEPTH_STEP_COUNT
    const rowCount = Math.ceil(cellCount / ATLAS_COLUMN_COUNT)

    const atlasCanvas = document.createElement('canvas')
    atlasCanvas.width = cellSize * ATLAS_COLUMN_COUNT
    atlasCanvas.height = cellSize * rowCount
    const atlasContext = atlasCanvas.getContext('2d')!
    // Illustration 預設的圓角線條，維持原本質感
    atlasContext.lineCap = 'round'
    atlasContext.lineJoin = 'round'

    for (let phaseIndex = 0; phaseIndex < TAIL_PHASE_ANGLE_LIST.length; phaseIndex++) {
      const scene = new Zdog.Anchor()
      const fish = createFish({
        addTo: scene,
        position: { x: 0, y: 0, z: 0 },
        size,
        isFirst,
        tailAngle: TAIL_PHASE_ANGLE_LIST[phaseIndex]!,
      })

      for (let depthIndex = 0; depthIndex < DEPTH_STEP_COUNT; depthIndex++) {
        // zdog rotateY 正向會把機首（+x）轉向 +z（鏡頭方向），
        // 與 depthAngle = atan2(headingZ, 平面分量) 的正負號一致
        fish.rotate.y = computeBucketAngle(depthIndex)
        scene.updateGraph()

        const cellIndex = phaseIndex * DEPTH_STEP_COUNT + depthIndex
        const column = cellIndex % ATLAS_COLUMN_COUNT
        const row = Math.floor(cellIndex / ATLAS_COLUMN_COUNT)
        atlasContext.setTransform(
          renderScale,
          0,
          0,
          renderScale,
          (column + 0.5) * cellSize,
          (row + 0.5) * cellSize,
        )
        scene.renderGraphCanvas(atlasContext)
      }
    }

    return {
      variantList: [{ canvas: atlasCanvas, scaleRatio: 1 }],
      cellSize,
      renderScale,
    }
  }

  /** 取得指定霧化等級的圖集變體，首次使用時以原色圖集合成 */
  private getAtlasVariant(atlas: SpriteAtlas, level: number): SpriteAtlasVariant {
    const cached = atlas.variantList[level]
    if (cached) {
      return cached
    }

    /** 該等級對應的繪製縮放（等級越高越遠越小），解析度隨之配置 */
    const levelRatio = level / (FOG_LEVEL_COUNT - 1)
    const variantDepthScale = MAX_SUPERSAMPLE_DEPTH_SCALE
      + (FAR_VARIANT_DEPTH_SCALE - MAX_SUPERSAMPLE_DEPTH_SCALE) * levelRatio
    const atlasDepthScale = atlas.renderScale / this.pixelRatio
    const scaleRatio = Math.min(1, variantDepthScale / Math.max(atlasDepthScale, 0.01))

    const baseCanvas = atlas.variantList[0]!.canvas
    const variantCanvas = document.createElement('canvas')
    variantCanvas.width = Math.max(1, Math.ceil(baseCanvas.width * scaleRatio))
    variantCanvas.height = Math.max(1, Math.ceil(baseCanvas.height * scaleRatio))
    const variantContext = variantCanvas.getContext('2d')!

    variantContext.drawImage(
      baseCanvas,
      0,
      0,
      variantCanvas.width,
      variantCanvas.height,
    )
    // source-atop 只在既有輪廓內染色，等效於顏色混向霧色、輪廓與透明度不變
    variantContext.globalCompositeOperation = 'source-atop'
    variantContext.globalAlpha = MAX_DEPTH_FOG * (level / (FOG_LEVEL_COUNT - 1))
    variantContext.fillStyle = this.fogColor
    variantContext.fillRect(0, 0, variantCanvas.width, variantCanvas.height)

    const variant: SpriteAtlasVariant = {
      canvas: variantCanvas,
      scaleRatio: variantCanvas.width / baseCanvas.width,
    }
    atlas.variantList[level] = variant
    return variant
  }

  /** 更新泡泡：偶爾讓隨機一隻魚吐泡，泡泡上浮、左右漂、逾期淘汰 */
  private updateBubbles(boidList: Boid[], deltaSeconds: number) {
    this.bubbleSpawnCooldown -= deltaSeconds
    if (this.bubbleSpawnCooldown <= 0 && boidList.length > 0) {
      this.bubbleSpawnCooldown = 0.7 + Math.random() * 1.6

      const boid = boidList[Math.floor(Math.random() * boidList.length)]
      if (boid) {
        // 從嘴邊（鼻頭前方）冒出
        this.spawnBubbles(
          boid.position.x + boid.heading.x * 8,
          boid.position.y + boid.heading.y * 8,
          1 + Math.floor(Math.random() * 2),
        )
      }
    }

    let writeIndex = 0
    for (const bubble of this.bubbleList) {
      bubble.age += deltaSeconds
      if (bubble.age >= bubble.lifetime) {
        continue
      }

      bubble.y -= bubble.riseSpeed * deltaSeconds
      bubble.x += Math.sin(bubble.age * 4 + bubble.driftPhase) * 8 * deltaSeconds
      this.bubbleList[writeIndex] = bubble
      writeIndex++
    }
    this.bubbleList.length = writeIndex
  }

  private drawBubbles() {
    const { context } = this
    if (!context || this.bubbleList.length === 0) {
      return
    }

    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    context.strokeStyle = '#8fcfe8'
    context.lineWidth = 1

    for (const bubble of this.bubbleList) {
      const fadeIn = clamp01(bubble.age / 0.25)
      const fadeOut = clamp01((bubble.lifetime - bubble.age) / 0.5)
      context.globalAlpha = fadeIn * fadeOut * 0.55

      context.beginPath()
      context.arc(
        bubble.x,
        bubble.y,
        bubble.radius * (1 + bubble.age * 0.2),
        0,
        TWO_PI,
      )
      context.stroke()
    }

    context.globalAlpha = 1
  }
}
