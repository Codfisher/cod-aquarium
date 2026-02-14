import type { DataConnection } from 'peerjs'
import type { GameMode } from '../../types'
import { computedAsync } from '@vueuse/core'
import { Peer } from 'peerjs'
import { defineStore } from 'pinia'
import QRCode from 'qrcode'
import { pipe, tap } from 'remeda'
import { computed, ref, shallowRef } from 'vue'

export const useGameStore = defineStore('game', () => {
  /** 玩家端之目標房間 ID */
  const hostId = pipe(
    new URLSearchParams(window.location.search),
    (urlParams) => urlParams.get('host'),
  )
  console.log(`🚀 ~ hostId:`, hostId)

  const mode = ref<GameMode>()
  const isHost = ref(false)
  const peer = shallowRef<Peer>()
  const peerId = ref<string>()
  const joinUrlQrCode = computedAsync(async () => {
    const id = peerId.value
    if (!id) {
      return ''
    }

    const joinUrl = `${window.location.origin}/aquarium/codmarbles/?host=${id}`
    return QRCode.toDataURL(joinUrl)
  }, '')

  const connections = new Map<string, DataConnection>()

  function init() {
    const newPeer = new Peer()
    newPeer.on('open', (id) => {
      peerId.value = id
    })
    // 加入
    if (hostId) {
      mode.value = 'party'
      isHost.value = false

      newPeer.on('open', () => {
        const dataConnection = newPeer.connect(hostId)

        dataConnection.on('open', () => {
          console.log(`🚀[player] ~ open:`, open)
        })

        dataConnection.on('close', () => {
          console.log(`🚀[player] ~ close:`, close)
        })

        dataConnection.on('data', (data: any) => {
          console.log(`🚀[player] ~ data:`, data)
        })
      })
    }
    // 建立房間
    else {
      newPeer.on('connection', (dataConnection) => {
        console.log('新玩家連線:', dataConnection.peer)

        dataConnection.on('open', () => {
          connections.set(dataConnection.peer, dataConnection)
          // TODO: 在 Babylon 場景中生成一顆彈珠，綁定 conn.peer 為 ID
          // createMarble(conn.peer);
        })

        dataConnection.on('data', (data: any) => {
          console.log(`🚀 ~ data:`, data)
        })

        dataConnection.on('close', () => {
          console.log('玩家斷線:', dataConnection.peer)
          connections.delete(dataConnection.peer)
        })
      })
    }

    peer.value = newPeer
  }
  init()

  function createParty() {
    mode.value = 'party'
    isHost.value = true
  }

  return {
    mode: computed(() => mode.value),
    isHost: computed(() => isHost.value),
    peerId: computed(() => peerId.value),
    joinUrlQrCode,

    createParty,
  }
})
