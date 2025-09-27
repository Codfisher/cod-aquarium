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

    如果我的文章對您有所啟發或幫助，歡迎
    <a
      href="https://portaly.cc/codfish/support"
      target="_blank"
    >
      請我喝一杯咖啡
    </a>
    ，鼓勵我喔！

    <div class=" text-center my-8 text-xl">
      鱈魚感謝您！<span class="text-nowrap">(´▽`ʃ💖ƪ)</span>
    </div>

    <client-only>
      <fish-feeder class="mt-4" />
    </client-only>
  </div>
</template>

<script setup lang="ts">
import FishFeeder from './fish-feeder.vue'
</script>

<style scoped lang="sass">
</style>
