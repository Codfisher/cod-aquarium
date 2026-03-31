<template>
  <canvas
    v-once
    ref="canvasRef"
    class="w-full h-full outline-0"
  />
</template>

<script setup lang="ts">
import type { ArenaType, BattleResult as BattleResultType, BeybladeConfig, BeybladeState, BeybladeStats, Difficulty, PartCategory } from './types'
import type { useQteEngine } from './domains/qte/qte-engine'
import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import type { Mesh, ShaderMaterial } from '@babylonjs/core'
import { reactive, watch } from 'vue'
import { useBabylonScene } from './composables/use-babylon-scene'
import type { ArenaResult } from './domains/arena/arena-builder'
import { ARENA_RADIUS } from './domains/arena/arena-constants'
import { createArena } from './domains/arena/arena-builder'
import { applyObstacleCollision, detectObstacleCollision, getObstacleList, getZoneEffectAtPosition } from './domains/arena/obstacles'
import type { Obstacle } from './domains/arena/obstacles'
import { getTerrainProfile } from './domains/arena/terrain-profile'
import type { TerrainProfile } from './domains/arena/terrain-profile'
import { createBeybladeModel } from './domains/beyblade/builder'
import { calculateFinalStats } from './domains/beyblade/stats'
import { generateAiPartSelection, generateAiQteResult } from './domains/battle/ai-controller'
import { detectCollision, resolveCollision } from './domains/physics/collision'
import { createInitialState, MAX_SPIN_RATE, updateBeybladePhysics } from './domains/physics/spin-physics'
import { applyCameraShake, emitCollisionSparks } from './domains/renderer/collision-effect'
import { createOutlinePostProcess } from './domains/renderer/outline-post-process'
import { emitShockwave } from './domains/renderer/shockwave-effect'
import { setToonOpacity } from './domains/renderer/toon-material'
import type { useCinematicManager } from './domains/battle/cinematic-manager'
import { ARENA_RADIUS as ARENA_R } from './domains/arena/arena-constants'
import { BattlePhase } from './types'

const props = defineProps<{
  currentPhase: BattlePhase;
  playerConfig: BeybladeConfig;
  difficulty: Difficulty;
  arenaType: ArenaType;
  focusCategory: PartCategory | null;
  qteEngine: ReturnType<typeof useQteEngine>;
  cinematic: ReturnType<typeof useCinematicManager>;
}>()

const emit = defineEmits<{
  ready: [];
  battleEnd: [result: BattleResultType];
}>()

// --- 戰鬥狀態 ---
let playerStats: BeybladeStats
let aiConfig: BeybladeConfig
let aiStats: BeybladeStats
let playerState: BeybladeState
let aiState: BeybladeState
let playerCollisionRadius = 0.5
let aiCollisionRadius = 0.5
let playerFriction = 0.5
let aiFriction = 0.5

let playerModel: ReturnType<typeof createBeybladeModel> | null = null
let aiModel: ReturnType<typeof createBeybladeModel> | null = null
let previewModel: ReturnType<typeof createBeybladeModel> | null = null
let isBattleActive = false

const spinPercentData = reactive({ player: 100, ai: 100 })
defineExpose({ spinPercentData })

const {
  canvasRef,
  engine,
  scene,
  camera,
} = useBabylonScene({
  async init({ scene: currentScene, engine: currentEngine, camera: currentCamera }) {
    let currentArena = createArena(currentScene, props.arenaType)
    let currentTerrain = getTerrainProfile(props.arenaType)
    let currentObstacleList = getObstacleList(props.arenaType)

    // 監聽場地切換
    watch(() => props.arenaType, (newType) => {
      currentArena.dispose()
      currentArena = createArena(currentScene, newType)
      currentTerrain = getTerrainProfile(newType)
      currentObstacleList = getObstacleList(newType)
    })

    // 描邊後處理
    createOutlinePostProcess(currentScene, currentCamera)

    // 戰鬥中鏡頭緩慢自動旋轉
    let cameraAutoRotateSpeed = 0

    function getBowlY(distanceFromCenter: number): number {
      return currentTerrain.getHeightAtDistance(distanceFromCenter)
    }

    /** 累計時間，用於搖晃的正弦波 */
    let elapsedTime = 0

    function syncModelToState(
      model: ReturnType<typeof createBeybladeModel>,
      state: BeybladeState,
    ) {
      const distance = Math.sqrt(state.position.x ** 2 + state.position.y ** 2)
      model.root.position.x = state.position.x
      model.root.position.z = state.position.y
      model.root.position.y = getBowlY(distance)
      model.root.rotation.y = state.rotationAngle

      // --- 旋轉動態模糊 ---
      const spinRatio = state.spinRate / MAX_SPIN_RATE
      // 轉速 > 40% 開始出現模糊，100% 時最強
      const blurThreshold = 0.4
      if (spinRatio > blurThreshold) {
        const blurIntensity = (spinRatio - blurThreshold) / (1 - blurThreshold)
        // 模糊圓盤透明度：0 → 0.6
        const blurMat = model.blurDiscMesh.material
        if (blurMat && 'setFloat' in blurMat) {
          setToonOpacity(blurMat as import('@babylonjs/core').ShaderMaterial, blurIntensity * 0.6)
        }
        // 攻擊環子 mesh 透明度降低（但不完全消失）
        const ringOpacity = 1 - blurIntensity * 0.7
        model.attackRingMesh.getChildMeshes().forEach((child) => {
          if (child.material && 'setFloat' in child.material) {
            setToonOpacity(child.material as import('@babylonjs/core').ShaderMaterial, ringOpacity)
          }
        })
        if (model.attackRingMesh.material && 'setFloat' in model.attackRingMesh.material) {
          setToonOpacity(model.attackRingMesh.material as import('@babylonjs/core').ShaderMaterial, ringOpacity)
        }
      }
      else {
        // 低轉速：隱藏模糊圓盤，攻擊環完全可見
        const blurMat = model.blurDiscMesh.material
        if (blurMat && 'setFloat' in blurMat) {
          setToonOpacity(blurMat as import('@babylonjs/core').ShaderMaterial, 0)
        }
        model.attackRingMesh.getChildMeshes().forEach((child) => {
          if (child.material && 'setFloat' in child.material) {
            setToonOpacity(child.material as import('@babylonjs/core').ShaderMaterial, 1)
          }
        })
        if (model.attackRingMesh.material && 'setFloat' in model.attackRingMesh.material) {
          setToonOpacity(model.attackRingMesh.material as import('@babylonjs/core').ShaderMaterial, 1)
        }
      }

      if (spinRatio < 0.3) {
        // 搖晃強度：轉速越低越劇烈（0.3 → 0, 0 → 最大）
        const wobbleIntensity = (1 - spinRatio / 0.3)
        // 搖晃角度上限（弧度），最大約 25 度
        const maxTilt = 0.45 * wobbleIntensity
        // 搖晃頻率：轉速越低越慢（瀕死感）
        const wobbleFrequency = 3 + spinRatio * 10

        model.root.rotation.x = Math.sin(elapsedTime * wobbleFrequency) * maxTilt
        model.root.rotation.z = Math.cos(elapsedTime * wobbleFrequency * 0.7) * maxTilt * 0.8
      }
      else {
        // 正常轉速：微量傾斜增加動感
        const microTilt = (1 - spinRatio) * 0.03
        model.root.rotation.x = Math.sin(elapsedTime * 8) * microTilt
        model.root.rotation.z = Math.cos(elapsedTime * 6) * microTilt
      }
    }

    // --- QTE 3D 視覺元素 ---
    let crosshairMesh: Mesh | null = null
    let arrowMesh: Mesh | null = null

    function createCrosshair(): Mesh {
      const horizontal = MeshBuilder.CreateBox('crosshairH', {
        width: 0.6, height: 0.05, depth: 0.05,
      }, currentScene)
      const vertical = MeshBuilder.CreateBox('crosshairV', {
        width: 0.05, height: 0.05, depth: 0.6,
      }, currentScene)
      vertical.parent = horizontal

      const material = new StandardMaterial('crosshairMat', currentScene)
      material.diffuseColor = new Color3(1, 1, 1)
      material.emissiveColor = new Color3(1, 0.8, 0.2)
      horizontal.material = material
      vertical.material = material

      horizontal.isPickable = false
      vertical.isPickable = false
      return horizontal
    }

    function createDirectionArrow(): Mesh {
      // 箭頭 = 細長方塊 + 尖端
      const shaft = MeshBuilder.CreateBox('arrowShaft', {
        width: 0.08, height: 0.05, depth: 0.8,
      }, currentScene)
      const tip = MeshBuilder.CreateCylinder('arrowTip', {
        diameterTop: 0,
        diameterBottom: 0.25,
        height: 0.3,
        tessellation: 8,
      }, currentScene)
      tip.rotation.x = Math.PI / 2
      tip.position.z = 0.55
      tip.parent = shaft

      const material = new StandardMaterial('arrowMat', currentScene)
      material.diffuseColor = new Color3(0.2, 1, 0.4)
      material.emissiveColor = new Color3(0.1, 0.6, 0.2)
      shaft.material = material
      tip.material = material

      shaft.isPickable = false
      tip.isPickable = false
      return shaft
    }

    function showCrosshair() {
      if (!crosshairMesh) {
        crosshairMesh = createCrosshair()
      }
      crosshairMesh.setEnabled(true)
    }

    function hideCrosshair() {
      crosshairMesh?.setEnabled(false)
    }

    function showArrow() {
      if (!arrowMesh) {
        arrowMesh = createDirectionArrow()
      }
      arrowMesh.setEnabled(true)
    }

    function hideArrow() {
      arrowMesh?.setEnabled(false)
    }

    // --- 配置預覽 ---
    /** 預覽懸浮高度 */
    const PREVIEW_FLOAT_Y = 1.0
    /** 預覽模型目標翻轉角度 */
    let targetPreviewRotationX = 0

    function updatePreview() {
      // 記住當前翻轉角度，重建後直接套用（避免重新觸發翻轉動畫）
      const currentRotationX = previewModel?.root.rotation.x ?? targetPreviewRotationX

      previewModel?.dispose()
      previewModel = createBeybladeModel(
        currentScene,
        props.playerConfig,
        new Color3(0.9, 0.2, 0.2),
      )
      previewModel.root.position.y = PREVIEW_FLOAT_Y
      // 直接套用當前角度，不觸發動畫
      previewModel.root.rotation.x = currentRotationX
      applyFocusVisibility()
    }

    /** 設定 mesh 及其子 mesh 的 toon opacity */
    function setMeshOpacity(mesh: Mesh, value: number) {
      if (mesh.material && 'setFloat' in mesh.material) {
        setToonOpacity(mesh.material as ShaderMaterial, value)
      }
      mesh.getChildMeshes().forEach((child) => {
        if (child.material && 'setFloat' in child.material) {
          setToonOpacity(child.material as ShaderMaterial, value)
        }
      })
    }

    /** 根據 focusCategory 透明化非聚焦零件 */
    function applyFocusVisibility() {
      if (!previewModel) return
      const { attackRingMesh, weightDiskMesh, spinTipMesh } = previewModel

      const focused = props.focusCategory
      const full = 1.0
      const dimmed = 0.15

      if (!focused) {
        setMeshOpacity(attackRingMesh, full)
        setMeshOpacity(weightDiskMesh, full)
        setMeshOpacity(spinTipMesh, full)
        return
      }

      setMeshOpacity(attackRingMesh, focused === 'attackRing' ? full : dimmed)
      setMeshOpacity(weightDiskMesh, focused === 'weightDisk' ? full : dimmed)
      setMeshOpacity(spinTipMesh, focused === 'spinTip' ? full : dimmed)
    }

    /** 鏡頭 radius 目標值（依聚焦零件縮放） */
    let targetCameraRadius = 12
    const DEFAULT_CAMERA_RADIUS = 12
    const CAMERA_RADIUS_MAP: Record<string, number> = {
      attackRing: 5,
      weightDisk: 6,
      spinTip: 5.5,
    }

    /** 鏡頭 target Y 目標值 */
    let targetCameraTargetY = 0
    const DEFAULT_CAMERA_TARGET_Y = 0
    const PREVIEW_CAMERA_TARGET_Y = PREVIEW_FLOAT_Y

    // 監聽配置變化更新預覽
    watch(() => props.playerConfig, () => {
      if (props.currentPhase === BattlePhase.CONFIGURE) {
        updatePreview()
      }
    }, { deep: true, immediate: true })

    // 監聽聚焦類別變化
    watch(() => props.focusCategory, (category) => {
      applyFocusVisibility()

      // 翻轉目標：只有切到 spinTip 時翻，其他回正
      targetPreviewRotationX = category === 'spinTip' ? Math.PI : 0

      if (category && props.currentPhase === BattlePhase.CONFIGURE) {
        targetCameraRadius = CAMERA_RADIUS_MAP[category] ?? DEFAULT_CAMERA_RADIUS
        targetCameraTargetY = PREVIEW_CAMERA_TARGET_Y
      }
      else {
        targetCameraRadius = DEFAULT_CAMERA_RADIUS
        targetCameraTargetY = PREVIEW_CAMERA_TARGET_Y
      }
    })

    // --- 監聽階段變化 ---
    watch(() => props.currentPhase, (phase) => {
      if (phase === BattlePhase.CONFIGURE) {
        playerModel?.dispose()
        aiModel?.dispose()
        playerModel = null
        aiModel = null
        isBattleActive = false
        hideCrosshair()
        hideArrow()
        targetCameraRadius = DEFAULT_CAMERA_RADIUS
        targetCameraTargetY = PREVIEW_CAMERA_TARGET_Y
        // 重置鏡頭 target 到中心
        currentCamera.target.x = 0
        currentCamera.target.z = 0
        // 重置 cinematic 鏡頭狀態
        props.cinematic.cameraZoomTarget.value = DEFAULT_CAMERA_RADIUS
        props.cinematic.cameraLookAtTarget.value = null
        updatePreview()
      }

      if (phase === BattlePhase.QTE_CHARGE) {
        previewModel?.dispose()
        previewModel = null
        hideCrosshair()
        hideArrow()
        targetCameraRadius = DEFAULT_CAMERA_RADIUS
        targetCameraTargetY = DEFAULT_CAMERA_TARGET_Y
      }

      if (phase === BattlePhase.QTE_AIM) {
        showCrosshair()
        hideArrow()
      }

      if (phase === BattlePhase.QTE_LAUNCH) {
        hideCrosshair()
        showArrow()
      }

      if (phase === BattlePhase.BATTLE) {
        hideCrosshair()
        hideArrow()
        startBattle()
      }

      if (phase === BattlePhase.RESULT) {
        // 結算後拉回全景
        props.cinematic.cameraZoomTarget.value = DEFAULT_CAMERA_RADIUS
        props.cinematic.cameraLookAtTarget.value = null
        targetCameraTargetY = DEFAULT_CAMERA_TARGET_Y
      }
    })

    function startBattle() {
      previewModel?.dispose()
      previewModel = null

      // 玩家配置
      playerStats = calculateFinalStats(props.playerConfig)
      playerCollisionRadius = props.playerConfig.attackRing.collisionRadius ?? 0.5
      playerFriction = props.playerConfig.spinTip.frictionCoefficient ?? 0.5

      // AI 配置
      aiConfig = generateAiPartSelection(props.difficulty, props.playerConfig)
      aiStats = calculateFinalStats(aiConfig)
      aiCollisionRadius = aiConfig.attackRing.collisionRadius ?? 0.5
      aiFriction = aiConfig.spinTip.frictionCoefficient ?? 0.5

      // QTE 結果
      const playerQte = props.qteEngine.getResult()
      const aiQte = generateAiQteResult(props.difficulty, playerQte.aimPosition)

      // 建立模型
      playerModel?.dispose()
      aiModel?.dispose()
      playerModel = createBeybladeModel(currentScene, props.playerConfig, new Color3(0.9, 0.2, 0.2))
      aiModel = createBeybladeModel(currentScene, aiConfig, new Color3(0.2, 0.3, 0.9))

      // 初始化狀態（發射速度由轉速決定，高轉速 = 更猛的初始衝刺）
      const playerLaunchSpeed = 1.5 + playerQte.chargeRate * 2.0
      const aiLaunchSpeed = 1.5 + aiQte.chargeRate * 2.0

      playerState = createInitialState(
        playerQte.aimPosition,
        {
          x: Math.cos(playerQte.launchAngle) * playerLaunchSpeed,
          y: Math.sin(playerQte.launchAngle) * playerLaunchSpeed,
        },
        MAX_SPIN_RATE * playerQte.chargeRate,
      )
      aiState = createInitialState(
        aiQte.aimPosition,
        {
          x: Math.cos(aiQte.launchAngle) * aiLaunchSpeed,
          y: Math.sin(aiQte.launchAngle) * aiLaunchSpeed,
        },
        MAX_SPIN_RATE * aiQte.chargeRate,
      )

      isBattleActive = true
    }

    // --- 預覽旋轉計數器 ---
    let previewRotation = 0

    // --- 遊戲主循環 ---
    currentScene.onBeforeRenderObservable.add(() => {
      const deltaTime = Math.min(currentEngine.getDeltaTime() / 1000, 0.05)
      elapsedTime += deltaTime

      // 鏡頭緩慢自轉
      if (props.currentPhase === BattlePhase.BATTLE) {
        cameraAutoRotateSpeed = 0.15
      }
      else if (props.currentPhase === BattlePhase.CONFIGURE) {
        cameraAutoRotateSpeed = 0.08
      }
      else {
        cameraAutoRotateSpeed = 0
      }
      currentCamera.alpha += cameraAutoRotateSpeed * deltaTime

      // 鏡頭 radius 平滑縮放（聚焦零件時拉近）
      const radiusDiff = targetCameraRadius - currentCamera.radius
      currentCamera.radius += radiusDiff * deltaTime * 4

      // 鏡頭 target 平滑追蹤陀螺高度
      const targetYDiff = targetCameraTargetY - currentCamera.target.y
      currentCamera.target.y += targetYDiff * deltaTime * 5

      // 配置預覽：自轉 + 翻轉過渡 + 懸浮微動
      if (previewModel && props.currentPhase === BattlePhase.CONFIGURE) {
        previewRotation += deltaTime * 2
        previewModel.root.rotation.y = previewRotation

        // 翻轉平滑過渡
        const rotXDiff = targetPreviewRotationX - previewModel.root.rotation.x
        previewModel.root.rotation.x += rotXDiff * deltaTime * 5

        // 懸浮微動
        previewModel.root.position.y = PREVIEW_FLOAT_Y + Math.sin(elapsedTime * 1.5) * 0.08
      }

      // QTE 更新
      if (props.qteEngine.isActive.value) {
        props.qteEngine.update(deltaTime)
      }

      // QTE 瞄準：準心跟隨圓形軌跡
      if (crosshairMesh?.isEnabled() && props.currentPhase === BattlePhase.QTE_AIM) {
        const aimRadius = ARENA_RADIUS * 0.6
        const angle = props.qteEngine.aimAngle.value
        crosshairMesh.position.x = Math.cos(angle) * aimRadius
        crosshairMesh.position.z = Math.sin(angle) * aimRadius
        crosshairMesh.position.y = getBowlY(aimRadius) + 0.15
      }

      // QTE 發射：箭頭從鎖定的落點旋轉
      if (arrowMesh?.isEnabled() && props.currentPhase === BattlePhase.QTE_LAUNCH) {
        // 用鎖定的 aim 落點位置
        const lockedAim = props.qteEngine.lockedAimPosition
        arrowMesh.position.x = lockedAim.value.x
        arrowMesh.position.z = lockedAim.value.y
        const aimDist = Math.sqrt(lockedAim.value.x ** 2 + lockedAim.value.y ** 2)
        arrowMesh.position.y = getBowlY(aimDist) + 0.15

        // 箭頭 rotation.y 轉換：物理角度 a → 3D 方向
        // 物理: velocity.x = cos(a), velocity.y = sin(a)
        // 3D:   position.x = cos(a), position.z = sin(a)
        // 箭頭預設指向 Z+，rotation.y 順時針旋轉
        // 要指向 (cos(a), 0, sin(a))，rotation.y = -a + PI/2
        const physAngle = props.qteEngine.launchDirectionAngle.value
        arrowMesh.rotation.y = -physAngle + Math.PI / 2
      }

      // --- Cinematic 每幀更新（戰鬥結束後仍需倒數計時器，但淡出視覺效果） ---
      props.cinematic.update(
        spinPercentData.player, spinPercentData.ai, deltaTime, elapsedTime, isBattleActive,
      )

      // --- 鏡頭演出：覆蓋 radius 和 target ---
      if (props.cinematic.cameraLookAtTarget.value) {
        const lookTarget = props.cinematic.cameraLookAtTarget.value
        const diffX = lookTarget.x - currentCamera.target.x
        const diffZ = lookTarget.z - currentCamera.target.z
        currentCamera.target.x += diffX * deltaTime * 8
        currentCamera.target.z += diffZ * deltaTime * 8
      }
      else if (props.currentPhase === BattlePhase.BATTLE || props.currentPhase === BattlePhase.RESULT) {
        // 無事件時，鏡頭 target 回歸中心
        currentCamera.target.x += (0 - currentCamera.target.x) * deltaTime * 4
        currentCamera.target.z += (0 - currentCamera.target.z) * deltaTime * 4
      }
      const cinematicRadius = props.cinematic.cameraZoomTarget.value
      if (props.currentPhase === BattlePhase.BATTLE || props.currentPhase === BattlePhase.RESULT) {
        const rDiff = cinematicRadius - currentCamera.radius
        currentCamera.radius += rDiff * deltaTime * 5
      }

      // === 戰鬥物理 ===
      if (!isBattleActive || !playerModel || !aiModel) return

      // 慢動作：物理 deltaTime 受 cinematic 縮放
      const physDelta = deltaTime * props.cinematic.slowMotionTimeScale.value

      const playerResult = updateBeybladePhysics(
        playerState, playerStats, playerFriction, physDelta, currentTerrain,
      )
      const aiResult = updateBeybladePhysics(
        aiState, aiStats, aiFriction, physDelta, currentTerrain,
      )

      playerState = playerResult.state
      aiState = aiResult.state

      // 轉速百分比
      const playerSpinPct = (playerState.spinRate / MAX_SPIN_RATE) * 100
      const aiSpinPct = (aiState.spinRate / MAX_SPIN_RATE) * 100

      // === 碰撞 ===
      const collision = detectCollision(
        playerState, aiState,
        playerCollisionRadius, aiCollisionRadius,
      )
      if (collision) {
        const response = resolveCollision(
          playerState, aiState,
          playerStats, aiStats,
          collision,
        )

        const collisionX = (playerState.position.x + aiState.position.x) / 2
        const collisionZ = (playerState.position.y + aiState.position.y) / 2
        const collisionY = getBowlY(Math.sqrt(collisionX ** 2 + collisionZ ** 2))
        const collisionIntensity = collision.overlap / (playerCollisionRadius + aiCollisionRadius)

        // 爆擊加成
        const hasCritical = response.criticalA || response.criticalB
        const criticalBoost = hasCritical ? 2.0 : 1.0

        // 火花（根據演出強度 + 爆擊加倍）
        const baseSparkIntensity = props.cinematic.intensityPhase.value === 'climax'
          ? collisionIntensity * 2
          : props.cinematic.intensityPhase.value === 'intense'
            ? collisionIntensity * 1.5
            : collisionIntensity
        const sparkIntensity = baseSparkIntensity * criticalBoost
        emitCollisionSparks(currentScene, collisionX, collisionY, collisionZ, sparkIntensity)

        // 衝擊波環（激烈/決戰期，或爆擊時強制觸發）
        const shockwavePhase = hasCritical ? 'climax' as const : props.cinematic.intensityPhase.value
        emitShockwave(currentScene, collisionX, collisionY, collisionZ, shockwavePhase)

        // 鏡頭震動
        if (currentCamera) {
          applyCameraShake(currentCamera, sparkIntensity)
        }

        // Cinematic 碰撞事件
        const isPlayerAttacker = collision.normalX * playerState.velocity.x + collision.normalY * playerState.velocity.y > 0
        props.cinematic.onCollision(
          collisionX, collisionZ,
          playerSpinPct, aiSpinPct,
          elapsedTime, isPlayerAttacker,
        )

        playerState = response.stateA
        aiState = response.stateB
      }

      // === 障礙物碰撞 ===
      for (const obstacle of currentObstacleList) {
        const playerObstacleHit = detectObstacleCollision(playerState, playerCollisionRadius, obstacle)
        if (playerObstacleHit) {
          playerState = applyObstacleCollision(playerState, playerObstacleHit)
          if (playerObstacleHit.bounceForce > 1.5) {
            emitCollisionSparks(currentScene, obstacle.positionX, getBowlY(
              Math.sqrt(obstacle.positionX ** 2 + obstacle.positionY ** 2),
            ), obstacle.positionY, 0.5)
          }
        }

        const aiObstacleHit = detectObstacleCollision(aiState, aiCollisionRadius, obstacle)
        if (aiObstacleHit) {
          aiState = applyObstacleCollision(aiState, aiObstacleHit)
          if (aiObstacleHit.bounceForce > 1.5) {
            emitCollisionSparks(currentScene, obstacle.positionX, getBowlY(
              Math.sqrt(obstacle.positionX ** 2 + obstacle.positionY ** 2),
            ), obstacle.positionY, 0.5)
          }
        }
      }

      // === 區域效果 ===
      const playerZone = getZoneEffectAtPosition(playerState.position.x, playerState.position.y, currentObstacleList)
      playerState.spinRate *= Math.pow(playerZone.spinDecayFactor, physDelta)
      playerState.velocity.x *= Math.pow(playerZone.speedFactor, physDelta)
      playerState.velocity.y *= Math.pow(playerZone.speedFactor, physDelta)

      const aiZone = getZoneEffectAtPosition(aiState.position.x, aiState.position.y, currentObstacleList)
      aiState.spinRate *= Math.pow(aiZone.spinDecayFactor, physDelta)
      aiState.velocity.x *= Math.pow(aiZone.speedFactor, physDelta)
      aiState.velocity.y *= Math.pow(aiZone.speedFactor, physDelta)

      // === 接近出界偵測 ===
      const playerDist = Math.sqrt(playerState.position.x ** 2 + playerState.position.y ** 2)
      const aiDist = Math.sqrt(aiState.position.x ** 2 + aiState.position.y ** 2)
      const edgeThreshold = ARENA_R * 0.9
      if (playerDist > edgeThreshold) {
        props.cinematic.onNearEdge('player', playerState.position.x, playerState.position.y, elapsedTime)
      }
      if (aiDist > edgeThreshold) {
        props.cinematic.onNearEdge('ai', aiState.position.x, aiState.position.y, elapsedTime)
      }

      // 同步模型
      syncModelToState(playerModel, playerState)
      syncModelToState(aiModel, aiState)

      // 回報轉速百分比
      spinPercentData.player = playerSpinPct
      spinPercentData.ai = aiSpinPct

      // === 勝負判定 ===
      const playerLost = playerResult.isOutOfBounds || playerResult.isStopped
      const aiLost = aiResult.isOutOfBounds || aiResult.isStopped

      if (playerLost || aiLost) {
        // 最後一擊演出
        if (collision) {
          const finalX = (playerState.position.x + aiState.position.x) / 2
          const finalZ = (playerState.position.y + aiState.position.y) / 2
          props.cinematic.onFinalBlow(finalX, finalZ, elapsedTime)
        }

        // 延遲結算（等慢動作播完）
        const delay = collision ? 600 : 200
        setTimeout(() => {
          isBattleActive = false
          if (playerLost && aiLost) {
            emit('battleEnd', 'draw')
          }
          else if (playerLost) {
            emit('battleEnd', 'lose')
          }
          else {
            emit('battleEnd', 'win')
          }
        }, delay)

        // 停止物理但不停止渲染
        isBattleActive = false
      }
    })

    emit('ready')
  },
})
</script>
