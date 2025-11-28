// server/ws-server.ts
import { WebSocketServer } from 'ws'
import type { WebSocket as WsWebSocket } from 'ws'

type SyncedState = any // 你如果有真正的 SyncedState 型別可以改掉這行

type RoomInfo = {
  password: string
  clients: Set<WsWebSocket>
  state?: SyncedState
}

// 用密碼當 room key
const rooms = new Map<string, RoomInfo>()

function getOrCreateRoom(roomKey: string, password: string): RoomInfo {
  const existing = rooms.get(roomKey)
  if (existing) return existing

  const room: RoomInfo = {
    password,
    clients: new Set<WsWebSocket>(),
  }
  rooms.set(roomKey, room)
  return room
}

function broadcastRoomState(roomKey: string) {
  const room = rooms.get(roomKey)
  if (!room || !room.state) return

  const payload = JSON.stringify({
    type: 'state',
    state: room.state,
  })

  // 用 forEach 避開 downlevelIteration 的警告
  room.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload)
    }
  })
}

export function setupWebSocketServer(server: import('http').Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
  })

  wss.on('connection', (ws: WsWebSocket) => {
    let joinedRoomKey: string | null = null

    ws.on('message', (raw) => {
      let msg: any
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (msg.type === 'joinRoom') {
        const roomKey = String(msg.password || '').trim()
        if (!roomKey) {
          ws.send(
            JSON.stringify({ type: 'error', message: '房間密碼不可為空' }),
          )
          return
        }

        const room = getOrCreateRoom(roomKey, roomKey)
        room.clients.add(ws)
        joinedRoomKey = roomKey

        ws.send(
          JSON.stringify({
            type: 'roomJoined',
            state: room.state ?? null,
          }),
        )
        return
      }

      if (msg.type === 'state' && joinedRoomKey) {
        const room = rooms.get(joinedRoomKey)
        if (!room) return

        room.state = msg.state as SyncedState
        broadcastRoomState(joinedRoomKey)
        return
      }
    })

    ws.on('close', () => {
      if (!joinedRoomKey) return

      const room = rooms.get(joinedRoomKey)
      if (!room) return

      room.clients.delete(ws)

      // 房間沒人了可以選擇刪掉（可留可不留）
      if (room.clients.size === 0) {
        rooms.delete(joinedRoomKey)
      }
    })
  })
}
