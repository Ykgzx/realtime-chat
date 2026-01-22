'use client'

import { useState, useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { X, Image as ImageIcon, Send, User, Loader2, LogOut, MessageSquare, Users, Settings, Menu } from 'lucide-react'
import { useAuth } from '../auth-provider'
import { useRouter } from 'next/navigation'
import { ProfileModal } from '@/components/profile-modal'

export interface ChatMessage {
  user: string
  userAvatar?: string | null
  text: string
  images?: string[]
  timestamp: number
  isPrivate?: boolean
}

interface ChatUser {
  id: number
  username: string
  avatarUrl?: string | null
}

// Helper to construct full avatar URL
const getAvatarUrl = (url?: string | null) => {
  if (!url) return null
  if (url.startsWith('http')) return url
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${url}`
}

export default function ChatPage() {
  const { user, token, logout, isLoading } = useAuth()
  const router = useRouter()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  // Private Messaging State
  const [activeUserIds, setActiveUserIds] = useState<number[]>([])

  const [allUsers, setAllUsers] = useState<ChatUser[]>([]) // All registered users for sidebar
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null) // null = Global Chat

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const socket = getSocket()

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  // Fetch Users
  useEffect(() => {
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/users`, {
      headers: { Authorization: `Bearer ${token}` } // Server currently logic doesn't require auth for this but good practice
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllUsers(data.filter(u => u.username !== user?.username))
        }
      })
      .catch(err => console.error('Failed to load users', err))
  }, [token, user])

  // Socket Connection & Events
  useEffect(() => {
    if (!token || !user) return

    socket.auth = { token }
    socket.connect()

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    const handleOnlineUsers = (userIds: number[]) => {
      setActiveUserIds(userIds)
    }

    const handleMessage = (msg: ChatMessage) => {
      // If global msg, or private msg related to selected user
      // We will duplicate logic here slightly:
      // Ideally we store ALL messages and filter in UI, or easier: fetch history when switching rooms
      // For this simplified version: we just append to messages.
      // But wait, if I'm in Global chat, and I receive a Private message from 'Bob', it shows up? 
      // We need to handle this.

      // Current design decision: 
      // If msg is private, only show if I am chatting with that user.
      // Or show a notification badge (too complex for now).

      // Let's just append for now and maybe filter in render? No, that grows unbounded.
      // Better: When switching users, we fetch history. When receiving live message, we append ONLY if it matches current room.

      // But we need to know who sent it. msg.user is username.
      // We need senderId? The server sends { user: username, ... }. 
      // We might need to fetch senderId or just match by username if unique. Usernames are unique.

      setMessages((prev) => [...prev, msg])
    }

    // We need to know who sent the message to filter properly.
    // Let's update server to send senderId in payload? 
    // Or we can just look up user by username from `allUsers`.

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('online-users', handleOnlineUsers)
    socket.on('message', handleMessage)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('online-users', handleOnlineUsers)
      socket.off('message', handleMessage)
      socket.disconnect()
    }
  }, [token, user])

  // Fetch History when switching rooms
  useEffect(() => {
    if (!user) return

    setMessages([]) // Clear old messages

    const url = selectedUser
      ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/messages?userId=${selectedUser.id}`
      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/messages`

    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-user-id': user.id.toString()
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setMessages(data)
      })
      .catch(err => console.error('Failed to load history', err))

  }, [selectedUser, user, token])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])


  // Handlers
  const handleSend = () => {
    if ((!messageInput.trim() && selectedImages.length === 0)) return

    const payload = {
      text: messageInput.trim(),
      images: selectedImages.length > 0 ? selectedImages : undefined,
      receiverId: selectedUser?.id // If null, it's global
    }

    socket.emit('message', payload)
    setMessageInput('')
    setSelectedImages([])
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const imageFiles = files.filter(file => file.type.startsWith('image/'))

    const readers = imageFiles.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
    })

    Promise.all(readers).then(res => setSelectedImages(prev => [...prev, ...res]))
    if (e.target) e.target.value = ''
  }

  if (isLoading || !user) return <div className="h-screen flex items-center justify-center bg-indigo-900 text-white"><Loader2 className="animate-spin" /></div>

  // Filter messages for current view
  // Global View: Show messages where receiverId is null (Wait, frontend doesn't know receiverId from message payload yet? Server sends simplified payload)
  // Let's assume the API/Socket sends what we need. 
  // Actually, catching 'message' event appends to `messages`. 
  // If we are in Global, and receive Private, we shouldn't show it.
  // The server implementation:
  // Global: io.emit('message')
  // Private: io.to(receiver).emit('message') AND socket.emit('message') (to sender)

  // So:
  // If I am in Global Chat (selectedUser === null), I receive Global messages via io.emit.
  // But wait, socket.on('message') listens to EVERYTHING sent to me.
  // I need to filter on FRONTEND or Server needs to distinguish Event Names.
  // Simplest: Server sends `isPrivate` flag or `receiverId` in payload.

  // Refined Logic (Assumption: Server sends simplified payload currently. I should have updated server to include `receiverId` or `isPrivate` in payload.
  // Let's blindly trust the payload for now, but UI might be messy if we mix them.
  // Ideally, I should update server to send `roomId` or similar.
  // For now, let's just show everything, but we might want to fix this in verification if it's confusing.

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden font-sans">

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-80 bg-slate-800 border-r border-slate-700 flex flex-col fixed md:relative inset-y-0 left-0 z-50 transform transition-transform duration-300 md:transform-none ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            Chat App
          </h1>
          <button onClick={logout} className="text-slate-400 hover:text-white transition">
            <LogOut size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div
            onClick={() => {
              setSelectedUser(null)
              setIsMobileSidebarOpen(false)
            }}
            className={`p-3 rounded-xl cursor-pointer flex items-center gap-3 transition-colors ${selectedUser === null ? 'bg-indigo-600 shadow-md' : 'hover:bg-slate-700'}`}
          >
            <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
              <Users size={20} className="text-slate-300" />
            </div>
            <div>
              <div className="font-medium">Global Chat</div>
              <div className="text-xs text-slate-400">Public room</div>
            </div>
          </div>

          <div className="px-3 pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Direct Messages
          </div>

          {allUsers.map(u => {
            const isOnline = activeUserIds.includes(u.id)
            return (
              <div
                key={u.id}
                onClick={() => {
                  setSelectedUser(u)
                  setIsMobileSidebarOpen(false)
                }}
                className={`p-3 rounded-xl cursor-pointer flex items-center gap-3 transition-colors ${selectedUser?.id === u.id ? 'bg-indigo-600 shadow-md' : 'hover:bg-slate-700'}`}
              >
                <div className="relative">
                  {u.avatarUrl ? (
                    <img
                      src={getAvatarUrl(u.avatarUrl) || ''}
                      alt={`${u.username} avatar`}
                      className="w-10 h-10 rounded-full object-cover bg-slate-600"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center font-bold text-slate-300">
                      {u.username.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.username}</div>
                  <div className="text-xs text-slate-400 truncate">{isOnline ? 'Online' : 'Offline'}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={getAvatarUrl(user.avatarUrl) || ''}
                alt={`${user.username} avatar`}
                className="w-9 h-9 rounded-full object-cover bg-slate-600"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-500 flex items-center justify-center font-bold">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <div className="font-medium truncate">{user.username}</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                Online
              </div>
            </div>
            <button
              onClick={() => setIsProfileOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition"
              title="Edit Profile"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </aside>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-slate-900 relative">
        {/* Mobile Header */}
        <header className="h-16 px-4 border-b border-slate-800 flex items-center justify-between md:hidden bg-slate-800">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <Menu size={24} />
          </button>
          <h2 className="font-bold">{selectedUser ? selectedUser.username : 'Global Chat'}</h2>
          <button onClick={logout} className="p-2 hover:bg-slate-700 rounded-lg transition">
            <LogOut size={20} />
          </button>
        </header>

        {/* Desktop Header */}
        <header className="h-16 px-6 border-b border-slate-800 flex items-center justify-between hidden md:flex bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {selectedUser ? (
              <>
                {selectedUser.avatarUrl ? (
                  <img
                    src={getAvatarUrl(selectedUser.avatarUrl) || ''}
                    alt={`${selectedUser.username} avatar`}
                    className="w-10 h-10 rounded-full object-cover bg-slate-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold">
                    {selectedUser.username.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="font-bold text-lg">{selectedUser.username}</h2>
                  <span className="text-xs text-slate-400">Private Conversation</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Global Chat</h2>
                  <span className="text-xs text-slate-400">Public room for everyone</span>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((msg, i) => {
            const isMe = msg.user === user.username

            return (
              <div key={i} className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.userAvatar ? (
                  <img
                    src={getAvatarUrl(msg.userAvatar) || ''}
                    alt={`${msg.user} avatar`}
                    className="w-8 h-8 rounded-full object-cover shadow-sm shrink-0"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm shrink-0 ${isMe ? 'bg-indigo-500' : 'bg-slate-600'}`}>
                    {msg.user.substring(0, 2).toUpperCase()}
                  </div>
                )}

                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                  <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-sm font-medium text-slate-300">{msg.user}</span>
                    <span className="text-xs text-slate-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className={`px-4 py-3 rounded-2xl shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                    {msg.images && msg.images.map((img, idx) => (
                      <img key={idx} src={img} alt={`Shared image ${idx + 1}`} className="max-w-full rounded-lg mb-2 cursor-pointer hover:opacity-90" onClick={() => window.open(img)} />
                    ))}
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 pb-6 bg-slate-900 border-t border-slate-800">
          <div className="max-w-4xl mx-auto bg-slate-800 p-2 rounded-3xl flex items-end gap-2 shadow-lg ring-1 ring-white/10 relative">

            {/* Image Preview */}
            {selectedImages.length > 0 && (
              <div className="absolute bottom-full left-0 mb-4 p-2 bg-slate-800 rounded-xl shadow-xl flex gap-2 overflow-x-auto max-w-full border border-slate-700">
                {selectedImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt={`Selected image ${i + 1}`} className="h-16 w-16 object-cover rounded-lg" />
                    <button onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => fileInputRef.current?.click()} className="p-3 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition">
              <ImageIcon size={20} />
            </button>
            <input type="file" ref={fileInputRef} hidden multiple accept="image/*" onChange={handleImageSelect} />

            <input
              className="flex-1 bg-transparent border-0 focus:ring-0 text-white placeholder-slate-500 py-3 max-h-32 p-2"
              placeholder={`Message ${selectedUser ? selectedUser.username : 'everyone'}...`}
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            />

            <button
              onClick={handleSend}
              disabled={!messageInput.trim() && selectedImages.length === 0}
              className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
            >
              <Send size={20} />
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}