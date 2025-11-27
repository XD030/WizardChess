import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createWebSocket(): WebSocket {
  if (typeof window === "undefined") {
    throw new Error("createWebSocket 只能在瀏覽器端呼叫")
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const host = window.location.host
  const url = `${protocol}//${host}/ws`

  console.log("[WS] connecting to", url)
  return new WebSocket(url)
}
