import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 這是新的 WebSocket 工具函式
export function createWebSocket(): WebSocket {
  if (typeof window === "undefined") {
    throw new Error("createWebSocket 只能在瀏覽器端呼叫")
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const host = window.location.host // 例如 wizardchess.onrender.com
  const url = `${protocol}//${host}/ws`

  console.log("[WS] connecting to", url)
  return new WebSocket(url)
}