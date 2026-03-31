import {
  Color3,
  MeshBuilder,
  TransformNode,
  Mesh,
} from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { BeybladeConfig } from '../../types'
import { createToonMaterial, setToonOpacity } from '../renderer/toon-material'

export interface BeybladeModel {
  root: TransformNode;
  attackRingMesh: Mesh;
  weightDiskMesh: Mesh;
  spinTipMesh: Mesh;
  /** 旋轉模糊圓盤（高轉速時顯示） */
  blurDiscMesh: Mesh;
  dispose: () => void;
}

const TESS = 32

// ============================================================
// 攻擊環
// ============================================================

function createJaggedRing(scene: Scene, radius: number): Mesh {
  const root = new Mesh('jaggedRing', scene)

  // 底盤
  const base = MeshBuilder.CreateCylinder('jaggedBase', {
    diameterTop: radius * 1.9,
    diameterBottom: radius * 2,
    height: 0.06,
    tessellation: TESS,
  }, scene)
  base.parent = root

  // 上層薄盤（略小，形成階梯）
  const topLayer = MeshBuilder.CreateCylinder('jaggedTop', {
    diameterTop: radius * 1.6,
    diameterBottom: radius * 1.7,
    height: 0.04,
    tessellation: TESS,
  }, scene)
  topLayer.position.y = 0.05
  topLayer.parent = root

  // 中心凸起
  const hub = MeshBuilder.CreateCylinder('jaggedHub', {
    diameterTop: 0.15,
    diameterBottom: 0.2,
    height: 0.08,
    tessellation: 12,
  }, scene)
  hub.position.y = 0.07
  hub.parent = root

  // 鋸齒（12 個外突三角錐）
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12
    const tooth = MeshBuilder.CreateCylinder(`tooth${i}`, {
      diameterTop: 0.01,
      diameterBottom: 0.08,
      height: 0.12,
      tessellation: 4,
    }, scene)
    tooth.position.x = Math.cos(angle) * radius
    tooth.position.z = Math.sin(angle) * radius
    tooth.position.y = 0.02
    tooth.rotation.z = Math.cos(angle) * -0.4
    tooth.rotation.x = Math.sin(angle) * 0.4
    tooth.parent = root
  }

  // 外圈裝飾環
  const outerRing = MeshBuilder.CreateTorus('jaggedOuter', {
    diameter: radius * 2.05,
    thickness: 0.03,
    tessellation: TESS,
  }, scene)
  outerRing.position.y = 0.01
  outerRing.parent = root

  return root as unknown as Mesh
}

function createSmoothRing(scene: Scene, radius: number): Mesh {
  const root = new Mesh('smoothRing', scene)

  // 主體圓環（流線型）
  const mainRing = MeshBuilder.CreateTorus('smoothMain', {
    diameter: radius * 1.8,
    thickness: 0.14,
    tessellation: TESS,
  }, scene)
  mainRing.parent = root

  // 內盤
  const innerDisk = MeshBuilder.CreateCylinder('smoothInner', {
    diameterTop: radius * 1.2,
    diameterBottom: radius * 1.3,
    height: 0.05,
    tessellation: TESS,
  }, scene)
  innerDisk.parent = root

  // 中心寶石
  const gem = MeshBuilder.CreateSphere('smoothGem', {
    diameter: 0.12,
    segments: 12,
  }, scene)
  gem.position.y = 0.06
  gem.parent = root

  // 四條弧形裝飾溝（用薄環切片模擬）
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI * 2 * i) / 4
    const groove = MeshBuilder.CreateTorus(`groove${i}`, {
      diameter: radius * 1.4,
      thickness: 0.015,
      tessellation: 16,
    }, scene)
    groove.position.x = Math.cos(angle) * 0.08
    groove.position.z = Math.sin(angle) * 0.08
    groove.parent = root
  }

  return root as unknown as Mesh
}

function createTriangleRing(scene: Scene, radius: number): Mesh {
  const root = new Mesh('triangleRing', scene)

  // 底盤（三角形輪廓用三邊形 cylinder）
  const base = MeshBuilder.CreateCylinder('triBase', {
    diameterTop: radius * 1.5,
    diameterBottom: radius * 1.6,
    height: 0.06,
    tessellation: 3,
  }, scene)
  base.parent = root

  // 內圈圓盤
  const innerDisk = MeshBuilder.CreateCylinder('triInner', {
    diameter: radius * 0.9,
    height: 0.08,
    tessellation: TESS,
  }, scene)
  innerDisk.position.y = 0.02
  innerDisk.parent = root

  // 三個大型攻擊刃
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3 + Math.PI / 6

    // 刃身（扁平錐體）
    const blade = MeshBuilder.CreateCylinder(`blade${i}`, {
      diameterTop: 0.02,
      diameterBottom: 0.18,
      height: 0.25,
      tessellation: 6,
    }, scene)
    blade.position.x = Math.cos(angle) * (radius * 0.85)
    blade.position.z = Math.sin(angle) * (radius * 0.85)
    blade.position.y = 0.1

    // 向外傾斜
    blade.rotation.z = Math.cos(angle) * -0.5
    blade.rotation.x = Math.sin(angle) * 0.5
    blade.parent = root

    // 刃座（連接盤和刃的過渡）
    const mount = MeshBuilder.CreateCylinder(`bladeMount${i}`, {
      diameterTop: 0.12,
      diameterBottom: 0.16,
      height: 0.06,
      tessellation: 6,
    }, scene)
    mount.position.x = Math.cos(angle) * (radius * 0.6)
    mount.position.z = Math.sin(angle) * (radius * 0.6)
    mount.position.y = 0.04
    mount.parent = root
  }

  return root as unknown as Mesh
}

function createHexWingRing(scene: Scene, radius: number): Mesh {
  const root = new Mesh('hexWingRing', scene)

  // 六邊形底盤
  const base = MeshBuilder.CreateCylinder('hexBase', {
    diameterTop: radius * 1.3,
    diameterBottom: radius * 1.4,
    height: 0.05,
    tessellation: 6,
  }, scene)
  base.parent = root

  // 中心柱
  const hub = MeshBuilder.CreateCylinder('hexHub', {
    diameter: 0.2,
    height: 0.1,
    tessellation: 6,
  }, scene)
  hub.position.y = 0.05
  hub.parent = root

  // 六片翼片（有厚度和角度的翼型）
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6

    // 翼片主體
    const wing = MeshBuilder.CreateBox(`wing${i}`, {
      width: 0.32,
      height: 0.045,
      depth: 0.1,
    }, scene)
    wing.position.x = Math.cos(angle) * (radius * 0.82)
    wing.position.z = Math.sin(angle) * (radius * 0.82)
    wing.position.y = 0.02
    wing.rotation.y = angle + 0.2
    wing.parent = root

    // 翼尖（更小的尖端）
    const tip = MeshBuilder.CreateCylinder(`wingTip${i}`, {
      diameterTop: 0.01,
      diameterBottom: 0.06,
      height: 0.08,
      tessellation: 4,
    }, scene)
    tip.position.x = Math.cos(angle) * (radius * 1.02)
    tip.position.z = Math.sin(angle) * (radius * 1.02)
    tip.position.y = 0.02
    tip.rotation.z = Math.cos(angle) * -0.6
    tip.rotation.x = Math.sin(angle) * 0.6
    tip.parent = root

    // 連接肋
    const rib = MeshBuilder.CreateBox(`rib${i}`, {
      width: 0.03,
      height: 0.035,
      depth: radius * 0.5,
    }, scene)
    rib.position.x = Math.cos(angle) * (radius * 0.55)
    rib.position.z = Math.sin(angle) * (radius * 0.55)
    rib.position.y = 0.01
    rib.rotation.y = angle
    rib.parent = root
  }

  return root as unknown as Mesh
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

// ============================================================
// 重量盤
// ============================================================

function buildWeightDisk(scene: Scene, partId: string, params: Record<string, number>): Mesh {
  const diameter = params.diameter ?? 0.85
  const height = params.height ?? 0.15

  switch (partId) {
    case 'heavy': {
      const root = new Mesh('heavyDisk', scene)

      // 厚重外圈
      const outer = MeshBuilder.CreateTorus('heavyOuter', {
        diameter: diameter * 1.05,
        thickness: params.outerThickness ?? 0.28,
        tessellation: TESS,
      }, scene)
      outer.parent = root

      // 內盤
      const inner = MeshBuilder.CreateCylinder('heavyInner', {
        diameterTop: diameter * 0.55,
        diameterBottom: diameter * 0.6,
        height: height * 0.8,
        tessellation: TESS,
      }, scene)
      inner.parent = root

      // 連接肋（6 條）
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6
        const rib = MeshBuilder.CreateBox(`heavyRib${i}`, {
          width: 0.04,
          height: height * 0.5,
          depth: diameter * 0.2,
        }, scene)
        rib.position.x = Math.cos(angle) * (diameter * 0.37)
        rib.position.z = Math.sin(angle) * (diameter * 0.37)
        rib.rotation.y = angle
        rib.parent = root
      }

      return root as unknown as Mesh
    }

    case 'light': {
      const root = new Mesh('lightDisk', scene)

      // 薄型主盤
      const disk = MeshBuilder.CreateCylinder('lightMain', {
        diameterTop: diameter * 0.95,
        diameterBottom: diameter,
        height: height * 0.6,
        tessellation: TESS,
      }, scene)
      disk.parent = root

      // 鏤空裝飾（8 個小圓孔 = 用薄環模擬）
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        const hole = MeshBuilder.CreateTorus(`lightHole${i}`, {
          diameter: 0.08,
          thickness: 0.012,
          tessellation: 12,
        }, scene)
        hole.position.x = Math.cos(angle) * (diameter * 0.32)
        hole.position.z = Math.sin(angle) * (diameter * 0.32)
        hole.position.y = height * 0.3
        hole.parent = root
      }

      return root as unknown as Mesh
    }

    case 'eccentric': {
      const root = new Mesh('eccentricDisk', scene)

      // 主盤
      const disk = MeshBuilder.CreateCylinder('eccMain', {
        diameterTop: diameter * 0.9,
        diameterBottom: diameter,
        height,
        tessellation: TESS,
      }, scene)
      disk.parent = root

      // 偏心重錘
      const weight = MeshBuilder.CreateCylinder('eccWeight', {
        diameter: 0.22,
        height: height * 1.2,
        tessellation: 8,
      }, scene)
      weight.position.x = params.offsetX ?? 0.15
      weight.parent = root

      // 對側平衡孔
      const counterHole = MeshBuilder.CreateTorus('eccCounter', {
        diameter: 0.12,
        thickness: 0.02,
        tessellation: 12,
      }, scene)
      counterHole.position.x = -(params.offsetX ?? 0.15)
      counterHole.position.y = height * 0.5
      counterHole.parent = root

      return root as unknown as Mesh
    }

    default: {
      // balanced
      const root = new Mesh('balancedDisk', scene)

      const disk = MeshBuilder.CreateCylinder('balMain', {
        diameterTop: diameter * 0.95,
        diameterBottom: diameter,
        height,
        tessellation: TESS,
      }, scene)
      disk.parent = root

      // 同心裝飾環
      const ring = MeshBuilder.CreateTorus('balRing', {
        diameter: diameter * 0.7,
        thickness: 0.025,
        tessellation: TESS,
      }, scene)
      ring.position.y = height * 0.4
      ring.parent = root

      // 4 個均衡配重
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 * i) / 4
        const counterweight = MeshBuilder.CreateSphere(`balWeight${i}`, {
          diameter: 0.06,
          segments: 8,
        }, scene)
        counterweight.position.x = Math.cos(angle) * (diameter * 0.35)
        counterweight.position.z = Math.sin(angle) * (diameter * 0.35)
        counterweight.position.y = height * 0.3
        counterweight.parent = root
      }

      return root as unknown as Mesh
    }
  }
}

// ============================================================
// 軸心
// ============================================================

function buildSpinTip(scene: Scene, partId: string, params: Record<string, number>): Mesh {
  const topDiameter = params.topDiameter ?? 0.15
  const tipHeight = params.tipHeight ?? 0.3

  switch (partId) {
    case 'sharp': {
      const root = new Mesh('sharpTip', scene)

      // 底座
      const mount = MeshBuilder.CreateCylinder('sharpMount', {
        diameterTop: topDiameter * 1.2,
        diameterBottom: topDiameter * 1.4,
        height: tipHeight * 0.3,
        tessellation: TESS,
      }, scene)
      mount.parent = root

      // 尖銳主體
      const spike = MeshBuilder.CreateCylinder('sharpSpike', {
        diameterTop: topDiameter * 0.8,
        diameterBottom: 0.01,
        height: tipHeight * 0.7,
        tessellation: TESS,
      }, scene)
      spike.position.y = -tipHeight * 0.35
      spike.parent = root

      // 裝飾環
      const ring = MeshBuilder.CreateTorus('sharpRing', {
        diameter: topDiameter * 1.1,
        thickness: 0.015,
        tessellation: 16,
      }, scene)
      ring.position.y = -tipHeight * 0.05
      ring.parent = root

      return root as unknown as Mesh
    }

    case 'flat': {
      const root = new Mesh('flatTip', scene)

      // 上層連接座
      const mount = MeshBuilder.CreateCylinder('flatMount', {
        diameterTop: topDiameter,
        diameterBottom: topDiameter * 1.3,
        height: tipHeight * 0.4,
        tessellation: TESS,
      }, scene)
      mount.parent = root

      // 扁平底面
      const flat = MeshBuilder.CreateCylinder('flatBase', {
        diameterTop: topDiameter * 1.3,
        diameterBottom: topDiameter * 1.4,
        height: tipHeight * 0.15,
        tessellation: TESS,
      }, scene)
      flat.position.y = -tipHeight * 0.25
      flat.parent = root

      // 抓地紋路（十字溝）
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 * i) / 4
        const groove = MeshBuilder.CreateBox(`flatGroove${i}`, {
          width: topDiameter * 1.2,
          height: 0.01,
          depth: 0.02,
        }, scene)
        groove.position.y = -tipHeight * 0.32
        groove.rotation.y = angle
        groove.parent = root
      }

      return root as unknown as Mesh
    }

    case 'ball': {
      const root = new Mesh('ballTip', scene)

      // 上層連接座
      const mount = MeshBuilder.CreateCylinder('ballMount', {
        diameterTop: topDiameter,
        diameterBottom: topDiameter * 1.1,
        height: tipHeight * 0.35,
        tessellation: TESS,
      }, scene)
      mount.parent = root

      // 球體
      const ball = MeshBuilder.CreateSphere('ballEnd', {
        diameter: topDiameter * 1.3,
        segments: 16,
      }, scene)
      ball.position.y = -tipHeight * 0.3
      ball.parent = root

      // 球體裝飾環
      const ring = MeshBuilder.CreateTorus('ballRing', {
        diameter: topDiameter * 1.2,
        thickness: 0.012,
        tessellation: 16,
      }, scene)
      ring.position.y = -tipHeight * 0.3
      ring.rotation.x = Math.PI / 4
      ring.parent = root

      return root as unknown as Mesh
    }

    case 'spring': {
      const root = new Mesh('springTip', scene)

      // 上層連接座
      const mount = MeshBuilder.CreateCylinder('springMount', {
        diameterTop: topDiameter,
        diameterBottom: topDiameter * 1.2,
        height: tipHeight * 0.25,
        tessellation: TESS,
      }, scene)
      mount.parent = root

      // 彈簧線圈（5 層環）
      for (let i = 0; i < 5; i++) {
        const layerRatio = i / 4
        const layerDiameter = topDiameter * (1.2 - layerRatio * 0.4)
        const coil = MeshBuilder.CreateTorus(`coil${i}`, {
          diameter: layerDiameter,
          thickness: 0.018,
          tessellation: 16,
        }, scene)
        coil.position.y = -tipHeight * 0.1 - layerRatio * tipHeight * 0.5
        coil.parent = root
      }

      // 底端尖頭
      const bottom = MeshBuilder.CreateCylinder('springBottom', {
        diameterTop: topDiameter * 0.5,
        diameterBottom: 0.02,
        height: tipHeight * 0.2,
        tessellation: 12,
      }, scene)
      bottom.position.y = -tipHeight * 0.55
      bottom.parent = root

      return root as unknown as Mesh
    }

    default: {
      return MeshBuilder.CreateCylinder('defaultTip', {
        diameterTop: topDiameter,
        diameterBottom: topDiameter * 0.3,
        height: tipHeight,
        tessellation: TESS,
      }, scene)
    }
  }
}

// ============================================================
// 組裝
// ============================================================

/**
 * 從主色衍生出多層配色方案
 *
 * 每個零件的子部件用不同的變體色，避免整體同色太單調
 */
function createColorPalette(baseColor: Color3) {
  // 主色
  const primary = baseColor

  // 暗色（陰影/底座）
  const dark = new Color3(
    baseColor.r * 0.45,
    baseColor.g * 0.45,
    baseColor.b * 0.45,
  )

  // 亮色（高光/裝飾）
  const bright = new Color3(
    Math.min(baseColor.r * 1.5, 1),
    Math.min(baseColor.g * 1.5, 1),
    Math.min(baseColor.b * 1.5, 1),
  )

  // 金屬色（偏灰的主色，用於結構件）
  const metallic = new Color3(
    baseColor.r * 0.5 + 0.25,
    baseColor.g * 0.5 + 0.25,
    baseColor.b * 0.5 + 0.25,
  )

  // 強調色（互補色偏移，用於裝飾細節）
  const accent = new Color3(
    Math.min(baseColor.r * 0.3 + 0.7, 1),
    Math.min(baseColor.g * 0.6, 1),
    Math.min(baseColor.b * 0.3 + 0.5, 1),
  )

  return { primary, dark, bright, metallic, accent }
}

/**
 * 為 mesh tree 的子部件分配不同顏色
 *
 * 根節點 = 主色，子 mesh 依名稱關鍵字分配變體色
 */
function applyMultiColorMaterials(
  mesh: Mesh,
  scene: Scene,
  palette: ReturnType<typeof createColorPalette>,
  prefix: string,
) {
  // 根節點用主色
  mesh.material = createToonMaterial(`${prefix}-primary`, palette.primary, scene)

  mesh.getChildMeshes().forEach((child) => {
    const name = child.name.toLowerCase()

    if (name.includes('hub') || name.includes('mount') || name.includes('inner')) {
      child.material = createToonMaterial(`${prefix}-${child.name}-dark`, palette.dark, scene)
    }
    else if (name.includes('ring') || name.includes('groove') || name.includes('coil')) {
      child.material = createToonMaterial(`${prefix}-${child.name}-accent`, palette.accent, scene)
    }
    else if (name.includes('gem') || name.includes('tip') || name.includes('spike') || name.includes('tooth')) {
      child.material = createToonMaterial(`${prefix}-${child.name}-bright`, palette.bright, scene)
    }
    else if (name.includes('rib') || name.includes('weight') || name.includes('counter')) {
      child.material = createToonMaterial(`${prefix}-${child.name}-metallic`, palette.metallic, scene)
    }
    else {
      child.material = createToonMaterial(`${prefix}-${child.name}-primary`, palette.primary, scene)
    }
  })
}

export function createBeybladeModel(
  scene: Scene,
  config: BeybladeConfig,
  color: Color3,
): BeybladeModel {
  const root = new TransformNode('beyblade', scene)
  const meshList: Mesh[] = []
  const palette = createColorPalette(color)

  // --- 攻擊環（主色系） ---
  const attackRadius = config.attackRing.collisionRadius ?? 0.5
  const attackRingMesh = buildAttackRing(scene, config.attackRing.id, attackRadius)
  applyMultiColorMaterials(attackRingMesh, scene, palette, 'ring')
  attackRingMesh.position.y = 0.25
  attackRingMesh.parent = root
  meshList.push(attackRingMesh)

  // --- 重量盤（暗色系 + 金屬色） ---
  const weightDiskMesh = buildWeightDisk(scene, config.weightDisk.id, config.weightDisk.visualParams)
  const diskPalette = createColorPalette(new Color3(
    color.r * 0.6 + 0.15,
    color.g * 0.6 + 0.15,
    color.b * 0.6 + 0.15,
  ))
  applyMultiColorMaterials(weightDiskMesh, scene, diskPalette, 'disk')
  weightDiskMesh.position.y = 0.12
  weightDiskMesh.parent = root
  meshList.push(weightDiskMesh)

  // --- 軸心（亮色系） ---
  const spinTipMesh = buildSpinTip(scene, config.spinTip.id, config.spinTip.visualParams)
  const tipPalette = createColorPalette(new Color3(
    Math.min(color.r * 1.2, 1),
    Math.min(color.g * 1.2, 1),
    Math.min(color.b * 1.2, 1),
  ))
  applyMultiColorMaterials(spinTipMesh, scene, tipPalette, 'tip')
  const tipHeight = config.spinTip.visualParams.tipHeight ?? 0.3
  spinTipMesh.position.y = -tipHeight / 2 + 0.05
  spinTipMesh.parent = root
  meshList.push(spinTipMesh)

  // --- 旋轉模糊圓盤 ---
  const blurRadius = attackRadius * 1.1
  const blurDiscMesh = MeshBuilder.CreateDisc('blurDisc', {
    radius: blurRadius,
    tessellation: TESS,
  }, scene)
  blurDiscMesh.rotation.x = Math.PI / 2
  blurDiscMesh.position.y = 0.25
  blurDiscMesh.parent = root
  blurDiscMesh.isPickable = false

  // 模糊圓盤用半透明主色
  const blurMat = createToonMaterial('blurDiscMat', new Color3(
    color.r * 0.8 + 0.1,
    color.g * 0.8 + 0.1,
    color.b * 0.8 + 0.1,
  ), scene)
  setToonOpacity(blurMat, 0)
  blurDiscMesh.material = blurMat
  meshList.push(blurDiscMesh)

  function dispose() {
    meshList.forEach((mesh) => mesh.dispose(false, true))
    root.dispose()
  }

  return { root, attackRingMesh, weightDiskMesh, spinTipMesh, blurDiscMesh, dispose }
}
