<template>
  <div class="fixed w-screen inset-0">
    <canvas
      v-once
      ref="canvasRef"
      class="canvas w-full h-full"
    />
    <ranking-list
      v-model:focused-marble="focusedMarble"
      :start-time="startTime"
      :ranking-list="marbleList"
      :game-state="gameState"
      class="fixed left-0 bottom-0"
    />

    <transition name="opacity">
      <div
        v-if="canStartGame"
        class="absolute top-0 left-0 flex flex-col justify-center items-center w-full h-full pointer-events-none"
      >
        <hero-logo />

        <!-- 遊戲開始按鈕 -->
        <base-btn
          v-slot="{ hover }"
          label="Start"
          class="pointer-events-auto border-3 md:border-5 border-white/80"
          stroke-color="#4a3410"
          @click="startGame"
        >
          <div
            class="btn-content absolute inset-0"
            :class="{ hover }"
          >
            <base-polygon
              class="absolute left-0 top-0 -translate-x-[70%] -translate-y-[50%] -rotate-30"
              size="13rem"
              shape="round"
              fill="fence"
              opacity="1"
            />

            <base-polygon
              class="absolute right-0 bottom-0 translate-x-[60%] translate-y-[70%]"
              size="13rem"
              shape="round"
              fill="solid"
              opacity="1"
            />

            <base-polygon
              class="absolute right-0 top-0 -translate-x-[40%] -translate-y-[70%]"
              size="4rem"
              shape="round"
              fill="spot"
              opacity="0.8"
            />
          </div>
        </base-btn>
      </div>
    </transition>

    <div class="md:max-w-1/2 absolute top-0 right-0 p-4">
      <u-alert
        v-if="alertVisible"
        v-model:open="alertVisible"
        title="歡迎來到鱈魚的彈珠！"
        icon="i-ph:fish-simple-bold"
        close
        color="neutral"
      >
        <template #description>
          經研究證實，看彈珠滾啊滾，能有效降低大腦 CPU 使用率，這是為了防止社畜們過勞而生的醫療級網頁。(ゝ∀・)b

          <br><br>
          以上純屬瞎掰，其實沒什麼偉大的技術願景，純粹就是我想看東西滾來滾去而誕生的專案 (´,,•ω•,,)

          <br><br>
          不定期追加有趣的內容，歡迎一起<a
            href="https://www.threads.com/@codfish2140"
            target="_blank"
            class=" underline!"
          >放空、交流或許願功能</a> (*´∀`)~♥
        </template>
      </u-alert>
    </div>

    <transition name="opacity">
      <loading-overlay
        v-if="isLoading"
        class="absolute left-0 top-0 w-full h-full "
      />
    </transition>
  </div>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import type { TrackSegment } from './domains/track-segment'
import type { GameState, Marble } from './types'
import { ActionManager, AssetsManager, Color3, DirectionalLight, ExecuteCodeAction, MeshBuilder, PhysicsMotionType, ShadowGenerator, TransformNode, Vector3 } from '@babylonjs/core'
import { breakpointsTailwind, useBreakpoints, useColorMode, useEventListener, useThrottleFn } from '@vueuse/core'
import { animate, cubicBezier } from 'animejs'
import { filter, firstBy, map, pipe, shuffle, tap, values } from 'remeda'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { nextFrame } from '../../../web/common/utils'
import BaseBtn from './components/base-btn.vue'
import BasePolygon from './components/base-polygon.vue'
import HeroLogo from './components/hero-logo.vue'
import LoadingOverlay from './components/loading-overlay.vue'
import RankingList from './components/ranking-list.vue'
import { useFontLoader } from './composables/use-font-loader'
import { useBabylonScene } from './domains/game/use-babylon-scene'
import { createMarble, GHOST_RENDERING_GROUP_ID, MARBLE_SIZE } from './domains/marble'
import { connectTracks, createTrackSegment } from './domains/track-segment'
import { TrackSegmentType } from './domains/track-segment/data'
import { useAssetStore } from './stores/asset-store'

const alertVisible = ref(true)
const isLoading = ref(true)
const gameState = ref<GameState>('idle')

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()
const assetStore = useAssetStore()

const breakpoint = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoint.smaller('md')

function createShadowGenerator(scene: Scene) {
  const light = new DirectionalLight('dir01', new Vector3(-1, -5, -1), scene)

  light.position = new Vector3(0, 100, 0)
  light.intensity = 0.8

  const mapSize = isMobile.value ? 512 : 1024
  const shadowGenerator = new ShadowGenerator(mapSize, light)

  shadowGenerator.bias = 0.000001
  shadowGenerator.normalBias = 0.0001
  shadowGenerator.usePercentageCloserFiltering = true
  shadowGenerator.forceBackFacesOnly = true

  return shadowGenerator
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
      height: 6,
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

// --- 主要遊戲邏輯 ---
const marbleCount = 10
const marbleList = shallowRef<Marble[]>([])
const focusedMarble = shallowRef<Marble>()
const trackSegmentList = shallowRef<TrackSegment[]>([])
const cameraTarget = shallowRef<TransformNode>()

const startTime = ref(0)
const updateRanking = useThrottleFn(() => {
  marbleList.value = marbleList.value.toSorted((a, b) => {
    // 若有人正在掉落，則先不交換排名
    if (!a.isGrounded || !b.isGrounded) {
      return 0
    }

    const aFinished = a.finishedAt > 0
    const bFinished = b.finishedAt > 0

    if (aFinished !== bFinished) {
      return aFinished ? -1 : 1
    }

    if (aFinished && bFinished) {
      return a.finishedAt - b.finishedAt
    }

    // 優先比較檢查點索引 (大的在前)
    if (a.lastCheckPointIndex !== b.lastCheckPointIndex) {
      return b.lastCheckPointIndex - a.lastCheckPointIndex
    }
    // 如果在同一個檢查點區間，Y 越小代表跑越下面 (越快)
    return a.mesh.position.y - b.mesh.position.y
  })

  const allFinished = !marbleList.value.some((marble) => !marble.finishedAt)
  if (allFinished) {
    gameState.value = 'over'
  }

  triggerRef(marbleList)
}, 500)

function respawnWithAnimation(
  marble: Marble,
  targetPosition: Vector3,
) {
  if (marble.isRespawning) {
    return
  }
  marble.isRespawning = true
  marble.staticDurationSec = 0

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

const canStartGame = computed(() => {
  return gameState.value === 'idle' || gameState.value === 'over'
})

async function startGame() {
  gameState.value = 'preparing'

  const firstTrackSegment = trackSegmentList.value[0]
  if (!firstTrackSegment) {
    throw new Error('firstTrackSegment is undefined')
  }

  const duration = 5000
  const startPosition = firstTrackSegment.startPosition.clone()

  if (cameraTarget.value) {
    animate(cameraTarget.value.position, {
      y: startPosition.y,
      duration,
      ease: cubicBezier(0.1, 0.011, 0, 1),
    })

    animate(cameraTarget.value.position, {
      x: startPosition.x,
      z: startPosition.z,
      duration,
      ease: cubicBezier(0.826, 0.005, 0.259, 0.971),
    })
  }

  const tasks = marbleList.value.map(async (marble, i) => {
    const physicsBody = marble.mesh.physicsBody
    if (!physicsBody)
      return

    physicsBody.disablePreStep = false
    physicsBody.setMotionType(PhysicsMotionType.ANIMATED)
    physicsBody.setLinearVelocity(Vector3.Zero())
    physicsBody.setAngularVelocity(Vector3.Zero())

    const targetPosition = startPosition.clone()
    targetPosition.x += Math.random() / 10
    targetPosition.y += (MARBLE_SIZE * i) + 1

    const delay = i * 20
    animate(marble.mesh.position, {
      y: targetPosition.y,
      duration,
      delay,
      ease: cubicBezier(0.1, 0.011, 0, 1),
    })

    return animate(marble.mesh.position, {
      x: targetPosition.x,
      z: targetPosition.z,
      duration,
      delay,
      ease: cubicBezier(0.826, 0.005, 0.259, 0.971),
      onComplete() {
        marble.finishedAt = 0

        marble.isRespawning = false
        physicsBody.disablePreStep = true
        marble.mesh.computeWorldMatrix(true)
        physicsBody.setMotionType(PhysicsMotionType.DYNAMIC)
      },
    }).then()
  })

  await Promise.all(tasks)

  gameState.value = 'playing'
  startTime.value = Date.now()
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene, camera, canvas, engine } = params

    // Inspector.Show(scene, {
    //   embedMode: true,
    // })

    await assetStore.preloadTrackAssets(scene)

    const assetsManager = new AssetsManager(scene)
    assetsManager.useDefaultLoadingScreen = false

    // 畫 Group 1 (幽靈) 時，不要清除 Group 0 (牆壁) 的深度資訊，這樣才能進行深度比較
    scene.setRenderingAutoClearDepthStencil(GHOST_RENDERING_GROUP_ID, false)

    const shadowGenerator = createShadowGenerator(scene)

    // 建立軌道
    trackSegmentList.value = await pipe(
      values(TrackSegmentType),
      // [TrackSegmentType.g01],
      shuffle(),
      filter((type) => type !== TrackSegmentType.end),
      map((type) => createTrackSegment({ scene, assetStore, type })),
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
      assetStore,
      type: TrackSegmentType.end,
    })

    const firstTrackSegment = trackSegmentList.value[0]
    const lastTrackSegment = trackSegmentList.value[trackSegmentList.value.length - 1]
    if (!firstTrackSegment) {
      throw new Error('firstTrackSegment is undefined')
    }

    cameraTarget.value = pipe(
      new TransformNode('cameraTarget', scene),
      tap((node) => {
        camera.lockedTarget = node
      }),
    )

    const ballList: Marble[] = []
    for (let i = 0; i < marbleCount; i++) {
      const color = Color3.FromHSV(
        340 * (i / marbleCount),
        1,
        1,
      )

      const marble = createMarble({
        scene,
        engine,
        shadowGenerator,
        color,
        gameState,
      })
      ballList.push(marble)
      shadowGenerator.addShadowCaster(marble.mesh)

      if (i === 0) {
        cameraTarget.value?.position.copyFrom(marble.mesh.position)
      }
    }
    marbleList.value = ballList

    if (lastTrackSegment) {
      connectTracks(lastTrackSegment, endTrackSegment)
      endTrackSegment.initPhysics()
    }

    const allTrackSegmentList = [...trackSegmentList.value, endTrackSegment]
    allTrackSegmentList.forEach((trackSegment) => {
      trackSegment.rootNode.getChildMeshes().forEach((mesh) => {
        shadowGenerator.addShadowCaster(mesh)
      })
    })

    // 將彈珠移動到 lobby 位置
    pipe(0, () => {
      const lobbyMesh = scene.getMeshByName('lobby')
      if (!lobbyMesh) {
        throw new Error('lobbyMesh is undefined')
      }
      lobbyMesh.computeWorldMatrix(true)
      const lobbyPosition = lobbyMesh.getAbsolutePosition()

      cameraTarget.value?.position.copyFrom(lobbyPosition)

      marbleList.value.forEach(async (marble, i) => {
        const physicsBody = marble.mesh.physicsBody
        if (!physicsBody)
          return
        physicsBody.disablePreStep = false
        physicsBody.setMotionType(PhysicsMotionType.ANIMATED)
        physicsBody.setLinearVelocity(Vector3.Zero())
        physicsBody.setAngularVelocity(Vector3.Zero())

        marble.mesh.position.copyFrom(lobbyPosition)
        marble.mesh.position.x += Math.random()
        marble.mesh.position.y += (MARBLE_SIZE * i) + 1

        /** 確保物理引擎已經更新位置 */
        await nextFrame()

        physicsBody.disablePreStep = true
        marble.mesh.computeWorldMatrix(true)
        physicsBody.setMotionType(PhysicsMotionType.DYNAMIC)
      })

      camera.radius = 15
      camera.alpha = Math.PI / 5 * 2
      camera.beta = Math.PI / 5 * 4
    })

    // 攝影機追蹤最低的彈珠
    pipe(0, () => {
      let currentTrackedMarble: Marble | undefined

      // 攝影機持續跟蹤「目前 Y 座標最小（最低）」的彈珠
      scene.onBeforeRenderObservable.add(() => {
        if (gameState.value !== 'playing') {
          return
        }

        const trackTarget = pipe(0, () => {
          if (focusedMarble.value) {
            return focusedMarble.value
          }

          const lowestMarble = pipe(
            marbleList.value,
            filter((marble) => marble.isGrounded),
            firstBy((marble) => marble.mesh.position.y),
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

        if (cameraTarget.value) {
          Vector3.LerpToRef(
            cameraTarget.value.position,
            trackTarget.mesh.position,
            0.1,
            cameraTarget.value.position,
          )
        }

        updateRanking()
      })
    })

    // 設定檢查點
    pipe(0, () => {
      const checkPointPositionList = getCheckPointPositionList([
        ...trackSegmentList.value,
        endTrackSegment,
      ])

      marbleList.value.forEach((marble) => {
        createCheckPointColliders({
          scene,
          pointPositionList: checkPointPositionList,
          marble,
        })
      })

      // 最後一個檢查點
      const lowestCheckPoint = checkPointPositionList.at(-1)

      // 若彈珠直接跳過下一個檢查點之 Y 座標 -1 處，則將彈珠的 Y 座標拉回檢查點
      scene.onBeforeRenderObservable.add(() => {
        if (gameState.value !== 'playing') {
          return
        }

        marbleList.value.forEach((marble) => {
          const lastCheckPointPosition = checkPointPositionList[marble.lastCheckPointIndex]
          const nextCheckPointPosition = checkPointPositionList[marble.lastCheckPointIndex + 1]

          const physicsBody = marble.mesh.physicsBody
          if (!physicsBody || !lastCheckPointPosition) {
            return
          }

          // 保險檢查
          if (lowestCheckPoint && !marble.isGrounded && marble.mesh.position.y < lowestCheckPoint.y - 50) {
            respawnWithAnimation(marble, lastCheckPointPosition)
            return
          }

          if (marble.finishedAt) {
            return
          }

          if (!nextCheckPointPosition) {
            return
          }

          // 靜止過久也拉回上一個檢查點
          if (marble.staticDurationSec > 3) {
            respawnWithAnimation(marble, lastCheckPointPosition)
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
              if (marble.finishedAt === 0) {
                marble.finishedAt = Date.now()
              }
            },
          ),
        )
      })
    })

    await nextFrame()

    isLoading.value = false
  },
})

useEventListener(canvasRef, 'webglcontextlost', (e) => {
  e.preventDefault()

  // eslint-disable-next-line no-alert
  alert('WebGL context lost, please try to reload the page')
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
  background: linear-gradient(180deg, #e3ffea, #d6d1ff)

.btn-content
  transform: scale(1)
  transition-duration: 0.4s
  transition-timing-function: cubic-bezier(0.545, 1.650, 0.520, 1.305)
  &.hover
    transform: scale(0.96) rotate(-2deg)
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1)
</style>

<style lang="sass">
.opacity
  &-enter-active, &-leave-active
    transition-duration: 0.4s !important
  &-enter-from, &-leave-to
    opacity: 0 !important
</style>
