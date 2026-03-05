import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from '../domains/player/collision'
import { SUN_LIGHT_NAME } from './use-babylon-scene'

interface AvatarEntry {
  root: TransformNode;
  meshes: Mesh[];
  materials: StandardMaterial[];
}

/** 根據 peerId 產生確定性的顏色（用於眼睛發光色） */
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
 * 建立 Q 版末影人 avatar 的所有部件
 *
 * 身體比例（相對於 root 中心，root 在 AABB 垂直中央）：
 * - 頭部：正方大頭（0.55×0.55×0.55）  y = +0.25 (相對 root)
 * - 身體：短小身（0.30×0.25×0.20）  y = -0.15 (相對 root)
 * - 雙腿：超長肢（0.10×0.975×0.10） y = -0.7625 (相對 root)
 * - 雙臂：Q 版短臂（0.08×0.80×0.08）  y = -0.425 (相對 root)
 * - 眼睛：Q 版大眼，鏡頭高度 1.5 (相對腳底)
 */
function createEndermanAvatar(peerId: string, scene: Scene): AvatarEntry {
  const root = new TransformNode(`avatar-root-${peerId}`, scene)
  const meshes: Mesh[] = []
  const materials: StandardMaterial[] = []

  /** 深色身體材質 */
  const darkMat = new StandardMaterial(`avatar-dark-${peerId}`, scene)
  darkMat.diffuseColor = new Color3(0.05, 0.02, 0.07)
  darkMat.specularColor = new Color3(0.1, 0.05, 0.15)
  materials.push(darkMat)

  /** 眼睛材質（每位玩家獨特發光色） */
  const eyeMat = new StandardMaterial(`avatar-eye-${peerId}`, scene)
  const eyeColor = peerIdToColor(peerId)
  eyeMat.diffuseColor = eyeColor
  eyeMat.emissiveColor = eyeColor.scale(0.8)
  eyeMat.specularColor = new Color3(0.5, 0.5, 0.5)
  materials.push(eyeMat)

  /** 頭部（Q 版正方大頭） */
  const head = MeshBuilder.CreateBox(`avatar-head-${peerId}`, {
    width: 0.55,
    height: 0.55,
    depth: 0.55,
  }, scene)
  head.parent = root
  head.position.y = 0.25
  head.material = darkMat
  meshes.push(head)

  /** 身體 (原本的 Q 版短身體) */
  const body = MeshBuilder.CreateBox(`avatar-body-${peerId}`, {
    width: 0.30,
    height: 0.25,
    depth: 0.20,
  }, scene)
  body.parent = root
  body.position.y = -0.15
  body.material = darkMat
  meshes.push(body)

  /** 左腿 (肢體大幅加長) */
  const leftLeg = MeshBuilder.CreateBox(`avatar-lleg-${peerId}`, {
    width: 0.10,
    height: 0.975,
    depth: 0.10,
  }, scene)
  leftLeg.parent = root
  leftLeg.position = new Vector3(-0.10, -0.7625, 0)
  leftLeg.material = darkMat
  meshes.push(leftLeg)

  /** 右腿 */
  const rightLeg = MeshBuilder.CreateBox(`avatar-rleg-${peerId}`, {
    width: 0.10,
    height: 0.975,
    depth: 0.10,
  }, scene)
  rightLeg.parent = root
  rightLeg.position = new Vector3(0.10, -0.7625, 0)
  rightLeg.material = darkMat
  meshes.push(rightLeg)

  /** 左臂 (長度調回 0.8) */
  const leftArm = MeshBuilder.CreateBox(`avatar-larm-${peerId}`, {
    width: 0.08,
    height: 0.80,
    depth: 0.08,
  }, scene)
  leftArm.parent = root
  leftArm.position = new Vector3(-0.19, -0.425, 0)
  leftArm.material = darkMat
  meshes.push(leftArm)

  /** 右臂 */
  const rightArm = MeshBuilder.CreateBox(`avatar-rarm-${peerId}`, {
    width: 0.08,
    height: 0.80,
    depth: 0.08,
  }, scene)
  rightArm.parent = root
  rightArm.position = new Vector3(0.19, -0.425, 0)
  rightArm.material = darkMat
  meshes.push(rightArm)

  /** 眼睛（大一點，水平窄條，突出於頭部前方避免 Z-fighting） */
  const eyeY = 0.25
  const eyeZ = 0.55 / 2 + 0.03

  const leftEye = MeshBuilder.CreateBox(`avatar-leye-${peerId}`, {
    width: 0.18,
    height: 0.12,
    depth: 0.04,
  }, scene)
  leftEye.parent = root
  leftEye.position = new Vector3(-0.13, eyeY, eyeZ)
  leftEye.material = eyeMat
  meshes.push(leftEye)

  const rightEye = MeshBuilder.CreateBox(`avatar-reye-${peerId}`, {
    width: 0.18,
    height: 0.12,
    depth: 0.04,
  }, scene)
  rightEye.parent = root
  rightEye.position = new Vector3(0.13, eyeY, eyeZ)
  rightEye.material = eyeMat
  meshes.push(rightEye)

  /** 陰影 */
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null
  for (const mesh of meshes) {
    mesh.receiveShadows = true
    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(mesh)
    }
  }

  return { root, meshes, materials }
}

/**
 * 管理遠端玩家的 3D avatar
 *
 * 每個遠端玩家以 Q 版末影人造型呈現：
 * 大頭、小身體、細長手腳，眼睛顏色依 peerId 決定。
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
        for (const mesh of entry.meshes) mesh.dispose()
        for (const mat of entry.materials) mat.dispose()
        entry.root.dispose()
      }
      avatars.clear()
    }
  }

  function updateAvatar(peerId: string, x: number, y: number, z: number, rotationY: number) {
    if (!sceneRef)
      return

    let entry = avatars.get(peerId)
    if (!entry) {
      entry = createEndermanAvatar(peerId, sceneRef)
      avatars.set(peerId, entry)
    }

    /** 攝影機 Y 為眼睛高度，avatar 中心需偏移至其腳底再向上移動 avatar 高度的一半 */
    entry.root.position = new Vector3(x, y - PLAYER_EYE_HEIGHT + PLAYER_HEIGHT / 2, z)
    entry.root.rotation.y = rotationY
  }

  function removeAvatar(peerId: string) {
    const entry = avatars.get(peerId)
    if (entry) {
      for (const mesh of entry.meshes) mesh.dispose()
      for (const mat of entry.materials) mat.dispose()
      entry.root.dispose()
      avatars.delete(peerId)
    }
  }

  return { start, updateAvatar, removeAvatar }
}
