import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import next from 'next'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { networkInterfaces } from 'os'

dotenv.config()

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const prisma = new PrismaClient()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Helper: Get LAN IP (for logging)
const getLocalIpAddress = () => {
    const nets = networkInterfaces()
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address
            }
        }
    }
    return 'localhost'
}

app.prepare().then(() => {
    const server = express()
    const httpServer = http.createServer(server)
    const io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all for mobile/LAN access
            methods: ["GET", "POST"]
        }
    })

    // Middleware
    server.use(cors())
    server.use(express.json())
    server.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

    // Multer Config
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = path.join(process.cwd(), 'uploads')
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true })
            }
            cb(null, uploadDir)
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + path.extname(file.originalname))
        }
    })
    const upload = multer({ storage })

    // Types
    interface JwtPayload {
        userId: number
        username: string
        avatarUrl?: string | null
    }

    // Middleware: Auth
    const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        if (!token) return res.sendStatus(401)
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ; (req as any).user = user
            next()
        })
    }

    /* ===========================
       API ROUTES
       =========================== */

    // Upload Avatar
    server.post('/api/users/avatar', upload.single('avatar'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' })
            }
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
    server.post('/api/auth/register', async (req: express.Request, res: express.Response) => {
        try {
            const { username, password, avatarUrl } = req.body
            if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
            const existingUser = await prisma.user.findUnique({ where: { username } })
            if (existingUser) return res.status(400).json({ error: 'Username already taken' })
            const hashedPassword = await bcrypt.hash(password, 10)
            const user = await prisma.user.create({
                data: { username, password: hashedPassword, avatarUrl },
            })
            const token = jwt.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, { expiresIn: '7d' })
            res.json({ token, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } })
        } catch (error) {
            console.error('Register error:', error)
            res.status(500).json({ error: 'Registration failed' })
        }
    })

    // Login
    server.post('/api/auth/login', async (req: express.Request, res: express.Response) => {
        try {
            const { username, password } = req.body
            const user = await prisma.user.findUnique({ where: { username } })
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ error: 'Invalid credentials' })
            }
            const token = jwt.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, { expiresIn: '7d' })
            res.json({ token, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } })
        } catch (error) {
            console.error('Login error:', error)
            res.status(500).json({ error: 'Login failed' })
        }
    })

    // Update Profile
    server.put('/api/users/profile', authenticateToken, async (req: express.Request, res: express.Response) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqUser = (req as any).user
            console.log('[DEBUG] Updating profile for:', reqUser.username, 'Body:', req.body)
            const { username, avatarUrl } = req.body
            const userId = reqUser.userId
            if (!username) return res.status(400).json({ error: 'Username required' })
            if (username !== reqUser.username) {
                const existing = await prisma.user.findUnique({ where: { username } })
                if (existing) return res.status(400).json({ error: 'Username taken' })
            }
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: { username, avatarUrl },
            })
            const token = jwt.sign({ userId: updatedUser.id, username: updatedUser.username, avatarUrl: updatedUser.avatarUrl }, JWT_SECRET, { expiresIn: '7d' })
            res.json({ token, user: { id: updatedUser.id, username: updatedUser.username, avatarUrl: updatedUser.avatarUrl } })
        } catch (error) {
            console.error('Profile update error:', error)
            res.status(500).json({ error: 'Update failed' })
        }
    })

    // Get All Users (for sidebar)
    server.get('/api/users', async (req: express.Request, res: express.Response) => {
        try {
            const users = await prisma.user.findMany({
                select: { id: true, username: true, avatarUrl: true },
                orderBy: { username: 'asc' }
            })
            res.json(users)
        } catch (error) {
            console.error('Fetch users error:', error)
            res.status(500).json({ error: 'Failed to fetch users' })
        }
    })

    // Get Message History
    server.get('/api/messages', async (req: express.Request, res: express.Response) => {
        try {
            const { userId } = req.query
            const currentUserId = req.headers['x-user-id']

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let whereClause: any = { receiverId: null }

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
                include: { sender: { select: { username: true, avatarUrl: true } } },
                orderBy: { createdAt: 'asc' },
                take: 50
            })

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const formatted = messages.map((m: any) => ({
                id: m.id,
                user: m.sender.username,
                userAvatar: m.sender.avatarUrl,
                text: m.content,
                images: m.images ? JSON.parse(m.images) : undefined,
                timestamp: m.createdAt.getTime(),
                senderId: m.senderId,
                receiverId: m.receiverId,
                isPrivate: m.isPrivate,
                readAt: m.readAt ? m.readAt.getTime() : null
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
    const onlineUsers = new Map<number, string>() // { userId -> socketId }

    io.on('connection', async (socket) => {
        const token = socket.handshake.auth.token
        if (!token) return socket.disconnect()

        let user: JwtPayload
        try {
            user = jwt.verify(token, JWT_SECRET) as JwtPayload
        } catch (err) {
            console.error('Socket auth error:', err)
            return socket.disconnect()
        }

        onlineUsers.set(user.userId, socket.id)
        io.emit('online-users', Array.from(onlineUsers.keys()))

        // Send message history
        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { isPrivate: false },
                    { senderId: user.userId },
                    { receiverId: user.userId }
                ]
            },
            include: { sender: { select: { username: true, avatarUrl: true } } },
            orderBy: { createdAt: 'asc' },
            take: 100
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.emit('history', messages.map((m: any) => ({
            id: m.id,
            user: m.sender.username,
            userAvatar: m.sender.avatarUrl,
            text: m.content,
            time: m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isPrivate: m.isPrivate,
            receiverId: m.receiverId,
            senderId: m.senderId
        })))

        socket.on('message', async (data: { text: string; to?: number; receiverId?: number; images?: string[] }) => {
            try {
                const receiverId = data.receiverId || data.to
                const newMessage = await prisma.message.create({
                    data: {
                        content: data.text || '',
                        senderId: user.userId,
                        isPrivate: !!receiverId,
                        receiverId: receiverId ? Number(receiverId) : null,
                        images: data.images ? JSON.stringify(data.images) : null
                    },
                    include: { sender: { select: { username: true, avatarUrl: true } } }
                })

                const msgPayload = {
                    id: newMessage.id,
                    user: user.username,
                    userAvatar: user.avatarUrl,
                    text: newMessage.content,
                    images: data.images,
                    timestamp: newMessage.createdAt.getTime(),
                    isPrivate: newMessage.isPrivate,
                    senderId: user.userId,
                    receiverId: receiverId ? Number(receiverId) : null,
                    readAt: null as number | null
                }

                if (receiverId) {
                    const receiverSocketId = onlineUsers.get(Number(receiverId))
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit('message', msgPayload)
                    }
                    socket.emit('message', msgPayload)
                } else {
                    io.emit('message', msgPayload)
                }
            } catch (error) {
                console.error('Message save error:', error)
            }
        })

        socket.on('typing', (data: { to?: number }) => {
            if (data.to) {
                io.to(`user:${data.to}`).emit('typing', user.username) // Note: Requires joining user rooms if not using socket.id map directly
                // Using broadcast to all for simplicity or user specific rooms?
                // The original code used io.to(socketId).
                const receiverSocketId = onlineUsers.get(Number(data.to))
                if (receiverSocketId) io.to(receiverSocketId).emit('typing', user.username)
            } else {
                socket.broadcast.emit('typing', user.username)
            }
        })

        socket.on('stop-typing', (data: { to?: number }) => {
            if (data.to) {
                const receiverSocketId = onlineUsers.get(Number(data.to))
                if (receiverSocketId) io.to(receiverSocketId).emit('stop-typing', user.username)
            } else {
                socket.broadcast.emit('stop-typing', user.username)
            }
        })

        // Mark messages as read
        socket.on('mark-read', async (data: { senderId: number }) => {
            try {
                // Update all unread messages from this sender to this user
                await prisma.message.updateMany({
                    where: {
                        senderId: data.senderId,
                        receiverId: user.userId,
                        readAt: null
                    },
                    data: { readAt: new Date() }
                })

                // Notify the sender that their messages were read
                const senderSocketId = onlineUsers.get(data.senderId)
                if (senderSocketId) {
                    io.to(senderSocketId).emit('message-read', {
                        readBy: user.userId,
                        readAt: Date.now()
                    })
                }
            } catch (error) {
                console.error('Mark read error:', error)
            }
        })

        // Delete message
        socket.on('delete-message', async (data: { messageId: number }) => {
            try {
                // Find the message first to verify ownership
                const message = await prisma.message.findUnique({
                    where: { id: data.messageId }
                })

                if (!message || message.senderId !== user.userId) {
                    return // Only sender can delete their own messages
                }

                // Delete from database
                await prisma.message.delete({
                    where: { id: data.messageId }
                })

                const deletePayload = { messageId: data.messageId }

                // Broadcast deletion to relevant users
                if (message.receiverId) {
                    // Private message — notify receiver and sender
                    const receiverSocketId = onlineUsers.get(message.receiverId)
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit('message-deleted', deletePayload)
                    }
                    socket.emit('message-deleted', deletePayload)
                } else {
                    // Global message — notify everyone
                    io.emit('message-deleted', deletePayload)
                }
            } catch (error) {
                console.error('Delete message error:', error)
            }
        })

        socket.on('disconnect', () => {
            onlineUsers.delete(user.userId)
            io.emit('online-users', Array.from(onlineUsers.keys()))
        })
    })

    // Next.js Handler (Fallthrough)
    server.use((req, res) => {
        return handle(req, res)
    })

    // Bind to 0.0.0.0 to allow access from mobile devices on LAN
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
        const localIp = getLocalIpAddress()
        console.log(`> Ready on http://localhost:${PORT}`)
        console.log(`> Network: http://${localIp}:${PORT}`)
        console.log(`\n📱 Mobile Access:`)
        console.log(`   Open http://${localIp}:${PORT} on your mobile device`)
        console.log(`   (Make sure mobile is on the same WiFi network)\n`)
    })
})
