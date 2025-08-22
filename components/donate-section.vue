<template>
  <div class="p-4 border rounded-xl mb-10 vp-doc">
    <div class="">
      有任何建議或疑問嗎？歡迎
      <a
        href="mailto:hi@codlin.me"
        target="_blank"
      >
        寫信給我
      </a>

      <span class="text-nowrap">( ´ ▽ ` )ﾉ</span>
    </div>

    <br>

    如果我的文章對您有所啟發或幫助，歡迎「
    <a
      href="https://portaly.cc/codfish/support"
      target="_blank"
    >
      請我喝一杯咖啡
    </a>

    」或花 10 秒登入 LikeCoin 按下方按鈕拍手鼓勵我喔！

    <client-only>
      <iframe
        :key="src"
        scrolling="no"
        frameborder="0"
        :src
        class="my-4 rounded-xl"
      />
    </client-only>

    <div class=" text-center p-4 bg-slate-50 rounded-xl text-lg text-gray-600">
      鱈魚感謝您！ <span class="text-nowrap">(´▽`ʃ💖ƪ)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { pipe } from 'remeda'
import { useRoute } from 'vitepress'
import { computed } from 'vue'

const route = useRoute()

const referrer = computed(() => {
  /** 防止 SSR 階段出現 window 不存在
   *
   * https://github.com/vuejs/vitepress/issues/1689
   */
  if (import.meta.env.SSR) {
    return ''
  }

  return pipe(
    window?.location?.href ?? route.path,
    (value) => encodeURIComponent(value.replace('.html', '')),
  )
})

const src = computed(() => `https://button.like.co/in/embed/codlin/button?referrer=${referrer.value}`)
</script>

<style scoped lang="sass">
</style>
