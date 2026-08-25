<template>
  <div class="feed-ad flex h-full w-full items-center justify-center overflow-hidden">
    <!-- 廣告被擋掉時這塊空間反正也長不出東西，改放一句話 -->
    <p
      v-if="adStatus === 'blocked'"
      class="px-4 text-center text-sm text-muted"
    >
      順手開廣告，支持好內容 (*´∀`)~♥
    </p>

    <google-adsense
      v-show="adStatus !== 'blocked'"
      ad-client="ca-pub-6608581811170481"
      ad-slot="4578857452"
      :height="AD_ROW_HEIGHT"
      class="max-w-2xl"
      @status-change="adStatus = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GoogleAdsense from '../../../../../web/components/google-adsense.vue'
import { AD_ROW_HEIGHT } from '../../constants'

/** 這一列跟著清單捲動、不常駐版面，沒填到廣告也不必收合。
 * 收合反而會在廣告回報結果的瞬間把下方內容整批上移，更擾人
 */
const adStatus = ref<'pending' | 'filled' | 'unfilled' | 'blocked'>('pending')
</script>
