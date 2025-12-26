import express from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

dotenv.config()

const app = express()
const server = http.createServer(app)
const prisma = new PrismaClient()

// Middleware
app.use(cors())
app.use(cors())
app.use(express.json())
app.use('/uploads', express.static('uploads'))

// Multer Config
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir)
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})

const upload = multer({ storage })

// Config
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Types
interface JwtPayload {
  userId: number
  username: string
  avatarUrl?: string | null
}

// Auth Middleware for Express
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) return res.sendStatus(401)

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}

/* ===========================
   AUTH ROUTES
   =========================== */

// Upload Avatar
// Upload Avatar
app.post('/api/users/avatar', upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    // Force forward slashes for URL compatibility
    const filename = req.file.filename
    const avatarUrl = `/uploads/${filename}`

    console.log('File uploaded:', avatarUrl)
    res.json({ avatarUrl })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Upload failed' })
  }
})

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, avatarUrl } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    const existingUser = await prisma.user.findUnique({ where: { username } })
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, avatarUrl },
    })

    const token = jwt.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, {
      expiresIn: '7d',
    })

    res.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, {
      expiresIn: '7d',
    })

    res.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Update Profile
app.put('/api/users/profile', authenticateToken, async (req: any, res: any) => {
  try {
    console.log('[DEBUG] Updating profile for:', req.user.username, 'Body:', req.body)
    const { username, avatarUrl } = req.body
    const userId = req.user.userId

    if (!username) {
      return res.status(400).json({ error: 'Username required' })
    }

    // Check availability if username changed
    if (username !== req.user.username) {
      const existing = await prisma.user.findUnique({ where: { username } })
      if (existing) return res.status(400).json({ error: 'Username taken' })
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { username, avatarUrl },
    })

    // Issue new token with updated info
    const token = jwt.sign({ userId: updatedUser.id, username: updatedUser.username, avatarUrl: updatedUser.avatarUrl }, JWT_SECRET, {
      expiresIn: '7d',
    })

    res.json({ token, user: { id: updatedUser.id, username: updatedUser.username, avatarUrl: updatedUser.avatarUrl } })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Get All Users (for sidebar)
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, avatarUrl: true },
      orderBy: { username: 'asc' }
    })
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Get Message History (Global or Private)
app.get('/api/messages', async (req, res) => {
  try {
    const { userId } = req.query
    const currentUserId = req.headers['x-user-id'] // Need to pass this from frontend if not using full auth middleware for this route yet

    let whereClause: any = { receiverId: null } // Default to global chat

    // If fetching private chat history
    if (userId && currentUserId) {
      const partnerId = parseInt(String(userId))
      const myId = parseInt(String(currentUserId))

      whereClause = {
        OR: [
          { senderId: myId, receiverId: partnerId },
          { senderId: partnerId, receiverId: myId }
        ]
      }
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      include: {
        sender: { select: { username: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' },
      take: 50
    })

    // Format for client
    const formatted = messages.map(m => ({
      user: m.sender.username,
      userAvatar: m.sender.avatarUrl,
      text: m.content,
      images: m.images ? JSON.parse(m.images) : undefined,
      timestamp: m.createdAt.getTime()
    }))

    res.json(formatted)
  } catch (error) {
    console.error('Fetch messages error:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

/* ===========================
   SOCKET.IO
   =========================== */

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
})

// Middleware to verify token on socket connection
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) return next(new Error('Authentication error'))

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return next(new Error('Authentication error'))
    socket.data.user = decoded // Store user info in socket
    next()
  })
})

const onlineUsers = new Map<number, string>() // userId -> socketId

io.on('connection', async (socket) => {
  const user = socket.data.user as JwtPayload
  console.log(`✅ User connected: ${user.username} (${user.userId})`)

  onlineUsers.set(user.userId, socket.id)
  io.emit('online-users', Array.from(onlineUsers.keys())) // Broadcast online users list

  // Join their own room for private messages
  socket.join(`user:${user.userId}`)

  // Handle new message
  socket.on('message', async (data: { text: string, images?: string[], receiverId?: number }) => {
    try {
      // Save to DB
      const savedMessage = await prisma.message.create({
        data: {
          content: data.text || '',
          images: data.images ? JSON.stringify(data.images) : null,
          senderId: user.userId,
          receiverId: data.receiverId || null
        },
        include: { sender: true }
      })

      const msgPayload = {
        user: user.username,
        userAvatar: (user as any).avatarUrl, // Need to add avatarUrl to jwt payload or fetch user? 
        // Better: Fetch user full details or include in JWT. Let's start with JWT/User object
        // Wait, socket.data.user comes from JWT. JWT doesn't have avatarUrl usually unless we add it.
        // Let's add it to JWT payload in login/register.
        // Or simpler: fetch user from DB here? No, expensive.
        // Let's add to JWT.
        text: data.text,
        images: data.images,
        timestamp: savedMessage.createdAt.getTime()
      }

      if (data.receiverId) {
        // Private Message
        io.to(`user:${data.receiverId}`).emit('message', msgPayload) // Send to receiver
        socket.emit('message', msgPayload) // Send back to sender (to show in UI)
      } else {
        // Global Message
        io.emit('message', msgPayload)
      }

    } catch (error) {
      console.error('Message save error:', error)
    }
  })

  // Typing events
  socket.on('typing', (data: { to?: number }) => {
    if (data.to) {
      io.to(`user:${data.to}`).emit('typing', user.username)
    } else {
      socket.broadcast.emit('typing', user.username)
    }
  })

  socket.on('stop-typing', (data: { to?: number }) => {
    if (data.to) {
      io.to(`user:${data.to}`).emit('stop-typing', user.username)
    } else {
      socket.broadcast.emit('stop-typing', user.username)
    }
  })

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${user.username}`)
    onlineUsers.delete(user.userId)
    io.emit('online-users', Array.from(onlineUsers.keys()))
  })
})

/* ===========================
   START SERVER
   =========================== */

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Chat Server running on port ${PORT} (v2)`)
})