import type { Mesh, Scene, UniversalCamera } from '@babylonjs/core'
import type { BlockId } from '../block/block-constants'
import type { RaycastHit } from './block-interaction'
import { Color3, Color4, MeshBuilder, ParticleSystem, StandardMaterial, Texture, Vector3 } from '@babylonjs/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { ref } from 'vue'
import { BLOCK_DEFS } from '../block/block-constants'
import { castBlockRay, digBlock } from './block-interaction'

interface MiningProgressInfo {
  x: number;
  y: number;
  z: number;
  progress: number;
  blockId: BlockId;
}

interface UseBlockMinerStartParams {
  scene: Scene;
  camera: UniversalCamera;
  canvas: HTMLCanvasElement;
  worldState: Uint8Array;
  /** 控制是否允許開始或繼續挖掘 */
  canMine?: () => boolean;
  /** 當方塊被成功挖掉時觸發 */
  onBlockMined: (hit: RaycastHit) => void;
  /** 每幀挖掘進度變化時觸發（用於網路同步等外部邏輯） */
  onMiningProgress?: (info: MiningProgressInfo | null) => void;
}

/**
 * 方塊挖掘控制器
 *
 * 處理長按左鍵累積挖掘進度，當進度達 100% 時執行挖掘並重置。
 * 若準心移開目標方塊或放開左鍵，則中斷挖掘。
 *
 * 包含挖掘視覺特效（裂痕疊加層 + 粒子系統），
 * 以及遠端玩家的挖掘特效同步。
 */
export function useBlockMiner() {
  const isMining = ref(false)
  const miningProgress = ref(0)

  /** 正在挖掘的目標座標 */
  const targetBlock = ref<{ x: number; y: number; z: number } | null>(null)
  const targetBlockId = ref<BlockId | null>(null)

  let cleanup: (() => void) | null = null

  /** 遠端玩家的挖掘特效 */
  const remoteMiningEffects = new Map<string, {
    overlay: Mesh;
    particleSystem: ParticleSystem;
    currentBlockId: BlockId | null;
  }>()

  /** start 後才可用 */
  let destroyMaterialList: StandardMaterial[] = []
  let sceneRef: Scene | null = null

  tryOnScopeDispose(() => {
    cleanup?.()
  })

  function resetMining() {
    isMining.value = false
    miningProgress.value = 0
    targetBlock.value = null
    targetBlockId.value = null
  }

  /**
   * 建立一組挖掘特效 (裂痕疊加層 + 粒子系統)
   */
  function createMiningEffects(id: string, sceneInstance: Scene) {
    const overlay = MeshBuilder.CreateBox(`destroy-overlay-${id}`, { size: 1.002 }, sceneInstance)
    overlay.isVisible = false
    overlay.isPickable = false

    const particleSystem = new ParticleSystem(`mining-particles-${id}`, 200, sceneInstance)
    particleSystem.createBoxEmitter(
      new Vector3(-1, 0, -1),
      new Vector3(1, 1, 1),
      new Vector3(-0.5, -0.5, -0.5),
      new Vector3(0.5, 0.5, 0.5),
    )
    particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
    particleSystem.color1 = new Color4(1.0, 1.0, 1.0, 1.0)
    particleSystem.color2 = new Color4(1.0, 1.0, 1.0, 1.0)
    particleSystem.colorDead = new Color4(1.0, 1.0, 1.0, 0.0)
    particleSystem.minSize = 0.05
    particleSystem.maxSize = 0.15
    particleSystem.minLifeTime = 0.2
    particleSystem.maxLifeTime = 0.4
    particleSystem.emitRate = 60
    particleSystem.gravity = new Vector3(0, -10, 0)
    particleSystem.minEmitPower = 1
    particleSystem.maxEmitPower = 3
    particleSystem.updateSpeed = 0.01

    particleSystem.isAnimationSheetEnabled = true
    particleSystem.spriteCellWidth = 4
    particleSystem.spriteCellHeight = 4
    particleSystem.startSpriteCellID = 0
    particleSystem.endSpriteCellID = 15
    particleSystem.spriteCellChangeSpeed = 0
    particleSystem.spriteRandomStartCell = true

    return { overlay, particleSystem }
  }

  /**
   * 處理遠端玩家的挖掘進度（更新視覺特效）
   */
  function handleRemoteMiningProgress(peerId: string, x: number, y: number, z: number, progress: number, blockId: BlockId) {
    if (!sceneRef)
      return

    let effect = remoteMiningEffects.get(peerId)
    if (!effect) {
      const { overlay, particleSystem } = createMiningEffects(peerId, sceneRef)
      effect = { overlay, particleSystem, currentBlockId: null }
      remoteMiningEffects.set(peerId, effect)
    }

    if (progress > 0) {
      const eff = effect
      // 更新材質
      if (eff.currentBlockId !== blockId) {
        eff.currentBlockId = blockId
        const blockDef = BLOCK_DEFS[blockId]
        const textureDef = blockDef.textures
        if (!textureDef)
          return

        const texturePath = textureDef.bottom ?? textureDef.all ?? ''
        if (texturePath) {
          if (eff.particleSystem.particleTexture)
            eff.particleSystem.particleTexture.dispose()
          eff.particleSystem.particleTexture = new Texture(texturePath, sceneRef, {
            samplingMode: Texture.NEAREST_SAMPLINGMODE,
          })
        }
      }

      // 更新位置
      const pos = new Vector3(x, y, z)
      eff.overlay.position.copyFrom(pos)
      eff.particleSystem.emitter = pos

      // 更新視覺
      const stage = Math.min(9, Math.floor(progress * 10))
      eff.overlay.material = destroyMaterialList[stage] || null
      eff.overlay.isVisible = true

      if (!eff.particleSystem.isStarted())
        eff.particleSystem.start()
    }
    else {
      // 停止挖掘
      const eff = effect
      eff.overlay.isVisible = false
      if (eff.particleSystem.isStarted())
        eff.particleSystem.stop()
    }
  }

  function start({
    scene,
    camera,
    canvas,
    worldState,
    canMine,
    onBlockMined,
    onMiningProgress,
  }: UseBlockMinerStartParams) {
    sceneRef = scene

    // ── 挖掘互動 ──

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0 || document.pointerLockElement !== canvas) {
        return
      }

      if (canMine && !canMine()) {
        return
      }

      const hit = castBlockRay(camera, worldState)
      if (hit) {
        isMining.value = true
        miningProgress.value = 0
        targetBlock.value = { x: hit.blockX, y: hit.blockY, z: hit.blockZ }
        targetBlockId.value = hit.blockId
      }
    }

    function handleMouseUp(event: MouseEvent) {
      if (event.button === 0) {
        resetMining()
      }
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)

    // ── 破壞裂痕材質列表 (0~9 階段) ──

    destroyMaterialList = []
    for (let i = 0; i < 10; i++) {
      const mat = new StandardMaterial(`destroy_stage_${i}`, scene)
      const tex = new Texture(`/assets/minecraft/textures/block/destroy_stage_${i}.png`, scene, {
        samplingMode: Texture.NEAREST_SAMPLINGMODE,
      })
      tex.hasAlpha = true
      mat.diffuseTexture = tex
      mat.useAlphaFromDiffuseTexture = true
      mat.disableLighting = true
      mat.emissiveColor = new Color3(0.8, 0.8, 0.8)
      mat.zOffset = -1 // 避免 Z-fighting
      destroyMaterialList.push(mat)
    }

    // ── 本機挖掘視覺特效 ──

    const localEffects = createMiningEffects('local', scene)
    let localCurrentParticleBlockId: BlockId | null = null

    // ── 每幀更新 ──

    const observer = scene.onBeforeRenderObservable.add(() => {
      // 挖掘進度累加
      if (isMining.value && targetBlock.value && targetBlockId.value !== null) {
        if (canMine && !canMine()) {
          resetMining()
          return
        }

        const hit = castBlockRay(camera, worldState)

        if (
          !hit
          || hit.blockX !== targetBlock.value.x
          || hit.blockY !== targetBlock.value.y
          || hit.blockZ !== targetBlock.value.z
        ) {
          resetMining()
          return
        }

        const deltaTime = scene.getEngine().getDeltaTime() / 1000
        const blockDef = BLOCK_DEFS[targetBlockId.value]
        const requiredTime = blockDef.miningSeconds || 1

        miningProgress.value = Math.min(1, miningProgress.value + (deltaTime / requiredTime))

        if (miningProgress.value >= 1) {
          const success = digBlock(worldState, hit.blockX, hit.blockY, hit.blockZ)
          if (success) {
            onBlockMined(hit)
          }
          resetMining()
        }
      }

      // ── 同步挖掘視覺特效 ──

      if (isMining.value && targetBlock.value && targetBlockId.value !== null) {
        // 動態更換粒子材質為方塊底部貼圖
        if (localCurrentParticleBlockId !== targetBlockId.value) {
          localCurrentParticleBlockId = targetBlockId.value
          const blockDef = BLOCK_DEFS[localCurrentParticleBlockId]
          const textureDef = blockDef.textures
          const texturePath = textureDef?.bottom ?? textureDef?.all ?? ''
          if (texturePath) {
            if (localEffects.particleSystem.particleTexture) {
              localEffects.particleSystem.particleTexture.dispose()
            }
            localEffects.particleSystem.particleTexture = new Texture(texturePath, scene, {
              samplingMode: Texture.NEAREST_SAMPLINGMODE,
            })
          }
        }

        localEffects.particleSystem.emitter = new Vector3(
          targetBlock.value.x,
          targetBlock.value.y,
          targetBlock.value.z,
        )
        if (!localEffects.particleSystem.isStarted()) {
          localEffects.particleSystem.start()
        }

        // 更新裂痕疊加層
        localEffects.overlay.position.copyFrom(localEffects.particleSystem.emitter as Vector3)
        const stage = Math.min(9, Math.floor(miningProgress.value * 10))
        localEffects.overlay.material = destroyMaterialList[stage] || null
        localEffects.overlay.isVisible = true

        // 通知外部（例如網路同步）
        onMiningProgress?.({
          x: targetBlock.value.x,
          y: targetBlock.value.y,
          z: targetBlock.value.z,
          progress: miningProgress.value,
          blockId: targetBlockId.value,
        })
      }
      else {
        // 停止挖掘時通知外部一次
        if (localCurrentParticleBlockId !== null) {
          onMiningProgress?.(null)
          localCurrentParticleBlockId = null
        }

        if (localEffects.particleSystem.isStarted()) {
          localEffects.particleSystem.stop()
        }
        localEffects.overlay.isVisible = false
      }
    })

    cleanup = () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      scene.onBeforeRenderObservable.remove(observer)
    }
  }

  return {
    isMining,
    miningProgress,
    targetBlock,
    targetBlockId,
    start,
    handleRemoteMiningProgress,
  }
}
