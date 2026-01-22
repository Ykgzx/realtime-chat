'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../auth-provider'
import { QRCodeModal } from '@/components/qr-code-modal'
import { Smartphone } from 'lucide-react'

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [showQR, setShowQR] = useState(false)
    const [avatar, setAvatar] = useState<File | null>(null)
    const [preview, setPreview] = useState<string>('')
    const { login } = useAuth()

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setAvatar(file)
            setPreview(URL.createObjectURL(file))
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

            // 1. Login
            const res = await fetch(`${apiUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Login failed')
            }

            // 2. If avatar selected, upload and update profile
            if (avatar) {
                // Upload Avatar
                const formData = new FormData()
                formData.append('avatar', avatar)

                const uploadRes = await fetch(`${apiUrl}/api/users/avatar`, {
                    method: 'POST',
                    body: formData
                })

                if (!uploadRes.ok) throw new Error('Failed to upload avatar')

                const uploadData = await uploadRes.json()
                const avatarUrl = uploadData.avatarUrl

                // Update Profile
                const updateRes = await fetch(`${apiUrl}/api/users/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${data.token}`
                    },
                    body: JSON.stringify({ username, avatarUrl }),
                })

                if (!updateRes.ok) throw new Error('Failed to update profile picture')

                const updateData = await updateRes.json()

                // Use updated data
                login(updateData.token, updateData.user)
            } else {
                // Normal Login
                login(data.token, data.user)
            }

        } catch (err: any) {
            setError(err.message)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl w-full max-w-md">
                <h2 className="text-3xl font-bold text-white mb-6 text-center">Welcome Back</h2>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-100 p-3 rounded-xl mb-4 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Avatar Upload (Optional) */}
                    <div className="flex flex-col items-center mb-4">
                        <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center overflow-hidden mb-2 relative group cursor-pointer"
                            onClick={() => document.getElementById('avatar-input-login')?.click()}>
                            {preview ? (
                                <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-indigo-200 text-xs text-center px-2">Update Photo (Optional)</span>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <span className="text-white text-xs">Change</span>
                            </div>
                        </div>
                        <input
                            id="avatar-input-login"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>

                    <div>
                        <label className="text-indigo-100 text-sm font-medium ml-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-black/20 text-white placeholder-indigo-200/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 mt-1"
                            placeholder="Enter your username"
                            required
                        />
                    </div>

                    <div>
                        <label className="text-indigo-100 text-sm font-medium ml-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/20 text-white placeholder-indigo-200/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 mt-1"
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-white text-indigo-600 font-bold py-3.5 rounded-xl hover:bg-opacity-90 active:scale-[0.98] transition-all shadow-lg mt-2"
                    >
                        Sign In
                    </button>
                </form>

                <p className="text-center text-indigo-100 mt-6 text-sm">
                    Don't have an account?{' '}
                    <Link href="/register" className="text-white font-bold hover:underline">
                        Register
                    </Link>
                </p>

                <div className="mt-8 pt-6 border-t border-white/10 text-center">
                    <button
                        onClick={() => setShowQR(true)}
                        className="inline-flex items-center gap-2 text-indigo-200 hover:text-white transition text-sm"
                    >
                        <Smartphone size={16} />
                        Connect via Mobile
                    </button>
                </div>

                <QRCodeModal isOpen={showQR} onClose={() => setShowQR(false)} />
            </div>
        </div >
    )
}
