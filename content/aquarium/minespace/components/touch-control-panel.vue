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

    <button
      class="control-button menu-button"
      @click="$emit('menu')"
    >
      <UIcon
        name="i-pixelarticons:menu"
        class="text-3xl"
      />
    </button>

    <div class="right-group">
      <button
        class="control-button sprint-button"
        @touchstart.prevent="$emit('sprint', true)"
        @touchend.prevent="$emit('sprint', false)"
        @touchcancel.prevent="$emit('sprint', false)"
      >
        <UIcon
          name="i-pixelarticons:chevron-right"
          class="text-3xl"
        />
      </button>

      <button
        class="control-button jump-button"
        @touchstart.prevent="$emit('jump', true)"
        @touchend.prevent="$emit('jump', false)"
        @touchcancel.prevent="$emit('jump', false)"
      >
        <UIcon
          name="i-pixelarticons:arrow-up"
          class="text-4xl"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  joystickActive: boolean;
  joystickOrigin: { x: number; y: number };
  joystickOffset: { x: number; y: number };
}>()

defineEmits<{
  jump: [pressed: boolean];
  sprint: [pressed: boolean];
  menu: [];
}>()
</script>

<style scoped lang="sass">
.touch-control-panel
  position: absolute
  inset: 0
  pointer-events: none
  z-index: 30
  user-select: none
  -webkit-user-select: none

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

.menu-button
  position: absolute
  right: 16px
  top: 16px

.right-group
  position: absolute
  right: 16px
  bottom: 28px
  display: flex
  flex-direction: column
  align-items: center
  gap: 14px

.jump-button
  width: 76px
  height: 76px
</style>
