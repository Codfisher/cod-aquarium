<template>
  <u-modal
    title="多人遊戲"
    description="邀請小夥伴們掃描以下 QR Code，一起滾彈珠吧！੭ ˙ᗜ˙ )੭"
    :ui="{
      content: 'rounded-2xl',
    }"
  >
    <slot />

    <template #body>
      <div class="flex flex-col items-center gap-4 p-2">
        <div class="flex flex-col items-center gap-4 p-2">
          <img :src="hostPlayer.joinUrlQrCode">

          <u-button
            label="複製連結"
            class="w-full"
            :ui="{ label: 'text-center w-full' }"
            @click="copyJoinUrl"
          />
        </div>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useHostPlayer } from '../game/use-host-player'

const toast = useToast()
const hostPlayer = reactive(useHostPlayer())

function copyJoinUrl() {
  navigator.clipboard.writeText(hostPlayer.joinUrl)
  toast.add({
    title: '已複製連結',
    description: '可以分享給快樂夥伴們囉！੭ ˙ᗜ˙ )੭',
    color: 'success',
  })
}
</script>
