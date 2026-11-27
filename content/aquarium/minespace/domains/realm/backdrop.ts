import type { Scene } from '@babylonjs/core'
import type { BlockId } from '../block/block-constants'
import type { TextureKey, TexturePack } from '../block/texture-pack'
import type { AtmosphereState } from '../weather/atmosphere'
import type { RealmBackdrop, RealmColor, RealmRidgeStyle } from './realm-definition'
import {
  Color3,
  Effect,
  FresnelParameters,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  StandardMaterial,
  Texture,
  VertexData,
} from '@babylonjs/core'
import { createSeededRandom, fbm2D } from '../../utils/noise'
import { BLOCK_DEFS } from '../block/block-constants'
import { resolveTexture } from '../block/texture-pack'
import { optOutOfFog } from '../renderer/fog-opt-out'
import { WORLD_SIZE } from '../world/world-constants'
import { createCloudSea } from './alpine/cloud-sea'
import { createWaterfallMist } from './river/waterfall-mist'

/**
 * 遠景布景：山稜、世界外的水面與一片底層平面
 *
 * 可走範圍只有兩百八十格，「壯闊」靠的是走不到的布景：
 *
 * - 山稜：幾圈環狀的剪影（樣式見 RIDGE_STYLE_MAP：湖中島是灰綠的山、林海是深綠的林稜、
 *   海中沙島只有遠海上零星幾座小島）。起伏由雜訊產生，高度與寬度都量化成階梯，
 *   與方塊世界同一種語言。越遠的那圈越淡、越接近地平線的顏色。
 * - 水面：從世界邊緣一路鋪到地平線，倒影只映天空，不開全尺寸的鏡面。
 *   與方塊水的交界不是一條線，而是平面往世界裡疊一段、由透明漸漸變不透明（見 LAKE_PLANE_FEATHER_WIDTH）。
 * - 底層平面：不畫的 LAKE_BED 方塊（深水的湖底、林海外圍的地面）由它代替。
 *
 * 山不吃一般的距離霧（不然兩百二十格外全被吃成一片白），
 * 自己依層次往地平線色混；顏色跟著日夜與場景氣氛走。
 * 每一樣一次繪製，沒有的就不建。
 *
 * 屬於世界層：換場景時跟著拆
 */

/** 一圈山稜的設定 */
interface RidgeLayer {
  radius: number;
  segmentCount: number;
  baseHeight: number;
  heightRange: number;
  /** 高度量化的一階，越遠越大，看起來每一階才差不多一樣高 */
  heightStep: number;
  /** 往地平線色混多少，近的最實 */
  haze: number;
  /**
   * 雜訊在圓上取樣的半徑，決定繞一圈有幾座大山
   *
   * 雜訊一個起伏大約一單位，半徑一點四的圓周長約九，一圈九座上下。
   * 給大了會變成一排細高的樓，像城市的天際線而不是山
   */
  frequency: number;
  /** 挖出缺口（高度壓到剩一成），看得到後面那幾圈 */
  hasGap: boolean;
  /**
   * 只留下雜訊高過這個門檻的那幾段，其餘整段不畫
   *
   * 給遠海上的小島用：繞一圈大部分是空的海平線，零星冒出幾座。不給就整圈都畫
   */
  presenceThreshold?: number;
}

/** 一種山稜樣式：由近到遠的幾圈，加上乘光之前的基準色 */
interface RidgeStyle {
  layerList: readonly RidgeLayer[];
  albedo: Color3;
  /**
   * 積雪：山腳往上 line 格以上換成雪的顏色
   *
   * 每一段山是一個平頂的階，高過雪線的那幾段頂上一截白，與方塊世界的雪頂同一種收法。
   * 不給就沒有雪
   */
  snow?: { line: number; albedo: Color3 };
}

/** 沒有雪的山，雪線給一個永遠到不了的高度（以山腳到稜線的比例計） */
const RIDGE_NO_SNOW = 2

/**
 * 山稜的樣式
 *
 * 新增一種就在這裡加一份，再把名字加進 realm-definition 的 RealmRidgeStyle
 */
const RIDGE_STYLE_MAP: Record<RealmRidgeStyle, RidgeStyle> = {
  /** 湖中島：三圈灰綠的山，最近那圈有缺口 */
  mountain: {
    layerList: [
      { radius: 350, segmentCount: 200, baseHeight: 4, heightRange: 50, heightStep: 6, haze: 0.2, frequency: 1.4, hasGap: true },
      { radius: 550, segmentCount: 260, baseHeight: 14, heightRange: 84, heightStep: 10, haze: 0.42, frequency: 1.8, hasGap: false },
      { radius: 800, segmentCount: 320, baseHeight: 36, heightRange: 160, heightStep: 16, haze: 0.62, frequency: 2.2, hasGap: false },
    ],
    /** 偏藍的灰綠：遠山的綠被空氣洗掉一大半，剩下的是一層冷的藍灰 */
    albedo: new Color3(0.2, 0.27, 0.28),
  },
  /**
   * 林海：三圈長滿樹的稜線，一圈比一圈淡進霧裡
   *
   * 起伏比山緩、階梯比山細，看起來是一片圓頂的林子而不是岩峰；
   * 最近那圈貼著世界外緣，山腳藏在林子後面，從林間的縫望出去就是它
   */
  forest: {
    layerList: [
      { radius: 230, segmentCount: 220, baseHeight: 10, heightRange: 26, heightStep: 3, haze: 0.38, frequency: 2.2, hasGap: false },
      { radius: 420, segmentCount: 260, baseHeight: 18, heightRange: 52, heightStep: 6, haze: 0.56, frequency: 1.8, hasGap: false },
      { radius: 700, segmentCount: 320, baseHeight: 34, heightRange: 96, heightStep: 10, haze: 0.72, frequency: 1.6, hasGap: false },
    ],
    /** 深綠：針葉林遠看是近乎黑的綠，再被空氣洗成藍綠 */
    albedo: new Color3(0.08, 0.16, 0.11),
  },
  /**
   * 海中沙島：遠海上零星幾座很淡的小島
   *
   * 只有一圈，大部分方位是空的海平線；冒出來的那幾段又低又淡，
   * 不能搶掉「四面都是海」的那個感覺
   */
  islet: {
    layerList: [
      { radius: 760, segmentCount: 300, baseHeight: 4, heightRange: 22, heightStep: 4, haze: 0.74, frequency: 2.6, hasGap: false, presenceThreshold: 0.42 },
    ],
    albedo: new Color3(0.18, 0.24, 0.22),
  },
  /**
   * 金葉林：三圈長滿秋林的圓丘
   *
   * 起伏與林海一樣緩，是一片片圓頂的丘而不是岩峰；顏色是整片秋林遠看的赭紅褐黃，
   * 越遠越往暖色的霧裡化，最遠那圈只剩一道淡淡的金
   */
  autumn: {
    layerList: [
      { radius: 240, segmentCount: 220, baseHeight: 8, heightRange: 22, heightStep: 3, haze: 0.4, frequency: 2, hasGap: false },
      { radius: 440, segmentCount: 260, baseHeight: 16, heightRange: 46, heightStep: 6, haze: 0.58, frequency: 1.7, hasGap: false },
      { radius: 720, segmentCount: 320, baseHeight: 30, heightRange: 84, heightStep: 10, haze: 0.74, frequency: 1.5, hasGap: false },
    ],
    albedo: new Color3(0.22, 0.11, 0.045),
  },
  /**
   * 千蛙沼：貼著水面的低矮林線
   *
   * 沼澤四周沒有山，只有遠處一道又低又平的樹林，被水氣洗成灰綠；
   * 近的那圈有缺口，看得到後面那圈與一段空的水平線
   */
  marsh: {
    layerList: [
      { radius: 260, segmentCount: 260, baseHeight: 5, heightRange: 9, heightStep: 2, haze: 0.5, frequency: 3.2, hasGap: true },
      { radius: 480, segmentCount: 300, baseHeight: 8, heightRange: 16, heightStep: 3, haze: 0.68, frequency: 2.8, hasGap: false },
    ],
    albedo: new Color3(0.07, 0.11, 0.07),
  },
  /**
   * 村落：三圈和緩的綠丘
   *
   * 世界裡那圈丘陵的稜線在九十幾格外、高出田地十格，布景的丘要從它後面冒出頭來，
   * 所以最近那圈的底就比林稜高；起伏寬而緩、階梯細，是一片一片的草丘不是岩峰，
   * 顏色是曬過太陽的草綠，越遠越淡進霧裡
   */
  hills: {
    layerList: [
      { radius: 260, segmentCount: 220, baseHeight: 26, heightRange: 18, heightStep: 3, haze: 0.36, frequency: 1.7, hasGap: false },
      { radius: 450, segmentCount: 260, baseHeight: 40, heightRange: 40, heightStep: 5, haze: 0.55, frequency: 1.6, hasGap: false },
      { radius: 720, segmentCount: 320, baseHeight: 62, heightRange: 80, heightStep: 8, haze: 0.72, frequency: 1.5, hasGap: false },
    ],
    albedo: new Color3(0.13, 0.21, 0.09),
  },
  /**
   * 雪稜：三圈積雪的岩峰，山腳插在雲海裡
   *
   * 最近那圈有缺口看得到後面兩圈；每一段比湖中島的山寬，遠看是一座一座的山塊，
   * 段太窄、起伏太密的話，頂上一截白會讓整圈像一排淡色的高樓。雪線以上一截白，
   * 遠的那兩圈幾乎整座都在雪線上。岩是偏藍的深灰：高山上的空氣乾，遠山不泛綠
   */
  snowpeak: {
    layerList: [
      { radius: 330, segmentCount: 150, baseHeight: 4, heightRange: 46, heightStep: 5, haze: 0.18, frequency: 1.2, hasGap: true },
      { radius: 540, segmentCount: 170, baseHeight: 10, heightRange: 76, heightStep: 8, haze: 0.38, frequency: 1.5, hasGap: false },
      { radius: 820, segmentCount: 190, baseHeight: 22, heightRange: 110, heightStep: 11, haze: 0.58, frequency: 1.7, hasGap: false },
    ],
    albedo: new Color3(0.12, 0.14, 0.17),
    snow: { line: 30, albedo: new Color3(0.8, 0.83, 0.88) },
  },
  /**
   * 千頃麥浪：兩圈又低又淡的遠丘
   *
   * 麥田外圍的坡只高四格，從田裡望得到天邊：布景不能是一圈山把天邊圍起來，
   * 只要幾道很矮的丘浮在地平線上，近的那圈有缺口、大段是空的。顏色是被金色暖霧洗過的黃褐
   */
  plains: {
    layerList: [
      { radius: 320, segmentCount: 240, baseHeight: 6, heightRange: 12, heightStep: 2, haze: 0.55, frequency: 2.4, hasGap: true },
      { radius: 620, segmentCount: 300, baseHeight: 10, heightRange: 26, heightStep: 3, haze: 0.72, frequency: 1.7, hasGap: false },
    ],
    albedo: new Color3(0.2, 0.17, 0.1),
  },
  /**
   * 野花原：三圈一座一座的嫩綠圓丘
   *
   * 世界裡外圍的坡高出最低那層十格，布景的丘要從它後面冒出頭；
   * 起伏比村落的綠丘密、階梯更細，是一顆一顆鼓起來的圓丘，顏色偏黃綠、亮一點
   */
  downs: {
    layerList: [
      { radius: 260, segmentCount: 240, baseHeight: 26, heightRange: 16, heightStep: 2, haze: 0.34, frequency: 2.3, hasGap: false },
      { radius: 450, segmentCount: 280, baseHeight: 40, heightRange: 30, heightStep: 3, haze: 0.52, frequency: 2, hasGap: false },
      { radius: 720, segmentCount: 320, baseHeight: 60, heightRange: 56, heightStep: 5, haze: 0.7, frequency: 1.8, hasGap: false },
    ],
    albedo: new Color3(0.17, 0.25, 0.08),
  },
  /**
   * 羊鳴谷：三圈高而暗的青灰山
   *
   * 人站在谷底，兩側的坡在八十格外高出谷底十六格，布景的山要高過它才看得到；
   * 近的那圈有缺口，看得到後面更高、更淡的兩圈。顏色是長著短草的高地遠看的暗青灰
   */
  fells: {
    layerList: [
      { radius: 300, segmentCount: 200, baseHeight: 40, heightRange: 40, heightStep: 6, haze: 0.3, frequency: 1.5, hasGap: true },
      { radius: 520, segmentCount: 240, baseHeight: 66, heightRange: 70, heightStep: 8, haze: 0.5, frequency: 1.7, hasGap: false },
      { radius: 800, segmentCount: 280, baseHeight: 100, heightRange: 120, heightStep: 12, haze: 0.66, frequency: 1.9, hasGap: false },
    ],
    albedo: new Color3(0.1, 0.14, 0.12),
  },
}

/** 山腳插到水面以下多深，湖面與山腳之間不能露出縫 */
const RIDGE_FOOT_DEPTH = 3

/**
 * 水面與鋪到地平線的底層平面往世界外圍延伸多遠（從世界中心量）
 *
 * 要蓋過最遠那圈山的山腳；沒有山的海，這一圈遠在霧的終點之外，邊緣落在霧裡
 */
const LAKE_PLANE_EXTENT = 1200

/**
 * 湖面往世界裡面疊進來多寬（格），在這一段裡由透明漸漸變不透明
 *
 * 方塊的水與這片平面再怎麼調色也對不齊：方塊水有像素貼圖、半透明看得到湖底，
 * 平面是一整片素色，正午貼近看，世界邊緣就是一條筆直的亮暗分界。
 * 改成平面從世界邊緣往裡疊四十四格、蓋在方塊水上面，由內往外從全透明漸漸到不透明，
 * 交界就攤成一段四十幾格的漸層，找不到一條線。
 * 湖中島的推回線離湖心五十七格，最近的漸層起點也在四十格外
 */
const LAKE_PLANE_FEATHER_WIDTH = 44
/** 漸層切成幾圈，每圈的不透明度照平滑曲線取，比一段直線的漸層看不出起點與終點 */
const LAKE_PLANE_FEATHER_RING_COUNT = 6
/**
 * 漸層那一段疊在方塊水面上，抬高兩公分免得深度打架
 *
 * 平面畫在天空那一層，比世界那一層晚畫，透明的部分疊在已經畫好的方塊水上
 */
const LAKE_PLANE_LIFT = 0.02

const RIDGE_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec2 vLayer;
varying float vShade;
varying float vSnow;

void main() {
  vLayer = uv;
  vShade = color.r;
  vSnow = color.g;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const RIDGE_FRAGMENT = `
precision highp float;
varying vec2 vLayer;
varying float vShade;
/** 雪線（以山腳到稜線的比例計），沒有雪的山給二，永遠到不了 */
varying float vSnow;

uniform vec3 ridgeColor;
/** 雪的顏色是山的顏色乘上這個倍率：同一份光，只換反照率 */
uniform vec3 snowRatio;
uniform vec3 horizonColor;
/** 轉場的霧有多濃（0～1），霧蓋上來時山也要跟著化進霧色，不能在一片白裡留著剪影 */
uniform float veilRatio;

void main() {
  /**
   * vLayer.x 是這一圈往地平線色混的基準，vLayer.y 是從山腳（0）到稜線（1）
   *
   * 山腳再多混一層：湖面上貼著一層水氣，山的下半截比上半截淡，
   * 看起來才像隔著一片濕的空氣，而不是一張剪紙立在水上
   */
  float footMist = (1.0 - smoothstep(0.0, 0.5, vLayer.y)) * 0.32;
  float haze = clamp(vLayer.x + (1.0 - vLayer.x) * footMist, 0.0, 1.0);
  haze = max(haze, veilRatio);
  vec3 rock = ridgeColor * mix(vec3(1.0), snowRatio, step(vSnow, vLayer.y));
  vec3 color = mix(rock * vShade, horizonColor, haze);
  gl_FragColor = vec4(color, 1.0);
}
`

const RIDGE_SHADER_NAME = 'minespaceBackdropRidge'

/**
 * 繞一圈取雜訊
 *
 * 在圓上取樣（cos、sin 當座標），頭尾自然接得起來，
 * 不會在某個方位出現一道斷崖
 */
function sampleRing(random: number, angle: number, frequency: number): number {
  return fbm2D(Math.cos(angle) * frequency + random * 97, Math.sin(angle) * frequency - random * 61, 4, 0.5)
}

interface RidgeMeshParam {
  scene: Scene;
  centerX: number;
  centerZ: number;
  footY: number;
  seed: string;
  style: RidgeStyle;
}

function createRidgeMesh({ scene, centerX, centerZ, footY: baseY, seed, style }: RidgeMeshParam): Mesh {
  const random = createSeededRandom(`backdrop-${seed}`)
  const positionList: number[] = []
  const uvList: number[] = []
  const colorList: number[] = []
  const indexList: number[] = []
  const footY = baseY - RIDGE_FOOT_DEPTH

  for (const layer of style.layerList) {
    const offset = random()
    const gapOffset = random()

    for (let segment = 0; segment < layer.segmentCount; segment++) {
      const fromAngle = (segment / layer.segmentCount) * Math.PI * 2
      const toAngle = ((segment + 1) / layer.segmentCount) * Math.PI * 2
      const middleAngle = (fromAngle + toAngle) / 2

      const rawNoise = sampleRing(offset, middleAngle, layer.frequency)
      /** 每一段的明暗差一點點，整排山才不是一塊色板；先抽籤，略過的段也要抽，種子序列才不會因樣式而錯開 */
      const shade = 0.88 + random() * 0.16
      if (layer.presenceThreshold !== undefined && rawNoise < layer.presenceThreshold)
        continue

      /** 稜線：雜訊撐開到零到一，再壓一點次方讓山峰尖、山谷寬 */
      const ridge = Math.min(1, Math.max(0, rawNoise * 0.75 + 0.5)) ** 1.5
      let height = layer.baseHeight + ridge * layer.heightRange
      if (layer.hasGap) {
        const gap = sampleRing(gapOffset, middleAngle, 1.1)
        height *= Math.min(1, Math.max(0.08, (gap + 0.15) * 2.4))
      }
      /** 量化成階梯：每一段是一個平頂，相鄰兩段之間是垂直的落差 */
      height = Math.max(layer.heightStep, Math.round(height / layer.heightStep) * layer.heightStep)
      const topY = baseY + height

      const baseIndex = positionList.length / 3
      for (const angle of [fromAngle, toAngle]) {
        const x = centerX + Math.cos(angle) * layer.radius
        const z = centerZ + Math.sin(angle) * layer.radius
        positionList.push(x, footY, z, x, topY, z)
        uvList.push(layer.haze, 0, layer.haze, 1)
      }

      /** 綠色通道借來放雪線：從山腳（0）到稜線（1）的哪裡開始是雪 */
      const snowStart = style.snow
        ? (style.snow.line + RIDGE_FOOT_DEPTH) / (height + RIDGE_FOOT_DEPTH)
        : RIDGE_NO_SNOW
      for (let vertex = 0; vertex < 4; vertex++) {
        colorList.push(shade, snowStart, shade, 1)
      }

      indexList.push(baseIndex, baseIndex + 1, baseIndex + 3, baseIndex, baseIndex + 3, baseIndex + 2)
    }
  }

  const mesh = new Mesh('backdrop-ridge', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.uvs = uvList
  vertexData.colors = colorList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

/**
 * 湖面的網格：一圈一圈套著的方框
 *
 * 最裡面那圈在世界邊緣往內 LAKE_PLANE_FEATHER_WIDTH 格，完全透明；
 * 往外每一圈不透明度照平滑曲線加上去，到世界邊緣全不透明，再往外鋪到 LAKE_PLANE_EXTENT。
 * 透明度寫在頂點色的 alpha 裡，StandardMaterial 看到 hasVertexAlpha 就會照著混
 */
function createLakePlaneMesh(scene: Scene, backdrop: RealmBackdrop, surfaceY: number): Mesh {
  const worldMin = -0.5
  const worldMax = WORLD_SIZE - 0.5
  const y = surfaceY + LAKE_PLANE_LIFT

  /** 由內往外的每一圈：範圍與不透明度 */
  const ringList: { minX: number; maxX: number; minZ: number; maxZ: number; alpha: number }[] = []
  for (let ring = 0; ring <= LAKE_PLANE_FEATHER_RING_COUNT; ring++) {
    const ratio = ring / LAKE_PLANE_FEATHER_RING_COUNT
    const inset = LAKE_PLANE_FEATHER_WIDTH * (1 - ratio)
    ringList.push({
      minX: worldMin + inset,
      maxX: worldMax - inset,
      minZ: worldMin + inset,
      maxZ: worldMax - inset,
      alpha: ratio * ratio * (3 - 2 * ratio),
    })
  }
  ringList.push({
    minX: backdrop.centerX - LAKE_PLANE_EXTENT,
    maxX: backdrop.centerX + LAKE_PLANE_EXTENT,
    minZ: backdrop.centerZ - LAKE_PLANE_EXTENT,
    maxZ: backdrop.centerZ + LAKE_PLANE_EXTENT,
    alpha: 1,
  })

  const positionList: number[] = []
  const colorList: number[] = []
  const indexList: number[] = []

  /** 每一圈四個角，逆時針：(min, min)、(max, min)、(max, max)、(min, max) */
  for (const ring of ringList) {
    positionList.push(
      ring.minX,
      y,
      ring.minZ,
      ring.maxX,
      y,
      ring.minZ,
      ring.maxX,
      y,
      ring.maxZ,
      ring.minX,
      y,
      ring.maxZ,
    )
    for (let corner = 0; corner < 4; corner++) {
      colorList.push(1, 1, 1, ring.alpha)
    }
  }

  /** 相鄰兩圈之間四條邊，各兩個三角形，朝上 */
  for (let ring = 0; ring < ringList.length - 1; ring++) {
    const inner = ring * 4
    const outer = inner + 4
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4
      indexList.push(
        outer + side,
        inner + side,
        outer + next,
        outer + next,
        inner + side,
        inner + next,
      )
    }
  }

  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)

  const mesh = new Mesh('backdrop-lake', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.colors = colorList
  vertexData.normals = normalList.map((value, index) => (index % 3 === 1 ? Math.abs(value) : value))
  vertexData.applyToMesh(mesh)
  mesh.hasVertexAlpha = true
  return mesh
}

/**
 * 湖面的材質
 *
 * 用一般的 StandardMaterial，不自己寫著色器：世界裡的方塊水也是它，
 * 色調映射、距離霧、大氣透視與雲影都是同一套，接縫兩側才對得起來。
 * 倒影靠「掠射時發光」近似：越貼著水面看越亮，顏色每幀換成天邊的顏色
 */
function createLakeMaterial(scene: Scene, color: RealmColor): StandardMaterial {
  const material = new StandardMaterial('backdrop-lake', scene)
  material.diffuseColor = new Color3(color[0], color[1], color[2])
  material.specularColor = new Color3(0.5, 0.5, 0.5)
  material.specularPower = 96
  material.ambientColor = new Color3(1, 1, 1)
  material.emissiveColor = new Color3(1, 1, 1)
  /**
   * Babylon 的菲涅耳：左色在掠射時、右色在正對時。
   * 正對（低頭看）不發光，看得到水本身的顏色；越貼著水面看越接近天邊的倒影
   */
  material.emissiveFresnelParameters = new FresnelParameters({
    leftColor: new Color3(0, 0, 0),
    rightColor: new Color3(0, 0, 0),
    bias: 0.1,
    power: 2,
  })
  material.maxSimultaneousLights = 6
  /** 從水面底下不會看到它，兩面都畫只是省得管三角形的繞向 */
  material.backFaceCulling = false
  /**
   * 漸層讓它進了半透明的佇列，半透明預設不寫深度。
   * 照樣寫：雲貼在遠平面上畫，排在它後面，沒有深度擋著會畫到湖面上
   */
  material.forceDepthWrite = true
  return material
}

/**
 * 底層平面：不畫的 LAKE_BED 方塊由它代替
 *
 * 與禪庭外圍那片白沙同一招（見 garden/sand-field）。深水底下的方塊是 LAKE_BED，
 * 碰撞照算但不畫；七萬格湖底照方塊畫的話，連同兩層陰影與深度圖要多畫三百萬個三角形，
 * 高畫質整幀多七毫秒。換成一片平面，一次繪製。林海外圍走不到的地面也是同一招。
 *
 * 地形的方塊都比它高，蓋在它上面；只有 LAKE_BED 那一圈看得到它。
 * 貼圖與色調借 floor.blockId 那種方塊的頂面，平鋪、開 mipmap，遠處才不會閃
 */
function createFloorPlane(scene: Scene, floor: RealmFloor): { mesh: Mesh; material: StandardMaterial } {
  const material = new StandardMaterial('backdrop-lake-bed', scene)
  material.specularColor = new Color3(0, 0, 0)
  material.ambientColor = new Color3(1, 1, 1)
  material.maxSimultaneousLights = 6
  const tint = getFloorTexture(floor.blockId)?.tint
  if (tint) {
    material.diffuseColor = new Color3(tint[0], tint[1], tint[2])
  }

  const size = getFloorSize(floor)
  const mesh = MeshBuilder.CreateGround('backdrop-lake-bed', { width: size, height: size }, scene)
  /** 比方塊頂面低一公分，與最底那一格頂面錯開，免得深度打架 */
  mesh.position.set((WORLD_SIZE - 1) / 2, floor.surfaceY - 0.01, (WORLD_SIZE - 1) / 2)
  mesh.material = material
  mesh.isPickable = false
  /** 島、斜坡與樹的影子落在上面，從岸邊往深水看才看得出水有多清 */
  mesh.receiveShadows = true
  return { mesh, material }
}

/** 鋪到地平線的話要蓋過最遠那圈山的山腳，否則只蓋世界本身 */
function getFloorSize(floor: RealmFloor): number {
  return floor.isEndless ? LAKE_PLANE_EXTENT * 2 : WORLD_SIZE
}

/** 那種方塊頂面的貼圖與色調：有頂面專用的（草地）就用頂面的 */
function getFloorTexture(blockId: BlockId): { key: TextureKey; tint: readonly [number, number, number] | undefined } | null {
  const textures = BLOCK_DEFS[blockId].textures
  const key = textures?.top ?? textures?.all
  if (!textures || !key)
    return null
  return { key, tint: textures.topTint ?? textures.tint }
}

/** 換材質包時底層平面跟著換貼圖 */
function applyFloorPack(material: StandardMaterial, floor: RealmFloor, pack: TexturePack, scene: Scene): void {
  material.diffuseTexture?.dispose()
  material.diffuseTexture = null

  const floorTexture = getFloorTexture(floor.blockId)
  const resolved = floorTexture ? resolveTexture(pack, floorTexture.key) : null
  if (!resolved?.url)
    return

  const texture = new Texture(resolved.url, scene, {
    samplingMode: Texture.NEAREST_LINEAR_MIPLINEAR,
  })
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  /** 一格一張，與方塊的貼圖密度一致 */
  const size = getFloorSize(floor)
  texture.uScale = size
  texture.vScale = size
  material.diffuseTexture = texture
}

/** 底層平面的設定 */
type RealmFloor = NonNullable<RealmBackdrop['floor']>

export interface Backdrop {
  /** 換材質包：底層平面的貼圖跟著換 */
  applyPack: (pack: TexturePack) => void;
  dispose: () => void;
}

interface CreateBackdropParam {
  scene: Scene;
  backdrop: RealmBackdrop;
  atmosphere: AtmosphereState;
  pack: TexturePack;
}

/**
 * 布景畫在天空那一層
 *
 * 太陽、月亮與天空罩都不寫深度，排在第一層的話，日落時太陽會畫在山的前面。
 * 放到天空那一層（雲與灰罩也在這裡）的不透明佇列：
 * 地形的深度已經寫好，被近處擋住的部分照樣不畫；山會蓋住太陽，
 * 雲是貼在遠平面上畫的，自然藏在山後面；灰罩是半透明、排在後面，下雨或轉場時照樣罩得住山
 */
const BACKDROP_RENDERING_GROUP = 1

/** 山稜的光：天光是主體，直射光只補一點，背光的山才不會全黑 */
const RIDGE_AMBIENT_WEIGHT = 0.95
const RIDGE_SUN_WEIGHT = 0.3

/** 湖面倒影的亮度：天邊的顏色乘上這個倍率 */
const LAKE_REFLECTION_RATIO = 0.4

/** 山稜的網格與材質，樣式見 RIDGE_STYLE_MAP */
function createRidge(
  scene: Scene,
  backdrop: RealmBackdrop,
  ridgeSetting: NonNullable<RealmBackdrop['ridge']>,
): { mesh: Mesh; material: ShaderMaterial; albedo: Color3 } {
  const style = RIDGE_STYLE_MAP[ridgeSetting.style]
  const material = new ShaderMaterial('backdrop-ridge', scene, RIDGE_SHADER_NAME, {
    attributes: ['position', 'uv', 'color'],
    uniforms: ['viewProjection', 'ridgeColor', 'snowRatio', 'horizonColor', 'veilRatio'],
  })
  material.backFaceCulling = false
  const snowAlbedo = style.snow?.albedo ?? style.albedo
  material.setColor3('snowRatio', new Color3(
    snowAlbedo.r / style.albedo.r,
    snowAlbedo.g / style.albedo.g,
    snowAlbedo.b / style.albedo.b,
  ))

  const mesh = createRidgeMesh({
    scene,
    centerX: backdrop.centerX,
    centerZ: backdrop.centerZ,
    footY: ridgeSetting.footY,
    seed: ridgeSetting.seed,
    style,
  })
  mesh.material = material
  mesh.isPickable = false
  mesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  /** 山稜繞著整個世界，包圍盒的中心就在世界中心，從哪裡看都不會被剔除 */
  mesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(mesh, '只在不循環的場景出現，沒有邊界白霧要收；自己往地平線色混，轉場時由灰罩與霧幕蓋住')
  return { mesh, material, albedo: style.albedo }
}

/** 世界外的水面 */
function createLake(
  scene: Scene,
  backdrop: RealmBackdrop,
  water: NonNullable<RealmBackdrop['water']>,
): { mesh: Mesh; material: StandardMaterial } {
  const material = createLakeMaterial(scene, water.color)
  const mesh = createLakePlaneMesh(scene, backdrop, water.surfaceY)
  mesh.material = material
  mesh.isPickable = false
  mesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  mesh.alwaysSelectAsActiveMesh = true
  return { mesh, material }
}

export function createBackdrop({ scene, backdrop, atmosphere, pack }: CreateBackdropParam): Backdrop {
  Effect.ShadersStore[`${RIDGE_SHADER_NAME}VertexShader`] = RIDGE_VERTEX
  Effect.ShadersStore[`${RIDGE_SHADER_NAME}FragmentShader`] = RIDGE_FRAGMENT

  const ridge = backdrop.ridge ? createRidge(scene, backdrop, backdrop.ridge) : null
  const lake = backdrop.water ? createLake(scene, backdrop, backdrop.water) : null

  const floor = backdrop.floor
  const floorPlane = floor ? createFloorPlane(scene, floor) : null
  /** 腳下的雲海（雪稜），見 alpine/cloud-sea */
  const cloudSea = backdrop.cloudSea
    ? createCloudSea({ scene, centerX: backdrop.centerX, centerZ: backdrop.centerZ, surfaceY: backdrop.cloudSea.surfaceY, atmosphere })
    : null
  /** 瀑布底下的水霧（溪谷），見 river/waterfall-mist */
  const waterfallMist = backdrop.waterfallMist
    ? createWaterfallMist({ scene, atmosphere, setting: backdrop.waterfallMist })
    : null
  if (floor && floorPlane) {
    applyFloorPack(floorPlane.material, floor, pack, scene)
  }

  const ridgeColor = new Color3()
  const reflectionColor = new Color3()

  const observer = scene.onBeforeRenderObservable.add(() => {
    /**
     * 山的顏色：基準色乘上此刻的光
     *
     * 天光與直射光都從日夜循環來，所以黃昏是暖的、夜裡是暗藍的剪影；
     * 霧色（地平線色）帶著場景的染色，湖中島是偏藍白的
     */
    if (ridge) {
      updateRidgeColor(ridge.material, ridge.albedo)
    }

    if (lake) {
      /** 倒影：天邊往中空色偏一點，掠射時才看得到一點天的藍 */
      Color3.LerpToRef(atmosphere.fogColor, atmosphere.skyMidColor, 0.35, reflectionColor)
      reflectionColor.scaleInPlace(LAKE_REFLECTION_RATIO)
      lake.material.emissiveFresnelParameters?.leftColor.copyFrom(reflectionColor)
    }
  })

  function updateRidgeColor(material: ShaderMaterial, albedo: Color3): void {
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * RIDGE_AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * RIDGE_SUN_WEIGHT
    ridgeColor.set(
      albedo.r * (atmosphere.ambientSkyColor.r * ambient + atmosphere.lightColor.r * sun),
      albedo.g * (atmosphere.ambientSkyColor.g * ambient + atmosphere.lightColor.g * sun),
      albedo.b * (atmosphere.ambientSkyColor.b * ambient + atmosphere.lightColor.b * sun),
    )
    material.setColor3('ridgeColor', ridgeColor)
    material.setColor3('horizonColor', atmosphere.fogColor)
    /**
     * 邊界白霧的程度：不循環的場景只有換場景的轉場會把它拉起來（見 use-fps-controller）。
     * 乘一點六與灰罩同一個係數，霧還沒蓋滿之前山就已經不見
     */
    material.setFloat('veilRatio', Math.min(1, atmosphere.edgeRatio * 1.6))
  }

  return {
    applyPack(nextPack) {
      if (floor && floorPlane) {
        applyFloorPack(floorPlane.material, floor, nextPack, scene)
      }
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      cloudSea?.dispose()
      waterfallMist?.dispose()
      floorPlane?.mesh.dispose()
      floorPlane?.material.dispose(false, true)
      ridge?.mesh.dispose()
      ridge?.material.dispose(false, true)
      lake?.mesh.dispose()
      lake?.material.dispose(false, true)
    },
  }
}
