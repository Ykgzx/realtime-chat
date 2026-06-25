'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSocket } from '@/lib/socket'
import { getApiUrl } from '@/lib/api'
import { X, Image as ImageIcon, Send, Loader2, LogOut, MessageSquare, Users, Settings, Menu, Check, CheckCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../auth-provider'
import { useRouter } from 'next/navigation'
import { ProfileModal } from '@/components/profile-modal'
import Swal from 'sweetalert2'

export interface ChatMessage {
  id?: number
  user: string
  userAvatar?: string | null
  text: string
  images?: string[]
  timestamp: number
  isPrivate?: boolean
  senderId?: number
  receiverId?: number | null
  readAt?: number | null
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
  return `${getApiUrl()}${url}`
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
  const [allUsers, setAllUsers] = useState<ChatUser[]>([])
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null) // null = Global Chat

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTypingRef = useRef(false)

  // Long press to delete state
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Unread counts: key is `userId` for DM or `'global'` for global chat
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Notification permission
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedUserRef = useRef<ChatUser | null>(null)

  const socket = getSocket()

  // Keep selectedUserRef in sync
  useEffect(() => {
    selectedUserRef.current = selectedUser
  }, [selectedUser])

  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => setNotifPermission(perm))
      }
    }
  }, [])

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  // Fetch Users
  useEffect(() => {
    if (!token) return
    fetch(`${getApiUrl()}/api/users`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllUsers(data.filter(u => u.username !== user?.username))
        }
      })
      .catch(err => console.error('Failed to load users', err))
  }, [token, user])

  // Show browser notification
  const showNotification = useCallback((title: string, body: string) => {
    if (notifPermission !== 'granted') return
    if (document.hasFocus()) return // Don't show if tab is focused and in the right chat

    try {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'chat-message', // Replace previous notification
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    } catch {
      // Notification failed silently (e.g. mobile browsers)
    }
  }, [notifPermission])

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
      const currentSelected = selectedUserRef.current
      const isFromMe = msg.user === user.username

      // Determine if this message belongs to the current view
      const isInCurrentView = (() => {
        if (msg.isPrivate) {
          // Private message: show only if I'm in the DM with this user
          if (!currentSelected) return false
          if (isFromMe) {
            // I sent it — show if I'm viewing the receiver's chat
            return currentSelected.id === msg.receiverId
          } else {
            // They sent it — show if I'm viewing the sender's chat
            return currentSelected.id === msg.senderId
          }
        } else {
          // Global message: show only if I'm in global view
          return !currentSelected
        }
      })()

      if (!isFromMe) {
        if (isInCurrentView) {
          // In current view — mark as read immediately
          if (msg.isPrivate && msg.senderId) {
            socket.emit('mark-read', { senderId: msg.senderId })
          }
        } else {
          // Not in current view — increment unread count
          const key = msg.isPrivate && msg.senderId ? String(msg.senderId) : 'global'
          setUnreadCounts(prev => ({
            ...prev,
            [key]: (prev[key] || 0) + 1
          }))

          // Show browser notification
          showNotification(
            msg.isPrivate ? `${msg.user} (DM)` : `${msg.user} in Global`,
            msg.text || '📷 Sent an image'
          )
        }

        // Clear typing indicator for this user
        setTypingUsers(prev => {
          const next = new Set(prev)
          next.delete(msg.user)
          return next
        })
      }

      // Only append if this message belongs to the current view
      if (isInCurrentView) {
        setMessages(prev => [...prev, msg])
      }
    }

    const handleTyping = (username: string) => {
      if (username === user.username) return
      setTypingUsers(prev => new Set(prev).add(username))
    }

    const handleStopTyping = (username: string) => {
      setTypingUsers(prev => {
        const next = new Set(prev)
        next.delete(username)
        return next
      })
    }

    const handleMessageRead = (data: { readBy: number; readAt: number }) => {
      // Update all messages sent by me to this user as read
      setMessages(prev => prev.map(msg => {
        if (msg.user === user.username && msg.senderId === user.id && !msg.readAt) {
          return { ...msg, readAt: data.readAt }
        }
        return msg
      }))
    }

    const handleMessageDeleted = (data: { messageId: number }) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.messageId))
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('online-users', handleOnlineUsers)
    socket.on('message', handleMessage)
    socket.on('typing', handleTyping)
    socket.on('stop-typing', handleStopTyping)
    socket.on('message-read', handleMessageRead)
    socket.on('message-deleted', handleMessageDeleted)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('online-users', handleOnlineUsers)
      socket.off('message', handleMessage)
      socket.off('typing', handleTyping)
      socket.off('stop-typing', handleStopTyping)
      socket.off('message-read', handleMessageRead)
      socket.off('message-deleted', handleMessageDeleted)
      socket.disconnect()
    }
  }, [token, user, showNotification])

  // Fetch History when switching rooms
  useEffect(() => {
    if (!user) return

    setMessages([]) // Clear old messages
    setTypingUsers(new Set()) // Clear typing indicators

    const url = selectedUser
      ? `${getApiUrl()}/api/messages?userId=${selectedUser.id}`
      : `${getApiUrl()}/api/messages`

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

    // Clear unread count for this chat
    if (selectedUser) {
      setUnreadCounts(prev => {
        const next = { ...prev }
        delete next[String(selectedUser.id)]
        return next
      })
      // Mark messages as read
      socket.emit('mark-read', { senderId: selectedUser.id })
    } else {
      setUnreadCounts(prev => {
        const next = { ...prev }
        delete next['global']
        return next
      })
    }

  }, [selectedUser, user, token])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsers])

  // Typing event handler with debounce
  const handleTypingEmit = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing', { to: selectedUser?.id })
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set new timeout to stop typing after 2s of no input
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('stop-typing', { to: selectedUser?.id })
    }, 2000)
  }, [selectedUser, socket])

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

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    isTypingRef.current = false
    socket.emit('stop-typing', { to: selectedUser?.id })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value)
    if (e.target.value.trim()) {
      handleTypingEmit()
    }
  }

  const handleDeletePrompt = async (msgId: number) => {
    const result = await Swal.fire({
      title: 'ลบข้อความ?',
      text: 'ข้อความนี้จะถูกลบถาวร',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#475569',
      confirmButtonText: 'ลบเลย',
      cancelButtonText: 'ยกเลิก',
      background: '#1e293b',
      color: '#f1f5f9',
      customClass: {
        popup: 'rounded-2xl border border-slate-700',
      }
    })
    if (result.isConfirmed) {
      socket.emit('delete-message', { messageId: msgId })
    }
  }

  const handlePressStart = (msgId?: number, isMe?: boolean) => {
    if (!msgId || !isMe) return
    pressTimerRef.current = setTimeout(() => {
      handleDeletePrompt(msgId)
    }, 800) // 800ms
  }

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
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

  // Filter typing users relevant to current view
  const relevantTypingUsers = Array.from(typingUsers)

  // Total unread count for all chats
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0)

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
          {/* Global Chat */}
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
            <div className="flex-1 min-w-0">
              <div className="font-medium">Global Chat</div>
              <div className="text-xs text-slate-400">Public room</div>
            </div>
            {(unreadCounts['global'] || 0) > 0 && (
              <div className="unread-badge min-w-[20px] h-5 px-1.5 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-bold">
                {unreadCounts['global']}
              </div>
            )}
          </div>

          <div className="px-3 pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Direct Messages
          </div>

          {allUsers.map(u => {
            const isOnline = activeUserIds.includes(u.id)
            const unread = unreadCounts[String(u.id)] || 0
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
                {unread > 0 && (
                  <div className="unread-badge min-w-[20px] h-5 px-1.5 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-bold">
                    {unread}
                  </div>
                )}
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
            className="p-2 hover:bg-slate-700 rounded-lg transition relative"
          >
            <Menu size={24} />
            {totalUnread > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold">
                {totalUnread}
              </div>
            )}
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
                  {relevantTypingUsers.includes(selectedUser.username) ? (
                    <span className="text-xs text-indigo-400 flex items-center gap-1">
                      typing
                      <span className="flex gap-0.5 ml-0.5">
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Private Conversation</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Global Chat</h2>
                  {relevantTypingUsers.length > 0 ? (
                    <span className="text-xs text-indigo-400 flex items-center gap-1">
                      {relevantTypingUsers.join(', ')} typing
                      <span className="flex gap-0.5 ml-0.5">
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Public room for everyone</span>
                  )}
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
              <div key={msg.id || i} className={`group flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
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

                  <div 
                    className={`relative px-4 py-3 rounded-2xl shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm select-none cursor-pointer' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}
                    onTouchStart={() => handlePressStart(msg.id, isMe)}
                    onTouchEnd={handlePressEnd}
                    onTouchMove={handlePressEnd}
                    onMouseDown={() => handlePressStart(msg.id, isMe)}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onContextMenu={(e) => {
                      if (isMe) e.preventDefault() // prevent context menu on mobile
                    }}
                  >
                    {msg.images && msg.images.map((img, idx) => (
                      <img key={idx} src={img} alt={`Shared image ${idx + 1}`} className="max-w-full rounded-lg mb-2 cursor-pointer hover:opacity-90" onClick={(e) => { e.stopPropagation(); window.open(img); }} />
                    ))}
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                    {/* Delete button — only on my messages */}
                    {isMe && msg.id && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          handleDeletePrompt(msg.id!)
                        }}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        title="Delete message"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Read Receipt — only show on my messages in private chats */}
                  {isMe && msg.isPrivate && (
                    <div className={`flex items-center gap-0.5 mt-1 read-check ${msg.readAt ? 'text-sky-400' : 'text-slate-500'}`}>
                      {msg.readAt ? (
                        <>
                          <CheckCheck size={14} />
                          <span className="text-[10px]">Read</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span className="text-[10px]">Sent</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing Bubble */}
          {relevantTypingUsers.length > 0 && (
            <div className="flex items-end gap-3 typing-bubble">
              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
                {relevantTypingUsers[0].substring(0, 2).toUpperCase()}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-xs text-slate-400 mb-1">{relevantTypingUsers.join(', ')}</span>
                <div className="bg-slate-800 px-5 py-3.5 rounded-2xl rounded-tl-sm shadow-sm">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              </div>
            </div>
          )}

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
              onChange={handleInputChange}
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