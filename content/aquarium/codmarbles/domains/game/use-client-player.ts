
import { PeerData, peerDataSchema, useGameStore } from './game-store'
import { createEventHook, createSharedComposable, whenever } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { GameState } from '../../types'

function _useClientPlayer() {
  const gameStore = useGameStore()
  const {
    selfConnection,
    playerList,
    marbleDataList,
    trackSegmentDataList,
    state,
    startedAt,
  } = storeToRefs(gameStore)

  const isPartyClient = computed(() => !gameStore.isHost && gameStore.mode === 'party')

  const playerData = computed(() => {
    const player = playerList.value.find((player) => player.id === gameStore.peerId)
    return player
  })

  whenever(selfConnection, (conn) => {
    conn.on('open', () => {
      console.log(`🚀[player] ~ open:`)
    })

    conn.on('close', () => {
      console.log(`🚀[player] ~ close:`)
    })

    conn.on('data', (data) => {
      // console.log(`[useClientPlayer] ~ data:`, data);
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
        case 'host:marbleData': {
          marbleDataList.value = parsedData.data.marbleData
          break
        }
        case 'host:trackSegmentList': {
          trackSegmentDataList.value = parsedData.data.trackSegmentList
          break
        }
        case 'host:state': {
          state.value = parsedData.data.state as GameState
          startedAt.value = parsedData.data.startedAt
          break
        }
      }
    })
  }, {
    immediate: true,
  })

  return {
    isPartyClient,
    playerData,
    startedAt,
    requestPlayerList() {
      selfConnection.value?.send({
        type: 'client:requestPlayerList',
      })
    },
    requestAllData() {
      selfConnection.value?.send({
        type: 'client:requestAllData',
      })
    },
    updateInfo(info: Omit<Extract<PeerData, { type: 'client:updateInfo' }>, 'type'>) {
      selfConnection.value?.send({
        type: 'client:updateInfo',
        ...info,
      })
    },
  }
}

export const useClientPlayer = createSharedComposable(_useClientPlayer)