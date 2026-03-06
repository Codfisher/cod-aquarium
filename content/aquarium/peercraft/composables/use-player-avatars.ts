import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import { Color3, DynamicTexture, Engine, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { BLOCK_DEFS, BlockId } from '../domains/block/block-constants'
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from '../domains/player/collision'
import { createPixelMaterial } from '../domains/renderer/voxel-renderer'
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
  /** 頭部節點（用於待機晃動） */
  headNode: Mesh;
  /** 狀態 */
  state: {
    lastPosition: Vector3;
    walkCycle: number;
    intensity: number;
    idleTime: number;
  };
  /** 手持方塊相關 */
  hand: TransformNode;
  heldBlockMesh: Mesh | null;
  /** 名字標籤 */
  nameTag?: {
    mesh: Mesh;
    texture: DynamicTexture;
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

  /** 像素噪點貼圖（模擬末影人粒子質感） */
  const noiseSize = 8
  const noiseTex = new DynamicTexture(`avatar-noise-${peerId}`, { width: noiseSize, height: noiseSize }, scene, false)
  const ctx = noiseTex.getContext()
  const er = eyeColor.r * 0.15
  const eg = eyeColor.g * 0.15
  const eb = eyeColor.b * 0.15
  for (let py = 0; py < noiseSize; py++) {
    for (let px = 0; px < noiseSize; px++) {
      const v = 0.08 + Math.random() * 0.12
      const pr = Math.min(255, Math.floor((v + er) * 255))
      const pg = Math.min(255, Math.floor((v * 0.5 + eg) * 255))
      const pb = Math.min(255, Math.floor((v * 1.8 + eb) * 255))
      ctx.fillStyle = `rgb(${pr},${pg},${pb})`
      ctx.fillRect(px, py, 1, 1)
    }
  }
  noiseTex.update()
  noiseTex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)

  /** 深色身體材質 */
  const darkMat = new StandardMaterial(`avatar-dark-${peerId}`, scene)
  darkMat.diffuseTexture = noiseTex
  darkMat.diffuseColor = Color3.White()
  darkMat.specularColor = new Color3(0.03, 0.02, 0.04)
  darkMat.specularPower = 64
  /** 身體發出微光 */
  darkMat.emissiveColor = eyeColor.scale(0.15)
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

  /** 眼白材質 */
  const whiteMat = new StandardMaterial(`avatar-white-${peerId}`, scene)
  whiteMat.diffuseColor = new Color3(0.95, 0.95, 0.95)
  whiteMat.specularColor = new Color3(0.2, 0.2, 0.2)
  whiteMat.emissiveColor = new Color3(0.15, 0.15, 0.15)
  materials.push(whiteMat)

  /** 眼睛、腮紅、嘴巴皆掛在 head 下，隨頭部一起晃動 */
  const whiteZ = 0.55 / 2 + 0.025
  const pupilZ = 0.55 / 2 + 0.05

  /** 左眼白 */
  const leftWhite = MeshBuilder.CreateBox(`avatar-lwhite-${peerId}`, {
    width: 0.20,
    height: 0.14,
    depth: 0.03,
  }, scene)
  leftWhite.parent = head
  leftWhite.position = new Vector3(-0.13, 0, whiteZ)
  leftWhite.material = whiteMat
  meshes.push(leftWhite)

  /** 右眼白 */
  const rightWhite = MeshBuilder.CreateBox(`avatar-rwhite-${peerId}`, {
    width: 0.20,
    height: 0.14,
    depth: 0.03,
  }, scene)
  rightWhite.parent = head
  rightWhite.position = new Vector3(0.13, 0, whiteZ)
  rightWhite.material = whiteMat
  meshes.push(rightWhite)

  /** 左瞳孔 */
  const leftEye = MeshBuilder.CreateBox(`avatar-leye-${peerId}`, {
    width: 0.12,
    height: 0.10,
    depth: 0.02,
  }, scene)
  leftEye.parent = head
  leftEye.position = new Vector3(-0.13, 0, pupilZ)
  leftEye.material = eyeMat
  meshes.push(leftEye)

  /** 右瞳孔 */
  const rightEye = MeshBuilder.CreateBox(`avatar-reye-${peerId}`, {
    width: 0.12,
    height: 0.10,
    depth: 0.02,
  }, scene)
  rightEye.parent = head
  rightEye.position = new Vector3(0.13, 0, pupilZ)
  rightEye.material = eyeMat
  meshes.push(rightEye)

  /** 腮紅材質 */
  const blushMat = new StandardMaterial(`avatar-blush-${peerId}`, scene)
  blushMat.diffuseColor = new Color3(0.55, 0.15, 0.25)
  blushMat.emissiveColor = new Color3(0.25, 0.05, 0.10)
  blushMat.specularColor = Color3.Black()
  materials.push(blushMat)

  /** 左腮紅 */
  const leftBlush = MeshBuilder.CreateBox(`avatar-lblush-${peerId}`, {
    width: 0.10,
    height: 0.06,
    depth: 0.03,
  }, scene)
  leftBlush.parent = head
  leftBlush.position = new Vector3(-0.20, -0.12, whiteZ)
  leftBlush.material = blushMat
  meshes.push(leftBlush)

  /** 右腮紅 */
  const rightBlush = MeshBuilder.CreateBox(`avatar-rblush-${peerId}`, {
    width: 0.10,
    height: 0.06,
    depth: 0.03,
  }, scene)
  rightBlush.parent = head
  rightBlush.position = new Vector3(0.20, -0.12, whiteZ)
  rightBlush.material = blushMat
  meshes.push(rightBlush)

  /** 嘴巴（微笑線） */
  const mouthMat = new StandardMaterial(`avatar-mouth-${peerId}`, scene)
  mouthMat.diffuseColor = new Color3(0.15, 0.05, 0.12)
  mouthMat.emissiveColor = new Color3(0.08, 0.02, 0.06)
  mouthMat.specularColor = Color3.Black()
  materials.push(mouthMat)

  const mouth = MeshBuilder.CreateBox(`avatar-mouth-${peerId}`, {
    width: 0.10,
    height: 0.03,
    depth: 0.02,
  }, scene)
  mouth.parent = head
  mouth.position = new Vector3(0, -0.18, pupilZ)
  mouth.material = mouthMat
  meshes.push(mouth)

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

  /** 建立手部掛載點 (在右手臂下方) */
  const hand = new TransformNode(`avatar-hand-${peerId}`, scene)
  hand.parent = joints.rightArm
  hand.position.y = -0.80 // 手臂高度底端
  hand.rotation.x = -Math.PI / 4 // 稍微向前傾斜方便拿東西

  // 手臂不要貼緊身體
  const armOffset = 3 * Math.PI / 180
  joints.leftArm.rotation.z = -armOffset
  joints.rightArm.rotation.z = armOffset

  /** 初始狀態 */
  const state = {
    lastPosition: root.position.clone(),
    walkCycle: 0,
    intensity: 0,
    idleTime: 0,
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

  return { root, meshes, materials, joints, headNode: head, state, hand, heldBlockMesh: null }
}

/** 建立玩家名字標籤 */
function createNameTag(peerId: string, name: string, scene: Scene): { mesh: Mesh; texture: DynamicTexture } {
  const font = 'bold 32px Arial'

  // 建立暫時的 DynamicTexture 來測量文字寬度
  const tempTexture = new DynamicTexture('temp', 64, scene)
  const ctx = tempTexture.getContext()
  ctx.font = font
  const metrics = ctx.measureText(name)
  const textWidth = metrics.width
  tempTexture.dispose()

  // 計算實際尺寸 (加一點 padding)
  const paddingX = 30
  const textureHeight = 64
  const textureWidth = Math.max(64, textWidth + paddingX * 2)

  // 3D 空間中的寬度 (比例換算，假設 64px 高度對應 0.3 單位)
  const planeHeight = 0.3
  const planeWidth = (textureWidth / textureHeight) * planeHeight

  const dynamicTexture = new DynamicTexture(`name-tag-tex-${peerId}`, { width: textureWidth, height: textureHeight }, scene, false)
  dynamicTexture.hasAlpha = true

  const dCtx = dynamicTexture.getContext()
  dCtx.clearRect(0, 0, textureWidth, textureHeight)

  // 背景 (半透明黑)
  dCtx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  const cornerRadius = 15
  if ((dCtx as any).roundRect) {
    (dCtx as any).roundRect(5, 5, textureWidth - 10, textureHeight - 10, cornerRadius)
  }
  else {
    dCtx.fillRect(5, 5, textureWidth - 10, textureHeight - 10)
  }
  dCtx.fill()

  // 文字 (置中)
  dynamicTexture.drawText(name, null, null, font, 'white', 'transparent', true)

  const plane = MeshBuilder.CreatePlane(`name-tag-mesh-${peerId}`, { width: planeWidth, height: planeHeight }, scene)
  const mat = new StandardMaterial(`name-tag-mat-${peerId}`, scene)
  mat.diffuseTexture = dynamicTexture
  mat.useAlphaFromDiffuseTexture = true
  mat.specularColor = Color3.Black()
  mat.emissiveColor = Color3.White()
  mat.backFaceCulling = false
  // 讓名字標籤不被方塊遮擋
  mat.depthFunction = Engine.ALWAYS
  plane.renderingGroupId = 1
  plane.material = mat

  // 名字標籤不需要陰影
  plane.receiveShadows = false

  return { mesh: plane, texture: dynamicTexture }
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
        const { joints, headNode, state, root } = entry

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

        // 待機頭部微微晃動（上下浮動 + 左右歪頭）
        state.idleTime += delta
        const bobY = Math.sin(state.idleTime * 1.5) * 0.02
        const tiltZ = Math.sin(state.idleTime * 0.8) * 0.04
        headNode.position.y = 0.55 + bobY
        headNode.rotation.z = tiltZ

        state.lastPosition.copyFrom(currentPos)

        // 名稱標籤看著相機 (Billboard)
        if (entry.nameTag) {
          entry.nameTag.mesh.lookAt(sceneRef!.activeCamera!.globalPosition, Math.PI, 0, 0)
        }
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

    // 更新名字標籤位置 (在頭頂上方)
    if (entry.nameTag) {
      entry.nameTag.mesh.position.set(
        entry.root.position.x,
        entry.root.position.y + 1.0,
        entry.root.position.z,
      )
    }
  }

  function updatePlayerName(peerId: string, name: string) {
    if (!sceneRef)
      return

    let entry = avatars.get(peerId)
    if (!entry) {
      entry = createEndermanAvatar(peerId, sceneRef)
      avatars.set(peerId, entry)
    }

    if (entry.nameTag) {
      // 重新建立，因為動態寬度需要更換 mesh 尺寸與貼圖尺寸
      entry.nameTag.mesh.dispose()
      entry.nameTag.texture.dispose()
    }

    entry.nameTag = createNameTag(peerId, name, sceneRef)
  }

  function removeAvatar(peerId: string) {
    const entry = avatars.get(peerId)
    if (entry) {
      if (entry.heldBlockMesh)
        entry.heldBlockMesh.dispose()
      if (entry.nameTag) {
        entry.nameTag.mesh.dispose()
        entry.nameTag.texture.dispose()
      }
      for (const mesh of entry.meshes) mesh.dispose()
      for (const mat of entry.materials) mat.dispose()
      entry.root.dispose()
      avatars.delete(peerId)
    }
  }

  /** 更新遠端玩家手持方塊 */
  function updateHeldBlock(peerId: string, blockId: BlockId | null) {
    const entry = avatars.get(peerId)
    if (!entry)
      return

    // 清除舊的
    if (entry.heldBlockMesh) {
      entry.heldBlockMesh.dispose()
      entry.heldBlockMesh = null
    }

    if (blockId !== null && blockId !== BlockId.AIR) {
      const blockDef = BLOCK_DEFS[blockId]
      const textureDef = blockDef.textures
      if (!textureDef)
        return

      const size = 0.3
      const half = size / 2
      const blockRoot = new TransformNode(`held-block-root-${peerId}`, sceneRef!)
      blockRoot.parent = entry.hand
      blockRoot.position = new Vector3(0, -0.05, 0.05)

      if (textureDef.all) {
        const mesh = MeshBuilder.CreateBox(`avatar-held-${peerId}`, { size }, sceneRef!)
        mesh.parent = blockRoot
        mesh.material = createPixelMaterial(`held_${blockId}`, textureDef.all, sceneRef!)
      }
      else {
        // 多面貼圖處理
        const topMat = createPixelMaterial(`held_${peerId}_${blockId}_top`, textureDef.top ?? '', sceneRef!, textureDef.topTint)
        const topMesh = MeshBuilder.CreatePlane(`held_${peerId}_${blockId}_top`, { size }, sceneRef!)
        topMesh.rotation.x = Math.PI / 2
        topMesh.position.y = half
        topMesh.material = topMat
        topMesh.parent = blockRoot

        const bottomMat = createPixelMaterial(`held_${peerId}_${blockId}_bottom`, textureDef.bottom ?? '', sceneRef!)
        const bottomMesh = MeshBuilder.CreatePlane(`held_${peerId}_${blockId}_bottom`, { size }, sceneRef!)
        bottomMesh.rotation.x = -Math.PI / 2
        bottomMesh.position.y = -half
        bottomMesh.material = bottomMat
        bottomMesh.parent = blockRoot

        const sideMat = createPixelMaterial(`held_${peerId}_${blockId}_side`, textureDef.side ?? '', sceneRef!, textureDef.sideTint)
        const sideRotations = [
          { name: 'front', rotationY: 0, x: 0, z: half },
          { name: 'back', rotationY: Math.PI, x: 0, z: -half },
          { name: 'left', rotationY: -Math.PI / 2, x: -half, z: 0 },
          { name: 'right', rotationY: Math.PI / 2, x: half, z: 0 },
        ]

        for (const { name, rotationY, x, z } of sideRotations) {
          const sideMesh = MeshBuilder.CreatePlane(`held_${peerId}_${blockId}_${name}`, { size }, sceneRef!)
          sideMesh.rotation.y = rotationY
          sideMesh.position.x = x
          sideMesh.position.z = z
          sideMesh.material = sideMat
          sideMesh.parent = blockRoot
        }
      }

      // 統一儲存 root，方便下次 update 時整批 dispose
      entry.heldBlockMesh = blockRoot as any
    }
  }

  return { start, updateAvatar, removeAvatar, updateHeldBlock, updatePlayerName }
}
