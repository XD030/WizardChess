// ws-server.cjs
// 簡單多房間 WebSocket 伺服器：用「密碼」當房間 key

const { WebSocketServer, WebSocket } = require("ws");

/**
 * rooms: Map<roomKey, Room>
 * Room = {
 *   password: string;
 *   clients: Set<WebSocket>;
 *   state?: any;
 * }
 */
const rooms = new Map();

/**
 * 把 WebSocketServer 掛到既有的 HTTP server 上
 * @param {import("http").Server} server
 */
function setupWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws", // 要跟前端 createWebSocket 的 /ws 一樣
  });

  console.log("[WS] WebSocket server attached on /ws");

  wss.on("connection", (socket) => {
    console.log("[WS] 新連線");
    let joinedRoomKey = null;

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // ====== 加入 / 建立房間 ======
        if (msg.type === "joinRoom") {
          const roomKey = String(msg.password || "").trim();
          if (!roomKey) {
            socket.send(
              JSON.stringify({
                type: "error",
                message: "房間密碼不可為空",
              })
            );
            return;
          }

          joinedRoomKey = roomKey;

          let room = rooms.get(roomKey);
          if (!room) {
            room = {
              password: roomKey,
              clients: new Set(),
              state: null,
            };
            rooms.set(roomKey, room);
          }

          room.clients.add(socket);

          // 把目前 state 回給新進房的人（沒有就給 null）
          socket.send(
            JSON.stringify({
              type: "roomJoined",
              state: room.state ?? null,
            })
          );

          return;
        }

        // ====== 同步棋局狀態 ======
        if (msg.type === "state") {
          if (!joinedRoomKey) return;

          const room = rooms.get(joinedRoomKey);
          if (!room) return;

          room.state = msg.state;

          const payload = JSON.stringify({
            type: "state",
            state: room.state,
          });

          // 用 forEach，避免 TS downlevelIteration 的問題
          room.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          });

          return;
        }
      } catch (err) {
        console.error("[WS] message parse error", err);
      }
    });

    socket.on("close", () => {
      if (!joinedRoomKey) return;
      const room = rooms.get(joinedRoomKey);
      if (!room) return;

      room.clients.delete(socket);

      // 房間裡沒人就刪掉
      if (room.clients.size === 0) {
        rooms.delete(joinedRoomKey);
      }
    });
  });
}

module.exports = { setupWebSocketServer };
