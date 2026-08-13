<template>
  <div class="dev-panel">
    <div class="dev-title">
      <span>效果開關</span>
      <button
        class="dev-reset"
        @click="resetAll()"
      >
        全開
      </button>
    </div>

    <button
      v-for="item in toggleList"
      :key="item.key"
      class="dev-row"
      :class="{ 'dev-row-off': !state[item.key] }"
      @click="toggle(item.key)"
    >
      <span class="dev-mark">{{ state[item.key] ? '■' : '□' }}</span>
      <span>{{ item.label }}</span>
    </button>

    <div class="dev-hint">
      按 Tab 放開滑鼠才點得到
    </div>
  </div>
</template>

<script setup lang="ts">
import { DEV_TOGGLE_LIST, useDevToggles } from '../composables/use-dev-toggles'

const { state, toggle, resetAll } = useDevToggles()
const toggleList = DEV_TOGGLE_LIST
</script>

<style scoped lang="sass">
/**
 * 除錯面板要點得到
 *
 * 音景那份面板是 pointer-events: none 的，因為漫遊時滑鼠鎖在畫面上。
 * 這一份相反：它存在的意義就是被點。按 Tab 放開滑鼠之後，
 * 世界照樣在跑、太陽照樣在走，可以一邊看著畫面一邊開關
 */
.dev-panel
  position: absolute
  right: 12px
  bottom: 12px
  z-index: 30
  display: flex
  flex-direction: column
  gap: 1px
  padding: 8px 10px
  min-width: 150px
  background: rgba(0, 0, 0, 0.55)
  border: 1px solid rgba(255, 255, 255, 0.18)
  color: rgba(255, 255, 255, 0.9)
  font-family: ui-monospace, monospace
  font-size: 12px
  pointer-events: auto
  user-select: none

.dev-title
  display: flex
  align-items: center
  justify-content: space-between
  gap: 8px
  padding-bottom: 5px
  margin-bottom: 4px
  border-bottom: 1px solid rgba(255, 255, 255, 0.18)
  font-weight: 700

.dev-reset
  appearance: none
  padding: 1px 6px
  background: rgba(255, 255, 255, 0.12)
  border: 1px solid rgba(255, 255, 255, 0.2)
  color: inherit
  font: inherit
  font-weight: 400
  cursor: pointer

.dev-reset:hover
  background: rgba(255, 255, 255, 0.22)

.dev-row
  display: flex
  align-items: center
  gap: 7px
  padding: 2px 0
  appearance: none
  background: none
  border: none
  color: inherit
  font: inherit
  text-align: left
  cursor: pointer

.dev-row:hover
  color: #fff

/** 關掉的那一列整列壓暗，掃一眼就看得出現在關著哪幾項 */
.dev-row-off
  opacity: 0.4

.dev-mark
  flex: none
  width: 1em
  color: #8ACA8A

.dev-row-off .dev-mark
  color: rgba(255, 255, 255, 0.6)

.dev-hint
  margin-top: 6px
  padding-top: 5px
  border-top: 1px solid rgba(255, 255, 255, 0.18)
  font-size: 11px
  opacity: 0.55
</style>
