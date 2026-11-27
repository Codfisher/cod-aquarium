import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Effect, Mesh, ShaderMaterial, VertexData } from '@babylonjs/core'
import { createSeededRandom } from '../../../utils/noise'
import { optOutOfFog } from '../../renderer/fog-opt-out'
import { RUINS_CENTER, RUINS_GROUND_Y, RUINS_RIM_HEIGHT } from './ruins-layout'

/**
 * 石殿遺址遠處的巨像與遺跡（渲染端，屬於世界層）
 *
 * 使用者要的：「遠處加上殘破、壯觀的雕像與遺跡，無法接近，只看的到」。
 * 世界只有四十格高、兩百八十格寬，四五十格高的巨像放不進方塊世界，
 * 而且人走不到、只遠遠看，做成方塊是白花幾萬個面。所以跟遠山一樣是布景：
 * 一個網格、一次繪製，由幾百個方盒拼成（看得出是一格一格堆起來的石頭，與方塊世界同一種語言），
 * 立在亂石坡外那片走不到的岩地上（世界外，地面是布景的岩地平面），
 * 亂石坡的坡頂擋住它們的下半截，只露出肩、斷臂與斷頸，像從霧裡浮出來。
 *
 * 不吃一般的距離霧，與山稜同一套做法：自己依遠近往地平線色混（越遠越淡，一層一層），
 * 腳下再多混一層霧，轉場時跟著灰罩化進霧色。顏色是石頭的灰、低處帶青苔，乘上此刻的天光。
 * 不投影：太遠了，影子落在走不到的地方
 *
 * 構圖：從回程門往北看，長廊兩排石柱正好夾住正北那尊無頭的坐像；
 * 東北一對持劍的守門巨像夾著一座塌了的門，西邊半埋著一顆巨大的頭，
 * 西南幾根倒下的巨柱，東邊一段斷了的水道橋，東南遠處山稜上一座塌了一角的階梯神殿
 */

/** 布景那一層（與 backdrop 的山稜同一層）：地形的深度已經寫好，被殿牆擋住的部分照樣不畫 */
const BACKDROP_RENDERING_GROUP = 1

/** 巨像腳下的高度：亂石坡外那片岩地平面（backdrop.floor）的頂面 */
const FOOT_Y = RUINS_GROUND_Y + RUINS_RIM_HEIGHT + 0.5

/**
 * 石頭與青苔的基準色（乘光之前）
 *
 * 給暗一點：遠看要讀得出剪影，石頭本色太亮的話，再混兩三成霧色就與天邊糊成一片
 */
const STONE_ALBEDO = new Color3(0.16, 0.155, 0.15)
const MOSS_ALBEDO = new Color3(0.08, 0.11, 0.055)

/** 與山稜同一組光的權重：天光是主體，直射光補一點 */
const AMBIENT_WEIGHT = 0.95
const SUN_WEIGHT = 0.32

/** 一個方盒（區域座標，含兩端的面）：x 往右、y 往上、z 往前（臉朝的方向） */
interface ColossusBox {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  /** 青苔的程度，零到一 */
  moss?: number;
  /** 額外的明暗倍率：眼窩、裂縫給暗一點 */
  shade?: number;
}

type BoxTuple = readonly [number, number, number, number, number, number]

function box(tuple: BoxTuple, moss = 0, shade = 1): ColossusBox {
  return { from: [tuple[0], tuple[1], tuple[2]], to: [tuple[3], tuple[4], tuple[5]], moss, shade }
}

/**
 * 無頭的坐像
 *
 * 坐在寶座上，雙手原本擱在膝上：右手還在，左臂從肘部斷掉、半截躺在台座前；
 * 頭整個沒了，只剩一截斷頸。台座一角崩落
 */
function createSeatedColossus(): ColossusBox[] {
  return [
    box([-15, -4, -13, 15, 6, 15], 0.4),
    box([-13, 6, -11, 13, 9, 13], 0.25),
    box([16, -4, 8, 21, 3, 14], 0.5),
    /** 寶座：座面與兩截高低不一的椅背 */
    box([-12, 9, -11, 12, 19, 3], 0.15),
    box([-12, 19, -11, -1, 42, -6], 0.1),
    box([-1, 19, -11, 12, 34, -6], 0.1),
    /** 腿 */
    box([-9, 19, -4, -1, 25, 12], 0.1),
    box([1, 19, -4, 9, 25, 12], 0.1),
    box([-9, 9, 7, -2, 19, 13], 0.3),
    box([2, 9, 7, 9, 19, 13], 0.3),
    box([-9, 9, 13, -2, 12, 17], 0.45),
    box([2, 9, 13, 9, 12, 17], 0.45),
    /** 身軀與肩 */
    box([-9, 24, -7, 9, 34, 3]),
    box([-8, 34, -6, 8, 45, 4]),
    box([-12, 41, -6, 12, 47, 3]),
    /** 右臂：擱在大腿上 */
    box([-15, 30, -5, -10, 46, 1]),
    box([-14, 25, -3, -8, 30, 10]),
    box([-13, 25, 9, -7, 28, 13], 0.1),
    /** 左臂從肘部斷掉，斷口參差 */
    box([10, 33, -5, 15, 46, 1]),
    box([11, 30, -4, 14, 33, 0], 0, 0.85),
    /** 斷頸 */
    box([-3, 47, -4, 3, 50, 2]),
    box([-2, 50, -3, 1, 51, 0], 0, 0.85),
    box([1, 50, -1, 2, 52, 1], 0, 0.85),
    /** 斷下來的前臂，躺在台座前 */
    box([14, -4, 17, 27, 2, 22], 0.55),
    box([24, -4, 15, 29, 3, 21], 0.5),
  ]
}

/**
 * 持劍的守門巨像
 *
 * 雙手交握在胸前、劍尖拄地。isBroken 的那一尊頭沒了、右臂只剩肩頭一截
 */
function createGuardian(isBroken: boolean): ColossusBox[] {
  const boxList = [
    box([-8, -4, -7, 8, 5, 7], 0.45),
    box([-6, 5, -3, -1, 24, 3], 0.25),
    box([1, 5, -3, 6, 24, 3], 0.25),
    box([-7, 14, -4, 7, 28, 4], 0.1),
    box([-7, 28, -4, 7, 44, 4]),
    box([-10, 40, -5, 10, 46, 4]),
    box([-11, 24, -3, -8, 44, 2]),
    /** 劍：交握的雙手、護手、劍柄、拄在台座上的劍身 */
    box([-3, 27, 4, 3, 31, 7]),
    box([-4, 31, 4, 4, 33, 7]),
    box([-1, 33, 5, 1, 37, 6]),
    box([-1, 5, 5, 1, 27, 6], 0.2),
  ]
  if (isBroken) {
    boxList.push(
      box([8, 38, -3, 11, 44, 2], 0, 0.9),
      box([-3, 46, -3, 3, 48, 3], 0, 0.9),
    )
    return boxList
  }
  boxList.push(
    box([8, 24, -3, 11, 44, 2]),
    box([-4, 46, -4, 4, 55, 4]),
    box([-1, 49, 4, 1, 52, 5]),
    box([-1, 55, -4, 1, 59, 3]),
  )
  return boxList
}

/** 一個沿 X 平移過的方盒清單（把幾件東西拼成一處遺跡） */
function shiftBoxList(boxList: ColossusBox[], offsetX: number, offsetZ = 0): ColossusBox[] {
  return boxList.map((item) => ({
    ...item,
    from: [item.from[0] + offsetX, item.from[1], item.from[2] + offsetZ],
    to: [item.to[0] + offsetX, item.to[1], item.to[2] + offsetZ],
  }))
}

/**
 * 守門巨像夾著的一座塌門
 *
 * 兩座方塔撐一道門楣，右塔塌了一截，門楣只剩左半，掉下來的那幾塊躺在門洞裡
 */
function createGuardianGate(): ColossusBox[] {
  return [
    box([-16, -4, -4, -9, 38, 4], 0.2),
    box([9, -4, -4, 16, 27, 4], 0.25),
    box([-16, 38, -5, 3, 43, 5], 0.1),
    box([4, -4, -6, 14, 1, 2], 0.5),
    box([-2, -4, 2, 6, 3, 8], 0.45),
    ...shiftBoxList(createGuardian(false), -29),
    ...shiftBoxList(createGuardian(true), 29),
  ]
}

/**
 * 半埋在土裡的巨大頭顱
 *
 * 下巴以下埋進岩地，頭冠斷了半邊；眼窩、嘴是貼在臉上的深色薄片
 */
function createFallenHead(): ColossusBox[] {
  return [
    box([-11, -8, -10, 11, 14, 10], 0.3),
    box([-10, 8, 10, 10, 10, 12], 0.15),
    box([-2, 1, 10, 2, 8, 14], 0.1),
    box([-8, 5, 10, -3, 8, 10.3], 0, 0.35),
    box([3, 5, 10, 8, 8, 10.3], 0, 0.35),
    box([-4, -2, 10, 4, 0, 10.3], 0, 0.45),
    box([-12, 2, -3, -11, 9, 2], 0.2),
    box([11, 2, -3, 12, 9, 2], 0.2),
    /** 頭冠：一圈石帶，右半邊斷了 */
    box([-11, 14, -10, 4, 17, 10], 0.2),
    box([-9, 17, -6, -1, 20, 6], 0.2),
  ]
}

/** 倒下的巨柱：兩根還站著（一根斷在半截、一根頂著殘樑），三截躺在地上 */
function createToppledColumns(): ColossusBox[] {
  return [
    box([-4, -4, -4, 4, 2, 4], 0.5),
    box([-3, 2, -3, 3, 14, 3], 0.35),
    box([-3, 14, -3, 3, 27, 3], 0.15),
    box([-2, 27, -2, 3, 31, 2], 0, 0.85),
    box([16, -4, -4, 24, 2, 4], 0.5),
    box([17, 2, -3, 23, 46, 3], 0.2),
    box([15, 46, -5, 25, 50, 5], 0.1),
    box([15, 50, -3, 33, 54, 3], 0.05),
    /** 躺著的那幾截：鼓節一節一節錯開 */
    box([-34, -4, 10, -22, 3, 17], 0.55),
    box([-21, -4, 11, -10, 3, 18], 0.5),
    box([-8, -4, 12, 3, 3, 19], 0.5),
    box([5, -4, 10, 11, 5, 20], 0.45),
    box([30, -4, -20, 37, 2, -6], 0.55),
    box([31, -4, -5, 38, 2, 7], 0.5),
  ]
}

/**
 * 斷了的水道橋
 *
 * 沿 X 一排橋墩，墩頂一條渠，墩與墩之間是一階一階收進去的拱；
 * 中間三跨塌了，那兩座墩也斷在半截
 */
function createAqueduct(): ColossusBox[] {
  const boxList: ColossusBox[] = []
  const PIER_SPACING = 14
  const PIER_COUNT = 11
  const DECK_Y = 30
  const brokenPierSet = new Set([5, 6])
  const brokenSpanSet = new Set([4, 5, 6])
  const startX = -((PIER_COUNT - 1) * PIER_SPACING) / 2

  for (let index = 0; index < PIER_COUNT; index++) {
    const pierX = startX + index * PIER_SPACING
    const pierTop = brokenPierSet.has(index) ? 10 + index * 2 : DECK_Y
    boxList.push(box([pierX - 2, -4, -2, pierX + 2, pierTop, 2], 0.35))
    if (index === PIER_COUNT - 1 || brokenSpanSet.has(index))
      continue
    boxList.push(
      box([pierX - 2, DECK_Y, -3, pierX + PIER_SPACING + 2, DECK_Y + 6, 3], 0.1),
      box([pierX + 2, DECK_Y - 4, -2, pierX + 4, DECK_Y, 2], 0.15),
      box([pierX + PIER_SPACING - 4, DECK_Y - 4, -2, pierX + PIER_SPACING - 2, DECK_Y, 2], 0.15),
      box([pierX + 4, DECK_Y - 2, -2, pierX + PIER_SPACING - 4, DECK_Y, 2], 0.15),
    )
  }
  /** 塌下來的渠與拱，一堆一堆躺在斷口底下 */
  boxList.push(
    box([-6, -4, -6, 8, 3, 5], 0.55),
    box([10, -4, -4, 20, 5, 6], 0.5),
  )
  return boxList
}

/**
 * 山稜上的階梯神殿
 *
 * 五層一層比一層小的石台，正面一道階梯直上頂上的小殿；
 * 右前那一角塌了，從第三層起缺一塊，碎石沿著坡堆下來
 */
function createZiggurat(): ColossusBox[] {
  const boxList: ColossusBox[] = []
  const halfList = [44, 36, 28, 20, 12]
  const TIER_HEIGHT = 12
  for (const [tier, half] of halfList.entries()) {
    const fromY = tier === 0 ? -4 : tier * TIER_HEIGHT
    const toY = (tier + 1) * TIER_HEIGHT
    const moss = tier < 2 ? 0.35 : 0.1
    if (tier < 2) {
      boxList.push(box([-half, fromY, -half, half, toY, half], moss))
      continue
    }
    /** 右前那一塊（+X、+Z）塌了 */
    boxList.push(
      box([-half, fromY, -half, half, toY, 0], moss),
      box([-half, fromY, 0, 0, toY, half], moss),
    )
  }
  boxList.push(
    /** 頂上的小殿，屋頂斷了半邊 */
    box([-7, 60, -7, 7, 68, 7]),
    box([-8, 68, -8, 1, 71, 8]),
    /** 正面的階梯：一道窄窄的石台一路往上 */
    box([-5, -4, 44, 5, 12, 50], 0.3),
    box([-5, 12, 36, 5, 24, 42], 0.2),
    box([-5, 24, 28, 5, 36, 34], 0.1),
    box([-5, 36, 20, 5, 48, 26]),
    /** 塌下來的碎石坡 */
    box([4, -4, 4, 40, 10, 40], 0.4),
    box([4, 10, 4, 26, 20, 26], 0.3),
  )
  return boxList
}

/** 一處遠景：放在哪、多大、方盒清單 */
interface ColossusSite {
  /** 從遺址中心看過去的方位（度，東為零、順時針，同 garden-layout 的 getRingPosition）與距離 */
  degree: number;
  distance: number;
  scale: number;
  /** 正面（區域 +Z）朝遺址中心；水道橋沿區域 X 排開，所以是長長的側面對著人 */
  boxList: ColossusBox[];
}

const SITE_LIST: ColossusSite[] = [
  /** 正北，長廊的軸線上：從回程門往北看，兩排石柱夾著它 */
  { degree: 270, distance: 190, scale: 1.6, boxList: createSeatedColossus() },
  { degree: 308, distance: 225, scale: 1.35, boxList: createGuardianGate() },
  { degree: 186, distance: 165, scale: 1.6, boxList: createFallenHead() },
  { degree: 140, distance: 185, scale: 1.3, boxList: createToppledColumns() },
  { degree: 14, distance: 205, scale: 1.2, boxList: createAqueduct() },
  { degree: 50, distance: 280, scale: 1.2, boxList: createZiggurat() },
]

/**
 * 一處遠景往地平線色混多少
 *
 * 越遠越淡，一層一層：最近的那顆頭還看得清臉，山稜上的神殿只剩一個淡淡的階梯剪影。
 * 亂石坡（八十多格）在場景的霧裡大約混了兩成，最近的巨像從這裡接下去
 */
function measureSiteHaze(distance: number): number {
  return Math.min(0.55, Math.max(0.1, 0.08 + (distance - 150) / 450))
}

/**
 * 每一面的明暗：頂面最亮，正面與背面次之，兩側更暗
 *
 * 沒有法線、不算光，用固定的面明暗讓方盒的體積讀得出來（與山稜每一段差一點明暗是同一個意思）
 */
const FACE_LIST = [
  { axis: 1, sign: 1, shade: 1 },
  { axis: 2, sign: 1, shade: 0.82 },
  { axis: 2, sign: -1, shade: 0.7 },
  { axis: 0, sign: 1, shade: 0.64 },
  { axis: 0, sign: -1, shade: 0.74 },
] as const

/** 把所有遠景拼成一個網格：位置、頂點色（明暗、混色、青苔、離地高度） */
function createColossusMesh(scene: Scene): Mesh {
  const positionList: number[] = []
  const colorList: number[] = []
  const indexList: number[] = []
  const random = createSeededRandom('ruins-colossi')

  for (const site of SITE_LIST) {
    const radian = (site.degree / 180) * Math.PI
    const siteX = RUINS_CENTER.x + Math.cos(radian) * site.distance
    const siteZ = RUINS_CENTER.z + Math.sin(radian) * site.distance
    /** 正面（區域 +Z）朝向遺址中心，右手（區域 +X）與它垂直 */
    const faceAngle = Math.atan2(RUINS_CENTER.z - siteZ, RUINS_CENTER.x - siteX)
    const frontX = Math.cos(faceAngle)
    const frontZ = Math.sin(faceAngle)
    const rightX = -frontZ
    const rightZ = frontX
    const haze = measureSiteHaze(site.distance)
    const siteTop = Math.max(...site.boxList.map((item) => item.to[1])) * site.scale

    const toWorld = (localX: number, localY: number, localZ: number): [number, number, number] => [
      siteX + (rightX * localX + frontX * localZ) * site.scale,
      FOOT_Y + localY * site.scale,
      siteZ + (rightZ * localX + frontZ * localZ) * site.scale,
    ]

    for (const item of site.boxList) {
      /** 每一塊石頭的明暗差一點點，風化得不均勻 */
      const weathering = (0.9 + random() * 0.16) * (item.shade ?? 1)
      for (const face of FACE_LIST) {
        /** 這一面上四個角的區域座標：固定軸取那一側，另外兩軸各取兩端 */
        const otherAxisList = [0, 1, 2].filter((axis) => axis !== face.axis) as [number, number]
        const fixed = face.sign > 0 ? item.to[face.axis]! : item.from[face.axis]!
        const cornerList: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
        const baseIndex = positionList.length / 3
        for (const [first, second] of cornerList) {
          const local = [0, 0, 0]
          local[face.axis] = fixed
          local[otherAxisList[0]] = first === 0 ? item.from[otherAxisList[0]]! : item.to[otherAxisList[0]]!
          local[otherAxisList[1]] = second === 0 ? item.from[otherAxisList[1]]! : item.to[otherAxisList[1]]!
          const world = toWorld(local[0]!, local[1]!, local[2]!)
          positionList.push(...world)
          const heightRatio = Math.max(0, Math.min(1, (world[1] - FOOT_Y) / Math.max(1, siteTop)))
          colorList.push(face.shade * weathering, haze, item.moss ?? 0, heightRatio)
        }
        indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
      }
    }
  }

  const mesh = new Mesh('ruins-colossi', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.colors = colorList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

const COLOSSUS_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec4 vInfo;

void main() {
  vInfo = color;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const COLOSSUS_FRAGMENT = `
precision highp float;
/** r 明暗、g 往地平線色混的基準、b 青苔、a 從腳（0）到頂（1） */
varying vec4 vInfo;

uniform vec3 stoneColor;
uniform vec3 mossColor;
uniform vec3 horizonColor;
uniform float veilRatio;

void main() {
  /** 腳下多混一層霧：巨像是從坡頂後面的霧裡站起來的，不是一張剪紙貼在坡頂上 */
  float footMist = (1.0 - smoothstep(0.0, 0.4, vInfo.a)) * 0.35;
  float haze = clamp(vInfo.g + (1.0 - vInfo.g) * footMist, 0.0, 1.0);
  haze = max(haze, veilRatio);
  vec3 rock = mix(stoneColor, mossColor, vInfo.b) * vInfo.r;
  gl_FragColor = vec4(mix(rock, horizonColor, haze), 1.0);
}
`

const COLOSSUS_SHADER_NAME = 'minespaceRuinsColossus'

export function createRuinsColossi({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  Effect.ShadersStore[`${COLOSSUS_SHADER_NAME}VertexShader`] = COLOSSUS_VERTEX
  Effect.ShadersStore[`${COLOSSUS_SHADER_NAME}FragmentShader`] = COLOSSUS_FRAGMENT

  const material = new ShaderMaterial('ruins-colossi', scene, COLOSSUS_SHADER_NAME, {
    attributes: ['position', 'color'],
    uniforms: ['viewProjection', 'stoneColor', 'mossColor', 'horizonColor', 'veilRatio'],
  })
  /** 方盒的繞向沒有整理過，兩面都畫；整組才兩千多個三角形 */
  material.backFaceCulling = false

  const mesh = createColossusMesh(scene)
  mesh.material = material
  mesh.isPickable = false
  mesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  /** 散在世界四周兩三百格外，包圍盒很大，不讓它被剔除的判斷來回切 */
  mesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(mesh, '只在石殿遺址出現，與山稜同一套：自己往地平線色混，轉場時由 veilRatio 化進霧色')

  const stoneColor = new Color3()
  const mossColor = new Color3()
  const observer = scene.onBeforeRenderObservable.add(() => {
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    const lightR = atmosphere.ambientSkyColor.r * ambient + atmosphere.lightColor.r * sun
    const lightG = atmosphere.ambientSkyColor.g * ambient + atmosphere.lightColor.g * sun
    const lightB = atmosphere.ambientSkyColor.b * ambient + atmosphere.lightColor.b * sun
    stoneColor.set(STONE_ALBEDO.r * lightR, STONE_ALBEDO.g * lightG, STONE_ALBEDO.b * lightB)
    mossColor.set(MOSS_ALBEDO.r * lightR, MOSS_ALBEDO.g * lightG, MOSS_ALBEDO.b * lightB)
    material.setColor3('stoneColor', stoneColor)
    material.setColor3('mossColor', mossColor)
    material.setColor3('horizonColor', atmosphere.fogColor)
    /** 與山稜同一個係數：轉場的霧還沒蓋滿之前，巨像就已經化進霧色 */
    material.setFloat('veilRatio', Math.min(1, atmosphere.edgeRatio * 1.6))
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose()
      material.dispose(false, true)
    },
  }
}
