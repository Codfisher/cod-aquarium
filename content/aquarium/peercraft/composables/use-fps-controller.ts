import type { Scene, UniversalCamera } from '@babylonjs/core'
import { Vector3 } from '@babylonjs/core'
import { onBeforeUnmount } from 'vue'
import {
  PLAYER_EYE_HEIGHT,
  resolveCollision,
} from '../domains/player/collision'

const GRAVITY = 20
const JUMP_SPEED = 7
const MOVE_SPEED = 6

interface UseFpsControllerParams {
  scene: Scene;
  camera: UniversalCamera;
  canvas: HTMLCanvasElement;
  worldState: Uint8Array;
}

/**
 * FPS 控制器
 *
 * 接管攝影機移動，整合：
 * - WASD 鍵盤移動（相對攝影機朝向）
 * - Space 跳躍（需落地）
 * - 重力 + AABB 陣列碰撞
 * - Pointer Lock 滑鼠鎖定
 *
 * 回傳 `start` 方法，呼叫後才會真正啟動控制器。
 * 這樣可以在 setup 同步階段呼叫以收集 onBeforeUnmount，
 * 但延遲到 scene 就緒後才啟動。
 */
export function useFpsController() {
  /** 清理用的陣列，start 時填入，unmount 時清除 */
  let cleanup: (() => void) | null = null

  onBeforeUnmount(() => {
    cleanup?.()
  })

  function start({
    scene,
    camera,
    canvas,
    worldState,
  }: UseFpsControllerParams) {
    /** 按鍵狀態 */
    const keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
    }

    /** 玩家速度 */
    let velocityX = 0
    let velocityY = 0
    let velocityZ = 0
    let isOnGround = false

    /** 玩家腳底位置（攝影機位置 = 腳底 + eyeHeight） */
    let footX = camera.position.x
    let footY = camera.position.y - PLAYER_EYE_HEIGHT
    let footZ = camera.position.z

    /** 停用 Babylon 內建的攝影機移動 */
    camera.keysUp = []
    camera.keysDown = []
    camera.keysLeft = []
    camera.keysRight = []
    camera.speed = 0
    camera.inertia = 0

    /** 鍵盤事件 */
    function handleKeyDown(event: KeyboardEvent) {
      switch (event.code) {
        case 'KeyW':
          keys.forward = true
          break
        case 'KeyS':
          keys.backward = true
          break
        case 'KeyA':
          keys.left = true
          break
        case 'KeyD':
          keys.right = true
          break
        case 'Space':
          keys.jump = true
          event.preventDefault()
          break
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      switch (event.code) {
        case 'KeyW':
          keys.forward = false
          break
        case 'KeyS':
          keys.backward = false
          break
        case 'KeyA':
          keys.left = false
          break
        case 'KeyD':
          keys.right = false
          break
        case 'Space':
          keys.jump = false
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    /** Pointer Lock：點擊 canvas 鎖定滑鼠 */
    function handleCanvasClick() {
      canvas.requestPointerLock()
    }
    canvas.addEventListener('click', handleCanvasClick)

    /** 每幀更新 */
    const observer = scene.onBeforeRenderObservable.add(() => {
      const deltaTime = scene.getEngine().getDeltaTime() / 1000

      /** 計算攝影機的水平朝向（忽略 pitch） */
      const forward = camera.getDirection(Vector3.Forward())
      forward.y = 0
      forward.normalize()

      const right = camera.getDirection(Vector3.Right())
      right.y = 0
      right.normalize()

      /** 根據按鍵計算移動方向 */
      let moveX = 0
      let moveZ = 0

      if (keys.forward) {
        moveX += forward.x
        moveZ += forward.z
      }
      if (keys.backward) {
        moveX -= forward.x
        moveZ -= forward.z
      }
      if (keys.left) {
        moveX -= right.x
        moveZ -= right.z
      }
      if (keys.right) {
        moveX += right.x
        moveZ += right.z
      }

      /** 正規化水平移動方向 */
      const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ)
      if (moveLength > 0) {
        moveX = (moveX / moveLength) * MOVE_SPEED * deltaTime
        moveZ = (moveZ / moveLength) * MOVE_SPEED * deltaTime
      }

      /** 跳躍 */
      if (keys.jump && isOnGround) {
        velocityY = JUMP_SPEED
      }

      /** 重力 */
      velocityY -= GRAVITY * deltaTime

      /** 碰撞解析 */
      const result = resolveCollision(
        worldState,
        footX,
        footY,
        footZ,
        moveX,
        velocityY * deltaTime,
        moveZ,
      )

      footX = result.x
      footY = result.y
      footZ = result.z
      velocityX = result.velocityX
      velocityY = result.velocityY / (deltaTime || 1)

      /** velocityY 從 resolveCollision 回傳的是 delta，需還原 */
      if (result.velocityY === 0) {
        velocityY = 0
      }

      velocityZ = result.velocityZ
      isOnGround = result.isOnGround

      /** 更新攝影機位置 */
      camera.position.x = footX
      camera.position.y = footY + PLAYER_EYE_HEIGHT
      camera.position.z = footZ
    })

    cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      canvas.removeEventListener('click', handleCanvasClick)
      scene.onBeforeRenderObservable.remove(observer)

      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
    }
  }

  return { start }
}
