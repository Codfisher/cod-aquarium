<template>
  <div class="ambience-panel">
    <div class="zone-label">
      <u-icon
        :name="zoneIcon"
        class="text-lg"
      />
      <span>{{ zoneName }}</span>
    </div>

    <transition-group
      name="sound"
      tag="div"
      class="sound-list"
    >
      <div
        v-for="sound in displayList"
        :key="sound.id"
        class="sound-item"
      >
        <div class="sound-title">
          {{ locale === 'en' ? sound.title.en : sound.title['zh-hant'] }}
        </div>

        <div class="loudness-track">
          <div
            class="loudness-bar"
            :style="{ width: `${Math.round(sound.loudness * 100)}%` }"
          />
        </div>
      </div>
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
import { computed } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'

const props = defineProps<{
  audibleList: AudibleSound[];
  zone: SoundZone;
}>()

/** 最多列幾個，太多會蓋掉畫面 */
const MAX_DISPLAY_COUNT = 6

const displayList = computed(() => props.audibleList.slice(0, MAX_DISPLAY_COUNT))

const ZONE_ICON_MAP: Record<SoundZone, string> = {
  meadow: 'i-material-symbols:grass',
  forest: 'i-material-symbols:forest',
  alpine: 'i-material-symbols:landscape',
  swamp: 'i-material-symbols:water-drop',
  coast: 'i-material-symbols:waves',
  village: 'i-material-symbols:home-work',
  river: 'i-material-symbols:water',
  cave: 'i-material-symbols:dark-mode',
  pond: 'i-material-symbols:water-lux',
  rainvale: 'i-material-symbols:rainy',
}

const zoneIcon = computed(() => ZONE_ICON_MAP[props.zone])
const zoneName = computed(() => t(props.zone))

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    meadow: '中央草原',
    forest: '低語森林',
    alpine: '雪稜高地',
    swamp: '霧氣沼澤',
    coast: '環島海岸',
    village: '石橋村',
    river: '穿林河谷',
    cave: '地底洞窟',
    pond: '林間水塘',
    rainvale: '長雨谷',
    silence: '四下無聲⋯⋯走走看吧',
  },
  'en': {
    meadow: 'Central Meadow',
    forest: 'Whispering Forest',
    alpine: 'Snow Ridge',
    swamp: 'Misty Swamp',
    coast: 'Island Shore',
    village: 'Stonebridge Village',
    river: 'River Valley',
    cave: 'Underground Cavern',
    pond: 'Woodland Pond',
    rainvale: 'Everrain Vale',
    silence: 'All quiet... try wandering around',
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

.zone-label
  display: flex
  align-items: center
  gap: 6px
  font-size: 15px
  font-weight: 700
  letter-spacing: 0.02em
  padding-bottom: 8px
  margin-bottom: 8px
  border-bottom: 1px solid rgba(255, 255, 255, 0.16)

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
  padding-bottom: 7px
  overflow: hidden

.sound-title
  font-size: 12px
  opacity: 0.9

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

.sound-enter-to, .sound-leave-from
  max-height: 40px

/** 排序變動時平順滑過去，不要瞬間換位 */
.sound-move
  transition: transform 0.35s ease
</style>
