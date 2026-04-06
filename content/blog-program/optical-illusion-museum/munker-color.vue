<template>
  <svg
    viewBox="0 0 420 300"
    class="w-full max-w-md mx-auto"
  >
    <defs>
      <!-- 球體光澤漸層 -->
      <radialGradient id="sphere-shading" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stop-color="white" stop-opacity="0.25" />
        <stop offset="100%" stop-color="black" stop-opacity="0.15" />
      </radialGradient>

      <!-- 左球裁切 -->
      <clipPath id="left-sphere-clip">
        <circle cx="120" cy="150" r="95" />
      </clipPath>

      <!-- 右球裁切 -->
      <clipPath id="right-sphere-clip">
        <circle cx="300" cy="150" r="95" />
      </clipPath>
    </defs>

    <!-- 背景：紫黃交替水平條紋 -->
    <rect width="420" height="300" fill="#cc44cc" />
    <rect
      v-for="i in bgStripeCount"
      :key="`bg-${i}`"
      x="0"
      :y="(i - 1) * stripeSpacing * 2 + stripeSpacing"
      width="420"
      :height="stripeSpacing"
      fill="#ddcc11"
    />

    <!-- 左球底色 -->
    <circle cx="120" cy="150" r="95" :fill="targetColor" />

    <!-- 左球條紋（紫色） -->
    <g clip-path="url(#left-sphere-clip)">
      <rect
        v-for="i in sphereStripeCount"
        :key="`left-stripe-${i}`"
        x="0"
        :y="(i - 1) * stripeSpacing * 2"
        width="420"
        :height="stripeSpacing"
        fill="#cc44cc"
        :transform="`translate(${-progress * 500}, 0)`"
        class="transition-transform duration-50"
      />
    </g>

    <!-- 左球光澤 -->
    <circle cx="120" cy="150" r="95" fill="url(#sphere-shading)" />

    <!-- 右球底色 -->
    <circle cx="300" cy="150" r="95" :fill="targetColor" />

    <!-- 右球條紋（黃色） -->
    <g clip-path="url(#right-sphere-clip)">
      <rect
        v-for="i in sphereStripeCount"
        :key="`right-stripe-${i}`"
        x="0"
        :y="(i - 1) * stripeSpacing * 2"
        width="420"
        :height="stripeSpacing"
        fill="#ddcc11"
        :transform="`translate(${progress * 500}, 0)`"
        class="transition-transform duration-50"
      />
    </g>

    <!-- 右球光澤 -->
    <circle cx="300" cy="150" r="95" fill="url(#sphere-shading)" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const targetColor = '#66cccc'
const stripeSpacing = 6
const bgStripeCount = Math.ceil(300 / (stripeSpacing * 2))
const sphereStripeCount = Math.ceil(300 / (stripeSpacing * 2)) + 1
</script>
