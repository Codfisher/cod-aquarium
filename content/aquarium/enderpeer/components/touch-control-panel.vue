<template>
  <div class="touch-control-panel">
    <!-- 虛擬搖桿 -->
    <div
      class="joystick-base"
      :style="{
        left: `${joystickOrigin.x}px`,
        top: `${joystickOrigin.y}px`,
        opacity: joystickActive ? 1 : 0.2,
      }"
    >
      <div
        class="joystick-thumb"
        :style="{
          transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)`,
        }"
      />
    </div>

    <!-- 左上角按鈕群 (傳送、挖掘) -->
    <div class="top-left-group space-y-4">
      <!-- 傳送按鈕 -->
      <button
        class="control-button"
        @touchstart.prevent="setTeleport(true)"
        @touchend.prevent="setTeleport(false)"
        @touchcancel.prevent="setTeleport(false)"
      >
        <u-icon
          name="i-pixelarticons:gps"
          class="text-3xl"
        />
      </button>

      <!-- 動作按鈕（挖掘/放置） -->
      <button
        class="control-button size-18!"
        @touchstart.prevent="setAction(true)"
        @touchend.prevent="setAction(false)"
        @touchcancel.prevent="setAction(false)"
      >
        <u-icon
          v-if="hasBlock"
          name="i-pixelarticons:corner-right-down"
          class="text-4xl"
        />
        <u-icon
          v-else
          name="i-pixelarticons:corner-right-up"
          class="text-4xl"
        />
      </button>
    </div>

    <!-- 右上角按鈕 (選單) -->
    <div class="top-right-group">
      <button
        class="control-button"
        @click="emit('menu')"
      >
        <u-icon
          name="i-pixelarticons:menu"
          class="text-4xl"
        />
      </button>
    </div>

    <!-- 右側按鈕群 -->
    <div class="button-group-right">
      <!-- 跳躍按鈕 -->
      <button
        class="control-button size-20!"
        @touchstart.prevent="setJump(true)"
        @touchend.prevent="setJump(false)"
        @touchcancel.prevent="setJump(false)"
      >
        <u-icon
          name="i-pixelarticons:arrow-up"
          class="text-5xl"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'

const props = defineProps<{
  joystickActive: boolean;
  joystickOrigin: { x: number; y: number };
  joystickOffset: { x: number; y: number };
  hasBlock: boolean;
}>()

const emit = defineEmits<{
  jump: [pressed: boolean];
  sprint: [pressed: boolean];
  action: [pressed: boolean];
  teleport: [pressed: boolean];
  menu: [];
}>()

const { joystickActive, joystickOrigin, joystickOffset } = toRefs(props)

function setJump(pressed: boolean) {
  emit('jump', pressed)
}

function setSprint(pressed: boolean) {
  emit('sprint', pressed)
}

function setAction(pressed: boolean) {
  emit('action', pressed)
}

function setTeleport(pressed: boolean) {
  emit('teleport', pressed)
}
</script>

<style scoped lang="sass">
.touch-control-panel
  position: absolute
  inset: 0
  pointer-events: none
  z-index: 30
  user-select: none
  -webkit-user-select: none

// ── 搖桿 ──

.joystick-base
  position: fixed
  width: 120px
  height: 120px
  border-radius: 50%
  background: rgba(255, 255, 255, 0.1)
  border: 2px solid rgba(255, 255, 255, 0.2)
  transform: translate(-50%, -50%)
  pointer-events: none

.joystick-thumb
  position: absolute
  top: 50%
  left: 50%
  width: 44px
  height: 44px
  border-radius: 50%
  background: rgba(255, 255, 255, 0.35)
  border: 2px solid rgba(255, 255, 255, 0.5)
  margin-left: -22px
  margin-top: -22px
  transition: none

// ── 按鈕共用 ──

.control-button
  pointer-events: auto
  width: 56px
  height: 56px
  border-radius: 50%
  background: rgba(255, 255, 255, 0.12)
  border: 2px solid rgba(255, 255, 255, 0.25)
  color: rgba(255, 255, 255, 0.7)
  display: flex
  align-items: center
  justify-content: center
  backdrop-filter: blur(4px)
  -webkit-backdrop-filter: blur(4px)
  touch-action: none

  &:active
    background: rgba(255, 255, 255, 0.3)
    border-color: rgba(255, 255, 255, 0.5)

  .i-material-symbols-target,
  .i-material-symbols-inventory-2,
  .i-material-symbols-mining,
  .i-material-symbols-menu,
  .i-material-symbols-arrow-upward
    width: 24px
    height: 24px

// ── 左上/右上按鈕群 ──

.top-left-group
  position: absolute
  left: 16px
  top: 16px
  pointer-events: auto

.top-right-group
  position: absolute
  right: 16px
  top: 16px
  pointer-events: auto

// ── 右側按鈕群 ──

.button-group-right
  position: absolute
  right: 16px
  bottom: 24px
  display: flex
  flex-direction: column
  gap: 12px
  pointer-events: auto

// ── 動作按鈕 ──

.action-button
  width: 64px
  height: 64px
</style>
