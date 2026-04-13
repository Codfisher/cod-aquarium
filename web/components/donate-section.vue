<template>
  <div class="donate-section p-6 md:p-8 rounded-xl mb-10 vp-doc">
    <div class="text-center text-lg font-bold mb-4 opacity-90">
      感謝閱讀！<span class="text-nowrap">( ´ ▽ ` )ﾉ</span>
    </div>

    <div class="text-center leading-relaxed opacity-80">
      有任何建議或疑問嗎？歡迎
      <a
        href="mailto:hi@codlin.me"
        target="_blank"
      >
        寫信給我
      </a>
    </div>

    <div class="text-center leading-relaxed opacity-80 mt-2">
      如果文章對您有所啟發或幫助，歡迎
      <a
        href="https://portaly.cc/codfish/support"
        target="_blank"
      >
        請我喝一杯咖啡
      </a>
      ，鼓勵我喔！
    </div>

    <div class="text-center my-8 text-xl">
      鱈魚感謝您！<span class="text-nowrap">(´▽`ʃ💖ƪ)</span>
    </div>

    <client-only>
      <fish-feeder />
    </client-only>
  </div>
</template>

<script setup lang="ts">
import FishFeeder from './fish-feeder.vue'
</script>

<style scoped lang="sass">
.donate-section
  border: 1px solid light-dark(oklch(0.92 0.02 175), oklch(0.28 0.02 175))
  background: light-dark(oklch(0.98 0.008 175 / 0.5), oklch(0.18 0.01 175 / 0.5))
</style>
