# Deployment Guide

This guide explains how to deploy the Real-time Chat Application.

## Prerequisites
- A server (VPS) with Node.js 18+ installed.
- Persistent storage (HDD/SSD) for the SQLite database and image uploads.

## 1. Server Setup

1.  Copy the `server` folder to your host.
2.  Install dependencies:
    ```bash
    cd server
    npm install
    ```
3.  Configure Environment:
    - Copy `.env.example` to `.env`:
        ```bash
        cp .env.example .env
        ```
    - Edit `.env` and set `JWT_SECRET` to a secure string.
4.  Initialize Database:
    ```bash
    npx prisma generate
    npx prisma migrate deploy
    ```
5.  Build and Start:
    ```bash
    npm run build
    npm start
    ```
    *Note: For keeping the server running, use PM2:*
    ```bash
    npm install -g pm2
    pm2 start dist/server.js --name "chat-server"
    ```

## 2. Client Setup

1.  Copy the `client` folder to your host.
2.  Install dependencies:
    ```bash
    cd client
    npm install
    ```
3.  Configure Environment:
    - Copy `.env.example` to `.env.local`:
        ```bash
        cp .env.example .env.local
        ```
    - Edit `.env.local` and set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` to your server's public IP or Domain (e.g., `http://203.0.113.1:3001`).
4.  Build and Start:
    ```bash
    npm run build
    npm start
    ```
    *Note: Use PM2 for production:*
    ```bash
    pm2 start npm --name "chat-client" -- start
    ```

## Troublshooting
- **Images not showing?** Ensure the `server/uploads` folder has write permissions.
- **Connection failed?** Check that your server firewall allows ports 3000 (Client) and 3001 (Server).
