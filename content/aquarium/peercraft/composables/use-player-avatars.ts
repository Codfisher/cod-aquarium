import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH } from '../domains/player/collision'
import { SUN_LIGHT_NAME } from './use-babylon-scene'

interface AvatarEntry {
  bodyMesh: Mesh;
  material: StandardMaterial;
}

/** 根據 peerId 產生確定性的顏色 */
function peerIdToColor(peerId: string): Color3 {
  let hash = 0
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) - hash + peerId.charCodeAt(i)) | 0
  }

  const hue = ((hash >>> 0) % 360) / 360
  const saturation = 0.7
  const lightness = 0.6

  // HSL → RGB（簡易版）
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1))
  const m = lightness - c / 2

  let r = 0
  let g = 0
  let b = 0
  const sector = Math.floor(hue * 6)
  switch (sector) {
    case 0:
      r = c
      g = x
      b = 0
      break
    case 1:
      r = x
      g = c
      b = 0
      break
    case 2:
      r = 0
      g = c
      b = x
      break
    case 3:
      r = 0
      g = x
      b = c
      break
    case 4:
      r = x
      g = 0
      b = c
      break
    default:
      r = c
      g = 0
      b = x
      break
  }

  return new Color3(r + m, g + m, b + m)
}

/**
 * 管理遠端玩家的 3D avatar
 *
 * 每個遠端玩家以一個 1x2x1 的彩色方塊表示。
 * 方塊的 Y 旋轉會跟隨該玩家的攝影機朝向。
 */
export function usePlayerAvatars() {
  const avatars = new Map<string, AvatarEntry>()
  let sceneRef: Scene | null = null
  let cleanup: (() => void) | null = null

  tryOnScopeDispose(() => {
    cleanup?.()
  })

  function start(params: { scene: Scene }) {
    sceneRef = params.scene

    cleanup = () => {
      for (const entry of avatars.values()) {
        entry.bodyMesh.dispose()
        entry.material.dispose()
      }
      avatars.clear()
    }
  }

  function updateAvatar(peerId: string, x: number, y: number, z: number, rotationY: number) {
    if (!sceneRef)
      return

    let entry = avatars.get(peerId)
    if (!entry) {
      const material = new StandardMaterial(`avatar-mat-${peerId}`, sceneRef)
      material.diffuseColor = peerIdToColor(peerId)
      material.specularColor = new Color3(0.2, 0.2, 0.2)

      const bodyMesh = MeshBuilder.CreateBox(`avatar-${peerId}`, {
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
        depth: PLAYER_WIDTH,
      }, sceneRef)
      bodyMesh.material = material
      bodyMesh.receiveShadows = true

      /** 註冊至陰影產生器 */
      const sunLight = sceneRef.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
      const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null
      if (shadowGenerator) {
        shadowGenerator.addShadowCaster(bodyMesh)
      }

      entry = { bodyMesh, material }
      avatars.set(peerId, entry)
    }

    /** 攝影機 Y 為眼睛高度，avatar 中心需偏移至身體中央 */
    entry.bodyMesh.position = new Vector3(x, y - PLAYER_EYE_HEIGHT + PLAYER_HEIGHT / 2, z)
    entry.bodyMesh.rotation.y = rotationY
  }

  function removeAvatar(peerId: string) {
    const entry = avatars.get(peerId)
    if (entry) {
      entry.bodyMesh.dispose()
      entry.material.dispose()
      avatars.delete(peerId)
    }
  }

  return { start, updateAvatar, removeAvatar }
}
