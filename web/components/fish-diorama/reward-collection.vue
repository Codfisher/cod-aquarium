<template>
  <!-- vp-raw：收藏冊的翻頁動畫不受 VitePress 的 reduced-motion 全域歸零影響 -->
  <div
    class="reward-collection vp-raw absolute inset-0 flex items-center justify-center"
    @click.self="emit('close')"
  >
    <div class="collection-book">
      <!-- 標題與統計吸頂：格子多到要捲動時，仍看得到自己收了幾件 -->
      <div class="book-sticky-header">
        <div class="book-header">
          <div class="book-title">
            鱈魚的收藏冊
          </div>
          <button
            type="button"
            class="book-close"
            aria-label="關閉收藏冊"
            @click="emit('close')"
          >
            <u-icon
              name="i-material-symbols:close-rounded"
              class="close-icon"
              aria-hidden="true"
            />
          </button>
        </div>
        <div class="book-summary">
          配件 {{ unlockedAccessoryCount }}/{{ accessoryList.length }}
        </div>
      </div>

      <div class="book-body">
        <div class="reward-grid">
          <button
            v-for="reward in accessoryList"
            :key="reward.id"
            type="button"
            class="reward-cell"
            :class="{
              'is-locked': !unlockedRewardIdSet.has(reward.id),
              'is-equipped': equippedRewardIdSet.has(reward.id),
            }"
            :disabled="!unlockedRewardIdSet.has(reward.id)"
            @click="toggleAccessory(reward.id)"
          >
            <u-icon
              :name="unlockedRewardIdSet.has(reward.id)
                ? 'i-material-symbols:styler-outline-rounded'
                : 'i-material-symbols:lock'"
              class="cell-icon"
              aria-hidden="true"
            />
            <div class="cell-name">
              {{ unlockedRewardIdSet.has(reward.id) ? reward.name : '???' }}
            </div>
            <div class="cell-note">
              {{ unlockedRewardIdSet.has(reward.id) ? reward.description : reward.lockedHint }}
            </div>
            <div
              v-if="equippedRewardIdSet.has(reward.id)"
              class="cell-badge"
            >
              穿戴中
            </div>
          </button>
        </div>

        <div class="book-section-title">
          最佳紀錄
        </div>
        <div class="record-list">
          <div
            v-for="meta in miniGameMetaList"
            :key="meta.id"
            class="record-row"
          >
            <span class="record-name">{{ meta.title }}</span>
            <span class="record-score">
              {{ bestScoreMap[meta.id] ?? 0 }} {{ meta.scoreUnit }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MiniGameId } from './games/game-contract'
import type { RewardId } from './rewards/reward-registry'
import { computed } from 'vue'
import { miniGameIdList, miniGameMetaMap } from './games/game-registry'
import { rewardDefinitionList } from './rewards/reward-registry'

const props = defineProps<{
  unlockedRewardIdList: RewardId[];
  equippedRewardIdList: RewardId[];
  bestScoreMap: Partial<Record<MiniGameId, number>>;
}>()

const emit = defineEmits<{
  close: [];
  equip: [rewardId: RewardId];
  unequip: [rewardId: RewardId];
}>()

const accessoryList = rewardDefinitionList
const miniGameMetaList = miniGameIdList.map((gameId) => miniGameMetaMap[gameId])

const unlockedRewardIdSet = computed(() => new Set(props.unlockedRewardIdList))
const equippedRewardIdSet = computed(() => new Set(props.equippedRewardIdList))

const unlockedAccessoryCount = computed(() => (
  accessoryList.filter((reward) => unlockedRewardIdSet.value.has(reward.id)).length
))

function toggleAccessory(rewardId: RewardId) {
  if (!unlockedRewardIdSet.value.has(rewardId)) {
    return
  }
  // 分開兩行寫：事件名用三元運算合併時，TypeScript 會把 emit 的多載判定成不相容
  if (equippedRewardIdSet.value.has(rewardId)) {
    emit('unequip', rewardId)
    return
  }
  emit('equip', rewardId)
}
</script>

<style scoped lang="sass">
.reward-collection
  z-index: 30
  background: light-dark(rgba(245, 239, 226, 0.72), rgba(20, 26, 33, 0.78))
  backdrop-filter: blur(3px)

.collection-book
  width: min(420px, 88%)
  max-height: 86%
  overflow-y: auto
  border-radius: 16px
  color: light-dark(oklch(0.38 0.05 210), oklch(0.9 0.02 210))
  background-color: light-dark(rgba(255, 253, 247, 0.98), rgba(34, 43, 50, 0.98))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.24), rgba(255, 255, 255, 0.14))
  box-shadow: 0 14px 40px light-dark(rgba(27, 42, 51, 0.26), rgba(0, 0, 0, 0.55))

// 吸頂區：捲動容器本身不設 padding，內距由 header 與 book-body 各自負責。
// 若改用「容器 padding + 負 margin 外擴」的寫法，Chrome 會把帶負 margin 的 sticky 元素往下錯位，header 反而壓到格子
.book-sticky-header
  position: sticky
  top: 0
  z-index: 1
  padding: 18px 20px 10px
  background-color: light-dark(rgba(255, 253, 247, 0.98), rgba(34, 43, 50, 0.98))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
  border-bottom: 1px solid light-dark(rgba(62, 95, 82, 0.16), rgba(255, 255, 255, 0.1))

.book-header
  display: flex
  align-items: center
  justify-content: space-between

.book-title
  font-size: 16px
  font-weight: 600
  letter-spacing: 4px
  text-indent: 4px

.book-close
  appearance: none
  display: flex
  align-items: center
  justify-content: center
  width: 26px
  height: 26px
  border: none
  border-radius: 999px
  cursor: pointer
  color: inherit
  background: transparent
  opacity: 0.6
  transition: opacity 0.2s, background 0.2s

  &:hover
    opacity: 1
    background: light-dark(rgba(27, 42, 51, 0.07), rgba(255, 255, 255, 0.08))

.close-icon
  font-size: 18px

.book-summary
  margin-top: 4px
  font-size: 12px
  letter-spacing: 1px
  opacity: 0.6

.book-body
  padding: 10px 20px 20px

.book-section-title
  margin-top: 16px
  margin-bottom: 8px
  font-size: 12px
  font-weight: 600
  letter-spacing: 3px
  opacity: 0.55

.reward-grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(124px, 1fr))
  gap: 8px

.reward-cell
  appearance: none
  position: relative
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: 3px
  padding: 10px 11px 11px
  border-radius: 10px
  text-align: left
  font-family: inherit
  cursor: pointer
  color: inherit
  border: 1px solid light-dark(rgba(62, 95, 82, 0.2), rgba(255, 255, 255, 0.12))
  background: light-dark(rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.04))
  transition: transform 0.15s, border-color 0.2s, background 0.2s

  &:not(:disabled):hover
    transform: translateY(-2px)
    border-color: light-dark(rgba(62, 95, 82, 0.4), rgba(255, 255, 255, 0.28))

  // 未解鎖：留著格子讓玩家看得到還有什麼可拿，但降低存在感
  &.is-locked
    cursor: default
    opacity: 0.42

  &.is-equipped
    border-color: light-dark(#4f9ac2, #6bb0d4)
    background: light-dark(rgba(79, 154, 194, 0.12), rgba(107, 176, 212, 0.16))

.cell-icon
  font-size: 18px
  color: light-dark(#c9932f, #e8b54a)

.cell-name
  font-size: 13px
  font-weight: 600
  letter-spacing: 1px

.cell-note
  font-size: 12px
  line-height: 1.55
  opacity: 0.66

.cell-badge
  position: absolute
  top: 8px
  right: 8px
  padding: 1px 6px
  border-radius: 999px
  font-size: 12px
  letter-spacing: 0.5px
  color: #fff
  background: light-dark(#4f9ac2, #3d7ba0)

.record-list
  display: flex
  flex-direction: column
  gap: 4px

.record-row
  display: flex
  align-items: baseline
  justify-content: space-between
  gap: 10px
  padding: 5px 2px
  border-bottom: 1px dashed light-dark(rgba(62, 95, 82, 0.16), rgba(255, 255, 255, 0.1))
  font-size: 13px

.record-name
  letter-spacing: 1px
  opacity: 0.8

.record-score
  font-variant-numeric: tabular-nums
  font-weight: 600
</style>
