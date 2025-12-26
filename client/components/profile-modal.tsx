'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Image as ImageIcon, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../app/auth-provider'

interface ProfileModalProps {
    isOpen: boolean
    onClose: () => void
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, login } = useAuth()
    const [username, setUsername] = useState('')
    const [avatar, setAvatar] = useState<File | null>(null)
    const [preview, setPreview] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (user) {
            setUsername(user.username)
            if (user.avatarUrl) {
                // Construct full URL if relative
                const url = user.avatarUrl.startsWith('http')
                    ? user.avatarUrl
                    : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${user.avatarUrl}`
                setPreview(url)
            } else {
                setPreview('')
            }
        }
    }, [user, isOpen])

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
        setIsLoading(true)

        try {
            let avatarUrl = user?.avatarUrl

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
            const token = localStorage.getItem('token')

            if (!token) throw new Error('Not authenticated')

            // Upload Avatar if changed
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

            // Update Profile
            const res = await fetch(`${apiUrl}/api/users/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username, avatarUrl }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Update failed')
            }

            // Update local user state
            login(data.token, data.user)
            onClose()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
                >
                    <X size={24} />
                </button>

                <h3 className="text-xl font-bold text-white mb-6">Edit Profile</h3>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-100 p-3 rounded-xl mb-4 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center mb-4">
                        <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center overflow-hidden mb-2 relative group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}>
                            {preview ? (
                                <img src={preview} alt="Avatar Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                                    <ImageIcon size={32} />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <span className="text-white text-xs">Change</span>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>

                    <div>
                        <label className="text-slate-400 text-sm font-medium ml-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-800 text-white placeholder-slate-500 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        Save Changes
                    </button>
                </form>
            </div>
        </div>
    )
}
