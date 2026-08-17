<template>
  <div class="ambience-panel">
    <div
      v-auto-animate
      class="zone-block"
    >
      <div
        :key="zone ?? 'sand'"
        class="zone-content"
      >
        <div class="zone-label">
          <u-icon
            :name="zoneIcon"
            class="text-lg"
          />
          <span>{{ zoneName }}</span>
        </div>

        <div
          v-if="zoneTimbre"
          class="zone-timbre"
        >
          {{ zoneTimbre }}
        </div>
      </div>
    </div>

    <transition-group
      name="sound"
      tag="div"
      class="sound-list"
    >
      <!--
        每一條都是一個開關

        整片音景是十七座箱庭疊出來的，走到中間會同時聽見四五種聲音。
        有人是為了聽風來的，那幾聲蟬就成了雜訊——
        讓他關掉那一個，其餘的照舊
      -->
      <button
        v-for="sound in displayList"
        :key="sound.id"
        class="sound-item"
        :class="{ 'sound-item-muted': sound.isMuted }"
        :title="sound.isMuted ? t('unmuteHint') : t('muteHint')"
        @click="$emit('toggleMute', sound.id)"
      >
        <div class="sound-title">
          <u-icon
            :name="sound.isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
            class="sound-icon"
          />
          <span>{{ locale === 'en' ? sound.title.en : sound.title['zh-hant'] }}</span>
        </div>

        <div class="loudness-track">
          <div
            class="loudness-bar"
            :style="{ width: `${Math.round(sound.loudness * 100)}%` }"
          />
        </div>
      </button>
    </transition-group>

    <div
      v-if="displayList.length === 0"
      class="sound-empty"
    >
      {{ t('silence') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AudibleSound, SoundZone } from '../domains/soundscape/type'
import { vAutoAnimate } from '@formkit/auto-animate/vue'
import { computed } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import { GARDEN_LIST } from '../domains/garden/garden-layout'

const props = defineProps<{
  audibleList: AudibleSound[];
  /** 目前站在哪一座箱庭上，走在箱庭之間的白沙上時為 null */
  zone: SoundZone | null;
}>()

defineEmits<{
  /** 開關單一音源 */
  toggleMute: [id: string];
}>()

/** 最多列幾個，太多會蓋掉畫面 */
const MAX_DISPLAY_COUNT = 6

const displayList = computed(() => props.audibleList.slice(0, MAX_DISPLAY_COUNT))

/** 走在白沙上時顯示的圖示，一片留白 */
const SAND_ICON = 'i-material-symbols:blur-on'

const currentGarden = computed(() => (
  props.zone === null ? null : GARDEN_LIST.find((garden) => garden.id === props.zone) ?? null
))

const zoneIcon = computed(() => currentGarden.value?.icon ?? SAND_ICON)
const zoneName = computed(() => (
  currentGarden.value === null
    ? t('sandField')
    : (locale.value === 'en' ? currentGarden.value.title.en : currentGarden.value.title['zh-hant'])
))
const zoneTimbre = computed(() => (
  currentGarden.value === null
    ? null
    : (locale.value === 'en' ? currentGarden.value.timbre.en : currentGarden.value.timbre['zh-hant'])
))

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    sandField: '白沙之間',
    silence: '四下無聲⋯⋯往有聲音的方向走吧',
    muteHint: '關掉這個聲音',
    unmuteHint: '打開這個聲音',
  },
  'en': {
    sandField: 'Between the gardens',
    silence: 'All quiet... walk toward a sound',
    muteHint: 'Mute this sound',
    unmuteHint: 'Unmute this sound',
  },
} as const)
</script>

<style scoped lang="sass">
.ambience-panel
  position: absolute
  left: 16px
  top: 16px
  width: 210px
  padding: 10px 12px
  color: rgba(255, 255, 255, 0.92)
  background: rgba(0, 0, 0, 0.32)
  backdrop-filter: blur(6px)
  -webkit-backdrop-filter: blur(6px)
  border: 1px solid rgba(255, 255, 255, 0.16)
  pointer-events: none
  user-select: none
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8)

.zone-block
  padding-bottom: 8px
  margin-bottom: 8px
  border-bottom: 1px solid rgba(255, 255, 255, 0.16)

/**
 * 換箱庭的過場交給 auto-animate
 *
 * 手寫的 transition 只能淡入淡出內容本身，容器的高度是瞬間變的——
 * 各座箱庭的名稱與說明長度不一，底下那條分隔線與整份音源清單
 * 會跟著上下彈一下。auto-animate 會連同父容器的尺寸變化一起補間，
 * 換庭時整塊面板是平順地長高或縮短
 */

.zone-label
  display: flex
  align-items: center
  gap: 6px
  font-size: 15px
  font-weight: 700
  letter-spacing: 0.02em

/** 聲音性質的一句話，字級壓到與音源清單同一階 */
.zone-timbre
  margin-top: 3px
  font-size: 12px
  line-height: 1.4
  opacity: 0.72

.sound-list
  display: flex
  flex-direction: column

/**
 * 項目之間的距離用 padding 撐開，不用 gap
 *
 * 離場時要連同間距一起收合，gap 收不掉，
 * 消失的那一項會留下一道 7px 的空隙才彈掉
 */
.sound-item
  display: flex
  flex-direction: column
  gap: 3px
  padding: 0 0 7px
  overflow: hidden
  /**
   * 整份面板是 pointer-events: none 的
   *
   * 那是刻意的：漫遊時滑鼠被鎖在畫面上，面板不該攔截任何東西。
   * 只有這幾條開關要收回點擊——按 Tab 放開滑鼠之後才點得到，
   * 而那正是「停下來調整」的時機
   */
  pointer-events: auto
  /** 按鈕的預設樣式全部清掉，它看起來要跟原本那一列一模一樣 */
  appearance: none
  background: none
  border: none
  color: inherit
  font: inherit
  text-align: left
  cursor: pointer

.sound-item:hover .sound-title
  opacity: 1

.sound-item:hover .loudness-track
  background: rgba(255, 255, 255, 0.3)

/** 關掉的那一條整列壓暗，一眼看得出是自己關的而不是聽不到 */
.sound-item-muted .sound-title
  opacity: 0.42

.sound-item-muted .loudness-bar
  background: rgba(255, 255, 255, 0.24)

.sound-title
  display: flex
  align-items: center
  gap: 5px
  font-size: 12px
  opacity: 0.9
  transition: opacity 0.2s ease

.sound-icon
  flex: none
  font-size: 13px
  opacity: 0.8

.loudness-track
  height: 3px
  background: rgba(255, 255, 255, 0.18)
  overflow: hidden

.loudness-bar
  height: 100%
  background: rgba(160, 230, 190, 0.9)
  transition: width 0.35s ease-out

.sound-empty
  font-size: 12px
  opacity: 0.6

/**
 * 進出場靠高度收合，不用絕對定位
 *
 * 離場項目改成 position: absolute 是常見寫法，但定位基準會落在整個面板上，
 * 那一項會瞬間彈到面板左上角再淡出——也就是「跳到頂部」。
 * 這裡讓它原地把高度與間距收掉，下面的項目自然遞補上來
 */
.sound-enter-active, .sound-leave-active
  transition: opacity 0.35s ease, transform 0.35s ease, max-height 0.35s ease, padding-bottom 0.35s ease

.sound-enter-from, .sound-leave-to
  opacity: 0
  transform: translateX(-8px)
  max-height: 0
  padding-bottom: 0
  pointer-events: none

.sound-enter-to, .sound-leave-from
  max-height: 40px

/** 排序變動時平順滑過去，不要瞬間換位 */
.sound-move
  transition: transform 0.35s ease
</style>
