<template>
  <div class="frame">
    <div
      class="polygon"
      :style="style"
    />
  </div>
</template>

<script lang="ts">
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<Props>(), {
  size: '10rem',
  color: 'white',
  rotate: '0deg',
  opacity: 1,
  shape: 'round',
  fill: 'fence',
})

enum ShapeType {
  ROUND = 'round',
  TRIANGLE = 'triangle',
  SQUARE = 'square',
  PENTAGON = 'pentagon',
}

enum FillType {
  SOLID = 'solid',
  FENCE = 'fence',
  SPOT = 'spot',
}

interface Props {
  size?: string;
  color?: string;
  rotate?: string;
  opacity?: string | number;
  shape?: `${ShapeType}`;
  fill?: `${FillType}`;
}
const clipPathMap = {
  [ShapeType.ROUND]: `circle(50% at 50% 50%)`,
  [ShapeType.SQUARE]: `polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`,
  [ShapeType.TRIANGLE]: `polygon(50% 0%, 0% 100%, 100% 100%)`,
  [ShapeType.PENTAGON]: `polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)`,
}
const clipPath = computed(() => clipPathMap?.[props.shape] ?? clipPathMap[ShapeType.ROUND])

const fillMap = {
  [FillType.SOLID]: ``,
  [FillType.FENCE]: `url(/images/line.svg)`,
  [FillType.SPOT]: `url(/images/round.svg)`,
}
const fill = computed(() => fillMap?.[props.fill] ?? fillMap[FillType.SPOT])

const style = computed(() => ({
  width: props.size,
  height: props.size,
  backgroundColor: props.color,
  maskImage: fill.value,
  maskSize: `15%`,
  opacity: props.opacity,
  clipPath: clipPath.value,
  transform: `rotate(${props.rotate})`,
}))
</script>

<style scoped lang="sass">
</style>
