<script setup lang="ts">
import Content from './Content'
</script>

<template>
  <div class="VPPage">
    <slot name="page-top" />
    <Content />
    <slot name="page-bottom" />
  </div>
</template>
