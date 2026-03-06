import type { Scene, UniversalCamera } from '@babylonjs/core'
import { Color3, Vector3 } from '@babylonjs/core'
import { useEventListener, usePointerLock } from '@vueuse/core'
import { random } from 'lodash-es'
import { computed, onBeforeUnmount } from 'vue'
import { PLAYER_EYE_HEIGHT, resolveCollision } from '../domains/player/collision'
import { WORLD_HEIGHT, WORLD_SIZE } from '../domains/world/world-constants'

const GRAVITY = 20
const JUMP_SPEED = 7
const MOVE_SPEED = 6

/** 霧氣參數：Y 低於此高度時開始加濃霧氣 */
const CAVE_FOG_THRESHOLD_Y = 20
const SURFACE_FOG_START = 30
const SURFACE_FOG_END = 60
const CAVE_FOG_START = 0
const CAVE_FOG_END = 20
const SURFACE_FOG_COLOR = new Color3(0.53, 0.74, 0.93)
const CAVE_FOG_COLOR = new Color3(0.2, 0.2, 0.25)

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
  let cleanup: (() => void) | null = null
  const { lock, unlock, element: pointerLockElement } = usePointerLock()
  const isPaused = computed(() => !pointerLockElement.value)
  let canvasRef: HTMLCanvasElement | null = null

  /** 玩家位置 (腳底) */
  let footX = 0
  let footY = 0
  let footZ = 0

  onBeforeUnmount(() => {
    cleanup?.()
  })

  function start({
    scene,
    camera,
    canvas,
    worldState,
  }: UseFpsControllerParams) {
    canvasRef = canvas

    /** 按鍵狀態 */
    const keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
    }

    /** 玩家速度 */
    let velocityX = 0
    let velocityY = 0
    let velocityZ = 0
    let isOnGround = false

    /** 隨機選擇重生點 X, Z，並尋找地表高度 */
    const center = WORLD_SIZE / 2
    const spawnX = random(center - 10, center + 10)
    const spawnZ = random(center - 10, center + 10)
    const spawnY = WORLD_HEIGHT

    /** 玩家腳底位置（攝影機位置 = 腳底 + eyeHeight） */
    footX = spawnX + 0.5 // 站方塊正中央
    footY = spawnY
    footZ = spawnZ + 0.5

    /** 停用 Babylon 內建的鍵盤移動（由本控制器自行處理） */
    camera.inputs.removeByType('FreeCameraKeyboardMoveInput')
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
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.sprint = true
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
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.sprint = false
          break
      }
    }

    const cleanupKeyDown = useEventListener(window, 'keydown', handleKeyDown)
    const cleanupKeyUp = useEventListener(window, 'keyup', handleKeyUp)

    /** Pointer Lock：點擊 canvas 鎖定滑鼠 (如果沒在暫停選單) */
    function handleCanvasClick() {
      if (!isPaused.value) {
        lock(canvas)
      }
    }
    const cleanupCanvasClick = useEventListener(canvas, 'click', handleCanvasClick)

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

      /** 暫停時不處理移動 */
      if (!isPaused.value) {
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

        /** 跳躍 */
        if (keys.jump && isOnGround) {
          velocityY = JUMP_SPEED
        }
      }

      /** 正規化水平移動方向 */
      const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ)
      if (moveLength > 0) {
        const speed = keys.sprint ? MOVE_SPEED * 1.6 : MOVE_SPEED
        moveX = (moveX / moveLength) * speed * deltaTime
        moveZ = (moveZ / moveLength) * speed * deltaTime
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

      /** 根據 Y 高度動態調整霧氣，越深霧越濃、顏色越灰 */
      const fogRatio = Math.max(0, Math.min(1, (CAVE_FOG_THRESHOLD_Y - footY) / CAVE_FOG_THRESHOLD_Y))
      scene.fogStart = SURFACE_FOG_START + (CAVE_FOG_START - SURFACE_FOG_START) * fogRatio
      scene.fogEnd = SURFACE_FOG_END + (CAVE_FOG_END - SURFACE_FOG_END) * fogRatio
      Color3.LerpToRef(SURFACE_FOG_COLOR, CAVE_FOG_COLOR, fogRatio, scene.fogColor)
    })

    cleanup = () => {
      cleanupKeyDown()
      cleanupKeyUp()
      cleanupCanvasClick()
      scene.onBeforeRenderObservable.remove(observer)
      unlock()
    }
  }

  function resume() {
    if (canvasRef) {
      lock(canvasRef)
    }
  }

  function teleport(x: number, y: number, z: number) {
    footX = x
    footY = y
    footZ = z
  }

  return { start, resume, isPaused, teleport }
}
