import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// เปลี่ยนจาก ['thai', 'latin'] → เป็น ['latin'] เท่านั้น
const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Realtime Chat',
  description: 'แชทเรียลไทม์ด้วย Socket.IO',
}

import { AuthProvider } from './auth-provider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}