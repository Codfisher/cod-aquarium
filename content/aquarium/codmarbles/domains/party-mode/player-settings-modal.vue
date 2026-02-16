<template>
  <u-modal
    title="玩家設定"
    description="可變更你的玩家資訊"
    :ui="{
      content: 'rounded-2xl',
      footer: 'flex justify-end gap-4',
    }"
  >
    <slot />

    <template #body>
      <div class="flex flex-col items-center gap-4 p-2">
        <u-form-field label="玩家名稱">
          <u-input v-model="playerInfo.name" />
        </u-form-field>
      </div>
    </template>

    <template #footer>
      <u-button
        label="儲存"
        size="lg"
        @click="updatePlayerName"
      />
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useClientPlayer } from '../game/use-client-player';

const clientPlayer = reactive(useClientPlayer())

const playerInfo = ref({
  name: '',
})
function init() {
  playerInfo.value.name = clientPlayer.playerData?.name || ''
}
init()

function updatePlayerName() {
  clientPlayer.updateInfo(playerInfo.value)
}
</script>
