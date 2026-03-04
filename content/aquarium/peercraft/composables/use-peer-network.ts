import type { DataConnection, Peer } from 'peerjs'
import type { NetworkPacket, WorldSnapshotPacket } from '../types/network'
import { onBeforeUnmount, ref } from 'vue'
import { NetworkRole, PacketType } from '../types/network'

export interface UsePeerNetworkParams {
  /** 角色的網路身份 */
  role: NetworkRole;
  /**
   * 若身分是 Client，必須提供目標 Host 的 ID。
   * 若身分是 Host，此欄位無作用。
   */
  targetHostId?: string;

  /** 事件：Client 收到 Host 傳來的世界快照 */
  onWorldSnapshotReceived?: (worldState: Uint8Array) => void;
  /** 事件：連線建立成功 */
  onConnected?: () => void;
  /** 事件：建立 Host 成功並取得 PeerID */
  onHostReady?: (hostId: string) => void;
}

/**
 * 封裝 PeerJS 的 P2P 網路邏輯
 */
export function usePeerNetwork({
  role,
  targetHostId,
  onWorldSnapshotReceived,
  onConnected,
  onHostReady,
}: UsePeerNetworkParams) {
  const isReady = ref(false)
  const currentPeerId = ref<string>('')

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

    peer = new Peer()

    peer.on('open', (id) => {
      currentPeerId.value = id

      if (role === NetworkRole.HOST) {
        isReady.value = true
        onHostReady?.(id)
        onConnected?.()
      }
      else if (role === NetworkRole.CLIENT && targetHostId) {
        /** Client 取得自己的 ID 後，主動連向 Host */
        const connection = peer!.connect(targetHostId, {
          reliable: true,
        })
        setupClientConnection(connection)
      }
    })

    if (role === NetworkRole.HOST) {
      /** Host 監聽來自 Client 的連線 */
      peer.on('connection', (connection) => {
        setupHostConnection(connection)
      })
    }
  }

  /**
   * 設定 Host 側的連線邏輯
   */
  function setupHostConnection(connection: DataConnection) {
    connection.on('open', () => {
      connections.set(connection.peer, connection)
      console.log('[Host] Client connected:', connection.peer)
    })

    connection.on('data', (data) => {
      // Phase 4: 處理 Client 送來的動作封包
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
    connection.on('open', () => {
      connections.set(connection.peer, connection)
      isReady.value = true
      console.log('[Client] Connected to Host:', connection.peer)
      onConnected?.()
    })

    connection.on('data', (data) => {
      const packet = data as NetworkPacket
      if (packet.type === PacketType.WORLD_SNAPSHOT) {
        console.log('[Client] Received world snapshot:', packet.data.byteLength, 'bytes')
        onWorldSnapshotReceived?.(packet.data)
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
    if (role !== NetworkRole.HOST)
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

  onBeforeUnmount(() => {
    connections.forEach((conn) => conn.close())
    connections.clear()
    peer?.destroy()
  })

  // 啟動
  init()

  return {
    isReady,
    currentPeerId,
    sendWorldSnapshot,
    /** 暴露給 Host 在有人連線時，能夠主動派送 Snapshot 的方法。
     * 暫時由外部直接監聽，這邊提供 connections reference 以便未來擴充
     */
    connections,
  }
}
