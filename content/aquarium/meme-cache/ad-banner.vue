<template>
  <aside
    v-show="bannerVisible"
    class="meme-ad-banner flex w-full shrink-0 items-center justify-center overflow-hidden"
    :style="{ height: `${AD_BANNER_HEIGHT}px` }"
    aria-label="廣告"
  >
    <!-- 廣告被擋掉時這塊空間反正也長不出東西，改放一句話 -->
    <p
      v-if="adStatus === 'blocked'"
      class="support-message px-4 text-center text-sm opacity-70"
    >
      順手開廣告，支持好內容 (*´∀`)~♥
    </p>

    <google-adsense
      v-show="adStatus !== 'blocked'"
      ad-client="ca-pub-6608581811170481"
      ad-slot="4578857452"
      :height="AD_BANNER_HEIGHT"
      class="max-w-4xl"
      @status-change="handleStatusChange"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GoogleAdsense from '../../../web/components/google-adsense.vue'
import { AD_BANNER_HEIGHT } from './constants'

const adStatus = ref<'pending' | 'filled' | 'unfilled' | 'blocked'>('pending')

/** 沒庫存不是使用者造成的，講什麼都沒意義，整條收起來把高度還給 app；
 * 被擋掉才留著顯示訊息
 */
const bannerVisible = computed(() => adStatus.value !== 'unfilled')

function handleStatusChange(status: 'filled' | 'unfilled' | 'blocked') {
  adStatus.value = status
}
</script>

<style scoped lang="sass">
.meme-ad-banner
  background: var(--vp-c-bg-alt)
  border-bottom: 1px solid var(--vp-c-divider)
</style>
