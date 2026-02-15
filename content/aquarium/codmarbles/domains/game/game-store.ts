import type { DataConnection, Peer } from 'peerjs'
import type { GameMode, GameState } from '../../types'
import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { pipe, tap } from 'remeda'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import z from 'zod/v4'
import { getRandomMarbleName } from '../marble'
import { nextFrame } from '../../../../../web/common/utils'
import { TrackSegmentType } from '../track-segment/data'

export const peerDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('host:state'),
    state: z.string(),
  }),
  z.object({
    type: z.literal('host:trackSegmentList'),
    trackSegmentList: z.array(z.object({
      type: z.enum(TrackSegmentType),
    })),
  }),
  z.object({
    type: z.literal('host:playerList'),
    playerList: z.array(z.object({
      id: z.string(),
      name: z.string(),
      index: z.number(),
    })),
  }),
  z.object({
    type: z.literal('host:marbleData'),
    marbleData: z.array(z.object({
      index: z.number(),
      isGrounded: z.boolean(),
      finishedAt: z.number(),
      position: z.number().array(),
    })),
  }),
  z.object({
    type: z.literal('client:updateInfo'),
    name: z.string(),
  }),
  z.object({
    type: z.literal('client:requestPlayerList'),
  }),
  z.object({
    type: z.literal('client:requestAllData'),
  }),
  z.object({
    type: z.literal('host:reject'),
    title: z.string(),
    description: z.string(),
  }),
])
export type PeerData = z.infer<typeof peerDataSchema>

export function send(connection: DataConnection, data: PeerData) {
  connection.send(data)
}

export const useGameStore = defineStore('game', () => {
  /** 玩家端之目標房間 ID */
  const hostId = pipe(
    // 因為 whyframe 隔離，需要從 parent 取得 URL
    new URLSearchParams(window.parent.location.search || window.location.search),
    (urlParams) => urlParams.get('host'),
  )

  const state = ref<GameState>('idle')
  watch(state, async (value) => {
    if (!isHost.value) {
      return
    }

    await nextFrame()

    connectionMap.forEach((connection) => {
      send(connection, {
        type: 'host:state',
        state: value,
      })
    })
  }, {
    flush: 'post',
  })

  const toast = useToast()
  const mode = ref<GameMode | undefined>(hostId ? 'party' : undefined)
  const isHost = ref(!hostId)

  const peer = shallowRef<Peer>()
  const peerId = ref<string>()
  const connectionMap = new Map<string, DataConnection>()
  const selfConnection = shallowRef<DataConnection>()

  const playerList = ref<Array<{
    id: string;
    name: string;
    index: number;
  }>>([])
  watch(playerList, async (list) => {
    if (!isHost.value) {
      return
    }

    await nextFrame()

    connectionMap.forEach((connection) => {
      send(connection, {
        type: 'host:playerList',
        playerList: list,
      })
    })
  }, {
    flush: 'post',
    deep: true
  })

  /** 紀錄軌道與順序 */
  const trackSegmentDataList = ref<Array<{
    type: TrackSegmentType
  }>>([]);
  watch(trackSegmentDataList, async (list) => {
    if (!isHost.value) {
      return
    }

    await nextFrame()

    connectionMap.forEach((connection) => {
      send(connection, {
        type: 'host:trackSegmentList',
        trackSegmentList: list,
      })
    })
  }, {
    flush: 'post',
    deep: true
  })

  const marbleDataList = ref<Array<{
    index: number;
    isGrounded: boolean;
    finishedAt: number;
    position: number[];
  }>>([])
  const marbleDataInterval = useIntervalFn(() => {
    connectionMap.forEach((connection) => {
      send(connection, {
        type: 'host:marbleData',
        marbleData: marbleDataList.value,
      })
    })
  }, 10, {
    immediate: false,
    immediateCallback: false,
  })
  watch(isHost, (isHost) => {
    if (isHost) {
      marbleDataInterval.resume()
    } else {
      marbleDataInterval.pause()
    }
  }, {
    immediate: true,
  })

  async function init() {
    const { default: Peer } = await import('peerjs')
    const newPeer = new Peer()
    newPeer.on('open', (id) => {
      peerId.value = id
    })
    peer.value = newPeer

    // client 邏輯
    if (hostId) {
      newPeer.on('open', () => {
        const dataConnection = newPeer.connect(hostId)
        selfConnection.value = dataConnection

        dataConnection.on('data', (data) => {
          const parsedData = peerDataSchema.safeParse(data)
          if (!parsedData.success) {
            console.error('Invalid data:', parsedData.error)
            return
          }

          switch (parsedData.data.type) {
            case 'host:reject': {
              toast.add({
                title: parsedData.data.title,
                description: parsedData.data.description,
                color: 'error',
              })
              break
            }
          }
        })
      })
    }
    // host 邏輯
    else {
      newPeer.on('connection', (dataConnection) => {
        if (playerList.value.length >= 10) {
          send(dataConnection, {
            type: 'host:reject',
            title: '玩家已滿',
            description: '無法加入遊戲',
          })

          dataConnection.close()
          return
        }
        if (state.value !== 'idle' && state.value !== 'over') {
          send(dataConnection, {
            type: 'host:reject',
            title: '遊戲進行中',
            description: '無法加入遊戲',
          })

          dataConnection.close()
          return
        }

        // 允許加入
        connectionMap.set(dataConnection.peer, dataConnection)
        playerList.value.push({
          id: dataConnection.peer,
          name: getRandomMarbleName(),
          index: playerList.value.length,
        })

        dataConnection.on('close', () => {
          connectionMap.delete(dataConnection.peer)
          const index = playerList.value.findIndex((player) => player.id === dataConnection.peer)
          if (index !== -1) {
            playerList.value.splice(index, 1)
          }
        })
      })
    }
  }
  onMounted(async () => {
    init()
  })

  return {
    state,
    mode,
    isHost,
    peer,
    peerId: computed(() => peerId.value),
    playerList,
    trackSegmentDataList,
    marbleDataList,
    connectionMap,
    selfConnection,
  }
})
