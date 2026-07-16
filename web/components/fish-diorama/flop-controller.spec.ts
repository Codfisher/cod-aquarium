import { describe, expect, it } from 'vitest'
import { FlopController, resolvePointOutsideObstacles } from './flop-controller'

const FRAME_SECONDS = 1 / 60

/** 反覆 update 直到停止移動，回傳過程中所有姿態 */
function runUntilStopped(controller: FlopController, maxFrameCount = 3000) {
  const poseList = []
  for (let index = 0; index < maxFrameCount; index++) {
    const pose = controller.update(FRAME_SECONDS)
    poseList.push(pose)
    if (!pose.isMoving && !controller.isMoving) {
      break
    }
  }
  return poseList
}

describe('flopController', () => {
  it('未設定目標時維持 idle，位置不變', () => {
    const controller = new FlopController()
    controller.teleport({ x: 1, z: 2 }, 0.5)

    const pose = controller.update(FRAME_SECONDS)

    expect(pose.x).toBe(1)
    expect(pose.z).toBe(2)
    expect(pose.y).toBe(0)
    expect(pose.isMoving).toBe(false)
    expect(controller.isMoving).toBe(false)
  })

  it('設定目標後會逐跳抵達目標附近', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 3, z: 1.5 })

    const poseList = runUntilStopped(controller)
    const lastPose = poseList[poseList.length - 1]

    expect(controller.isMoving).toBe(false)
    const distance = Math.hypot(3 - lastPose!.x, 1.5 - lastPose!.z)
    expect(distance).toBeLessThanOrEqual(0.12 + 1e-6)
  })

  it('跳躍過程會離地，且最後回到地面', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 2, z: 0 })

    const poseList = runUntilStopped(controller)
    const maxHeight = Math.max(...poseList.map((pose) => pose.y))
    const lastPose = poseList[poseList.length - 1]

    expect(maxHeight).toBeGreaterThan(0.2)
    expect(lastPose!.y).toBe(0)
  })

  it('移動中改道會抵達新目標', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 4, z: 0 })

    // 先跳一小段
    for (let index = 0; index < 30; index++) {
      controller.update(FRAME_SECONDS)
    }

    controller.setTarget({ x: -2, z: 2 })
    const poseList = runUntilStopped(controller)
    const lastPose = poseList[poseList.length - 1]

    const distance = Math.hypot(-2 - lastPose!.x, 2 - lastPose!.z)
    expect(distance).toBeLessThanOrEqual(0.12 + 1e-6)
  })

  it('單跳落地後的轉向角不超過 maxTurnPerHop', () => {
    const maxTurnPerHop = Math.PI / 3
    const controller = new FlopController({ maxTurnPerHop })
    controller.teleport({ x: 0, z: 0 }, 0)
    // 目標在正後方（-z），需要轉 180 度
    controller.setTarget({ x: 0, z: -3 })

    const initialHeading = controller.getPose().heading

    // 跑到第一次落地，落地時朝向才轉到位
    let landedHeading = initialHeading
    for (let index = 0; index < 200; index++) {
      const pose = controller.update(FRAME_SECONDS)
      if (pose.hasLanded) {
        landedHeading = pose.heading
        break
      }
    }

    const turned = Math.abs(landedHeading - initialHeading)
    expect(turned).toBeLessThanOrEqual(maxTurnPerHop + 1e-6)
  })

  it('轉向為漸進過渡而非瞬間切換', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    // 目標在正側向（+x），desiredHeading 為 π/2
    controller.setTarget({ x: 3, z: 0 })

    const firstPose = controller.update(FRAME_SECONDS)
    expect(firstPose.isMoving).toBe(true)
    // 起跳初期還沒轉到位，heading 應明顯小於 π/2
    expect(firstPose.heading).toBeLessThan(Math.PI / 2 - 0.05)
    expect(firstPose.heading).toBeGreaterThanOrEqual(0)

    // 隨跳躍推進，heading 應持續往目標增加
    let laterHeading = firstPose.heading
    for (let index = 0; index < 8; index++) {
      laterHeading = controller.update(FRAME_SECONDS).heading
    }
    expect(laterHeading).toBeGreaterThan(firstPose.heading)
  })

  it('squash 全程維持在合理範圍', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 3, z: -2 })

    const poseList = runUntilStopped(controller)
    for (const pose of poseList) {
      expect(pose.squash).toBeGreaterThanOrEqual(0.8)
      expect(pose.squash).toBeLessThanOrEqual(1.2)
    }
  })

  it('跳躍時抬頭低頭順著拋物線，落地時俯仰歸零', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 3, z: 0 })

    const poseList = runUntilStopped(controller)

    // 上升段抬頭（正）、下落段低頭（負）
    const maxPitch = Math.max(...poseList.map((pose) => pose.pitch))
    const minPitch = Math.min(...poseList.map((pose) => pose.pitch))
    expect(maxPitch).toBeGreaterThan(0.1)
    expect(minPitch).toBeLessThan(-0.1)

    // 落地那幀俯仰接近 0，不會跳變
    for (const pose of poseList.filter((item) => item.hasLanded)) {
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(0.05)
    }
  })

  it('連續移動中兩跳之間（休息期）擺動相位仍持續推進，不會凍結', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 4, z: 0 })

    let previousPose = controller.update(FRAME_SECONDS)
    let restingFrameCount = 0
    for (let index = 0; index < 300; index++) {
      const pose = controller.update(FRAME_SECONDS)
      const isRestingBetweenHops = pose.isMoving && pose.y === 0 && previousPose.y === 0
      if (isRestingBetweenHops) {
        restingFrameCount += 1
        expect(pose.wavePhase).toBeGreaterThan(previousPose.wavePhase)
      }
      previousPose = pose
    }
    // 途中確實經過休息期
    expect(restingFrameCount).toBeGreaterThan(0)
  })

  it('每次落地會回報 hasLanded', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 2.5, z: 0 })

    const poseList = runUntilStopped(controller)
    const landedCount = poseList.filter((pose) => pose.hasLanded).length

    // 2.5 距離、每跳 0.9：至少 3 跳
    expect(landedCount).toBeGreaterThanOrEqual(3)
  })

  it('滑行模式全程貼地且能抵達', () => {
    const controller = new FlopController()
    controller.setSlideMode(true)
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 3, z: 2 })

    const poseList = runUntilStopped(controller)
    const lastPose = poseList[poseList.length - 1]

    for (const pose of poseList) {
      expect(pose.y).toBe(0)
      expect(pose.roll).toBe(0)
    }
    const distance = Math.hypot(3 - lastPose!.x, 2 - lastPose!.z)
    expect(distance).toBeLessThanOrEqual(0.12 + 1e-6)
  })

  it('teleport 會清除目標並停止移動', () => {
    const controller = new FlopController()
    controller.setTarget({ x: 5, z: 5 })
    controller.update(FRAME_SECONDS)

    controller.teleport({ x: 1, z: 1 })
    const pose = controller.update(FRAME_SECONDS)

    expect(controller.isMoving).toBe(false)
    expect(pose.x).toBe(1)
    expect(pose.z).toBe(1)
  })

  it('點擊過近（小於 minMoveDistance）時忽略，不會起跳', () => {
    const controller = new FlopController()
    controller.teleport({ x: 0, z: 0 }, 0)
    // 0.3 < 預設 minMoveDistance 0.5
    controller.setTarget({ x: 0.3, z: 0 })

    const pose = controller.update(FRAME_SECONDS)

    expect(controller.isMoving).toBe(false)
    expect(pose.isMoving).toBe(false)
    expect(pose.y).toBe(0)
  })

  it('resolvePointOutsideObstacles 把圈內的點推到邊界外', () => {
    const obstacleList = [{ x: 0, z: 0, radius: 1 }]

    const inside = resolvePointOutsideObstacles(0.2, 0, obstacleList)
    expect(Math.hypot(inside.x, inside.z)).toBeCloseTo(1, 5)

    // 圈外的點不動
    const outside = resolvePointOutsideObstacles(3, 0, obstacleList)
    expect(outside.x).toBe(3)
    expect(outside.z).toBe(0)
  })

  it('目標在障礙圓內（搆不到）時會停在附近，不會無限打轉', () => {
    const controller = new FlopController()
    const obstacle = { x: 3, z: 0, radius: 1 }
    controller.setObstacleList([obstacle])
    controller.teleport({ x: 0, z: 0 }, 0)
    // 目標在障礙圓正中心，永遠搆不到
    controller.setTarget({ x: 3, z: 0 })

    const poseList = runUntilStopped(controller)

    // 有限步數內停下（runUntilStopped 上限 3000 幀，卡住會跑滿）
    expect(controller.isMoving).toBe(false)
    expect(poseList.length).toBeLessThan(1500)

    // 跳躍過程仍有正常跳高（不是原地微跳）
    const maxHeight = Math.max(...poseList.map((pose) => pose.y))
    expect(maxHeight).toBeGreaterThan(0.3)
  })

  it('目標在障礙正後方時，魚會繞開且落點不踩進障礙', () => {
    const controller = new FlopController()
    const obstacle = { x: 0, z: 2, radius: 0.8 }
    controller.setObstacleList([obstacle])
    controller.teleport({ x: 0, z: 0 }, 0)
    controller.setTarget({ x: 0, z: 4 })

    const poseList = runUntilStopped(controller)
    const lastPose = poseList[poseList.length - 1]

    // 每次落地都在障礙圓外
    const landingClearanceList = poseList
      .filter((pose) => pose.hasLanded)
      .map((pose) => Math.hypot(pose.x - obstacle.x, pose.z - obstacle.z))
    expect(landingClearanceList.length).toBeGreaterThan(0)
    for (const clearance of landingClearanceList) {
      expect(clearance).toBeGreaterThanOrEqual(obstacle.radius - 1e-2)
    }

    // 仍抵達目標附近
    expect(controller.isMoving).toBe(false)
    const distanceToTarget = Math.hypot(0 - lastPose!.x, 4 - lastPose!.z)
    expect(distanceToTarget).toBeLessThanOrEqual(0.12 + 1e-6)
  })
})
