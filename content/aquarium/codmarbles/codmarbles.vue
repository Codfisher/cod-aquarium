<template>
  <div class="fixed w-screen h-screen">
    <canvas
      v-once
      ref="canvasRef"
      class="canvas w-full h-full"
    />

    <ranking-list
      v-model:focused-marble="focusedMarble"
      :start-time="startTime"
      :ranking-list="marbleList"
      class="absolute bottom-4 left-4"
    />
  </div>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import type { TrackSegment } from './track-segment'
import type { Marble } from './types'
import { ActionManager, AssetsManager, Color3, DirectionalLight, Engine, ExecuteCodeAction, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, Quaternion, ShadowGenerator, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import { useThrottleFn } from '@vueuse/core'
import { animate, cubicBezier } from 'animejs'
import { random } from 'lodash-es'
import { nanoid } from 'nanoid'
import { filter, firstBy, flat, map, pipe, shuffle, tap, values } from 'remeda'
import { ref, shallowRef, triggerRef } from 'vue'
import RankingList from './components/ranking-list.vue'
import { createTrackSegment } from './track-segment'
import { TrackSegmentType } from './track-segment/data'
import { useBabylonScene } from './use-babylon-scene'

const marbleCount = 10
const marbleList = shallowRef<Marble[]>([])
const focusedMarble = shallowRef<Marble>()

const startTime = ref(0)
const updateRanking = useThrottleFn(() => {
  marbleList.value = marbleList.value.toSorted((a, b) => {
    const aFinished = a.finishTime > 0
    const bFinished = b.finishTime > 0

    if (aFinished !== bFinished) {
      return aFinished ? -1 : 1
    }

    if (aFinished && bFinished) {
      return a.finishTime - b.finishTime
    }

    // 優先比較檢查點索引 (大的在前)
    if (a.lastCheckPointIndex !== b.lastCheckPointIndex) {
      return b.lastCheckPointIndex - a.lastCheckPointIndex
    }
    // 如果在同一個檢查點區間，Y 越小代表跑越下面 (越快)
    return a.mesh.position.y - b.mesh.position.y
  })

  triggerRef(marbleList)
}, 500)

const ghostRenderingGroupId = 1
let ghostMaterial: StandardMaterial

function createMarble({
  scene,
  shadowGenerator,
  startPosition = Vector3.Zero(),
  color,
}: {
  scene: Scene;
  shadowGenerator: ShadowGenerator;
  startPosition?: Vector3;
  color?: Color3;
}): Marble {
  const marble = MeshBuilder.CreateSphere(nanoid(), {
    diameter: 0.5,
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

      marbleMaterial.clearCoat.isEnabled = true
      marbleMaterial.clearCoat.intensity = 1
      marbleMaterial.clearCoat.roughness = 0
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
  pipe(
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
      ghostMarble.renderingGroupId = ghostRenderingGroupId
    }),
  )

  // 建立物理體
  const sphereAggregate = new PhysicsAggregate(
    marble,
    PhysicsShapeType.SPHERE,
    { mass: 1, restitution: 0.1, friction: 0 },
    scene,
  )

  return {
    hexColor: finalColor.toHexString(),
    mesh: marble,
    lastCheckPointIndex: 0,
    isRespawning: false,
    finishTime: 0,
  }
}

function createShadowGenerator(scene: Scene) {
  const light = new DirectionalLight('dir01', new Vector3(-1, -5, -1), scene)

  light.position = new Vector3(0, 100, 0)
  light.intensity = 0.8

  const shadowGenerator = new ShadowGenerator(2048, light)

  shadowGenerator.bias = 0.000001
  shadowGenerator.normalBias = 0.0001
  shadowGenerator.usePercentageCloserFiltering = true
  shadowGenerator.forceBackFacesOnly = true

  return shadowGenerator
}

/** 將 nextTrack 接在 prevTrack 的後面
 *
 * NextRoot = PrevRoot + PrevEnd - NextStart
 */
function connectTracks(prevTrack: TrackSegment, nextTrack: TrackSegment) {
  nextTrack.rootNode.position
    .copyFrom(prevTrack.rootNode.position)
    .addInPlace(prevTrack.endPosition)
    .subtractInPlace(nextTrack.startPosition)
}

/** 取得每一個 in Mesh 的位置（世界座標） */
function getCheckPointPositionList(trackSegmentList: TrackSegment[]) {
  const list: Vector3[] = []
  trackSegmentList.forEach((trackSegment) => {
    const inMesh = trackSegment.rootNode.getChildMeshes().find((mesh) => mesh.name === 'in')
    if (inMesh) {
      inMesh.computeWorldMatrix(true)
      list.push(inMesh.getAbsolutePosition())
    }
  })

  return list.sort((a, b) => a.y - b.y).reverse()
}

function createCheckPointColliders(
  {
    scene,
    pointPositionList,
    marble,
  }: {
    scene: Scene;
    pointPositionList: Vector3[];
    marble: Marble;
  },
) {
  pointPositionList.forEach((position, index) => {
    const collider = MeshBuilder.CreateBox(`check-point-collider-${index}`, {
      width: 2,
      height: 2,
      depth: 2,
    }, scene)

    collider.position = position
    collider.isVisible = false

    collider.actionManager = new ActionManager(scene)

    collider.actionManager.registerAction(
      new ExecuteCodeAction(
        {
          trigger: ActionManager.OnIntersectionEnterTrigger,
          parameter: marble.mesh,
        },
        () => {
          marble.lastCheckPointIndex = index
        },
      ),
    )
  })
}

function respawnWithAnimation(
  marble: Marble,
  targetPosition: Vector3,
) {
  if (marble.isRespawning) {
    return
  }
  marble.isRespawning = true

  const physicsBody = marble.mesh.physicsBody
  if (!physicsBody)
    return
  physicsBody.disablePreStep = false
  physicsBody.setMotionType(PhysicsMotionType.ANIMATED)
  physicsBody.setLinearVelocity(Vector3.Zero())
  physicsBody.setAngularVelocity(Vector3.Zero())

  const duration = 2000
  animate(marble.mesh.position, {
    y: targetPosition.y,
    duration,
    ease: cubicBezier(0.348, 0.011, 0, 1.238),
  })

  animate(marble.mesh.position, {
    x: targetPosition.x,
    z: targetPosition.z,
    duration,
    ease: cubicBezier(0.826, 0.005, 0.259, 0.971),
    onComplete() {
      marble.isRespawning = false
      physicsBody.disablePreStep = true
      marble.mesh.computeWorldMatrix(true)
      physicsBody.setMotionType(PhysicsMotionType.DYNAMIC)
    },
  })
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene, camera } = params

    const assetsManager = new AssetsManager(scene)
    assetsManager.useDefaultLoadingScreen = false

    // 畫 Group 1 (幽靈) 時，不要清除 Group 0 (牆壁) 的深度資訊，這樣才能進行深度比較
    scene.setRenderingAutoClearDepthStencil(ghostRenderingGroupId, false)

    const shadowGenerator = createShadowGenerator(scene)

    // 建立軌道
    const trackSegmentList = await pipe(
      values(TrackSegmentType),
      shuffle(),
      filter((type) => type !== TrackSegmentType.end),
      map((type) => createTrackSegment({ scene, assetsManager, type })),
      async (trackSegments) => {
        const list = await Promise.all(trackSegments)

        list.reduce((prevTrack, nextTrack) => {
          if (prevTrack) {
            connectTracks(prevTrack, nextTrack)
          }
          return nextTrack
        }, undefined as TrackSegment | undefined)

        list.forEach((trackSegment) => {
          trackSegment.initPhysics()
        })

        return list
      },
    )
    const endTrackSegment = await createTrackSegment({
      scene,
      assetsManager,
      type: TrackSegmentType.end,
    })

    const firstTrackSegment = trackSegmentList[0]
    const lastTrackSegment = trackSegmentList[trackSegmentList.length - 1]
    if (!firstTrackSegment) {
      throw new Error('firstTrackSegment is undefined')
    }

    const cameraTarget = pipe(
      new TransformNode('cameraTarget', scene),
      tap((node) => {
        camera.lockedTarget = node
      }),
    )

    for (let i = 0; i < marbleCount; i++) {
      const startPosition = firstTrackSegment.startPosition.clone()
      startPosition.y += (0.5 * i)

      const color = Color3.FromHSV(
        340 * (i / marbleCount),
        1,
        1,
      )

      const marble = createMarble({
        scene,
        shadowGenerator,
        startPosition,
        color,
      })
      marbleList.value.push(marble)
      shadowGenerator.addShadowCaster(marble.mesh)

      if (i === 0) {
        cameraTarget.position.copyFrom(marble.mesh.position)
      }
    }
    triggerRef(marbleList)

    if (lastTrackSegment) {
      connectTracks(lastTrackSegment, endTrackSegment)
      endTrackSegment.initPhysics()
    }

    const allTrackSegmentList = [...trackSegmentList, endTrackSegment]
    allTrackSegmentList.forEach((trackSegment) => {
      trackSegment.rootNode.getChildMeshes().forEach((mesh) => {
        shadowGenerator.addShadowCaster(mesh)
      })
    })

    // 攝影機追蹤最低的彈珠
    pipe(0, () => {
      let currentTrackedMarble: Marble | undefined

      // 攝影機持續跟蹤「目前 Y 座標最小（最低）」的彈珠
      scene.onBeforeRenderObservable.add(() => {
        const trackTarget = pipe(0, () => {
          if (focusedMarble.value) {
            return focusedMarble.value
          }

          const lowestMarble = firstBy(
            marbleList.value,
            (marble) => marble.mesh.position.y,
          )

          if (!lowestMarble)
            return

          // 是否切換目標
          if (!currentTrackedMarble) {
            return lowestMarble
          }
          // 如果當前追蹤的彈珠正在重生，立刻切換到最低者 (避免鏡頭被拉回起點)
          if (currentTrackedMarble.isRespawning) {
            return lowestMarble
          }

          // 只有當「絕對最低者」比「當前目標」低超過 1 個單位時，才切換，這樣可以避免兩者高度相近時瘋狂切換造成的抖動
          if (lowestMarble.mesh.position.y < currentTrackedMarble.mesh.position.y - 1.0) {
            return lowestMarble
          }

          return currentTrackedMarble
        })

        currentTrackedMarble = trackTarget

        if (!trackTarget) {
          return
        }

        Vector3.LerpToRef(
          cameraTarget.position,
          trackTarget.mesh.position,
          0.1,
          cameraTarget.position,
        )

        updateRanking()
      })
    })

    // 設定檢查點
    pipe(0, () => {
      const checkPointPositionList = getCheckPointPositionList([
        ...trackSegmentList,
        endTrackSegment,
      ])

      marbleList.value.forEach((marble) => {
        createCheckPointColliders({
          scene,
          pointPositionList: checkPointPositionList,
          marble,
        })
      })

      // 若彈珠直接跳過下一個檢查點之 Y 座標 -1 處，則將彈珠的 Y 座標拉回檢查點
      scene.onBeforeRenderObservable.add(() => {
        marbleList.value.forEach((marble) => {
          const lastCheckPointPosition = checkPointPositionList[marble.lastCheckPointIndex]
          const nextCheckPointPosition = checkPointPositionList[marble.lastCheckPointIndex + 1]
          if (!nextCheckPointPosition || !lastCheckPointPosition) {
            return
          }

          const physicsBody = marble.mesh.physicsBody
          if (!physicsBody) {
            return
          }

          if (marble.mesh.position.y < nextCheckPointPosition.y - 1) {
            respawnWithAnimation(marble, lastCheckPointPosition)
          }
        })
      })
    })

    // 終點檢查
    pipe(0, () => {
      const endCheckPointPosition = endTrackSegment.rootNode
        .getChildMeshes()
        .find((mesh) => mesh.name === 'end')
        ?.getAbsolutePosition()

      if (!endCheckPointPosition) {
        throw new Error('endCheckPointPosition is undefined')
      }

      const endTriggerBox = MeshBuilder.CreateBox('endTrigger', {
        width: 10,
        height: 10,
        depth: 1,
      }, scene)

      endTriggerBox.position.copyFrom(endCheckPointPosition)
      endTriggerBox.isVisible = false
      const actionManager = new ActionManager(scene)
      endTriggerBox.actionManager = actionManager

      marbleList.value.forEach((marble) => {
        actionManager.registerAction(
          new ExecuteCodeAction(
            {
              trigger: ActionManager.OnIntersectionEnterTrigger,
              parameter: marble.mesh,
            },
            () => {
              if (marble.finishTime === 0) {
                marble.finishTime = Date.now()
              }
            },
          ),
        )
      })
    })

    startTime.value = Date.now()
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
  background: linear-gradient(180deg, #e3ffea, #e2deff )
</style>
