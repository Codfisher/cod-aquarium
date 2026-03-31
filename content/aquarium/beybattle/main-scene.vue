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
import { setToonOpacity } from './domains/renderer/toon-material'
import { BattlePhase } from './types'

const props = defineProps<{
  currentPhase: BattlePhase;
  playerConfig: BeybladeConfig;
  difficulty: Difficulty;
  arenaType: ArenaType;
  focusCategory: PartCategory | null;
  qteEngine: ReturnType<typeof useQteEngine>;
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

      // --- 低轉速搖晃效果 ---
      const spinRatio = state.spinRate / MAX_SPIN_RATE

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
        targetCameraTargetY = PREVIEW_CAMERA_TARGET_Y
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

      // 初始化狀態
      const launchSpeed = 2.0
      playerState = createInitialState(
        playerQte.aimPosition,
        {
          x: Math.cos(playerQte.launchAngle) * launchSpeed,
          y: Math.sin(playerQte.launchAngle) * launchSpeed,
        },
        MAX_SPIN_RATE * playerQte.chargeRate,
      )
      aiState = createInitialState(
        aiQte.aimPosition,
        {
          x: Math.cos(aiQte.launchAngle) * launchSpeed,
          y: Math.sin(aiQte.launchAngle) * launchSpeed,
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
        const qteResult = props.qteEngine
        const lockedPos = qteResult.aimAngle.value // 用已鎖定的 aim 結果位置
        const aimRadius = ARENA_RADIUS * 0.6
        // 箭頭放在鎖定落點
        const aimX = Math.cos(lockedPos) * aimRadius
        const aimZ = Math.sin(lockedPos) * aimRadius
        arrowMesh.position.x = aimX
        arrowMesh.position.z = aimZ
        arrowMesh.position.y = getBowlY(aimRadius) + 0.15
        arrowMesh.rotation.y = props.qteEngine.launchDirectionAngle.value
      }

      // 戰鬥物理
      if (!isBattleActive || !playerModel || !aiModel) return

      const playerResult = updateBeybladePhysics(
        playerState, playerStats, playerFriction, deltaTime, currentTerrain,
      )
      const aiResult = updateBeybladePhysics(
        aiState, aiStats, aiFriction, deltaTime, currentTerrain,
      )

      playerState = playerResult.state
      aiState = aiResult.state

      // 碰撞
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

        // 碰撞特效
        const collisionX = (playerState.position.x + aiState.position.x) / 2
        const collisionZ = (playerState.position.y + aiState.position.y) / 2
        const collisionY = getBowlY(Math.sqrt(collisionX ** 2 + collisionZ ** 2))
        const collisionIntensity = collision.overlap / (playerCollisionRadius + aiCollisionRadius)

        emitCollisionSparks(currentScene, collisionX, collisionY, collisionZ, collisionIntensity)

        if (currentCamera && collisionIntensity > 0.3) {
          applyCameraShake(currentCamera, collisionIntensity)
        }

        playerState = response.stateA
        aiState = response.stateB
      }

      // --- 障礙物碰撞 ---
      for (const obstacle of currentObstacleList) {
        const playerObstacleHit = detectObstacleCollision(playerState, playerCollisionRadius, obstacle)
        if (playerObstacleHit) {
          playerState = applyObstacleCollision(playerState, playerObstacleHit)
          // 彈射器碰撞火花
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

      // --- 區域效果 ---
      const playerZone = getZoneEffectAtPosition(playerState.position.x, playerState.position.y, currentObstacleList)
      playerState.spinRate *= Math.pow(playerZone.spinDecayFactor, deltaTime)
      playerState.velocity.x *= Math.pow(playerZone.speedFactor, deltaTime)
      playerState.velocity.y *= Math.pow(playerZone.speedFactor, deltaTime)

      const aiZone = getZoneEffectAtPosition(aiState.position.x, aiState.position.y, currentObstacleList)
      aiState.spinRate *= Math.pow(aiZone.spinDecayFactor, deltaTime)
      aiState.velocity.x *= Math.pow(aiZone.speedFactor, deltaTime)
      aiState.velocity.y *= Math.pow(aiZone.speedFactor, deltaTime)

      // 同步模型
      syncModelToState(playerModel, playerState)
      syncModelToState(aiModel, aiState)

      // 回報轉速百分比
      spinPercentData.player = (playerState.spinRate / MAX_SPIN_RATE) * 100
      spinPercentData.ai = (aiState.spinRate / MAX_SPIN_RATE) * 100

      // 勝負判定
      const playerLost = playerResult.isOutOfBounds || playerResult.isStopped
      const aiLost = aiResult.isOutOfBounds || aiResult.isStopped

      if (playerLost || aiLost) {
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
      }
    })

    emit('ready')
  },
})
</script>
