/**
 * Returns the base URL for API calls.
 * Uses NEXT_PUBLIC_API_URL if set, otherwise falls back to
 * window.location.origin so it works on both localhost and LAN/mobile.
 */
export const getApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
}
