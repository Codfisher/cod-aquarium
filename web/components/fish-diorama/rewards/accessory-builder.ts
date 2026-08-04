/** 配件的程序化建模：高分里程碑解鎖後掛在鱈魚身上的裝扮。
 *
 * 全部掛在 cod-model 的 lieNode 底下，跟著身體的擺動、呼吸與跳躍一起動。
 * lieNode 的局部座標：+Z 是頭的方向、+Y 是（側躺後的）頭頂方向。
 * 尺度以既有皇冠（環直徑 0.34）為基準。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import type { AccessorySlot, RewardId } from './reward-registry'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder'
import { TransformNode as TransformNodeClass } from '@babylonjs/core/Meshes/transformNode'
import { clampRatio, easeOutCubic, sampleOrganicSway } from '../shared/easing'
import { applyVertexJitter, createSeedFrom } from '../shared/mesh-detail'
import { createRandomGenerator } from '../shared/random-generator'
import { rewardDefinitionMap } from './reward-registry'

/** 各掛載部位在 lieNode 局部座標的位置與預設傾角 */
const slotAnchorMap: Record<AccessorySlot, { position: [number, number, number]; rotationX: number }> = {
  head: { position: [0, 0.3, 0.62], rotationX: -0.12 },
  // 兩眼中心約在 (±0.28, 0.16, 0.82)，眼球本身向 +z 凸出到 ~1.0。
  // 錨點要落在眼球前緣之外，鏡片才不會被整顆眼白蓋住
  face: { position: [0, 0.16, 1.05], rotationX: 0 },
  neck: { position: [0, 0.06, 0.34], rotationX: 0 },
  body: { position: [0, 0.26, 0.02], rotationX: 0 },
  // 左胸鰭關節的靜止位置。閃光氣球會直接改掛到該關節底下，
  // 這組座標只在找不到關節時當退路
  fin: { position: [-0.3, -0.05, 0.42], rotationX: 0 },
  tail: { position: [0, 0, -0.92], rotationX: 0 },
}

export interface AccessoryHandle {
  rewardId: RewardId;
  node: TransformNode;
  /** 每幀動態（流蘇甩動、圍巾飄動、尾跡閃色）。無動態的配件不提供 */
  update?: (deltaSeconds: number, isMoving: boolean) => void;
  dispose: () => void;
}

/** 建材質的捷徑：紙不反光，specular 一律黑 */
function createPaperMaterial(scene: Scene, name: string, hex: string, emissiveScale = 0): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  const color = Color3.FromHexString(hex)
  material.diffuseColor = color
  material.specularColor = new Color3(0, 0, 0)
  if (emissiveScale > 0) {
    material.emissiveColor = color.scale(emissiveScale)
  }
  return material
}

/** 建立配件的共用外殼：掛到部位錨點、關閉 pick、統一 flat shading */
function createAccessoryRoot(scene: Scene, parentNode: TransformNode, rewardId: RewardId): TransformNode {
  const slot = rewardDefinitionMap[rewardId].slot
  const anchor = slotAnchorMap[slot]
  const node = new TransformNodeClass(`codAccessory_${rewardId}`, scene)
  node.parent = parentNode
  node.position.set(...anchor.position)
  node.rotation.x = anchor.rotationX
  return node
}

interface PartJitterOptions {
  seed: number;
  amount: number;
  /** 薄件（鏡片、凹槽）把對應軸調小，抖動才不會讓接縫穿幫 */
  axisScale?: { x?: number; y?: number; z?: number };
}

/** 把子網格接上根節點並套用共通設定。
 * 抖動必須在 flat shading 之後做，每個面才會各自吃到不同角度的光
 */
function attachPart(
  part: ReturnType<typeof CreateBox>,
  root: TransformNode,
  material: StandardMaterial,
  jitter?: PartJitterOptions,
): void {
  part.material = material
  part.isPickable = false
  part.parent = root
  part.convertToFlatShadedMesh()
  if (jitter) {
    applyVertexJitter(part, jitter)
  }
}

/** 少數配件（例如彩虹尾跡的痕跡）會另外掛獨立於 root 的節點，
 * 通用的 dispose 只收得到 root 底下的東西，這裡補上額外清理
 */
type AccessoryBehavior = Omit<AccessoryHandle, 'rewardId' | 'node' | 'dispose'> & {
  disposeExtra?: () => void;
}

/** 水流擾動取樣：兩個不成倍數的正弦疊加，週期長到不會被看出是循環 */
function sampleWander(time: number, seed: number): number {
  return Math.sin(time * 0.9 + seed) * 0.6 + Math.sin(time * 1.7 + seed * 2.3) * 0.4
}

type AccessoryFactory = (scene: Scene, root: TransformNode) => AccessoryBehavior

const accessoryFactoryMap: Record<RewardId, AccessoryFactory> = {
  crayonHat(scene, root) {
    const bodyMaterial = createPaperMaterial(scene, 'crayonHatBody', '#c96f5a')
    const tipMaterial = createPaperMaterial(scene, 'crayonHatTip', '#f5efe2')
    // 削尖的蠟筆倒插在頭上：筆桿是六角柱，露出的筆芯是圓錐
    const barrel = CreateCylinder('crayonHatBarrel', { diameter: 0.26, height: 0.34, tessellation: 6 }, scene)
    barrel.position.y = 0.17
    // y 向收斂：筆桿與筆芯的接縫在 y 向，抖太多會裂開露光
    attachPart(barrel, root, bodyMaterial, { seed: createSeedFrom(0), amount: 0.016, axisScale: { y: 0.3 } })
    const tip = CreateCylinder(
      'crayonHatTip',
      { diameterTop: 0.02, diameterBottom: 0.24, height: 0.16, tessellation: 6 },
      scene,
    )
    // 筆芯底部沉入筆桿一點，抖動後接縫才不會透出縫隙
    tip.position.y = 0.41
    attachPart(tip, root, tipMaterial, { seed: createSeedFrom(0, 1), amount: 0.012, axisScale: { y: 0.3 } })
    return {}
  },

  divingMask(scene, root) {
    const frameMaterial = createPaperMaterial(scene, 'divingMaskFrame', '#c96f5a')
    const glassMaterial = createPaperMaterial(scene, 'divingMaskGlass', '#8fb8c9', 0.35)
    glassMaterial.alpha = 0.75
    // 雙圓鏡片分別對齊左右眼（眼距約 0.28×2），中間用鼻樑橋接，
    // 才會是「罩住雙眼的蛙鏡」而非卡在兩眼間、誰也罩不到的方塊
    const lensEyeOffsetList: [number, number][] = [[1, 0.16], [-1, 0.157]]
    for (const [side, eyeY] of lensEyeOffsetList) {
      const lensX = side * 0.28
      const lensY = eyeY - 0.16
      const lensFrame = CreateTorus(
        `divingMaskLensFrame${side > 0 ? 'Right' : 'Left'}`,
        { diameter: 0.34, thickness: 0.05, tessellation: 12 },
        scene,
      )
      lensFrame.rotation.x = Math.PI / 2
      lensFrame.position.set(lensX, lensY, 0)
      attachPart(lensFrame, root, frameMaterial, {
        seed: createSeedFrom(1, side),
        amount: 0.008,
        axisScale: { z: 0.5 },
      })
      const lensGlass = CreateCylinder(
        `divingMaskLensGlass${side > 0 ? 'Right' : 'Left'}`,
        { diameter: 0.29, height: 0.04, tessellation: 12 },
        scene,
      )
      lensGlass.rotation.x = Math.PI / 2
      // 鏡片沉入框一點，探頭視角才看得到鏡框的厚度
      lensGlass.position.set(lensX, lensY, -0.01)
      attachPart(lensGlass, root, glassMaterial, {
        seed: createSeedFrom(1, side, 1),
        amount: 0.006,
        axisScale: { z: 0.3 },
      })
    }
    // 鼻樑橋接兩片鏡框，缺了這條兩個鏡片會像分開飄浮的兩個圈
    const bridge = CreateBox('divingMaskBridge', { width: 0.24, height: 0.05, depth: 0.05 }, scene)
    attachPart(bridge, root, frameMaterial, { seed: createSeedFrom(1, 2), amount: 0.007 })
    // 頭帶繞到腦後，沒有它會像貼在臉上的貼紙。半徑放大配合新鏡框，才圈得住頭圍
    const strap = CreateTorus('divingMaskStrap', { diameter: 0.66, thickness: 0.04, tessellation: 12 }, scene)
    strap.rotation.x = Math.PI / 2
    strap.position.z = -0.5
    attachPart(strap, root, frameMaterial, { seed: createSeedFrom(1, 3), amount: 0.006 })
    return {}
  },

  waterFlask(scene, root) {
    // 荒謬點：整隻魚泡在水裡，還隨身背著一壺水
    const strapMaterial = createPaperMaterial(scene, 'waterFlaskStrap', '#c96f5a')
    const flaskMaterial = createPaperMaterial(scene, 'waterFlaskBody', '#8fa6b5')
    const trimMaterial = createPaperMaterial(scene, 'waterFlaskTrim', '#5c6470')
    const dropMaterial = createPaperMaterial(scene, 'waterFlaskDrop', '#8fb8c9', 0.3)
    dropMaterial.alpha = 0.8

    // 頸掛點在魚身中軸上方 0.06。該處身體斷面約 x 半徑 0.33、y 半徑 0.44
    // （球體 taper 0.824、側扁 0.72，再加頂點抖動 0.04 算出來的），
    // 背帶得比這圈大才不會整條埋進魚身裡
    const strapNode = new TransformNodeClass('waterFlaskStrapNode', scene)
    strapNode.parent = root
    strapNode.position.set(0, -0.06, 0)

    const strap = CreateTorus('waterFlaskStrap', { diameter: 0.96, thickness: 0.03, tessellation: 16 }, scene)
    strap.rotation.x = Math.PI / 2
    // 身體側扁，背帶跟著收窄才貼得住，不會在兩側浮出一大圈
    strap.scaling.x = 0.77
    attachPart(strap, strapNode, strapMaterial, { seed: createSeedFrom(2), amount: 0.008 })

    // 魚側躺：局部 -X 朝天、+Y 是背側（朝鏡頭）。水壺卡在「上方偏背側」那一角，
    // 既落在身體輪廓外不會穿模，滴下來的水也不會直接穿過魚身
    // 壺放大後也得往外挪：該方向的身體表面在離中軸 0.40 處，
    // 壺的最大外徑（含橫紋）0.16，中心擺在 0.65 才留得住餘裕
    const flaskRestPosition = new Vector3(-0.33, 0.5, 0)
    const flaskNode = new TransformNodeClass('waterFlaskNode', scene)
    flaskNode.parent = root
    flaskNode.position.copyFrom(flaskRestPosition)

    // 壺身長軸沿魚身前後躺著
    const flaskBody = CreateCylinder('waterFlaskBody', { diameter: 0.28, height: 0.35, tessellation: 12 }, scene)
    flaskBody.rotation.x = Math.PI / 2
    attachPart(flaskBody, flaskNode, flaskMaterial, { seed: createSeedFrom(2, 1), amount: 0.008 })

    // 兩圈橫紋：少了這個，壺身只是一截素圓柱
    for (let ridgeIndex = 0; ridgeIndex < 2; ridgeIndex++) {
      const ridge = CreateTorus('waterFlaskRidge', { diameter: 0.297, thickness: 0.024, tessellation: 12 }, scene)
      ridge.rotation.x = Math.PI / 2
      ridge.position.z = -0.068 + ridgeIndex * 0.136
      attachPart(ridge, flaskNode, trimMaterial, { seed: createSeedFrom(2, 2 + ridgeIndex), amount: 0.004 })
    }

    const cap = CreateCylinder('waterFlaskCap', { diameter: 0.12, height: 0.08, tessellation: 10 }, scene)
    cap.rotation.x = Math.PI / 2
    cap.position.z = 0.215
    attachPart(cap, flaskNode, trimMaterial, { seed: createSeedFrom(2, 4), amount: 0.004, axisScale: { z: 0.3 } })

    // 滴水口就在壺蓋外緣的正中央（蓋子中心 z=0.215、半高 0.04），
    // 稍微偏 +x（即世界的下方），水才像是沿著壺口下緣墜下來。
    // 壺整個坐在離中軸 0.56 處、已超出身體斷面的 0.44，水滴自然落在魚身輪廓外
    const dropOriginNode = new TransformNodeClass('waterFlaskDropOrigin', scene)
    dropOriginNode.parent = flaskNode
    dropOriginNode.position.set(0.02, 0, 0.26)

    // 水滴要留在原地往下掉，不能跟著魚跑，另開一個掛在場景根的容器收放
    const dropContainerNode = new TransformNodeClass('waterFlaskDropContainer', scene)

    interface WaterDrop {
      node: TransformNode;
      mesh: Mesh;
      velocity: Vector3;
      age: number;
    }
    const dropList: WaterDrop[] = []
    const DROP_LIFETIME = 1.3
    /** 一秒約三滴：再密就成了水柱，讀不出「慢慢在漏」 */
    const DROP_INTERVAL = 0.35
    const DROP_GRAVITY = -3.2
    let dropTimer = 0
    let dropSpawnIndex = 0

    function spawnDrop() {
      dropOriginNode.computeWorldMatrix(true)
      const dropNode = new TransformNodeClass('waterFlaskDropNode', scene)
      dropNode.parent = dropContainerNode
      dropNode.position.copyFrom(dropOriginNode.getAbsolutePosition())
      const dropRandom = createRandomGenerator(createSeedFrom(2, 20 + dropSpawnIndex))
      const drop = CreateSphere('waterFlaskDrop', { diameter: 0.06 + dropRandom() * 0.035, segments: 6 }, scene)
      drop.material = dropMaterial
      drop.isPickable = false
      drop.parent = dropNode
      drop.convertToFlatShadedMesh()
      dropSpawnIndex += 1
      dropList.push({
        node: dropNode,
        mesh: drop,
        velocity: new Vector3((dropRandom() - 0.5) * 0.22, -0.15, (dropRandom() - 0.5) * 0.22),
        age: 0,
      })
    }

    // 水壺跟著魚身上下彈：把它當成掛在掛點上的懸掛質點，
    // 跳起來時掛點驟然抬升，水壺慢半拍才跟上、落地再回穩
    const FLASK_STIFFNESS = 120
    const FLASK_DAMPING = 9
    const FLASK_MAX_OFFSET = 0.1
    const anchorWorldPosition = new Vector3()
    const localUpDirection = new Vector3()
    const inverseRootMatrix = new Matrix()
    let flaskWorldHeight = 0
    let flaskHeightVelocity = 0
    let flaskReady = false

    return {
      update(deltaSeconds) {
        root.computeWorldMatrix(true)
        const rootMatrix = root.getWorldMatrix()
        Vector3.TransformCoordinatesToRef(flaskRestPosition, rootMatrix, anchorWorldPosition)
        if (!flaskReady) {
          flaskWorldHeight = anchorWorldPosition.y
          flaskReady = true
        }

        // 只追世界垂直這一軸就夠：水壺是卡著的，不會整個盪開
        const stepSeconds = Math.min(deltaSeconds, 1 / 30)
        const heightAcceleration = FLASK_STIFFNESS * (anchorWorldPosition.y - flaskWorldHeight)
          - FLASK_DAMPING * flaskHeightVelocity
        flaskHeightVelocity += heightAcceleration * stepSeconds
        flaskWorldHeight += flaskHeightVelocity * stepSeconds

        // 世界上方在局部座標的指向；其長度同時是世界→局部的長度換算比
        rootMatrix.invertToRef(inverseRootMatrix)
        Vector3.TransformNormalFromFloatsToRef(0, 1, 0, inverseRootMatrix, localUpDirection)
        const worldToLocalScale = localUpDirection.length()
        if (worldToLocalScale > 1e-5) {
          localUpDirection.scaleInPlace(1 / worldToLocalScale)
          const localOffset = Math.max(
            -FLASK_MAX_OFFSET,
            Math.min(FLASK_MAX_OFFSET, (flaskWorldHeight - anchorWorldPosition.y) * worldToLocalScale),
          )
          flaskNode.position.copyFrom(flaskRestPosition)
          localUpDirection.scaleAndAddToRef(localOffset, flaskNode.position)
        }

        // 蓋子沒關緊，不管魚在做什麼都一直滴
        dropTimer += deltaSeconds
        if (dropTimer >= DROP_INTERVAL) {
          dropTimer = 0
          spawnDrop()
        }

        for (let index = dropList.length - 1; index >= 0; index--) {
          const drop = dropList[index]!
          drop.age += deltaSeconds
          drop.velocity.y += DROP_GRAVITY * deltaSeconds
          drop.velocity.scaleAndAddToRef(deltaSeconds, drop.node.position)
          drop.mesh.visibility = 1 - easeOutCubic(clampRatio(drop.age / DROP_LIFETIME))
          if (drop.age >= DROP_LIFETIME) {
            drop.mesh.dispose()
            drop.node.dispose()
            dropList.splice(index, 1)
          }
        }
      },
      disposeExtra() {
        for (const drop of dropList) {
          drop.mesh.dispose()
          drop.node.dispose()
        }
        dropList.length = 0
        dropMaterial.dispose()
        dropContainerNode.dispose()
      },
    }
  },

  flashBalloon(scene, root) {
    // 荒謬點：閃光燈泡本該鎖在相機頂上，卻被拆下來綁在左胸鰭上當氣球拖著跑
    const glassMaterial = createPaperMaterial(scene, 'flashBalloonGlass', '#f2d9a0', 0.32)
    glassMaterial.alpha = 0.82
    const metalMaterial = createPaperMaterial(scene, 'flashBalloonMetal', '#5c6470')
    const cordMaterial = createPaperMaterial(scene, 'flashBalloonCord', '#c96f5a')
    const random = createRandomGenerator(createSeedFrom(4))

    // 綁在左胸鰭上。直接掛進該鰭自己的 pivot，繩結與鰭面永遠共用同一組座標，
    // 鰭怎麼划、身體怎麼擺，兩者的相對位置都不變，不會鬆脫也不會穿幫
    const finPivot = root.parent?.getChildTransformNodes(
      true,
      (node) => node.name === 'codPectoralPivotLeft',
    )[0]
    if (finPivot) {
      root.parent = finPivot
      root.position.setAll(0)
      root.rotation.setAll(0)
    }
    else {
      // 找不到鰭就用 fin 錨點的位置，再補上鰭的靜止傾角，只是不會跟著划水
      root.rotation.z = 0.18
    }

    // 繩結包住鰭的外角（鰭面頂點 P1），沿內側角平分線往鰭內縮 0.035。
    // 鰭是零厚度的三角扇，直接套個圓環必然穿透（環要夠大才圈得住整片鰭，
    // 那尺寸已跟整片鰭一樣寬）；改成讓結「吞掉」最外側的角，鰭尖收在結裡面，
    // 結外側就不會有任何鰭面戳出來。半徑 0.07、內縮 0.035 是實算過的最小安全解
    const knotCentre = new Vector3(-0.3162, 0.0966, -0.1305)
    const knot = CreateSphere('flashBalloonKnot', { diameter: 0.14, segments: 8 }, scene)
    knot.position.copyFrom(knotCentre)
    attachPart(knot, root, cordMaterial, { seed: createSeedFrom(4, 8), amount: 0.006 })

    // 繩子與燈泡整串掛在結上。方向每幀由世界上方換算，
    // 不靠固定的補正角——魚側躺、胸鰭又大幅划動，寫死的角度撐不住
    const balloonNode = new TransformNodeClass('flashBalloonNode', scene)
    balloonNode.parent = root
    balloonNode.position.copyFrom(knotCentre)
    balloonNode.rotationQuaternion = Quaternion.Identity()

    const cordLength = 0.56
    const cord = CreateCylinder('flashBalloonCord', { diameter: 0.02, height: cordLength, tessellation: 6 }, scene)
    cord.position.y = cordLength / 2
    attachPart(cord, balloonNode, cordMaterial, { seed: createSeedFrom(4, 1), amount: 0.006, axisScale: { y: 0.3 } })

    // 浮力節點坐在繩端，位置每幀由模擬出來的繩長決定
    const buoyNode = new TransformNodeClass('flashBalloonBuoyNode', scene)
    buoyNode.parent = balloonNode
    buoyNode.position.y = cordLength

    // 由下往上疊出燈泡輪廓：接點 → 螺紋座 → 收窄的頸 → 鼓起的玻璃球
    const contact = CreateCylinder('flashBalloonContact', { diameter: 0.05, height: 0.03, tessellation: 8 }, scene)
    contact.position.y = 0.015
    attachPart(contact, buoyNode, metalMaterial, { seed: createSeedFrom(4, 2), amount: 0.004, axisScale: { y: 0.3 } })

    const screwBase = CreateCylinder(
      'flashBalloonScrewBase',
      { diameterTop: 0.13, diameterBottom: 0.09, height: 0.1, tessellation: 10 },
      scene,
    )
    screwBase.position.y = 0.08
    attachPart(screwBase, buoyNode, metalMaterial, { seed: createSeedFrom(4, 3), amount: 0.006, axisScale: { y: 0.3 } })

    // 兩圈螺紋：少了這個，底座只是一截錐體，讀不出「可以旋進燈座」
    for (let threadIndex = 0; threadIndex < 2; threadIndex++) {
      const thread = CreateTorus(
        `flashBalloonThread${threadIndex}`,
        { diameter: 0.125, thickness: 0.016, tessellation: 10 },
        scene,
      )
      thread.rotation.x = Math.PI / 2
      thread.position.y = 0.06 + threadIndex * 0.04
      attachPart(thread, buoyNode, metalMaterial, { seed: createSeedFrom(4, 4 + threadIndex), amount: 0.004 })
    }

    // 頸部由底座往上外擴，接上玻璃球才是燈泡的腰身，直接球接柱會像插著的棒棒糖
    const neck = CreateCylinder(
      'flashBalloonNeck',
      { diameterTop: 0.22, diameterBottom: 0.13, height: 0.08, tessellation: 12 },
      scene,
    )
    neck.position.y = 0.17
    attachPart(neck, buoyNode, glassMaterial, { seed: createSeedFrom(4, 6), amount: 0.006, axisScale: { y: 0.3 } })

    const bulb = CreateSphere('flashBalloonBulb', { diameter: 0.36, segments: 12 }, scene)
    bulb.position.y = 0.37
    // 縱向稍微拉長：正球讀起來像顆球，微微的水滴感才是燈泡
    bulb.scaling.y = 1.1
    attachPart(bulb, buoyNode, glassMaterial, { seed: createSeedFrom(4, 7), amount: 0.01 })

    // --- 物理模擬 ---
    // 氣球視為質點，繩子是只能拉不能推的彈簧，外加淨浮力與水阻尼。
    // 晃動不寫死：驅動力全來自繫繩點自身的運動——胸鰭大幅划水時，
    // 氣球因慣性落後、衝過頭、再回盪，這些都是積分出來的
    /** 繩子自然長度與可伸縮範圍（鰭局部單位）。
     * 繩子刻意留長：繫繩點在鰭尖，胸鰭以 15 rad/s 擺 0.63 rad，
     * 該點的加速度上看 37 單位/秒²，遠大於浮力。繩子短的話同樣的位移會撐出極大夾角，
     * 一路頂到下方的傾角上限；拉長之後同樣的晃動只換算成溫和的角度
     */
    const CORD_REST_LENGTH = 0.56
    const CORD_MIN_LENGTH = 0.46
    const CORD_MAX_LENGTH = 0.78
    /** 淨浮力（已扣掉重力），同時決定擺盪回正的快慢 */
    const BUOYANCY = 5
    /** 繩子勁度與其阻尼，決定上下浮沉的節奏。
     * 固有頻率 √90 ≈ 9.5 rad/s，刻意避開胸鰭 15 rad/s 的拍動，免得共振
     */
    const CORD_STIFFNESS = 90
    const CORD_DAMPING = 4
    /** 水阻尼，壓住橫向擺盪不致亂甩 */
    const WATER_DRAG = 1.5
    /** 水流擾動強度：魚完全靜止時，氣球仍該被水流推得緩緩飄移 */
    const TURBULENCE = 1
    /** 關節限制：偏離世界上方的最大角度。
     * 0.58 rad 是實算出來的上限，再大就會把繩子或燈泡甩進鰭面
     */
    const MAX_TILT = 0.58
    /** 固定步長積分：畫面幀率再怎麼跳，彈簧都不會炸開 */
    const PHYSICS_STEP = 1 / 120
    const MAX_STEP_PER_FRAME = 8

    const worldUp = new Vector3(0, 1, 0)
    const anchorWorldPosition = new Vector3()
    const balloonWorldPosition = new Vector3()
    const balloonVelocity = new Vector3()
    const cordWorldVector = new Vector3()
    const cordDirection = new Vector3()
    const accelerationVector = new Vector3()
    const outwardDirection = new Vector3()
    const scratchVector = new Vector3()
    const targetLocal = new Vector3()
    const inverseRootMatrix = new Matrix()
    const pulseColor = glassMaterial.emissiveColor.clone()
    glassMaterial.emissiveColor = pulseColor

    // 魚整體有縮放，物理跑在世界座標，長度與加速度都得換算成世界單位，
    // 模擬結果換回局部座標時才會剛好等於上面那組長度常數
    let worldScale = 1
    let physicsReady = false
    let stepAccumulator = 0
    let turbulenceTime = random() * 10

    /** 把繩長與傾角夾回允許範圍，並抵銷掉違規方向的速度 */
    function applyCordConstraint() {
      balloonWorldPosition.subtractToRef(anchorWorldPosition, cordWorldVector)
      let distance = cordWorldVector.length()
      if (distance < 1e-5) {
        cordDirection.copyFrom(worldUp)
        distance = CORD_REST_LENGTH * worldScale
      }
      else {
        cordWorldVector.scaleToRef(1 / distance, cordDirection)
      }

      const cosTilt = Math.min(1, Math.max(-1, Vector3.Dot(cordDirection, worldUp)))
      if (Math.acos(cosTilt) > MAX_TILT) {
        // 取出水平外傾的分量，重建成剛好落在上限角上的方向
        worldUp.scaleToRef(cosTilt, outwardDirection)
        cordDirection.subtractToRef(outwardDirection, outwardDirection)
        if (outwardDirection.lengthSquared() > 1e-8) {
          outwardDirection.normalize()
          worldUp.scaleToRef(Math.cos(MAX_TILT), cordDirection)
          outwardDirection.scaleAndAddToRef(Math.sin(MAX_TILT), cordDirection)
          const outwardSpeed = Vector3.Dot(balloonVelocity, outwardDirection)
          if (outwardSpeed > 0) {
            outwardDirection.scaleAndAddToRef(-outwardSpeed, balloonVelocity)
          }
        }
      }

      const minLength = CORD_MIN_LENGTH * worldScale
      const maxLength = CORD_MAX_LENGTH * worldScale
      const clampedDistance = Math.min(maxLength, Math.max(minLength, distance))
      if (clampedDistance !== distance) {
        const radialSpeed = Vector3.Dot(balloonVelocity, cordDirection)
        cordDirection.scaleAndAddToRef(-radialSpeed, balloonVelocity)
      }
      cordDirection.scaleToRef(clampedDistance, scratchVector)
      anchorWorldPosition.addToRef(scratchVector, balloonWorldPosition)
    }

    function stepPhysics(stepSeconds: number) {
      balloonWorldPosition.subtractToRef(anchorWorldPosition, cordWorldVector)
      const distance = cordWorldVector.length()
      accelerationVector.set(0, BUOYANCY * worldScale, 0)
      if (distance > 1e-5) {
        cordWorldVector.scaleToRef(1 / distance, cordDirection)
        // 繩子只拉不推：短於自然長度時完全鬆弛，不產生任何力
        const stretch = distance - CORD_REST_LENGTH * worldScale
        if (stretch > 0) {
          const radialSpeed = Vector3.Dot(balloonVelocity, cordDirection)
          const pullMagnitude = -CORD_STIFFNESS * stretch - CORD_DAMPING * radialSpeed
          cordDirection.scaleAndAddToRef(pullMagnitude, accelerationVector)
        }
      }
      // 水流擾動：靜止時的晃動全靠它，否則氣球會慢慢收斂成一根定住的棒子
      turbulenceTime += stepSeconds
      const turbulenceScale = TURBULENCE * worldScale
      accelerationVector.x += sampleWander(turbulenceTime, 1.3) * turbulenceScale
      accelerationVector.y += sampleWander(turbulenceTime, 4.7) * 0.5 * turbulenceScale
      accelerationVector.z += sampleWander(turbulenceTime, 8.1) * turbulenceScale

      balloonVelocity.scaleAndAddToRef(-WATER_DRAG, accelerationVector)
      accelerationVector.scaleAndAddToRef(stepSeconds, balloonVelocity)
      balloonVelocity.scaleAndAddToRef(stepSeconds, balloonWorldPosition)
      applyCordConstraint()
    }

    const baseEmissive = pulseColor.clone()
    let breathePhase = 0
    let flashProgress = 0
    let flashCooldown = 1.5 + random() * 2

    return {
      update(deltaSeconds, isMoving) {
        root.computeWorldMatrix(true)
        const rootMatrix = root.getWorldMatrix()
        Vector3.TransformCoordinatesToRef(knotCentre, rootMatrix, anchorWorldPosition)
        Vector3.TransformNormalFromFloatsToRef(0, 1, 0, rootMatrix, scratchVector)
        worldScale = Math.max(1e-4, scratchVector.length())

        if (!physicsReady) {
          worldUp.scaleToRef(CORD_REST_LENGTH * worldScale, balloonWorldPosition)
          balloonWorldPosition.addInPlace(anchorWorldPosition)
          balloonVelocity.setAll(0)
          physicsReady = true
        }

        // 掉幀時最多補 MAX_STEP_PER_FRAME 步，卡頓後不會一次爆衝
        stepAccumulator = Math.min(stepAccumulator + deltaSeconds, PHYSICS_STEP * MAX_STEP_PER_FRAME)
        while (stepAccumulator >= PHYSICS_STEP) {
          stepPhysics(PHYSICS_STEP)
          stepAccumulator -= PHYSICS_STEP
        }

        // 模擬結果換算回鰭的局部座標。長度取局部向量的長度，
        // 直接拿世界長度會被魚的整體縮放放大或縮小
        balloonWorldPosition.subtractToRef(anchorWorldPosition, cordWorldVector)
        rootMatrix.invertToRef(inverseRootMatrix)
        Vector3.TransformNormalToRef(cordWorldVector, inverseRootMatrix, targetLocal)
        const localLength = Math.max(1e-4, targetLocal.length())
        targetLocal.scaleInPlace(1 / localLength)
        Quaternion.FromUnitVectorsToRef(worldUp, targetLocal, balloonNode.rotationQuaternion!)

        // 繩長隨模擬伸縮，燈泡跟著上下浮沉
        buoyNode.position.y = localLength
        cord.scaling.y = localLength / cordLength
        cord.position.y = localLength / 2

        // 燈泡呼吸微亮，偶爾亮爆一下，像正在充電待命
        breathePhase += deltaSeconds * (isMoving ? 2.2 : 1.1)
        let pulseFactor = 0.75 + Math.sin(breathePhase) * 0.15
        if (flashProgress > 0) {
          flashProgress = Math.max(0, flashProgress - deltaSeconds * 2.4)
          pulseFactor += flashProgress * 2.6
        }
        else {
          flashCooldown -= deltaSeconds
          if (flashCooldown <= 0) {
            flashProgress = 1
            flashCooldown = 2.5 + random() * 2.5
          }
        }
        baseEmissive.scaleToRef(pulseFactor, pulseColor)
      },
    }
  },

  swimFin(scene, root) {
    // 改成整圈套住魚身的游泳圈：荒謬點在於「不會游泳硬要玩溯溪」，
    // 且體積夠大天生就露在身體輪廓外，不會再被身體擋住看不見
    const redBandMaterial = createPaperMaterial(scene, 'swimRingRed', '#c9503f')
    const whiteBandMaterial = createPaperMaterial(scene, 'swimRingWhite', '#f5efe2')

    const ringNode = new TransformNodeClass('swimRingNode', scene)
    ringNode.parent = root
    // body 掛點本身往背側偏 0.26，泳圈要整圈套住魚身，
    // 得自己扳回貼近身體中軸的高度
    ringNode.position.set(0, -0.26, 0)

    const bandCount = 8
    const pointsPerBand = 10
    const totalPointCount = bandCount * pointsPerBand + 1
    const ringRadius = 0.48
    // 加粗但保持等粗、正圓——粗管本身已經夠有份量，不需要再鼓一塊癟一塊
    const tubeRadius = 0.15
    // 高面數截面（24 邊）＋保留平滑法線，才有充氣胎光滑飽滿的塑膠感，
    // 而不是配件慣用的低多邊平面折角
    const tubeTessellation = 24

    // 圓形路徑就落在 XY 平面（z 固定），泳圈的孔洞自然沿 Z 軸——
    // 魚身沿 Z 軸貫穿而過，不必額外旋轉節點
    function computeRingPoint(t: number): Vector3 {
      const angle = t * Math.PI * 2
      return new Vector3(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0)
    }

    for (let bandIndex = 0; bandIndex < bandCount; bandIndex++) {
      const startIndex = bandIndex * pointsPerBand
      const pathPointList: Vector3[] = []
      for (let pointIndex = 0; pointIndex <= pointsPerBand; pointIndex++) {
        pathPointList.push(computeRingPoint((startIndex + pointIndex) / (totalPointCount - 1)))
      }
      const band = CreateTube(`swimRingBand${bandIndex}`, {
        path: pathPointList,
        radius: tubeRadius,
        tessellation: tubeTessellation,
      }, scene)
      band.material = bandIndex % 2 === 0 ? redBandMaterial : whiteBandMaterial
      band.isPickable = false
      band.parent = ringNode
      // 不做 flat shading：保留 CreateTube 原生的平滑法線，
      // 高面數＋平滑法線兩者疊加才會讀成「充氣光滑」而非「多邊近似圓」
      band.createNormals(true)
    }

    let bobPhase = 0
    return {
      update(deltaSeconds, isMoving) {
        bobPhase += deltaSeconds * (isMoving ? 3 : 1.2)
        // 漂浮感：泳圈不會死板貼著身體，隨移動輕輕晃、靜止時仍有一點餘韻
        ringNode.rotation.z = sampleOrganicSway(bobPhase) * (isMoving ? 0.05 : 0.03)
        ringNode.rotation.x = sampleOrganicSway(bobPhase * 0.8, 1.7) * 0.04
      },
    }
  },

  rainbowTrail(scene, root) {
    // 尾跡要「獨立留在原地」，不能掛在跟著魚游動的 root 底下——
    // 另開一個掛在場景根的容器收放痕跡，只借 root 當下的世界座標當落點，
    // 生出來之後就跟魚沒有父子關係，魚游走了痕跡留在原地慢慢褪色
    const colorHexList = ['#c96f5a', '#e8b54a', '#7d9b76', '#8fb8c9', '#3d4f66']
    const colorMaterialList = colorHexList.map((hex, index) => {
      const material = createPaperMaterial(scene, `rainbowTrailMarkColor${index}`, hex, 0.4)
      material.alpha = 0.82
      return material
    })

    const trailContainerNode = new TransformNodeClass('rainbowTrailContainer', scene)

    interface TrailMark {
      node: TransformNode;
      mesh: Mesh;
      age: number;
    }
    const markList: TrailMark[] = []
    const markLifetime = 1.8
    const dropInterval = 0.09
    let dropTimer = 0
    let colorCycleIndex = 0

    function spawnMark(position: Vector3) {
      const markNode = new TransformNodeClass('rainbowTrailMarkNode', scene)
      markNode.parent = trailContainerNode
      markNode.position.copyFrom(position)
      const flakeSeed = createSeedFrom(6, colorCycleIndex)
      const flakeRandom = createRandomGenerator(flakeSeed)
      // 每個痕跡是一小截捲曲蠟筆屑，捲角隨機，像剛削下來就掉在原地不動
      const flake = CreateTorus('rainbowTrailFlake', {
        diameter: 0.09 + flakeRandom() * 0.05,
        thickness: 0.022,
        tessellation: 8,
      }, scene)
      flake.rotation.set(flakeRandom() * Math.PI, flakeRandom() * Math.PI, flakeRandom() * Math.PI)
      flake.material = colorMaterialList[colorCycleIndex % colorMaterialList.length]!
      flake.isPickable = false
      flake.parent = markNode
      flake.convertToFlatShadedMesh()
      applyVertexJitter(flake, { seed: flakeSeed, amount: 0.012 })
      colorCycleIndex += 1
      markList.push({ node: markNode, mesh: flake, age: 0 })
    }

    return {
      update(deltaSeconds, isMoving) {
        if (isMoving) {
          dropTimer += deltaSeconds
          if (dropTimer >= dropInterval) {
            dropTimer = 0
            // 世界矩陣預設延遲到 render 階段才更新，這裡要當幀立刻拿最新落點
            root.computeWorldMatrix(true)
            spawnMark(root.getAbsolutePosition())
          }
        }
        for (let index = markList.length - 1; index >= 0; index--) {
          const mark = markList[index]!
          mark.age += deltaSeconds
          const lifeRatio = clampRatio(mark.age / markLifetime)
          // 落地先維持一下再慢慢縮小淡出，像蠟筆屑靜靜躺在原地褪色，而非瞬間消失
          const fadeOut = 1 - easeOutCubic(clampRatio((lifeRatio - 0.4) / 0.6))
          mark.mesh.visibility = fadeOut
          mark.node.scaling.setAll(Math.max(0.05, fadeOut))
          if (mark.age >= markLifetime) {
            mark.mesh.dispose()
            mark.node.dispose()
            markList.splice(index, 1)
          }
        }
      },
      disposeExtra() {
        for (const mark of markList) {
          mark.mesh.dispose()
          mark.node.dispose()
        }
        markList.length = 0
        for (const material of colorMaterialList) {
          material.dispose()
        }
        trailContainerNode.dispose()
      },
    }
  },

}

/** 建立一件配件 */
export function createAccessory(
  scene: Scene,
  parentNode: TransformNode,
  rewardId: RewardId,
): AccessoryHandle {
  const factory = accessoryFactoryMap[rewardId]
  const root = createAccessoryRoot(scene, parentNode, rewardId)
  const { update, disposeExtra } = factory(scene, root)
  return {
    rewardId,
    node: root,
    update,
    dispose() {
      disposeExtra?.()
      // 配件會隨玩家切換反覆建立與丟棄，網格與材質要一併收掉，不能只等 scene.dispose
      for (const childMesh of root.getChildMeshes()) {
        childMesh.material?.dispose()
        childMesh.dispose()
      }
      root.dispose()
    },
  }
}
