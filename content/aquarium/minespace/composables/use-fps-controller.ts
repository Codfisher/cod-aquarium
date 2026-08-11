import type { DirectionalLight, HemisphericLight, Scene, UniversalCamera } from '@babylonjs/core'
import type { AtmosphereState } from '../domains/weather/atmosphere'
import type { MobileControlState } from './use-mobile-controller'
import { Color3 } from '@babylonjs/core'
import { onBeforeUnmount, reactive, ref } from 'vue'
import { BlockId, getStepMaterial } from '../domains/block/block-constants'
import {
  findSafeStandingPosition,
  isHeadInWater,
  isInWater,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  readBlock,
  resolveCollision,
} from '../domains/player/collision'
import { SPAWN_POSITION } from '../domains/world/world-generator'
import { useStepSound } from './use-audio-engine'
import {
  AMBIENT_INTENSITY,
  AMBIENT_LIGHT_NAME,
  SKYBOX_NAME,
  SUN_INTENSITY,
  SUN_LIGHT_NAME,
} from './use-babylon-scene'

const GRAVITY = 22
const JUMP_SPEED = 7.6
const MOVE_SPEED = 5.2
const SPRINT_MULTIPLIER = 1.7

/** 水中的移動參數 */
const WATER_GRAVITY = 5
const WATER_SINK_LIMIT = -2.4
const WATER_SWIM_SPEED = 3.4
const WATER_MOVE_RATIO = 0.6
/** 貼著岸邊往上爬的速度 */
const WATER_CLIMB_SPEED = 3.6

/** 腳步聲間隔（秒） */
const STEP_INTERVAL = 0.45
const SPRINT_STEP_INTERVAL = 0.28

/** 限制俯仰角度避免翻轉 */
const PITCH_LIMIT = Math.PI / 2 - 0.01

/**
 * 跨階時鏡頭補回落差的速度（格 / 秒）
 *
 * 碰撞是瞬間把人抬到半磚上的，鏡頭若照著走會整個彈一下。
 * 這裡先記下抬高了多少，鏡頭從原本的高度慢慢補上來，
 * 看起來就是自然地踏上一階
 */
const STEP_SMOOTH_SPEED = 7

/** 滑鼠靈敏度：位移一像素轉多少弧度 */
const MOUSE_LOOK_SENSITIVITY = 1 / 1600
/**
 * 單一次滑鼠事件的位移上限（像素）
 *
 * 一次事件對應的是一批硬體回報，再快的甩滑鼠也到不了這個量級。
 * 超過就是異常值：剛鎖定指標時瀏覽器可能夾帶鎖定前後的座標落差，
 * 分頁切回來、或系統指標加速失控時也會送出上千像素的位移。
 * 這種值不擋下來，畫面會瞬間轉過去
 */
const MOUSE_MOVE_LIMIT = 260

/**
 * 洞穴內保留的環境光比例
 *
 * 洞裡與地表的差別在於曬不到太陽，而不是連環境光都關掉。
 * 環境光壓太低會讓岩壁失去所有細節，
 * 洞穴的暗應該是烘進方塊的環境遮蔽做出來的，不是把燈全部關掉
 */
const CAVE_AMBIENT_RATIO = 0.94

/** 判定「被地形包住」時往上搜尋的格數 */
const COVER_SCAN_HEIGHT = 14
/** 頭頂疊到幾層實心地形開始算進洞 */
const COVER_START_THRESHOLD = 2
/** 疊到幾層算是完全在山腹裡 */
const COVER_FULL_THRESHOLD = 9

/** 這些方塊不算屋頂，站在樹下或水裡不該讓世界暗掉 */
const TRANSPARENT_COVER_SET = new Set<BlockId>([
  BlockId.AIR,
  BlockId.WATER,
  BlockId.FLOWING_WATER,
  BlockId.ICE,
  BlockId.GLASS,
  BlockId.OAK_LEAVES,
  BlockId.PINE_LEAVES,
  BlockId.OAK_LOG,
  BlockId.PINE_LOG,
  BlockId.DEAD_LOG,
])

/**
 * 洞穴的霧色
 *
 * 幾近全黑的霧一罩下去，兩步之外就什麼都看不見，
 * 進洞會像瞬間關燈。留一點岩石的灰藍，才是深處的空氣感
 */
const CAVE_FOG_COLOR = new Color3(0.13, 0.13, 0.17)
/** 洞穴的能見度，太短會像貼著臉蒙布 */
const CAVE_FOG_START = 10
const CAVE_FOG_END = 62
const WATER_FOG_COLOR = new Color3(0.16, 0.36, 0.56)

interface UseFpsControllerParams {
  scene: Scene;
  camera: UniversalCamera;
  canvas: HTMLCanvasElement;
  worldState: Uint8Array;
  /** 天氣系統寫入的大氣參數 */
  atmosphere: AtmosphereState;
  mobileControls?: {
    state: MobileControlState;
    consumeLookDelta: () => { deltaX: number; deltaY: number };
  };
}

/**
 * 漫遊控制器
 *
 * 整合鍵盤 / 觸控移動、重力與 AABB 碰撞、游泳、腳步聲，
 * 並依所在環境調整霧氣與環境光，走進洞穴會自然變暗。
 */
export function useFpsController() {
  let cleanup: (() => void) | null = null
  let canvasRef: HTMLCanvasElement | null = null
  let isMobile = false

  const isPaused = ref(true)
  const isSwimming = ref(false)
  const isUnderground = ref(false)

  /** 玩家腳底位置，音景與 HUD 都讀這個 */
  const position = reactive({
    x: SPAWN_POSITION.x,
    y: 20,
    z: SPAWN_POSITION.z,
  })

  const stepSound = useStepSound()

  onBeforeUnmount(() => {
    cleanup?.()
    stepSound.dispose()
  })

  function start({
    scene,
    camera,
    canvas,
    worldState,
    atmosphere,
    mobileControls,
  }: UseFpsControllerParams) {
    cleanup?.()

    isMobile = !!mobileControls
    canvasRef = canvas

    const keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
    }

    let velocityY = 0
    let isOnGround = false
    let stepTimer = 0
    /** 鏡頭還沒補上的跨階落差 */
    let stepSmoothOffset = 0
    /** 環境轉換用的平滑係數，0 為地表、1 為洞穴 */
    let caveRatio = 0
    let waterRatio = 0

    const spawn = findSafeStandingPosition(worldState, SPAWN_POSITION.x, SPAWN_POSITION.z)
    position.x = spawn.x
    position.y = spawn.y
    position.z = spawn.z

    /**
     * 所有輸入都自己接管
     *
     * 滑鼠視角原本交給 Babylon 的 FreeCameraMouseInput，但它會出事：
     * 每一次 mousemove 都把位移累加進 camera.cameraRotation，
     * 而 TargetCamera 每一幀套用完之後不是歸零，是乘上 inertia 留著下一幀繼續轉。
     * 於是實際轉過的角度是滑鼠位移的 1 / (1 - inertia) 倍，
     * 而且掉幀時整批累積的位移會在同一幀灌進去，後面幾幀還會拖著尾巴繼續轉，
     * 看起來就是「滑鼠沒動，畫面卻自己甩過去」。
     *
     * 這裡改成自己累積位移、每一幀原封不動套用一次，與觸控走同一條路徑
     */
    camera.speed = 0
    camera.inertia = 0
    camera.inputs.removeByType('FreeCameraKeyboardMoveInput')
    camera.inputs.removeByType('FreeCameraTouchInput')
    camera.inputs.removeByType('FreeCameraMouseInput')
    camera.detachControl()

    if (mobileControls) {
      isPaused.value = false
    }

    /** 這一幀累積到的滑鼠位移（像素） */
    const mouseLookDelta = { x: 0, y: 0 }
    /** 剛鎖定指標時的第一筆事件要丟掉 */
    let hasSettledPointerLock = false

    function clampMouseMove(value: number): number {
      return Math.max(-MOUSE_MOVE_LIMIT, Math.min(MOUSE_MOVE_LIMIT, value))
    }

    function handleMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== canvas)
        return

      /**
       * 剛鎖定的那一筆位移常常是鎖定前後的座標落差
       *
       * 值可能是好幾百像素，直接套用畫面會瞬間轉過去
       */
      if (!hasSettledPointerLock) {
        hasSettledPointerLock = true
        return
      }

      mouseLookDelta.x += clampMouseMove(event.movementX)
      mouseLookDelta.y += clampMouseMove(event.movementY)
    }

    function handleLockStateChange() {
      hasSettledPointerLock = false
      if (document.pointerLockElement !== canvas) {
        mouseLookDelta.x = 0
        mouseLookDelta.y = 0
      }
    }

    /** 取出並清空這一幀累積的視角位移，換算成弧度 */
    function consumeMouseLookDelta(): { deltaX: number; deltaY: number } {
      const deltaX = mouseLookDelta.x * MOUSE_LOOK_SENSITIVITY
      const deltaY = mouseLookDelta.y * MOUSE_LOOK_SENSITIVITY
      mouseLookDelta.x = 0
      mouseLookDelta.y = 0

      return { deltaX, deltaY }
    }

    const ambientLight = scene.getLightByName(AMBIENT_LIGHT_NAME) as HemisphericLight | null
    const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
    const skyDome = scene.getMeshByName(SKYBOX_NAME)

    function handleKeyDown(event: KeyboardEvent) {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.forward = true
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.backward = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.left = true
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.right = true
          break
        case 'Space':
          keys.jump = true
          event.preventDefault()
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.sprint = true
          break
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.forward = false
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.backward = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.left = false
          break
        case 'KeyD':
        case 'ArrowRight':
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

    function handleCanvasClick() {
      if (!mobileControls && !isPaused.value) {
        canvas.requestPointerLock()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    canvas.addEventListener('click', handleCanvasClick)
    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('pointerlockchange', handleLockStateChange)

    /**
     * 頭頂被岩層蓋住的程度，0 為完全露天、1 為深入山腹
     *
     * 只要頭上有東西就算的話，走到樹下整個世界都會暗掉，
     * 所以樹木與屋頂那一兩層不計入。
     * 回傳連續值而不是真假：洞口那幾步岩層還薄，光線就該只暗一點，
     * 一腳踏進去整個世界瞬間關燈才是真的突兀
     */
    function measureCoverRatio(): number {
      const blockX = Math.floor(position.x + 0.5)
      const blockZ = Math.floor(position.z + 0.5)
      const headY = Math.floor(position.y + PLAYER_HEIGHT + 0.5)

      let solidCount = 0
      for (let offsetY = 1; offsetY <= COVER_SCAN_HEIGHT; offsetY++) {
        const blockId = readBlock(worldState, blockX, headY + offsetY, blockZ)
        if (TRANSPARENT_COVER_SET.has(blockId))
          continue

        solidCount++
      }

      const depth = (solidCount - COVER_START_THRESHOLD)
        / (COVER_FULL_THRESHOLD - COVER_START_THRESHOLD)

      return Math.min(1, Math.max(0, depth))
    }

    /**
     * 依所在環境調整霧氣與光線
     *
     * 三層效果疊在一起：天氣決定地表基準，洞穴讓一切變暗變窄，
     * 水面下再罩上一層藍。全部集中在這裡算，才不會互相蓋掉。
     */
    function updateAtmosphere(deltaTime: number) {
      const caveTarget = measureCoverRatio()
      const waterTarget = isHeadInWater(worldState, position.x, position.y, position.z) ? 1 : 0
      /** 洞穴的過渡放慢，走進洞口的那幾秒才有眼睛慢慢適應的感覺 */
      const blendSpeed = Math.min(1, deltaTime * 1.2)

      caveRatio += (caveTarget - caveRatio) * blendSpeed
      waterRatio += (waterTarget - waterRatio) * blendSpeed
      isUnderground.value = caveRatio > 0.5

      Color3.LerpToRef(atmosphere.fogColor, CAVE_FOG_COLOR, caveRatio, scene.fogColor)
      Color3.LerpToRef(scene.fogColor, WATER_FOG_COLOR, waterRatio, scene.fogColor)

      const caveFogStart = atmosphere.fogStart + (CAVE_FOG_START - atmosphere.fogStart) * caveRatio
      const caveFogEnd = atmosphere.fogEnd + (CAVE_FOG_END - atmosphere.fogEnd) * caveRatio
      scene.fogStart = caveFogStart * (1 - waterRatio)
      scene.fogEnd = caveFogEnd + (14 - caveFogEnd) * waterRatio

      scene.clearColor.set(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b, 1)

      /** 在洞裡就不用畫天空了 */
      if (skyDome) {
        skyDome.setEnabled(caveRatio < 0.98)
      }

      const weatherRatio = atmosphere.lightRatio + atmosphere.flashRatio * 1.4

      /**
       * 洞裡照不到太陽，但不能真的全黑
       *
       * 完全沒有光的話玩家連路都看不到，
       * 保留一份微光當作岩壁的反射，剛好夠摸黑前進
       */
      const ambientRatio = weatherRatio * (1 - caveRatio) + CAVE_AMBIENT_RATIO * caveRatio

      if (ambientLight) {
        ambientLight.intensity = AMBIENT_INTENSITY * ambientRatio
      }
      if (sunLight) {
        sunLight.intensity = SUN_INTENSITY * weatherRatio * (1 - caveRatio)
      }
    }

    /** 踩在哪種方塊上就播哪種腳步聲 */
    function updateStepSound(deltaTime: number, isMoving: boolean, isSprinting: boolean) {
      if (!isOnGround || !isMoving || isSwimming.value) {
        stepTimer = 0
        return
      }

      const interval = isSprinting ? SPRINT_STEP_INTERVAL : STEP_INTERVAL
      stepTimer += deltaTime
      if (stepTimer < interval)
        return

      stepTimer -= interval

      const blockId = readBlock(
        worldState,
        Math.floor(position.x + 0.5),
        Math.floor(position.y - 0.1 + 0.5),
        Math.floor(position.z + 0.5),
      )

      if (blockId !== BlockId.AIR) {
        void stepSound.playStep(getStepMaterial(blockId))
      }
    }

    const observer = scene.onBeforeRenderObservable.add(() => {
      const deltaTime = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000)

      /**
       * 視角旋轉
       *
       * 手機讀搖桿、桌機讀累積的滑鼠位移，兩邊都是每一幀原封不動套用一次。
       * 不做慣性也不補間，滑鼠移多少畫面就轉多少，掉幀時也不會多轉
       */
      const lookDelta = mobileControls
        ? mobileControls.consumeLookDelta()
        : consumeMouseLookDelta()
      camera.rotation.y += lookDelta.deltaX
      camera.rotation.x += lookDelta.deltaY
      camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.rotation.x))

      /** 依攝影機朝向算出水平移動方向 */
      const yaw = camera.rotation.y
      const forwardX = Math.sin(yaw)
      const forwardZ = Math.cos(yaw)
      const rightX = Math.cos(yaw)
      const rightZ = -Math.sin(yaw)

      let moveX = 0
      let moveZ = 0

      if (!isPaused.value) {
        if (keys.forward) {
          moveX += forwardX
          moveZ += forwardZ
        }
        if (keys.backward) {
          moveX -= forwardX
          moveZ -= forwardZ
        }
        if (keys.left) {
          moveX -= rightX
          moveZ -= rightZ
        }
        if (keys.right) {
          moveX += rightX
          moveZ += rightZ
        }

        const joystick = mobileControls?.state.joystick
        if (joystick && (joystick.x !== 0 || joystick.z !== 0)) {
          moveX += forwardX * (-joystick.z) + rightX * joystick.x
          moveZ += forwardZ * (-joystick.z) + rightZ * joystick.x
        }
      }

      isSwimming.value = isInWater(worldState, position.x, position.y, position.z)

      const moveLength = Math.hypot(moveX, moveZ)
      const isSprinting = keys.sprint || (mobileControls?.state.sprint ?? false)
      const shouldJump = !isPaused.value && (keys.jump || (mobileControls?.state.jump ?? false))

      if (moveLength > 0) {
        const joystickMagnitude = mobileControls?.state.joystickMagnitude ?? 0
        const analogRatio = joystickMagnitude > 0 ? joystickMagnitude : 1
        const speed = MOVE_SPEED
          * (isSprinting ? SPRINT_MULTIPLIER : 1)
          * (isSwimming.value ? WATER_MOVE_RATIO : 1)
          * analogRatio

        moveX = (moveX / moveLength) * speed * deltaTime
        moveZ = (moveZ / moveLength) * speed * deltaTime
      }

      /** 重力與跳躍 / 游泳 */
      if (isSwimming.value) {
        velocityY -= WATER_GRAVITY * deltaTime
        velocityY = Math.max(velocityY, WATER_SINK_LIMIT)
        if (shouldJump) {
          velocityY = WATER_SWIM_SPEED
        }
      }
      else {
        if (shouldJump && isOnGround) {
          velocityY = JUMP_SPEED
        }
        velocityY -= GRAVITY * deltaTime
      }

      const result = resolveCollision(
        worldState,
        position.x,
        position.y,
        position.z,
        moveX,
        velocityY * deltaTime,
        moveZ,
        /** 站在地上、而且沒有往上跳，才允許自動跨過半磚 */
        isOnGround && velocityY <= 0,
      )

      position.x = result.x
      position.y = result.y
      position.z = result.z
      isOnGround = result.isOnGround
      if (result.velocityY === 0) {
        velocityY = 0
      }

      /**
       * 泡在水裡撞到岸邊就自動往上浮
       *
       * 水面與岸邊常常齊高，這時玩家踩不到底、跳不起來，
       * 會被卡在水裡出不去。頂到牆就給一段上浮速度，自然地爬上岸
       */
      const isBlockedByShore = (moveX !== 0 && result.velocityX === 0)
        || (moveZ !== 0 && result.velocityZ === 0)
      if (isSwimming.value && isBlockedByShore) {
        velocityY = Math.max(velocityY, WATER_CLIMB_SPEED)
      }

      /** 跨上半磚的瞬間鏡頭留在原處，再逐幀補上來 */
      stepSmoothOffset += result.stepUpHeight
      stepSmoothOffset = Math.max(0, stepSmoothOffset - STEP_SMOOTH_SPEED * deltaTime)

      camera.position.set(
        position.x,
        position.y + PLAYER_EYE_HEIGHT - stepSmoothOffset,
        position.z,
      )

      updateStepSound(deltaTime, moveLength > 0, isSprinting)
      updateAtmosphere(deltaTime)
    })

    cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      canvas.removeEventListener('click', handleCanvasClick)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handleLockStateChange)
      scene.onBeforeRenderObservable.remove(observer)
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }
    }
  }

  /**
   * 要求鎖定滑鼠
   *
   * 剛按 Esc 解除鎖定之後，瀏覽器會有一秒多的冷卻期擋下所有請求。
   * 選單的開關是跟著鎖定狀態走的，請求被擋下就等於「按了沒反應」，
   * 而畫面又已經回到遊戲，看起來就像整個卡住。
   * 所以失敗了要隔一小段時間再試，直到冷卻期過去
   */
  function requestPointerLock(retryCount = 5) {
    const request = canvasRef?.requestPointerLock() as unknown
    if (!(request instanceof Promise))
      return

    request.catch(() => {
      if (retryCount <= 0 || !canvasRef || document.pointerLockElement === canvasRef)
        return

      setTimeout(() => requestPointerLock(retryCount - 1), 320)
    })
  }

  /** 桌機的暫停狀態交給 Pointer Lock 決定，避免鎖定失敗時狀態不同步 */
  function resume() {
    if (isMobile) {
      isPaused.value = false
      return
    }

    requestPointerLock()
  }

  function pause() {
    isPaused.value = true

    if (canvasRef && !isMobile && document.pointerLockElement === canvasRef) {
      document.exitPointerLock()
    }
  }

  function handlePointerLockChange() {
    if (isMobile)
      return

    isPaused.value = document.pointerLockElement !== canvasRef
  }

  document.addEventListener('pointerlockchange', handlePointerLockChange)
  onBeforeUnmount(() => {
    document.removeEventListener('pointerlockchange', handlePointerLockChange)
  })

  /** 直接把玩家送到指定座標，方便快速旅行 */
  function teleport(x: number, y: number, z: number) {
    position.x = x
    position.y = y
    position.z = z
  }

  return {
    start,
    resume,
    pause,
    teleport,
    isPaused,
    isSwimming,
    isUnderground,
    position,
  }
}
