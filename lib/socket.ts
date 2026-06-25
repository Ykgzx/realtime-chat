import { io, Socket } from 'socket.io-client'
import { getApiUrl } from './api'

let socket: Socket | null = null

export const getSocket = (): Socket => {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || getApiUrl()
    socket = io(url, {
      autoConnect: false,
    })
  }
  return socket
}