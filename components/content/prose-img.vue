<template>
  <nuxt-img
    :src="refinedSrc"
    :alt="alt"
    :width="width"
    :height="height"
    :format="format"
    quality="80"
    sizes="100px sm:300px md:600px"
  />
</template>

<script setup lang="ts">
import { withTrailingSlash, withLeadingSlash, joinURL } from 'ufo'
import { useRuntimeConfig, computed, resolveComponent } from '#imports'


const props = defineProps({
  src: {
    type: String,
    default: ''
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
</script>