import type { DataConnection } from 'peerjs'
import type { GameMode } from '../../types'
import { computedAsync } from '@vueuse/core'
import { Peer } from 'peerjs'
import { defineStore } from 'pinia'
import QRCode from 'qrcode'
import { pipe, tap } from 'remeda'
import { computed, ref, shallowRef } from 'vue'
import z from 'zod/v4'

export const peerDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('players'),
    players: z.array(z.object({
      id: z.string(),
      name: z.string(),
      index: z.number(),
    })),
  }),
  z.object({
    type: z.literal('client-join'),
    name: z.string(),
  }),
  z.object({
    type: z.literal('server-reject'),
    title: z.string(),
    description: z.string(),
  }),
])
export type PeerData = z.infer<typeof peerDataSchema>

export const useGameStore = defineStore('game', () => {
  /** 玩家端之目標房間 ID */
  const hostId = pipe(
    new URLSearchParams(window.location.search),
    (urlParams) => urlParams.get('host'),
  )
    console.log(`🚀 ~ window.location.search:`, window.location);
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
    console.log(`🚀 ~ joinUrl:`, joinUrl);
    return QRCode.toDataURL(joinUrl)
  }, '')

  const playerList = ref<Array<{
    id: string;
    name: string;
    index: number;
  }>>([])

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
          playerList.value.push({
            id: dataConnection.peer,
            name: '',
            index: playerList.value.length,
          })
        })

        dataConnection.on('data', (data: unknown) => {
          const parsedData = peerDataSchema.safeParse(data)
          if (!parsedData.success) {
            console.error('Invalid data:', parsedData.error)
            return
          }

          const { type } = parsedData.data
          switch (type) {
            case 'players': {
              playerList.value = parsedData.data.players
              break
            }
            case 'client-join': {
              playerList.value.push({
                id: dataConnection.peer,
                name: parsedData.data.name,
                index: playerList.value.length,
              })
              break
            }
          }
          console.log(`🚀 ~ data:`, parsedData)
        })

        dataConnection.on('close', () => {
          console.log('玩家斷線:', dataConnection.peer)
          const index = playerList.value.findIndex((player) => player.id === dataConnection.peer)
          if (index !== -1) {
            playerList.value.splice(index, 1)
          }
        })
      })
    }

    peer.value = newPeer
  }
  init()

  function setupParty() {
    mode.value = 'party'
    isHost.value = true
  }

  return {
    mode: computed(() => mode.value),
    isHost: computed(() => isHost.value),
    peerId: computed(() => peerId.value),
    joinUrlQrCode,
    playerList,

    setupParty,
  }
})
