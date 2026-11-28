import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { VoxelBox, VoxelInstance } from '../realm-voxel-kit'
import { AUTUMN_GEESE_ANCHOR } from '../realm-signature-direction'
import { GLSL_NOISE } from '../realm-signature-kit'
import {
  buildVoxelFlockGeometry,
  createVoxelFlockMesh,
  createVoxelPropLayer,
  createVoxelWingGlsl,
  GLSL_VOXEL_FACE_NORMAL,
  GLSL_VOXEL_LIGHT,
  VOXEL_WING_PART,
} from '../realm-voxel-kit'
import { AUTUMN_CENTER, GROVE_GROUND_Y } from './autumn-layout'

/**
 * 金葉林晨昏的雁行（渲染端，屬於世界層）
 *
 * 秋天的天空要有往南飛的雁：太陽貼著地平線、天色最紅的那一段，西邊低空一隊一隊人字形的雁群橫越過去。
 *
 * 第一版每隻是一張掛在天球上、永遠正對鏡頭的小方片，片段著色器在八乘八的像素格上畫一個人字。
 * 方片沒有厚度與朝向，三隊雁看起來貼在同一層天上（與石殿遺址的飛鳥被退回是同一個毛病）。
 * 現在是體素風的立體雁（零件見 realm-voxel-kit）：身體、長頸、頭、喙、尾，左右各兩節翅膀，
 * 整節方盒繞著肩與肘拍。牠們真的在世界座標上飛：
 * - 航線是一條直線，從西北的遠霧裡來、在正西離場景中心最近、往南飛進霧裡，遠近與大小是真的透視
 * - 三隊各在不同的距離與高度，近的大而深、遠的小而淡（照離鏡頭的實際距離往地平線色混）
 * - 人字攤在水平面上，一邊略高一邊略低，從底下斜斜看上去才看得出兩臂
 * - 每個面吃與山稜同一組天光與直射光：夕陽那一側的面是暖的，腹面是暗的
 *
 * 只在晨昏出現（twilightRatio）：太陽升高或天黑之後淡出，下雨或陰天罩蓋上來時一起收。
 * 成本：二十七隻、每隻九個方盒，一個網格約兩千九百個三角形、一次繪製；位置、朝向與拍翅全在頂點著色器裡算
 */

const FORMATION_COUNT = 3
const BIRD_PER_FORMATION = 9

/** 雁的一格體素在世界裡多大（格）：翼展約十格，雁在兩百格外，一格約三四個畫面像素 */
const GOOSE_VOXEL_SIZE = 0.8

/** 航線中點離場景中心多遠（格）；高度照招牌景象那個仰角算，神遊的鏡頭才對得上 */
const COURSE_DISTANCE = 185
const COURSE_HEIGHT = Math.tan(AUTUMN_GEESE_ANCHOR.elevation) * COURSE_DISTANCE

/** 航線全長（格）：兩端在五百多格外，早就淡進霧裡 */
const COURSE_LENGTH = 1040

/** 隊與隊之間隔多遠（往外）、多高 */
const FORMATION_DEPTH_GAP = 46
const FORMATION_HEIGHT_GAP = 13

/** 人字裡前後兩隻、左右兩隻隔多遠（格） */
const RANK_SPACING_ALONG = 9
const RANK_SPACING_ACROSS = 7.5

/**
 * 人字的兩臂一邊往上、一邊往下各錯開多少（格）
 *
 * 人字攤在水平面上，而人是從側面偏下看過去的，兩臂在畫面上幾乎疊成一條線；
 * 讓外側那一臂一隻比一隻高、內側一隻比一隻低，畫面上才張得開
 */
const RANK_SPACING_UP = 2.6

/** 拍一下翅幾秒：雁是一路拍著飛的，不滑翔 */
const FLAP_PERIOD_SECOND = 1.15

/** 往地平線色混多少：離鏡頭這麼近以內最深、這麼遠以外最淡 */
const HAZE_NEAR_DISTANCE = 130
const HAZE_FAR_DISTANCE = 520
const NEAR_HAZE = 0.1
const FAR_HAZE = 0.86

/** 翅膀的關節（體素）：翅根貼著身體側面，內節兩格半 */
const WING_JOINT = { shoulderOffset: 0.75, baseY: 0.15, innerLength: 2.5 }

/** 顏色的編號，要與片段著色器的判斷一致 */
const GOOSE_TONE = { body: 0, wing: 1, neck: 2, rump: 3 } as const

function createWingBoxList(side: number): VoxelBox[] {
  return [
    {
      min: [-1.25, WING_JOINT.baseY, 0],
      max: [1.25, WING_JOINT.baseY + 0.5, WING_JOINT.innerLength],
      part: VOXEL_WING_PART.innerWing,
      side,
      tone: GOOSE_TONE.wing,
    },
    {
      min: [-1.25, WING_JOINT.baseY, WING_JOINT.innerLength],
      max: [0.5, WING_JOINT.baseY + 0.5, WING_JOINT.innerLength + 3],
      part: VOXEL_WING_PART.outerWing,
      side,
      tone: GOOSE_TONE.wing,
    },
  ]
}

/** 一隻雁：身長約十格體素（頸伸得長長的），翼展約十二格半 */
export const GOOSE_BOX_LIST: VoxelBox[] = [
  { min: [-2.5, -0.75, -0.75], max: [2, 0.75, 0.75], part: VOXEL_WING_PART.body, side: 0, tone: GOOSE_TONE.body },
  { min: [2, -0.25, -0.4], max: [4.5, 0.4, 0.4], part: VOXEL_WING_PART.body, side: 0, tone: GOOSE_TONE.neck },
  { min: [4.5, -0.25, -0.5], max: [5.5, 0.65, 0.5], part: VOXEL_WING_PART.body, side: 0, tone: GOOSE_TONE.neck },
  { min: [5.5, -0.1, -0.25], max: [6.25, 0.3, 0.25], part: VOXEL_WING_PART.body, side: 0, tone: GOOSE_TONE.wing },
  { min: [-3.75, -0.3, -0.6], max: [-2.5, 0.4, 0.6], part: VOXEL_WING_PART.body, side: 0, tone: GOOSE_TONE.rump },
  ...createWingBoxList(1),
  ...createWingBoxList(-1),
]

/**
 * 每一隻在隊裡的位置：第零隻領頭，其餘一左一右往後排
 *
 * param：第幾隊、排在第幾排、在人字的哪一邊（領頭是零）、每隻自己的亂數
 */
export function createGooseInstanceList(): VoxelInstance[] {
  /** 航線中點：方位自北（−Z）往東量，與 realm-signature-direction 同一套 */
  const anchor: [number, number, number] = [
    AUTUMN_CENTER.x + Math.sin(AUTUMN_GEESE_ANCHOR.azimuth) * COURSE_DISTANCE,
    GROVE_GROUND_Y + COURSE_HEIGHT,
    AUTUMN_CENTER.z - Math.cos(AUTUMN_GEESE_ANCHOR.azimuth) * COURSE_DISTANCE,
  ]
  const instanceList: VoxelInstance[] = []
  for (let formation = 0; formation < FORMATION_COUNT; formation++) {
    for (let slot = 0; slot < BIRD_PER_FORMATION; slot++) {
      const rank = Math.ceil(slot / 2)
      const side = slot === 0 ? 0 : (slot % 2 === 0 ? -1 : 1)
      /** 黃金比例散開，相鄰兩隻的拍翅不會同步 */
      const seed = ((formation * BIRD_PER_FORMATION + slot) * 0.61803398875) % 1
      instanceList.push({ anchor, param: [formation, rank, side, seed] })
    }
  }
  return instanceList
}

/** 往外（離場景中心）與飛行的方向：往方位減少的那一邊飛，在西邊就是往南 */
const OUTWARD_X = Math.sin(AUTUMN_GEESE_ANCHOR.azimuth)
const OUTWARD_Z = -Math.cos(AUTUMN_GEESE_ANCHOR.azimuth)
const HEADING_X = -Math.cos(AUTUMN_GEESE_ANCHOR.azimuth)
const HEADING_Z = -Math.sin(AUTUMN_GEESE_ANCHOR.azimuth)

const GEESE_VERTEX = `
precision highp float;
/** 航線中點（世界座標），整群都一樣 */
attribute vec3 position;
/** 頂點在雁身上的位置（體素） */
attribute vec3 normal;
/** x 第幾隊、y 排在第幾排、z 在人字的哪一邊、w 每隻的亂數 */
attribute vec4 color;
/** x 部位、y 翅膀在哪一邊 */
attribute vec2 uv;
/** x 面的編號、y 顏色的編號 */
attribute vec2 uv2;
uniform mat4 viewProjection;
uniform float time;
uniform float formationCount;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;
varying float vFade;
${GLSL_NOISE}
${GLSL_VOXEL_FACE_NORMAL}
${createVoxelWingGlsl(WING_JOINT)}

const vec3 HEADING = vec3(${HEADING_X.toFixed(5)}, 0.0, ${HEADING_Z.toFixed(5)});
const vec3 OUTWARD = vec3(${OUTWARD_X.toFixed(5)}, 0.0, ${OUTWARD_Z.toFixed(5)});

void main() {
  float formation = color.x;
  float rank = color.y;
  float arm = color.z;

  /** 每一隊各自的週期，從航線的一端飛到另一端；隊與隊錯開距離與高度 */
  float period = 70.0 + formation * 17.0;
  float progress = fract(time / period + hash11(formation * 5.3));
  vec3 lead = position
    + HEADING * (progress - 0.5) * ${COURSE_LENGTH.toFixed(1)}
    + OUTWARD * (formation - 1.0) * ${FORMATION_DEPTH_GAP.toFixed(1)}
    + vec3(0.0, (formation - 1.0) * ${FORMATION_HEIGHT_GAP.toFixed(1)} + 5.0 * sin(progress * 6.2831853 + formation), 0.0);

  /** 人字：排在後面的往後退、往兩邊岔開；一臂略高一臂略低，每隻再各自上下浮一點 */
  vec3 center = lead
    - HEADING * rank * ${RANK_SPACING_ALONG.toFixed(1)}
    + OUTWARD * arm * rank * ${RANK_SPACING_ACROSS.toFixed(1)}
    + vec3(0.0, arm * rank * ${RANK_SPACING_UP.toFixed(1)} + 0.6 * sin(time * 0.7 + color.w * 6.2831853), 0.0);

  /** 拍翅：一路不停地拍，外節比內節晚一點跟上；每隻的相位錯開 */
  float beat = (time / ${FLAP_PERIOD_SECOND.toFixed(2)} + color.w) * 6.2831853;
  float innerAngle = 0.08 + 0.5 * sin(beat);
  float outerAngle = 0.42 * sin(beat - 0.9);

  vec3 local = normal;
  vec3 faceNormal = getVoxelFaceNormal(uv2.x);
  poseVoxelWing(local, faceNormal, uv.x, uv.y, innerAngle, outerAngle);

  /** 頭朝著飛的方向，背朝上 */
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = cross(HEADING, up);
  vec3 world = center + (HEADING * local.x + up * local.y + right * local.z) * ${GOOSE_VOXEL_SIZE.toFixed(2)};
  vNormal = HEADING * faceNormal.x + up * faceNormal.y + right * faceNormal.z;
  vWorld = world;
  vTone = uv2.y;

  /** 隊伍從一端的霧裡飛出來，到另一端再淡掉；畫質低時少一隊 */
  bool isVisible = formation < formationCount;
  vFade = isVisible ? smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.92, 1.0, progress)) : 0.0;
  gl_Position = isVisible ? viewProjection * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const GEESE_FRAGMENT = `
precision highp float;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;
varying float vFade;
${GLSL_VOXEL_LIGHT}

const vec3 BODY_COLOR = vec3(0.36, 0.3, 0.25);
const vec3 WING_COLOR = vec3(0.2, 0.17, 0.15);
const vec3 NECK_COLOR = vec3(0.07, 0.065, 0.06);
const vec3 RUMP_COLOR = vec3(0.66, 0.63, 0.57);

void main() {
  vec3 albedo = vTone < 0.5 ? BODY_COLOR : (vTone < 1.5 ? WING_COLOR : (vTone < 2.5 ? NECK_COLOR : RUMP_COLOR));
  vec3 color = shadeVoxel(albedo, normalize(vNormal));
  color = hazeVoxel(color, vWorld, ${HAZE_NEAR_DISTANCE.toFixed(1)}, ${HAZE_FAR_DISTANCE.toFixed(1)}, ${NEAR_HAZE.toFixed(2)}, ${FAR_HAZE.toFixed(2)});
  gl_FragColor = vec4(color, vFade * strength);
}
`

export function createAutumnGeese({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  return createVoxelPropLayer({
    scene,
    atmosphere,
    name: 'autumn-geese',
    shaderName: 'minespaceAutumnGeese',
    vertexSource: GEESE_VERTEX,
    fragmentSource: GEESE_FRAGMENT,
    uniformList: ['formationCount'],
    mesh: createVoxelFlockMesh(scene, 'autumn-geese', buildVoxelFlockGeometry(GOOSE_BOX_LIST, createGooseInstanceList())),
    fogHandling: '照離鏡頭的距離自己往地平線色混；透明度是 twilightRatio（晨昏乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡整群淡掉',
    update(frame, material) {
      /** 畫質低就少一隊 */
      material.setFloat('formationCount', frame.detailRatio < 0.5 ? FORMATION_COUNT - 1 : FORMATION_COUNT)
      return frame.twilightRatio * 0.95
    },
  })
}
