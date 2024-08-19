<template>
  <div class=" flex flex-col items-center py-10">
    <div class=" w-1/2">
      <h1>文章列表</h1>

      <p>Some default layout content shared across all pages</p>

      <pre>
        {{ contents }}
      </pre>
    </div>
  </div>
</template>

<script setup>
const { data: contents } = await useAsyncData('contents',
  () => queryContent()
    .where({
      _path: { $regex: 'blog' },
      _type: 'markdown',
      _draft: false,
    })
    .without(['body'])
    .find(),
)


</script>

<style scoped></style>