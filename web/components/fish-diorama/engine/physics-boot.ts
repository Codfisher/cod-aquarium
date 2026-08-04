/** Havok 物理的啟動樣板：動態載入 WASM、快取實例、失敗優雅降級。
 *
 * WASM 實例本身是無狀態的引擎核心，多個 Scene 可共用同一份；
 * 但每個 Scene 需要自己的 HavokPlugin（各自的世界）。
 */
import type { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin'
import '@babylonjs/core/Physics/v2/physicsEngineComponent'

/** HavokPlugin 建構子接受的 WASM 實例型別（Babylon 未匯出具名型別，由建構子簽章取得） */
type HavokInstance = ConstructorParameters<typeof HavokPlugin>[1]

/** WASM 載入的 Promise 快取：多場景同時要物理時只載一次 */
let havokInstancePromise: Promise<HavokInstance> | undefined

/** 取得（必要時載入）Havok WASM 實例。失敗時 reject，呼叫端自行降級 */
export async function loadHavokInstance(): Promise<HavokInstance> {
  havokInstancePromise ??= import('@babylonjs/havok').then(async (havokModule) => havokModule.default())
  return havokInstancePromise
}

export interface PhysicsBootOptions {
  /** 重力加速度（Y 為負值）。預設地球重力 */
  gravityY?: number;
  /** 物理子步進（ms）。剛性彈簧或密集接觸的場景調小讓解算器收斂，
   * 預設 2ms 約等於每幀跑 8 次解算
   */
  subTimeStepMilliseconds?: number;
  /** 場景是否已被銷毀。非同步回來時若已銷毀就不動作 */
  isSceneDisposed?: () => boolean;
}

/** 在指定 Scene 上啟用 Havok 物理。
 * 回傳是否成功——失敗不拋錯，讓場景以無物理的降級模式繼續運作
 */
export async function enableScenePhysics(
  scene: Scene,
  options: PhysicsBootOptions = {},
): Promise<boolean> {
  const {
    gravityY = -9.81,
    subTimeStepMilliseconds = 2,
    isSceneDisposed,
  } = options

  try {
    const havokInstance = await loadHavokInstance()
    if (isSceneDisposed?.() || scene.isDisposed) {
      return false
    }
    scene.enablePhysics(new Vector3(0, gravityY, 0), new HavokPlugin(true, havokInstance))
    scene.getPhysicsEngine()?.setSubTimeStep(subTimeStepMilliseconds)
    return true
  }
  catch (error) {
    console.warn('[fish-diorama] Havok 物理載入失敗，改用降級模式', error)
    return false
  }
}
