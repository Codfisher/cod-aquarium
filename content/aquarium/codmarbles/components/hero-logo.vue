<template>
  <div class=" relative leading-none">
    <div
      ref="titleDiv"
      class=" flex flex-col justify-center items-center text-white pb-20"
    >
      <div class=" text-[3rem] md:text-[6rem] font-game jelly-bounce">
        CodMarbles
      </div>
    </div>

    <!-- stroke -->
    <div
      class=" absolute top-0 flex flex-col justify-center items-center stroke-color"
      :style="strokeStyle"
      v-html="titleDiv?.innerHTML"
    />

    <svg
      version="1.1"
      style="display: none;"
    >
      <defs>
        <filter :id="svgFilterId">
          <feMorphology
            operator="dilate"
            :radius="radius"
          />
          <feComposite
            operator="xor"
            in="SourceGraphic"
          />
        </filter>
      </defs>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { nanoid } from 'nanoid'
import { computed, ref } from 'vue'

const titleDiv = ref<HTMLDivElement>()

const svgFilterId = `svg-filter-${nanoid()}`
const strokeStyle = computed(() => {
  return {
    filter: `url(#${svgFilterId})`,
  }
})

const radius = computed(() => {
  return 6
})
</script>

<style scoped lang="sass">
.font-game
  font-family: 'Titan One'

// 避免顏色顏色覆蓋外框艷色
.stroke-color
  color: #4a3410
  span
    color: #4a3410

.jelly-bounce
  animation: jelly-bounce 3.2s infinite
  transform-origin: 50% 100%

@keyframes jelly-bounce
  0%, 70%, 100%
    transform: scale( 1 )
  75%
    transform: scale( 1.2, 0.8 )
  80%
    transform: scale( 0.85, 1.15 )
  85%
    transform: scale( 1.05, 0.95 )
  90%
    transform: scale( 0.98, 1.02 )
  95%
    transform: scale( 1.01, 0.99 )

.joy-bounce
  animation: joy-bounce 1s infinite
  transform-origin: 50% 100%

@keyframes joy-bounce
  0%, 100%
    transform: scale( 1 )
    animation-timing-function: cubic-bezier(0.895, 0.030, 0.685, 0.220)
  50%
    transform: scale( 1.05, 0.9 )
    animation-timing-function: cubic-bezier(0.165, 0.840, 0.440, 1.000)
</style>
