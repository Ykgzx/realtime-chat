'use client'

import { QRCodeSVG } from 'qrcode.react'
import { X, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

interface QRCodeModalProps {
    isOpen: boolean
    onClose: () => void
}

export function QRCodeModal({ isOpen, onClose }: QRCodeModalProps) {
    const [url, setUrl] = useState('')

    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Construct URL based on current window location (frontend URL)
            // This automatically handles localhost vs LAN IP
            setUrl(`${window.location.protocol}//${window.location.hostname}:${window.location.port}`)
        }
    }, [])

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

                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Smartphone className="text-white" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Connect via Mobile</h3>
                    <p className="text-slate-400 text-sm">
                        Scan this QR code with your phone to open the application instantly.
                    </p>
                </div>

                <div className="bg-white p-4 rounded-xl flex justify-center mb-4">
                    <QRCodeSVG value={url} size={200} />
                </div>

                <div className="text-center">
                    <p className="text-xs text-slate-500 break-all font-mono bg-slate-800 p-2 rounded-lg">
                        {url}
                    </p>
                </div>
            </div>
        </div>
    )
}
