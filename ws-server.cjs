// ws-server.cjs
// 簡單的多房間 WebSocket 伺服器：用「密碼」當房間 key

const { WebSocketServer } = require('ws');

const PORT = 3001;

// path: '/ws' 要跟前端的 ws://localhost:3001/ws 一樣
const wss = new WebSocketServer({ port: PORT, path: '/ws' });

/**
 * rooms: Map<roomKey, { password: string, clients: Set<WebSocket>, state: any | null }>
 * roomKey 這裡就直接用 password（空字串表示公共房間）
 */
const rooms = new Map();

function getRoomKeyFromMessage(msg) {
  // 只用 password 當房間 key，空字串代表「無密碼房間」
  const password = typeof msg.password === 'string' ? msg.password : '';
  return password;
}

wss.on('connection', (ws) => {
  console.log('[WS] client connected');

  ws.currentRoomKey = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      console.error('[WS] invalid JSON:', err);
      return;
    }

    // --------- 加入 / 建立 房間 ---------
    if (msg.type === 'joinRoom') {
      const roomKey = getRoomKeyFromMessage(msg);
      const password = typeof msg.password === 'string' ? msg.password : '';

      let room = rooms.get(roomKey);

      if (!room) {
        // 房間不存在 → 直接建立
        room = {
          password,
          clients: new Set(),
          state: null, // 還沒有棋局狀態，等第一個人送 state
        };
        rooms.set(roomKey, room);
        console.log(`[WS] created room with password="${password}"`);
      } else {
        // 房間已經存在，如果你之後想嚴格比對密碼，可以在這邊檢查
        // 現在 roomKey 就是 password，所以一定相同，這邊就不再檢查
        console.log(`[WS] joined existing room password="${password}"`);
      }

      // 把這個 client 加進房間
      room.clients.add(ws);
      ws.currentRoomKey = roomKey;

      // 回傳目前房間狀態（null 代表全新房間）
      ws.send(
        JSON.stringify({
          type: 'roomJoined',
          password,
          state: room.state, // 可能是 null 或上一局狀態
        }),
      );

      console.log(
        `[WS] room "${roomKey}" now has ${room.clients.size} client(s)`,
      );

      return;
    }

    // --------- 收到棋局狀態，同步給同房間所有人 ---------
    if (msg.type === 'state') {
      const roomKey = ws.currentRoomKey;
      if (!roomKey) {
        console.warn('[WS] got state but client is not in a room');
        return;
      }

      const room = rooms.get(roomKey);
      if (!room) {
        console.warn('[WS] got state but room not found:', roomKey);
        return;
      }

      // 更新房間內最新棋局狀態
      room.state = msg.state;

      // 廣播給此房間所有玩家（包含自己）
      const payload = JSON.stringify({
        type: 'state',
        state: msg.state,
      });

      for (const client of room.clients) {
        if (client.readyState === client.OPEN) {
          client.send(payload);
        }
      }
      return;
    }

    console.log('[WS] unknown message type:', msg.type);
  });

  ws.on('close', () => {
    const roomKey = ws.currentRoomKey;
    if (!roomKey) {
      console.log('[WS] client closed without joining room');
      return;
    }

    const room = rooms.get(roomKey);
    if (!room) return;

    room.clients.delete(ws);
    console.log(
      `[WS] client left room "${roomKey}", left=${room.clients.size}`,
    );

    // 房間沒人了就刪掉
    if (room.clients.size === 0) {
      rooms.delete(roomKey);
      console.log(`[WS] room "${roomKey}" removed (empty)`);
    }
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
