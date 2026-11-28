import type { Scene, ShaderMaterial } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { SkyGradientParams } from '../../weather/sky-gradient'
import type { MoonFace, MoonFrame, MoonTriple } from './ruins-ringed-moon-shape'
import { Color3, Constants, Mesh, Vector3, VertexData } from '@babylonjs/core'
import { sampleSkyGradient } from '../../weather/sky-gradient'
import { RUINS_RINGED_MOON_ANCHOR } from '../realm-signature-direction'
import { createSignatureLayer, createSkyAnchorVector, SIGNATURE_SHELL_RADIUS, smoothRange } from '../realm-signature-kit'
import {
  buildRingedMoonFaceList,
  createRingedMoonCellList,
  createRingedMoonFrame,
  MOON_BODY_RADIUS,
  MOON_RING_GAP_FROM,
  MOON_RING_GAP_TO,
  MOON_RING_INNER_RADIUS,
  MOON_RING_OUTER_RADIUS,
} from './ruins-ringed-moon-shape'

/**
 * 石殿遺址天上的環月（渲染端，屬於世界層）
 *
 * 遺址的天上除了平常那顆月亮，還固定掛著另一顆帶環的大月亮：就在正北的坐像與東北的門闕之間，
 * 兩座巨像一左一右夾著它。那是造這些巨像的人膜拜的東西，所以整座石殿的長廊軸線都朝著它。
 *
 * 第一版是一張相加混合的方片，球與環在片段著色器裡用大像素畫。問題有三個
 * （使用者：「沒有空氣透視感，看起來很不自然」）：
 * - 相加混合等於一片發光的貼紙：暗面透出後面的星星，不像一顆實心的星體
 * - 整顆從上到下一樣亮、一樣銳利，看不出它隔著一整層大氣
 * - 球面的明暗是平滑算出來再壓成階，沒有體積
 *
 * 現在是一顆體素拼的實體（形體在 ruins-ringed-moon-shape.ts）：方塊堆的球、方塊排的環。
 * - 明暗：每一格體素先看它在球面上的位置落在晝半球還是夜半球（整格同一個值，晨昏線順著球面彎、邊緣是階梯），
 *   再照每個面自己的法線分亮暗；環的影子落在球上、球的影子落在環上，都是一格一格算
 * - 遮擋：月亮掛在天球上，永遠從同一個方向看，看得到的面在建網格時就由遠到近排好，照順序疊上去；
 *   不寫深度（寫了會擋掉比天球殼遠的山稜與巨像），自己的深度壓在遠平面上，任何實體都擋得住它
 * - 空氣透視：月亮在大氣後面。天空本來的顏色就是「視線上那一整段空氣的散射」，所以底色留給天空，
 *   月面的光只是乘上穿透率再加上去：白天天色亮、月面只剩淡淡一層白；越靠近地平線穿透率越低、顏色越偏霧色。
 *   入夜之後另外用此刻的天色把整顆的範圍蓋一次（預乘透明度），暗面才是一塊沒有星星的夜色
 *
 * 畫在預設那一層的半透明佇列：排在天空罩與星空之後，所以遠山、巨像、體積雲與陰天罩都蓋得住它。
 * 成本：一個網格約三千六百個三角形、一次繪製；打光全在頂點著色器（每個面四個頂點算出同一個顏色），片段只是輸出
 */

/** 一格體素在天球殼上多大：球體半徑約十六（張角直徑九度），與舊的方片同一個大小，神遊的鏡位不必改 */
const MOON_VOXEL_SIZE = 16 / MOON_BODY_RADIUS

/** 夜裡的峰值亮度，與月亮一樣壓在泛光門檻之下，方塊的硬邊才留得住 */
const MOON_PEAK = 0.82

/** 白天還留幾成：大白天的月亮是疊在藍天上的一層淡白，亮面看得出形狀、暗面與天色相同 */
const MOON_DAY_RATIO = 0.26

/** 暗面留一點點光（行星反照），夜裡才看得出那是一整顆球而不是缺了一塊 */
const MOON_SHADE_LIGHT = 0.035

const MOON_VERTEX = `
precision highp float;
/** 天球殼上的位置（相對鏡頭） */
attribute vec3 position;
/** 面的法線（月亮自己的軸） */
attribute vec3 normal;
/** rgb 這一格的底色、a 種類（零是球體、一是環） */
attribute vec4 color;
/** 這一格體素的中心 x、y（月亮自己的體素格） */
attribute vec2 uv;
/** x 是中心的 z、y 是這一格在天上的高度（方向的 y 分量） */
attribute vec2 uv2;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float strength;
uniform float coverRatio;
uniform vec3 sunLocal;
uniform vec3 skyLowColor;
uniform vec3 skyMiddleColor;
uniform vec3 skyHighColor;
uniform vec3 heightRange;
uniform vec3 hazeTint;
varying vec4 vColor;

const float BODY_RADIUS = ${MOON_BODY_RADIUS.toFixed(2)};
const float RING_INNER = ${MOON_RING_INNER_RADIUS.toFixed(2)};
const float RING_OUTER = ${MOON_RING_OUTER_RADIUS.toFixed(2)};
const float GAP_FROM = ${MOON_RING_GAP_FROM.toFixed(2)};
const float GAP_TO = ${MOON_RING_GAP_TO.toFixed(2)};

void main() {
  vec3 cell = vec3(uv, uv2.x);
  float light;
  if (color.a < 0.5) {
    /** 球體：這一格在晝半球還是夜半球，照它在球面上的位置算（整格同一個值），晨昏線才會順著球面彎 */
    float daylight = smoothstep(-0.1, 0.28, dot(normalize(cell), sunLocal));
    float faceFacing = max(dot(normal, sunLocal), 0.0);
    light = daylight * (0.62 + 0.38 * faceFacing);
    /** 環的影子落在球面上：從這一格朝太陽走，穿過環面的那一點在不在環上 */
    float travel = -cell.y / (abs(sunLocal.y) < 0.001 ? 0.001 : sunLocal.y);
    float crossing = length(cell.xz + sunLocal.xz * travel);
    float isOnRing = step(0.0, travel) * step(RING_INNER, crossing) * step(crossing, RING_OUTER)
      * (1.0 - step(GAP_FROM, crossing) * step(crossing, GAP_TO));
    light *= 1.0 - 0.5 * isOnRing;
  }
  else {
    /** 環是一粒一粒的冰與石，光穿得過去：太陽在環面的哪一側都亮，越斜越暗，留四成半的底 */
    light = 0.45 + 0.55 * abs(dot(normal, sunLocal));
    /** 球體的影子落在環上：這一格背著太陽、而且離「球心到太陽」那條線不到一個半徑 */
    float along = dot(cell, sunLocal);
    float away = dot(cell, cell) - along * along;
    light *= 1.0 - 0.88 * step(along, 0.0) * step(away, BODY_RADIUS * BODY_RADIUS);
  }

  /** 視線穿過多少空氣：越靠近地平線越多，月面的光被吃掉越多、顏色越偏霧色 */
  float height = uv2.y;
  float airPath = 1.0 - smoothstep(0.05, 0.8, height);
  vec3 lit = color.rgb * (light + ${MOON_SHADE_LIGHT.toFixed(3)});
  lit *= mix(vec3(1.0), hazeTint, 0.55 * airPath);
  float transmittance = strength * (1.0 - 0.5 * airPath);

  /** 這一格後面的天色：最低、中間、最高三個高度各取一次，中間線性接起來 */
  vec3 skyColor = height < heightRange.y
    ? mix(skyLowColor, skyMiddleColor, clamp((height - heightRange.x) / (heightRange.y - heightRange.x), 0.0, 1.0))
    : mix(skyMiddleColor, skyHighColor, clamp((height - heightRange.y) / (heightRange.z - heightRange.y), 0.0, 1.0));

  /** 預乘透明度：coverRatio 那一份把後面的星星蓋掉、換成天色，月面的光另外加上去 */
  vColor = vec4(skyColor * coverRatio + lit * transmittance, coverRatio);

  vec4 clip = viewProjection * world * vec4(position, 1.0);
  /** 深度壓在遠平面上：地形、山稜、巨像都在它前面 */
  gl_Position = vec4(clip.xy, clip.w, clip.w);
}
`

const MOON_FRAGMENT = `
precision highp float;
varying vec4 vColor;

void main() {
  gl_FragColor = vColor;
}
`

interface MoonMesh {
  mesh: Mesh;
  /** 整顆（含環）在天上佔的高度範圍：最低、中間、最高（方向的 y 分量） */
  heightRange: Vector3;
}

/** 把排好順序的面攤成頂點；索引照面的順序寫，畫的時候就是由遠到近 */
function createMoonMesh(scene: Scene, faceList: readonly MoonFace[], frame: MoonFrame, forward: MoonTriple): MoonMesh {
  const positionList: number[] = []
  const normalList: number[] = []
  const colorList: number[] = []
  const uvList: number[] = []
  const uv2List: number[] = []
  const indexList: number[] = []
  let lowest = 1
  let highest = -1

  /** 月亮自己的體素格換成天球殼上的位置（相對鏡頭） */
  const toShell = (point: MoonTriple): [number, number, number] => [
    forward[0] * SIGNATURE_SHELL_RADIUS + (frame.xAxis[0] * point[0] + frame.yAxis[0] * point[1] + frame.zAxis[0] * point[2]) * MOON_VOXEL_SIZE,
    forward[1] * SIGNATURE_SHELL_RADIUS + (frame.xAxis[1] * point[0] + frame.yAxis[1] * point[1] + frame.zAxis[1] * point[2]) * MOON_VOXEL_SIZE,
    forward[2] * SIGNATURE_SHELL_RADIUS + (frame.xAxis[2] * point[0] + frame.yAxis[2] * point[1] + frame.zAxis[2] * point[2]) * MOON_VOXEL_SIZE,
  ]

  for (const face of faceList) {
    const { cell } = face
    const center = toShell([cell.x, cell.y, cell.z])
    const height = center[1] / Math.hypot(center[0], center[1], center[2])
    lowest = Math.min(lowest, height)
    highest = Math.max(highest, height)

    const baseIndex = positionList.length / 3
    for (const corner of face.cornerList) {
      positionList.push(...toShell(corner))
      normalList.push(face.normal[0], face.normal[1], face.normal[2])
      colorList.push(cell.albedo[0], cell.albedo[1], cell.albedo[2], cell.kind)
      uvList.push(cell.x, cell.y)
      uv2List.push(cell.z, height)
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  const mesh = new Mesh('ruins-ringed-moon', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.colors = colorList
  vertexData.uvs = uvList
  vertexData.uvs2 = uv2List
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return { mesh, heightRange: new Vector3(lowest, (lowest + highest) / 2, highest) }
}

export function createRuinsRingedMoon({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const anchor = createSkyAnchorVector(RUINS_RINGED_MOON_ANCHOR)
  const forward: MoonTriple = [anchor.x, anchor.y, anchor.z]
  const moonFrame = createRingedMoonFrame(forward, SIGNATURE_SHELL_RADIUS, MOON_VOXEL_SIZE)
  const faceList = buildRingedMoonFaceList(createRingedMoonCellList(), moonFrame.eye)
  const { mesh, heightRange } = createMoonMesh(scene, faceList, moonFrame, forward)

  const xAxis = new Vector3(...moonFrame.xAxis)
  const yAxis = new Vector3(...moonFrame.yAxis)
  const zAxis = new Vector3(...moonFrame.zAxis)
  const sunLocal = new Vector3()
  const hazeTint = new Color3()

  /** 天色要取樣的三個方向：與月心同一個方位，高度是整顆的最低、中間、最高 */
  const horizontalLength = Math.hypot(anchor.x, anchor.z)
  const skyDirectionList = [heightRange.x, heightRange.y, heightRange.z].map((height) => {
    const planar = Math.sqrt(Math.max(0, 1 - height * height)) / horizontalLength
    return { x: anchor.x * planar, y: height, z: anchor.z * planar }
  })
  const skyColorList = [new Color3(), new Color3(), new Color3()]
  const skySample: [number, number, number] = [0, 0, 0]
  /** 與天空罩讀同一組顏色（見 use-day-night 的 applySkyGradient），算出來的才接得上後面那片天 */
  const skyParam: Required<SkyGradientParams> = {
    zenithColor: atmosphere.skyZenithColor,
    midColor: atmosphere.skyMidColor,
    horizonColor: atmosphere.fogColor,
    glowColor: atmosphere.skyGlowColor,
    counterColor: atmosphere.skyCounterColor,
    glowStrength: atmosphere.skyGlowStrength,
    sunDirection: atmosphere.sunDirection,
  }

  const layer = createSignatureLayer({
    scene,
    atmosphere,
    name: 'ruins-ringed-moon',
    shaderName: 'minespaceRuinsRingedMoon',
    vertexSource: MOON_VERTEX,
    fragmentSource: MOON_FRAGMENT,
    attributeList: ['normal', 'color', 'uv', 'uv2'],
    uniformList: ['coverRatio', 'sunLocal', 'skyLowColor', 'skyMiddleColor', 'skyHighColor', 'heightRange', 'hazeTint'],
    mesh,
    blend: 'alpha',
    space: 'sky',
    fogHandling: '亮度與遮蓋都乘 clearRatio（skyBodyFade 乘露天程度），下雨、霧幕與洞裡都跟日月一起淡出',
    update(frame, material) {
      /** 太陽在月亮自己的軸上的方向：晝夜半球與兩道影子都照它算，所以一夜之間盈虧會變 */
      sunLocal.set(
        Vector3.Dot(frame.sunDirection, xAxis),
        Vector3.Dot(frame.sunDirection, yAxis),
        Vector3.Dot(frame.sunDirection, zAxis),
      )
      material.setVector3('sunLocal', sunLocal)

      skyParam.glowStrength = atmosphere.skyGlowStrength
      for (const [index, direction] of skyDirectionList.entries()) {
        sampleSkyGradient(direction, skyParam, skySample)
        skyColorList[index]!.set(skySample[0], skySample[1], skySample[2])
      }
      material.setColor3('skyLowColor', skyColorList[0]!)
      material.setColor3('skyMiddleColor', skyColorList[1]!)
      material.setColor3('skyHighColor', skyColorList[2]!)
      material.setVector3('heightRange', heightRange)

      /** 霧色的色相（最亮的那一個通道拉到一）：月面的光穿過低空時往它偏 */
      const fogColor = atmosphere.fogColor
      const fogPeak = Math.max(fogColor.r, fogColor.g, fogColor.b, 0.001)
      hazeTint.set(fogColor.r / fogPeak, fogColor.g / fogPeak, fogColor.b / fogPeak)
      material.setColor3('hazeTint', hazeTint)

      /**
       * 蓋掉後面的星星：太陽快落到地平線時開始，星星亮起來之前（太陽在地平線下零點零二）就蓋滿。
       * 白天不蓋：底色直接用天空罩畫出來的那一片，暗面才會與天色分毫不差
       */
      material.setFloat('coverRatio', frame.clearRatio * smoothRange(-frame.sunHeight, -0.12, 0.02))
      return frame.clearRatio * (MOON_DAY_RATIO + (1 - MOON_DAY_RATIO) * frame.darkRatio) * MOON_PEAK
    },
  })

  /** 改成預乘透明度：遮蓋與加光要分開控制（見檔頭），一般混合做不到 */
  const material = mesh.material as ShaderMaterial
  material.alphaMode = Constants.ALPHA_PREMULTIPLIED
  /** 面在建網格時已經挑過（背面與被蓋住的都沒有），順序也排好了 */
  material.depthFunction = Constants.LEQUAL

  return layer
}
