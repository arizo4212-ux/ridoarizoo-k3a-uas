import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import { useAuth, type PortalMode } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';

type AuthFormMode = 'login' | 'register' | 'reset';

export const LoginView: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
    authError,
    needsEmailProviderSetup,
    clearAuthError,
  } = useAuth();

  const [selectedPortal, setSelectedPortal] = useState<PortalMode>('employee');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [formMode, setFormMode] = useState<AuthFormMode>('login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const switchFormMode = (mode: AuthFormMode) => {
    clearAuthError();
    setResetSent(false);
    setFormMode(mode);
  };

  const handleGoogleLogin = async (switchAccount = false) => {
    setSubmitting(true);
    try {
      await loginWithGoogle(selectedPortal, switchAccount);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSent(false);
    setSubmitting(true);
    try {
      if (formMode === 'login') {
        await loginWithEmail(email, password, selectedPortal);
      } else if (formMode === 'register') {
        await registerWithEmail({
          name,
          email,
          password,
          phone,
          preferredPortal: selectedPortal,
        });
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch {
      // Error surfaced via authError in context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Architectural Brand & Capabilities Panel */}
      <div className="lg:w-[50%] bg-slate-900 text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#FFFFFF" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-400/30 flex items-center justify-center text-teal-400 font-bold text-lg">
              K
            </div>
            <span className="text-xl font-bold tracking-tight text-white">KaryaDesk HRM</span>
          </div>
          <PWAInstallButton compact />
        </div>

        <div className="relative z-10 my-10 lg:my-0 max-w-xl">
          <p className="text-xs font-medium text-teal-400 tracking-wide mb-3">
            Sistem Manajemen SDM &amp; Presensi Harian
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-bold tracking-tight leading-[1.15] text-white [text-wrap:balance]">
            Kendali penuh backoffice dan presensi selfie karyawan dalam satu sumber data nyata.
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg">
            Semua akun Google dapat langsung masuk dengan 1 klik sebagai karyawan aktif secara otomatis, atau terhubung ke profil Backoffice yang telah didaftarkan manajemen.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-800/70 border border-slate-700/70 p-4">
              <div className="flex items-center gap-2.5 text-teal-400 mb-2">
                <Camera className="w-4 h-4 shrink-0" />
                <span className="text-sm font-semibold text-white">Mobile PWA Selfie</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Clock-in dan clock-out foto selfie kamera depan langsung dari HP karyawan.
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/70 border border-slate-700/70 p-4">
              <div className="flex items-center gap-2.5 text-teal-400 mb-2">
                <Wallet className="w-4 h-4 shrink-0" />
                <span className="text-sm font-semibold text-white">Payroll Gajian Harian</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Hari tercatat masuk otomatis dihitung sesuai tarif gaji harian (Rp/hari).
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/70 border border-slate-700/70 p-4">
              <div className="flex items-center gap-2.5 text-teal-400 mb-2">
                <Clock className="w-4 h-4 shrink-0" />
                <span className="text-sm font-semibold text-white">Hari &amp; Jam Kerja</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Jadwal kerja mingguan, toleransi keterlambatan, dan jabatan terkelola rapi.
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/70 border border-slate-700/70 p-4">
              <div className="flex items-center gap-2.5 text-teal-400 mb-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="text-sm font-semibold text-white">Sinkron Multi-Device</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Satu database cloud Firestore untuk seluruh perangkat Backoffice &amp; PWA.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-6">
          <span>KaryaDesk Enterprise Workforce</span>
          <span>Backoffice &amp; Employee PWA</span>
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-7 sm:p-8 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Masuk Cepat ke KaryaDesk
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Pilih portal tujuan, lalu masuk dengan 1 klik. Sesi tersimpan otomatis.
            </p>
          </div>

          {/* Portal Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedPortal('employee')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[44px] ${
                selectedPortal === 'employee'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">PWA Karyawan</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedPortal('backoffice')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[44px] ${
                selectedPortal === 'backoffice'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Backoffice Admin</span>
            </button>
          </div>

          {/* Primary Instant Login (All Google Accounts Supported) */}
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleGoogleLogin(false)}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-3 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>{submitting ? 'Menghubungkan...' : 'Masuk Cepat dengan Google'}</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleGoogleLogin(true)}
              className="w-full py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Pilih / ganti akun Google lain
            </button>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>
                Semua akun Google yang masuk otomatis aktif sebagai karyawan untuk presensi selfie &amp; payroll harian.
              </span>
            </div>
          </div>

          {authError && !showEmailForm && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Secondary Collapsible Email & Password Login */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                clearAuthError();
                setShowEmailForm(!showEmailForm);
              }}
              className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <span>Atau masuk dengan Email &amp; Kata Sandi</span>
              {showEmailForm ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showEmailForm && (
              <div className="mt-3 space-y-4">
                {formMode !== 'reset' && (
                  <div className="flex border-b border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => switchFormMode('login')}
                      className={`flex-1 py-2 border-b-2 transition-colors cursor-pointer ${
                        formMode === 'login'
                          ? 'border-slate-900 text-slate-900'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Masuk
                    </button>
                    <button
                      type="button"
                      onClick={() => switchFormMode('register')}
                      className={`flex-1 py-2 border-b-2 transition-colors cursor-pointer ${
                        formMode === 'register'
                          ? 'border-slate-900 text-slate-900'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Daftar Akun
                    </button>
                  </div>
                )}

                {authError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{authError}</span>
                    </div>
                    {needsEmailProviderSetup && (
                      <a
                        href="https://console.firebase.google.com/project/adept-hallway-pcvp7/authentication/providers"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold underline text-red-800 hover:text-red-950"
                      >
                        <span>Aktifkan Email/Password di Firebase Console</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {resetSent && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Tautan reset kata sandi telah dikirim ke <strong>{email}</strong>.</span>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-3">
                  {formMode === 'register' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Nama Lengkap
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            minLength={2}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nama lengkap"
                            className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2 text-sm focus:outline-none focus:border-teal-600"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          No. Telepon
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="0812-xxxx-xxxx"
                            className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2 text-sm font-mono focus:outline-none focus:border-teal-600"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@perusahaan.com"
                        className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2 text-sm focus:outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>

                  {formMode !== 'reset' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Kata Sandi
                        </label>
                        {formMode === 'login' && (
                          <button
                            type="button"
                            onClick={() => switchFormMode('reset')}
                            className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
                          >
                            Lupa kata sandi?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimal 6 karakter"
                          className="w-full rounded-xl border border-slate-200 pl-10 pr-10 py-2 text-sm focus:outline-none focus:border-teal-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {submitting
                      ? 'Memproses...'
                      : formMode === 'login'
                      ? 'Masuk dengan Email'
                      : formMode === 'register'
                      ? 'Daftar & Masuk'
                      : 'Kirim Tautan Reset'}
                  </button>

                  {formMode === 'reset' && (
                    <button
                      type="button"
                      onClick={() => switchFormMode('login')}
                      className="w-full text-xs font-semibold text-slate-600 hover:text-slate-900 py-1 cursor-pointer"
                    >
                      Kembali ke form Masuk
                    </button>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
