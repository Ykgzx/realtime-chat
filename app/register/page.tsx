'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../auth-provider'

export default function RegisterPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [avatar, setAvatar] = useState<File | null>(null)
    const [preview, setPreview] = useState<string>('')
    const [error, setError] = useState('')
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
            let avatarUrl = ''
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

            // Upload Avatar first if selected
            if (avatar) {
                const formData = new FormData()
                formData.append('avatar', avatar)

                const uploadRes = await fetch(`${apiUrl}/api/users/avatar`, {
                    method: 'POST',
                    body: formData
                })

                if (!uploadRes.ok) throw new Error('Failed to upload avatar')

                const uploadData = await uploadRes.json()
                avatarUrl = uploadData.avatarUrl
            }

            const res = await fetch(`${apiUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, avatarUrl }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Registration failed')
            }

            login(data.token, data.user)
        } catch (err: any) {
            setError(err.message)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl w-full max-w-md">
                <h2 className="text-3xl font-bold text-white mb-6 text-center">Create Account</h2>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-100 p-3 rounded-xl mb-4 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center mb-4">
                        <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center overflow-hidden mb-2 relative group cursor-pointer"
                            onClick={() => document.getElementById('avatar-input')?.click()}>
                            {preview ? (
                                <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-indigo-200 text-xs text-center px-2">Upload Photo</span>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <span className="text-white text-xs">Change</span>
                            </div>
                        </div>
                        <input
                            id="avatar-input"
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
                            placeholder="Choose a username"
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
                            placeholder="Choose a password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-white text-indigo-600 font-bold py-3.5 rounded-xl hover:bg-opacity-90 active:scale-[0.98] transition-all shadow-lg mt-2"
                    >
                        Sign Up
                    </button>
                </form>

                <p className="text-center text-indigo-100 mt-6 text-sm">
                    Already have an account?{' '}
                    <Link href="/login" className="text-white font-bold hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    )
}
