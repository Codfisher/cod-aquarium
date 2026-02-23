import { computedAsync, createSharedComposable, whenever } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import QRCode from 'qrcode'
import { computed } from 'vue'
import { getRandomMarbleName } from '../marble'
import { peerDataSchema, send, useGameStore } from './game-store'

function _useHostPlayer() {
  const gameStore = useGameStore()
  const { playerList, peer } = storeToRefs(gameStore)

  whenever(peer, (p) => p.on('connection', (dataConnection) => {
    dataConnection.on('data', (data) => {
      const parsedData = peerDataSchema.safeParse(data)
      if (!parsedData.success) {
        console.error('Invalid data:', parsedData.error)
        return
      }

      const { type } = parsedData.data
      switch (type) {
        case 'client:updateInfo': {
          const player = playerList.value.find((player) => player.id === dataConnection.peer)
          if (player) {
            player.name = parsedData.data.name
          }
          break
        }
        case 'client:requestPlayerList': {
          send(dataConnection, {
            type: 'host:playerList',
            playerList: playerList.value,
          })
          break
        }
        case 'client:requestAllData': {
          send(dataConnection, {
            type: 'host:playerList',
            playerList: playerList.value,
          })
          send(dataConnection, {
            type: 'host:trackSegmentList',
            trackSegmentList: gameStore.trackSegmentDataList,
          })
          break
        }
      }
    })
  }), {
    immediate: true,
  })

  const joinUrl = computed(() => {
    const id = gameStore.peerId
    if (!id) {
      return ''
    }

    return `${window.location.origin}/aquarium/codmarbles/?host=${id}`
  })
  const joinUrlQrCode = computedAsync(async () => {
    if (!joinUrl.value) {
      return ''
    }

    console.log(`🚀 ~ joinUrl.value:`, joinUrl.value)
    return QRCode.toDataURL(joinUrl.value)
  }, '')

  function setupParty() {
    gameStore.mode = 'party'
    gameStore.isHost = true

    if (playerList.value.length < 1) {
      playerList.value.push({
        id: gameStore.peerId!,
        name: getRandomMarbleName(),
        index: 0,
      })
    }
  }

  return {
    joinUrl,
    joinUrlQrCode,
    playerList,
    setupParty,
  }
}

export const useHostPlayer = createSharedComposable(_useHostPlayer)
