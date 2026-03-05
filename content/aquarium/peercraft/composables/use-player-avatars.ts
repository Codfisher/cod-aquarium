import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from '../domains/player/collision'
import { SUN_LIGHT_NAME } from './use-babylon-scene'

interface AvatarEntry {
  root: TransformNode;
  meshes: Mesh[];
  materials: StandardMaterial[];
  /** 動畫相關元件 */
  joints: {
    leftArm: TransformNode;
    rightArm: TransformNode;
    leftLeg: TransformNode;
    rightLeg: TransformNode;
  };
  /** 狀態 */
  state: {
    lastPosition: Vector3;
    walkCycle: number;
    intensity: number;
  };
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
 * 身體比例（相對於 root 中心，root 在 AABB 垂直中央，y = 0.95）：
 * - 頭部：正方大頭（0.55×0.55×0.55）  y = +0.55 (相對 root，眼中點)
 * - 身體：Q 版軀幹（0.30×0.40×0.20）  y = +0.075 (相對 root)
 * - 雙腿：細長肢（0.10×0.825×0.10）  y = -0.5375 (相對 root)
 * - 雙臂：Q 版短臂（0.08×0.80×0.08）  y = -0.175 (相對 root)
 * - 眼睛：Q 版大眼，鏡位 1.5 (相對腳底)
 */
function createEndermanAvatar(peerId: string, scene: Scene): AvatarEntry {
  const root = new TransformNode(`avatar-root-${peerId}`, scene)
  const meshes: Mesh[] = []
  const materials: StandardMaterial[] = []

  const eyeColor = peerIdToColor(peerId)

  /** 深色身體材質 */
  const darkMat = new StandardMaterial(`avatar-dark-${peerId}`, scene)
  darkMat.diffuseColor = new Color3(0.05, 0.02, 0.07)
  darkMat.specularColor = new Color3(0.1, 0.05, 0.15)
  /** 身體發出微光 */
  darkMat.emissiveColor = eyeColor.scale(0.2)
  materials.push(darkMat)

  /** 眼睛材質（每位玩家獨特發光色） */
  const eyeMat = new StandardMaterial(`avatar-eye-${peerId}`, scene)
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
  head.position.y = 0.55
  head.material = darkMat
  meshes.push(head)

  /** 身體 (高度改為 0.4) */
  const body = MeshBuilder.CreateBox(`avatar-body-${peerId}`, {
    width: 0.30,
    height: 0.40,
    depth: 0.20,
  }, scene)
  body.parent = root
  body.position.y = 0.075
  body.material = darkMat
  meshes.push(body)

  /** 眼睛（大一點，水平窄條，突出於頭部前方避免 Z-fighting） */
  const eyeY = 0.55
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

  /** 建立關節與肢體 */
  const createLimb = (name: string, width: number, height: number, depth: number, x: number, y: number) => {
    const joint = new TransformNode(`joint-${name}-${peerId}`, scene)
    joint.parent = root
    joint.position = new Vector3(x, y + height / 2, 0) // 關節定位在肢體頂部

    const mesh = MeshBuilder.CreateBox(`mesh-${name}-${peerId}`, { width, height, depth }, scene)
    mesh.parent = joint
    mesh.position.y = -height / 2 // 網格相對於關節向下偏移一半高度
    mesh.material = darkMat
    meshes.push(mesh)

    return joint
  }

  const joints = {
    leftLeg: createLimb('lleg', 0.10, 0.825, 0.10, -0.10, -0.5375),
    rightLeg: createLimb('rleg', 0.10, 0.825, 0.10, 0.10, -0.5375),
    leftArm: createLimb('larm', 0.08, 0.80, 0.08, -0.19, -0.175),
    rightArm: createLimb('rarm', 0.08, 0.80, 0.08, 0.19, -0.175),
  }

  // 手臂稍微離身體 5 度角 (外展)
  const armOffset = 5 * Math.PI / 180
  joints.leftArm.rotation.z = -armOffset
  joints.rightArm.rotation.z = armOffset

  /** 初始狀態 */
  const state = {
    lastPosition: root.position.clone(),
    walkCycle: 0,
    intensity: 0,
  }

  /** 陰影 */
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null
  for (const mesh of meshes) {
    mesh.receiveShadows = true
    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(mesh)
    }
  }

  return { root, meshes, materials, joints, state }
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

    /** 動畫循環 */
    const observer = sceneRef.onBeforeRenderObservable.add(() => {
      const delta = sceneRef!.getEngine().getDeltaTime() / 1000

      for (const entry of avatars.values()) {
        const { joints, state, root } = entry

        // 偵測移動 (水平)
        const currentPos = root.position
        const distance = Vector3.Distance(
          new Vector3(state.lastPosition.x, 0, state.lastPosition.z),
          new Vector3(currentPos.x, 0, currentPos.z),
        )

        // 更新移動強度 (平滑過渡)
        const targetIntensity = distance > 0.01 ? 1 : 0
        state.intensity += (targetIntensity - state.intensity) * Math.min(1, delta * 10)

        if (state.intensity > 0.001) {
          state.walkCycle += delta * 10 * state.intensity
          const angle = Math.sin(state.walkCycle) * 0.5 * state.intensity

          // 手腳交替擺動
          joints.leftLeg.rotation.x = angle
          joints.rightLeg.rotation.x = -angle
          joints.leftArm.rotation.x = -angle
          joints.rightArm.rotation.x = angle
        }
        else {
          // 停止時回正
          joints.leftLeg.rotation.x = 0
          joints.rightLeg.rotation.x = 0
          joints.leftArm.rotation.x = 0
          joints.rightArm.rotation.x = 0
        }

        state.lastPosition.copyFrom(currentPos)
      }
    })

    cleanup = () => {
      sceneRef?.onBeforeRenderObservable.remove(observer)
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
