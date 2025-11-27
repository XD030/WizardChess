// client/src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 在瀏覽器端建立 WebSocket 連線
 * 會依照現在頁面的 protocol 自動選 wss/ws，
 * host 則是 window.location.host（所以在本機 / Render 都不用改）
 */
export function createWebSocket(): WebSocket {
  if (typeof window === "undefined") {
    throw new Error("createWebSocket 只能在瀏覽器端呼叫");
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const url = `${protocol}//${host}/ws`;

  console.log("[WS] connecting to", url);
  return new WebSocket(url);
}
