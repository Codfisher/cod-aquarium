import {
  Color3,
  MeshBuilder,
  TransformNode,
  Vector3,
  VertexData,
  Mesh,
} from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { BeybladeConfig } from '../../types'
import { createToonMaterial } from '../renderer/toon-material'

export interface BeybladeModel {
  root: TransformNode;
  attackRingMesh: Mesh;
  weightDiskMesh: Mesh;
  spinTipMesh: Mesh;
  dispose: () => void;
}

// --- 攻擊環建模 ---

function createJaggedRing(scene: Scene, radius: number): Mesh {
  const toothCount = 12
  const toothHeight = 0.15
  const inner = radius * 0.6
  const height = 0.12
  const vertexList: number[] = []
  const indexList: number[] = []

  // 頂面 + 底面的鋸齒圓盤
  for (let face = 0; face < 2; face++) {
    const y = face === 0 ? height / 2 : -height / 2
    const baseIndex = vertexList.length / 3

    // 中心點
    vertexList.push(0, y, 0)

    for (let i = 0; i < toothCount * 2; i++) {
      const angle = (Math.PI * 2 * i) / (toothCount * 2)
      const isTooth = i % 2 === 0
      const r = isTooth ? radius + toothHeight : radius
      vertexList.push(Math.cos(angle) * r, y, Math.sin(angle) * r)
    }

    // 三角形扇面
    if (face === 0) {
      for (let i = 0; i < toothCount * 2; i++) {
        const next = (i + 1) % (toothCount * 2)
        indexList.push(baseIndex, baseIndex + 1 + i, baseIndex + 1 + next)
      }
    }
    else {
      for (let i = 0; i < toothCount * 2; i++) {
        const next = (i + 1) % (toothCount * 2)
        indexList.push(baseIndex, baseIndex + 1 + next, baseIndex + 1 + i)
      }
    }
  }

  const mesh = new Mesh('jaggedRing', scene)
  const vertexData = new VertexData()
  vertexData.positions = vertexList
  vertexData.indices = indexList
  VertexData.ComputeNormals(vertexList, indexList, [])
  const normalList = new Array(vertexList.length).fill(0)
  VertexData.ComputeNormals(vertexList, indexList, normalList)
  vertexData.normals = normalList
  vertexData.applyToMesh(mesh)

  return mesh
}

function createSmoothRing(scene: Scene, radius: number): Mesh {
  return MeshBuilder.CreateTorus('smoothRing', {
    diameter: radius * 2,
    thickness: 0.18,
    tessellation: 32,
  }, scene)
}

function createTriangleRing(scene: Scene, radius: number): Mesh {
  const base = MeshBuilder.CreateCylinder('triBase', {
    diameter: radius * 1.6,
    height: 0.1,
    tessellation: 24,
  }, scene)

  // 三個突起
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3
    const spike = MeshBuilder.CreateCylinder(`triSpike${i}`, {
      diameterTop: 0.05,
      diameterBottom: 0.2,
      height: 0.3,
      tessellation: 8,
    }, scene)
    spike.position.x = Math.cos(angle) * radius
    spike.position.z = Math.sin(angle) * radius
    spike.position.y = 0.1
    spike.rotation.z = -Math.sign(Math.cos(angle)) * 0.3
    spike.parent = base
  }

  return base
}

function createHexWingRing(scene: Scene, radius: number): Mesh {
  const base = MeshBuilder.CreateCylinder('hexBase', {
    diameter: radius * 1.2,
    height: 0.08,
    tessellation: 24,
  }, scene)

  // 六片翼片
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6
    const wing = MeshBuilder.CreateBox(`wing${i}`, {
      width: 0.35,
      height: 0.06,
      depth: 0.08,
    }, scene)
    wing.position.x = Math.cos(angle) * (radius * 0.85)
    wing.position.z = Math.sin(angle) * (radius * 0.85)
    wing.rotation.y = angle
    wing.parent = base
  }

  return base
}

function buildAttackRing(scene: Scene, partId: string, radius: number): Mesh {
  switch (partId) {
    case 'jagged': return createJaggedRing(scene, radius)
    case 'smooth': return createSmoothRing(scene, radius)
    case 'triangle': return createTriangleRing(scene, radius)
    case 'hexWing': return createHexWingRing(scene, radius)
    default: return createSmoothRing(scene, radius)
  }
}

// --- 重量盤建模 ---

function buildWeightDisk(scene: Scene, partId: string, params: Record<string, number>): Mesh {
  const diameter = params.diameter ?? 0.85
  const height = params.height ?? 0.15

  switch (partId) {
    case 'heavy': {
      // 外圈加厚
      const inner = MeshBuilder.CreateCylinder('heavyInner', {
        diameter: diameter * 0.7,
        height,
        tessellation: 24,
      }, scene)
      const outer = MeshBuilder.CreateTorus('heavyOuter', {
        diameter,
        thickness: params.outerThickness ?? 0.3,
        tessellation: 32,
      }, scene)
      outer.parent = inner
      return inner
    }
    case 'light': {
      return MeshBuilder.CreateCylinder('lightDisk', {
        diameter,
        height,
        tessellation: 24,
      }, scene)
    }
    case 'eccentric': {
      const disk = MeshBuilder.CreateCylinder('eccentricDisk', {
        diameter,
        height,
        tessellation: 24,
      }, scene)
      // 偏心：位移重心
      const weightBump = MeshBuilder.CreateSphere('eccBump', {
        diameter: 0.2,
        segments: 8,
      }, scene)
      weightBump.position.x = params.offsetX ?? 0.1
      weightBump.parent = disk
      return disk
    }
    default: {
      // balanced
      return MeshBuilder.CreateCylinder('balancedDisk', {
        diameter,
        height,
        tessellation: 24,
      }, scene)
    }
  }
}

// --- 軸心建模 ---

function buildSpinTip(scene: Scene, partId: string, params: Record<string, number>): Mesh {
  const topDiameter = params.topDiameter ?? 0.15
  const bottomDiameter = params.bottomDiameter ?? 0.05
  const tipHeight = params.tipHeight ?? 0.3

  switch (partId) {
    case 'sharp': {
      return MeshBuilder.CreateCylinder('sharpTip', {
        diameterTop: topDiameter,
        diameterBottom: 0.02,
        height: tipHeight,
        tessellation: 16,
      }, scene)
    }
    case 'flat': {
      return MeshBuilder.CreateCylinder('flatTip', {
        diameterTop: topDiameter,
        diameterBottom: topDiameter,
        height: tipHeight,
        tessellation: 16,
      }, scene)
    }
    case 'ball': {
      const stem = MeshBuilder.CreateCylinder('ballStem', {
        diameterTop: topDiameter,
        diameterBottom: topDiameter * 0.8,
        height: tipHeight * 0.5,
        tessellation: 16,
      }, scene)
      const ball = MeshBuilder.CreateSphere('ballEnd', {
        diameter: topDiameter * 1.2,
        segments: 12,
      }, scene)
      ball.position.y = -tipHeight * 0.3
      ball.parent = stem
      return stem
    }
    case 'spring': {
      const body = MeshBuilder.CreateCylinder('springBody', {
        diameterTop: topDiameter,
        diameterBottom: bottomDiameter,
        height: tipHeight,
        tessellation: 16,
      }, scene)
      // 彈簧裝飾環
      for (let i = 0; i < 3; i++) {
        const coil = MeshBuilder.CreateTorus(`coil${i}`, {
          diameter: topDiameter * 1.5,
          thickness: 0.02,
          tessellation: 16,
        }, scene)
        coil.position.y = -tipHeight * 0.1 + i * tipHeight * 0.15
        coil.parent = body
      }
      return body
    }
    default: {
      return MeshBuilder.CreateCylinder('defaultTip', {
        diameterTop: topDiameter,
        diameterBottom: bottomDiameter,
        height: tipHeight,
        tessellation: 16,
      }, scene)
    }
  }
}

/**
 * 建立陀螺 3D 模型
 *
 * 三層結構：攻擊環（上）、重量盤（中）、軸心（下）
 */
export function createBeybladeModel(
  scene: Scene,
  config: BeybladeConfig,
  color: Color3,
): BeybladeModel {
  const root = new TransformNode('beyblade', scene)
  const meshList: Mesh[] = []

  /** 將 material 套用到 mesh 及其所有子 mesh */
  function applyMaterialToMeshTree(mesh: Mesh, material: ReturnType<typeof createToonMaterial>) {
    mesh.material = material
    mesh.getChildMeshes().forEach((child) => {
      child.material = material
    })
  }

  // --- 攻擊環 ---
  const attackRadius = config.attackRing.collisionRadius ?? 0.5
  const attackRingMesh = buildAttackRing(scene, config.attackRing.id, attackRadius)
  const attackRingMaterial = createToonMaterial('attackRingMat', color, scene)
  applyMaterialToMeshTree(attackRingMesh, attackRingMaterial)
  attackRingMesh.position.y = 0.25
  attackRingMesh.parent = root
  meshList.push(attackRingMesh)

  // --- 重量盤 ---
  const weightDiskMesh = buildWeightDisk(scene, config.weightDisk.id, config.weightDisk.visualParams)
  const darkerColor = new Color3(color.r * 0.7, color.g * 0.7, color.b * 0.7)
  const weightDiskMaterial = createToonMaterial('weightDiskMat', darkerColor, scene)
  applyMaterialToMeshTree(weightDiskMesh, weightDiskMaterial)
  weightDiskMesh.position.y = 0.12
  weightDiskMesh.parent = root
  meshList.push(weightDiskMesh)

  // --- 軸心 ---
  const spinTipMesh = buildSpinTip(scene, config.spinTip.id, config.spinTip.visualParams)
  const lighterColor = new Color3(
    Math.min(color.r * 1.3, 1),
    Math.min(color.g * 1.3, 1),
    Math.min(color.b * 1.3, 1),
  )
  const spinTipMaterial = createToonMaterial('spinTipMat', lighterColor, scene)
  applyMaterialToMeshTree(spinTipMesh, spinTipMaterial)
  const tipHeight = config.spinTip.visualParams.tipHeight ?? 0.3
  spinTipMesh.position.y = -tipHeight / 2 + 0.05
  spinTipMesh.parent = root
  meshList.push(spinTipMesh)

  function dispose() {
    meshList.forEach((mesh) => mesh.dispose(false, true))
    root.dispose()
  }

  return { root, attackRingMesh, weightDiskMesh, spinTipMesh, dispose }
}
