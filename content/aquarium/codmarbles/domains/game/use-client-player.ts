
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
  } = storeToRefs(gameStore)

  const isPartyClient = computed(() => !gameStore.isHost && gameStore.mode === 'party')

  const marbleIndex = computed(() => {
    const player = playerList.value.find((player) => player.id === gameStore.peerId)
    return player?.index
  })

  const rejectHook = createEventHook<Extract<PeerData, { type: 'host:reject' }>>()
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
          break
        }
        case 'host:reject': {
          rejectHook.trigger(parsedData.data)
          console.log(`🚀 ~ parsedData:`, parsedData);
          break
        }
      }
    })
  }, {
    immediate: true,
  })

  return {
    isPartyClient,
    marbleIndex,
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
    onReject: rejectHook.on,
  }
}

export const useClientPlayer = createSharedComposable(_useClientPlayer)