<template>
  <div class="p-4 border rounded-xl mb-10 vp-doc">
    如果我的文章對您有所啟發或幫助，歡迎「
    <a
      href="https://portaly.cc/codfish/support"
      target="_blank"
    >
      請我喝一杯咖啡
    </a>

    」或花 10 秒登入 LikeCoin 按下方按鈕拍手鼓勵我喔！
    <iframe
      :key="src"
      scrolling="no"
      frameborder="0"
      :src
    />

    <div class=" text-center p-4 bg-slate-50 rounded-xl text-lg text-gray-600">
      鱈魚感謝您！ <span class="text-nowrap">(´▽`ʃ💖ƪ)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const src = computed(() => {
  const referrer = encodeURIComponent(window.location.href.replace('.html', ''))
  return `https://button.like.co/in/embed/codlin/button?referrer=${referrer}`
})
</script>

<style scoped lang="sass">
</style>
