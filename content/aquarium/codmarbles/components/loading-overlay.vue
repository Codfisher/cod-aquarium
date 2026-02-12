<template>
  <div class="flex flex-col items-center justify-center gap-20 loader">
    <div class="ball">
      <div
        ref="ballBody"
        class="ball__body"
      />
      <div
        ref="ballShadow"
        class="ball__shadow"
      />
    </div>

    <div
      ref="labelEl"
      class="text-white text-5xl label"
    >
      Loading...
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const ballRef = useTemplateRef('ballBody')
const ballShadowRef = useTemplateRef('ballShadow')
const labelRef = useTemplateRef('labelEl')

const animations: Animation[] = []

/** 使用 Web Animation API，即使 JS 忙碌也能保持流暢 */
onMounted(() => {
  const duration = 1000
  const common: KeyframeAnimationOptions = {
    duration,
    iterations: Infinity,
    easing: 'ease-in-out',
  }

  if (ballRef.value) {
    animations.push(
      ballRef.value.animate(
        [
          { top: '0px' },
          { top: '32.5px', offset: 0.45 },
          { top: '0px' },
        ],
        common,
      ),
      ballRef.value.animate(
        [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1)', offset: 0.3 },
          { transform: 'scale(1.2, 0.8)', offset: 0.5 },
          { transform: 'scale(0.85, 1.15)', offset: 0.75 },
          { transform: 'scale(1.05, 0.95)', offset: 0.84 },
          { transform: 'scale(0.98, 1.02)', offset: 0.95 },
          { transform: 'scale(1)', offset: 1 },
        ],
        common,
      ),
    )
  }

  if (ballShadowRef.value) {
    animations.push(
      ballShadowRef.value.animate(
        [
          { background: 'rgba(0, 0, 0, 0.2)', filter: 'blur(2px)', offset: 0 },
          { background: 'rgba(0, 0, 0, 0.1)', filter: 'blur(1px)', offset: 0.5 },
          { background: 'rgba(0, 0, 0, 0.2)', filter: 'blur(2px)', offset: 1 },
        ],
        common,
      ),
      ballShadowRef.value.animate(
        [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1)', offset: 0.3 },
          { transform: 'scale(1.2, 0.8)', offset: 0.5 },
          { transform: 'scale(0.85, 1.15)', offset: 0.7 },
          { transform: 'scale(1.05, 0.95)', offset: 0.8 },
          { transform: 'scale(0.98, 1.02)', offset: 0.9 },
          { transform: 'scale(1)', offset: 1 },
        ],
        common,
      ),
    )
  }

  if (labelRef.value) {
    animations.push(
      labelRef.value.animate(
        [
          { transform: 'translateY(0) scale(1)', offset: 0 },
          { transform: 'translateY(5px) scale(1.05, 0.95)', offset: 0.5 },
          { transform: 'translateY(0) scale(1)', offset: 1 },
        ],
        common,
      ),
    )
  }
})

onBeforeUnmount(() => {
  animations.forEach((a) => a.cancel())
  animations.length = 0
})
</script>

<style scoped lang="sass">
.loader
  background: linear-gradient(180deg, #e3ffea, #d6d1ff)

.ball
  $size: 100px
  position: relative
  width: $size
  height: $size

.ball__body
  $size: 100px
  position: absolute
  z-index: 2
  width: $size
  height: $size
  top: 0
  left: 0
  background: white
  border-radius: 50%

.ball__shadow
  position: absolute
  left: 10px
  top: 125px
  width: 80px
  height: 5px
  border-radius: 100%
  filter: blur(2px)

.label
  text-shadow: 0px 4px 4px rgba(#444, 0.2)
  color: white
  user-select: none
</style>
