<template>
  <div class=" fixed w-screen h-screen">
    <canvas
      v-once
      ref="canvasRef"
      class="canvas w-full h-full"
    />

    <!-- 目前排名 -->
    <div class="absolute bottom-4 left-4 p-4 pointer-events-none">
      <transition-group
        name="list"
        tag="div"
        class="flex flex-col-reverse gap-2"
      >
        <div
          v-for="(marble, index) in marbleList"
          :key="marble.mesh.name"
          class="flex items-center gap-3 p-2 bg-white/80 backdrop-blur-sm rounded shadow-sm w-32"
        >
          <div class="font-mono font-bold text-gray-500 w-4 text-center">
            {{ index + 1 }}
          </div>

          <div
            class="w-4 h-4 rounded-full border border-black/10 shadow-inner"
            :style="{ backgroundColor: marble.hexColor }"
          />

          <div class="text-xs text-gray-700 font-medium">
            #{{ marble.mesh.name.slice(-4) }}
          </div>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Mesh, Scene } from '@babylonjs/core'
import type { TrackSegment } from './track-segment'
import { ActionManager, Color3, DirectionalLight, Engine, ExecuteCodeAction, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, Quaternion, ShadowGenerator, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import { useThrottleFn } from '@vueuse/core'
import { animate, cubicBezier } from 'animejs'
import { random } from 'lodash-es'
import { nanoid } from 'nanoid'
import { filter, firstBy, flat, map, pipe, shuffle, tap, values } from 'remeda'
import { shallowRef, triggerRef } from 'vue'
import { createTrackSegment } from './track-segment'
import { TrackSegmentType } from './track-segment/data'
import { useBabylonScene } from './use-babylon-scene'

const marbleCount = 10
const marbleList = shallowRef<Marble[]>([])

const updateRanking = useThrottleFn(() => {
  marbleList.value.sort((a, b) => {
    // 優先比較檢查點索引 (大的在前)
    if (a.lastCheckPointIndex !== b.lastCheckPointIndex) {
      return b.lastCheckPointIndex - a.lastCheckPointIndex
    }
    // 如果在同一個檢查點區間，Y 越小代表跑越下面 (越快)
    return a.mesh.position.y - b.mesh.position.y
  })

  triggerRef(marbleList)
}, 500)

function createGround({ scene }: {
  scene: Scene;
}) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)
  ground.receiveShadows = true

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = groundMaterial

  const groundAggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene)

  return ground
}

const ghostRenderingGroupId = 1
let ghostMaterial: StandardMaterial

interface Marble {
  hexColor: string;
  mesh: Mesh;
  lastCheckPointIndex: number;
  isRespawning: boolean;
}
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
    hexColor: finalColor.toGammaSpace().scale(1.05).toHexString(),
    mesh: marble,
    lastCheckPointIndex: 0,
    isRespawning: false,
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
      width: 1,
      height: 5,
      depth: 1,
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

    // 畫 Group 1 (幽靈) 時，不要清除 Group 0 (牆壁) 的深度資訊，這樣才能進行深度比較
    scene.setRenderingAutoClearDepthStencil(ghostRenderingGroupId, false)

    const shadowGenerator = createShadowGenerator(scene)

    // createGround({ scene })

    // 建立軌道
    const trackSegmentList = await pipe(
      values(TrackSegmentType),
      (list) => [shuffle(list), shuffle(list)],
      flat(),
      filter((type) => type !== TrackSegmentType.end),
      map((type) => createTrackSegment({ scene, type })),
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
        0.8,
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

    // 追蹤目前的目標彈珠
    let currentTrackedMarble: Marble | undefined

    // 攝影機持續跟蹤「目前 Y 座標最小（最低）」的彈珠
    scene.onBeforeRenderObservable.add(() => {
      const lowestMarble = firstBy(
        marbleList.value,
        (marble) => marble.mesh.position.y,
      )

      if (!lowestMarble)
        return

      // 是否切換目標
      if (!currentTrackedMarble) {
        currentTrackedMarble = lowestMarble
      }
      else {
        // 如果當前追蹤的彈珠正在重生，立刻切換到最低者 (避免鏡頭被拉回起點)
        if (currentTrackedMarble.isRespawning) {
          currentTrackedMarble = lowestMarble
        }
        // 只有當「絕對最低者」比「當前目標」低超過 1 個單位時，才切換，這樣可以避免兩者高度相近時瘋狂切換造成的抖動
        else if (lowestMarble.mesh.position.y < currentTrackedMarble.mesh.position.y - 1.0) {
          currentTrackedMarble = lowestMarble
        }
      }

      Vector3.LerpToRef(
        cameraTarget.position,
        currentTrackedMarble.mesh.position,
        0.1,
        cameraTarget.position,
      )

      updateRanking()
    })

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

    // 設定檢查點
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
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
  background: linear-gradient(180deg, #e3ffe7 0%, #d9e7ff 100%)

.list-move,
.list-enter-active,
.list-leave-active
  transition: all 0.5s cubic-bezier(0.800, 0.000, 0.000, 1.2)

.list-leave-active
  position: absolute

.list-enter-from,
.list-leave-to
  opacity: 0
  transform: translateX(-30px)
</style>
