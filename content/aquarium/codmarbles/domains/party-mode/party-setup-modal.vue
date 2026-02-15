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
        <div>
          <img :src="hostPlayer.joinUrlQrCode">
        </div>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useHostPlayer } from '../game/use-host-player'

const hostPlayer = reactive(useHostPlayer())
</script>
