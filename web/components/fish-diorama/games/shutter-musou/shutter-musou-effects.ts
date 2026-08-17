/** 快門的視覺回饋：瞄準扇形、閃光爆開、碎片飛散、敵人血條。
 *
 * 這裡只做「世界裡的東西」。電量、無雙槽、生命燈、必殺按鈕這些介面元素
 * 走契約的 reportHudState 交給 game-hud.vue 用 DOM 畫——疊圖網格得自己處理
 * 近裁切面、深度排序與觸控命中，還做不出漂亮的字與圓角。
 *
 * 瞄準扇形留在場景裡是因為它表達的是「地面上的哪一塊會被拍到」，
 * 那是世界的資訊，不是介面。
 */
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { FlashCone } from './shutter-musou-logic'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { Mesh as MeshClass } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { easeInCubic, easeOutCubic } from '../../shared/easing'
import { LOW_POLY_PALETTE } from '../../shared/low-poly-palette'
import { clamp, createRandomGenerator, damp, randomBetween } from '../../shared/random-generator'
import { MAX_CONE_HALF_ANGLE, MAX_CONE_RANGE, MUSOU_ULTIMATE_CONE } from './shutter-musou-logic'

/** 扇形用固定的最大張角建網格，實際張角靠繞 Y 縮放不會失真，
 * 所以改成每次重寫頂點——扇形的兩條邊必須真的貼合判定角度，
 * 玩家才不會覺得「看起來有掃到卻沒拍到」
 */
const CONE_SEGMENT_COUNT = 24

const AIM_COLOR = Color3.FromHexString('#f5efe2')
const FLASH_COLOR = Color3.White()
const SCRAP_COLOR_LIST = [
  LOW_POLY_PALETTE.bone,
  LOW_POLY_PALETTE.gold,
  LOW_POLY_PALETTE.coral,
  LOW_POLY_PALETTE.waterLight,
  LOW_POLY_PALETTE.leaf,
]

/** 碎片池大小。一次大範圍收服可能同時炸出十幾隻，池子要夠深 */
const SCRAP_POOL_SIZE = 90

interface ScrapParticle {
  mesh: Mesh;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  spinX: number;
  spinY: number;
  /** 個別壽命。齊生齊滅像程式排的，各自斷氣才像真的碎掉 */
  lifeSeconds: number;
  remainSeconds: number;
  /** 出生時的基準尺寸，縮小曲線乘在它上面 */
  baseScale: number;
}

export interface ShutterEffects {
  /** 每幀更新瞄準扇形。isCharging 為 false 時淡出 */
  setAimCone: (
    isCharging: boolean,
    originX: number,
    originZ: number,
    aimRadians: number,
    cone: FlashCone,
    chargeRatio: number,
  ) => void;
  /** 快門：扇形瞬間爆白並擴散 */
  playFlash: (originX: number, originZ: number, aimRadians: number, cone: FlashCone) => void;
  /** 無雙必殺：從鱈魚位置炸出一圈金色衝擊環，疊在 playFlash 之上。
   * 只加這一層世界內的一次性效果，不做螢幕整片染色那種持續閃爍
   */
  playUltimateFlash: (originX: number, originZ: number) => void;
  /** 從一個位置炸出碎片。impactRadians 是打擊方向，碎片往這個方向偏著噴 */
  burstScrap: (x: number, y: number, z: number, count: number, seedOffset: number, impactRadians: number) => void;
  /** 敵人的剩餘血量條：只給要拍不只一次的敵人（擋路魚、頭目）顯示，
   * 一拍就收服的雜兵沒有這個資訊可看，掛了也是純噪音
   */
  setEnemyHpBarList: (entryList: { x: number; y: number; z: number; ratio: number }[]) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

function createUnlitMaterial(scene: Scene, name: string, color: Color3, alpha: number): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.emissiveColor = color
  material.disableLighting = true
  material.backFaceCulling = false
  material.alpha = alpha
  return material
}

/** 建一個可每幀改寫頂點的扇形網格（原點在中心，沿 +X 展開） */
function createConeMesh(scene: Scene, name: string, material: StandardMaterial): Mesh {
  const mesh = new MeshClass(name, scene)
  const positionList = new Float32Array((CONE_SEGMENT_COUNT + 2) * 3)
  const indexList: number[] = []
  for (let segmentIndex = 0; segmentIndex < CONE_SEGMENT_COUNT; segmentIndex++) {
    indexList.push(0, segmentIndex + 1, segmentIndex + 2)
  }
  const vertexData = new VertexData()
  vertexData.positions = Array.from(positionList)
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh, true)
  mesh.material = material
  mesh.isPickable = false
  // 扇形貼著台面，不該被自己的法線影響光照
  mesh.alwaysSelectAsActiveMesh = true
  return mesh
}

/** 依角度與射程改寫扇形頂點 */
function writeConeGeometry(mesh: Mesh, aimRadians: number, cone: FlashCone, scale: number): void {
  const positionList = mesh.getVerticesData(VertexBuffer.PositionKind)
  if (!positionList) {
    return
  }
  positionList[0] = 0
  positionList[1] = 0
  positionList[2] = 0
  const range = cone.range * scale
  const halfAngle = Math.min(Math.PI, cone.halfAngleRadians)
  for (let segmentIndex = 0; segmentIndex <= CONE_SEGMENT_COUNT; segmentIndex++) {
    const ratio = segmentIndex / CONE_SEGMENT_COUNT
    const angle = aimRadians - halfAngle + halfAngle * 2 * ratio
    const base = (segmentIndex + 1) * 3
    positionList[base] = Math.cos(angle) * range
    positionList[base + 1] = 0
    positionList[base + 2] = Math.sin(angle) * range
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positionList)
}

export function createShutterEffects(
  scene: Scene,
  camera: ArcRotateCamera,
  arenaTopY: number,
): ShutterEffects {
  const worldRoot = new TransformNode('shutterMusouEffectRoot', scene)

  // --- 瞄準扇形與閃光扇形 ---
  const aimMaterial = createUnlitMaterial(scene, 'shutterMusouAim', AIM_COLOR, 0)
  const flashMaterial = createUnlitMaterial(scene, 'shutterMusouFlash', FLASH_COLOR, 0)
  const aimCone = createConeMesh(scene, 'shutterMusouAimCone', aimMaterial)
  const flashCone = createConeMesh(scene, 'shutterMusouFlashCone', flashMaterial)
  aimCone.parent = worldRoot
  flashCone.parent = worldRoot
  // 貼在台面上方一點點，避開台面頂點抖動的上緣，才不會 z-fighting
  aimCone.position.y = arenaTopY + 0.07
  flashCone.position.y = arenaTopY + 0.09

  // --- 無雙必殺的衝擊環：從鱈魚腳下炸開，一次性擴散到全場再淡出，
  // 取代舊版「螢幕整片染色＋連續開火」那種持續好幾秒的做法 ---
  const ultimateRingMaterial = createUnlitMaterial(scene, 'shutterMusouUltimateRingMaterial', Color3.FromHexString('#ffd873'), 0)
  // thickness 相對 diameter 抓得很細：這圈之後會整體等比放大到覆蓋全場，
  // 管徑會跟著等比變粗，基礎比例細一點，放大後才還讀得出是「一圈」而非一片色餅
  const ultimateRing = CreateTorus('shutterMusouUltimateRing', { diameter: 1, thickness: 0.045, tessellation: 40 }, scene)
  ultimateRing.parent = worldRoot
  ultimateRing.position.y = arenaTopY + 0.1
  ultimateRing.isPickable = false
  ultimateRing.material = ultimateRingMaterial
  ultimateRing.setEnabled(false)
  const ULTIMATE_RING_SECONDS = 0.68
  let ultimateRingElapsed = ULTIMATE_RING_SECONDS
  let ultimateRingOriginX = 0
  let ultimateRingOriginZ = 0

  // --- 敵人血量條：貼著世界座標、永遠面向鏡頭的小血條，只掛在耐拍的敵人頭上 ---
  const ENEMY_HP_BAR_POOL_SIZE = 20
  const ENEMY_HP_BAR_WIDTH = 0.62
  const ENEMY_HP_BAR_HEIGHT = 0.1
  const enemyHpBackingMaterial = createUnlitMaterial(scene, 'shutterMusouEnemyHpBacking', Color3.FromHexString('#12131c'), 0.75)
  const enemyHpFillMaterial = createUnlitMaterial(scene, 'shutterMusouEnemyHpFill', Color3.FromHexString('#ff8f5c'), 1)
  interface EnemyHpBarSlot { anchor: TransformNode; backing: Mesh; fillNode: TransformNode; fill: Mesh }
  const enemyHpBarSlotList: EnemyHpBarSlot[] = []
  for (let hpBarIndex = 0; hpBarIndex < ENEMY_HP_BAR_POOL_SIZE; hpBarIndex++) {
    // anchor 頂著billboard 轉向，backing／fill 是它底下同尺度的手足，
    // 避免 fill 疊在已經被 backing 縮放過的空間裡，寬度計算才不會複合出錯
    const anchor = new TransformNode(`shutterMusouEnemyHpAnchor${hpBarIndex}`, scene)
    anchor.parent = worldRoot
    anchor.billboardMode = MeshClass.BILLBOARDMODE_ALL

    const backing = CreatePlane(`shutterMusouEnemyHpBacking${hpBarIndex}`, { size: 1 }, scene)
    backing.material = enemyHpBackingMaterial
    backing.parent = anchor
    backing.isPickable = false
    backing.scaling.set(ENEMY_HP_BAR_WIDTH, ENEMY_HP_BAR_HEIGHT, 1)

    const fillNode = new TransformNode(`shutterMusouEnemyHpFillNode${hpBarIndex}`, scene)
    fillNode.parent = anchor
    const fill = CreatePlane(`shutterMusouEnemyHpFill${hpBarIndex}`, { size: 1 }, scene)
    fill.material = enemyHpFillMaterial
    fill.parent = fillNode
    fill.isPickable = false
    fill.position.z = -0.001
    // 單位方塊往 +x 偏半格，父節點縮放就等於從左端長出來，跟電量條同一招
    fill.position.x = 0.5
    fillNode.scaling.set(ENEMY_HP_BAR_WIDTH, ENEMY_HP_BAR_HEIGHT, 1)
    fillNode.position.x = -ENEMY_HP_BAR_WIDTH / 2

    anchor.setEnabled(false)
    enemyHpBarSlotList.push({ anchor, backing, fillNode, fill })
  }

  // --- 碎片池 ---
  const scrapMaterialList = SCRAP_COLOR_LIST.map((hex, index) => {
    const material = new StandardMaterial(`shutterMusouScrap${index}`, scene)
    material.diffuseColor = Color3.FromHexString(hex)
    material.specularColor = Color3.Black()
    material.backFaceCulling = false
    return material
  })
  const scrapList: ScrapParticle[] = []
  for (let scrapIndex = 0; scrapIndex < SCRAP_POOL_SIZE; scrapIndex++) {
    const mesh = CreatePlane(`shutterMusouScrapMesh${scrapIndex}`, { size: 0.2 }, scene)
    mesh.material = scrapMaterialList[scrapIndex % scrapMaterialList.length]!
    mesh.parent = worldRoot
    mesh.isPickable = false
    mesh.setEnabled(false)
    scrapList.push({
      mesh,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
      spinX: 0,
      spinY: 0,
      lifeSeconds: 1,
      remainSeconds: 0,
      baseScale: 1,
    })
  }
  let scrapCursor = 0

  let flashSeconds = 1
  let flashOriginX = 0
  let flashOriginZ = 0
  let flashAim = 0
  let flashConeShape: FlashCone = { halfAngleRadians: MAX_CONE_HALF_ANGLE, range: MAX_CONE_RANGE }
  let aimAlpha = 0

  return {
    setAimCone(isCharging, originX, originZ, aimRadians, cone, chargeRatio) {
      aimCone.position.x = originX
      aimCone.position.z = originZ
      writeConeGeometry(aimCone, aimRadians, cone, 1)
      // 蓄得越滿越亮，玩家不看電量條也感覺得到手上這一發有多強
      aimAlpha = isCharging ? 0.12 + chargeRatio * 0.22 : 0
    },
    playFlash(originX, originZ, aimRadians, cone) {
      flashSeconds = 0
      flashOriginX = originX
      flashOriginZ = originZ
      flashAim = aimRadians
      flashConeShape = cone
    },
    playUltimateFlash(originX, originZ) {
      ultimateRingElapsed = 0
      ultimateRingOriginX = originX
      ultimateRingOriginZ = originZ
    },
    setEnemyHpBarList(entryList) {
      for (const [slotIndex, slot] of enemyHpBarSlotList.entries()) {
        const entry = entryList[slotIndex]
        if (!entry) {
          slot.anchor.setEnabled(false)
          continue
        }
        slot.anchor.setEnabled(true)
        slot.anchor.position.set(entry.x, entry.y, entry.z)
        slot.fillNode.scaling.x = ENEMY_HP_BAR_WIDTH * clamp(entry.ratio, 0, 1)
      }
    },
    burstScrap(x, y, z, count, seedOffset, impactRadians) {
      const random = createRandomGenerator(seedOffset * 2246822519)
      // 主角碎片：一兩顆特別大、噴得慢、活得久，小碎片繞著它才有層次
      const heroCount = count > 1 ? 1 + Math.floor(random() * 2) : 1
      // 錐形散射：以打擊方向為軸往前偏。錐內角度用隨機間隔累加，
      // 不做 `rand()*2π` 那種每個方向機率均等的圓盤
      const coneHalfAngle = 1.15
      const intervalList: number[] = []
      let intervalTotal = 0
      for (let index = 0; index < count; index++) {
        const interval = 0.3 + random()
        intervalList.push(interval)
        intervalTotal += interval
      }
      let angleCursor = 0
      for (let index = 0; index < count; index++) {
        angleCursor += intervalList[index]!
        const scrap = scrapList[scrapCursor]!
        scrapCursor = (scrapCursor + 1) % scrapList.length
        const isHero = index < heroCount
        // 主角走錐心附近，不跟著間隔序列排到錐緣去
        const angle = isHero
          ? impactRadians + randomBetween(random, -0.5, 0.5)
          : impactRadians - coneHalfAngle + (angleCursor / intervalTotal) * coneHalfAngle * 2
        const speed = randomBetween(random, 1.6, 4.2) * (isHero ? 0.55 : 1)
        scrap.mesh.position.set(x, y, z)
        scrap.mesh.rotation.set(randomBetween(random, 0, 3), randomBetween(random, 0, 3), 0)
        scrap.baseScale = randomBetween(random, 0.5, 1.15) * (isHero ? randomBetween(random, 1.6, 2) : 1)
        scrap.mesh.scaling.setAll(scrap.baseScale)
        scrap.velocityX = Math.cos(angle) * speed
        scrap.velocityZ = Math.sin(angle) * speed
        // 垂直初速比水平大：爆起來是「噴泉」不是「圓盤」
        scrap.velocityY = randomBetween(random, 3, 5.2) * (isHero ? 0.8 : 1)
        scrap.spinX = randomBetween(random, -9, 9)
        scrap.spinY = randomBetween(random, -9, 9)
        scrap.lifeSeconds = isHero ? randomBetween(random, 0.9, 1.25) : randomBetween(random, 0.55, 1)
        scrap.remainSeconds = scrap.lifeSeconds
        scrap.mesh.setEnabled(true)
      }
    },
    update(deltaSeconds) {
      // 瞄準扇形淡入淡出
      aimMaterial.alpha = damp(aimMaterial.alpha, aimAlpha, 18, deltaSeconds)
      aimCone.setEnabled(aimMaterial.alpha > 0.01)

      // 閃光：瞬間全白再快速收掉，扇形同時往外擴一截
      if (flashSeconds < 1) {
        flashSeconds = Math.min(1, flashSeconds + deltaSeconds * 4.5)
        const fade = 1 - flashSeconds
        flashMaterial.alpha = fade * fade * 0.85
        flashCone.position.x = flashOriginX
        flashCone.position.z = flashOriginZ
        writeConeGeometry(flashCone, flashAim, flashConeShape, 1 + flashSeconds * 0.18)
        flashCone.setEnabled(true)
      }
      else if (flashCone.isEnabled()) {
        flashCone.setEnabled(false)
      }

      // 無雙必殺的衝擊環：從細小快速擴散到全場範圍，同時淡出，一次性演出
      // 不循環，跟舊版持續好幾秒的螢幕染色是完全不同的語彙
      if (ultimateRingElapsed < ULTIMATE_RING_SECONDS) {
        ultimateRingElapsed = Math.min(ULTIMATE_RING_SECONDS, ultimateRingElapsed + deltaSeconds)
        const ratio = ultimateRingElapsed / ULTIMATE_RING_SECONDS
        const expandRatio = easeOutCubic(ratio)
        const diameter = 0.6 + expandRatio * MUSOU_ULTIMATE_CONE.range * 2
        ultimateRing.position.x = ultimateRingOriginX
        ultimateRing.position.z = ultimateRingOriginZ
        ultimateRing.scaling.set(diameter, 0.4, diameter)
        // 環本身也跟著擴散變細，像真的往外炸開而不是一片固定寬度的色帶
        ultimateRingMaterial.alpha = (1 - easeInCubic(ratio)) * 0.85
        ultimateRing.setEnabled(true)
      }
      else if (ultimateRing.isEnabled()) {
        ultimateRing.setEnabled(false)
      }

      // 碎片：拋物線加自旋，落到台面下就回收
      for (const scrap of scrapList) {
        if (scrap.remainSeconds <= 0) {
          continue
        }
        scrap.remainSeconds -= deltaSeconds
        scrap.velocityY -= 11 * deltaSeconds
        scrap.mesh.position.x += scrap.velocityX * deltaSeconds
        scrap.mesh.position.y += scrap.velocityY * deltaSeconds
        scrap.mesh.position.z += scrap.velocityZ * deltaSeconds
        scrap.mesh.rotation.x += scrap.spinX * deltaSeconds
        scrap.mesh.rotation.y += scrap.spinY * deltaSeconds
        // 前七成壽命幾乎不縮，最後三成快速縮沒——
        // 消失要「倏地」一下，整路線性溶解會像淡出濾鏡
        const elapsedRatio = 1 - clamp(scrap.remainSeconds / scrap.lifeSeconds, 0, 1)
        const shrink = elapsedRatio < 0.7
          ? 1 - elapsedRatio * 0.06
          : 0.958 * (1 - easeInCubic((elapsedRatio - 0.7) / 0.3))
        scrap.mesh.scaling.setAll(Math.max(0.02, scrap.baseScale * shrink))
        if (scrap.remainSeconds <= 0) {
          scrap.mesh.setEnabled(false)
        }
      }
    },
    dispose() {
      for (const scrap of scrapList) {
        scrap.mesh.dispose()
      }
      for (const material of scrapMaterialList) {
        material.dispose()
      }
      for (const slot of enemyHpBarSlotList) {
        slot.anchor.dispose()
      }
      aimCone.dispose()
      flashCone.dispose()
      ultimateRing.dispose()
      aimMaterial.dispose()
      flashMaterial.dispose()
      ultimateRingMaterial.dispose()
      enemyHpBackingMaterial.dispose()
      enemyHpFillMaterial.dispose()
      worldRoot.dispose()
    },
  }
}
