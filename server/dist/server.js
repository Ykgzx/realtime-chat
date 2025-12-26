"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const prisma = new client_1.PrismaClient();
// Middleware
app.use((0, cors_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static('uploads'));
// Multer Config
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
// Config
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
// Auth Middleware for Express
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.sendStatus(403);
        req.user = user;
        next();
    });
};
/* ===========================
   AUTH ROUTES
   =========================== */
// Upload Avatar
// Upload Avatar
app.post('/api/users/avatar', upload.single('avatar'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Force forward slashes for URL compatibility
        const filename = req.file.filename;
        const avatarUrl = `/uploads/${filename}`;
        console.log('File uploaded:', avatarUrl);
        res.json({ avatarUrl });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});
// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, avatarUrl } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: { username, password: hashedPassword, avatarUrl },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, {
            expiresIn: '7d',
        });
        res.json({ token, user: { id: user.id, username: user.username } });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});
// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user || !(await bcryptjs_1.default.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, {
            expiresIn: '7d',
        });
        res.json({ token, user: { id: user.id, username: user.username } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
// Update Profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        console.log('[DEBUG] Updating profile for:', req.user.username, 'Body:', req.body);
        const { username, avatarUrl } = req.body;
        const userId = req.user.userId;
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }
        // Check availability if username changed
        if (username !== req.user.username) {
            const existing = await prisma.user.findUnique({ where: { username } });
            if (existing)
                return res.status(400).json({ error: 'Username taken' });
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { username, avatarUrl },
        });
        // Issue new token with updated info
        const token = jsonwebtoken_1.default.sign({ userId: updatedUser.id, username: updatedUser.username, avatarUrl: updatedUser.avatarUrl }, JWT_SECRET, {
            expiresIn: '7d',
        });
        res.json({ token, user: { id: updatedUser.id, username: updatedUser.username, avatarUrl: updatedUser.avatarUrl } });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});
// Get All Users (for sidebar)
app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, avatarUrl: true },
            orderBy: { username: 'asc' }
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// Get Message History (Global or Private)
app.get('/api/messages', async (req, res) => {
    try {
        const { userId } = req.query;
        const currentUserId = req.headers['x-user-id']; // Need to pass this from frontend if not using full auth middleware for this route yet
        let whereClause = { receiverId: null }; // Default to global chat
        // If fetching private chat history
        if (userId && currentUserId) {
            const partnerId = parseInt(String(userId));
            const myId = parseInt(String(currentUserId));
            whereClause = {
                OR: [
                    { senderId: myId, receiverId: partnerId },
                    { senderId: partnerId, receiverId: myId }
                ]
            };
        }
        const messages = await prisma.message.findMany({
            where: whereClause,
            include: {
                sender: { select: { username: true, avatarUrl: true } }
            },
            orderBy: { createdAt: 'asc' },
            take: 50
        });
        // Format for client
        const formatted = messages.map(m => ({
            user: m.sender.username,
            userAvatar: m.sender.avatarUrl,
            text: m.content,
            images: m.images ? JSON.parse(m.images) : undefined,
            timestamp: m.createdAt.getTime()
        }));
        res.json(formatted);
    }
    catch (error) {
        console.error('Fetch messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});
/* ===========================
   SOCKET.IO
   =========================== */
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});
// Middleware to verify token on socket connection
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token)
        return next(new Error('Authentication error'));
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)
            return next(new Error('Authentication error'));
        socket.data.user = decoded; // Store user info in socket
        next();
    });
});
const onlineUsers = new Map(); // userId -> socketId
io.on('connection', async (socket) => {
    const user = socket.data.user;
    console.log(`✅ User connected: ${user.username} (${user.userId})`);
    onlineUsers.set(user.userId, socket.id);
    io.emit('online-users', Array.from(onlineUsers.keys())); // Broadcast online users list
    // Join their own room for private messages
    socket.join(`user:${user.userId}`);
    // Handle new message
    socket.on('message', async (data) => {
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
            });
            const msgPayload = {
                user: user.username,
                userAvatar: user.avatarUrl, // Need to add avatarUrl to jwt payload or fetch user? 
                // Better: Fetch user full details or include in JWT. Let's start with JWT/User object
                // Wait, socket.data.user comes from JWT. JWT doesn't have avatarUrl usually unless we add it.
                // Let's add it to JWT payload in login/register.
                // Or simpler: fetch user from DB here? No, expensive.
                // Let's add to JWT.
                text: data.text,
                images: data.images,
                timestamp: savedMessage.createdAt.getTime()
            };
            if (data.receiverId) {
                // Private Message
                io.to(`user:${data.receiverId}`).emit('message', msgPayload); // Send to receiver
                socket.emit('message', msgPayload); // Send back to sender (to show in UI)
            }
            else {
                // Global Message
                io.emit('message', msgPayload);
            }
        }
        catch (error) {
            console.error('Message save error:', error);
        }
    });
    // Typing events
    socket.on('typing', (data) => {
        if (data.to) {
            io.to(`user:${data.to}`).emit('typing', user.username);
        }
        else {
            socket.broadcast.emit('typing', user.username);
        }
    });
    socket.on('stop-typing', (data) => {
        if (data.to) {
            io.to(`user:${data.to}`).emit('stop-typing', user.username);
        }
        else {
            socket.broadcast.emit('stop-typing', user.username);
        }
    });
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${user.username}`);
        onlineUsers.delete(user.userId);
        io.emit('online-users', Array.from(onlineUsers.keys()));
    });
});
/* ===========================
   START SERVER
   =========================== */
server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Chat Server running on port ${PORT} (v2)`);
});
