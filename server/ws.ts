// server/ws.ts
// 把原本 ws-server.cjs 的邏輯，改成掛在現有的 HTTP server 上

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface Room {
  password: string;
  clients: Set<ExtWebSocket>;
  state: any | null;
}

type ExtWebSocket = WebSocket & {
  currentRoomKey?: string | null;
};

// rooms: Map<roomKey, Room>
// roomKey 直接用 password（空字串表示公共房間）
const rooms = new Map<string, Room>();

function getRoomKeyFromMessage(msg: any): string {
  const password = typeof msg.password === "string" ? msg.password : "";
  return password;
}

export function setupWsServer(server: Server) {
  // 不再自己開新 port，而是掛在現有的 HTTP server 上
  const wss = new WebSocketServer({
    noServer: true,
    path: "/ws", // 要跟前端 ws://localhost:5000/ws 一樣
  });

  // 處理 HTTP upgrade → WebSocket
  server.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.startsWith("/ws")) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (wsRaw) => {
    const ws = wsRaw as ExtWebSocket;
    console.log("[WS] client connected");

    ws.currentRoomKey = null;

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err) {
        console.error("[WS] invalid JSON:", err);
        return;
      }

      // --------- 加入 / 建立 房間 ---------
      if (msg.type === "joinRoom") {
        const roomKey = getRoomKeyFromMessage(msg);
        const password =
          typeof msg.password === "string" ? msg.password : "";

        let room = rooms.get(roomKey);

        if (!room) {
          // 房間不存在 → 建立
          room = {
            password,
            clients: new Set<ExtWebSocket>(),
            state: null,
          };
          rooms.set(roomKey, room);
          console.log(`[WS] created room with password="${password}"`);
        } else {
          console.log(
            `[WS] joined existing room password="${password}"`
          );
        }

        room.clients.add(ws);
        ws.currentRoomKey = roomKey;

        // 把目前房間狀態（可能是 null）回傳
        ws.send(
          JSON.stringify({
            type: "roomJoined",
            password,
            state: room.state,
          })
        );

        console.log(
          `[WS] room "${roomKey}" now has ${room.clients.size} client(s)`
        );

        return;
      }

      // --------- 收到棋局狀態，同步給同房間所有人 ---------
      if (msg.type === "state") {
        const roomKey = ws.currentRoomKey;
        if (!roomKey) {
          console.warn("[WS] got state but client is not in a room");
          return;
        }

        const room = rooms.get(roomKey);
        if (!room) {
          console.warn("[WS] got state but room not found:", roomKey);
          return;
        }

        // 更新房間最新棋局狀態
        room.state = msg.state;

        const payload = JSON.stringify({
          type: "state",
          state: msg.state,
        });

        for (const client of room.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
        return;
      }

      console.log("[WS] unknown message type:", msg.type);
    });

    ws.on("close", () => {
      const roomKey = ws.currentRoomKey;
      if (!roomKey) {
        console.log("[WS] client closed without joining room");
        return;
      }

      const room = rooms.get(roomKey);
      if (!room) return;

      room.clients.delete(ws);
      console.log(
        `[WS] client left room "${roomKey}", left=${room.clients.size}`
      );

      // 房間沒人了就移除
      if (room.clients.size === 0) {
        rooms.delete(roomKey);
        console.log(`[WS] room "${roomKey}" removed (empty)`);
      }
    });
  });

  console.log('[WS] WebSocket server attached on "/ws"');
}
