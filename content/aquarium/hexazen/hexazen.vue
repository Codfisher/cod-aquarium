<template>
  <u-app
    :toaster="{
      ui: {
        base: 'chamfer-2 chamfer-border-0.25 bg-gray-200',
      },
    }"
  >
    <div class="fixed w-dvw h-dvh m-0 p-3 bg-gray-50">
      <div
        class="w-full h-full chamfer-5 relative"
        :style="canvasStyle"
      >
        <main-scene
          ref="mainSceneRef"
          class="w-full h-full"
          :placed-block-map="placedBlockMap"
          :is-edit-mode="isEditMode"
          :is-shared-view="isSharedView"
          :is-remove-mode="isRemoveMode"
          :weather="weather"
          :trait-region-list="traitRegionList"
          @open-block-picker="blockPickerVisible = true"
          @close-block-picker="blockPickerVisible = false"
          @ready="restoreSharedView()"
        />

        <transition
          name="fade"
          mode="out-in"
        >
          <div
            v-if="isEditMode && !isSharedView"
            class="absolute right-0 bottom-0 p-5 space-y-6 text-gray-600 btn-drop-shadow opacity-50"
          >
            <u-tooltip
              text="Remove Mode"
              :content="{
                side: 'left',
              }"
            >
              <u-icon
                name="i-mingcute:shovel-fill"
                class="text-3xl cursor-pointer duration-500 outline-0 "
                :class="{
                  'text-primary': isRemoveMode,
                }"
                @click="toggleRemoveMode()"
              />
            </u-tooltip>

            <u-popover
              :ui="{
                content: 'chamfer-3 bg-gray-200 p-0.5',
              }"
            >
              <u-tooltip
                text="Remove all blocks"
                :content="{
                  side: 'left',
                }"
              >
                <u-icon
                  name="tdesign:clear-formatting-1-filled"
                  class="text-3xl cursor-pointer duration-500 outline-0 scale-90"
                />
              </u-tooltip>

              <template #content="{ close }">
                <div class="chamfer-2.5 bg-white">
                  <div class="p-4 space-y-2 ">
                    <div class=" font-bold">
                      Confirm to remove all blocks?
                    </div>
                    <div class=" text-sm">
                      This action can't be undone
                    </div>

                    <div class="flex justify-end">
                      <base-btn
                        label="Remove All"
                        color="error"
                        @click="removeAllBlocks(); close()"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </u-popover>

            <u-separator
              size="sm"
              :ui="{ border: 'border-gray-300' }"
              class="py-1"
            />

            <u-tooltip
              text="Close edit mode"
              :content="{
                side: 'left',
              }"
            >
              <u-icon
                name="i-line-md:arrow-small-left"
                class="text-3xl cursor-pointer duration-500 outline-0"
                @click="toggleEditMode()"
              />
            </u-tooltip>
          </div>

          <div
            v-else-if="!isSharedView"
            class="absolute right-0 bottom-0 p-5 space-y-6 text-gray-600 btn-drop-shadow opacity-50"
          >
            <u-tooltip
              v-if="!isSharedView"
              text="Share your soundscape with others"
              :content="{
                side: 'right',
              }"
            >
              <u-icon
                name="i-material-symbols:share"
                class="text-3xl cursor-pointer outline-0 "
                @click="handleShare()"
              />
            </u-tooltip>

            <u-tooltip
              text="Edit Mode"
              :content="{
                side: 'left',
              }"
            >
              <u-icon
                name="i-material-symbols:edit-rounded"
                class="text-3xl cursor-pointer duration-500 outline-0"
                @click="toggleEditMode()"
              />
            </u-tooltip>
          </div>
        </transition>

        <div class="absolute left-0 bottom-0 p-5 space-y-6 duration-500 text-gray-600 btn-drop-shadow opacity-50">
          <u-slider
            v-model="globalVolume"
            orientation="vertical"
            :min="0"
            :max="10"
            :step="0.1"
            :ui="{
              track: 'bg-gray-300',
              range: 'bg-gray-500',
              thumb: ' ring-gray-600 bg-white',
            }"
            class="h-30"
          />

          <u-icon
            :name="isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
            class="text-3xl cursor-pointer outline-0 "
            @click="toggleMuted()"
          />

          <u-tooltip
            :text="weatherModeInfo.tooltip"
            :content="{
              side: 'right',
            }"
          >
            <div>
              <transition
                name="fade"
                mode="out-in"
              >
                <u-icon
                  :key="weatherModeInfo.icon"
                  :name="weatherModeInfo.icon"
                  class="text-3xl cursor-pointer duration-500 outline-0"
                  @click="nextWeatherMode()"
                />
              </transition>
            </div>
          </u-tooltip>

          <bulletin-modal v-model:open="bulletinVisible">
            <u-icon
              name="material-symbols:notifications-rounded"
              class="text-3xl cursor-pointer outline-0 "
            />
          </bulletin-modal>
        </div>
      </div>

      <div class=" absolute bottom-0 right-0 p-1 opacity-20 text-[8px]">
        v{{ version }}
      </div>
    </div>

    <!-- u-slideover 開啟動畫不穩動，不知道為甚麼會抖動 -->
    <div
      class=" fixed bottom-0 left-0 right-0 flex justify-center p-10 duration-300 ease-in-out pointer-events-none"
      :class="{
        'translate-y-0': blockPickerVisible,
        'translate-y-full': !blockPickerVisible,
      }"
    >
      <block-picker
        class="max-w-[80dvw] md:max-w-[70dvw] pointer-events-auto"
        @select="handleSelectBlock"
      />
    </div>

    <transition name="fade">
      <div
        v-if="isMuted && !isRestoringView"
        class="fixed inset-0 pointer-events-none w-full h-full flex flex-col gap-4 items-center justify-center p-10"
      >
        <div class="flex flex-col gap-4 items-center justify-center  text-white bg-black/30 p-10 chamfer-5">
          <u-icon
            name="i-mingcute:volume-mute-fill"
            class="text-[4rem]"
          />

          <div class="text-xl flex justify-center items-center gap-2">
            <u-icon
              name="i-line-md:arrow-small-left"
              class="text-[3rem] -rotate-45"
            />
            Your speakers are taking a nap. Wake 'em up!
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div
        v-if="isRestoringView"
        class="fixed inset-0"
      >
        <div
          class="w-full h-full flex flex-col gap-4 items-center justify-center bg-gray-50/50 backdrop-blur-2xl text-white"
        >
          <u-icon
            name="i-line-md:loading-twotone-loop"
            class="text-[4rem]"
          />

          <div class="text-xl">
            Unpacking blocks...
          </div>
        </div>
      </div>
    </transition>
  </u-app>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { Block, BlockType } from './domains/block/type'
import type { Weather } from './types'
import { promiseTimeout, useColorMode, useCycleList, useIntervalFn, useToggle } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, ref, shallowReactive, useTemplateRef } from 'vue'
import { cursorDataUrl } from '../meme-cache/constants'
import BaseBtn from './components/base-btn.vue'
import BulletinModal from './components/bulletin-modal.vue'
import { useFontLoader } from './composables/use-font-loader'
import { version } from './constants'
import BlockPicker from './domains/block/block-picker.vue'
import { decodeBlocks, encodeBlocks } from './domains/share/codec'
import { useSoundscapePlayer } from './domains/soundscape/player/use-soundscape-player'
import MainScene from './main-scene.vue'

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()

const sharedViewEncodedData = pipe(
  // 因為 whyframe 隔離，需要從 parent 取得 URL
  new URLSearchParams(window.parent.location.search || window.location.search),
  (urlParams) => urlParams.get('view'),
)
const isSharedView = !!sharedViewEncodedData

const bulletinVisible = ref(!isSharedView)

const {
  state: weatherMode,
  next: nextWeatherMode,
} = useCycleList<
  Weather | undefined | 'random-rain'
>([
  undefined,
  'rain',
  'random-rain',
])
useIntervalFn(() => {
  // 每 5 分鐘隨機一次
  if (weatherMode.value === 'random-rain') {
    currentWeather.value = Math.random() < 0.5 ? 'rain' : undefined
  }
}, 1000 * 60 * 5)

const weatherModeInfo = computed(() => {
  switch (weatherMode.value) {
    case undefined:
      return {
        icon: 'material-symbols:sunny',
        tooltip: `Sun's Out!`,
      }
    case 'rain':
      return {
        icon: 'material-symbols:rainy',
        tooltip: 'Cozy Weather',
      }
    default:
      return {
        icon: 'material-symbols:partly-cloudy-day-rounded',
        tooltip: 'Surprise Showers',
      }
  }
})
const currentWeather = ref<Weather | undefined>()
const weather = computed<Weather | undefined>(() => {
  if (weatherMode.value === 'random-rain') {
    return currentWeather.value
  }
  return weatherMode.value
})

const [isEditMode, toggleEditMode] = useToggle(true)
const [isRemoveMode, toggleRemoveMode] = useToggle(false)
const [isMuted, toggleMuted] = useToggle(isSharedView)

const globalVolume = ref(3)

// --- 共用狀態 ---

const placedBlockMap = shallowReactive(new Map<string, Block>())
const mainSceneRef = useTemplateRef<InstanceType<typeof MainScene>>('mainSceneRef')

// --- Block Picker ---

const blockPickerVisible = ref(false)

function handleSelectBlock(blockType: BlockType) {
  mainSceneRef.value?.handleSelectBlock(blockType)
}

async function removeAllBlocks() {
  await mainSceneRef.value?.removeAllBlocks()
}

// --- Soundscape ---

const {
  traitRegionList,
  activePlayerMap,
} = useSoundscapePlayer(placedBlockMap, {
  muted: isMuted,
  volume: globalVolume,
  weather,
})

// --- 分享功能 ---

const toast = useToast()

async function handleShare() {
  const sharedBlocks = Array.from(placedBlockMap.values()).map((block) => {
    const rotationStep = Math.round(block.rootNode.rotation.y / (Math.PI / 3))
    const rotation = ((rotationStep % 6) + 6) % 6

    return {
      type: block.type,
      hex: block.hex,
      rotation,
    }
  })

  if (sharedBlocks.length === 0) {
    toast.add({
      title: 'Nothing to share',
      description: 'Place some blocks first!',
      icon: 'i-mingcute:information-line',
    })
    return
  }

  const encoded = encodeBlocks(sharedBlocks)
  const url = new URL(window.parent.location.href || window.location.href)
  url.searchParams.set('view', encoded)

  await navigator.clipboard.writeText(url.toString())
  toast.add({
    title: 'Link copied!',
    description: 'Share this link so others can enjoy your soundscape.',
    icon: 'i-material-symbols:check-circle',
  })
}

// --- 還原分享檢視 ---

const isRestoringView = ref(false)
const startedAt = new Date().getTime()
async function restoreSharedView() {
  if (!sharedViewEncodedData)
    return

  isRestoringView.value = true
  try {
    const sharedBlocks = decodeBlocks(sharedViewEncodedData)

    const tasks = sharedBlocks.map(({ type, hex, rotation }) => {
      return mainSceneRef.value!.spawnBlock(type, hex).then((block) => {
        block.rootNode.rotation.y = rotation * (Math.PI / 3)
      })
    })

    await Promise.all(tasks)
  }
  catch (error) {
    console.error('Failed to restore shared view:', error)
    toast.add({
      title: 'Failed to restore shared view',
      description: 'The link may be invalid or corrupted.',
      icon: 'i-material-symbols:error-outline',
      duration: 0,
      color: 'error',
    })
  }
  finally {
    await promiseTimeout(Math.max(3000, new Date().getTime() - startedAt))
    isRestoringView.value = false
  }
}

// --- 游標樣式 ---

const canvasStyle = computed<CSSProperties>(() => {
  const isRotating = mainSceneRef.value?.hoveredBlock
  if (isRotating) {
    if (isRemoveMode.value) {
      return {
        cursor: cursorDataUrl.shovelFill,
      }
    }

    return {
      cursor: cursorDataUrl.rotate,
    }
  }

  const isPointer = mainSceneRef.value?.hoveredTile

  return {
    cursor: isPointer ? 'pointer' : 'default',
  }
})
</script>

<style lang="sass" scoped>
.btn-drop-shadow
  filter: drop-shadow(0px 0px 1px rgba(255, 255, 255, 1)) drop-shadow(0px 0px 2px rgba(255, 255, 255, 1)) drop-shadow(0px 0px 4px rgba(255, 255, 255, 0.6))
</style>

<style lang="sass">
.fade
  &-enter-active, &-leave-active
    transition-duration: 0.4s !important
  &-enter-from, &-leave-to
    opacity: 0 !important
    scale: 0.95 !important
</style>
