'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'

// Halaman Akun Admin: ganti password.
//
// Ditulis dalam Bahasa Indonesia saja, tanpa tombol ganti bahasa: yang memakai
// halaman ini pemilik toko. Password lama diminta dulu supaya orang yang
// kebetulan memakai komputer admin yang masih login tidak bisa mengambil alih
// akun hanya dengan mengetik password baru.

type Message = { type: 'success' | 'error'; text: string }

const MIN_PASSWORD_LENGTH = 8

const describeUpdateError = (error: unknown) => {
  const err = (error || {}) as { code?: string; message?: string }
  const text = (err.message || '').toLowerCase()

  if (err.code === 'same_password' || text.includes('different from the old')) {
    return 'Password baru tidak boleh sama dengan password yang sekarang.'
  }
  if (err.code === 'weak_password' || text.includes('weak') || text.includes('pwned')) {
    return 'Password baru terlalu lemah atau pernah bocor di internet. Pakai kombinasi lain yang lebih panjang.'
  }
  if (err.code === 'reauthentication_needed' || text.includes('reauthentication')) {
    return 'Demi keamanan, silakan keluar lalu masuk lagi, kemudian ulangi ganti password.'
  }
  return 'Password gagal diganti. Coba lagi beberapa saat lagi.'
}

export default function AdminAccountPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser()
      setEmail(data.user?.email || '')
      setLoading(false)
    }
    run()
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Isi ketiga kolom dulu.' })
      return
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({ type: 'error', text: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.` })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Ulangi password baru tidak sama. Ketik ulang keduanya.' })
      return
    }
    if (!email) {
      setMessage({ type: 'error', text: 'Sesi login sudah habis. Silakan masuk lagi.' })
      return
    }

    setSaving(true)
    try {
      // Re-checking the current password also refreshes the session, so the
      // update below never fails on a stale token.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (verifyError) {
        setMessage({ type: 'error', text: 'Password yang sekarang salah.' })
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setMessage({ type: 'error', text: describeUpdateError(updateError) })
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage({
        type: 'success',
        text: 'Password berhasil diganti. Pakai password baru ini saat masuk berikutnya.',
      })
    } catch (error) {
      setMessage({ type: 'error', text: describeUpdateError(error) })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner label="Memuat akun..." />
  }

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black'
  const labelClass = 'block text-sm font-medium text-black mb-1.5'
  const inputType = showPasswords ? 'text' : 'password'

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-black flex items-center gap-2">
          <KeyRound className="w-6 h-6" />
          Akun Admin
        </h1>
        <p className="text-gray-600 mt-1">
          Ganti password untuk masuk ke halaman admin. Siapa pun yang tahu password ini bisa melihat
          pesanan, menyetujui pembayaran, dan mengubah produk, jadi jangan dibagikan.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-black">Ganti Password</h2>
          <p className="text-sm text-gray-600 mt-1">
            Masuk sebagai <span className="font-medium text-black">{email || '-'}</span>
          </p>
        </div>

        <div>
          <label className={labelClass}>Password yang sekarang</label>
          <input
            type={inputType}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Password baru</label>
          <input
            type={inputType}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimal {MIN_PASSWORD_LENGTH} karakter. Lebih aman kalau panjang dan belum pernah dipakai di tempat lain.
          </p>
        </div>

        <div>
          <label className={labelClass}>Ulangi password baru</label>
          <input
            type={inputType}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowPasswords((value) => !value)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-black"
        >
          {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPasswords ? 'Sembunyikan password' : 'Tampilkan password'}
        </button>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-black text-white font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </div>
      </form>
    </div>
  )
}
