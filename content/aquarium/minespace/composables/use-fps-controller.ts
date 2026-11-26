import type { DirectionalLight, HemisphericLight, Scene, UniversalCamera } from '@babylonjs/core'
import type { RenderInputMessage, RenderMoveKeys } from '../domains/render-host/protocol'
import type { VoxelGi } from '../domains/renderer/voxel-gi'
import type { AtmosphereState } from '../domains/weather/atmosphere'
import { Color3 } from '@babylonjs/core'
import { clamp } from 'remeda'
import { onScopeDispose, reactive, ref } from 'vue'
import { BLOCK_DEFS, BlockId, isLavaBlock } from '../domains/block/block-constants'
import { SPAWN_POSITION } from '../domains/garden/garden-layout'
import {
  findSafeStandingPosition,
  isHeadInWater,
  isInWater,
  measureEyeSubmergeDepth,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  readBlock,
  resolveCollision,
} from '../domains/player/collision'
import { updateLeafTranslucency } from '../domains/renderer/leaf-translucency'
import { updateSkyLight } from '../domains/renderer/sky-light'
import { getReloadHandoff } from '../domains/scene/reload-handoff'
import { updateAerialAir } from '../domains/weather/aerial-perspective'
import { CAVE_FOG_COLOR, EDGE_FOG_END, EDGE_FOG_START, getEdgeFogRatio } from '../domains/weather/atmosphere'
import { updateCloudShadow } from '../domains/weather/cloud-shadow'
import { WORLD_SIZE } from '../domains/world/world-constants'
import { AMBIENT_LIGHT_NAME, SUN_DIRECTION, SUN_LIGHT_NAME } from './use-babylon-scene'
import { useDevToggles } from './use-dev-toggles'
import { measureSection } from './use-performance-probe'

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
 * 單一幀最多轉多少弧度
 *
 * 約十八度。正常揮動滑鼠一幀轉不到這個角度，所以手感完全不受影響；
 * 只有掉幀後累積出來的那一大批位移會被攤開，不會一次甩過去。
 * 超出的部分不會被丟掉，留給接下來幾幀繼續轉完
 */
const MOUSE_LOOK_FRAME_LIMIT = 0.32

/**
 * 洞穴內保留的環境光比例
 *
 * 洞裡與地表的差別在於曬不到太陽，而不是連環境光都關掉。
 * 環境光壓太低會讓岩壁失去所有細節，
 * 洞穴的暗應該是烘進方塊的環境遮蔽做出來的，不是把燈全部關掉
 */
const CAVE_AMBIENT_RATIO = 0.94

/**
 * 洞穴環境光的下限
 *
 * 地表的環境光跟著日夜走，入夜只剩三成；洞裡卻是不分晝夜的。
 * 夜裡進洞若照著地表的強度再打折，會黑到什麼都看不見，
 * 所以洞裡的環境光不低於這個值
 */
const CAVE_AMBIENT_FLOOR = 0.55

/**
 * 環境光染色取樣的頻率（秒）
 *
 * 這是給人一點「間接光」的錯覺用的，色調本來就該變得很慢，
 * 不必跟著幀率算——跟 render-runtime 的 trackStatus 同一種節流思路
 */
const GROUND_TINT_SAMPLE_INTERVAL = 0.4

/**
 * 取樣色最多能把地面反射色染成什麼比例
 *
 * 這是假的全局光，不是真的——只該是一點暗示，不能整個蓋過
 * 原本「天空冷、地面暖」那組色溫對比，蓋過去反而會讓立體感垮掉
 */
const GROUND_TINT_MIX_RATIO = 0.35

/** 腳下取樣範圍，左右各幾格 */
const GROUND_TINT_SAMPLE_RADIUS = 2

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
  BlockId.ASPEN_LOG,
  BlockId.AMBER_LEAVES,
  BlockId.GOLD_LEAVES,
  BlockId.ACACIA_LOG,
  BlockId.ACACIA_LEAVES,
  BlockId.JUNGLE_LEAVES,
  BlockId.OAK_LOG,
  BlockId.PINE_LOG,
  BlockId.DEAD_LOG,
])

/**
 * 世界在幾何上的邊界
 *
 * 方塊中心落在整數座標，所以第一格的外緣是 -0.5、最後一格的外緣是 WORLD_SIZE - 0.5。
 * 循環的區間必須對齊這兩條線，不能用 0 到 WORLD_SIZE：
 * 差的那半格會讓人被送到最後一格的外面，腳下沒有方塊，
 * 站上去會直接往下掉，再走一步又立刻被彈回另一頭
 */
const WORLD_MIN_EDGE = -0.5

/**
 * 循環世界
 *
 * 走出邊界就平移一整個世界的距離，從對面出來。
 * 是平移不是鏡射——鏡射會把左右整個顛倒過來，
 * 轉頭時看到的東西對不上，那一下反而比接縫還明顯。
 *
 * 之所以察覺不到，是三件事對齊了：
 * 箱庭全部排在離邊界四十二格以外、沙紋也收在三十六格以內，
 * 而霧氣一走近邊界就濃到只剩二十六格（見 measureEdgeRatio）。
 * 跨過去的前後，視野裡都只有同一片白
 *
 * 用 while 而不是 if：快速傳送可能一次跳出去好幾圈
 */
function wrapAxis(value: number): number {
  let wrapped = value

  while (wrapped < WORLD_MIN_EDGE) {
    wrapped += WORLD_SIZE
  }
  while (wrapped >= WORLD_MIN_EDGE + WORLD_SIZE) {
    wrapped -= WORLD_SIZE
  }

  return wrapped
}

/**
 * 洞穴的能見度
 *
 * 岩響窟裡的洞只有二三十格深，能見度給到六十等於沒有霧。
 * 收到二十六格剛好：站在洞室中央看不到洞口，
 * 但也不至於像貼著臉蒙了一塊布
 */
const CAVE_FOG_START = 5
const CAVE_FOG_END = 26
const WATER_FOG_COLOR = new Color3(0.16, 0.36, 0.56)
/** 泡在水裡還看得見十四格外的東西，那是水的性質 */
const WATER_FOG_END = 14

/**
 * 沉進熔岩時的視野
 *
 * 紅通道給到滿檔以上，是因為畫面出去還要過一次 ACES 色調映射，
 * 而那條曲線在高處會把飽和度往回收。照著眼睛想要的紅去填 0.72，
 * 出來會是一塊悶掉的磚色——要燒起來就得給得比看起來需要的更多
 */
const LAVA_FOG_COLOR = new Color3(1.05, 0.16, 0.03)

/**
 * 熔岩把視野整個收掉
 *
 * 水是半透明的，所以水下只是「看得比較近」。熔岩不是——
 * 它是一塊不透明的熔融岩石，眼睛貼上去就只剩下它自己。
 * 霧從零開始、一格半外什麼都沒有，整片畫面燒成紅的
 */
const LAVA_FOG_END = 1.5

/**
 * 眼睛沉多深算是整個泡進去了
 *
 * 半格。這是一段很短的距離，但它把「剛碰到」與「泡進去」分成兩件事：
 * 液面掠過眼睛時畫面已經開始泛紅，再沉半格才紅得什麼都看不見
 */
const LAVA_SUBMERGE_DEPTH = 0.5

interface UseFpsControllerParams {
  scene: Scene;
  camera: UniversalCamera;
  worldState: Uint8Array;
  /** 天氣系統寫入的大氣參數 */
  atmosphere: AtmosphereState;
  /** 體素全局光，沒給就當作沒有這個效果——低畫質可以直接不傳 */
  voxelGi?: VoxelGi | null;
}

/**
 * 漫遊控制器（渲染端）
 *
 * 整合鍵盤 / 觸控移動、重力與 AABB 碰撞、游泳，
 * 並依所在環境調整霧氣與環境光，走進洞穴會自然變暗。
 *
 * 這裡只管「怎麼動」，不碰任何輸入裝置：鍵盤、滑鼠、pointer lock 與觸控都在主執行緒
 * （見 use-input-capture），整理成 input 訊息送來，由 applyInput 收下。
 * 暫停與游標是否放開也是主執行緒決定的，用 applyControl 收下——
 * 它們跟著 pointer lock 走，而 pointer lock 只有主執行緒摸得到
 */
export function useFpsController() {
  let cleanup: (() => void) | null = null

  /** 大氣透視的開關掛在這裡，因為空氣色是跟著霧色一起算的 */
  const { state: devToggle } = useDevToggles()

  const isPaused = ref(true)
  const isSwimming = ref(false)
  const isUnderground = ref(false)
  /**
   * 滑鼠是否已交還給桌面
   *
   * 與暫停分開：Esc 解除鎖定會叫出選單擋住畫面，
   * 想單純把滑鼠拿回來看看風景時走這條路，世界照樣運轉
   */
  const isCursorFree = ref(false)

  /** 是否正在操控人物：暫停中或放開滑鼠時鍵盤都不該有作用 */
  function checkControlActive(): boolean {
    return !isPaused.value && !isCursorFree.value
  }

  /**
   * 主執行緒送來的輸入狀態
   *
   * 按鍵與搖桿是「現在的樣子」，每次整份覆蓋；
   * 位移是「自上次以來累積的量」，加進累加器、由每一幀取用
   */
  const keys: RenderMoveKeys = {
    isForwardPressed: false,
    isBackwardPressed: false,
    isLeftPressed: false,
    isRightPressed: false,
    isJumpPressed: false,
    isSprintPressed: false,
  }
  const joystick = { x: 0, z: 0, magnitude: 0 }
  const touchButton = { isJumpPressed: false, isSprintPressed: false }
  /** 還沒套用的滑鼠位移（像素） */
  const mouseLookDelta = { x: 0, y: 0 }
  /** 還沒套用的觸控視角位移（弧度） */
  const touchLookDelta = { x: 0, y: 0 }

  function applyInput(message: RenderInputMessage) {
    Object.assign(keys, message.keys)
    joystick.x = message.joystick.x
    joystick.z = message.joystick.z
    joystick.magnitude = message.joystickMagnitude
    touchButton.isJumpPressed = message.isTouchJumping
    touchButton.isSprintPressed = message.isTouchSprinting
    mouseLookDelta.x += message.mouseDeltaX
    mouseLookDelta.y += message.mouseDeltaY
    touchLookDelta.x += message.touchLookDeltaX
    touchLookDelta.y += message.touchLookDeltaY
  }

  /** 暫停與游標的狀態，由主執行緒決定 */
  function applyControl(nextIsPaused: boolean, nextIsCursorFree: boolean) {
    isPaused.value = nextIsPaused
    isCursorFree.value = nextIsCursorFree
  }

  /** 玩家腳底位置，音景與 HUD 都讀這個 */
  const position = reactive({
    x: SPAWN_POSITION.x,
    y: 20,
    z: SPAWN_POSITION.z,
  })

  onScopeDispose(() => {
    cleanup?.()
  })

  function start({
    scene,
    camera,
    worldState,
    atmosphere,
    voxelGi,
  }: UseFpsControllerParams) {
    cleanup?.()

    let velocityY = 0
    let isOnGround = false
    /** 鏡頭還沒補上的跨階落差 */
    let stepSmoothOffset = 0
    /** 環境轉換用的平滑係數，0 為地表、1 為洞穴 */
    let caveRatio = 0
    let waterRatio = 0
    /** 沉在熔岩裡多深，用來把整片視野燒紅 */
    let lavaRatio = 0

    /** 距離上次取樣過了多久 */
    let groundTintElapsed = GROUND_TINT_SAMPLE_INTERVAL
    /** 上一次取樣到的顏色，附近沒有帶色調的方塊就是 null */
    let groundTintSample: Color3 | null = null
    /**
     * 目前真正套用的地面反射色，每幀慢慢趨近取樣結果
     *
     * 直接套用取樣值的話，每 0.4 秒色調會跳一下；用同一顆物件累積趨近，
     * 走過草地與走過石地之間的過渡才是連續的
     */
    const groundTintColor = atmosphere.ambientGroundColor.clone()

    /**
     * 依腳下方塊的色調猜這一刻的間接光該偏什麼顏色
     *
     * 不是真的全局光，是最低成本的替代品：直接讀方塊定義裡本來就有的
     * tint（給 grassTop 這類灰階貼圖上色用的那組），沒有 tint 的方塊
     * （多數石頭、木頭）不計入——那些回傳 null，交給呼叫端退回原本的暖色基準
     */
    function sampleGroundTint(): Color3 | null {
      const blockX = Math.floor(position.x + 0.5)
      const blockZ = Math.floor(position.z + 0.5)
      const blockY = Math.floor(position.y - 0.5)

      let sumR = 0
      let sumG = 0
      let sumB = 0
      let count = 0

      for (let dx = -GROUND_TINT_SAMPLE_RADIUS; dx <= GROUND_TINT_SAMPLE_RADIUS; dx++) {
        for (let dz = -GROUND_TINT_SAMPLE_RADIUS; dz <= GROUND_TINT_SAMPLE_RADIUS; dz++) {
          const blockId = readBlock(worldState, blockX + dx, blockY, blockZ + dz)
          const tint = BLOCK_DEFS[blockId]?.textures?.tint
          if (!tint)
            continue

          sumR += tint[0]
          sumG += tint[1]
          sumB += tint[2]
          count++
        }
      }

      return count > 0 ? new Color3(sumR / count, sumG / count, sumB / count) : null
    }

    /**
     * 換畫質重來時原地接回去，不然就從鳥居前面開始
     *
     * 交接回來的高度直接沿用，不再落地一次：世界是同一顆種子生出來的，
     * 那個位置照樣站得住，而重新落地會把待在洞裡或站在樹上的人
     * 拉回地表——那正是最需要原地回來的兩種情況
     */
    const handoff = getReloadHandoff()
    const spawn = handoff?.position
      ?? findSafeStandingPosition(worldState, SPAWN_POSITION.x, SPAWN_POSITION.z)

    position.x = spawn.x
    position.y = spawn.y
    position.z = spawn.z

    /**
     * 視角也要接回去
     *
     * 位置對了而視角回到預設的正北，人還是會愣一下——
     * 原本在看池子，重來之後看著鳥居，那與被搬走沒有兩樣
     */
    if (handoff) {
      camera.rotation.x = handoff.rotation.pitch
      camera.rotation.y = handoff.rotation.yaw
      camera.rotation.z = 0
    }

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
     * 這裡改成自己累積位移、每一幀原封不動套用一次，與觸控走同一條路徑。
     * 渲染端的鏡頭本來就沒有掛任何輸入，這幾行只是確保預設的那幾支不會留著
     */
    camera.speed = 0
    camera.inertia = 0
    camera.inputs.removeByType('FreeCameraKeyboardMoveInput')
    camera.inputs.removeByType('FreeCameraTouchInput')
    camera.inputs.removeByType('FreeCameraMouseInput')

    /**
     * 取出這一幀要套用的視角位移，換算成弧度
     *
     * 不能把累積的位移一次全部倒出來。掉幀時瀏覽器會把那段時間的
     * mousemove 全部排隊，下一幀一口氣送達——同一幀套用十幾筆位移，
     * 畫面就是瞬間甩過一大段角度。
     *
     * 這裡改成一幀最多轉一個上限，沒用完的留在累加器裡給下一幀。
     * 總共轉過的角度分毫不差，只是被攤平到接下來幾幀，
     * 看起來就是快速但連續地轉過去，而不是跳過去
     */
    function consumeMouseLookDelta(): { deltaX: number; deltaY: number } {
      const rawX = mouseLookDelta.x * MOUSE_LOOK_SENSITIVITY
      const rawY = mouseLookDelta.y * MOUSE_LOOK_SENSITIVITY
      const peak = Math.max(Math.abs(rawX), Math.abs(rawY))
      const ratio = peak > MOUSE_LOOK_FRAME_LIMIT ? MOUSE_LOOK_FRAME_LIMIT / peak : 1

      const deltaX = rawX * ratio
      const deltaY = rawY * ratio
      mouseLookDelta.x -= deltaX / MOUSE_LOOK_SENSITIVITY
      mouseLookDelta.y -= deltaY / MOUSE_LOOK_SENSITIVITY

      return { deltaX, deltaY }
    }

    const ambientLight = scene.getLightByName(AMBIENT_LIGHT_NAME) as HemisphericLight | null
    const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null

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
      /**
       * 熔岩碰到眼睛就開始燒
       *
       * 不用「頭有沒有整顆泡進去」那個是非題：液面爬到眼睛的那一刻
       * 視野就該開始變，而在液面上下浮沉時，是非題會讓整片紅
       * 一下有一下沒有地閃。改成量眼睛沉進液面底下多深，
       * 半格內從無到滿——碰到就看得出來，沉下去才紅得徹底
       */
      const lavaTarget = Math.min(
        1,
        measureEyeSubmergeDepth(worldState, position.x, position.y, position.z, isLavaBlock)
        / LAVA_SUBMERGE_DEPTH,
      )
      /** 洞穴的過渡放慢，走進洞口的那幾秒才有眼睛慢慢適應的感覺 */
      const blendSpeed = Math.min(1, deltaTime * 1.2)

      caveRatio += (caveTarget - caveRatio) * blendSpeed
      waterRatio += (waterTarget - waterRatio) * blendSpeed
      /** 熔岩不必慢慢適應，沉進去的那一刻就該紅得徹底 */
      lavaRatio += (lavaTarget - lavaRatio) * Math.min(1, blendSpeed * 3)
      isUnderground.value = caveRatio > 0.5
      /**
       * 讓天氣那一側知道現在在洞裡多深
       *
       * 天空原本是整片關掉的（skyDome.setEnabled(false)），
       * 但那會讓人從洞口往外看時，天空在某個深度忽然整片消失。
       * 改成交給罩在外面的那一層淡入成岩壁的顏色，
       * 深淺是連續的，走進走出都看不出切換
       */
      atmosphere.caveRatio = caveRatio

      Color3.LerpToRef(atmosphere.fogColor, CAVE_FOG_COLOR, caveRatio, scene.fogColor)
      Color3.LerpToRef(scene.fogColor, WATER_FOG_COLOR, waterRatio, scene.fogColor)
      Color3.LerpToRef(scene.fogColor, LAVA_FOG_COLOR, lavaRatio, scene.fogColor)

      /**
       * 先套邊界的濃霧，再套洞穴
       *
       * 兩者不會同時發生（箱庭離邊界四十二格），順序只是為了讓洞裡的霧說了算
       */
      const edgeRatio = getEdgeFogRatio(position.x, position.z)
      /** 量在這裡、放上大氣狀態，其他人讀它就好，不必各自再算一次 */
      atmosphere.edgeRatio = edgeRatio
      const edgeFogStart = atmosphere.fogStart + (EDGE_FOG_START - atmosphere.fogStart) * edgeRatio
      const edgeFogEnd = atmosphere.fogEnd + (EDGE_FOG_END - atmosphere.fogEnd) * edgeRatio

      const caveFogStart = edgeFogStart + (CAVE_FOG_START - edgeFogStart) * caveRatio
      const caveFogEnd = edgeFogEnd + (CAVE_FOG_END - edgeFogEnd) * caveRatio
      const waterFogStart = caveFogStart * (1 - waterRatio)
      const waterFogEnd = caveFogEnd + (WATER_FOG_END - caveFogEnd) * waterRatio

      /**
       * 熔岩收在最後
       *
       * 前面每一層都是「看得比較近」，熔岩是「看不到」。
       * 擺在最後面，不管人是從洞裡、水裡還是地表沉進去的，
       * 出來的都是同一片紅
       */
      scene.fogStart = waterFogStart * (1 - lavaRatio)
      scene.fogEnd = waterFogEnd + (LAVA_FOG_END - waterFogEnd) * lavaRatio

      scene.clearColor.set(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b, 1)

      /**
       * 還看得見多少天空
       *
       * 洞裡、水下、熔岩裡與貼近邊界時都等於零。
       * 大氣透視、雲影與葉片透光共用這一項——
       * 三者的前提是同一件事：頭上那片天還在
       */
      const openSkyRatio = (1 - caveRatio) * (1 - waterRatio) * (1 - lavaRatio) * (1 - edgeRatio)

      /**
       * 中距離那層空氣的顏色
       *
       * 要接在霧色算完之後：大氣透視是拿最終的霧色往天色偏過去的，
       * 讀到還沒疊上洞穴與水面的那一份就會對不起來。
       *
       * 洞裡、水下、熔岩裡與貼近邊界時一律收回純霧色——
       * 那幾處都沒有天空可以散射，硬給一層藍只會顯得莫名其妙
       */
      updateAerialAir(
        scene.fogColor,
        atmosphere.skyMidColor,
        openSkyRatio,
        sunLight ? -sunLight.direction.y : 1,
        devToggle.aerialPerspective,
      )

      /**
       * 夜裡的補光
       *
       * 場景的 ambientColor 在著色器裡是加在光照上、再乘上反照率的那一項，
       * 而方塊光正是烘在反照率裡。所以這道補光除了讓夜色不至於全黑，
       * 更重要的是讓燈火照到的那幾面照比例亮起來——沒有它，
       * 烘進去的燈光會跟著夜色一起被壓掉，燈只照得亮自己
       */
      scene.ambientColor.copyFrom(atmosphere.fillColor)

      const weatherRatio = atmosphere.lightRatio + atmosphere.flashRatio * 1.4
      /**
       * 天光走自己那一份
       *
       * 陰天不是變暗，是光的來源換了：太陽被雲蓋住，
       * 整片天空變成一盞巨大的柔光燈。平行光收到只剩一成二讓影子消失，
       * 天光同時補上來，畫面才會是「陰而亮」而不是「傍晚」
       */
      const skyRatio = atmosphere.ambientRatio + atmosphere.flashRatio * 1.4

      /**
       * 洞裡照不到太陽，但不能真的全黑
       *
       * 完全沒有光的話玩家連路都看不到，
       * 保留一份微光當作岩壁的反射，剛好夠摸黑前進
       */
      const ambientRatio = skyRatio * (1 - caveRatio) + CAVE_AMBIENT_RATIO * caveRatio

      /**
       * 環境光隨腳下的方塊染色
       *
       * 取樣本身節流到每 0.4 秒一次，套用的顏色則是每幀慢慢趨近，
       * 兩件事分開：取樣省成本，趨近才看不出跳動
       */
      groundTintElapsed += deltaTime
      if (groundTintElapsed >= GROUND_TINT_SAMPLE_INTERVAL) {
        groundTintElapsed = 0
        groundTintSample = sampleGroundTint()
      }
      const groundTintGoal = groundTintSample
        ? Color3.Lerp(atmosphere.ambientGroundColor, groundTintSample, GROUND_TINT_MIX_RATIO)
        : atmosphere.ambientGroundColor
      Color3.LerpToRef(groundTintColor, groundTintGoal, Math.min(1, deltaTime * 2), groundTintColor)

      if (ambientLight) {
        /**
         * 洞裡的環境光要有下限
         *
         * 地表的環境光是跟著日夜走的，入夜之後只剩三成。
         * 洞裡本來就沒有天光，再乘上夜晚的三成會黑到連石壁都摸不到——
         * 而洞裡是不分晝夜的，那份微光代表的是岩壁自己的反射
         */
        const caveAmbient = Math.max(atmosphere.ambientIntensity, CAVE_AMBIENT_FLOOR)
        const ambientIntensity = atmosphere.ambientIntensity * (1 - caveRatio)
          + caveAmbient * caveRatio

        ambientLight.intensity = ambientIntensity * ambientRatio
        ambientLight.diffuse.copyFrom(atmosphere.ambientSkyColor)
        ambientLight.groundColor.copyFrom(groundTintColor)
      }
      if (sunLight) {
        sunLight.intensity = atmosphere.lightIntensity * weatherRatio * (1 - caveRatio)
        sunLight.diffuse.copyFrom(atmosphere.lightColor)
        /**
         * 高光另外收
         *
         * Babylon 只用 intensity 同時縮放漫射與高光，但這兩件事
         * 在天氣上的反應完全不同：雲層把太陽打散之後，天空整片還是亮的，
         * 漫射只變柔；高光卻需要一個又小又亮的點，那是最先被抹掉的。
         *
         * 沒有這一行的話，暴雨裡的濕地面會被太陽打出一道刺眼的反光，
         * 池面也還在閃——明明抬頭連太陽在哪都看不出來
         */
        const specular = atmosphere.specularRatio * (1 - caveRatio)
        sunLight.specular.set(specular, specular, specular)
      }

      /**
       * 雲影與葉片透光都吃「直射陽光還剩幾成」
       *
       * 兩者要的是同一件事：天上有沒有一顆又小又亮的太陽。
       * 雲層把它打散之後，地上不會有一塊一塊的暗（光是從四面八方來的），
       * 逆光的葉子也不會亮起來（沒有一道明確的方向可以透）。
       * specularRatio 量的正是這個，直接拿來用
       */
      const directSunRatio = atmosphere.specularRatio * openSkyRatio

      updateCloudShadow(
        sunLight?.direction ?? SUN_DIRECTION,
        directSunRatio,
        devToggle.cloudShadow,
      )

      /**
       * 球諧天光的方向性，跟著「還看不看得見一片有顏色的天」走
       *
       * 乘上天光本身的強度（夜裡天光只剩三成，偶極也跟著淡），
       * 再乘上開闊程度與直射陽光的比例：雨天整片天是均勻的灰，沒有哪一側比較亮
       */
      updateSkyLight(
        {
          zenithColor: atmosphere.skyZenithColor,
          midColor: atmosphere.skyMidColor,
          horizonColor: atmosphere.baseFogColor,
          glowColor: atmosphere.skyGlowColor,
          counterColor: atmosphere.skyCounterColor,
          glowStrength: atmosphere.skyGlowStrength,
          sunDirection: atmosphere.sunDirection,
          strength: devToggle.skylightSh ? ambientRatio * directSunRatio : 0,
        },
        deltaTime,
      )

      /**
       * 透光的量跟著光源自己的強度走
       *
       * 上面那一行剛算完的 sunLight.intensity 已經把天氣、時刻與洞穴
       * 全部疊完了，是這一刻陽光真正的強度。夜裡換成月光時它會掉到很低，
       * 葉子也就跟著不再發亮——月光確實透不過一片葉子
       */
      updateLeafTranslucency(
        sunLight?.direction ?? SUN_DIRECTION,
        atmosphere.lightColor,
        directSunRatio * Math.min(1, sunLight?.intensity ?? 0),
        devToggle.leafTranslucency,
      )

      /**
       * 全局光跟著已經算完的陽光走
       *
       * sunLight.intensity 在上面幾行已經疊完天氣、時刻與洞穴，
       * 是這一刻陽光真正的強度——直射光種子該用的是這個數字，
       * 而不是還沒疊過任何東西的日夜基準值
       */
      voxelGi?.update(
        deltaTime,
        sunLight?.direction ?? SUN_DIRECTION,
        atmosphere.lightColor,
        sunLight?.intensity ?? 0,
      )
    }

    const observer = scene.onBeforeRenderObservable.add(() => {
      measureSection('漫遊控制器', () => {
        /**
         * 下限也要夾：deltaTime 是兩次時間戳相減，時鐘被校正往回撥時會是負的，
         * 負的 deltaTime 會讓人倒著走、重力往上拉
         */
        const deltaTime = clamp(scene.getEngine().getDeltaTime() / 1000, { min: 0, max: 0.05 })

        /**
         * 視角旋轉
         *
         * 手機讀觸控累積的位移、桌機讀累積的滑鼠位移（各自只會有一邊有值），
         * 兩邊都是每一幀原封不動套用一次。
         * 不做慣性也不補間，滑鼠移多少畫面就轉多少，掉幀時也不會多轉
         */
        const mouseLook = consumeMouseLookDelta()
        camera.rotation.y += mouseLook.deltaX + touchLookDelta.x
        camera.rotation.x += mouseLook.deltaY + touchLookDelta.y
        touchLookDelta.x = 0
        touchLookDelta.y = 0
        camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.rotation.x))

        /** 依攝影機朝向算出水平移動方向 */
        const yaw = camera.rotation.y
        const forwardX = Math.sin(yaw)
        const forwardZ = Math.cos(yaw)
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)

        let moveX = 0
        let moveZ = 0

        if (checkControlActive()) {
          if (keys.isForwardPressed) {
            moveX += forwardX
            moveZ += forwardZ
          }
          if (keys.isBackwardPressed) {
            moveX -= forwardX
            moveZ -= forwardZ
          }
          if (keys.isLeftPressed) {
            moveX -= rightX
            moveZ -= rightZ
          }
          if (keys.isRightPressed) {
            moveX += rightX
            moveZ += rightZ
          }

          if (joystick.x !== 0 || joystick.z !== 0) {
            moveX += forwardX * (-joystick.z) + rightX * joystick.x
            moveZ += forwardZ * (-joystick.z) + rightZ * joystick.x
          }
        }

        /**
         * 熔岩與水共用同一套沉浮
         *
         * 兩者的物理是一樣的：踩不住、會往下沉、按跳躍才浮得上來。
         * 差別全在感受——水是可以游的，熔岩是掉進去就完了。
         * 那個差別用視覺講（整片視野燒紅），不用物理講
         */
        const inLava = isInWater(worldState, position.x, position.y, position.z, isLavaBlock)
        isSwimming.value = inLava || isInWater(worldState, position.x, position.y, position.z)

        const moveLength = Math.hypot(moveX, moveZ)
        const isSprinting = keys.isSprintPressed || touchButton.isSprintPressed
        const shouldJump = checkControlActive() && (keys.isJumpPressed || touchButton.isJumpPressed)

        if (moveLength > 0) {
          const analogRatio = joystick.magnitude > 0 ? joystick.magnitude : 1
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

        /**
         * 位置更新完立刻繞回世界內
         *
         * 要在鏡頭定位之前做完，否則跨過邊界的那一幀鏡頭會停在界外，
         * 下一幀才跳回來——那一下就是唯一會露餡的地方
         */
        position.x = wrapAxis(result.x)
        position.y = result.y
        position.z = wrapAxis(result.z)
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

        updateAtmosphere(deltaTime)
      })
    })

    cleanup = () => {
      scene.onBeforeRenderObservable.remove(observer)
    }
  }

  /** 直接把玩家送到指定座標，方便快速旅行 */
  function teleport(x: number, y: number, z: number) {
    position.x = wrapAxis(x)
    position.y = y
    position.z = wrapAxis(z)
  }

  return {
    start,
    applyInput,
    applyControl,
    teleport,
    isPaused,
    isCursorFree,
    isSwimming,
    isUnderground,
    position,
  }
}
