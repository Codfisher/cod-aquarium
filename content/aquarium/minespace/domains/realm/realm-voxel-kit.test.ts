import type { VoxelBox } from './realm-voxel-kit'
import { describe, expect, it } from 'vitest'
import { createGooseInstanceList, GOOSE_BOX_LIST } from './autumn/autumn-geese'
import { buildConeFaceList } from './jigoku/jigoku-far-cone'
import { FAR_CONE } from './jigoku/jigoku-layout'
import { buildVoxelFlockGeometry, countVoxelFace, measureVoxelBounds, VOXEL_FACE_LIST, VOXEL_WING_PART } from './realm-voxel-kit'
import {
  buildRingedMoonFaceList,
  createRingedMoonCellList,
  createRingedMoonFrame,
  MOON_BODY_RADIUS,
  MOON_KIND,
  MOON_RING_GAP_FROM,
  MOON_RING_GAP_TO,
  MOON_RING_INNER_RADIUS,
  MOON_RING_OUTER_RADIUS,
} from './ruins/ruins-ringed-moon-shape'
import { createStarlingInstanceList, STARLING_BOX_LIST } from './songbird/songbird-murmuration'
import { createLanternInstanceList, LANTERN_BOX_LIST } from './village/village-sky-lanterns'

/**
 * 體素風布景物的形體（純資料，不需要瀏覽器）
 *
 * 畫面要用眼睛看，這裡只守住形體的幾件事：頂點攤得對、左右對稱、三角形數在預算裡、
 * 環月的面照遠近排好而且沒有看不到的面、遠火山的每個面都是軸對齊的
 */

describe('把方盒清單攤成頂點', () => {
  const boxList: VoxelBox[] = [
    { min: [-1, -1, -1], max: [1, 1, 1], part: VOXEL_WING_PART.body, side: 0, tone: 0 },
    { min: [0, 0, 0], max: [1, 0.5, 2], part: VOXEL_WING_PART.innerWing, side: 1, tone: 1, faceIndexList: [2, 3] },
  ]
  const geometry = buildVoxelFlockGeometry(boxList, [
    { anchor: [10, 20, 30], param: [1, 2, 3, 4] },
    { anchor: [40, 50, 60], param: [5, 6, 7, 8] },
  ])

  it('每個面四個頂點、兩個三角形，只畫指定的面', () => {
    expect(countVoxelFace(boxList)).toBe(8)
    expect(geometry.positionList.length).toBe(2 * 8 * 4 * 3)
    expect(geometry.localList.length).toBe(geometry.positionList.length)
    expect(geometry.colorList.length).toBe(2 * 8 * 4 * 4)
    expect(geometry.uvList.length).toBe(2 * 8 * 4 * 2)
    expect(geometry.uv2List.length).toBe(2 * 8 * 4 * 2)
    expect(geometry.indexList.length).toBe(2 * 8 * 6)
    expect(Math.max(...geometry.indexList)).toBe(geometry.positionList.length / 3 - 1)
  })

  it('整隻的頂點都帶同一份錨點與參數', () => {
    const vertexPerInstance = 8 * 4
    expect(geometry.positionList.slice(0, 3)).toEqual([10, 20, 30])
    expect(geometry.positionList.slice((vertexPerInstance - 1) * 3, vertexPerInstance * 3)).toEqual([10, 20, 30])
    expect(geometry.positionList.slice(vertexPerInstance * 3, vertexPerInstance * 3 + 3)).toEqual([40, 50, 60])
    expect(geometry.colorList.slice(vertexPerInstance * 4, vertexPerInstance * 4 + 4)).toEqual([5, 6, 7, 8])
  })

  it('面上的四個頂點都落在那一面上，部位與顏色照方盒寫', () => {
    for (let face = 0; face < 8; face++) {
      const faceIndex = geometry.uv2List[face * 8]!
      const { axis, sign } = VOXEL_FACE_LIST[faceIndex]!
      const box = face < 6 ? boxList[0]! : boxList[1]!
      for (let corner = 0; corner < 4; corner++) {
        const vertex = face * 4 + corner
        expect(geometry.localList[vertex * 3 + axis]).toBe(sign > 0 ? box.max[axis] : box.min[axis])
        expect(geometry.uvList[vertex * 2]).toBe(box.part)
        expect(geometry.uv2List[vertex * 2 + 1]).toBe(box.tone)
      }
    }
  })
})

describe('各場景的體素布景', () => {
  const caseList = [
    { name: '金葉林的雁', boxList: GOOSE_BOX_LIST, instanceList: createGooseInstanceList(), triangleLimit: 3200 },
    { name: '百囀林苑的椋鳥', boxList: STARLING_BOX_LIST, instanceList: createStarlingInstanceList(), triangleLimit: 5000 },
    { name: '村落的天燈', boxList: LANTERN_BOX_LIST, instanceList: createLanternInstanceList(), triangleLimit: 1800 },
  ]

  for (const item of caseList) {
    it(`${item.name}：左右對稱、三角形數在預算裡`, () => {
      const bounds = measureVoxelBounds(item.boxList)
      /** 身體沿中線對稱；翅膀的第三軸是離翅根的距離，左右各一份 */
      const bodyBounds = measureVoxelBounds(item.boxList.filter((box) => box.side === 0))
      expect(bodyBounds.min[2]).toBeCloseTo(-bodyBounds.max[2])
      expect(item.boxList.filter((box) => box.side === 1).length).toBe(item.boxList.filter((box) => box.side === -1).length)
      expect(bounds.max[0]).toBeGreaterThan(bounds.min[0])

      const triangleCount = countVoxelFace(item.boxList) * 2 * item.instanceList.length
      expect(triangleCount).toBeLessThanOrEqual(item.triangleLimit)
      expect(buildVoxelFlockGeometry(item.boxList, item.instanceList).indexList.length).toBe(triangleCount * 3)
    })
  }

  it('雁排成人字：一隻領頭，其餘兩臂各四排', () => {
    const formation = createGooseInstanceList().filter((instance) => instance.param[0] === 0)
    expect(formation.length).toBe(9)
    expect(formation.filter((instance) => instance.param[2] === 0).length).toBe(1)
    expect(formation.filter((instance) => instance.param[2] === 1).map((instance) => instance.param[1])).toEqual([1, 2, 3, 4])
    expect(formation.filter((instance) => instance.param[2] === -1).map((instance) => instance.param[1])).toEqual([1, 2, 3, 4])
  })
})

describe('石殿遺址的環月', () => {
  const azimuth = 0.33
  const elevation = 0.56
  const forward = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)] as const
  const frame = createRingedMoonFrame(forward, 200, 16 / MOON_BODY_RADIUS)
  const cellList = createRingedMoonCellList()
  const faceList = buildRingedMoonFaceList(cellList, frame.eye)
  const dot = (first: readonly number[], second: readonly number[]): number => first[0]! * second[0]! + first[1]! * second[1]! + first[2]! * second[2]!

  it('三根軸互相垂直，視點在環面的上方、離月心兩百', () => {
    expect(dot(frame.xAxis, frame.xAxis)).toBeCloseTo(1)
    expect(dot(frame.yAxis, frame.yAxis)).toBeCloseTo(1)
    expect(dot(frame.zAxis, frame.zAxis)).toBeCloseTo(1)
    expect(dot(frame.xAxis, frame.yAxis)).toBeCloseTo(0)
    expect(dot(frame.yAxis, frame.zAxis)).toBeCloseTo(0)
    expect(dot(frame.xAxis, frame.zAxis)).toBeCloseTo(0)
    expect(frame.eye[1]).toBeGreaterThan(0)
    expect(Math.hypot(...frame.eye) * (16 / MOON_BODY_RADIUS)).toBeCloseTo(200)
  })

  it('球體在半徑以內、環在內外緣之間而且留著環縫', () => {
    const bodyList = cellList.filter((cell) => cell.kind === MOON_KIND.body)
    const ringList = cellList.filter((cell) => cell.kind === MOON_KIND.ring)
    expect(bodyList.length).toBeGreaterThan(2500)
    expect(ringList.length).toBeGreaterThan(600)
    for (const cell of bodyList) {
      expect(Math.hypot(cell.x, cell.y, cell.z)).toBeLessThanOrEqual(MOON_BODY_RADIUS)
    }
    for (const cell of ringList) {
      const radius = Math.hypot(cell.x, cell.z)
      expect(cell.y).toBe(0)
      expect(radius).toBeGreaterThanOrEqual(MOON_RING_INNER_RADIUS)
      expect(radius).toBeLessThanOrEqual(MOON_RING_OUTER_RADIUS)
      expect(radius < MOON_RING_GAP_FROM || radius > MOON_RING_GAP_TO).toBe(true)
    }
  })

  it('只留看得到的面：朝著視點、沒有被鄰格蓋住，總數在預算裡', () => {
    const solidSet = new Set(cellList.map((cell) => `${cell.x},${cell.y},${cell.z}`))
    expect(faceList.length * 2).toBeLessThanOrEqual(4200)
    expect(faceList.length).toBeGreaterThan(1000)
    for (const face of faceList) {
      const { cell, normal } = face
      expect(solidSet.has(`${cell.x + normal[0]},${cell.y + normal[1]},${cell.z + normal[2]}`)).toBe(false)
      const center = [0, 1, 2].map((axis) => (face.cornerList[0]![axis]! + face.cornerList[2]![axis]!) / 2)
      expect(dot(normal, [frame.eye[0] - center[0]!, frame.eye[1] - center[1]!, frame.eye[2] - center[2]!])).toBeGreaterThan(0)
    }
  })

  it('面照所屬的格子由遠到近排：照順序畫就是對的遮擋', () => {
    const measureDistance = (face: typeof faceList[number]): number =>
      Math.hypot(face.cell.x - frame.eye[0], face.cell.y - frame.eye[1], face.cell.z - frame.eye[2])
    for (let index = 1; index < faceList.length; index++) {
      expect(measureDistance(faceList[index]!)).toBeLessThanOrEqual(measureDistance(faceList[index - 1]!) + 1e-9)
    }
    /** 環的遠半邊排在球體前面畫（被球蓋住），近半邊排在球體後面畫（蓋住球） */
    const firstBodyIndex = faceList.findIndex((face) => face.cell.kind === MOON_KIND.body)
    const lastBodyIndex = faceList.findLastIndex((face) => face.cell.kind === MOON_KIND.body)
    expect(faceList.slice(0, firstBodyIndex).some((face) => face.cell.kind === MOON_KIND.ring)).toBe(true)
    expect(faceList.slice(lastBodyIndex + 1).some((face) => face.cell.kind === MOON_KIND.ring)).toBe(true)
  })
})

describe('湯煙谷的遠火山', () => {
  /** 與 jigoku-far-cone 同一個算法：火口中心相對錐心的位置 */
  const viewerOffset = { x: -Math.sin(FAR_CONE.azimuth) * FAR_CONE.distance, z: Math.cos(FAR_CONE.azimuth) * FAR_CONE.distance }
  const faceList = buildConeFaceList(Math.atan2(viewerOffset.z, viewerOffset.x), viewerOffset)

  it('每個面都是軸對齊的方格面，三角形數在預算裡', () => {
    expect(faceList.length * 2).toBeLessThanOrEqual(4200)
    expect(faceList.length).toBeGreaterThan(600)
    for (const face of faceList) {
      expect(Math.abs(face.normal[0]) + Math.abs(face.normal[1]) + Math.abs(face.normal[2])).toBe(1)
      const fixedAxis = face.normal.findIndex((value) => value !== 0)
      const fixedValue = face.cornerList[0]![fixedAxis]
      for (const corner of face.cornerList) {
        expect(corner[fixedAxis]).toBe(fixedValue)
        expect(corner[1]).toBeGreaterThanOrEqual(0)
        expect(corner[1]).toBeLessThanOrEqual(FAR_CONE.height)
      }
    }
  })

  it('背對火口的那一面不建，錐頂有發光的火口', () => {
    /** 火口在錐的南邊（+Z），朝北的側面永遠看不到 */
    expect(faceList.some((face) => face.normal[2] === -1)).toBe(false)
    expect(faceList.some((face) => face.normal[2] === 1)).toBe(true)
    const ventList = faceList.filter((face) => face.info[1] === 1)
    expect(ventList.length).toBeGreaterThan(0)
    for (const face of ventList) {
      expect(face.cornerList[0]![1]).toBe(FAR_CONE.height)
    }
  })

  it('山腰的熔岩從錐頂一路連到山腳，沒有從格子之間漏掉', () => {
    const tierHeight = 4
    for (let level = 0; level < FAR_CONE.height / tierHeight; level++) {
      const hasStream = faceList.some((face) => face.normal[1] === 0 && face.cornerList[0]![1] === level * tierHeight && face.surface[1] > 0.5)
      expect(hasStream, `第 ${level} 階`).toBe(true)
    }
  })
})
