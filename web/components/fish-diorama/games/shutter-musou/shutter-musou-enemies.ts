/** 敵人視覺：直接重用鱈魚模型（`createCodModel`），不再另外畫五種怪物造型。
 *
 * 每種敵人只靠顏色與體型區分：雜兵是縮小版的鱈魚，頭目章魚是明顯更大一尾——
 * 「王則是更大的魚」，不需要另一套造型語彙，玩家一眼就認得出誰是頭目。
 *
 * 步態直接比照首頁主角魚（`FlopController`）：跳（拋物線）→ 貼地短停 → 再跳，
 * 不是連續滑行加一個裝飾性的上下晃動。身體扭動也交回 `codModel.update` 真的算
 * 波形，不用近似——效能代價是每隻活著的敵人每幀都要重寫一次魚身頂點，
 * 上看百隻同時在場會有感，先接受這個取捨，之後真的卡頓再考慮遠處降級。
 *
 * 材質仍走「同種共用」：`createCodModel` 每次呼叫都會建自己的材質，敵人數量
 * 上看百隻，材質依種類快取一份、眼睛全場共用一份，不會開出上百份材質。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { EnemyKind } from './shutter-musou-logic'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { COD_LYING_LIFT, createCodModel } from '../../cod-model'
import { easeOutCubic } from '../../shared/easing'
import { LOW_POLY_PALETTE } from '../../shared/low-poly-palette'
import { createSeedFrom } from '../../shared/mesh-detail'
import { createRandomGenerator, randomBetween } from '../../shared/random-generator'

/** 側躺角：與 game.ts 的玩家魚同一套慣例，讓背鰭朝鏡頭、單眼朝天 */
const LYING_ROLL = -Math.PI / 2

interface KindAppearance {
  bodyColorHex: string;
  finColorHex: string;
  /** 基準縮放。頭目明顯拉大一截，一眼看得出不是雜兵 */
  scale: number;
}

const KIND_APPEARANCE_MAP: Record<EnemyKind, KindAppearance> = {
  shrimp: { bodyColorHex: LOW_POLY_PALETTE.coral, finColorHex: LOW_POLY_PALETTE.coralDeep, scale: 0.32 },
  crab: { bodyColorHex: LOW_POLY_PALETTE.coralDeep, finColorHex: LOW_POLY_PALETTE.ink, scale: 0.38 },
  jelly: { bodyColorHex: LOW_POLY_PALETTE.waterLight, finColorHex: LOW_POLY_PALETTE.water, scale: 0.36 },
  starfish: { bodyColorHex: LOW_POLY_PALETTE.gold, finColorHex: LOW_POLY_PALETTE.goldDeep, scale: 0.4 },
  octopus: { bodyColorHex: LOW_POLY_PALETTE.ink, finColorHex: LOW_POLY_PALETTE.inkDeep, scale: 0.86 },
}

export interface EnemyView {
  root: TransformNode;
  /** 每幀的跳躍步態與身體扭動。跳躍的起訖點與計時都交給呼叫端（game.ts）
   * 決定——那裡才是位置模擬的權威來源，這裡只負責「照著給定的階段畫出來」
   */
  animate: (phase: 'hop' | 'rest', phaseProgress: number, deltaSeconds: number) => void;
  /** 被閃光掃到的過曝白化（0~1）。用 renderOverlay 做，不必為每隻另開材質 */
  setOverexposure: (ratio: number) => void;
  dispose: () => void;
}

interface KindMaterialSet {
  body: StandardMaterial;
  fin: StandardMaterial;
}
interface EyeMaterialSet {
  white: StandardMaterial;
  pupil: StandardMaterial;
  highlight: StandardMaterial;
}

/** 依種類共用一份身體／鰭材質 */
const kindMaterialCacheMap = new Map<string, KindMaterialSet>()
/** 眼睛材質全場共用一份，五種敵人的眼睛長得一樣，不需要分開 */
const eyeMaterialCacheMap = new Map<string, EyeMaterialSet>()

function getKindMaterialSet(scene: Scene, kind: EnemyKind): KindMaterialSet {
  const cacheKey = `${scene.uid}-${kind}`
  const cached = kindMaterialCacheMap.get(cacheKey)
  if (cached) {
    return cached
  }
  const appearance = KIND_APPEARANCE_MAP[kind]
  const body = new StandardMaterial(`shutterMusouEnemyBody-${kind}`, scene)
  body.diffuseColor = Color3.FromHexString(appearance.bodyColorHex)
  body.specularColor = Color3.Black()
  const fin = new StandardMaterial(`shutterMusouEnemyFin-${kind}`, scene)
  fin.diffuseColor = Color3.FromHexString(appearance.finColorHex)
  fin.specularColor = Color3.Black()
  fin.backFaceCulling = false
  const materialSet: KindMaterialSet = { body, fin }
  kindMaterialCacheMap.set(cacheKey, materialSet)
  return materialSet
}

function getEyeMaterialSet(scene: Scene): EyeMaterialSet {
  const cacheKey = scene.uid
  const cached = eyeMaterialCacheMap.get(cacheKey)
  if (cached) {
    return cached
  }
  const white = new StandardMaterial('shutterMusouEnemyEyeWhite', scene)
  white.diffuseColor = Color3.White()
  white.specularColor = Color3.Black()
  const pupil = new StandardMaterial('shutterMusouEnemyEyePupil', scene)
  pupil.diffuseColor = Color3.FromHexString('#1b2a33')
  pupil.specularColor = Color3.Black()
  const highlight = new StandardMaterial('shutterMusouEnemyEyeHighlight', scene)
  highlight.diffuseColor = Color3.White()
  highlight.emissiveColor = Color3.White()
  highlight.disableLighting = true
  const materialSet: EyeMaterialSet = { white, pupil, highlight }
  eyeMaterialCacheMap.set(cacheKey, materialSet)
  return materialSet
}

/** 場景銷毀時一併清掉該場景的共用材質快取 */
export function disposeEnemyMaterialCache(scene: Scene): void {
  for (const [cacheKey, materialSet] of kindMaterialCacheMap) {
    if (cacheKey.startsWith(`${scene.uid}-`)) {
      materialSet.body.dispose()
      materialSet.fin.dispose()
      kindMaterialCacheMap.delete(cacheKey)
    }
  }
  const eyeMaterialSet = eyeMaterialCacheMap.get(scene.uid)
  if (eyeMaterialSet) {
    eyeMaterialSet.white.dispose()
    eyeMaterialSet.pupil.dispose()
    eyeMaterialSet.highlight.dispose()
    eyeMaterialCacheMap.delete(scene.uid)
  }
}

/** 把重用鱈魚模型上「玩家專屬」的獨立材質，換成該種敵人的共用材質。
 * cod-model.ts 每次呼叫都會自建材質，材質名稱固定，靠名稱對應角色即可。
 *
 * 鰭材質（`codFinMaterial`）是背鰭／兩片胸鰭／尾鰭四片網格共用同一份實例——
 * 若邊換材質邊當場 dispose，處理到第一片鰭時就把材質丟了，Babylon 的
 * `Material.dispose` 會連帶把還沒輪到、材質相同的其他鰭也設成 null，
 * 那幾片鰭就會憑空消失。所以先把全部網格換完新材質，最後才統一丟棄舊材質
 */
function retintCodModel(meshList: Mesh[], kindMaterials: KindMaterialSet, eyeMaterials: EyeMaterialSet): void {
  const materialRoleMap: Record<string, StandardMaterial> = {
    codBodyMaterial: kindMaterials.body,
    codFinMaterial: kindMaterials.fin,
    codEyeWhiteMaterial: eyeMaterials.white,
    codPupilMaterial: eyeMaterials.pupil,
    codHighlightMaterial: eyeMaterials.highlight,
  }
  const originalMaterialSet = new Set<StandardMaterial>()
  for (const mesh of meshList) {
    const originalMaterial = mesh.material
    if (!originalMaterial) {
      continue
    }
    const replacement = materialRoleMap[originalMaterial.name]
    if (!replacement) {
      continue
    }
    originalMaterialSet.add(originalMaterial as StandardMaterial)
    mesh.material = replacement
  }
  for (const originalMaterial of originalMaterialSet) {
    originalMaterial.dispose()
  }
}

/** 建立一隻海怪：其實就是一尾重新配色配尺寸的鱈魚 */
export function createEnemyView(scene: Scene, kind: EnemyKind, instanceSeed: number): EnemyView {
  const random = createRandomGenerator(createSeedFrom(instanceSeed, 99))
  const appearance = KIND_APPEARANCE_MAP[kind]

  const codModel = createCodModel(scene)
  codModel.lieNode.rotation.z = LYING_ROLL
  retintCodModel(codModel.meshList, getKindMaterialSet(scene, kind), getEyeMaterialSet(scene))

  const root = new TransformNode(`shutterMusouEnemyRoot-${kind}-${instanceSeed}`, scene)
  codModel.rootNode.parent = root
  codModel.rootNode.name = `shutterMusouEnemy-${kind}-${instanceSeed}`
  for (const mesh of codModel.meshList) {
    mesh.isPickable = false
  }

  // 同種體型帶隨機量，同一批放在一起才顆顆不同
  const baseScale = appearance.scale * randomBetween(random, 0.92, 1.08)
  // 側躺後身體比躺平前占的垂直空間更高，跟玩家魚一樣要墊高才不會半個身子插進地板
  // （比照 game.ts 的 COD_LYING_LIFT * FISH_SCALE 用法，這裡改乘各自的縮放）
  const liftY = COD_LYING_LIFT * baseScale
  const hopHeight = randomBetween(random, 0.16, 0.24) * (kind === 'octopus' ? 1.3 : 1)
  // 身體扭動的甩尾圈數：跳得高的頭目甩多一點，才配得上体型
  const hopWaveCycles = kind === 'octopus' ? 1.4 : 1.1

  return {
    root,
    animate(phase, phaseProgress, deltaSeconds) {
      if (phase === 'hop') {
        // 拋物線拱形（跟 FlopController 同一條公式）：起跳落地都是 0、半途最高
        const hopArc = 4 * phaseProgress * (1 - phaseProgress)
        codModel.rootNode.position.y = liftY + hopHeight * hopArc
        // 側躺後 x/y/z 已經被 lieNode 的翻滾軸重新對應，用等比縮放做起跳的
        // 拉伸感才不會因為軸向搞混而拉錯方向
        codModel.rootNode.scaling.setAll(baseScale * (1 + hopArc * 0.1))
        // 身體扭動交回 cod-model 真正的魚身波形，跟跳躍進度同步甩尾
        codModel.update({
          deltaSeconds,
          isMoving: true,
          wavePhase: phaseProgress * Math.PI * 2 * hopWaveCycles,
          waveStrength: 1,
        })
      }
      else {
        // 貼地短停：落地擠壓快速回彈，尾巴殘留的擺動交給 cod-model 自己收斂
        const squashRecover = easeOutCubic(Math.min(1, phaseProgress / 0.4))
        codModel.rootNode.position.y = liftY
        codModel.rootNode.scaling.setAll(baseScale * (1 - (1 - squashRecover) * 0.1))
        codModel.update({ deltaSeconds, isMoving: false })
      }
    },
    setOverexposure(ratio) {
      const clamped = Math.min(1, Math.max(0, ratio))
      const shouldRender = clamped > 0.01
      for (const mesh of codModel.meshList) {
        mesh.renderOverlay = shouldRender
        mesh.overlayAlpha = clamped
      }
    },
    dispose() {
      // 級聯處理：rootNode 底下的樞紐節點與所有網格都會一併釋放，
      // 共用材質不受影響（Node.dispose 預設不連材質一起丟）
      root.dispose()
    },
  }
}
