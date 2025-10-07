<template>
  <div class="text p-4 ">
    <h1 class=" text-2xl mb-6 font-bold">
      {{ titleDecoder.text }}
    </h1>

    <p>大家好，我是鱈魚。 <span class="text-nowrap">( ´ ▽ ` )ﾉ</span></p>

    <p>
      這是一個 FUI 風格的 Web 應用程式，靈感來自以前看到的
      <a
        href="https://github.com/syxanash/awesome-web-desktops"
        target="_blank"
      >
        awesome-web-desktops
      </a>
      專案
    </p>

    <p>
      甚麼是
      <a
        href="https://en.wikipedia.org/wiki/Web_desktop"
        target="_blank"
      >
        Web Desktop
      </a>
      ？簡單來說就是在 Web 上模仿各種 Desktop OS UI 的 Web，相當有趣
      <span class="text-nowrap">੭ ˙ᗜ˙ )੭</span>
    </p>

    <p>個人一直對於科幻風格的元件情有獨鍾，先前也做過一些相關的實驗：</p>

    <ul class=" list-disc list-inside mb-4">
      <li>
        <a
          href="https://www.threads.com/@codfish2140/post/DLu6YtlN62t"
          target="_blank"
        >
          科幻風格滑鼠游標
        </a>
      </li>
      <li>
        <a
          href="https://www.threads.com/@codfish2140/post/DCFGezpygCy"
          target="_blank"
        >
          科幻風格卡片
        </a>
      </li>
      <li>
        <a
          href="https://www.threads.com/@codfish2140/post/DHoE3CxuJf9"
          target="_blank"
        >
          魔改 Quasar 元件
        </a>
      </li>
    </ul>

    <p>心中一直有個打造 FUI 元件庫的夢想，但是直接開發實在是沒什麼頭緒，導致進度緩慢 </p>

    <p>
      這個時候剛好看到 awesome-web-desktops，心想：「模仿桌面應用程式不就是很棒的實驗機會嗎？」，於是此專案就誕生了！
      <span class="text-nowrap">✧⁑｡٩(ˊᗜˋ*)و✧⁕｡</span>
    </p>

    <p>
      此專案用於實驗 FUI，不定期更新，某天時機成熟時，會抽離成 Cyber Scales UI 套件
      <span class="text-nowrap">( •̀ ω •́ )y</span>
    </p>

    <p>
      如果您有任何想法或建議，歡迎<a href="mailto:hi@codlin.me">寫信給我</a>
    </p>

    <p>
      也可以
      <a
        href="https://portaly.cc/codfish/support"
        target="_blank"
      >
        請我喝一杯咖啡
      </a>
      ，鼓勵我喔！(*´∀`)~♥
    </p>

    <p class="text-xl text-center mt-6">
      謝謝您的閱讀！
      <span class="text-nowrap">(´▽`ʃ💖ƪ)</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { promiseTimeout } from '@vueuse/core'
import { onMounted } from 'vue'
import { useDecodingText } from '../../../../../composables/use-decoding-text'

const titleDecoder = useDecodingText('歡迎來到 Cyber Scales Desktop')

onMounted(async () => {
  await promiseTimeout(200)
  titleDecoder.start()
})
</script>

<style scoped lang="sass">
.text
  p
    margin-bottom: 1rem
    line-height: 1.6
    &:last-child
      margin-bottom: 0
  a
    color: var(--vp-c-brand-1)
    font-weight: 600
    text-decoration: underline
</style>
