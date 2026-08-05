/** 擂台場景：一片浮空的圓形石台，怪魚從外圈走進來。
 *
 * 依「場地留白優先」原則：不鋪水面、不畫遠景山稜，台面本身就是完整造型，
 * 背景交給 host 設定的 clearColorHex（柔和淺色調），視覺重心留給怪魚與鱈魚。
 *
 * 鏡頭固定俯視整座擂台不跟隨，因為這款要的是「看清楚四面八方有多少東西湧過來」，
 * 跟著角色跑反而會讓玩家失去對包圍圈的判斷。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { Mesh as MeshClass } from '@babylonjs/core/Meshes/mesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { createBeveledBox } from '../../geometry-utils'
import { sampleOrganicSway } from '../../shared/easing'
import { LOW_POLY_PALETTE } from '../../shared/low-poly-palette'
import {
  createClusteredAngleList,
  createSeedFrom,
  finishLowPolyMesh,
  roughenLowPolyMesh,
} from '../../shared/mesh-detail'
import { createRandomGenerator, randomBetween } from '../../shared/random-generator'
import { ARENA_RADIUS, SPAWN_RING_RADIUS } from './shutter-musou-logic'

const DECK_EDGE = LOW_POLY_PALETTE.stoneDeep
const MARKER_BONE = LOW_POLY_PALETTE.bone

/** 台面高度。敵人走在地上、爬上台子，高低差要讀得出來 */
export const ARENA_TOP_Y = 0.42
/** 台面做成薄石板而不是高台：沒有水遮掩側壁，太厚側面反而顯得笨重 */
const DECK_THICKNESS = 0.18

/** 台面上的一個俯視位置：水草的推倒來源（敵人）與避讓對象（石頭）都是這個形狀。
 * 只讀 x/z，敵人結構直接餵進來即可
 */
export interface ArenaSpot {
  x: number;
  z: number;
}

export interface ArenaScene {
  root: TransformNode;
  /** 台面主體網格，供陰影投射登記。薄環與裝飾件依設計原則不投影 */
  shadowCasterList: Mesh[];
  update: (deltaSeconds: number, pusherList: readonly ArenaSpot[]) => void;
  dispose: () => void;
}

/** 一株水草：搖擺與被推倒各自掛在不同節點上，風的微幅擺盪才不會覆蓋掉傾倒姿態 */
interface SeaweedPlant {
  /** 被敵人推倒的節點（樞紐在根部） */
  pushNode: TransformNode;
  /** 只吃風場微幅擺盪的節點 */
  swayNode: TransformNode;
  rootX: number;
  rootZ: number;
  swayPhase: number;
  swaySpeed: number;
  swayAmplitude: number;
  /** 所屬叢的陣風包絡：各叢錯開，不會整片同時強弱 */
  gustPhase: number;
  gustSpeed: number;
  /** 回彈彈簧積分用的角速度（rad/s） */
  angularVelocityX: number;
  angularVelocityZ: number;
}

/** 敵人推開水草的影響半徑與最大傾倒角。擂台沒有 Havok，走與箱庭同一套手動彈簧。
 * 傾角比箱庭（0.9）保守：箱庭的草陷進無邊的沙地看不出來，
 * 擂台卻是一塊 0.18 薄的浮空石板，倒過頭葉尖會直接穿到台子底下
 */
const SEAWEED_PUSH_RADIUS = 1.2
const SEAWEED_PUSH_ANGLE = 0.55
/** 回彈彈簧：阻尼低於臨界值（2√k ≈ 12.6）才會過衝擺盪，
 * 敵人跳開後約半秒挺回、末端輕輕晃兩下，不是瞬間歸位
 */
const SEAWEED_PUSH_SPRING_STIFFNESS = 40
const SEAWEED_PUSH_SPRING_DAMPING = 6.5

function createLowPolyMaterial(scene: Scene, name: string, hex: string): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = Color3.FromHexString(hex)
  material.specularColor = Color3.Black()
  material.maxSimultaneousLights = 6
  return material
}

/** 台面上的水草叢：與箱庭主場景（`tank-environment.ts`）同一株水草——
 * 兩節帶斜角的葉片、根部倒伏、頂端再往地面彎，尺寸也維持在箱庭那一級，
 * 擂台大歸大，草長成一人高只會搶走怪魚的視覺重量。
 *
 * 與箱庭的差別只有兩處：一是上下葉在建模時就併成單一網格（擂台沒有 Havok，
 * 關節本來就不會各自轉，多一個 mesh 只是多一次 draw call）；
 * 二是倒伏角收斂一些——這款是高俯角，全躺在地上的葉片被推開時幾乎看不出動作。
 */
function createSeaweed(
  scene: Scene,
  parent: TransformNode,
  isDark: boolean,
  random: () => number,
  avoidSpotList: readonly ArenaSpot[],
): { plantList: SeaweedPlant[]; materialList: StandardMaterial[] } {
  // 兩款葉色交錯即可：每株本身已有由根到梢的明暗漸層，材質再多分只是多佔材質數
  const bladeColorList = isDark
    ? [LOW_POLY_PALETTE.leafDeep, LOW_POLY_PALETTE.leaf]
    : [LOW_POLY_PALETTE.leaf, LOW_POLY_PALETTE.leafLight]
  const materialList = bladeColorList.map(
    (hex, index) => createLowPolyMaterial(scene, `shutterMusouSeaweed${index}`, hex),
  )

  // 十叢，全部貼著台緣一圈擺、與石頭錯開，中央大片仍留給戰鬥
  // （見 MODEL_GUIDELINES 的場地留白優先——留白靠的是中央淨空，不是總量少）。
  // 每叢株數不等、角度用不等分帶缺口，才不會讀成沿著圓周複製貼上
  const clusterBladeCountList = [4, 3, 2, 4, 3, 2, 3, 4, 2, 3]
  const clusterAngleList = createClusteredAngleList({
    seed: createSeedFrom(17, 41),
    count: clusterBladeCountList.length,
    unevenness: 0.7,
    gapRatio: 0.3,
  })

  const plantList: SeaweedPlant[] = []

  for (const [clusterIndex, baseAngle] of clusterAngleList.entries()) {
    // 每叢離台心的距離各異，五叢才不會排成一條同心圓
    const distance = ARENA_RADIUS * randomBetween(random, 0.55, 0.82)
    // 石頭與水草搶到同一個角度時把整叢沿著台緣挪開，免得草長在石頭裡
    let clusterAngle = baseAngle
    let clusterX = 0
    let clusterZ = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      clusterX = Math.cos(clusterAngle) * distance
      clusterZ = Math.sin(clusterAngle) * distance
      const isBlocked = avoidSpotList.some(
        (spot) => Math.hypot(spot.x - clusterX, spot.z - clusterZ) < 1.2,
      )
      if (!isBlocked) {
        break
      }
      clusterAngle += 0.45
    }

    const gustPhase = random() * Math.PI * 2
    const gustSpeed = 0.18 + random() * 0.16
    const bladeCount = clusterBladeCountList[clusterIndex]!

    for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex++) {
      const rootX = clusterX + randomBetween(random, -0.28, 0.28)
      const rootZ = clusterZ + randomBetween(random, -0.23, 0.23)
      const lowerHeight = randomBetween(random, 0.39, 0.58)
      const upperHeight = lowerHeight * randomBetween(random, 0.7, 0.9)
      const material = materialList[bladeIndex % materialList.length]!

      const anchorNode = new TransformNode(`shutterMusouSeaweedAnchor${clusterIndex}-${bladeIndex}`, scene)
      anchorNode.position.set(rootX, ARENA_TOP_Y, rootZ)
      anchorNode.parent = parent

      const pushNode = new TransformNode(`${anchorNode.name}-push`, scene)
      pushNode.parent = anchorNode

      // 倒伏姿態：這裡是乾掉的箱庭，水草沒有浮力撐著。角度比箱庭收斂——
      // 全躺在地上的葉片，在這款的高俯角下被推開時幾乎讀不出動作，
      // 且原本的傾角已經吃掉大半可倒的餘裕
      const baseNode = new TransformNode(`${anchorNode.name}-base`, scene)
      baseNode.rotation.set(randomBetween(random, 0.4, 0.65), random() * Math.PI * 2, 0)
      baseNode.parent = pushNode

      const swayNode = new TransformNode(`${anchorNode.name}-sway`, scene)
      swayNode.parent = baseNode

      const jointBend = randomBetween(random, 0.25, 0.45)
      const lowerBlade = createBeveledBox(
        `${anchorNode.name}-lower`,
        scene,
        { width: 0.1, height: lowerHeight, depth: 0.023, bevel: 0.006 },
        material,
      )
      lowerBlade.position.y = lowerHeight / 2

      // 上半葉的彎折在建模時就算進位置與角度（繞關節轉 jointBend），
      // 合併成一株之後不再需要關節節點
      const upperBlade = createBeveledBox(
        `${anchorNode.name}-upper`,
        scene,
        { width: 0.085, height: upperHeight, depth: 0.02, bevel: 0.005 },
        material,
      )
      upperBlade.rotation.x = jointBend
      upperBlade.position.set(
        0,
        lowerHeight + Math.cos(jointBend) * upperHeight / 2,
        Math.sin(jointBend) * upperHeight / 2,
      )

      const blade = MeshClass.MergeMeshes([lowerBlade, upperBlade], true, true)
      if (blade) {
        blade.material = material
        blade.isPickable = false
        blade.parent = swayNode
        // 葉面帶一點撕開的手感；抖動量壓在葉厚以下，否則薄片會抖成鋸齒。
        // 根部那一圈釘住，草才不會浮離台面
        roughenLowPolyMesh(blade, {
          seed: createSeedFrom(clusterIndex, bladeIndex, 51),
          amount: 0.015,
          axisScale: { z: 0.35 },
          flatBottomBelowY: 0.015,
        })
      }

      plantList.push({
        pushNode,
        swayNode,
        rootX,
        rootZ,
        swayPhase: random() * Math.PI * 2,
        swaySpeed: 0.5 + random() * 0.3,
        swayAmplitude: 0.03 + random() * 0.03,
        gustPhase,
        gustSpeed,
        angularVelocityX: 0,
        angularVelocityZ: 0,
      })
    }
  }

  return { plantList, materialList }
}

export function createArenaScene(scene: Scene, isDark: boolean): ArenaScene {
  const root = new TransformNode('shutterMusouArena', scene)
  const random = createRandomGenerator(20260805)
  const shadowCasterList: Mesh[] = []

  // --- 圓形台面：薄石板，亮部走冷灰石色（跟石頭裝飾同一色系），暗夜模式壓深一階 ---
  const deckMaterial = createLowPolyMaterial(
    scene,
    'shutterMusouDeck',
    isDark ? LOW_POLY_PALETTE.stone : LOW_POLY_PALETTE.stoneLight,
  )
  const deck = CreateCylinder('shutterMusouDeck', {
    diameter: ARENA_RADIUS * 2,
    height: DECK_THICKNESS,
    tessellation: 22,
  }, scene)
  deck.position.y = ARENA_TOP_Y - DECK_THICKNESS / 2
  deck.material = deckMaterial
  deck.parent = root
  deck.receiveShadows = true
  // 台面很大，抖動量相對尺寸要壓小，否則邊緣會碎得不像一塊完整的石台
  finishLowPolyMesh(deck, { seed: createSeedFrom(1, 11), amount: 0.07, axisScale: { y: 0.35 } })
  shadowCasterList.push(deck)

  // 台緣一圈深色收邊，俯視時邊界才清楚——玩家要一眼知道自己還有多少空間
  const rimMaterial = createLowPolyMaterial(scene, 'shutterMusouRim', DECK_EDGE)
  const rim = CreateTorus('shutterMusouRim', {
    diameter: ARENA_RADIUS * 2,
    thickness: 0.44,
    tessellation: 26,
  }, scene)
  rim.position.y = ARENA_TOP_Y - 0.06
  rim.scaling.y = 0.5
  rim.material = rimMaterial
  rim.parent = root
  rim.receiveShadows = true
  finishLowPolyMesh(rim, { seed: createSeedFrom(2, 12), amount: 0.085, axisScale: { y: 0.3 } })
  // 收邊只是貼著台面的薄環，依設計原則不進陰影投射

  // --- 台面幾顆簡單石頭：跟箱庭主場景（tank-environment.ts）同一種石頭語彙——
  // 多面體打散成嶙峋岩塊，數量壓在個位數、體積夠大算「焦點」，貼著台緣擺，
  // 中央大片留給戰鬥 ---
  const stoneMaterial = createLowPolyMaterial(scene, 'shutterMusouStone', LOW_POLY_PALETTE.stone)
  const stonePartList: Mesh[] = []
  const stoneAngleList = createClusteredAngleList({
    seed: createSeedFrom(9, 31),
    count: 4,
    unevenness: 0.6,
    gapRatio: 0.35,
  })
  const stoneSpotList: ArenaSpot[] = []
  for (const [stoneIndex, angle] of stoneAngleList.entries()) {
    const distance = ARENA_RADIUS * randomBetween(random, 0.6, 0.8)
    const size = randomBetween(random, 0.34, 0.52)
    const polyhedronType = [2, 3, 4][Math.floor(random() * 3)] ?? 2
    const stone = CreatePolyhedron(`shutterMusouStone${stoneIndex}`, { type: polyhedronType, size }, scene)
    stone.scaling.set(
      randomBetween(random, 0.85, 1.15),
      randomBetween(random, 0.6, 0.85),
      randomBetween(random, 0.85, 1.15),
    )
    stone.position.set(
      Math.cos(angle) * distance,
      ARENA_TOP_Y + size * stone.scaling.y * 0.35,
      Math.sin(angle) * distance,
    )
    stone.rotation.set(randomBetween(random, 0, 0.6), randomBetween(random, 0, Math.PI * 2), randomBetween(random, 0, 0.6))
    stone.parent = root
    stone.isPickable = false
    finishLowPolyMesh(stone, { seed: createSeedFrom(stoneIndex, 31), amount: size * 0.24 })
    stonePartList.push(stone)
    stoneSpotList.push({ x: stone.position.x, z: stone.position.z })
  }
  const mergedStone = MeshClass.MergeMeshes(stonePartList, true, true)
  if (mergedStone) {
    mergedStone.material = stoneMaterial
    mergedStone.parent = root
    mergedStone.isPickable = false
    mergedStone.receiveShadows = true
    shadowCasterList.push(mergedStone)
  }

  // --- 生成環的提示：一圈淡淡的標記，告訴玩家敵人會從哪裡上岸 ---
  const markerMaterial = createLowPolyMaterial(scene, 'shutterMusouMarker', MARKER_BONE)
  markerMaterial.alpha = 0.3
  markerMaterial.emissiveColor = Color3.FromHexString(MARKER_BONE).scale(0.25)
  const marker = CreateTorus('shutterMusouSpawnMarker', {
    diameter: SPAWN_RING_RADIUS * 2,
    thickness: 0.16,
    tessellation: 14,
  }, scene)
  marker.position.y = ARENA_TOP_Y
  marker.scaling.y = 0.2
  marker.material = markerMaterial
  marker.parent = root
  marker.isPickable = false
  // 提示環也要吃 low poly 面感，否則會是全場唯一一圈平滑幾何。
  // y 軸之後被壓扁成 0.2，抖動量先等比壓回才不會變成鋸齒
  finishLowPolyMesh(marker, { seed: createSeedFrom(3, 14), amount: 0.05, axisScale: { y: 0.2 } })

  // --- 水草：與箱庭同一株，會被路過的敵人魚撥開 ---
  const seaweed = createSeaweed(scene, root, isDark, random, stoneSpotList)
  // 葉片是薄件，依設計原則不進陰影投射

  let elapsedSeconds = 0

  /** 風場微幅擺盪＋敵人推倒的回彈彈簧。積分步長切上限，
   * 分頁切回來的大 delta 不會把彈簧炸開
   */
  function updateSeaweed(deltaSeconds: number, pusherList: readonly ArenaSpot[]): void {
    const springStep = Math.min(deltaSeconds, 1 / 60)
    for (const plant of seaweed.plantList) {
      // 陣風包絡以叢為單位各自起伏：這叢被掃到時鄰叢可能正靜著
      const gustEnvelope = 0.35
        + 0.65 * Math.max(0, sampleOrganicSway(elapsedSeconds * plant.gustSpeed, plant.gustPhase))
      const windAngle = Math.sin(elapsedSeconds * 1.15 - plant.rootX * 0.45) * 0.06 * gustEnvelope
      plant.swayNode.rotation.z
        = sampleOrganicSway(elapsedSeconds * plant.swaySpeed, plant.swayPhase) * plant.swayAmplitude
          + windAngle
      plant.swayNode.rotation.x
        = sampleOrganicSway(elapsedSeconds * plant.swaySpeed * 0.8, plant.swayPhase + 2.6)
          * plant.swayAmplitude * 0.6

      // 附近每一隻敵人都往遠離自己的方向推一份
      let targetRotationX = 0
      let targetRotationZ = 0
      for (const pusher of pusherList) {
        const dx = plant.rootX - pusher.x
        const dz = plant.rootZ - pusher.z
        // 先用軸距篩掉遠處的敵人：場上同時可能有數十隻，開根號要留給真的靠近的那幾隻
        if (Math.abs(dx) > SEAWEED_PUSH_RADIUS || Math.abs(dz) > SEAWEED_PUSH_RADIUS) {
          continue
        }
        const distance = Math.hypot(dx, dz)
        if (distance >= SEAWEED_PUSH_RADIUS) {
          continue
        }
        const strength = (1 - distance / SEAWEED_PUSH_RADIUS) * SEAWEED_PUSH_ANGLE
        const inverse = 1 / (distance || 1)
        targetRotationX += dz * inverse * strength
        targetRotationZ += -dx * inverse * strength
      }
      // 一群魚同時擠過來時傾角會疊加，總量夾住才不會把葉片折進台面
      const targetAngle = Math.hypot(targetRotationX, targetRotationZ)
      if (targetAngle > SEAWEED_PUSH_ANGLE) {
        const clampScale = SEAWEED_PUSH_ANGLE / targetAngle
        targetRotationX *= clampScale
        targetRotationZ *= clampScale
      }

      const accelerationX = (targetRotationX - plant.pushNode.rotation.x) * SEAWEED_PUSH_SPRING_STIFFNESS
        - plant.angularVelocityX * SEAWEED_PUSH_SPRING_DAMPING
      const accelerationZ = (targetRotationZ - plant.pushNode.rotation.z) * SEAWEED_PUSH_SPRING_STIFFNESS
        - plant.angularVelocityZ * SEAWEED_PUSH_SPRING_DAMPING
      plant.angularVelocityX += accelerationX * springStep
      plant.angularVelocityZ += accelerationZ * springStep
      plant.pushNode.rotation.x += plant.angularVelocityX * springStep
      plant.pushNode.rotation.z += plant.angularVelocityZ * springStep
    }
  }

  return {
    root,
    shadowCasterList,
    update(deltaSeconds, pusherList) {
      // 打擊停頓時 host 餵零時距，水草跟著全場一起定格
      elapsedSeconds += deltaSeconds
      updateSeaweed(deltaSeconds, pusherList)
    },
    dispose() {
      deckMaterial.dispose()
      rimMaterial.dispose()
      stoneMaterial.dispose()
      markerMaterial.dispose()
      for (const material of seaweed.materialList) {
        material.dispose()
      }
      root.dispose()
    },
  }
}
