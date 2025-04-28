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
    <client-only>
      <iframe
        :key="src"
        scrolling="no"
        frameborder="0"
        :src
        class="my-4 rounded-xl"
      />

      <div class=" text-center p-4 bg-slate-50 rounded-xl text-lg text-gray-600">
        鱈魚感謝您！ <span class="text-nowrap">(´▽`ʃ💖ƪ)</span>
      </div>

      <amp-ad
        width="100vw"
        height="320"
        type="adsense"
        data-ad-client="ca-pub-6608581811170481"
        data-ad-slot="9242930193"
        data-auto-format="rspv"
        data-full-width=""
      >
        <div overflow="" />
      </amp-ad>

      <ins
        class="adsbygoogle"
        style="display:block"
        data-ad-client="ca-pub-6608581811170481"
        data-ad-slot="9242930193"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </client-only>
  </div>
</template>

<script setup lang="ts">
import { pipe } from 'remeda'
import { useRoute } from 'vitepress'
import { onMounted, ref, watch } from 'vue'

const route = useRoute()

const src = ref('')

function getSrc() {
  const referrer = pipe(
    window?.location?.href ?? route.path,
    (value) => encodeURIComponent(value.replace('.html', '')),
  )

  return `https://button.like.co/in/embed/codlin/button?referrer=${referrer}`
}

watch(() => route.path, () => {
  src.value = getSrc()
})

/** 防止 SSR 階段出現 window 不存在
 *
 * https://github.com/vuejs/vitepress/issues/1689
 */
onMounted(() => {
  src.value = getSrc()

  // @ts-expect-error 自定義 adsense
  if (window.adsbygoogle) {
    // @ts-expect-error 自定義 adsense
    (window.adsbygoogle = window.adsbygoogle || []).push({})
  }
})
</script>

<style scoped lang="sass">
</style>
