<template>
  <div
    class="custom-img"
    :class="class"
  >
    <nuxt-img
      :src="refinedSrc"
      :alt="alt"
      :width="width"
      :height="height"
      :format="format"
      quality="80"
      sizes="100px sm:300px md:600px"
      :class="class"
    ></nuxt-img>
  </div>
</template>

<script setup lang="ts">
import { withTrailingSlash, withLeadingSlash, joinURL } from 'ufo'
import { useRuntimeConfig, computed } from '#imports'


const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  class: {
    type: String,
    default: 'rounded-lg'
  },
  alt: {
    type: String,
    default: ''
  },
  width: {
    type: [String, Number],
    default: 600
  },
  height: {
    type: [String, Number],
    default: undefined
  },
  format: {
    type: String,
    default: 'webp'
  },
})

const refinedSrc = computed(() => {
  if (props.src?.startsWith('/') && !props.src.startsWith('//')) {
    const _base = withLeadingSlash(withTrailingSlash(useRuntimeConfig().app.baseURL))
    if (_base !== '/' && !props.src.startsWith(_base)) {
      return joinURL(_base, props.src)
    }
  }
  return props.src
})

const backgroundImage = computed(
  () => `url(${props.src})`
)
</script>

<style lang="sass">
.custom-img
  display: flex
  align-items: center
  position: relative
  background-image: v-bind('backgroundImage')
  background-size: 100% 100%
  z-index: 0
  &::after
    content: ''
    position: absolute
    top: 0
    left: 0
    width: 100%
    height: 100%
    background: inherit
    filter: blur(20px) brightness(1)
    opacity: 0.6
    transition-duration: 0.4s
    z-index: -1

  &:hover
    &::after
      filter: blur(30px) brightness(1.2)
      opacity: 1
</style>