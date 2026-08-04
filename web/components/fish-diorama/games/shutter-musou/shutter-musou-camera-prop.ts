/** 鱈魚手上的相機道具：直接重用箱庭主場景的復古相機模型與快門閃光動畫，
 * 不再另畫一台——同一台相機，玩家才認得出鱈魚手上拿的是什麼。
 *
 * 掛點選在 fishRoot（不是側躺的 lieNode）：魚沒有手，相機用「浮在臉前」的
 * 卡通手法表示拿著；掛在側躺節點上會被側躺翻滾牽動角度，看起來像插歪了。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import { TransformNode as TransformNodeClass } from '@babylonjs/core/Meshes/transformNode'
import { computeDecayingWobble, computePressPulse, sampleOrganicSway } from '../../shared/easing'
import { buildCamera } from '../../tank-environment'

/** 主場景相機是照著較大的魚缸與魚（FISH_SCALE 0.8）畫的；這裡的魚縮得更小、
 * 鏡頭也拉得更遠，整台相機等比縮小，比例才跟魚身相襯
 */
const PROP_SCALE = 0.62

/** 快門閃光動畫的時間常數，比照 tank-environment.ts 的 updateShowcase 相機分支：
 * 前段快壓快門鈕、閃光快速亮起後衰減
 */
const SHUTTER_PRESS_SECONDS = 0.3
const FLASH_RISE_SECONDS = 0.12
const FLASH_FALL_SECONDS = 0.57
/** 果凍彈跳：按下快門時整台先被壓扁再彈回，來回幾次才停。
 * 比後座位移更讀得出「這一下有出力」，而且不會把相機推出畫面
 */
const JELLY_SECONDS = 0.46
const JELLY_AMOUNT = 0.22
const ANIMATION_SECONDS = Math.max(SHUTTER_PRESS_SECONDS, FLASH_FALL_SECONDS, JELLY_SECONDS)

export interface CameraProp {
  node: TransformNode;
  /** 全部網格，供加入陰影投射清單 */
  meshList: Mesh[];
  /** 每幀待機晃動；蓄力時整台略略抬高湊近，像正要按下快門的預備動作 */
  animate: (elapsedSeconds: number, isCharging: boolean) => void;
  /** 每幀推進開火後的快門鈕按壓與閃光衰減 */
  update: (deltaSeconds: number) => void;
  /** 按下快門瞬間觸發：快門鈕壓一下＋鏡片白閃 */
  triggerFlash: () => void;
  dispose: () => void;
}

export function createCameraProp(scene: Scene, parent: TransformNode): CameraProp {
  const camera = buildCamera(scene)
  // 鏡頭原本朝 -z 展示給觀眾看，掛到魚身上要轉回 +z 才會朝著鱈魚瞄準的方向
  camera.root.rotation.y = Math.PI

  const node = new TransformNodeClass('shutterMusouCameraPropRoot', scene)
  node.parent = parent
  node.scaling.setAll(PROP_SCALE)
  const baseY = 0.06
  node.position.set(0, baseY, 0.58)
  camera.root.parent = node
  camera.root.position.set(0, 0, 0)

  const flashBaseEmissiveColor = camera.flashMaterial.emissiveColor.clone()
  const shutterBaseY = camera.shutterButton.position.y
  // 從「已跑完」的狀態起始，觸發前不佔用每幀更新
  let flashElapsed = ANIMATION_SECONDS

  return {
    node,
    meshList: camera.meshList,
    animate(elapsedSeconds, isCharging) {
      // 待機輕晃；蓄力時整台略略抬高湊近，像正要按下快門的預備動作
      const sway = sampleOrganicSway(elapsedSeconds * 3.4, 1.7)
      node.rotation.z = sway * 0.05
      node.position.y = baseY + sway * 0.012 + (isCharging ? 0.03 : 0)
    },
    update(deltaSeconds) {
      if (flashElapsed >= ANIMATION_SECONDS) {
        return
      }
      flashElapsed += deltaSeconds

      // 快門鈕：前段快壓慢回的按壓脈衝
      const pressRatio = Math.min(1, flashElapsed / SHUTTER_PRESS_SECONDS)
      camera.shutterButton.position.y = shutterBaseY - computePressPulse(pressRatio) * 0.025

      // 鏡片閃光：快速亮起後衰減，與 tank-environment.ts 的展示動畫同一條曲線
      const flashIntensity = flashElapsed < FLASH_RISE_SECONDS
        ? flashElapsed / FLASH_RISE_SECONDS
        : Math.max(0, 1 - (flashElapsed - FLASH_RISE_SECONDS) / (FLASH_FALL_SECONDS - FLASH_RISE_SECONDS))
      const flashBoost = flashIntensity * 0.85
      camera.flashMaterial.emissiveColor.set(
        Math.min(1, flashBaseEmissiveColor.r + flashBoost),
        Math.min(1, flashBaseEmissiveColor.g + flashBoost),
        Math.min(1, flashBaseEmissiveColor.b + flashBoost),
      )

      // 果凍彈跳：衰減震盪驅動的擠壓伸展，壓扁時橫向就變胖（體積守恆），
      // 來回彈幾下才停。單純縮放會像呼吸，一壓一鼓才有 Q 彈的材質感
      const jellyRatio = Math.min(1, flashElapsed / JELLY_SECONDS)
      const jelly = computeDecayingWobble(jellyRatio, 2.5, 1.5) * JELLY_AMOUNT
      node.scaling.set(
        PROP_SCALE * (1 + jelly * 0.6),
        PROP_SCALE * (1 - jelly),
        PROP_SCALE * (1 + jelly * 0.6),
      )
    },
    triggerFlash() {
      flashElapsed = 0
    },
    dispose() {
      const materialSet = new Set(
        camera.meshList
          .map((mesh) => mesh.material)
          .filter((material): material is NonNullable<typeof material> => material !== null),
      )
      for (const material of materialSet) {
        material.dispose()
      }
      for (const mesh of camera.meshList) {
        mesh.dispose()
      }
      camera.root.dispose()
      node.dispose()
    },
  }
}
