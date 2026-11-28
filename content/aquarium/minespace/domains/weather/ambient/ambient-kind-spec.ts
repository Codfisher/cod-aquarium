import type { AmbientParticleKind } from '../../realm/realm-definition'
import type { AmbientCritterKey } from './ambient-critter-shape'
import type { AmbientShapeKey } from './ambient-shape'

/**
 * 環境粒子各種類的預設樣子
 *
 * 一種就是一組「外型＋動法」的預設值，沒有任何場景的資訊：
 * 顏色、數量、何時出現、生在哪裡都由場景的 AmbientParticle 決定，顏色與大小也可以覆寫。
 *
 * 時間與速度一律是真實的秒與格／秒（粒子系統的 updateSpeed 設成一幀的長度，
 * 見 ambient-layer），調的時候不必換算
 */

/** 顏色加透明度，零到一（加法混合的種類 RGB 可以超過一） */
export type AmbientColorTuple = readonly [number, number, number, number]

/**
 * 一顆粒子一生的明暗
 *
 * - soft：淡入、撐住、淡出（大部分的東西）
 * - blink：亮起、撐住、暗下去，螢火那種一明一滅
 * - twinkle：兩次快閃，冰晶與鹽粒在日光下的閃爍
 * - ember：火星，由亮橘冷卻成暗紅再熄掉（colorA 是剛冒出來、colorB 是冷卻後）
 */
export type AmbientFade = 'soft' | 'blink' | 'twinkle' | 'ember'

/** 飛行時的轉向：粒子的水平速度每秒轉過去多少弧度，轉向量隨時間起伏 */
export interface AmbientMeander {
  /** 最大轉向速度（弧度／秒） */
  turn: number;
  /** 轉向起伏的頻率（弧度／秒） */
  frequency: number;
  /** 轉向量取立方：大部分時間直飛，偶爾猛然轉彎（蜻蜓） */
  isSharp?: boolean;
  /** 一直朝同一邊轉，畫圓圈（繞著燈的蛾），每顆的轉向隨編號左右各半 */
  isCircling?: boolean;
  /** 上下起伏的速度（格／秒）與頻率；不給就不上下晃，高度交給 verticalTarget */
  bob?: number;
  bobFrequency?: number;
  /**
   * 懸停：每 period 秒一輪，其中 ratio 的比例停在半空（水平速度收到零，照樣上下起伏）
   *
   * 只有體素生物那一路會讀（見 ambient-critter-flight）：蜻蜓飛一陣、停一下，停著的時候才看得清牠的樣子
   */
  hover?: { period: number; ratio: number };
}

export interface AmbientKindSpec {
  shape: AmbientShapeKey;
  blend: 'standard' | 'add';
  /** 顆粒邊長（格） */
  size: readonly [number, number];
  /** 沿速度方向拉長的細線才給（stretched），邊長乘上這兩個倍率 */
  stretch?: { x: readonly [number, number]; y: readonly [number, number] };
  billboard: 'all' | 'stretched';
  /** 壽命（秒） */
  life: readonly [number, number];
  /** 出生時的水平與垂直速度（格／秒），水平方向隨機（跟風的種類朝風向） */
  horizontalSpeed: readonly [number, number];
  verticalSpeed: readonly [number, number];
  isWindAligned?: boolean;
  /** 重力加速度（格／秒²），往下為負；火星往上衝所以是正的 */
  gravity?: number;
  /** 垂直速度往這個值靠攏（格／秒，下沉為負）與靠攏的快慢（每秒），浮塵與落花用它代替重力 */
  verticalTarget?: { speed: number; rate: number };
  colorA: AmbientColorTuple;
  colorB: AmbientColorTuple;
  fade: AmbientFade;
  /** 平面上自轉的角速度範圍（弧度／秒） */
  spin?: readonly [number, number];
  /** 水平速度往風靠攏的快慢（每秒），零是不理風 */
  windFollow: number;
  /** 靠攏的目標是風速的幾倍，不給是 1 */
  windGain?: number;
  meander?: AmbientMeander;
  /** 拍翅：精靈圖輪流播，每秒幾個週期（體素生物是翅膀每秒擺幾下） */
  flap?: { hz: number };
  /**
   * 這一種改用方盒拼的立體生物來畫，不走粒子系統（見 ambient-critter-layer）
   *
   * 給了就由 realm-ambient 改建體素那一層；shape、billboard 這些方片才用的欄位留著不讀，
   * 動法（速度、壽命、轉彎、順風）兩邊讀的是同一組數字
   */
  critter?: AmbientCritterKey;
  /** 從出生到消失，邊長乘上的倍率（煙霧越冒越大） */
  grow?: readonly [number, number];
  /**
   * 夜裡要不要跟著天色一起暗
   *
   * 吃光的東西（花粉、花瓣）要，自己發光的（螢火、火星）不要；
   * 蛾繞的是燈，身上被燈照著，也不跟著暗
   */
  isDimmedAtNight: boolean;
}

export const AMBIENT_KIND_SPEC_MAP: Record<AmbientParticleKind, AmbientKindSpec> = {
  pollen: {
    shape: 'dot',
    blend: 'standard',
    size: [0.035, 0.075],
    billboard: 'all',
    life: [6, 13],
    horizontalSpeed: [0.02, 0.1],
    verticalSpeed: [0, 0.08],
    verticalTarget: { speed: 0.03, rate: 0.5 },
    colorA: [1, 0.94, 0.72, 0.5],
    colorB: [0.94, 0.9, 0.78, 0.28],
    fade: 'soft',
    windFollow: 0.25,
    meander: { turn: 0.5, frequency: 0.4 },
    isDimmedAtNight: true,
  },
  dust: {
    shape: 'dot',
    blend: 'standard',
    size: [0.04, 0.08],
    billboard: 'all',
    life: [8, 16],
    horizontalSpeed: [0.02, 0.08],
    verticalSpeed: [-0.02, 0.04],
    verticalTarget: { speed: 0, rate: 0.4 },
    colorA: [0.8, 0.8, 0.82, 0.42],
    colorB: [0.66, 0.67, 0.72, 0.24],
    fade: 'soft',
    windFollow: 0.15,
    meander: { turn: 0.4, frequency: 0.3 },
    isDimmedAtNight: true,
  },
  shimmer: {
    shape: 'dot',
    blend: 'standard',
    size: [0.05, 0.1],
    billboard: 'all',
    life: [1.6, 3.2],
    horizontalSpeed: [0.02, 0.1],
    verticalSpeed: [0.12, 0.35],
    verticalTarget: { speed: 0.25, rate: 0.6 },
    colorA: [1, 0.97, 0.85, 0.6],
    colorB: [1, 0.88, 0.65, 0.35],
    fade: 'twinkle',
    windFollow: 0.2,
    meander: { turn: 2.2, frequency: 1.4 },
    isDimmedAtNight: true,
  },
  firefly: {
    shape: 'dot',
    blend: 'add',
    size: [0.06, 0.11],
    billboard: 'all',
    life: [3.5, 7],
    horizontalSpeed: [0.1, 0.35],
    verticalSpeed: [-0.05, 0.15],
    colorA: [0.78, 1, 0.5, 1],
    colorB: [0.7, 0.95, 0.42, 1],
    fade: 'blink',
    windFollow: 0,
    meander: { turn: 0.9, frequency: 0.7, bob: 0.08, bobFrequency: 1.1 },
    isDimmedAtNight: false,
  },
  spore: {
    shape: 'dot',
    blend: 'add',
    size: [0.07, 0.14],
    billboard: 'all',
    life: [7, 14],
    horizontalSpeed: [0.02, 0.1],
    verticalSpeed: [0.03, 0.14],
    verticalTarget: { speed: 0.06, rate: 0.5 },
    colorA: [0.4, 1, 0.8, 0.8],
    colorB: [0.3, 0.7, 1, 0.6],
    fade: 'soft',
    windFollow: 0.15,
    meander: { turn: 0.6, frequency: 0.4 },
    isDimmedAtNight: false,
  },
  marshlight: {
    shape: 'dot',
    blend: 'add',
    size: [0.14, 0.24],
    billboard: 'all',
    life: [8, 14],
    horizontalSpeed: [0.05, 0.2],
    verticalSpeed: [-0.02, 0.06],
    colorA: [0.5, 1, 0.72, 0.85],
    colorB: [0.35, 0.85, 0.95, 0.7],
    fade: 'blink',
    windFollow: 0,
    meander: { turn: 0.5, frequency: 0.35, bob: 0.12, bobFrequency: 0.5 },
    isDimmedAtNight: false,
  },
  butterfly: {
    shape: 'butterfly',
    blend: 'standard',
    size: [0.2, 0.3],
    billboard: 'all',
    life: [9, 16],
    horizontalSpeed: [0.45, 0.85],
    verticalSpeed: [-0.05, 0.1],
    colorA: [1, 0.78, 0.25, 1],
    colorB: [0.95, 0.95, 1, 1],
    fade: 'soft',
    windFollow: 0.1,
    meander: { turn: 1.5, frequency: 0.55, bob: 0.22, bobFrequency: 1.3 },
    flap: { hz: 5 },
    critter: 'butterfly',
    isDimmedAtNight: true,
  },
  dragonfly: {
    shape: 'dragonfly',
    blend: 'standard',
    size: [0.24, 0.34],
    billboard: 'all',
    life: [8, 14],
    horizontalSpeed: [1.1, 2.2],
    verticalSpeed: [-0.03, 0.05],
    colorA: [0.3, 0.7, 0.95, 1],
    colorB: [0.88, 0.3, 0.25, 1],
    fade: 'soft',
    windFollow: 0,
    meander: { turn: 4, frequency: 0.8, isSharp: true, bob: 0.1, bobFrequency: 0.9, hover: { period: 5.5, ratio: 0.35 } },
    flap: { hz: 16 },
    critter: 'dragonfly',
    isDimmedAtNight: true,
  },
  moth: {
    shape: 'butterfly',
    blend: 'standard',
    size: [0.14, 0.2],
    billboard: 'all',
    life: [8, 14],
    horizontalSpeed: [0.5, 0.9],
    verticalSpeed: [-0.03, 0.05],
    colorA: [0.92, 0.86, 0.7, 1],
    colorB: [0.78, 0.76, 0.7, 1],
    fade: 'soft',
    windFollow: 0,
    meander: { turn: 2.6, frequency: 0.5, isCircling: true, bob: 0.15, bobFrequency: 0.8 },
    flap: { hz: 9 },
    critter: 'moth',
    isDimmedAtNight: false,
  },
  petal: {
    shape: 'petal',
    blend: 'standard',
    size: [0.1, 0.17],
    billboard: 'all',
    life: [10, 18],
    horizontalSpeed: [0.05, 0.25],
    verticalSpeed: [-0.3, -0.1],
    verticalTarget: { speed: -0.3, rate: 1.2 },
    colorA: [1, 0.72, 0.82, 0.95],
    colorB: [1, 0.92, 0.94, 0.95],
    fade: 'soft',
    spin: [-2.4, 2.4],
    windFollow: 0.5,
    meander: { turn: 1.2, frequency: 0.6 },
    isDimmedAtNight: true,
  },
  seedfluff: {
    shape: 'fluff',
    blend: 'standard',
    size: [0.08, 0.14],
    billboard: 'all',
    life: [10, 20],
    horizontalSpeed: [0.05, 0.2],
    verticalSpeed: [-0.02, 0.1],
    verticalTarget: { speed: 0.04, rate: 0.5 },
    colorA: [1, 1, 0.96, 0.85],
    colorB: [0.94, 0.97, 1, 0.6],
    fade: 'soft',
    windFollow: 0.7,
    windGain: 1.4,
    meander: { turn: 0.6, frequency: 0.5 },
    isDimmedAtNight: true,
  },
  feather: {
    shape: 'feather',
    blend: 'standard',
    size: [0.14, 0.22],
    billboard: 'all',
    life: [9, 15],
    horizontalSpeed: [0.05, 0.2],
    verticalSpeed: [-0.3, -0.12],
    verticalTarget: { speed: -0.28, rate: 1 },
    colorA: [0.97, 0.96, 0.93, 0.95],
    colorB: [0.72, 0.64, 0.52, 0.95],
    fade: 'soft',
    spin: [-1.5, 1.5],
    windFollow: 0.35,
    meander: { turn: 1.4, frequency: 0.8 },
    isDimmedAtNight: true,
  },
  chaff: {
    shape: 'flake',
    blend: 'standard',
    size: [0.05, 0.1],
    billboard: 'all',
    life: [4, 9],
    horizontalSpeed: [0.4, 1],
    verticalSpeed: [-0.05, 0.1],
    isWindAligned: true,
    verticalTarget: { speed: 0, rate: 0.6 },
    colorA: [0.96, 0.82, 0.45, 0.85],
    colorB: [0.85, 0.7, 0.35, 0.7],
    fade: 'soft',
    spin: [-5, 5],
    windFollow: 1,
    windGain: 1.6,
    meander: { turn: 2.2, frequency: 1.6 },
    isDimmedAtNight: true,
  },
  ash: {
    shape: 'flake',
    blend: 'standard',
    size: [0.06, 0.13],
    billboard: 'all',
    life: [8, 16],
    horizontalSpeed: [0.05, 0.2],
    verticalSpeed: [-0.25, -0.1],
    verticalTarget: { speed: -0.18, rate: 0.8 },
    colorA: [0.58, 0.55, 0.52, 0.85],
    colorB: [0.32, 0.3, 0.3, 0.85],
    fade: 'soft',
    spin: [-3, 3],
    windFollow: 0.4,
    meander: { turn: 1, frequency: 0.7 },
    isDimmedAtNight: true,
  },
  litter: {
    shape: 'flake',
    blend: 'standard',
    size: [0.09, 0.15],
    billboard: 'all',
    life: [4, 9],
    horizontalSpeed: [0.3, 0.8],
    verticalSpeed: [-0.05, 0.15],
    isWindAligned: true,
    verticalTarget: { speed: 0.05, rate: 0.8 },
    colorA: [0.82, 0.52, 0.2, 0.9],
    colorB: [0.62, 0.36, 0.14, 0.9],
    fade: 'soft',
    spin: [-6, 6],
    windFollow: 0.8,
    meander: { turn: 2.8, frequency: 0.9 },
    isDimmedAtNight: true,
  },
  glint: {
    shape: 'sparkle',
    blend: 'add',
    size: [0.07, 0.14],
    billboard: 'all',
    life: [0.5, 1.4],
    horizontalSpeed: [0, 0.03],
    verticalSpeed: [0, 0.03],
    colorA: [1, 1, 1, 1],
    colorB: [0.8, 0.95, 1.1, 1],
    fade: 'twinkle',
    windFollow: 0,
    isDimmedAtNight: false,
  },
  windstreak: {
    shape: 'dot',
    blend: 'standard',
    size: [0.3, 0.4],
    stretch: { x: [0.08, 0.14], y: [1.4, 2.6] },
    billboard: 'stretched',
    life: [1.2, 2.4],
    horizontalSpeed: [3.5, 6.5],
    verticalSpeed: [-0.3, 0.1],
    isWindAligned: true,
    colorA: [0.95, 0.97, 1, 0.5],
    colorB: [0.85, 0.9, 1, 0.35],
    fade: 'soft',
    windFollow: 1,
    windGain: 4.5,
    isDimmedAtNight: true,
  },
  spray: {
    shape: 'dot',
    blend: 'standard',
    size: [0.04, 0.09],
    billboard: 'all',
    life: [0.5, 1.1],
    horizontalSpeed: [0.1, 0.6],
    verticalSpeed: [1, 2.2],
    gravity: -4,
    colorA: [0.95, 0.99, 1, 0.9],
    colorB: [0.8, 0.92, 1, 0.7],
    fade: 'soft',
    windFollow: 0.5,
    isDimmedAtNight: true,
  },
  steam: {
    shape: 'soft',
    blend: 'standard',
    size: [0.5, 1],
    billboard: 'all',
    life: [3, 6],
    horizontalSpeed: [0.02, 0.12],
    verticalSpeed: [0.25, 0.55],
    gravity: 0.05,
    colorA: [1, 1, 1, 0.16],
    colorB: [0.92, 0.92, 0.9, 0.1],
    fade: 'soft',
    windFollow: 0.3,
    grow: [0.8, 2.2],
    isDimmedAtNight: true,
  },
  mist: {
    shape: 'soft',
    blend: 'standard',
    size: [1.6, 3.2],
    billboard: 'all',
    life: [10, 18],
    horizontalSpeed: [0.05, 0.2],
    verticalSpeed: [0, 0.03],
    colorA: [0.92, 0.95, 1, 0.14],
    colorB: [0.85, 0.9, 0.96, 0.09],
    fade: 'soft',
    windFollow: 0.4,
    grow: [0.9, 1.4],
    meander: { turn: 0.3, frequency: 0.2 },
    isDimmedAtNight: true,
  },
  ember: {
    shape: 'dot',
    blend: 'add',
    size: [0.04, 0.09],
    billboard: 'all',
    life: [1.6, 3.4],
    horizontalSpeed: [0.05, 0.35],
    verticalSpeed: [0.5, 1.3],
    gravity: 0.25,
    colorA: [1, 0.78, 0.3, 1],
    colorB: [0.55, 0.12, 0.04, 1],
    fade: 'ember',
    windFollow: 0.6,
    meander: { turn: 1.6, frequency: 1.1 },
    isDimmedAtNight: false,
  },
  bubble: {
    shape: 'ring',
    blend: 'standard',
    size: [0.08, 0.16],
    billboard: 'all',
    /** 水面上跳起一小段就破：往上的初速與重力配成「壽命結束時剛好落回水面」 */
    life: [0.5, 0.9],
    horizontalSpeed: [0, 0.05],
    verticalSpeed: [0.35, 0.7],
    gravity: -1.5,
    colorA: [0.95, 0.98, 1, 0.85],
    colorB: [0.8, 0.9, 1, 0.6],
    fade: 'soft',
    windFollow: 0,
    isDimmedAtNight: true,
  },
  drip: {
    shape: 'dot',
    blend: 'standard',
    size: [0.3, 0.3],
    stretch: { x: [0.1, 0.14], y: [1.2, 2.2] },
    billboard: 'stretched',
    life: [0.7, 1.5],
    horizontalSpeed: [0, 0.05],
    verticalSpeed: [-0.6, -0.2],
    gravity: -10,
    colorA: [0.82, 0.92, 1, 0.8],
    colorB: [0.7, 0.85, 0.96, 0.6],
    fade: 'soft',
    windFollow: 0,
    isDimmedAtNight: true,
  },
}
