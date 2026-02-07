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
import { ArcRotateCamera, Color3, DirectionalLight, Engine, FollowCamera, HavokPlugin, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Quaternion, Ray, ShadowGenerator, StandardMaterial, Vector3 } from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'
import { filter, flat, flatMap, map, pipe, reduce, shuffle, tap, values } from 'remeda'
import { createTrackSegment } from './track-segment'
import { TrackSegmentType } from './track-segment/data'
import { useBabylonScene } from './use-babylon-scene'

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
function createMarble({
  scene,
  shadowGenerator,
  startPosition = Vector3.Zero(),
}: {
  scene: Scene;
  shadowGenerator: ShadowGenerator;
  startPosition?: Vector3;
}) {
  const marble = MeshBuilder.CreateSphere('marble', {
    diameter: 0.5,
    segments: 32,
  }, scene)
  marble.position.copyFrom(startPosition)
  marble.receiveShadows = true

  const marbleMaterial = new StandardMaterial('marbleMaterial', scene)
  marbleMaterial.diffuseColor = new Color3(0.8, 0.1, 0.1)
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

  return marble
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
      // (list) => [list, list],
      flat(),
      filter((type) => type !== TrackSegmentType.end01),
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
      type: TrackSegmentType.end01,
    })

    const firstTrackSegment = trackSegmentList[0]
    const lastTrackSegment = trackSegmentList[trackSegmentList.length - 1]

    if (firstTrackSegment) {
      for (let i = 0; i < 4; i++) {
        const startPosition = firstTrackSegment.startPosition.clone()
        startPosition.y += (0.1 * i)

        const marble = createMarble({
          scene,
          shadowGenerator,
          startPosition,
        })
        shadowGenerator.addShadowCaster(marble)

        if (i === 0) {
          camera.lockedTarget = marble
        }
      }
    }

    if (lastTrackSegment) {
      connectTracks(lastTrackSegment, endTrackSegment)
      endTrackSegment.initPhysics()
    }
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
