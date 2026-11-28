import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { VoxelBox, VoxelInstance } from '../realm-voxel-kit'
import { GLSL_NOISE } from '../realm-signature-kit'
import {
  buildVoxelFlockGeometry,
  createVoxelFlockMesh,
  createVoxelPropLayer,
  GLSL_VOXEL_FACE_NORMAL,
  GLSL_VOXEL_LIGHT,
} from '../realm-voxel-kit'
import { TERRACE_GROUND_Y, VILLAGE_CENTER } from './village-layout'

/**
 * 村落夜裡的天燈（渲染端，屬於世界層）
 *
 * 入夜之後村民在廣場上放天燈：一盞一盞暖橘的紙燈從廣場各處升起來，起先慢、越升越快，
 * 被風帶著往東北飄，升到一百格高才淡進夜空。天上同時總有二三十盞，遠近高低錯落。
 *
 * 第一版每盞是一張永遠正對鏡頭的方片，紙燈畫在片段著色器的像素格上。走到燈底下抬頭看，
 * 每一盞都還是正面那張圖，看不出它是一個立體的燈籠。
 * 現在是體素拼的紙燈（零件見 realm-voxel-kit）：上窄、腰寬、底收窄的三層紙罩，底下一圈竹框，
 * 框裡是火。燈自己會發光，所以不吃日夜的光，立體感靠的是：
 * - 每一層、每一面的亮度不同：火在底下，底層最亮、越往上越暗；相鄰兩個側面一明一暗，燈慢慢自轉時看得出稜角
 * - 從底下看得到框裡那一塊黃白的火，從上面看到的是暗的燈頂
 * - 遠的燈照離鏡頭的實際距離往夜色混，近的亮、遠的淡
 *
 * 外面那一圈柔的暈不另外畫：紙罩的亮度略過泛光門檻，自己帶出一圈暈。
 * 寫深度、畫在布景那一層：屋頂與樹照樣擋得住，燈與燈互相擋。
 *
 * 亮度跟著星空同進同退（nightRatio）：天黑才放，下雨就不放了。
 * 成本：四十盞、每盞四十個三角形，一個網格一千六百個三角形、一次繪製（效能檔減到約十四盞）
 */

const LANTERN_COUNT = 40

/** 夜裡的峰值亮度：紙罩最亮的面略過泛光門檻，自己帶出一圈暈 */
const LANTERN_PEAK = 1.05

/** 整盞放大多少：紙罩約一格寬、一格三高，比人大一點，遠遠看才有幾個像素 */
const LANTERN_SCALE = 1.15

/** 往夜色混多少：離鏡頭這麼近以內不混、這麼遠以外最淡 */
const HAZE_NEAR_DISTANCE = 30
const HAZE_FAR_DISTANCE = 220
const FAR_HAZE = 0.6

/** 顏色的編號，要與片段著色器的判斷一致 */
const LANTERN_TONE = { paper: 0, frame: 1 } as const

/** 面的編號（見 VOXEL_FACE_LIST）：四個側面、頂面、底面 */
const SIDE_FACE_INDEX_LIST = [0, 1, 4, 5] as const
const TOP_FACE_INDEX = 2
const BOTTOM_FACE_INDEX = 3

/**
 * 一盞天燈：座標是格（不是體素），原點在燈的中間
 *
 * part 這一欄挪來放「這一層有多亮」：火在底下，越往上越暗。整層同一個值，層與層之間是一階一階的落差
 */
export const LANTERN_BOX_LIST: VoxelBox[] = [
  /** 竹框：四面是暗的，底面是從框裡看進去的火 */
  { min: [-0.37, -0.62, -0.37], max: [0.37, -0.55, 0.37], part: 1, side: 0, tone: LANTERN_TONE.frame, faceIndexList: [...SIDE_FACE_INDEX_LIST, BOTTOM_FACE_INDEX] },
  /** 底層紙罩，緊貼著火 */
  { min: [-0.33, -0.55, -0.33], max: [0.33, -0.3, 0.33], part: 1, side: 0, tone: LANTERN_TONE.paper, faceIndexList: SIDE_FACE_INDEX_LIST },
  /** 腰：最寬的一層，底面露出一圈 */
  { min: [-0.45, -0.3, -0.45], max: [0.45, 0.25, 0.45], part: 0.84, side: 0, tone: LANTERN_TONE.paper },
  /** 頂層：收窄，頂面是暗的 */
  { min: [-0.36, 0.25, -0.36], max: [0.36, 0.55, 0.36], part: 0.66, side: 0, tone: LANTERN_TONE.paper, faceIndexList: [...SIDE_FACE_INDEX_LIST, TOP_FACE_INDEX] },
]

/** param：第幾盞（畫質低時只放前面幾盞），其餘的亂數在著色器裡由編號取雜湊 */
export function createLanternInstanceList(): VoxelInstance[] {
  /** 起飛點：廣場中央，人舉著燈的高度 */
  const anchor: [number, number, number] = [VILLAGE_CENTER.x, TERRACE_GROUND_Y + 2.5, VILLAGE_CENTER.z]
  return Array.from({ length: LANTERN_COUNT }, (_, index) => ({ anchor, param: [index, 0, 0, 0] as const }))
}

const LANTERN_VERTEX = `
precision highp float;
/** 起飛點（世界座標），每一盞都一樣 */
attribute vec3 position;
/** 頂點在燈身上的位置（格） */
attribute vec3 normal;
/** x 第幾盞 */
attribute vec4 color;
/** x 這一層有多亮 */
attribute vec2 uv;
/** x 面的編號、y 顏色的編號 */
attribute vec2 uv2;
uniform mat4 viewProjection;
uniform float time;
uniform float lanternCount;
/** x 這個面的亮度、y 顏色的編號、z 是不是朝下的面、w 這一盞此刻的淡入淡出 */
varying vec4 vInfo;
varying vec3 vWorld;
varying float vSeed;
${GLSL_NOISE}
${GLSL_VOXEL_FACE_NORMAL}

void main() {
  float index = color.x;
  float seedA = hash11(index * 1.93);
  float seedB = hash11(index * 4.41 + 2.0);
  /** 每一盞各自的週期（四十六到七十六秒）與錯開的起飛時間 */
  float period = 46.0 + seedA * 30.0;
  float progress = fract(time / period + seedB);

  /** 從廣場上某一點起飛 */
  float bearing = hash11(index * 7.7 + 5.0) * 6.2831853;
  float spread = sqrt(hash11(index * 3.3 + 8.0)) * 8.0;
  vec3 center = position + vec3(cos(bearing) * spread, 0.0, sin(bearing) * spread);

  /** 起先慢、越升越快；越高被風帶得越遠，還左右晃 */
  float rise = progress * (0.35 + 0.65 * progress) * 95.0;
  center.y += rise;
  center.x += rise * 0.32 + sin(time * 0.31 + index) * 2.4 * progress;
  center.z += rise * -0.18 + cos(time * 0.27 + index * 1.7) * 2.0 * progress;

  /** 燈慢慢自轉，每盞的方向與快慢不同；被風吹得微微歪（頂端往一邊偏） */
  float turn = seedB * 6.2831853 + time * (0.12 + 0.2 * seedA) * (seedB < 0.5 ? 1.0 : -1.0);
  float turnCos = cos(turn);
  float turnSin = sin(turn);
  vec3 local = normal * ${LANTERN_SCALE.toFixed(2)};
  vec3 turned = vec3(local.x * turnCos - local.z * turnSin, local.y, local.x * turnSin + local.z * turnCos);
  turned.x += local.y * 0.14 * sin(time * 0.6 + index * 2.1);
  turned.z += local.y * 0.14 * cos(time * 0.5 + index * 1.3);
  vec3 world = center + turned;

  /** 面的亮度：這一層離火多近，乘上這個面是哪一面。相鄰兩個側面一明一暗，頂面最暗 */
  vec3 faceNormal = getVoxelFaceNormal(uv2.x);
  float faceTone = abs(faceNormal.x) > 0.5 ? 1.0 : (abs(faceNormal.z) > 0.5 ? 0.8 : (faceNormal.y > 0.0 ? 0.5 : 0.9));

  bool isVisible = index < lanternCount;
  float fade = smoothstep(0.0, 0.03, progress) * (1.0 - smoothstep(0.7, 1.0, progress));
  vInfo = vec4(uv.x * faceTone, uv2.y, step(faceNormal.y, -0.5), isVisible ? fade : 0.0);
  vWorld = world;
  vSeed = seedA;
  gl_Position = isVisible ? viewProjection * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const LANTERN_FRAGMENT = `
precision highp float;
varying vec4 vInfo;
varying vec3 vWorld;
varying float vSeed;
uniform float time;
${GLSL_VOXEL_LIGHT}

/** 紙罩透出來的橘、竹框的暗褐、框裡那一塊火 */
const vec3 PAPER_COLOR = vec3(1.0, 0.56, 0.2);
const vec3 PAPER_ALT_COLOR = vec3(1.0, 0.42, 0.16);
const vec3 FRAME_COLOR = vec3(0.16, 0.08, 0.035);
const vec3 FLAME_COLOR = vec3(1.25, 0.95, 0.5);

void main() {
  /** 整盞輕輕地閃 */
  float flicker = 0.88 + 0.12 * sin(time * 6.0 + vSeed * 40.0);
  /** 每盞的紙色差一點，有的偏紅 */
  vec3 paper = mix(PAPER_COLOR, PAPER_ALT_COLOR, step(0.6, vSeed)) * vInfo.x;
  vec3 frame = mix(FRAME_COLOR, FLAME_COLOR, vInfo.z);
  vec3 color = (vInfo.y < 0.5 ? paper : frame) * flicker * strength;

  /** 照實際距離往夜色混：遠的燈淡，近的亮 */
  color = hazeVoxel(color, vWorld, ${HAZE_NEAR_DISTANCE.toFixed(1)}, ${HAZE_FAR_DISTANCE.toFixed(1)}, 0.0, ${FAR_HAZE.toFixed(2)});
  gl_FragColor = vec4(color, vInfo.w * min(strength, 1.0));
}
`

export function createVillageSkyLanterns({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  return createVoxelPropLayer({
    scene,
    atmosphere,
    name: 'village-sky-lanterns',
    shaderName: 'minespaceVillageSkyLanterns',
    vertexSource: LANTERN_VERTEX,
    fragmentSource: LANTERN_FRAGMENT,
    uniformList: ['lanternCount'],
    mesh: createVoxelFlockMesh(scene, 'village-sky-lanterns', buildVoxelFlockGeometry(LANTERN_BOX_LIST, createLanternInstanceList())),
    fogHandling: '照離鏡頭的距離自己往夜色混；亮度與透明度是 nightRatio（星空可見度乘 skyBodyFade 與露天程度）：下雨、換場景的霧幕與洞裡整批淡掉',
    update(frame, material) {
      material.setFloat('lanternCount', Math.max(12, Math.round(LANTERN_COUNT * frame.detailRatio)))
      return frame.nightRatio * LANTERN_PEAK
    },
  })
}
