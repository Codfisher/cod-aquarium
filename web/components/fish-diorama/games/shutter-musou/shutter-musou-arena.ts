/** 擂台場景：一片浮空的圓形石台，海怪從外圈走進來。
 *
 * 依「場地留白優先」原則：不鋪水面、不畫遠景山稜，台面本身就是完整造型，
 * 背景交給 host 設定的 clearColorHex（柔和淺色調），視覺重心留給海怪與鱈魚。
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
import { LOW_POLY_PALETTE } from '../../shared/low-poly-palette'
import {
  createClusteredAngleList,
  createSeedFrom,
  finishLowPolyMesh,
} from '../../shared/mesh-detail'
import { createRandomGenerator, randomBetween } from '../../shared/random-generator'
import { ARENA_RADIUS, SPAWN_RING_RADIUS } from './shutter-musou-logic'

const DECK_EDGE = LOW_POLY_PALETTE.stoneDeep
const MARKER_BONE = LOW_POLY_PALETTE.bone

/** 台面高度。敵人走在地上、爬上台子，高低差要讀得出來 */
export const ARENA_TOP_Y = 0.42
/** 台面做成薄石板而不是高台：沒有水遮掩側壁，太厚側面反而顯得笨重 */
const DECK_THICKNESS = 0.18

export interface ArenaScene {
  root: TransformNode;
  /** 台面主體網格，供陰影投射登記。薄環與裝飾件依設計原則不投影 */
  shadowCasterList: Mesh[];
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

function createLowPolyMaterial(scene: Scene, name: string, hex: string): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = Color3.FromHexString(hex)
  material.specularColor = Color3.Black()
  material.maxSimultaneousLights = 6
  return material
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

  return {
    root,
    shadowCasterList,
    update() {
      // 拿掉水面後場上沒有需要逐幀更新的裝飾；保留空實作維持契約一致
    },
    dispose() {
      deckMaterial.dispose()
      rimMaterial.dispose()
      stoneMaterial.dispose()
      markerMaterial.dispose()
      root.dispose()
    },
  }
}
