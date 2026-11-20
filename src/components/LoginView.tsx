import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useAuth, type PortalMode } from '../context/AuthContext';
import { formatRupiah } from '../lib/format';
import { PWAInstallButton } from './PWAInstallButton';

export const LoginView: React.FC = () => {
  const {
    workspaceEmployees,
    employeesLoading,
    positions,
    instantLoginAsAdmin,
    instantLoginAsEmployee,
    instantRegisterAndLoginEmployee,
    loginWithGoogle,
    authError,
    clearAuthError,
  } = useAuth();

  const [selectedPortal, setSelectedPortal] = useState<PortalMode>('employee');
  const [showNewEmployeeForm, setShowNewEmployeeForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPosId, setNewPosId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeEmployees = workspaceEmployees.filter((e) => e.status === 'active');

  const handleInstantAdmin = async () => {
    setSubmitting(true);
    try {
      await instantLoginAsAdmin();
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) return;
    setSubmitting(true);
    try {
      await instantRegisterAndLoginEmployee({
        name: newName,
        phone: newPhone,
        positionId: newPosId || positions[0]?.id,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    try {
      await loginWithGoogle(selectedPortal, false);
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
            Masuk langsung dengan 1 klik tanpa sandi dari HP maupun desktop. Semua data karyawan, jam kerja, foto selfie presensi, dan payroll tersinkron real-time di database cloud.
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

      {/* Right Instant Login Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-7 sm:p-8 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Masuk Cepat Tanpa Sandi
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Pilih portal di bawah, lalu ketuk akun untuk langsung masuk.
            </p>
          </div>

          {/* Portal Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                clearAuthError();
                setSelectedPortal('employee');
              }}
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
              onClick={() => {
                clearAuthError();
                setSelectedPortal('backoffice');
              }}
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

          {authError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* EMPLOYEE 1-TAP PICKER */}
          {selectedPortal === 'employee' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Pilih Akun Karyawan (1 Klik Masuk)
                  </span>
                  <span className="text-slate-400 font-mono tabular-nums">
                    {activeEmployees.length} aktif
                  </span>
                </div>

                {employeesLoading && activeEmployees.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-500">
                    Memuat data karyawan dari database...
                  </div>
                ) : activeEmployees.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    Belum ada karyawan aktif. Buat profil cepat di bawah.
                  </div>
                ) : (
                  <div className="max-h-[260px] overflow-y-auto space-y-2 pr-0.5">
                    {activeEmployees.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        disabled={submitting}
                        onClick={() => instantLoginAsEmployee(emp)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white hover:border-teal-600 hover:bg-teal-50/40 px-3.5 py-3 text-left transition-all cursor-pointer min-h-[60px] group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold text-sm shrink-0">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {emp.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              <span className="font-mono tabular-nums">{emp.employeeCode}</span> · {emp.positionTitle}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 group-hover:translate-x-0.5 transition-transform shrink-0">
                          <span>Masuk</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick 1-Step Register Employee (No Password) */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewEmployeeForm(!showNewEmployeeForm)}
                  className="w-full flex items-center justify-between py-2 text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" />
                    <span>Karyawan Baru? Daftar &amp; Masuk Cepat</span>
                  </span>
                  {showNewEmployeeForm ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showNewEmployeeForm && (
                  <form onSubmit={handleQuickCreateEmployee} className="mt-3 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nama Lengkap
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Contoh: Andi Wijaya"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          No. HP / WhatsApp
                        </label>
                        <input
                          type="text"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          placeholder="0812-xxxx-xxxx"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-mono focus:outline-none focus:border-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Jabatan
                        </label>
                        <select
                          value={newPosId || positions[0]?.id || ''}
                          onChange={(e) => setNewPosId(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-teal-600"
                        >
                          {positions.length === 0 ? (
                            <option value="pos_operasional">Staff Operasional</option>
                          ) : (
                            positions.map((pos) => (
                              <option key={pos.id} value={pos.id}>
                                {pos.title} ({formatRupiah(pos.defaultDailyRate)}/hr)
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || newName.trim().length < 2}
                      className="w-full min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? 'Membuat Profil...' : 'Buat Profil & Langsung Masuk'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            /* BACKOFFICE 1-CLICK LOGIN */
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-900">
                  Akses Manajemen Backoffice HR
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Kelola Data Karyawan &amp; Jabatan, Jadwal Hari &amp; Jam Kerja, Monitoring Foto Selfie Kehadiran, serta Payroll Gaji Harian secara real-time.
                </p>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleInstantAdmin}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] px-5 py-3 text-sm font-semibold text-white transition-all disabled:opacity-60 cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-teal-400" />
                <span>{submitting ? 'Membuka Backoffice...' : 'Masuk Langsung ke Backoffice'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Optional Google Login Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-center">
            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleLogin}
              className="inline-flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
              <span>Atau masuk dengan Google (opsional)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
