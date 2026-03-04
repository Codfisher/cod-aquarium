import type { DataConnection, Peer } from 'peerjs'
import type { BlockId } from '../domains/world/world-constants'
import type { BlockUpdatePacket, NetworkPacket, WorldSnapshotPacket } from '../types/network'
import { onBeforeUnmount, ref } from 'vue'
import { NetworkRole, PacketType } from '../types/network'

export interface UsePeerNetworkParams {
  /** 事件：連線建立成功 (做為 Client 連上，或做為 Host 啟動完成) */
  onConnected?: () => void;
  /** 事件：Client 收到 Host 傳來的世界快照 */
  onWorldSnapshotReceived?: (worldState: Uint8Array) => void;
  /** 事件：Host 偵測到有新 Client 連線成功，此時即可派送世界快照 */
  onClientConnected?: (peerId: string) => void;
  /** 事件：收到網路傳來的方塊更新 (挖掘或放置) */
  onBlockUpdateReceived?: (x: number, y: number, z: number, blockId: BlockId) => void;
  /** 事件：收到網路傳來的挖掘進度 (同步視覺特效) */
  onMiningProgressReceived?: (peerId: string, x: number, y: number, z: number, progress: number, blockId: BlockId) => void;
}

export const FIXED_ROOM_ID = 'peercraft-fixed-room-v1'

/**
 * 封裝 PeerJS 的 P2P 網路邏輯
 */
export function usePeerNetwork({
  onConnected,
  onWorldSnapshotReceived,
  onClientConnected,
  onBlockUpdateReceived,
  onMiningProgressReceived,
}: UsePeerNetworkParams) {
  const isReady = ref(false)
  const currentPeerId = ref<string>('')
  const currentRole = ref<NetworkRole | null>(null)

  let peer: Peer | null = null
  /**
   * 身分為 Host 時，儲存所有連入的 Client DataChannel
   * 身分為 Client 時，儲存連向 Host 的唯一 DataChannel
   */
  const connections = new Map<string, DataConnection>()

  // 動態載入 peerjs，避免 SSR 問題（Vitepress build 階段沒有 window）
  async function init() {
    if (typeof window === 'undefined')
      return

    const { Peer } = await import('peerjs')

    // 1. 先嘗試以匿名 Client 身份連線
    const tempPeer = new Peer()
    peer = tempPeer

    tempPeer.on('open', (id) => {
      currentPeerId.value = id
      console.log(`[Network] Initialize as Client. Attempting to connect to ${FIXED_ROOM_ID}...`)

      const destroyTempClientAndBecomeHost = () => {
        if (currentRole.value !== null)
          return

        console.warn(`[Network] Room ${FIXED_ROOM_ID} not fully reachable or not found. Taking over as Host...`)
        currentRole.value = NetworkRole.HOST
        tempPeer.destroy()

        peer = new Peer(FIXED_ROOM_ID)

        peer.on('open', (hostId) => {
          currentPeerId.value = hostId
          isReady.value = true
          console.log(`[Network] Successfully created room as Host: ${hostId}`)
          onConnected?.()
        })

        peer.on('connection', (inboundConnection) => {
          setupHostConnection(inboundConnection)
        })

        peer.on('error', (hostErr) => {
          console.error('[Network] Host creation error:', hostErr)
        })
      }

      // 設定 3 秒連線逾時，如果連不上就強制轉為 Host
      const clientConnectionTimeout = setTimeout(() => {
        if (currentRole.value === null) {
          destroyTempClientAndBecomeHost()
        }
      }, 3000)

      const connection = tempPeer.connect(FIXED_ROOM_ID)

      // 如果連線成功，代表房間存在，正式成為 Client
      connection.on('open', () => {
        clearTimeout(clientConnectionTimeout)
        if (currentRole.value === null) {
          currentRole.value = NetworkRole.CLIENT
          setupClientConnection(connection)
        }
      })

      connection.on('error', (err) => {
        console.error('[Network] Client connection to Host failed:', err)
        if (currentRole.value === null) {
          clearTimeout(clientConnectionTimeout)
          destroyTempClientAndBecomeHost()
        }
      })

      // 如果連線失敗 (找不到該 Peer)
      tempPeer.on('error', (err) => {
        if (err.type === 'peer-unavailable' && currentRole.value === null) {
          clearTimeout(clientConnectionTimeout)
          destroyTempClientAndBecomeHost()
        }
        else {
          console.error('[Network] Client error:', err)
        }
      })
    })
  }

  /**
   * 設定 Host 側的連線邏輯
   */
  function setupHostConnection(connection: DataConnection) {
    console.log(`[Host] Incoming connection from ${connection.peer}...`)

    connection.on('open', () => {
      connections.set(connection.peer, connection)
      console.log('[Host] Client connected successfully:', connection.peer)
      onClientConnected?.(connection.peer)
    })

    connection.on('data', (data) => {
      const packet = data as NetworkPacket
      if (packet.type === PacketType.BLOCK_UPDATE) {
        const { x, y, z, blockId } = packet.data
        // Host 收到來自 Client 的變更
        onBlockUpdateReceived?.(x, y, z, blockId)
        // 將該變更廣播給其餘所有連線中的 Client
        broadcastBlockUpdate(x, y, z, blockId, connection.peer)
      }
      else if (packet.type === PacketType.MINING_PROGRESS) {
        const { peerId, x, y, z, progress, blockId } = packet.data
        // Host 收到來自 Client 的進度
        onMiningProgressReceived?.(peerId, x, y, z, progress, blockId)
        // 廣播給其他 Client
        broadcastMiningProgress(peerId, x, y, z, progress, blockId, connection.peer)
      }
    })

    connection.on('close', () => {
      connections.delete(connection.peer)
      console.log('[Host] Client disconnected:', connection.peer)
    })
  }

  /**
   * 設定 Client 側的連線邏輯
   */
  function setupClientConnection(connection: DataConnection) {
    // 防呆：有時候 open 事先就在上面觸發過了，此處檢查連線狀態
    if (connection.open && !isReady.value) {
      connections.set(connection.peer, connection)
      isReady.value = true
      console.log('[Client] Connected to Host:', connection.peer)
      onConnected?.()
    }

    connection.on('open', () => {
      connections.set(connection.peer, connection)
      isReady.value = true
      console.log('[Client] Connected to Host (event):', connection.peer)
      onConnected?.()
    })

    connection.on('data', (data) => {
      const packet = data as NetworkPacket
      if (packet.type === PacketType.WORLD_SNAPSHOT) {
        console.log('[Client] Received world snapshot:', packet.data.byteLength, 'bytes')
        onWorldSnapshotReceived?.(packet.data)
      }
      else if (packet.type === PacketType.BLOCK_UPDATE) {
        const { x, y, z, blockId } = packet.data
        onBlockUpdateReceived?.(x, y, z, blockId)
      }
      else if (packet.type === PacketType.MINING_PROGRESS) {
        const { peerId, x, y, z, progress, blockId } = packet.data
        onMiningProgressReceived?.(peerId, x, y, z, progress, blockId)
      }
    })

    connection.on('close', () => {
      connections.delete(connection.peer)
      isReady.value = false
      console.warn('[Client] Lost connection to Host')
    })
  }

  /**
   * 【供 Host 呼叫】廣播目前的世界快照給剛連入的單一 Client
   * （使用 Uint8Array 傳輸，確保 256KB 效能）
   */
  function sendWorldSnapshot(targetPeerId: string, worldState: Uint8Array) {
    if (currentRole.value !== NetworkRole.HOST)
      return

    const connection = connections.get(targetPeerId)
    if (connection && connection.open) {
      const packet: WorldSnapshotPacket = {
        type: PacketType.WORLD_SNAPSHOT,
        data: worldState,
      }
      connection.send(packet)
    }
  }

  /**
   * 【供 Host 呼叫】廣播單一方塊更新給所有 Client (可排除發送者)
   */
  function broadcastBlockUpdate(x: number, y: number, z: number, blockId: BlockId, excludePeerId?: string) {
    if (currentRole.value !== NetworkRole.HOST)
      return

    const packet: BlockUpdatePacket = {
      type: PacketType.BLOCK_UPDATE,
      data: { x, y, z, blockId },
    }

    connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(packet)
      }
    })
  }

  /**
   * 【供 Client 呼叫】將單一方塊更新傳送給 Host
   */
  function sendBlockUpdateToHost(x: number, y: number, z: number, blockId: BlockId) {
    if (currentRole.value !== NetworkRole.CLIENT)
      return

    const hostConn = Array.from(connections.values())[0]
    if (hostConn && hostConn.open) {
      const packet: BlockUpdatePacket = {
        type: PacketType.BLOCK_UPDATE,
        data: { x, y, z, blockId },
      }
      hostConn.send(packet)
    }
  }

  /**
   * 【供 Host 呼叫】廣播正在挖掘的進度 (或停止)
   */
  function broadcastMiningProgress(
    senderPeerId: string,
    x: number,
    y: number,
    z: number,
    progress: number,
    blockId: BlockId,
    excludePeerId?: string,
  ) {
    if (currentRole.value !== NetworkRole.HOST)
      return

    const packet: NetworkPacket = {
      type: PacketType.MINING_PROGRESS,
      data: { peerId: senderPeerId, x, y, z, progress, blockId },
    }

    connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(packet)
      }
    })
  }

  /**
   * 【供 Client 呼叫】將自己的挖掘進度傳給 Host
   */
  function sendMiningProgressToHost(x: number, y: number, z: number, progress: number, blockId: BlockId) {
    if (currentRole.value !== NetworkRole.CLIENT)
      return

    const hostConn = Array.from(connections.values())[0]
    if (hostConn && hostConn.open) {
      const packet: NetworkPacket = {
        type: PacketType.MINING_PROGRESS,
        data: {
          peerId: currentPeerId.value,
          x,
          y,
          z,
          progress,
          blockId,
        },
      }
      hostConn.send(packet)
    }
  }

  onBeforeUnmount(() => {
    connections.forEach((conn) => conn.close())
    connections.clear()
    peer?.destroy()
  })

  // 啟動
  init()

  return {
    isReady,
    currentRole,
    currentPeerId,
    sendWorldSnapshot,
    broadcastBlockUpdate,
    sendBlockUpdateToHost,
    broadcastMiningProgress,
    sendMiningProgressToHost,
    /** 暴露給 Host 在有人連線時，能夠主動派送 Snapshot 的方法。
     * 暫時由外部直接監聽，這邊提供 connections reference 以便未來擴充
     */
    connections,
  }
}
