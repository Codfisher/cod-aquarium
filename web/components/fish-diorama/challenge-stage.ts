/** 挑戰小遊戲的 3D 舞台：打字機節奏軌道與畫室畫架。
 *
 * 遊戲判定與計分邏輯留在 Vue 元件，這裡只負責 3D 呈現——
 * Vue 透過 DioramaSceneHandle 上的舞台 API 每幀同步狀態、觸發演出。
 */
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Observer } from '@babylonjs/core/Misc/observable'
import type { Scene } from '@babylonjs/core/scene'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'

/** 節奏音符的視圖資料（由打字機挑戰每幀同步） */
export interface TypewriterNoteView {
  index: number;
  letter: string;
  /** 距離判定點的秒數（正值 = 尚未抵達） */
  offsetSeconds: number;
  state: 'upcoming' | 'hit' | 'miss';
  isNear: boolean;
}

/** 畫布平面座標（與 2D 版 viewBox 同尺度：320 × 220） */
export interface PlanarPoint {
  x: number;
  y: number;
}

/** 音符流速（世界單位／秒）與軌道可視半長 */
const NOTE_SPEED_WORLD = 1.3
const RAIL_VISIBLE_LENGTH = 3.6
/** 音符字塊池：涵蓋軌道上同時可見的最大數量 */
const NOTE_TILE_POOL_SIZE = 12
/** 命中／漏拍的演出時長（秒） */
const TILE_HIT_ANIM_SECONDS = 0.28
const TILE_MISS_ANIM_SECONDS = 0.5
/** 漏拍卡紙抖動時長（秒） */
const TYPEWRITER_SHAKE_SECONDS = 0.35
/** 完稿紙張飛向鏡頭的時長（秒） */
const PAPER_FLY_SECONDS = 1

/** 畫布 viewBox 尺寸與 3D 畫布尺寸／貼圖解析度 */
const CANVAS_VIEW_WIDTH = 320
const CANVAS_VIEW_HEIGHT = 220
const CANVAS_TEXTURE_SCALE = 2
const BOARD_WIDTH = 1.5
const BOARD_HEIGHT = BOARD_WIDTH * (CANVAS_VIEW_HEIGHT / CANVAS_VIEW_WIDTH)

interface NoteTile {
  plane: Mesh;
  texture: DynamicTexture;
  noteIndex: number | null;
  letter: string;
  state: TypewriterNoteView['state'];
  offsetSeconds: number;
  isNear: boolean;
  animSeconds: number;
}

export interface TypewriterStage {
  enter: () => void;
  exit: () => void;
  syncNoteList: (noteViewList: TypewriterNoteView[]) => void;
  setPaperText: (lineList: string[], currentLine: string) => void;
  playMiss: () => void;
  playSuccess: () => void;
  /** 舞台鏡頭聚焦點與距離 */
  focusTarget: { x: number; y: number; z: number; radius: number };
}

/** 相機螢幕右方向投影到地面（XZ 平面）的單位向量 */
function getScreenRightOnGround(camera: ArcRotateCamera): Vector3 {
  const rightDirection = camera.getDirection(new Vector3(1, 0, 0))
  rightDirection.y = 0
  const length = rightDirection.length() || 1
  return rightDirection.scaleInPlace(1 / length)
}

/** 建立打字機節奏舞台：字塊沿懸浮軌道滑向判定圈，
 * 命中被「吸進」打字機、漏拍變灰墜落；紙張文字畫在 3D 紙上
 */
export function createTypewriterStage(
  scene: Scene,
  camera: ArcRotateCamera,
  partMap: { root: TransformNode; keyList: Mesh[]; paper: Mesh },
): TypewriterStage {
  const rootPosition = partMap.root.position
  /** 判定圈的世界位置：打字機正上方 */
  const hitPoint = new Vector3(rootPosition.x, 1.45, rootPosition.z)
  /** 音符來向（進場時依取景重算） */
  const railDirection = new Vector3(1, 0, 0)

  let isBuilt = false
  let isActive = false
  let renderObserver: Observer<Scene> | null = null
  let elapsedSeconds = 0
  let shakeRemainingSeconds = 0
  let paperFlySeconds = -1

  let hitRing: Mesh | undefined
  const tileList: NoteTile[] = []
  let paperTextPlane: Mesh | undefined
  let paperTextTexture: DynamicTexture | undefined
  const paperPlaneBasePosition = new Vector3()
  const paperPlaneBaseRotation = new Vector3()

  function build() {
    if (isBuilt) {
      return
    }
    isBuilt = true

    // 判定圈：預先翻轉讓孔面朝 Z，再 billboard 面向鏡頭
    hitRing = CreateTorus('stageHitRing', { diameter: 0.52, thickness: 0.035, tessellation: 24 }, scene)
    hitRing.rotation.x = Math.PI / 2
    hitRing.bakeCurrentTransformIntoVertices()
    hitRing.billboardMode = TransformNode.BILLBOARDMODE_ALL
    const ringMaterial = new StandardMaterial('stageHitRingMaterial', scene)
    ringMaterial.emissiveColor = Color3.FromHexString('#2fb8a6')
    ringMaterial.diffuseColor = Color3.Black()
    ringMaterial.specularColor = Color3.Black()
    ringMaterial.disableLighting = true
    hitRing.material = ringMaterial
    hitRing.isPickable = false
    hitRing.position.copyFrom(hitPoint)

    // 字塊池：billboard 平面＋各自的字元貼圖
    for (let index = 0; index < NOTE_TILE_POOL_SIZE; index++) {
      const texture = new DynamicTexture(`stageNoteTexture${index}`, { width: 128, height: 128 }, scene, false)
      texture.hasAlpha = true
      const material = new StandardMaterial(`stageNoteMaterial${index}`, scene)
      material.diffuseTexture = texture
      material.useAlphaFromDiffuseTexture = true
      material.emissiveColor = new Color3(0.92, 0.92, 0.92)
      material.disableLighting = true
      material.maxSimultaneousLights = 6
      const plane = CreatePlane(`stageNoteTile${index}`, { size: 0.36 }, scene)
      plane.material = material
      plane.billboardMode = TransformNode.BILLBOARDMODE_ALL
      plane.isPickable = false
      plane.setEnabled(false)
      tileList.push({
        plane,
        texture,
        noteIndex: null,
        letter: '',
        state: 'upcoming',
        offsetSeconds: 0,
        isNear: false,
        animSeconds: 0,
      })
    }

    // 紙張文字面：beveled box 沒有 UV，貼一片有 UV 的平面在紙前
    // 自發光呈現：紙張浮空飛行時若吃場景光照，背光角度會整張偏暗。
    // 貼圖掛 diffuseTexture＋白色 emissive（與節奏字塊、鎖頭旗標同一套做法）：
    // 只掛 emissiveTexture 在此管線下取不到樣，整片會黑掉，紙上就看不到字
    paperTextTexture = new DynamicTexture('stagePaperTexture', { width: 256, height: 224 }, scene, false)
    const paperMaterial = new StandardMaterial('stagePaperTextMaterial', scene)
    paperMaterial.diffuseTexture = paperTextTexture
    paperMaterial.emissiveColor = Color3.White()
    paperMaterial.disableLighting = true
    paperMaterial.specularColor = Color3.Black()
    // 直式取景整台打字機轉 90°，關掉背面剔除確保哪個方位都看得到字
    paperMaterial.backFaceCulling = false
    // CreatePlane 正面朝 -z，貼在紙前不需再旋轉，正面即朝向鏡頭
    paperTextPlane = CreatePlane('stagePaperTextPlane', { width: 0.43, height: 0.36 }, scene)
    paperTextPlane.material = paperMaterial
    paperTextPlane.isPickable = false
    // 離紙面 0.01（紙半厚 0.0075）：貼太近會被 SSAO 當成夾縫壓暗
    paperTextPlane.position.set(0, 0.005, -0.018)
    paperTextPlane.parent = partMap.paper
    paperPlaneBasePosition.copyFrom(paperTextPlane.position)
    paperPlaneBaseRotation.copyFrom(paperTextPlane.rotation)
    drawPaperText([], '')
  }

  function drawTileLetter(tile: NoteTile) {
    const context = tile.texture.getContext() as unknown as CanvasRenderingContext2D
    context.clearRect(0, 0, 128, 128)
    const isMissed = tile.state === 'miss'
    // 圓角卡片底
    context.beginPath()
    context.roundRect(8, 8, 112, 112, 22)
    context.fillStyle = isMissed ? 'rgba(150, 150, 150, 0.85)' : 'rgba(255, 253, 247, 0.96)'
    context.fill()
    context.lineWidth = 6
    context.strokeStyle = isMissed ? '#6b6b6b' : '#4f9ac2'
    context.stroke()
    context.fillStyle = isMissed ? '#4a4a4a' : '#2f3d45'
    context.font = 'bold 64px "Noto Sans TC", "Microsoft JhengHei", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(tile.letter === ' ' ? '␣' : tile.letter, 64, 68)
    tile.texture.update()
  }

  function drawPaperText(lineList: string[], currentLine: string) {
    if (!paperTextTexture) {
      return
    }
    const context = paperTextTexture.getContext() as unknown as CanvasRenderingContext2D
    context.fillStyle = '#fffef8'
    context.fillRect(0, 0, 256, 224)
    // 左側紅邊線：復刻稿紙感
    context.fillStyle = 'rgba(226, 105, 79, 0.4)'
    context.fillRect(22, 0, 3, 224)
    context.font = 'bold 24px "Courier New", "Noto Sans TC", monospace'
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillStyle = '#2f3d45'
    const allLineList = [...lineList, currentLine].filter((line) => line.length > 0)
    // 只顯示最後 4 行，行高 44
    const visibleLineList = allLineList.slice(-4)
    visibleLineList.forEach((line, lineIndex) => {
      context.fillText(line, 36, 44 + lineIndex * 44)
    })
    paperTextTexture.update()
  }

  function update() {
    const deltaSeconds = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000)
    elapsedSeconds += deltaSeconds

    // 判定圈呼吸
    if (hitRing) {
      const pulse = 1 + Math.sin(elapsedSeconds * 5) * 0.06
      hitRing.scaling.setAll(pulse)
    }

    // 漏拍卡紙抖動
    if (shakeRemainingSeconds > 0) {
      shakeRemainingSeconds = Math.max(0, shakeRemainingSeconds - deltaSeconds)
      const shakeRatio = shakeRemainingSeconds / TYPEWRITER_SHAKE_SECONDS
      partMap.root.rotation.z = Math.sin(elapsedSeconds * 70) * 0.055 * shakeRatio
    }

    // 字塊：命中吸進打字機、漏拍墜落淡出
    for (const tile of tileList) {
      if (tile.noteIndex === null) {
        continue
      }
      if (tile.state === 'upcoming') {
        tile.plane.position.copyFrom(hitPoint)
        tile.plane.position.addInPlace(railDirection.scale(tile.offsetSeconds * NOTE_SPEED_WORLD))
        tile.plane.scaling.setAll(tile.isNear ? 1.18 : 1)
        continue
      }
      tile.animSeconds += deltaSeconds
      if (tile.state === 'hit') {
        const progress = Math.min(1, tile.animSeconds / TILE_HIT_ANIM_SECONDS)
        // 從判定圈吸向打字機紙張
        const paperWorld = partMap.paper.getAbsolutePosition()
        tile.plane.position.set(
          hitPoint.x + (paperWorld.x - hitPoint.x) * progress,
          hitPoint.y + (paperWorld.y - hitPoint.y) * progress,
          hitPoint.z + (paperWorld.z - hitPoint.z) * progress,
        )
        tile.plane.scaling.setAll(1.18 * (1 - progress * 0.85))
        if (progress >= 1) {
          tile.noteIndex = null
          tile.plane.setEnabled(false)
        }
        continue
      }
      // miss：往下墜、縮小
      const progress = Math.min(1, tile.animSeconds / TILE_MISS_ANIM_SECONDS)
      tile.plane.position.y -= deltaSeconds * (1.2 + progress * 2)
      tile.plane.scaling.setAll(1 - progress * 0.7)
      if (progress >= 1) {
        tile.noteIndex = null
        tile.plane.setEnabled(false)
      }
    }

    // 完稿：紙張文字面飛到鏡頭前方緩緩放大（billboard 正對鏡頭）
    if (paperFlySeconds >= 0 && paperTextPlane) {
      paperFlySeconds += deltaSeconds
      const progress = Math.min(1, paperFlySeconds / PAPER_FLY_SECONDS)
      const eased = 1 - (1 - progress) ** 3
      const forward = camera.getDirection(new Vector3(0, 0, 1))
      const flyTarget = camera.globalPosition.add(forward.scale(2.4))
      const current = paperTextPlane.getAbsolutePosition()
      paperTextPlane.position.addInPlace(flyTarget.subtract(current).scale(Math.min(1, deltaSeconds * 6)))
      paperTextPlane.scaling.setAll(1 + eased * 0.5)
    }
  }

  return {
    focusTarget: { x: rootPosition.x, y: 1, z: rootPosition.z, radius: 5.4 },
    enter() {
      build()
      isActive = true
      elapsedSeconds = 0
      shakeRemainingSeconds = 0
      paperFlySeconds = -1
      getScreenRightOnGround(camera).scaleToRef(1, railDirection)
      hitRing?.setEnabled(true)
      renderObserver = scene.onBeforeRenderObservable.add(update)
    },
    exit() {
      if (!isActive) {
        return
      }
      isActive = false
      scene.onBeforeRenderObservable.remove(renderObserver)
      renderObserver = null
      hitRing?.setEnabled(false)
      for (const tile of tileList) {
        tile.noteIndex = null
        tile.plane.setEnabled(false)
      }
      partMap.root.rotation.z = 0
      // 紙張文字面歸位（完稿飛行後）。setParent/lookAt 會寫入 rotationQuaternion，
      // 必須先清掉，Euler rotation 的還原才會生效
      if (paperTextPlane) {
        paperTextPlane.setParent(partMap.paper)
        paperTextPlane.billboardMode = TransformNode.BILLBOARDMODE_NONE
        paperTextPlane.rotationQuaternion = null
        paperTextPlane.position.copyFrom(paperPlaneBasePosition)
        paperTextPlane.rotation.copyFrom(paperPlaneBaseRotation)
        paperTextPlane.scaling.setAll(1)
        drawPaperText([], '')
      }
    },
    syncNoteList(noteViewList) {
      if (!isActive) {
        return
      }
      for (const noteView of noteViewList) {
        const distance = noteView.offsetSeconds * NOTE_SPEED_WORLD
        const tile = tileList.find((item) => item.noteIndex === noteView.index)

        if (tile) {
          // 換句後 index 重複但字不同：視為重新指派，避免殘留上一句的字
          if (tile.letter !== noteView.letter) {
            tile.letter = noteView.letter
            tile.state = noteView.state
            tile.animSeconds = 0
            drawTileLetter(tile)
          }
          tile.offsetSeconds = noteView.offsetSeconds
          tile.isNear = noteView.isNear
          // 狀態轉變：重繪灰卡（miss）或啟動演出
          if (tile.state !== noteView.state) {
            tile.state = noteView.state
            tile.animSeconds = 0
            if (noteView.state === 'miss') {
              drawTileLetter(tile)
            }
          }
          continue
        }

        // 尚未指派字塊：進入可視範圍的 upcoming 音符才佔用
        if (noteView.state !== 'upcoming' || distance > RAIL_VISIBLE_LENGTH || distance < -0.4) {
          continue
        }
        const freeTile = tileList.find((item) => item.noteIndex === null)
        if (!freeTile) {
          continue
        }
        freeTile.noteIndex = noteView.index
        freeTile.letter = noteView.letter
        freeTile.state = 'upcoming'
        freeTile.offsetSeconds = noteView.offsetSeconds
        freeTile.isNear = noteView.isNear
        freeTile.animSeconds = 0
        drawTileLetter(freeTile)
        freeTile.plane.setEnabled(true)
      }
    },
    setPaperText(lineList, currentLine) {
      if (isBuilt) {
        drawPaperText(lineList, currentLine)
      }
    },
    playMiss() {
      shakeRemainingSeconds = TYPEWRITER_SHAKE_SECONDS
    },
    playSuccess() {
      if (paperTextPlane) {
        paperTextPlane.setParent(null)
        // setParent 寫入的 rotationQuaternion 會讓 billboard 歪斜，先清掉
        paperTextPlane.rotationQuaternion = null
        paperTextPlane.rotation.setAll(0)
        paperTextPlane.billboardMode = TransformNode.BILLBOARDMODE_ALL
        paperFlySeconds = 0
      }
    },
  }
}

export interface CrayonStage {
  enter: (outlinePointList: readonly PlanarPoint[]) => void;
  exit: () => void;
  pickCanvasPoint: (canvasX: number, canvasY: number) => PlanarPoint | null;
  beginStroke: (point: PlanarPoint, color: string) => void;
  strokeTo: (point: PlanarPoint) => void;
  endStroke: () => void;
  clearCanvas: () => void;
  finishArtwork: (fillColor: string) => void;
  setCrayonColor: (color: string) => void;
  /** 舞台鏡頭聚焦點與距離（進場時依畫架位置更新） */
  focusTarget: { x: number; y: number; z: number; radius: number };
}

/** 建立畫室舞台：蠟筆組旁長出畫架與畫布，
 * 玩家的筆觸即時畫進畫布貼圖，一支 3D 蠟筆跟著游標移動
 */
export function createCrayonStage(
  scene: Scene,
  camera: ArcRotateCamera,
  anchor: { x: number; z: number },
): CrayonStage {
  let isBuilt = false
  let isActive = false
  let renderObserver: Observer<Scene> | null = null
  let bounceSeconds = -1

  let easelRoot: TransformNode | undefined
  let boardMesh: Mesh | undefined
  let canvasTexture: DynamicTexture | undefined
  let crayonNode: TransformNode | undefined
  let crayonMaterial: StandardMaterial | undefined
  /** 進場縮放演出（0 → 1 easeOutBack） */
  let enterProgress = 0

  let guidePointList: readonly PlanarPoint[] = []
  let lastStrokePoint: PlanarPoint | null = null
  let strokeColor = '#4f9ac2'
  let isStroking = false
  /** 蠟筆目標世界位置（畫布上最後接觸點），null = 收在畫布旁待命 */
  let crayonTargetPoint: Vector3 | null = null

  const focusTarget = { x: anchor.x, y: 1, z: anchor.z, radius: 4.6 }

  function build() {
    if (isBuilt) {
      return
    }
    isBuilt = true

    easelRoot = new TransformNode('stageEaselRoot', scene)

    const woodMaterial = new StandardMaterial('stageEaselWoodMaterial', scene)
    woodMaterial.diffuseColor = Color3.FromHexString('#a97a4d')
    woodMaterial.specularColor = Color3.Black()
    woodMaterial.maxSimultaneousLights = 6

    // 三腳畫架：前二後一，頂端相靠
    const legLength = 1.7
    const legSpecList = [
      { x: -0.5, z: 0.05, tiltZ: 0.24, tiltX: 0 },
      { x: 0.5, z: 0.05, tiltZ: -0.24, tiltX: 0 },
      { x: 0, z: -0.3, tiltZ: 0, tiltX: -0.3 },
    ]
    for (const [legIndex, legSpec] of legSpecList.entries()) {
      const leg = CreateCylinder(`stageEaselLeg${legIndex}`, { diameter: 0.055, height: legLength, tessellation: 6 }, scene)
      leg.position.set(legSpec.x, legLength / 2, legSpec.z)
      leg.rotation.z = legSpec.tiltZ
      leg.rotation.x = legSpec.tiltX
      leg.material = woodMaterial
      leg.isPickable = false
      leg.parent = easelRoot
    }
    // 置筆托盤：在畫布前緣下方
    const tray = CreateCylinder('stageEaselTray', { diameter: 0.06, height: 1.1, tessellation: 6 }, scene)
    tray.rotation.z = Math.PI / 2
    tray.position.set(0, 0.52, 0.2)
    tray.material = woodMaterial
    tray.isPickable = false
    tray.parent = easelRoot

    // 畫布：DynamicTexture 即時作畫
    canvasTexture = new DynamicTexture(
      'stageCanvasTexture',
      { width: CANVAS_VIEW_WIDTH * CANVAS_TEXTURE_SCALE, height: CANVAS_VIEW_HEIGHT * CANVAS_TEXTURE_SCALE },
      scene,
      false,
    )
    const boardMaterial = new StandardMaterial('stageCanvasMaterial', scene)
    boardMaterial.diffuseTexture = canvasTexture
    boardMaterial.specularColor = Color3.Black()
    boardMaterial.emissiveColor = new Color3(0.35, 0.35, 0.35)
    boardMaterial.backFaceCulling = false
    boardMaterial.maxSimultaneousLights = 6
    boardMesh = CreatePlane('stageCanvasBoard', { width: BOARD_WIDTH, height: BOARD_HEIGHT }, scene)
    boardMesh.material = boardMaterial
    // 疊在畫架腳前方（local +z 朝鏡頭），腳架不會擋在畫布前
    boardMesh.position.set(0, 1.06, 0.16)
    // CreatePlane 正面朝 -z：轉 180° 讓畫面朝向鏡頭，並微微後仰靠在畫架上
    boardMesh.rotation.set(-0.08, Math.PI, 0)
    boardMesh.parent = easelRoot

    // 跟著游標的蠟筆：筆身＋筆尖
    crayonNode = new TransformNode('stageCrayonNode', scene)
    crayonMaterial = new StandardMaterial('stageCrayonMaterial', scene)
    crayonMaterial.diffuseColor = Color3.FromHexString(strokeColor)
    crayonMaterial.emissiveColor = Color3.FromHexString(strokeColor).scale(0.25)
    crayonMaterial.specularColor = Color3.Black()
    crayonMaterial.maxSimultaneousLights = 6
    const crayonTip = CreateCylinder('stageCrayonTip', { diameterTop: 0.05, diameterBottom: 0.004, height: 0.07, tessellation: 8 }, scene)
    crayonTip.position.y = 0.035
    crayonTip.material = crayonMaterial
    crayonTip.isPickable = false
    crayonTip.parent = crayonNode
    const crayonBody = CreateCylinder('stageCrayonBody', { diameter: 0.055, height: 0.3, tessellation: 8 }, scene)
    crayonBody.position.y = 0.07 + 0.15
    crayonBody.material = crayonMaterial
    crayonBody.isPickable = false
    crayonBody.parent = crayonNode
    // 筆桿往鏡頭側後仰（local +z 朝鏡頭），像被一隻看不見的手拿著，不會沒入畫布後方
    crayonNode.rotation.x = 0.55
  }

  function getCanvasContext(): CanvasRenderingContext2D | null {
    if (!canvasTexture) {
      return null
    }
    return canvasTexture.getContext() as unknown as CanvasRenderingContext2D
  }

  /** 重畫底圖：紙底色＋虛線小魚輪廓 */
  function paintGuide() {
    const context = getCanvasContext()
    if (!context || !canvasTexture) {
      return
    }
    const scale = CANVAS_TEXTURE_SCALE
    context.setLineDash([])
    context.fillStyle = '#fffef8'
    context.fillRect(0, 0, CANVAS_VIEW_WIDTH * scale, CANVAS_VIEW_HEIGHT * scale)
    if (guidePointList.length > 1) {
      context.beginPath()
      context.moveTo(guidePointList[0]!.x * scale, guidePointList[0]!.y * scale)
      for (const point of guidePointList.slice(1)) {
        context.lineTo(point.x * scale, point.y * scale)
      }
      context.closePath()
      context.setLineDash([9, 8])
      context.lineWidth = 3
      context.strokeStyle = 'rgba(79, 154, 194, 0.6)'
      context.stroke()
      context.setLineDash([])
    }
    canvasTexture.update()
  }

  function update() {
    const deltaSeconds = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000)

    // 進場：畫架 easeOutBack 長出來
    if (easelRoot && enterProgress < 1) {
      enterProgress = Math.min(1, enterProgress + deltaSeconds * 2.2)
      const overshoot = 1.70158
      const offset = enterProgress - 1
      const scale = Math.max(0.001, 1 + (overshoot + 1) * offset ** 3 + overshoot * offset ** 2)
      easelRoot.scaling.setAll(scale)
    }

    // 過關彈跳
    if (bounceSeconds >= 0 && easelRoot) {
      bounceSeconds += deltaSeconds
      const progress = Math.min(1, bounceSeconds / 0.5)
      const bounceScale = 1 + Math.sin(progress * Math.PI) * 0.06
      easelRoot.scaling.setAll(bounceScale)
      if (progress >= 1) {
        bounceSeconds = -1
        easelRoot.scaling.setAll(1)
      }
    }

    // 蠟筆平滑追著目標點；沒有目標時收到畫布右側待命。
    // 畫的時候筆尖貼著畫布，沒畫時微微抬起
    if (crayonNode && easelRoot && boardMesh) {
      const lerp = Math.min(1, deltaSeconds * 16)
      const targetPoint = (crayonTargetPoint
        ?? boardMesh.getAbsolutePosition().add(easelRoot.right.scale(BOARD_WIDTH * 0.62))).clone()
      if (!isStroking) {
        targetPoint.y += 0.08
      }
      crayonNode.position.addInPlace(targetPoint.subtract(crayonNode.position).scale(lerp))
    }
  }

  return {
    focusTarget,
    enter(outlinePointList) {
      build()
      guidePointList = outlinePointList
      isActive = true
      bounceSeconds = -1
      enterProgress = 0
      lastStrokePoint = null
      isStroking = false
      crayonTargetPoint = null

      // 畫架擺在蠟筆組朝鏡頭方向前方，面向鏡頭
      const cameraPosition = camera.globalPosition
      const towardCamera = new Vector3(cameraPosition.x - anchor.x, 0, cameraPosition.z - anchor.z)
      const towardLength = towardCamera.length() || 1
      towardCamera.scaleInPlace(1 / towardLength)
      if (easelRoot) {
        easelRoot.position.set(
          anchor.x + towardCamera.x * 1.5,
          0,
          anchor.z + towardCamera.z * 1.5,
        )
        easelRoot.rotation.y = Math.atan2(towardCamera.x, towardCamera.z)
        easelRoot.scaling.setAll(0.001)
        easelRoot.setEnabled(true)
        focusTarget.x = easelRoot.position.x
        focusTarget.y = 1.05
        focusTarget.z = easelRoot.position.z
      }
      if (boardMesh) {
        boardMesh.isPickable = true
      }
      crayonNode?.setEnabled(true)
      if (crayonNode && easelRoot) {
        crayonNode.position.copyFrom(easelRoot.position).addInPlaceFromFloats(0, 1, 0)
        crayonNode.rotation.y = easelRoot.rotation.y
      }
      paintGuide()
      renderObserver = scene.onBeforeRenderObservable.add(update)
    },
    exit() {
      if (!isActive) {
        return
      }
      isActive = false
      scene.onBeforeRenderObservable.remove(renderObserver)
      renderObserver = null
      easelRoot?.setEnabled(false)
      crayonNode?.setEnabled(false)
      if (boardMesh) {
        boardMesh.isPickable = false
      }
    },
    pickCanvasPoint(canvasX, canvasY) {
      if (!isActive || !boardMesh) {
        return null
      }
      const pickInfo = scene.pick(canvasX, canvasY, (mesh) => mesh === boardMesh)
      if (!pickInfo.hit) {
        return null
      }
      const uv = pickInfo.getTextureCoordinates()
      if (!uv) {
        return null
      }
      // 更新蠟筆跟隨目標：沿畫布法線（朝鏡頭）推出一點，筆尖貼面不陷入
      if (pickInfo.pickedPoint && easelRoot) {
        crayonTargetPoint = pickInfo.pickedPoint.add(easelRoot.forward.scale(0.03))
      }
      return {
        x: uv.x * CANVAS_VIEW_WIDTH,
        y: (1 - uv.y) * CANVAS_VIEW_HEIGHT,
      }
    },
    beginStroke(point, color) {
      strokeColor = color
      lastStrokePoint = point
      isStroking = true
      if (crayonMaterial) {
        crayonMaterial.diffuseColor = Color3.FromHexString(color)
        crayonMaterial.emissiveColor = Color3.FromHexString(color).scale(0.25)
      }
      // 起筆點幾顆疊加的小圓，輕點也有蠟質痕跡
      const context = getCanvasContext()
      if (context && canvasTexture) {
        const scale = CANVAS_TEXTURE_SCALE
        context.fillStyle = color
        for (let pass = 0; pass < 3; pass++) {
          context.beginPath()
          context.arc(
            point.x * scale + (Math.random() - 0.5) * 3,
            point.y * scale + (Math.random() - 0.5) * 3,
            3.5 + Math.random() * 2,
            0,
            Math.PI * 2,
          )
          context.globalAlpha = 0.3 + Math.random() * 0.15
          context.fill()
        }
        context.globalAlpha = 1
        canvasTexture.update()
      }
    },
    strokeTo(point) {
      const context = getCanvasContext()
      if (!context || !canvasTexture || !lastStrokePoint) {
        return
      }
      const scale = CANVAS_TEXTURE_SCALE
      // 蠟筆質感：多道錯位的半透明細線疊出粗糙邊緣與蠟質層次，
      // 而不是單一實心粗線（那看起來像麥克筆）
      context.lineCap = 'round'
      context.strokeStyle = strokeColor
      for (let pass = 0; pass < 3; pass++) {
        const offsetX = (Math.random() - 0.5) * 3.2
        const offsetY = (Math.random() - 0.5) * 3.2
        context.beginPath()
        context.moveTo(lastStrokePoint.x * scale + offsetX, lastStrokePoint.y * scale + offsetY)
        context.lineTo(point.x * scale + offsetX, point.y * scale + offsetY)
        context.lineWidth = 4.5 + Math.random() * 3
        context.globalAlpha = 0.28 + Math.random() * 0.16
        context.stroke()
      }
      // 偶爾灑一點蠟屑顆粒
      if (Math.random() < 0.5) {
        context.beginPath()
        context.arc(
          point.x * scale + (Math.random() - 0.5) * 8,
          point.y * scale + (Math.random() - 0.5) * 8,
          1 + Math.random() * 1.2,
          0,
          Math.PI * 2,
        )
        context.fillStyle = strokeColor
        context.globalAlpha = 0.25
        context.fill()
      }
      context.globalAlpha = 1
      canvasTexture.update()
      lastStrokePoint = point
    },
    endStroke() {
      isStroking = false
      lastStrokePoint = null
    },
    clearCanvas() {
      paintGuide()
    },
    finishArtwork(fillColor) {
      const context = getCanvasContext()
      if (!context || !canvasTexture || guidePointList.length < 2) {
        return
      }
      const scale = CANVAS_TEXTURE_SCALE
      context.beginPath()
      context.moveTo(guidePointList[0]!.x * scale, guidePointList[0]!.y * scale)
      for (const point of guidePointList.slice(1)) {
        context.lineTo(point.x * scale, point.y * scale)
      }
      context.closePath()
      context.fillStyle = fillColor
      context.globalAlpha = 0.55
      context.fill()
      context.globalAlpha = 1
      // 點睛
      context.beginPath()
      context.arc(252 * scale, 98 * scale, 6 * scale, 0, Math.PI * 2)
      context.fillStyle = '#2f3d45'
      context.fill()
      canvasTexture.update()
      bounceSeconds = 0
      crayonTargetPoint = null
      isStroking = false
    },
    setCrayonColor(color) {
      strokeColor = color
      if (crayonMaterial) {
        crayonMaterial.diffuseColor = Color3.FromHexString(color)
        crayonMaterial.emissiveColor = Color3.FromHexString(color).scale(0.25)
      }
    },
  }
}
