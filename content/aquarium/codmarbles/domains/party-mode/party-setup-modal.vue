<template>
  <u-modal
    title="多人遊戲"
    description="邀請小夥伴們掃描以下 QR Code，一起滾彈珠吧！੭ ˙ᗜ˙ )੭"
    :ui="{
      content: 'rounded-2xl',
    }"
    @update:open="handleOpen"
  >
    <slot />

    <template #body>
      <div class="flex flex-col items-center gap-4 p-2">
        <div>
          <img :src="gameStore.joinUrlQrCode">
        </div>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import QRCode from 'qrcode'
import { useGameStore } from '../game/game-store'

const gameStore = useGameStore()

function handleOpen(open: boolean) {
  if (open) {
    gameStore.createParty()
  }
}
</script>
