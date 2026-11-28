import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { VoxelBox, VoxelInstance } from '../realm-voxel-kit'
import { createSeededRandom } from '../../../utils/noise'
import { SONGBIRD_MURMURATION_ANCHOR } from '../realm-signature-direction'
import {
  buildVoxelFlockGeometry,
  createVoxelFlockMesh,
  createVoxelPropLayer,
  createVoxelWingGlsl,
  GLSL_VOXEL_FACE_NORMAL,
  GLSL_VOXEL_LIGHT,
  VOXEL_WING_PART,
} from '../realm-voxel-kit'
import { SONGBIRD_CENTER, SONGBIRD_GROUND_Y } from './songbird-layout'

/**
 * 百囀林苑晨昏的椋鳥群舞（渲染端，屬於世界層）
 *
 * 白天滿園子的鳥各唱各的，到了黃昏牠們聚成一大群，在北邊的樹冠上空像一團煙一樣翻捲、拉長、對折再散開。
 *
 * 第一版是掛在天球上的兩百四十個小方點：每一點一樣大、一樣黑，整群是一片平的圖案，看不出它有厚度。
 * 現在每一隻是體素拼的小鳥（一塊身體、左右各一片翅），整群真的在世界座標上的一團空間裡飛：
 * - 群有前後的厚度：近的那幾隻大一點、深一點，遠的小而淡（照離鏡頭的實際距離往地平線色混），
 *   一團煙翻過來的時候看得出哪一面朝著人
 * - 每一隻頭朝著自己飛的方向（拿前後兩個時刻的位置相減），翅膀一路快拍
 * - 每個面吃與山稜同一組光：整群轉向時，朝著夕陽的那一面一起亮起來，這正是椋鳥群舞好看的地方
 *
 * 群的中心緩緩遊走，每一隻在一個會伸縮扭轉的橢球裡繞，再疊一道從群頭傳到群尾的波——
 * 全在頂點著色器裡算，CPU 一隻都不追蹤。
 *
 * 只在晨昏出現（twilightRatio）：太陽升高或天黑之後淡出，下雨或陰天罩蓋上來時一起收。
 * 成本：兩百四十隻、每隻二十個三角形（翅膀只畫上下兩面），一個網格四千八百個三角形、一次繪製（效能檔減到約九十隻）
 */

const BIRD_COUNT = 240

/** 椋鳥的一格體素在世界裡多大（格）：翼展約兩格半，離人一百多格，一隻約十來個畫面像素寬 */
const STARLING_VOXEL_SIZE = 0.6

/** 群的家離場景中心多遠（格）；高度照招牌景象那個仰角算，神遊的鏡頭才對得上 */
const HOME_DISTANCE = 170
const HOME_HEIGHT = Math.tan(SONGBIRD_MURMURATION_ANCHOR.elevation) * HOME_DISTANCE

/** 鳥最低飛到離地多高：樹冠在十幾格，不讓牠們鑽進林子裡 */
const FLOOR_HEIGHT = 20

/** 每一隻離群心最遠多少（格），橢球再照時間拉長壓扁 */
const SWARM_REACH = 30

/** 往地平線色混多少：離鏡頭這麼近以內最深、這麼遠以外最淡 */
const HAZE_NEAR_DISTANCE = 100
const HAZE_FAR_DISTANCE = 290
const NEAR_HAZE = 0.08
const FAR_HAZE = 0.5

/** 翅膀的關節（體素）：翅根貼著身體側面，只有一節 */
const WING_JOINT = { shoulderOffset: 0.4, baseY: 0.1, innerLength: 1.7 }

/** 顏色的編號，要與片段著色器的判斷一致 */
const STARLING_TONE = { body: 0, wing: 1 } as const

/** 翅膀薄得只剩上下兩面看得到，側邊不畫（面的編號見 VOXEL_FACE_LIST） */
const WING_FACE_INDEX_LIST = [2, 3] as const

function createWingBox(side: number): VoxelBox {
  return {
    min: [-0.7, WING_JOINT.baseY, 0],
    max: [0.5, WING_JOINT.baseY + 0.25, WING_JOINT.innerLength],
    part: VOXEL_WING_PART.innerWing,
    side,
    tone: STARLING_TONE.wing,
    faceIndexList: WING_FACE_INDEX_LIST,
  }
}

/** 一隻椋鳥：身長兩格多，翼展約四格 */
export const STARLING_BOX_LIST: VoxelBox[] = [
  { min: [-1.2, -0.4, -0.4], max: [1.1, 0.4, 0.4], part: VOXEL_WING_PART.body, side: 0, tone: STARLING_TONE.body },
  createWingBox(1),
  createWingBox(-1),
]

/** param：第幾隻（畫質低時只畫前面幾隻）與三個亂數（繞圈的相位、速度、離群心多遠） */
export function createStarlingInstanceList(): VoxelInstance[] {
  /** 群的家：方位自北（−Z）往東量，與 realm-signature-direction 同一套 */
  const anchor: [number, number, number] = [
    SONGBIRD_CENTER.x + Math.sin(SONGBIRD_MURMURATION_ANCHOR.azimuth) * HOME_DISTANCE,
    SONGBIRD_GROUND_Y + HOME_HEIGHT,
    SONGBIRD_CENTER.z - Math.cos(SONGBIRD_MURMURATION_ANCHOR.azimuth) * HOME_DISTANCE,
  ]
  const random = createSeededRandom('songbird-murmuration')
  const instanceList: VoxelInstance[] = []
  for (let index = 0; index < BIRD_COUNT; index++) {
    instanceList.push({ anchor, param: [index, random(), random(), random()] })
  }
  return instanceList
}

/** 往外（離場景中心）與橫向（群主要沿著它拉長、遊走） */
const OUTWARD_X = Math.sin(SONGBIRD_MURMURATION_ANCHOR.azimuth)
const OUTWARD_Z = -Math.cos(SONGBIRD_MURMURATION_ANCHOR.azimuth)
const ALONG_X = Math.cos(SONGBIRD_MURMURATION_ANCHOR.azimuth)
const ALONG_Z = Math.sin(SONGBIRD_MURMURATION_ANCHOR.azimuth)

const MURMURATION_VERTEX = `
precision highp float;
/** 群的家（世界座標），整群都一樣 */
attribute vec3 position;
/** 頂點在鳥身上的位置（體素） */
attribute vec3 normal;
/** x 第幾隻、yzw 三個亂數 */
attribute vec4 color;
/** x 部位、y 翅膀在哪一邊 */
attribute vec2 uv;
/** x 面的編號、y 顏色的編號 */
attribute vec2 uv2;
uniform mat4 viewProjection;
uniform float time;
uniform float birdCount;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;
${GLSL_VOXEL_FACE_NORMAL}
${createVoxelWingGlsl(WING_JOINT)}

const vec3 ALONG = vec3(${ALONG_X.toFixed(5)}, 0.0, ${ALONG_Z.toFixed(5)});
const vec3 OUTWARD = vec3(${OUTWARD_X.toFixed(5)}, 0.0, ${OUTWARD_Z.toFixed(5)});

/** 這一隻在某個時刻的位置：算兩次相減就是牠飛的方向 */
vec3 locateStarling(float moment, vec3 home, vec3 seed) {
  /** 整群的中心在一塊天空裡慢慢遊走 */
  float wanderAlong = 58.0 * sin(moment * 0.11) + 20.0 * sin(moment * 0.29 + 1.3);
  float wanderHeight = 15.0 * sin(moment * 0.17 + 0.7) + 7.0 * sin(moment * 0.41);
  float wanderDepth = 26.0 * sin(moment * 0.07 + 2.0);

  /** 每一隻在橢球裡繞自己的圈；橢球一下拉長、一下壓扁，群的形狀就一直在變 */
  float stretch = 1.5 + 0.7 * sin(moment * 0.19);
  float squash = 0.55 + 0.25 * cos(moment * 0.23 + 1.0);
  float orbit = seed.x * 6.2831853 + moment * (0.25 + seed.y * 0.35);
  float reach = sqrt(seed.z) * ${SWARM_REACH.toFixed(1)};
  float offsetAlong = cos(orbit) * reach * stretch;
  float offsetHeight = sin(orbit * 1.3 + seed.y * 4.0) * reach * squash;
  float offsetDepth = sin(orbit * 0.8 + seed.x * 9.0) * reach * 0.9;

  /** 一道從群頭傳到群尾的波，加上整群的扭轉：翻捲的感覺從這兩項來 */
  offsetHeight += 8.0 * sin(offsetAlong * 0.063 - moment * 1.3) * (0.6 + 0.4 * sin(moment * 0.31));
  offsetHeight += offsetAlong * 0.35 * sin(moment * 0.13);
  offsetDepth += offsetAlong * 0.3 * cos(moment * 0.09 + 0.5);

  vec3 point = home + ALONG * (wanderAlong + offsetAlong) + OUTWARD * (wanderDepth + offsetDepth);
  point.y = max(home.y + wanderHeight + offsetHeight, ${(SONGBIRD_GROUND_Y + FLOOR_HEIGHT).toFixed(1)});
  return point;
}

void main() {
  vec3 center = locateStarling(time, position, color.yzw);
  vec3 ahead = locateStarling(time + 0.3, position, color.yzw);

  /** 頭朝著飛的方向；前後兩點幾乎重合（剛好在折返）時給一個固定的方向 */
  vec3 travel = ahead - center;
  vec3 forward = length(travel) > 0.001 ? normalize(travel) : ALONG;
  vec3 sideways = cross(forward, vec3(0.0, 1.0, 0.0));
  vec3 right = length(sideways) > 0.001 ? normalize(sideways) : OUTWARD;
  vec3 up = cross(right, forward);

  /** 翅膀一路快拍，每隻的相位錯開 */
  float wingAngle = 0.15 + 0.8 * sin(time * 15.0 + color.y * 40.0);

  vec3 local = normal;
  vec3 faceNormal = getVoxelFaceNormal(uv2.x);
  poseVoxelWing(local, faceNormal, uv.x, uv.y, wingAngle, 0.0);

  vec3 world = center + (forward * local.x + up * local.y + right * local.z) * ${STARLING_VOXEL_SIZE.toFixed(2)};
  vNormal = forward * faceNormal.x + up * faceNormal.y + right * faceNormal.z;
  vWorld = world;
  vTone = uv2.y;
  gl_Position = color.x < birdCount ? viewProjection * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const MURMURATION_FRAGMENT = `
precision highp float;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;
${GLSL_VOXEL_LIGHT}

/** 椋鳥是帶金屬光的黑褐；翅膀再深一點 */
const vec3 BODY_COLOR = vec3(0.11, 0.1, 0.105);
const vec3 WING_COLOR = vec3(0.07, 0.062, 0.068);

void main() {
  vec3 albedo = vTone < 0.5 ? BODY_COLOR : WING_COLOR;
  vec3 color = shadeVoxel(albedo, normalize(vNormal));
  color = hazeVoxel(color, vWorld, ${HAZE_NEAR_DISTANCE.toFixed(1)}, ${HAZE_FAR_DISTANCE.toFixed(1)}, ${NEAR_HAZE.toFixed(2)}, ${FAR_HAZE.toFixed(2)});
  gl_FragColor = vec4(color, strength);
}
`

export function createSongbirdMurmuration({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  return createVoxelPropLayer({
    scene,
    atmosphere,
    name: 'songbird-murmuration',
    shaderName: 'minespaceSongbirdMurmuration',
    vertexSource: MURMURATION_VERTEX,
    fragmentSource: MURMURATION_FRAGMENT,
    uniformList: ['birdCount'],
    mesh: createVoxelFlockMesh(scene, 'songbird-murmuration', buildVoxelFlockGeometry(STARLING_BOX_LIST, createStarlingInstanceList())),
    fogHandling: '照離鏡頭的距離自己往地平線色混；透明度是 twilightRatio（晨昏乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡整群淡掉',
    update(frame, material) {
      material.setFloat('birdCount', Math.round(BIRD_COUNT * frame.detailRatio))
      return frame.twilightRatio * 0.92
    },
  })
}
