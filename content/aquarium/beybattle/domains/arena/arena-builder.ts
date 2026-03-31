import {
  Color3,
  Color4,
  DynamicTexture,
  GlowLayer,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { ArenaType } from '../../types'
import { ARENA_RADIUS } from './arena-constants'
import { getObstacleList } from './obstacles'
import type { Obstacle } from './obstacles'
import { createBowlProfileFromTerrain, getTerrainProfile } from './terrain-profile'

export { ARENA_RADIUS }
const LATHE_TESSELLATION = 64

// --- 場地主題定義 ---

interface ArenaTheme {
  name: { 'zh-hant': string; 'en': string };
  /** 碗面漸層色 */
  bowlColorList: string[];
  /** 同心圓環色 */
  ringColor: string;
  /** 放射線色 */
  lineColor: string;
  /** 中心發光色 */
  centerGlowColor: string;
  /** 邊緣環色 */
  rimDiffuse: Color3;
  rimEmissive: Color3;
  /** 外圈環色 */
  outerRimDiffuse: Color3;
  outerRimEmissive: Color3;
  /** 底部光源色 */
  bottomLightColor: Color3;
  /** 漂浮粒子色 */
  particleColor1: Color4;
  particleColor2: Color4;
  /** 場景清除色（背景） */
  clearColor: Color4;
  /** 地板色 */
  floorColor: Color3;
  /** 碗面自發光色 */
  bowlEmissive: Color3;
}

const arenaThemeMap: Record<ArenaType, ArenaTheme> = {
  classic: {
    name: { 'zh-hant': '經典戰場', 'en': 'Classic Arena' },
    bowlColorList: ['#2a2a3e', '#1e1e30', '#15152a', '#0a0a1a'],
    ringColor: 'rgba(100, 120, 255, {opacity})',
    lineColor: 'rgba(80, 100, 200, 0.06)',
    centerGlowColor: 'rgba(120, 140, 255, {opacity})',
    rimDiffuse: new Color3(0.3, 0.35, 0.7),
    rimEmissive: new Color3(0.15, 0.18, 0.5),
    outerRimDiffuse: new Color3(0.15, 0.15, 0.25),
    outerRimEmissive: new Color3(0.04, 0.04, 0.1),
    bottomLightColor: new Color3(0.3, 0.35, 0.8),
    particleColor1: new Color4(0.4, 0.5, 1, 0.3),
    particleColor2: new Color4(0.6, 0.4, 1, 0.2),
    clearColor: new Color4(0.12, 0.12, 0.18, 1),
    floorColor: new Color3(0.05, 0.05, 0.1),
    bowlEmissive: new Color3(0.02, 0.02, 0.06),
  },
  volcano: {
    name: { 'zh-hant': '熔岩地獄', 'en': 'Volcano Pit' },
    bowlColorList: ['#3e1a0a', '#2e1208', '#1e0a04', '#120602'],
    ringColor: 'rgba(255, 100, 30, {opacity})',
    lineColor: 'rgba(255, 60, 20, 0.08)',
    centerGlowColor: 'rgba(255, 80, 20, {opacity})',
    rimDiffuse: new Color3(0.7, 0.25, 0.1),
    rimEmissive: new Color3(0.5, 0.12, 0.05),
    outerRimDiffuse: new Color3(0.25, 0.1, 0.05),
    outerRimEmissive: new Color3(0.12, 0.04, 0.02),
    bottomLightColor: new Color3(0.8, 0.3, 0.1),
    particleColor1: new Color4(1, 0.5, 0.1, 0.4),
    particleColor2: new Color4(1, 0.3, 0.05, 0.3),
    clearColor: new Color4(0.15, 0.06, 0.03, 1),
    floorColor: new Color3(0.1, 0.03, 0.01),
    bowlEmissive: new Color3(0.08, 0.02, 0.01),
  },
  ice: {
    name: { 'zh-hant': '極地冰原', 'en': 'Frozen Tundra' },
    bowlColorList: ['#d0e8f8', '#a0c8e8', '#70a0d0', '#4080b8'],
    ringColor: 'rgba(180, 220, 255, {opacity})',
    lineColor: 'rgba(150, 200, 255, 0.1)',
    centerGlowColor: 'rgba(200, 230, 255, {opacity})',
    rimDiffuse: new Color3(0.6, 0.8, 0.95),
    rimEmissive: new Color3(0.2, 0.35, 0.5),
    outerRimDiffuse: new Color3(0.4, 0.55, 0.7),
    outerRimEmissive: new Color3(0.1, 0.15, 0.25),
    bottomLightColor: new Color3(0.5, 0.7, 1.0),
    particleColor1: new Color4(0.8, 0.9, 1, 0.4),
    particleColor2: new Color4(0.6, 0.8, 1, 0.3),
    clearColor: new Color4(0.1, 0.15, 0.22, 1),
    floorColor: new Color3(0.08, 0.1, 0.15),
    bowlEmissive: new Color3(0.05, 0.08, 0.12),
  },
  void: {
    name: { 'zh-hant': '虛空深淵', 'en': 'Void Abyss' },
    bowlColorList: ['#1a0a2e', '#120820', '#0a0418', '#050210'],
    ringColor: 'rgba(180, 60, 255, {opacity})',
    lineColor: 'rgba(150, 40, 220, 0.08)',
    centerGlowColor: 'rgba(200, 80, 255, {opacity})',
    rimDiffuse: new Color3(0.5, 0.15, 0.7),
    rimEmissive: new Color3(0.3, 0.08, 0.5),
    outerRimDiffuse: new Color3(0.2, 0.08, 0.3),
    outerRimEmissive: new Color3(0.08, 0.03, 0.15),
    bottomLightColor: new Color3(0.5, 0.2, 0.8),
    particleColor1: new Color4(0.6, 0.2, 1, 0.35),
    particleColor2: new Color4(0.8, 0.4, 1, 0.25),
    clearColor: new Color4(0.05, 0.02, 0.1, 1),
    floorColor: new Color3(0.03, 0.01, 0.06),
    bowlEmissive: new Color3(0.04, 0.01, 0.08),
  },
  sakura: {
    name: { 'zh-hant': '櫻花庭園', 'en': 'Sakura Garden' },
    bowlColorList: ['#3e2a2e', '#301e22', '#22141a', '#180e12'],
    ringColor: 'rgba(255, 150, 180, {opacity})',
    lineColor: 'rgba(255, 120, 160, 0.06)',
    centerGlowColor: 'rgba(255, 170, 200, {opacity})',
    rimDiffuse: new Color3(0.7, 0.35, 0.45),
    rimEmissive: new Color3(0.4, 0.15, 0.22),
    outerRimDiffuse: new Color3(0.25, 0.12, 0.16),
    outerRimEmissive: new Color3(0.1, 0.04, 0.06),
    bottomLightColor: new Color3(0.8, 0.4, 0.5),
    particleColor1: new Color4(1, 0.6, 0.7, 0.35),
    particleColor2: new Color4(1, 0.75, 0.8, 0.25),
    clearColor: new Color4(0.12, 0.08, 0.1, 1),
    floorColor: new Color3(0.06, 0.03, 0.04),
    bowlEmissive: new Color3(0.05, 0.02, 0.03),
  },
}

export const arenaTypeList: ArenaType[] = ['classic', 'volcano', 'ice', 'void', 'sakura']

export function getArenaName(type: ArenaType, locale: string): string {
  const theme = arenaThemeMap[type]
  return locale.includes('zh') ? theme.name['zh-hant'] : theme.name['en']
}

// --- 碗面建模 ---

function createArenaTexture(scene: Scene, theme: ArenaTheme): DynamicTexture {
  const textureSize = 1024
  const texture = new DynamicTexture('arenaTexture', textureSize, scene, true)
  const context = texture.getContext()

  const gradient = context.createRadialGradient(
    textureSize / 2, textureSize / 2, 0,
    textureSize / 2, textureSize / 2, textureSize / 2,
  )
  const stopList = [0, 0.5, 0.85, 1]
  theme.bowlColorList.forEach((color, index) => {
    gradient.addColorStop(stopList[index] ?? index / theme.bowlColorList.length, color)
  })
  context.fillStyle = gradient
  context.fillRect(0, 0, textureSize, textureSize)

  // 同心圓環
  const ringCount = 8
  for (let i = 1; i <= ringCount; i++) {
    const radius = (textureSize / 2) * (i / ringCount)
    context.beginPath()
    context.arc(textureSize / 2, textureSize / 2, radius, 0, Math.PI * 2)
    const opacity = 0.08 + (i / ringCount) * 0.12
    context.strokeStyle = theme.ringColor.replace('{opacity}', String(opacity))
    context.lineWidth = 1.5
    context.stroke()
  }

  // 放射線
  const lineCount = 12
  for (let i = 0; i < lineCount; i++) {
    const angle = (Math.PI * 2 * i) / lineCount
    const innerRadius = textureSize * 0.05
    const outerRadius = textureSize * 0.48
    context.beginPath()
    context.moveTo(
      textureSize / 2 + Math.cos(angle) * innerRadius,
      textureSize / 2 + Math.sin(angle) * innerRadius,
    )
    context.lineTo(
      textureSize / 2 + Math.cos(angle) * outerRadius,
      textureSize / 2 + Math.sin(angle) * outerRadius,
    )
    context.strokeStyle = theme.lineColor
    context.lineWidth = 2
    context.stroke()
  }

  // 中心發光
  const centerGlow = context.createRadialGradient(
    textureSize / 2, textureSize / 2, 0,
    textureSize / 2, textureSize / 2, textureSize * 0.12,
  )
  centerGlow.addColorStop(0, theme.centerGlowColor.replace('{opacity}', '0.3'))
  centerGlow.addColorStop(1, theme.centerGlowColor.replace('{opacity}', '0'))
  context.fillStyle = centerGlow
  context.fillRect(0, 0, textureSize, textureSize)

  texture.update()
  return texture
}

function createAmbientParticleTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('ambientParticleTex', 32, scene, true)
  const context = texture.getContext()
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 14)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 32, 32)
  texture.update()
  return texture
}

// --- 公開介面 ---

export interface ArenaResult {
  root: TransformNode;
  glowLayer: GlowLayer;
  dispose: () => void;
}

export function createArena(scene: Scene, arenaType: ArenaType = 'classic'): ArenaResult {
  const theme = arenaThemeMap[arenaType]
  const root = new TransformNode('arena', scene)
  const disposableList: { dispose: () => void }[] = []

  // 套用場景清除色
  scene.clearColor = theme.clearColor

  // --- 碗狀本體 ---
  const terrainProfile = getTerrainProfile(arenaType)
  const bowlProfile = createBowlProfileFromTerrain(terrainProfile)
  const bowl = MeshBuilder.CreateLathe('arenaBowl', {
    shape: bowlProfile,
    tessellation: LATHE_TESSELLATION,
    sideOrientation: 2,
  }, scene)

  const bowlMaterial = new StandardMaterial('arenaBowlMaterial', scene)
  bowlMaterial.diffuseTexture = createArenaTexture(scene, theme)
  bowlMaterial.specularColor = new Color3(0.2, 0.2, 0.35)
  bowlMaterial.specularPower = 32
  bowlMaterial.emissiveColor = theme.bowlEmissive
  bowl.material = bowlMaterial
  bowl.parent = root
  bowl.receiveShadows = true
  disposableList.push(bowl)

  // --- 發光邊緣環 ---
  const rim = MeshBuilder.CreateTorus('arenaRim', {
    diameter: ARENA_RADIUS * 2 + 0.15,
    thickness: 0.12,
    tessellation: LATHE_TESSELLATION,
  }, scene)
  const rimMaterial = new StandardMaterial('arenaRimMaterial', scene)
  rimMaterial.diffuseColor = theme.rimDiffuse
  rimMaterial.emissiveColor = theme.rimEmissive
  rimMaterial.specularColor = new Color3(0.5, 0.5, 0.8)
  rimMaterial.specularPower = 16
  rim.material = rimMaterial
  rim.position.y = 0
  rim.parent = root
  disposableList.push(rim)

  // --- 外圈裝飾環 ---
  const outerRim = MeshBuilder.CreateTorus('arenaOuterRim', {
    diameter: ARENA_RADIUS * 2 + 0.6,
    thickness: 0.25,
    tessellation: LATHE_TESSELLATION,
  }, scene)
  const outerRimMaterial = new StandardMaterial('arenaOuterRimMaterial', scene)
  outerRimMaterial.diffuseColor = theme.outerRimDiffuse
  outerRimMaterial.emissiveColor = theme.outerRimEmissive
  outerRimMaterial.specularColor = new Color3(0.1, 0.1, 0.2)
  outerRim.material = outerRimMaterial
  outerRim.position.y = -0.06
  outerRim.parent = root
  disposableList.push(outerRim)

  // --- 底部光源 ---
  const bottomLight = new PointLight('arenaBottomLight', new Vector3(0, -1.5, 0), scene)
  bottomLight.diffuse = theme.bottomLightColor
  bottomLight.intensity = 0.4
  bottomLight.radius = 6
  disposableList.push(bottomLight)

  // --- Glow Layer ---
  const glowLayer = new GlowLayer('glowLayer', scene, {
    blurKernelSize: 32,
    mainTextureFixedSize: 512,
  })
  glowLayer.intensity = 0.6
  disposableList.push(glowLayer)

  // --- 漂浮粒子 ---
  const ambientParticleSystem = new ParticleSystem('ambientParticles', 30, scene)
  ambientParticleSystem.particleTexture = createAmbientParticleTexture(scene)
  ambientParticleSystem.emitter = new Vector3(0, -0.5, 0)
  ambientParticleSystem.createBoxEmitter(
    new Vector3(0, 0.5, 0),
    new Vector3(0, 1, 0),
    new Vector3(-ARENA_RADIUS, 0, -ARENA_RADIUS),
    new Vector3(ARENA_RADIUS, 0, ARENA_RADIUS),
  )
  ambientParticleSystem.minLifeTime = 2
  ambientParticleSystem.maxLifeTime = 5
  ambientParticleSystem.minSize = 0.02
  ambientParticleSystem.maxSize = 0.06
  ambientParticleSystem.emitRate = 8
  ambientParticleSystem.minEmitPower = 0.1
  ambientParticleSystem.maxEmitPower = 0.3
  ambientParticleSystem.color1 = theme.particleColor1
  ambientParticleSystem.color2 = theme.particleColor2
  ambientParticleSystem.colorDead = new Color4(
    theme.particleColor1.r * 0.5,
    theme.particleColor1.g * 0.5,
    theme.particleColor1.b * 0.5,
    0,
  )
  ambientParticleSystem.gravity = new Vector3(0, 0.2, 0)
  ambientParticleSystem.start()
  disposableList.push(ambientParticleSystem)

  // --- 障礙物 ---
  const obstacleList = getObstacleList(arenaType)
  for (const obstacle of obstacleList) {
    const obstacleY = terrainProfile.getHeightAtDistance(
      Math.sqrt(obstacle.positionX ** 2 + obstacle.positionY ** 2),
    )

    if (obstacle.shape === 'pillar') {
      const pillar = MeshBuilder.CreateCylinder(`obstacle-${obstacle.id}`, {
        diameter: obstacle.radius * 2,
        height: 0.6,
        tessellation: 16,
      }, scene)
      pillar.position.set(obstacle.positionX, obstacleY + 0.3, obstacle.positionY)
      const pillarMat = new StandardMaterial(`mat-${obstacle.id}`, scene)
      pillarMat.diffuseColor = theme.rimDiffuse.scale(0.7)
      pillarMat.emissiveColor = theme.rimEmissive.scale(0.3)
      pillarMat.specularColor = new Color3(0.2, 0.2, 0.2)
      pillar.material = pillarMat
      pillar.parent = root
      disposableList.push(pillar)
    }
    else if (obstacle.shape === 'wall') {
      const wallLength = obstacle.radius * 2
      const wallThickness = obstacle.thickness ?? 0.15
      const wall = MeshBuilder.CreateBox(`obstacle-${obstacle.id}`, {
        width: wallLength,
        height: 0.35,
        depth: wallThickness,
      }, scene)
      wall.position.set(obstacle.positionX, obstacleY + 0.17, obstacle.positionY)
      wall.rotation.y = obstacle.angle ?? 0
      const wallMat = new StandardMaterial(`mat-${obstacle.id}`, scene)
      wallMat.diffuseColor = theme.rimDiffuse.scale(0.8)
      wallMat.emissiveColor = theme.rimEmissive.scale(0.4)
      wallMat.specularColor = new Color3(0.3, 0.3, 0.3)
      wall.material = wallMat
      wall.parent = root
      disposableList.push(wall)
    }
    else if (obstacle.shape === 'bumper') {
      const bumper = MeshBuilder.CreateSphere(`obstacle-${obstacle.id}`, {
        diameter: obstacle.radius * 2,
        segments: 12,
      }, scene)
      bumper.position.set(obstacle.positionX, obstacleY + obstacle.radius, obstacle.positionY)
      const bumperMat = new StandardMaterial(`mat-${obstacle.id}`, scene)
      bumperMat.diffuseColor = theme.rimDiffuse
      bumperMat.emissiveColor = theme.rimEmissive.scale(0.8)
      bumperMat.specularColor = new Color3(0.5, 0.5, 0.5)
      bumper.material = bumperMat
      bumper.parent = root
      disposableList.push(bumper)

      // 區域效果視覺化（半透明圓圈）
      if (obstacle.zoneEffect) {
        const zoneDisc = MeshBuilder.CreateDisc(`zone-${obstacle.id}`, {
          radius: obstacle.zoneEffect.effectRadius,
          tessellation: 32,
        }, scene)
        zoneDisc.rotation.x = Math.PI / 2
        zoneDisc.position.set(obstacle.positionX, obstacleY + 0.02, obstacle.positionY)
        const zoneMat = new StandardMaterial(`zoneMat-${obstacle.id}`, scene)
        zoneMat.diffuseColor = theme.rimDiffuse
        zoneMat.emissiveColor = theme.rimEmissive
        zoneMat.alpha = 0.15
        zoneDisc.material = zoneMat
        zoneDisc.parent = root
        disposableList.push(zoneDisc)
      }
    }
  }

  // --- 地板 ---
  const floor = MeshBuilder.CreateGround('floor', { width: 30, height: 30 }, scene)
  floor.position.y = -1.5
  const floorMaterial = new StandardMaterial('floorMaterial', scene)
  floorMaterial.diffuseColor = theme.floorColor
  floorMaterial.specularColor = new Color3(0.02, 0.02, 0.05)
  floor.material = floorMaterial
  floor.receiveShadows = true
  floor.parent = root
  disposableList.push(floor)

  function dispose() {
    disposableList.forEach((item) => item.dispose())
    root.dispose()
  }

  return { root, glowLayer, dispose }
}
