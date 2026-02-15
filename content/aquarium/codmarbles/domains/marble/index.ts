import type { Scene, ShadowGenerator, TransformNode } from '@babylonjs/core'
import type { Ref } from 'vue'
import type { BabylonEngine } from '../../../codstack/composables/use-babylon-scene'
import type { GameState, Marble } from '../../types'
import { Color3, Engine, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Quaternion, Ray, StandardMaterial, Vector3 } from '@babylonjs/core'
import { random } from 'lodash-es'
import { nanoid } from 'nanoid'
import { pipe, shuffle, tap } from 'remeda'

export const MARBLE_SIZE = 0.5
export const GHOST_RENDERING_GROUP_ID = 1

let ghostMaterial: StandardMaterial

const nameGenerator = {
  prefixes: shuffle([
    '漆黑烈焰的',
    '被封印的',
    '來自深淵的',
    '覺醒的',
    '諸神的',
    '穿模的',
    '貼圖遺失的',
    '剛睡醒的',
    '不想上班的',
    '月底吃土的',
    '體脂過高的',
    '被退學的',
    '全村希望的',
    '路邊撿到的',
    '吃飽撐著的',
    '偏頭痛的',
  ]),
  suffixes: shuffle([
    '鱈魚',
    '單細胞生物',
    '社畜',
    '肥宅',
    '智齒',
    '蛋白質',
    '草履蟲',
    '初號機',
    '克蘇魯',
    '路人甲',
    '遺憾',
    '霸主',
    '破壞神',
    '大魔王',
    '救世主',
    '幻想',
    '最終兵器',
    '暴走族',
    '魔法師',
    '召喚獸',
    '測試員',
  ]),
}

export function getRandomMarbleName() {
  // 依序拿取就好，因為有 shuffle
  const prefix = nameGenerator.prefixes.shift()!
  const suffix = nameGenerator.suffixes.shift()!
  nameGenerator.prefixes.push(prefix)
  nameGenerator.suffixes.push(suffix)
  return `${prefix}${suffix}`
}

export function createMarble({
  scene,
  engine,
  shadowGenerator,
  startPosition = Vector3.Zero(),
  color,
  gameState,
  index,
}: {
  scene: Scene;
  engine: BabylonEngine;
  shadowGenerator: ShadowGenerator;
  startPosition?: Vector3;
  color?: Color3;
  gameState: Ref<GameState>;
  index: number;
}): Marble {
  const marble = MeshBuilder.CreateSphere(nanoid(), {
    diameter: MARBLE_SIZE,
    segments: 16,
  }, scene)
  marble.position.copyFrom(startPosition)

  const finalColor = color ?? Color3.FromHSV(random(0, 360), 0.8, 0.4)

  marble.material = pipe(
    new PBRMaterial('marbleMaterial', scene),
    tap((marbleMaterial) => {
      marbleMaterial.albedoColor = finalColor

      marbleMaterial.metallic = 0
      marbleMaterial.roughness = 0.5

      // marbleMaterial.clearCoat.isEnabled = true
      // marbleMaterial.clearCoat.intensity = 1
      // marbleMaterial.clearCoat.roughness = 0
    }),
  )

  const ghostMat = pipe(
    ghostMaterial ?? new StandardMaterial('ghostMaterial', scene),
    tap((ghostMaterial) => {
      ghostMaterial.diffuseColor = new Color3(1, 1, 1)
      ghostMaterial.emissiveColor = new Color3(1, 1, 1)
      ghostMaterial.alpha = 0.1
      ghostMaterial.disableLighting = true
      ghostMaterial.backFaceCulling = false

      // 設定深度函數 (Depth Function)
      // 預設是 Engine.LEQUAL (小於等於時繪製，也就是在前面時繪製)
      // 我們改成 Engine.GREATER (大於時繪製，也就是在後面/被擋住時才繪製)
      ghostMaterial.depthFunction = Engine.GREATER
    }),
  )
  if (!ghostMaterial) {
    ghostMaterial = ghostMat
  }

  // 建立幽靈彈珠，可穿透障礙物，方便觀察
  const ghostMarble = pipe(
    marble.clone('ghostMarble'),
    tap((ghostMarble) => {
      ghostMarble.material = ghostMat

      // 確保幽靈永遠黏在實體彈珠上，不受物理層級影響
      scene.onBeforeRenderObservable.add(() => {
        ghostMarble.position.copyFrom(marble.position)
        if (marble.rotationQuaternion) {
          if (!ghostMarble.rotationQuaternion) {
            ghostMarble.rotationQuaternion = new Quaternion()
          }
          ghostMarble.rotationQuaternion.copyFrom(marble.rotationQuaternion)
        }
        else {
          ghostMarble.rotation.copyFrom(marble.rotation)
        }
      })

      // 放大一點點避免浮點數誤差導致 Engine.GREATER 判斷閃爍
      ghostMarble.scaling = new Vector3(1.05, 1.05, 1.05)

      shadowGenerator.removeShadowCaster(ghostMarble)

      // 設定渲染群組
      // 群組 0: 地板、牆壁、正常彈珠 (先畫)
      // 群組 1: 幽靈彈珠 (後畫)
      // 我們必須讓幽靈在牆壁畫完之後才畫，這樣它才能知道自己是不是在牆壁後面
      ghostMarble.renderingGroupId = GHOST_RENDERING_GROUP_ID
    }),
  )

  // 建立物理體
  const sphereAggregate = new PhysicsAggregate(
    marble,
    PhysicsShapeType.SPHERE,
    { mass: 1, restitution: 0.1, friction: 0 },
    scene,
  )

  marble.onEnabledStateChangedObservable.add((isEnabled) => {
    ghostMarble.setEnabled(isEnabled)
  })

  const result = {
    index,
    name: getRandomMarbleName(),
    hexColor: finalColor.toGammaSpace().toHexString(),
    mesh: marble,
    lastCheckPointIndex: 0,
    isRespawning: false,
    isGrounded: false,
    staticDurationSec: 0,
    finishedAt: 0,
  }

  scene.onBeforeRenderObservable.add(() => {
    if (gameState.value !== 'playing') {
      return
    }

    result.isGrounded = isMarbleGrounded(marble, scene)

    // 速度過小時，累加 staticDurationSec
    if (sphereAggregate.body.getLinearVelocity().length() < 0.1) {
      const dt = engine.getDeltaTime() / 1000
      result.staticDurationSec += dt
    }
    else {
      result.staticDurationSec = 0
    }
  })

  return result
}

export function isMarbleGrounded(mesh: TransformNode, scene: Scene): boolean {
  const origin = mesh.position
  // 正下方
  const direction = new Vector3(0, -1, 0)
  // 半徑 + 容許值 (0.15) = 0.4
  // 太短會導致斜坡誤判懸空，太長會導致還沒碰到地就算著地
  const length = MARBLE_SIZE + 0.15

  const ray = new Ray(origin, direction, length)

  const hit = scene.pickWithRay(ray, (pickedMesh) => {
    if (pickedMesh === mesh)
      return false
    if (!pickedMesh.isVisible)
      return false
    if (pickedMesh.name.includes('ghost'))
      return false

    return true
  })

  return hit ? hit.hit : false
}
