import type { DataConnection } from 'peerjs'
import type { GameMode } from '../../types'
import { computedAsync, useIntervalFn, watchThrottled } from '@vueuse/core'
import { Peer } from 'peerjs'
import { defineStore } from 'pinia'
import QRCode from 'qrcode'
import { pipe, tap } from 'remeda'
import { computed, ref, shallowRef, watch } from 'vue'
import z from 'zod/v4'
import { getRandomMarbleName } from '../marble'
import { nextFrame } from '../../../../../web/common/utils'
import { TrackSegmentType } from '../track-segment/data'
import { fa } from 'zod/dist/types/v4/locales'

export const peerDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('host:trackSegmentList'),
    trackSegmentList: z.array(z.object({
      type: z.string(),
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
    type: `${TrackSegmentType}`
  }>>([]);
  watch(trackSegmentDataList, async (list) => {
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
    position: number[];
  }>>([])
  const marbleDataInterval = useIntervalFn(() => {
    connectionMap.forEach((connection) => {
      send(connection, {
        type: 'host:marbleData',
        marbleData: marbleDataList.value,
      })
    })
  }, 100, {
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

  function init() {
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
      })
    }
    // host 邏輯
    else {
      newPeer.on('connection', (dataConnection) => {
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
  init()

  return {
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
