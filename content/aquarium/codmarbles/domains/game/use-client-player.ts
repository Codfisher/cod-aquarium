
import { peerDataSchema, useGameStore } from './game-store'
import { createSharedComposable, whenever } from '@vueuse/core'
import { storeToRefs } from 'pinia'

function _useClientPlayer() {
  const gameStore = useGameStore()
  const { selfConnection, playerList } = storeToRefs(gameStore)

  whenever(selfConnection, (conn) => {
    conn.on('open', () => {
      console.log(`🚀[player] ~ open:`, open)
    })

    conn.on('close', () => {
      console.log(`🚀[player] ~ close:`, close)
    })

    conn.on('data', (data) => {
      console.log(`[useClientPlayer] ~ data:`, data)

      const parsedData = peerDataSchema.safeParse(data)
      if (!parsedData.success) {
        console.error('Invalid data:', parsedData.error)
        return
      }

      const { type } = parsedData.data
      switch (type) {
        case 'host:playerList': {
          playerList.value = parsedData.data.playerList
          break
        }
      }
    })
  }, {
    immediate: true,
  })

  return {
    requestPlayerList() {
      console.log(`[requestPlayerList] ~ selfConnection:`, selfConnection);
      selfConnection.value?.send({
        type: 'client:requestPlayerList',
      })
    },
  }
}

export const useClientPlayer = createSharedComposable(_useClientPlayer)