<template>
  <div class=" fixed w-screen h-screen">
    <canvas
      v-once
      ref="canvasRef"
      class="canvas w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
import type { Mesh, Scene } from '@babylonjs/core'
import type { TrackSegment } from './track-segment'
import { ActionManager, Animation, ArcRotateCamera, CircleEase, Color3, DirectionalLight, Engine, ExecuteCodeAction, FollowCamera, HavokPlugin, MeshBuilder, PhysicsAggregate, PhysicsMotionType, PhysicsPrestepType, PhysicsShapeType, Quaternion, Ray, ShadowGenerator, StandardMaterial, Vector3 } from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'
import { random } from 'lodash-es'
import { filter, flat, flatMap, map, pipe, prop, reduce, shuffle, sortBy, tap, values } from 'remeda'
import { createTrackSegment } from './track-segment'
import { TrackSegmentType } from './track-segment/data'
import { useBabylonScene } from './use-babylon-scene'

const marbleCount = 100

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
  mesh: Mesh;
  lastCheckPointIndex: number;
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
  const marble = MeshBuilder.CreateSphere('marble', {
    diameter: 0.5,
    segments: 8,
  }, scene)
  marble.position.copyFrom(startPosition)

  const marbleMaterial = new StandardMaterial('marbleMaterial', scene)
  marbleMaterial.diffuseColor = color ?? Color3.FromHSV(
    random(0, 360),
    0.9,
    0.7,
  )
  marble.material = marbleMaterial

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
    mesh: marble,
    lastCheckPointIndex: 0,
  }
}

function createShadowGenerator(scene: Scene) {
  const light = new DirectionalLight('dir01', new Vector3(-5, -5, 0), scene)
  light.intensity = 0.7

  const shadowGenerator = new ShadowGenerator(1024, light)
  shadowGenerator.usePoissonSampling = true

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

  prevTrack.rootNode.getChildMeshes().forEach((mesh) => {
    mesh.freezeWorldMatrix()
  })
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
  const physicsBody = marble.mesh.physicsBody
  if (!physicsBody)
    return
  physicsBody.disablePreStep = false
  physicsBody.setMotionType(PhysicsMotionType.ANIMATED)
  physicsBody.setLinearVelocity(Vector3.Zero())
  physicsBody.setAngularVelocity(Vector3.Zero())

  Animation.CreateAndStartAnimation(
    'respawnAnim',
    marble.mesh,
    'position',
    60,
    60,
    marble.mesh.position,
    targetPosition,
    Animation.ANIMATIONLOOPMODE_CONSTANT,
    new CircleEase(),
    () => {
      marble.mesh.position.copyFrom(targetPosition)
      marble.mesh.computeWorldMatrix(true)
      physicsBody.setMotionType(PhysicsMotionType.DYNAMIC)
    },
  )
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene, camera } = params
    if (!(camera instanceof ArcRotateCamera)) {
      throw new TypeError('camera is not ArcRotateCamera')
    }

    const havokInstance = await HavokPhysics()
    const havokPlugin = new HavokPlugin(true, havokInstance)
    scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)

    camera.attachControl(scene.getEngine().getRenderingCanvas(), true)
    camera.lowerRadiusLimit = 2
    camera.upperRadiusLimit = 50
    camera.panningSensibility = 0

    scene.activeCamera = camera

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

    const marbleList: Marble[] = []
    for (let i = 0; i < marbleCount; i++) {
      const startPosition = firstTrackSegment.startPosition.clone()
      startPosition.y += (0.5 * i)

      const color = Color3.FromHSV(
        340 * (i / marbleCount),
        0.9,
        0.7,
      )

      const marble = createMarble({
        scene,
        shadowGenerator,
        startPosition,
        color,
      })
      marbleList.push(marble)
      shadowGenerator.addShadowCaster(marble.mesh)

      if (i === 0) {
        camera.lockedTarget = marble.mesh
      }
    }

    if (lastTrackSegment) {
      connectTracks(lastTrackSegment, endTrackSegment)
      endTrackSegment.initPhysics()
    }

    // 設定檢查點
    const checkPointPositionList = getCheckPointPositionList([
      ...trackSegmentList,
      endTrackSegment,
    ])

    marbleList.forEach((marble) => {
      createCheckPointColliders({
        scene,
        pointPositionList: checkPointPositionList,
        marble,
      })
    })

    // 若彈珠直接跳過下一個檢查點之 Y 座標 -5 處，則將彈珠的 Y 座標拉回檢查點
    scene.onBeforeRenderObservable.add(() => {
      marbleList.forEach((marble) => {
        const lastCheckPointPosition = checkPointPositionList[marble.lastCheckPointIndex]
        const nextCheckPointPosition = checkPointPositionList[marble.lastCheckPointIndex + 1]
        if (!nextCheckPointPosition || !lastCheckPointPosition) {
          return
        }

        const physicsBody = marble.mesh.physicsBody
        if (!physicsBody) {
          return
        }

        if (marble.mesh.position.y < nextCheckPointPosition.y - 5) {
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
</style>
