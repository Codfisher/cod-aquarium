/** 快門無雙：鱈魚拿相機被一大群海怪包圍，每按一次快門就收服一片。
 *
 * 「拍」在中文裡同時是拍照與拍打，所以相機當武器不需要任何解釋。
 * 被拍到的海怪不是被打倒，是被收服成一張照片飛走——分數就是收服了幾隻。
 *
 * 設計核心是把「被包圍」從危機翻轉成機會：一張照片框住越多隻倍率越高，
 * 所以玩家會願意放敵人聚成一團再蓄滿一發。判定與難度全在 shutter-musou-logic。
 */
import type { GamePointerEvent, MiniGameFactory, MiniGameInstance } from '../game-contract'
import type { EnemyView } from './shutter-musou-enemies'
import type { ComposureState, EnemyKind, FlashCone } from './shutter-musou-logic'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { COD_LYING_LIFT, createCodModel } from '../../cod-model'
import { computeDecayingWobble, easeInBack, easeInCubic, easeOutCubic } from '../../shared/easing'
import { clamp, createRandomGenerator, randomBetween } from '../../shared/random-generator'
import { ARENA_TOP_Y, createArenaScene } from './shutter-musou-arena'
import { createCameraProp } from './shutter-musou-camera-prop'
import { createShutterEffects } from './shutter-musou-effects'
import { createEnemyView, disposeEnemyMaterialCache } from './shutter-musou-enemies'
import {
  advanceBattery,
  advanceInvulnerable,
  advanceMusouGauge,
  applyContactDamage,
  BATTERY_CAPACITY,
  canFireShutter,
  capChargeRatioByBattery,
  COMPOSURE_MAX,
  computeFlashCone,
  dampAngle,
  ENEMY_STATS_MAP,
  getChargeRatio,
  getFacingHeading,
  getGroupBonusMultiplier,
  getMusouGaugeGain,
  getShutterCost,
  getSpawnBatchCount,
  getSpawnIntervalSeconds,
  GROUP_TOAST_THRESHOLD,
  INITIAL_COMPOSURE_STATE,
  isDefeated,
  isMusouReady,
  isTargetInCone,
  isVulnerable,
  JELLY_SPLIT_COUNT,
  KNOCKBACK_DISTANCE,
  MAX_ACTIVE_ENEMY_COUNT,
  MUSOU_GAUGE_MAX,
  MUSOU_ULTIMATE_CONE,
  OCTOPUS_FIRST_SECONDS,
  OCTOPUS_INTERVAL_SECONDS,
  pickEnemyKind,
  resolveAimDirection,
  resolveSpawnPosition,
} from './shutter-musou-logic'

/** 鱈魚縮放。俯視斜角下約佔畫面 15%，低多邊在這個距離最耐看 */
const FISH_SCALE = 0.5
/** 側躺角：讓背鰭朝鏡頭、單眼朝天，與箱庭同一套姿態 */
const LYING_ROLL = -Math.PI / 2
/** 鱈魚站在台面上的離地高度 */
const FISH_BASE_Y = ARENA_TOP_Y

/** 鏡頭俯角與距離。固定不跟隨——這款要的是看清楚四面八方的包圍圈 */
const CAMERA_BETA = Math.PI / 3.1
const CAMERA_RADIUS_LANDSCAPE = 23
const CAMERA_RADIUS_PORTRAIT = 30

/** 血條只掛在要拍不只一次的敵人頭上，其餘雜兵一拍就走沒有這個資訊可看。
 * 數值是血條相對台面的高度，體型愈大掛愈高，才不會插進魚身裡
 */
const ENEMY_HP_BAR_HEIGHT_MAP: Partial<Record<EnemyKind, number>> = {
  starfish: 0.55,
  octopus: 1.35,
}

/** 每種海怪的池子大小。水母要多一點，因為牠被收服時會分裂 */
const POOL_SIZE_MAP: Record<EnemyKind, number> = {
  shrimp: 40,
  crab: 20,
  jelly: 26,
  starfish: 14,
  octopus: 3,
}

/** 收服演出的總時長。前段蓄力下壓、後段彈射上飄 */
const CAPTURE_ANIM_SECONDS = 0.42
/** 收服演出裡「反向蓄力」佔的比例：先下沉壓扁，飛出去才有彈射感 */
const CAPTURE_WINDUP_RATIO = 0.2
/** 蓄力下壓的深度 */
const CAPTURE_SINK_DEPTH = 0.12
/** 被閃光掃到但還沒被收服時的白化殘留時間 */
const HIT_FLASH_SECONDS = 0.22

/** 無敵時間內被碰到的消散演出：只安靜下沉縮小，不上飛、不自旋、不閃光，
 * 讀起來像「擦身而過就散了」，跟被拍收服（金光起飛自旋）、撞擊耗鎮定（瞬間爆散碎片）都不同
 */
const DODGE_ANIM_SECONDS = 0.22
const DODGE_SINK_DEPTH = 0.22

/** 打擊停頓：拍中敵人時全場凍一瞬，重量感從停頓來。
 * 凍結只吃掉傳給世界模擬的 deltaSeconds，渲染照常、判定邏輯不變
 */
const HIT_FREEZE_SECONDS = 0.045
const CAPTURE_FREEZE_SECONDS = 0.07
/** 無雙必殺的停頓：比一般收服再重一截，重量感要配得上「無雙」兩個字 */
const ULTIMATE_FREEZE_SECONDS = 0.16
/** 相機 punch：擊中瞬間 FOV 微縮再彈回的衰減震盪時長 */
const CAMERA_PUNCH_SECONDS = 0.15
const NORMAL_CAMERA_PUNCH_MAGNITUDE = 0.028
const ULTIMATE_CAMERA_PUNCH_MAGNITUDE = 0.065

interface ActiveEnemy {
  view: EnemyView;
  kind: EnemyKind;
  x: number;
  z: number;
  /** 還要被拍幾次 */
  remainHitCount: number;
  /** 收服演出的進度，大於 0 代表正在消失中 */
  captureElapsed: number;
  /** 被閃光掃到的白化殘留 */
  hitFlashRemain: number;
  /** 無敵時間內被碰到的消散進度，大於 0 代表正在安靜下沉消失中 */
  dodgeElapsed: number;
  /** 螃蟹的衝刺冷卻。倒數到 0 且離魚夠近時，下一跳會變成大步衝刺 */
  dashCooldown: number;
  /** 每隻的繞行偏移，一群同時朝魚走才不會疊成一直線 */
  approachOffset: number;
  /** 跳躍節奏的位置模擬：每一跳的起訖點與計時都在這裡決定，
   * 落地後原地貼著不動到下一跳開始，才是真的一跳一跳前進，不是連續滑行
   */
  hopElapsed: number;
  hopDuration: number;
  restDuration: number;
  hopStartX: number;
  hopStartZ: number;
  hopTargetX: number;
  hopTargetZ: number;
  /** 水母被拍到時能不能再分裂。只有原生水母能分裂，分裂出來的小水母不行，
   * 否則場上水母只會越打越多、永遠清不完
   */
  canSplit: boolean;
  isActive: boolean;
}

export const createShutterMusouGame: MiniGameFactory = (context): MiniGameInstance => {
  const { scene, camera, lighting, isDark } = context
  const random = createRandomGenerator(Math.floor(Math.random() * 1e6))

  const arena = createArenaScene(scene, isDark)
  const effects = createShutterEffects(scene, camera, ARENA_TOP_Y)
  lighting.addShadowCaster(...arena.shadowCasterList)

  // --- 鱈魚 ---
  const fishRoot = new TransformNode('shutterMusouFishRoot', scene)
  // 俯視取景：瞳孔看向兩側才落在輪廓邊緣讀得出來，看正前方只剩一顆白球
  const codModel = createCodModel(scene, { pupilGazeMode: 'sideways' })
  codModel.lieNode.rotation.z = LYING_ROLL
  codModel.rootNode.parent = fishRoot
  codModel.rootNode.scaling.setAll(FISH_SCALE)
  // 依設計原則只投影主體大件：鰭與眼睛這些細薄件不進陰影投射
  lighting.addShadowCaster(codModel.bodyMesh)

  // 手上的相機：掛在 fishRoot 而不是側躺節點，才會跟著瞄準方向轉而不被側躺翻滾牽動
  const cameraProp = createCameraProp(scene, fishRoot)
  lighting.addShadowCaster(...cameraProp.meshList)

  /** 鱈魚固定站在擂台正中央，只轉不移動——四面被圍時「能不能及時轉過去」才是重點 */
  const fishX = 0
  const fishZ = 0
  let fishHeading = 0

  // --- 敵人池 ---
  const enemyPoolMap = new Map<EnemyKind, ActiveEnemy[]>()
  const activeEnemyList: ActiveEnemy[] = []
  let poolSerialNumber = 0

  for (const kind of Object.keys(POOL_SIZE_MAP) as EnemyKind[]) {
    const poolList: ActiveEnemy[] = []
    for (let index = 0; index < POOL_SIZE_MAP[kind]; index++) {
      // 種子綁池索引：每一隻在建立時就長得不一樣，取用時完全不必碰幾何
      const view = createEnemyView(scene, kind, poolSerialNumber++)
      view.root.setEnabled(false)
      poolList.push({
        view,
        kind,
        x: 0,
        z: 0,
        remainHitCount: 0,
        captureElapsed: 0,
        hitFlashRemain: 0,
        dodgeElapsed: 0,
        dashCooldown: 0,
        approachOffset: 0,
        canSplit: true,
        isActive: false,
        hopElapsed: 0,
        hopDuration: 0.34,
        restDuration: 0.16,
        hopStartX: 0,
        hopStartZ: 0,
        hopTargetX: 0,
        hopTargetZ: 0,
      })
    }
    enemyPoolMap.set(kind, poolList)
  }

  // --- 遊戲狀態 ---
  let elapsedSeconds = 0
  let spawnTimer = 0
  let octopusTimer = OCTOPUS_FIRST_SECONDS
  let battery = BATTERY_CAPACITY
  /** 無雙槽：蓄滿後下一次放開快門會變成必殺，由玩家自己挑時機 */
  let musouGauge = 0
  let captureTotal = 0
  let composureState: ComposureState = { ...INITIAL_COMPOSURE_STATE }
  let isFinished = false

  /** 蓄力與瞄準 */
  let isCharging = false
  let chargeSeconds = 0
  let aimRadians = 0
  /** 指標目前落在畫面的哪裡（比例）。魚在畫面中心，所以這就是瞄準方向 */
  let pointerXRatio = 0.5
  let pointerYRatio = 0.5

  let cameraRadius = CAMERA_RADIUS_LANDSCAPE

  /** 打擊停頓的剩餘時間。凍結期間世界模擬吃零時距 */
  let freezeSecondsRemaining = 0
  /** 相機 punch 的進度。跑滿 CAMERA_PUNCH_SECONDS 表示沒有 punch 在跑 */
  let cameraPunchElapsed = CAMERA_PUNCH_SECONDS
  /** 這次 punch 的強度：一般收服跟無雙必殺力道不同 */
  let cameraPunchMagnitude = NORMAL_CAMERA_PUNCH_MAGNITUDE
  const cameraBaseFov = camera.fov

  function spawnEnemy(kind: EnemyKind, x: number, z: number, canSplit = true): void {
    if (activeEnemyList.length >= MAX_ACTIVE_ENEMY_COUNT) {
      return
    }
    const poolList = enemyPoolMap.get(kind)
    if (!poolList) {
      return
    }
    const enemy = poolList.find((candidate) => !candidate.isActive)
    // 池子抽乾就跳過這次生成，寧可少出一隻也不要為了出怪而重建幾何
    if (!enemy) {
      return
    }
    const stats = ENEMY_STATS_MAP[kind]
    enemy.x = x
    enemy.z = z
    enemy.remainHitCount = stats.captureHitCount
    enemy.captureElapsed = 0
    enemy.hitFlashRemain = 0
    enemy.dodgeElapsed = 0
    enemy.dashCooldown = randomBetween(random, 1.4, 3.2)
    enemy.approachOffset = randomBetween(random, -0.7, 0.7)
    enemy.canSplit = canSplit
    enemy.isActive = true
    // 跳躍節奏比照 FlopController 的預設（hopDuration 0.34、restDuration 0.16），
    // 每隻週期各異、起訖點先釘在原地，第一幀的 hopElapsed 一到就會決定第一跳
    enemy.hopDuration = randomBetween(random, 0.3, 0.38)
    enemy.restDuration = randomBetween(random, 0.13, 0.19)
    enemy.hopElapsed = randomBetween(random, 0, enemy.hopDuration + enemy.restDuration)
    enemy.hopStartX = x
    enemy.hopStartZ = z
    enemy.hopTargetX = x
    enemy.hopTargetZ = z
    enemy.view.root.position.set(x, ARENA_TOP_Y, z)
    enemy.view.root.scaling.setAll(1)
    enemy.view.setOverexposure(0)
    enemy.view.root.setEnabled(true)
    activeEnemyList.push(enemy)
  }

  function releaseEnemy(enemy: ActiveEnemy): void {
    enemy.isActive = false
    enemy.view.root.setEnabled(false)
    const index = activeEnemyList.indexOf(enemy)
    if (index >= 0) {
      activeEnemyList.splice(index, 1)
    }
  }

  function spawnWave(): void {
    const batchCount = getSpawnBatchCount(elapsedSeconds)
    // 同一批從相近的角度上岸，才會形成一團而不是均勻散開——
    // 聚成團正是玩家想要的拍照機會
    const baseAngle = randomBetween(random, 0, Math.PI * 2)
    for (let index = 0; index < batchCount; index++) {
      const angle = baseAngle + randomBetween(random, -0.45, 0.45)
      const position = resolveSpawnPosition(angle)
      spawnEnemy(pickEnemyKind(elapsedSeconds, random), position.x, position.z)
    }
  }

  /** 水母被收服時分裂出小水母，清得越快場上反而越亂——但小水母不能再分裂，
   * 否則水母永遠打不完
   */
  function splitJelly(x: number, z: number): void {
    for (let index = 0; index < JELLY_SPLIT_COUNT; index++) {
      const angle = randomBetween(random, 0, Math.PI * 2)
      spawnEnemy('jelly', x + Math.cos(angle) * 0.9, z + Math.sin(angle) * 0.9, false)
    }
  }

  /** 開一槍：把扇形內的敵人全部處理掉，回傳這一發收服了幾隻。
   * isUltimate 是無雙必殺專用：疊加一層擴散光環與更重的停頓，取代原本
   * 「螢幕整片染色＋連續自動開火」那套讓人不舒服的做法
   */
  function fireShutter(cone: FlashCone, shotAimRadians: number, isUltimate = false): number {
    effects.playFlash(fishX, fishZ, shotAimRadians, cone)
    if (isUltimate) {
      effects.playUltimateFlash(fishX, fishZ)
    }
    cameraProp.triggerFlash()

    let captureCount = 0
    let hitCount = 0
    // 反向遍歷：收服會就地移除元素，正向走會跳號
    for (let index = activeEnemyList.length - 1; index >= 0; index--) {
      const enemy = activeEnemyList[index]!
      if (enemy.captureElapsed > 0) {
        continue
      }
      const stats = ENEMY_STATS_MAP[enemy.kind]
      if (!isTargetInCone(fishX, fishZ, shotAimRadians, cone, enemy.x, enemy.z, stats.bodyRadius)) {
        continue
      }
      enemy.remainHitCount -= 1
      hitCount += 1
      if (enemy.remainHitCount > 0) {
        // 還沒收服：白化一下當作打到的回饋
        enemy.hitFlashRemain = HIT_FLASH_SECONDS
        continue
      }
      enemy.captureElapsed = 1e-4
      captureCount += stats.captureValue
      effects.burstScrap(enemy.x, ARENA_TOP_Y + 0.4, enemy.z, enemy.kind === 'octopus' ? 14 : 5, index + 1, shotAimRadians)
      if (enemy.kind === 'jelly' && enemy.canSplit) {
        splitJelly(enemy.x, enemy.z)
      }
    }

    // 打中東西才有停頓與相機 punch。空揮不給回饋，玩家才分得出有沒有掃到。
    // 必殺的停頓與 punch 都加重一截，重量感要配得上「無雙」兩個字
    if (hitCount > 0) {
      freezeSecondsRemaining = Math.max(
        freezeSecondsRemaining,
        (isUltimate ? ULTIMATE_FREEZE_SECONDS : null)
        ?? (captureCount > 0 ? CAPTURE_FREEZE_SECONDS : HIT_FREEZE_SECONDS),
      )
      cameraPunchElapsed = 0
      cameraPunchMagnitude = isUltimate ? ULTIMATE_CAMERA_PUNCH_MAGNITUDE : NORMAL_CAMERA_PUNCH_MAGNITUDE
    }

    if (captureCount > 0) {
      // 團體照倍率直接灌進分數：一次拍到越多隻，這一發的分數漲得越快
      captureTotal += Math.round(captureCount * getGroupBonusMultiplier(captureCount))
      context.reportScore(captureTotal)
      if (isUltimate) {
        context.reportToast(`全景快門 ×${captureCount}！`)
      }
      else if (captureCount >= GROUP_TOAST_THRESHOLD) {
        context.reportToast(`團體照 ×${captureCount}！`)
      }
    }
    if (!isUltimate) {
      musouGauge = advanceMusouGauge(musouGauge, getMusouGaugeGain(captureCount))
    }
    return captureCount
  }

  function beginCharge(): void {
    if (isFinished) {
      return
    }
    isCharging = true
    chargeSeconds = 0
  }

  function releaseCharge(): void {
    if (!isCharging || isFinished) {
      return
    }
    isCharging = false
    const chargedSeconds = chargeSeconds
    chargeSeconds = 0

    if (!canFireShutter(battery)) {
      // 電量見底：快門空響，給一點回饋但不扣連段
      context.reportToast('沒電了⋯')
      return
    }
    const cappedRatio = capChargeRatioByBattery(getChargeRatio(chargedSeconds), battery)
    battery = Math.max(0, battery - getShutterCost(cappedRatio))
    fireShutter(computeFlashCone(cappedRatio), aimRadians)
  }

  /** 無雙必殺存在 HUD 角落的按鈕上，蓄滿才會出現，玩家自己挑時機點——
   * 不會因為剛好在瞄準蓄力就被強迫升級成必殺，一般快門與必殺是兩個獨立操作
   */
  function triggerUltimate(): void {
    if (isFinished || !isMusouReady(musouGauge)) {
      return
    }
    musouGauge = 0
    fireShutter(MUSOU_ULTIMATE_CONE, aimRadians, true)
  }

  function updateFish(deltaSeconds: number): void {
    const aim = resolveAimDirection(pointerXRatio, pointerYRatio, context.getAspectRatio())
    if (aim.hasDirection) {
      aimRadians = Math.atan2(aim.directionZ, aim.directionX)
    }

    // 蓄力時轉得慢一些：大範圍的一發要「架好」才打得出去，
    // 這讓玩家決定蓄多滿時多了一層取捨
    const turnRate = isCharging ? 9 : 15
    fishHeading = dampAngle(
      fishHeading,
      getFacingHeading(aim.hasDirection ? aim.directionX : Math.cos(aimRadians), aim.hasDirection ? aim.directionZ : Math.sin(aimRadians)),
      turnRate,
      deltaSeconds,
    )
    fishRoot.rotation.y = fishHeading

    // 被撞到後閃爍，讓玩家知道自己正在無敵
    const isBlinking = !isVulnerable(composureState) && Math.sin(elapsedSeconds * 28) > 0
    for (const mesh of codModel.meshList) {
      mesh.visibility = isBlinking ? 0.35 : 1
    }

    codModel.update({
      deltaSeconds,
      // 定點不移動，但蓄力時讓鰭划動，看得出在使力
      isMoving: isCharging,
      // 盯著瞄準方向，鱈魚看起來就像在取景
      gazeTarget: new Vector3(
        Math.cos(aimRadians) * 4,
        FISH_BASE_Y + 0.4,
        Math.sin(aimRadians) * 4,
      ),
    })

    cameraProp.animate(elapsedSeconds, isCharging)
    cameraProp.update(deltaSeconds)
  }

  function updateEnemyList(deltaSeconds: number): void {
    for (let index = activeEnemyList.length - 1; index >= 0; index--) {
      const enemy = activeEnemyList[index]!
      const stats = ENEMY_STATS_MAP[enemy.kind]

      // --- 收服演出：蓄力下壓 → 彈射上飄、加速自旋著縮沒 ---
      if (enemy.captureElapsed > 0) {
        enemy.captureElapsed += deltaSeconds
        const ratio = clamp(enemy.captureElapsed / CAPTURE_ANIM_SECONDS, 0, 1)
        enemy.view.setOverexposure(1)
        if (ratio < CAPTURE_WINDUP_RATIO) {
          // 預備動作：往下壓扁蓄力，之後的上飄才有「被吸進相片」的彈射感
          const windup = easeInBack(ratio / CAPTURE_WINDUP_RATIO)
          enemy.view.root.position.y = ARENA_TOP_Y - windup * CAPTURE_SINK_DEPTH
          enemy.view.root.scaling.set(1 + windup * 0.16, 1 - windup * 0.28, 1 + windup * 0.16)
        }
        else {
          const flyRatio = (ratio - CAPTURE_WINDUP_RATIO) / (1 - CAPTURE_WINDUP_RATIO)
          // 上飄快出慢停、縮小慢起快收：起飛猛、收尾像被捲進遠方
          enemy.view.root.position.y = ARENA_TOP_Y - CAPTURE_SINK_DEPTH + easeOutCubic(flyRatio) * 1.7
          const shrink = Math.max(0.02, 1 - easeInCubic(flyRatio))
          // 壓扁在起飛初段回正，不會一瞬彈回
          const squashRemain = 1 - easeOutCubic(Math.min(1, flyRatio * 4))
          enemy.view.root.scaling.set(
            shrink * (1 + 0.16 * squashRemain),
            shrink * (1 - 0.28 * squashRemain),
            shrink * (1 + 0.16 * squashRemain),
          )
        }
        // 自旋越轉越快，不是等速的陀螺
        enemy.view.root.rotation.y += deltaSeconds * 16 * ratio
        if (ratio >= 1) {
          releaseEnemy(enemy)
        }
        continue
      }

      // --- 無敵時間內被碰到：安靜下沉消失，跟上面的收服演出區隔開 ---
      if (enemy.dodgeElapsed > 0) {
        enemy.dodgeElapsed += deltaSeconds
        const dodgeRatio = clamp(enemy.dodgeElapsed / DODGE_ANIM_SECONDS, 0, 1)
        const dodgeEased = easeInCubic(dodgeRatio)
        enemy.view.root.position.y = ARENA_TOP_Y - dodgeEased * DODGE_SINK_DEPTH
        enemy.view.root.scaling.setAll(Math.max(0.02, 1 - dodgeEased))
        if (dodgeRatio >= 1) {
          releaseEnemy(enemy)
        }
        continue
      }

      if (enemy.hitFlashRemain > 0) {
        enemy.hitFlashRemain = Math.max(0, enemy.hitFlashRemain - deltaSeconds)
        // 快亮慢滅：亮起瞬間就是最亮，衰減走 easeOutCubic 拖一條殘光
        const fadeProgress = 1 - enemy.hitFlashRemain / HIT_FLASH_SECONDS
        enemy.view.setOverexposure(1 - easeOutCubic(fadeProgress))
      }

      // --- 移動：離散跳躍——落地後原地貼著到下一跳開始才動，不是連續滑行。
      // 位置模擬（起訖點、計時）全權在這裡決定，view.animate 只負責照著畫 ---
      const distanceNow = Math.hypot(fishX - enemy.x, fishZ - enemy.z)

      enemy.dashCooldown -= deltaSeconds
      enemy.hopElapsed += deltaSeconds
      const cycleDuration = enemy.hopDuration + enemy.restDuration
      if (enemy.hopElapsed >= cycleDuration) {
        enemy.hopElapsed -= cycleDuration

        // 這一跳的方向：路徑走法依種類各異，只在「決定下一跳」的瞬間算一次，
        // 不是每幀都重算——一跳落地前方向不會變，才會像真的在跳而不是滑
        const toFishX = fishX - enemy.hopTargetX
        const toFishZ = fishZ - enemy.hopTargetZ
        const toFishDistance = Math.hypot(toFishX, toFishZ)
        const directionX = toFishDistance > 1e-4 ? toFishX / toFishDistance : 1
        const directionZ = toFishDistance > 1e-4 ? toFishZ / toFishDistance : 0

        let hopSpeedMultiplier = 1
        let strafeRatio = enemy.approachOffset

        if (enemy.kind === 'crab') {
          // 螃蟹橫著走，冷卻好了且離魚夠近時，這一跳變成大步衝刺
          if (enemy.dashCooldown <= 0 && toFishDistance < 7) {
            hopSpeedMultiplier = 2.6
            strafeRatio = 0
            enemy.dashCooldown = randomBetween(random, 2.2, 4.4)
          }
          else {
            strafeRatio = enemy.approachOffset * 2.2
          }
        }
        else if (enemy.kind === 'jelly') {
          // 水母飄忽，每一跳的側向偏移各自重擲，路徑左右盪
          strafeRatio = Math.sin(elapsedSeconds * 1.7 + enemy.approachOffset * 6) * 1.4
        }

        const strafeX = -directionZ * strafeRatio
        const strafeZ = directionX * strafeRatio
        const moveX = directionX + strafeX
        const moveZ = directionZ + strafeZ
        const moveLength = Math.hypot(moveX, moveZ) || 1
        const hopDistance = stats.moveSpeed * hopSpeedMultiplier * cycleDuration

        enemy.hopStartX = enemy.hopTargetX
        enemy.hopStartZ = enemy.hopTargetZ
        enemy.hopTargetX = enemy.hopStartX + (moveX / moveLength) * hopDistance
        enemy.hopTargetZ = enemy.hopStartZ + (moveZ / moveLength) * hopDistance
        // 面向前進方向：敵人現在重用鱈魚模型，跟玩家魚同一套「+z 朝前」慣例，
        // 朝向角要用 getFacingHeading（atan2(x, z)），舊的 -atan2(z, x) 是給
        // 已經拿掉的舊怪物模型（+x 朝前）用的，套在魚身上方向會是錯的
        enemy.view.root.rotation.y = getFacingHeading(moveX, moveZ)
      }

      const isAirborne = enemy.hopElapsed < enemy.hopDuration
      if (isAirborne) {
        const hopProgress = enemy.hopElapsed / enemy.hopDuration
        enemy.x = enemy.hopStartX + (enemy.hopTargetX - enemy.hopStartX) * hopProgress
        enemy.z = enemy.hopStartZ + (enemy.hopTargetZ - enemy.hopStartZ) * hopProgress
        enemy.view.animate('hop', hopProgress, deltaSeconds)
      }
      else {
        // 貼地短停：位置釘死在這一跳的終點，下一跳開始前不會再挪動
        enemy.x = enemy.hopTargetX
        enemy.z = enemy.hopTargetZ
        const restProgress = enemy.restDuration > 0 ? (enemy.hopElapsed - enemy.hopDuration) / enemy.restDuration : 1
        enemy.view.animate('rest', restProgress, deltaSeconds)
      }
      enemy.view.root.position.x = enemy.x
      enemy.view.root.position.z = enemy.z

      // --- 撞到鱈魚 ---
      // 0.3 貼齊魚的視覺半寬（約 0.25）：致命判定不能大出看得到的輪廓，
      // 玩家才不會被看不見的邊界陰到
      if (distanceNow < stats.contactRadius + 0.3) {
        if (isVulnerable(composureState)) {
          composureState = applyContactDamage(composureState)
          // 撞到鱈魚的那隻直接消失（不再只是被推開），撞擊才有實際代價；
          // 給個小碎片噴散當作「消失」的回饋，不會顯得憑空不見
          effects.burstScrap(enemy.x, ARENA_TOP_Y + 0.3, enemy.z, enemy.kind === 'octopus' ? 10 : 4, index + 211, 0)
          releaseEnemy(enemy)
          // 其餘還在逼近的敵人推開，給玩家喘息空間
          for (const other of activeEnemyList) {
            const pushX = other.x - fishX
            const pushZ = other.z - fishZ
            const pushDistance = Math.hypot(pushX, pushZ)
            if (pushDistance > KNOCKBACK_DISTANCE || pushDistance < 1e-4) {
              continue
            }
            const scale = KNOCKBACK_DISTANCE / pushDistance
            other.x = fishX + pushX * scale
            other.z = fishZ + pushZ * scale
            // 推開的落點同時當作下一跳的起訖點，跳躍模擬才不會下一幀又把牠拉回原軌跡
            other.hopStartX = other.x
            other.hopStartZ = other.z
            other.hopTargetX = other.x
            other.hopTargetZ = other.z
            other.view.root.position.x = other.x
            other.view.root.position.z = other.z
          }
          if (isDefeated(composureState)) {
            isFinished = true
            context.reportGameOver()
          }
        }
        else {
          // 無敵時間內被碰到：不扣鎮定，但撞上的這隻也讓開消失——
          // 毫髮無傷又若無其事地黏在原地穿模很奇怪。改成安靜下沉的消散（見上方 dodgeElapsed），
          // 不放金光也不炸碎片，才不會跟真的收服／耗鎮定的消失方式混在一起看
          enemy.dodgeElapsed = 1e-4
        }
      }
    }
  }

  function updateSpawning(deltaSeconds: number): void {
    spawnTimer -= deltaSeconds
    if (spawnTimer <= 0) {
      spawnTimer = getSpawnIntervalSeconds(elapsedSeconds)
      spawnWave()
    }

    octopusTimer -= deltaSeconds
    if (octopusTimer <= 0) {
      octopusTimer = OCTOPUS_INTERVAL_SECONDS
      const position = resolveSpawnPosition(randomBetween(random, 0, Math.PI * 2))
      spawnEnemy('octopus', position.x, position.z)
      context.reportToast('大傢伙來了')
    }
  }

  function applyCameraFraming(): void {
    const aspectRatio = context.getAspectRatio()
    const isPortrait = aspectRatio < 0.9
    cameraRadius = isPortrait ? CAMERA_RADIUS_PORTRAIT : CAMERA_RADIUS_LANDSCAPE
    camera.alpha = -Math.PI / 2
    camera.beta = CAMERA_BETA
    camera.radius = cameraRadius
    camera.target.set(0, ARENA_TOP_Y, 0)
  }

  /** 擊中瞬間的 FOV 衰減震盪。吃真實時距，punch 要在停頓期間照樣跑完 */
  function updateCameraPunch(deltaSeconds: number): void {
    if (cameraPunchElapsed >= CAMERA_PUNCH_SECONDS) {
      return
    }
    cameraPunchElapsed += deltaSeconds
    if (cameraPunchElapsed >= CAMERA_PUNCH_SECONDS) {
      camera.fov = cameraBaseFov
      return
    }
    const punchRatio = clamp(cameraPunchElapsed / CAMERA_PUNCH_SECONDS, 0, 1)
    // FOV 微縮再彈回，畫面像被快門「咬」了一下
    camera.fov = cameraBaseFov * (1 - computeDecayingWobble(punchRatio, 2, 1.6) * cameraPunchMagnitude)
  }

  function update(deltaSeconds: number): void {
    // 打擊停頓：凍結期間把世界模擬的時距歸零，渲染照常。
    // 判定全在 logic 的純函式裡，吃零時距不會有行為偏差
    let simulationDelta = deltaSeconds
    if (freezeSecondsRemaining > 0) {
      freezeSecondsRemaining = Math.max(0, freezeSecondsRemaining - deltaSeconds)
      simulationDelta = 0
    }

    if (!isFinished) {
      elapsedSeconds += simulationDelta
    }

    composureState = advanceInvulnerable(composureState, simulationDelta)

    if (!isFinished) {
      if (isCharging) {
        chargeSeconds += simulationDelta
      }
      battery = advanceBattery(battery, simulationDelta)
      updateSpawning(simulationDelta)
    }

    updateFish(simulationDelta)
    updateEnemyList(simulationDelta)
    arena.update(simulationDelta)
    updateCameraPunch(deltaSeconds)

    const musouReady = isMusouReady(musouGauge)
    const chargeRatio = capChargeRatioByBattery(getChargeRatio(chargeSeconds), battery)
    // 無雙槽滿了就直接預覽必殺的全場範圍，玩家看得到「現在放手會怎樣」
    // 瞄準扇形只反映「這一發快門會掃到哪」。必殺就緒時刻意不改成整圈預覽：
    // 那會變成一片灰色的圓固定蓋在場上，反而看不清楚敵人在哪
    effects.setAimCone(
      isCharging,
      fishX,
      fishZ,
      aimRadians,
      computeFlashCone(chargeRatio),
      chargeRatio,
    )
    context.reportHudState({
      gaugeList: [
        { key: 'battery', ratio: battery / BATTERY_CAPACITY, tone: 'energy' },
        { key: 'musou', ratio: musouGauge / MUSOU_GAUGE_MAX, tone: 'ultimate' },
      ],
      pipRowList: [
        { key: 'composure', total: COMPOSURE_MAX, filled: composureState.composure, tone: 'life' },
      ],
      actionList: [
        { key: 'ultimate', label: '全景快門', isReady: musouReady },
      ],
    })
    effects.setEnemyHpBarList(
      activeEnemyList
        .filter((enemy) => (
          enemy.captureElapsed <= 0
          && enemy.dodgeElapsed <= 0
          && ENEMY_HP_BAR_HEIGHT_MAP[enemy.kind] !== undefined
          // 滿血不顯示：沒被拍過的敵人掛一條滿格血條只是噪音，
          // 掉了血才出現，血條本身就等於「這隻已經拍過了」的提示
          && enemy.remainHitCount < ENEMY_STATS_MAP[enemy.kind].captureHitCount
        ))
        .map((enemy) => ({
          x: enemy.x,
          y: ARENA_TOP_Y + ENEMY_HP_BAR_HEIGHT_MAP[enemy.kind]!,
          z: enemy.z,
          ratio: enemy.remainHitCount / ENEMY_STATS_MAP[enemy.kind].captureHitCount,
        })),
    )
    // 粒子與閃光跟著世界一起凍住，停頓那一瞬的畫面才是「定格」
    effects.update(simulationDelta)
  }

  function handlePointer(event: GamePointerEvent): void {
    // 任何指標事件都先更新瞄準：魚在畫面中心，手指按在哪一側就朝那一側，
    // 不必先拖一段距離才知道方向
    pointerXRatio = event.xRatio
    pointerYRatio = event.yRatio

    if (event.type === 'down') {
      beginCharge()
      return
    }
    if (event.type === 'move') {
      return
    }
    releaseCharge()
  }

  return {
    start() {
      applyCameraFraming()
      aimRadians = 0
      fishHeading = 0
      pointerXRatio = 0.5
      pointerYRatio = 0.5
      fishRoot.position.set(fishX, FISH_BASE_Y + COD_LYING_LIFT * FISH_SCALE, fishZ)
      context.reportScore(0)
      // 開場先放一小群，玩家一進來就有東西可以拍
      for (let index = 0; index < 3; index++) {
        const position = resolveSpawnPosition(randomBetween(random, 0, Math.PI * 2))
        spawnEnemy('shrimp', position.x, position.z)
      }
      update(0)
    },
    update,
    handlePointer,
    handleHudAction(actionKey) {
      if (actionKey === 'ultimate') {
        triggerUltimate()
      }
    },
    handleKey(event) {
      // 桌機的必殺：按鈕在右下角要移開滑鼠才點得到，等於得放掉瞄準，
      // 所以另外給一個鍵，原地就能放
      if (event.code === 'KeyQ' || event.key === 'q' || event.key === 'Q') {
        triggerUltimate()
        return
      }
      // 桌機：空白鍵按住蓄力、放開發射由 keyup 觸發不到（host 只轉發 keydown），
      // 所以改成按一次直接發一發最小範圍的快門
      if (event.code !== 'Space' && event.key !== ' ') {
        return
      }
      if (!isCharging) {
        beginCharge()
      }
      releaseCharge()
    },
    resize() {
      applyCameraFraming()
    },
    dispose() {
      for (const poolList of enemyPoolMap.values()) {
        for (const enemy of poolList) {
          enemy.view.dispose()
        }
      }
      enemyPoolMap.clear()
      activeEnemyList.length = 0
      disposeEnemyMaterialCache(scene)
      cameraProp.dispose()
      effects.dispose()
      arena.dispose()
      fishRoot.dispose()
    },
  }
}
