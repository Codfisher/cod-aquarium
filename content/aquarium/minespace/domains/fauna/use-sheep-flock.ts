import type { DirectionalLight, Mesh, Scene, ShadowGenerator, StandardMaterial, UniversalCamera } from '@babylonjs/core'
import { MeshBuilder, TransformNode } from '@babylonjs/core'
import { onBeforeUnmount } from 'vue'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import { measureSection } from '../../composables/use-performance-probe'
import { createSeededRandom } from '../../utils/noise'
import { WOOL_TEXTURE } from '../block/block-constants'
import { PASTURE_CENTER, PASTURE_HALF_SIZE } from '../garden/garden-layout'
import { PLAYER_EYE_HEIGHT, PLAYER_WIDTH } from '../player/collision'
import { createPixelMaterial } from '../renderer/voxel-renderer'
import { getGroundY } from '../world/world-access'

/**
 * 羊隻數量
 *
 * 牧野只有十五格見方，柵欄裡的活動範圍更小。
 * 六隻擠在裡面會一直互相推擠，四隻剛好各自有地方吃草
 */
const SHEEP_COUNT = 4
/** 吃草停留時間範圍（秒） */
const GRAZE_RANGE_SECOND: [number, number] = [4, 12]
/** 轉身所需時間（秒） */
const TURN_SECOND = 0.9
/** 活動範圍，比柵欄再縮一點，免得卡在欄杆上 */
const ROAM_HALF_SIZE = PASTURE_HALF_SIZE - 2

/** 一隻羊佔的半徑，身體 0.7 寬、1 長，取個折衷值當作圓形碰撞 */
const SHEEP_RADIUS = 0.45
/** 玩家佔的半徑 */
const PLAYER_RADIUS = PLAYER_WIDTH / 2
/**
 * 每秒最多被推開多遠
 *
 * 不設上限的話，重疊多深就一次推多遠，
 * 剛生成時兩隻疊在一起會瞬間彈開。限速後就是慢慢擠出去
 */
const PUSH_SPEED = 1.6
/** 玩家推羊要更果斷一點，不然走進羊群像在推一堵牆 */
const PLAYER_PUSH_SPEED = 3.2
/** 腳底高度差超過這個值就當作不在同一層，例如站在乾草堆上 */
const PUSH_HEIGHT_TOLERANCE = 1.2

/** 羊的行為狀態 */
type SheepAction = 'graze' | 'turn' | 'walk'

interface SheepMaterialSet {
  wool: StandardMaterial;
  fleece: StandardMaterial;
  hoof: StandardMaterial;
  face: StandardMaterial;
  eye: StandardMaterial;
}

interface Sheep {
  root: TransformNode;
  /** 身體，走路時上下起伏 */
  body: TransformNode;
  head: TransformNode;
  tail: TransformNode;
  /** 四隻腳的樞紐，走路時前後擺動 */
  legPivotList: TransformNode[];
  action: SheepAction;
  /** 目前動作剩餘時間 */
  actionTimeLeft: number;
  targetX: number;
  targetZ: number;
  /** 轉身的起訖角度 */
  fromRotation: number;
  toRotation: number;
  /** 動畫相位 */
  phase: number;
  /** 每隻羊的步伐略有差異，看起來才不像複製貼上 */
  walkSpeed: number;
}

export interface StartSheepFlockParams {
  scene: Scene;
  worldState: Uint8Array;
  /** 玩家所在，走進羊群時要把羊擠開 */
  camera: UniversalCamera;
}

/**
 * 牧場羊群
 *
 * 只有羊叫聲卻看不到羊實在說不過去。
 * 用方盒拼出羊的形狀，在柵欄裡低頭吃草、轉身、慢慢走動。
 */
export function useSheepFlock() {
  let sheepList: Sheep[] = []
  let disposeList: (() => void)[] = []

  function start({ scene, worldState, camera }: StartSheepFlockParams): void {
    const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
    const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null
    const random = createSeededRandom('minespace-sheep')

    /** 羊毛顏色分三種，一群羊才不會像同一隻複製六份 */
    const materialSetList: SheepMaterialSet[] = [
      createMaterialSet(scene, 'white', WOOL_TEXTURE.white, WOOL_TEXTURE.white),
      createMaterialSet(scene, 'grey', WOOL_TEXTURE.grey, WOOL_TEXTURE.white),
      createMaterialSet(scene, 'brown', WOOL_TEXTURE.brown, WOOL_TEXTURE.white),
    ]

    for (let index = 0; index < SHEEP_COUNT; index++) {
      const materialSet = materialSetList[index % materialSetList.length]!
      const sheep = createSheep({ scene, index, materialSet, shadowGenerator })

      sheep.root.position.x = PASTURE_CENTER.x + (random() * 2 - 1) * ROAM_HALF_SIZE
      sheep.root.position.z = PASTURE_CENTER.z + (random() * 2 - 1) * ROAM_HALF_SIZE
      sheep.root.rotation.y = random() * Math.PI * 2
      sheep.actionTimeLeft = random() * 8
      sheep.phase = random() * Math.PI * 2
      sheep.walkSpeed = 0.55 + random() * 0.5

      sheepList.push(sheep)
    }

    const observer = scene.onBeforeRenderObservable.add(() => {
      measureSection('羊群', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        for (const sheep of sheepList) {
          updateSheep(sheep, deltaTime, random)
        }

        /**
         * 位移都算完了才處理推擠
         *
         * 各自走各自的難免走到同一格上，最後統一把重疊的推開，
         * 位置才不會這一隻剛閃開、下一隻又疊回去
         */
        pushSheepApart(sheepList, deltaTime)
        pushSheepFromPlayer(sheepList, camera, deltaTime)

        for (const sheep of sheepList) {
          keepInPasture(sheep)
          snapToGround(sheep, worldState)
        }
      })
    })

    disposeList.push(() => {
      scene.onBeforeRenderObservable.remove(observer)
      for (const sheep of sheepList) {
        sheep.root.dispose(false, true)
      }
      for (const materialSet of materialSetList) {
        materialSet.wool.dispose()
        materialSet.fleece.dispose()
        materialSet.hoof.dispose()
        materialSet.face.dispose()
        materialSet.eye.dispose()
      }
      sheepList = []
    })
  }

  onBeforeUnmount(() => {
    for (const dispose of disposeList) {
      dispose()
    }
    disposeList = []
  })

  return { start }
}

function createMaterialSet(
  scene: Scene,
  name: string,
  woolTexture: string,
  fleeceTexture: string,
): SheepMaterialSet {
  return {
    wool: createPixelMaterial(`sheep-${name}-wool`, woolTexture, scene),
    fleece: createPixelMaterial(`sheep-${name}-fleece`, fleeceTexture, scene, [1.08, 1.08, 1.08]),
    hoof: createPixelMaterial(`sheep-${name}-hoof`, WOOL_TEXTURE.darkGrey, scene),
    face: createPixelMaterial(`sheep-${name}-face`, WOOL_TEXTURE.pink, scene),
    eye: createPixelMaterial(`sheep-${name}-eye`, WOOL_TEXTURE.black, scene),
  }
}

interface CreateSheepParams {
  scene: Scene;
  index: number;
  materialSet: SheepMaterialSet;
  shadowGenerator: ShadowGenerator | null;
}

/**
 * 用方盒拼出一隻羊
 *
 * 分成身體、蓬鬆的羊毛、頭、口鼻、耳朵、尾巴與四隻腳，
 * 腳掛在樞紐上才能前後擺動
 */
function createSheep({ scene, index, materialSet, shadowGenerator }: CreateSheepParams): Sheep {
  const root = new TransformNode(`sheep-${index}`, scene)
  const partList: Mesh[] = []

  const body = new TransformNode(`sheep-${index}-body`, scene)
  body.position.y = 0.74
  body.parent = root

  const torso = MeshBuilder.CreateBox(`sheep-${index}-torso`, { width: 0.58, height: 0.6, depth: 1 }, scene)
  torso.material = materialSet.wool
  torso.parent = body
  partList.push(torso)

  /** 背上再疊一層蓬鬆的羊毛 */
  const fleece = MeshBuilder.CreateBox(`sheep-${index}-fleece`, { width: 0.7, height: 0.42, depth: 0.86 }, scene)
  fleece.material = materialSet.fleece
  fleece.position.set(0, 0.2, -0.05)
  fleece.parent = body
  partList.push(fleece)

  const head = new TransformNode(`sheep-${index}-head`, scene)
  head.position.set(0, 0.1, 0.5)
  head.parent = body

  const skull = MeshBuilder.CreateBox(`sheep-${index}-skull`, { width: 0.4, height: 0.4, depth: 0.4 }, scene)
  skull.material = materialSet.wool
  skull.position.z = 0.2
  skull.parent = head
  partList.push(skull)

  const muzzle = MeshBuilder.CreateBox(`sheep-${index}-muzzle`, { width: 0.24, height: 0.2, depth: 0.16 }, scene)
  muzzle.material = materialSet.face
  muzzle.position.set(0, -0.08, 0.46)
  muzzle.parent = head
  partList.push(muzzle)

  /**
   * 眼睛
   *
   * 頭骨的中心被推到 z = 0.2，前臉在 z = 0.4，
   * 擺在 0.21 等於整顆埋在頭裡面，什麼都看不到。
   * 要貼在前臉再往外凸一點點，高度也要避開下方的口鼻
   */
  for (const side of [-1, 1]) {
    const eye = MeshBuilder.CreateBox(`sheep-${index}-eye-${side}`, { width: 0.08, height: 0.08, depth: 0.05 }, scene)
    eye.material = materialSet.eye
    eye.position.set(side * 0.13, 0.08, 0.405)
    eye.parent = head
    partList.push(eye)
  }

  for (const side of [-1, 1]) {
    const ear = MeshBuilder.CreateBox(`sheep-${index}-ear-${side}`, { width: 0.16, height: 0.1, depth: 0.1 }, scene)
    ear.material = materialSet.hoof
    ear.position.set(side * 0.26, 0.1, 0.16)
    ear.rotation.z = side * 0.35
    ear.parent = head
    partList.push(ear)
  }

  const tail = new TransformNode(`sheep-${index}-tail`, scene)
  tail.position.set(0, 0.14, -0.5)
  tail.parent = body

  const tailMesh = MeshBuilder.CreateBox(`sheep-${index}-tail-mesh`, { width: 0.16, height: 0.24, depth: 0.12 }, scene)
  tailMesh.material = materialSet.fleece
  tailMesh.position.y = -0.1
  tailMesh.parent = tail
  partList.push(tailMesh)

  const legOffsetList = [
    { x: -0.19, z: 0.3 },
    { x: 0.19, z: 0.3 },
    { x: -0.19, z: -0.3 },
    { x: 0.19, z: -0.3 },
  ]
  const legPivotList = legOffsetList.map((offset, legIndex) => {
    const pivot = new TransformNode(`sheep-${index}-leg-pivot-${legIndex}`, scene)
    pivot.position.set(offset.x, 0.46, offset.z)
    pivot.parent = root

    const leg = MeshBuilder.CreateBox(`sheep-${index}-leg-${legIndex}`, { width: 0.16, height: 0.46, depth: 0.16 }, scene)
    leg.material = materialSet.hoof
    leg.position.y = -0.23
    leg.parent = pivot
    partList.push(leg)

    return pivot
  })

  if (shadowGenerator) {
    for (const part of partList) {
      shadowGenerator.addShadowCaster(part)
      part.receiveShadows = true
    }
  }

  return {
    root,
    body,
    head,
    tail,
    legPivotList,
    action: 'graze',
    actionTimeLeft: 0,
    targetX: 0,
    targetZ: 0,
    fromRotation: 0,
    toRotation: 0,
    phase: 0,
    walkSpeed: 0.7,
  }
}

/** 挑一個新的目標點，並轉身面向它 */
function pickTarget(sheep: Sheep, random: () => number): void {
  sheep.targetX = PASTURE_CENTER.x + (random() * 2 - 1) * ROAM_HALF_SIZE
  sheep.targetZ = PASTURE_CENTER.z + (random() * 2 - 1) * ROAM_HALF_SIZE

  sheep.fromRotation = sheep.root.rotation.y
  sheep.toRotation = Math.atan2(
    sheep.targetX - sheep.root.position.x,
    sheep.targetZ - sheep.root.position.z,
  )

  /** 走最短的那一邊轉，不要為了轉 10 度繞一大圈 */
  const difference = ((sheep.toRotation - sheep.fromRotation + Math.PI) % (Math.PI * 2)) - Math.PI
  sheep.toRotation = sheep.fromRotation + difference

  sheep.action = 'turn'
  sheep.actionTimeLeft = TURN_SECOND
}

/**
 * 羊互相推擠
 *
 * 沒有這一步，兩隻羊會直接穿過彼此再疊在一起走，
 * 遠看就是一隻長了八條腿的羊。
 * 兩兩檢查，重疊了就各退一半，力道由 PUSH_SPEED 限住，
 * 擠開的過程才是慢慢挪，不是彈開
 */
function pushSheepApart(sheepList: Sheep[], deltaTime: number): void {
  const minDistance = SHEEP_RADIUS * 2
  const maxPush = PUSH_SPEED * deltaTime

  for (let index = 0; index < sheepList.length; index++) {
    for (let otherIndex = index + 1; otherIndex < sheepList.length; otherIndex++) {
      const sheep = sheepList[index]!
      const other = sheepList[otherIndex]!

      const deltaX = other.root.position.x - sheep.root.position.x
      const deltaZ = other.root.position.z - sheep.root.position.z
      const distance = Math.hypot(deltaX, deltaZ)

      if (distance >= minDistance)
        continue

      /**
       * 正好完全重疊時沒有方向可以推
       *
       * 依編號給一個固定的角度岔開，兩隻才不會卡在同一點上發抖
       */
      const angle = distance > 0.0001
        ? Math.atan2(deltaX, deltaZ)
        : index * 2.4
      const directionX = distance > 0.0001 ? deltaX / distance : Math.sin(angle)
      const directionZ = distance > 0.0001 ? deltaZ / distance : Math.cos(angle)
      const push = Math.min((minDistance - distance) / 2, maxPush)

      sheep.root.position.x -= directionX * push
      sheep.root.position.z -= directionZ * push
      other.root.position.x += directionX * push
      other.root.position.z += directionZ * push
    }
  }
}

/**
 * 玩家把羊擠開
 *
 * 玩家的碰撞只認方塊，穿得過羊，
 * 走進羊群卻整群紋風不動看起來很假。
 * 這裡反過來讓羊自己讓開：玩家踩進羊的範圍，羊就往外側被推出去
 */
function pushSheepFromPlayer(sheepList: Sheep[], camera: UniversalCamera, deltaTime: number): void {
  const minDistance = SHEEP_RADIUS + PLAYER_RADIUS
  const maxPush = PLAYER_PUSH_SPEED * deltaTime

  /** 相機在眼睛的高度，要換算回腳底才好跟羊比 */
  const playerFootY = camera.position.y - PLAYER_EYE_HEIGHT

  for (const sheep of sheepList) {
    /** 站在高處或在羊底下的洞裡，就不該推得到羊 */
    if (Math.abs(playerFootY - sheep.root.position.y) > PUSH_HEIGHT_TOLERANCE)
      continue

    const deltaX = sheep.root.position.x - camera.position.x
    const deltaZ = sheep.root.position.z - camera.position.z
    const distance = Math.hypot(deltaX, deltaZ)

    if (distance >= minDistance)
      continue

    /** 玩家正好站在羊的正中心，往羊面對的方向推出去 */
    const directionX = distance > 0.0001 ? deltaX / distance : Math.sin(sheep.root.rotation.y)
    const directionZ = distance > 0.0001 ? deltaZ / distance : Math.cos(sheep.root.rotation.y)
    const push = Math.min(minDistance - distance, maxPush)

    sheep.root.position.x += directionX * push
    sheep.root.position.z += directionZ * push
  }
}

/** 推擠不能把羊推出柵欄，出界就壓回活動範圍 */
function keepInPasture(sheep: Sheep): void {
  const { position } = sheep.root

  position.x = clamp(position.x, PASTURE_CENTER.x - ROAM_HALF_SIZE, PASTURE_CENTER.x + ROAM_HALF_SIZE)
  position.z = clamp(position.z, PASTURE_CENTER.z - ROAM_HALF_SIZE, PASTURE_CENTER.z + ROAM_HALF_SIZE)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 貼齊腳下的地面，牧場整過地但邊緣仍可能有高低差 */
function snapToGround(sheep: Sheep, worldState: Uint8Array): void {
  sheep.root.position.y = getGroundY(
    worldState,
    Math.round(sheep.root.position.x),
    Math.round(sheep.root.position.z),
  ) - 0.5
}

/** 吃草 → 轉身 → 走動，走到了再回去吃草 */
function updateSheep(
  sheep: Sheep,
  deltaTime: number,
  random: () => number,
): void {
  sheep.phase += deltaTime

  /** 尾巴一直輕輕晃 */
  sheep.tail.rotation.x = Math.sin(sheep.phase * 3.1) * 0.22

  if (sheep.action === 'graze') {
    sheep.actionTimeLeft -= deltaTime

    /** 低頭吃草，偶爾抬頭張望 */
    const isLookingUp = Math.sin(sheep.phase * 0.7) > 0.85
    const targetPitch = isLookingUp ? 0 : 0.72 + Math.sin(sheep.phase * 2.4) * 0.1
    sheep.head.rotation.x += (targetPitch - sheep.head.rotation.x) * Math.min(1, deltaTime * 4)
    sheep.head.rotation.y = Math.sin(sheep.phase * 0.9) * 0.3

    for (const pivot of sheep.legPivotList) {
      pivot.rotation.x += (0 - pivot.rotation.x) * Math.min(1, deltaTime * 6)
    }
    sheep.body.position.y += (0.74 - sheep.body.position.y) * Math.min(1, deltaTime * 6)

    if (sheep.actionTimeLeft <= 0) {
      pickTarget(sheep, random)
    }
    return
  }

  if (sheep.action === 'turn') {
    sheep.actionTimeLeft -= deltaTime
    const progress = Math.min(1, 1 - sheep.actionTimeLeft / TURN_SECOND)
    const eased = progress * progress * (3 - 2 * progress)
    sheep.root.rotation.y = sheep.fromRotation + (sheep.toRotation - sheep.fromRotation) * eased

    /** 轉身時把頭抬起來 */
    sheep.head.rotation.x += (0.05 - sheep.head.rotation.x) * Math.min(1, deltaTime * 5)
    sheep.head.rotation.y = 0

    if (sheep.actionTimeLeft <= 0) {
      sheep.action = 'walk'
    }
    return
  }

  const deltaX = sheep.targetX - sheep.root.position.x
  const deltaZ = sheep.targetZ - sheep.root.position.z
  const distance = Math.hypot(deltaX, deltaZ)

  if (distance < 0.3) {
    const [min, max] = GRAZE_RANGE_SECOND
    sheep.action = 'graze'
    sheep.actionTimeLeft = min + random() * (max - min)
    return
  }

  const step = Math.min(distance, sheep.walkSpeed * deltaTime)
  sheep.root.position.x += (deltaX / distance) * step
  sheep.root.position.z += (deltaZ / distance) * step

  /** 四隻腳交錯擺動，身體跟著上下起伏 */
  const swing = sheep.phase * sheep.walkSpeed * 7
  for (const [index, pivot] of sheep.legPivotList.entries()) {
    const isDiagonal = index === 0 || index === 3
    pivot.rotation.x = Math.sin(swing + (isDiagonal ? 0 : Math.PI)) * 0.5
  }
  sheep.body.position.y = 0.74 + Math.abs(Math.sin(swing)) * 0.035
  sheep.head.rotation.x = 0.05 + Math.sin(swing * 0.5) * 0.06
  sheep.head.rotation.y = 0
}
