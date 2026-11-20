import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileBarChart2,
  Home,
  LogOut,
  MapPin,
  Receipt,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  calculateWorkMinutes,
  exportRowsToCSV,
  formatDuration,
  formatIndonesianDate,
  formatRupiah,
  formatTimeOnly,
  getCurrentMonthKey,
  getLocalDateKey,
  getMonthRange,
  isLateClockIn,
} from '../../lib/format';
import type { AttendanceRecord, PayrollRecord } from '../../types/hrm';
import { PWAInstallButton } from '../PWAInstallButton';
import { SelfieCameraModal } from '../SelfieCameraModal';

type EmployeeTab = 'beranda' | 'presensi' | 'laporan' | 'profil';

export const EmployeePWA: React.FC = () => {
  const {
    user,
    isAdmin,
    employeeProfile,
    schedules,
    positions,
    companySettings,
    setActivePortal,
    selfRegisterEmployee,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<EmployeeTab>('beranda');
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey());
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [now, setNow] = useState(() => new Date());
  const [cameraMode, setCameraMode] = useState<'clock-in' | 'clock-out' | null>(null);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Self-onboarding form state when signed-in user does not have an employee record yet
  const [onboardName, setOnboardName] = useState(user?.displayName || '');
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardPosId, setOnboardPosId] = useState('');
  const [onboarding, setOnboarding] = useState(false);

  // Edit profile form state
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to employee's own attendance & payroll records
  useEffect(() => {
    if (!user) return;
    const emailLower = (user.email || '').trim().toLowerCase();
    const useEmailQuery = Boolean(user.emailVerified && emailLower);

    const attQuery = useEmailQuery
      ? query(collection(db, 'attendance'), where('employeeEmail', '==', emailLower))
      : query(collection(db, 'attendance'), where('employeeUid', '==', user.uid));

    const unsubAtt = onSnapshot(
      attQuery,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
          .sort((a, b) => b.date.localeCompare(a.date));
        setAttendanceList(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
    );

    const payQuery = useEmailQuery
      ? query(collection(db, 'payroll_records'), where('employeeEmail', '==', emailLower))
      : query(collection(db, 'payroll_records'), where('employeeUid', '==', user.uid));

    const unsubPay = onSnapshot(
      payQuery,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PayrollRecord))
          .sort((a, b) => b.periodKey.localeCompare(a.periodKey));
        setPayrollList(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payroll_records')
    );

    return () => {
      unsubAtt();
      unsubPay();
    };
  }, [user]);

  const todayKey = getLocalDateKey(now);
  const currentMonthKey = getCurrentMonthKey(now);
  const todaySchedule = useMemo(() => {
    const dayIdx = now.getDay();
    return schedules.find((s) => s.dayIndex === dayIdx) || null;
  }, [schedules, now]);

  const todayAttendance = useMemo(
    () => attendanceList.find((a) => a.date === todayKey) || null,
    [attendanceList, todayKey]
  );

  // Elapsed working duration when clocked in and not clocked out
  const liveWorkMinutes = useMemo(() => {
    if (!todayAttendance?.clockInTime) return 0;
    if (todayAttendance.clockOutTime) return todayAttendance.workMinutes;
    return calculateWorkMinutes(todayAttendance.clockInTime, now.toISOString());
  }, [todayAttendance, now]);

  // Current month stats for Beranda
  const currentMonthAttendance = useMemo(
    () => attendanceList.filter((a) => a.date.startsWith(currentMonthKey)),
    [attendanceList, currentMonthKey]
  );

  const currentMonthPaidDays = useMemo(
    () =>
      currentMonthAttendance.filter(
        (a) => a.status === 'Hadir' || a.status === 'Terlambat'
      ),
    [currentMonthAttendance]
  );

  const currentMonthEarned = useMemo(
    () =>
      currentMonthPaidDays.reduce(
        (sum, rec) => sum + (rec.dailyRateSnapshot || employeeProfile?.dailyRate || 0),
        0
      ),
    [currentMonthPaidDays, employeeProfile?.dailyRate]
  );

  // Filtered list for Presensi & Laporan tabs
  const selectedMonthAttendance = useMemo(() => {
    return attendanceList.filter((a) => {
      const matchMonth = a.date.startsWith(selectedMonth);
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      return matchMonth && matchStatus;
    });
  }, [attendanceList, selectedMonth, statusFilter]);

  const reportStats = useMemo(() => {
    const monthRows = attendanceList.filter((a) => a.date.startsWith(selectedMonth));
    const hadir = monthRows.filter((a) => a.status === 'Hadir').length;
    const terlambat = monthRows.filter((a) => a.status === 'Terlambat').length;
    const paidRows = monthRows.filter(
      (a) => a.status === 'Hadir' || a.status === 'Terlambat'
    );
    const totalMinutes = monthRows.reduce((s, r) => s + (r.workMinutes || 0), 0);
    const totalWage = paidRows.reduce(
      (s, r) => s + (r.dailyRateSnapshot || employeeProfile?.dailyRate || 0),
      0
    );
    return {
      monthRows,
      hadir,
      terlambat,
      totalDaysPaid: paidRows.length,
      totalMinutes,
      totalWage,
    };
  }, [attendanceList, selectedMonth, employeeProfile?.dailyRate]);

  const handleClockSubmit = async (photoDataUrl: string, note: string) => {
    if (!employeeProfile || !user) return;
    const timestampNow = new Date();
    const dateKey = getLocalDateKey(timestampNow);
    const docId = `${employeeProfile.id}_${dateKey}`;
    const docPath = `attendance/${docId}`;

    if (cameraMode === 'clock-in') {
      const schedStart = todaySchedule?.startTime || '08:00';
      const schedEnd = todaySchedule?.endTime || '17:00';
      const grace = todaySchedule?.graceMinutes ?? 15;
      const late = isLateClockIn(timestampNow, schedStart, grace);

      try {
        await setDoc(doc(db, 'attendance', docId), {
          employeeId: employeeProfile.id,
          employeeUid: user.uid,
          employeeEmail: employeeProfile.email,
          employeeCode: employeeProfile.employeeCode,
          employeeName: employeeProfile.name,
          positionTitle: employeeProfile.positionTitle,
          date: dateKey,
          scheduleStart: schedStart,
          scheduleEnd: schedEnd,
          clockInTime: timestampNow.toISOString(),
          clockInPhoto: photoDataUrl,
          clockInNote: note,
          clockOutTime: '',
          clockOutPhoto: '',
          clockOutNote: '',
          workMinutes: 0,
          status: late ? 'Terlambat' : 'Hadir',
          dailyRateSnapshot: employeeProfile.dailyRate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, docPath);
      }
    } else if (cameraMode === 'clock-out' && todayAttendance) {
      const outIso = timestampNow.toISOString();
      const mins = calculateWorkMinutes(todayAttendance.clockInTime, outIso);
      try {
        await updateDoc(doc(db, 'attendance', todayAttendance.id), {
          clockOutTime: outIso,
          clockOutPhoto: photoDataUrl,
          clockOutNote: note,
          workMinutes: mins,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `attendance/${todayAttendance.id}`);
      }
    }
  };

  const openEditProfileModal = () => {
    if (!employeeProfile) return;
    setEditPhone(employeeProfile.phone || '');
    setEditAddress(employeeProfile.address || '');
    setEditBankName(employeeProfile.bankName || '');
    setEditBankAccount(employeeProfile.bankAccount || '');
    setShowEditProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeProfile) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'employees', employeeProfile.id), {
        phone: editPhone.trim().slice(0, 32),
        address: editAddress.trim().slice(0, 300),
        bankName: editBankName.trim().slice(0, 60),
        bankAccount: editBankAccount.trim().slice(0, 60),
        updatedAt: serverTimestamp(),
      });
      setShowEditProfile(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `employees/${employeeProfile.id}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDownloadMonthlyReport = () => {
    const period = getMonthRange(selectedMonth);
    const headers = [
      'Tanggal',
      'Kode Karyawan',
      'Nama',
      'Jam Masuk',
      'Jam Pulang',
      'Durasi Kerja',
      'Status',
      'Gaji Harian (Rp)',
    ];
    const rows = reportStats.monthRows.map((r) => [
      r.date,
      r.employeeCode,
      r.employeeName,
      formatTimeOnly(r.clockInTime),
      formatTimeOnly(r.clockOutTime),
      formatDuration(r.workMinutes),
      r.status,
      r.status === 'Hadir' || r.status === 'Terlambat' ? r.dailyRateSnapshot : 0,
    ]);
    exportRowsToCSV(`Laporan_Presensi_${employeeProfile?.employeeCode}_${period.periodKey}.csv`, headers, rows);
  };

  const handleSelfOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboarding(true);
    try {
      await selfRegisterEmployee({
        name: onboardName,
        phone: onboardPhone,
        positionId: onboardPosId || positions[0]?.id,
      });
    } finally {
      setOnboarding(false);
    }
  };

  // If authenticated user does not yet have an employee record, let them complete onboarding immediately
  if (!employeeProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <form
          onSubmit={handleSelfOnboard}
          className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-7 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Lengkapi Profil Karyawan</h2>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Lengkapi data singkat di bawah ini untuk langsung mengaktifkan akses presensi selfie dan slip gaji Anda.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={onboardName}
              onChange={(e) => setOnboardName(e.target.value)}
              placeholder="Nama sesuai KTP"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              No. Telepon / WhatsApp
            </label>
            <input
              type="text"
              value={onboardPhone}
              onChange={(e) => setOnboardPhone(e.target.value)}
              placeholder="0812-xxxx-xxxx"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono"
            />
          </div>

          {positions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jabatan / Posisi
              </label>
              <select
                value={onboardPosId || positions[0]?.id}
                onChange={(e) => setOnboardPosId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white"
              >
                {positions.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.title} ({formatRupiah(pos.defaultDailyRate)}/hari)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={onboarding}
              className="w-full min-h-[46px] rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 cursor-pointer"
            >
              {onboarding ? 'Menyimpan Profil...' : 'Aktifkan & Masuk Beranda'}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActivePortal('backoffice')}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Buka Backoffice Manajemen
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Keluar Akun
            </button>
          </div>
        </form>
      </div>
    );
  }

  const isInactive = employeeProfile.status !== 'active';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 md:pb-10">
      {/* Compact Sticky Top App Bar (56px) */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-teal-400 flex items-center justify-center font-bold text-sm shrink-0">
            K
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">
              {companySettings?.companyName || 'KaryaDesk HRM'}
            </p>
          </div>
        </div>

        {/* Desktop Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {(
            [
              { id: 'beranda', label: 'Beranda' },
              { id: 'presensi', label: 'Presensi' },
              { id: 'laporan', label: 'Laporan' },
              { id: 'profil', label: 'Profil & Gaji' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact />
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActivePortal('backoffice')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[36px] whitespace-nowrap cursor-pointer"
              title="Kembali ke Panel Backoffice"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Backoffice</span>
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* TAB 1: BERANDA */}
        {activeTab === 'beranda' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Primary Focal Card: Live Clock & Selfie Clock-In / Out */}
            <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {employeeProfile.employeeCode} · {employeeProfile.positionTitle}
                  </p>
                  <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                    Halo, {employeeProfile.name}
                  </h1>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                    isInactive
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {isInactive ? 'Nonaktif' : 'Karyawan Aktif'}
                </span>
              </div>

              {/* Live Digital Clock & Date */}
              <div className="rounded-xl bg-slate-900 text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-400">
                    {new Intl.DateTimeFormat('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(now)}
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums tracking-tight mt-1">
                    {now.toLocaleTimeString('id-ID', { hour12: false })}
                  </p>
                </div>
                <div className="sm:text-right border-t sm:border-t-0 border-slate-800 pt-3 sm:pt-0">
                  <p className="text-xs text-slate-400">Jadwal Shift Hari Ini</p>
                  {todaySchedule?.isWorkDay ? (
                    <p className="text-sm font-semibold text-teal-400 font-mono tabular-nums mt-0.5">
                      {todaySchedule.startTime} – {todaySchedule.endTime}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-amber-400 mt-0.5">Hari Libur</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center sm:justify-end gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{companySettings?.officeLocation || 'Lokasi Kantor'}</span>
                  </p>
                </div>
              </div>

              {/* Clock-In / Clock-Out Action State */}
              {isInactive ? (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                  Status kepegawaian Anda saat ini Nonaktif. Hubungi HR untuk aktivasi kembali sebelum melakukan presensi.
                </div>
              ) : !todayAttendance ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Status hari ini: Belum Clock-In</span>
                    <span>Tarif hari ini: <strong className="text-slate-900 font-mono tabular-nums">{formatRupiah(employeeProfile.dailyRate)}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCameraMode('clock-in')}
                    className="w-full min-h-[52px] rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Clock-In Sekarang (Foto Selfie)</span>
                  </button>
                </div>
              ) : !todayAttendance.clockOutTime ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3.5 rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                    {todayAttendance.clockInPhoto ? (
                      <button
                        type="button"
                        onClick={() => setDetailRecord(todayAttendance)}
                        className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-pointer"
                      >
                        <img
                          src={todayAttendance.clockInPhoto}
                          alt="Selfie Clock-In"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500">Tercatat Clock-In</span>
                        <span
                          className={`text-xs font-semibold ${
                            todayAttendance.status === 'Terlambat'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {todayAttendance.status}
                        </span>
                      </div>
                      <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {formatTimeOnly(todayAttendance.clockInTime)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Durasi berjalan: <span className="font-mono tabular-nums font-semibold text-slate-700">{formatDuration(liveWorkMinutes)}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCameraMode('clock-out')}
                    className="w-full min-h-[52px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Clock-Out Sekarang (Foto Selfie)</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Presensi Hari Ini Selesai</span>
                      </div>
                      <span className="text-xs font-semibold text-emerald-800 font-mono tabular-nums">
                        +{formatRupiah(todayAttendance.dailyRateSnapshot)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/70 text-xs">
                      <div>
                        <p className="text-emerald-700">Masuk</p>
                        <p className="font-bold font-mono tabular-nums text-emerald-950 text-sm">
                          {formatTimeOnly(todayAttendance.clockInTime)}
                        </p>
                      </div>
                      <div>
                        <p className="text-emerald-700">Pulang</p>
                        <p className="font-bold font-mono tabular-nums text-emerald-950 text-sm">
                          {formatTimeOnly(todayAttendance.clockOutTime)}
                        </p>
                      </div>
                      <div>
                        <p className="text-emerald-700">Durasi</p>
                        <p className="font-bold font-mono tabular-nums text-emerald-950 text-sm">
                          {formatDuration(todayAttendance.workMinutes)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailRecord(todayAttendance)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Lihat Bukti Foto Selfie Hari Ini
                  </button>
                </div>
              )}
            </section>

            {/* Right / Secondary Column: Monthly Daily-Pay & Recent Activity */}
            <aside className="lg:col-span-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Masuk Bulan Ini</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {currentMonthPaidDays.length} <span className="text-sm font-normal text-slate-500">hari</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tarif {formatRupiah(employeeProfile.dailyRate)}/hr
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Estimasi Gaji</p>
                  <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-teal-700 mt-1 truncate">
                    {formatRupiah(currentMonthEarned)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Akumulasi harian</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900">Presensi Terakhir</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('presensi')}
                    className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                  >
                    Lihat Semua
                  </button>
                </div>
                {attendanceList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Belum ada riwayat presensi tercatat.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {attendanceList.slice(0, 4).map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => setDetailRecord(rec)}
                        className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer min-h-[56px]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {rec.clockInPhoto ? (
                            <img
                              src={rec.clockInPhoto}
                              alt={rec.date}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <Clock className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {formatIndonesianDate(rec.date)}
                            </p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              {formatTimeOnly(rec.clockInTime)} – {formatTimeOnly(rec.clockOutTime)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            rec.status === 'Hadir'
                              ? 'text-emerald-700'
                              : rec.status === 'Terlambat'
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* TAB 2: PRESENSI */}
        {activeTab === 'presensi' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Riwayat Presensi &amp; Foto Selfie</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ketuk baris presensi untuk melihat foto selfie masuk dan pulang.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 min-h-[40px]"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 min-h-[40px] bg-white"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="Hadir">Hadir</option>
                  <option value="Terlambat">Terlambat</option>
                  <option value="Izin">Izin</option>
                  <option value="Alpha">Alpha</option>
                </select>
              </div>
            </div>

            {selectedMonthAttendance.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">Belum ada data presensi</p>
                <p className="text-xs text-slate-500 mt-1">
                  Tidak ada catatan masuk pada periode {getMonthRange(selectedMonth).periodLabel}.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedMonthAttendance.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setDetailRecord(rec)}
                    className="w-full py-3.5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 px-2 rounded-xl transition-colors cursor-pointer min-h-[68px]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {rec.clockInPhoto ? (
                        <img
                          src={rec.clockInPhoto}
                          alt={`Selfie ${rec.date}`}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatIndonesianDate(rec.date)}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          Masuk {formatTimeOnly(rec.clockInTime)} · Pulang {formatTimeOnly(rec.clockOutTime)} · {formatDuration(rec.workMinutes)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-semibold block ${
                          rec.status === 'Hadir'
                            ? 'text-emerald-700'
                            : rec.status === 'Terlambat'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {rec.status}
                      </span>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {rec.status === 'Hadir' || rec.status === 'Terlambat'
                          ? formatRupiah(rec.dailyRateSnapshot)
                          : formatRupiah(0)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: LAPORAN */}
        {activeTab === 'laporan' && (
          <section className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Laporan Kehadiran &amp; Gaji Harian
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periode {getMonthRange(selectedMonth).periodLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 min-h-[40px]"
                  />
                  <button
                    type="button"
                    onClick={handleDownloadMonthlyReport}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Total Hari Masuk</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {reportStats.totalDaysPaid}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Tepat Waktu</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {reportStats.hadir}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Terlambat</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                    {reportStats.terlambat}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Total Jam Kerja</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {formatDuration(reportStats.totalMinutes)}
                  </p>
                </div>
              </div>

              {/* Daily Breakdown Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Tanggal</th>
                      <th className="py-2.5 px-4">Masuk – Pulang</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Upah Harian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reportStats.monthRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          Belum ada data kehadiran pada bulan ini.
                        </td>
                      </tr>
                    ) : (
                      reportStats.monthRows.map((row) => {
                        const earned =
                          row.status === 'Hadir' || row.status === 'Terlambat'
                            ? row.dailyRateSnapshot
                            : 0;
                        return (
                          <tr key={row.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {formatIndonesianDate(row.date)}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                              {formatTimeOnly(row.clockInTime)} – {formatTimeOnly(row.clockOutTime)}
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`font-semibold ${
                                  row.status === 'Hadir'
                                    ? 'text-emerald-700'
                                    : row.status === 'Terlambat'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {formatRupiah(earned)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white text-xs font-semibold">
                      <td colSpan={3} className="py-3 px-4">
                        Total Akumulasi Upah Harian ({reportStats.totalDaysPaid} hari masuk)
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-400 text-sm">
                        {formatRupiah(reportStats.totalWage)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: PROFIL (BIODATA DAN GAJI) */}
        {activeTab === 'profil' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Biodata Karyawan */}
            <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg shrink-0">
                    {employeeProfile.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-slate-900">{employeeProfile.name}</h1>
                    <p className="text-xs text-slate-500">
                      {employeeProfile.positionTitle} · {employeeProfile.department}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openEditProfileModal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[36px] cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Kontak</span>
                </button>
              </div>

              <dl className="divide-y divide-slate-100 text-sm">
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Kode Karyawan</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900">
                    {employeeProfile.employeeCode}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="font-medium text-slate-900 truncate">{employeeProfile.email}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Tanggal Bergabung</dt>
                  <dd className="font-medium text-slate-900">
                    {formatIndonesianDate(employeeProfile.joinDate)}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">No. Telepon</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900">
                    {employeeProfile.phone || '-'}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Alamat</dt>
                  <dd className="font-medium text-slate-900 text-right max-w-[60%]">
                    {employeeProfile.address || '-'}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Rekening Payroll</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900">
                    {employeeProfile.bankName || '-'} · {employeeProfile.bankAccount || '-'}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Rincian Gaji Harian & Slip Gaji */}
            <section className="lg:col-span-6 space-y-5">
              <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">
                    Skema Penggajian Harian
                  </span>
                  <Wallet className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tarif Gaji per Hari Masuk</p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-white mt-1">
                    {formatRupiah(employeeProfile.dailyRate)}
                    <span className="text-sm font-normal text-slate-400"> / hari</span>
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-slate-400">Masuk Bulan Berjalan</p>
                    <p className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                      {currentMonthPaidDays.length} hari
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Estimasi Berjalan</p>
                    <p className="text-base font-bold font-mono tabular-nums text-teal-400 mt-0.5">
                      {formatRupiah(currentMonthEarned)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Riwayat Slip Gaji Resmi</h2>
                  <Receipt className="w-4 h-4 text-slate-400" />
                </div>
                {payrollList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Belum ada slip gaji yang diterbitkan oleh Manajemen.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {payrollList.map((slip) => (
                      <button
                        key={slip.id}
                        type="button"
                        onClick={() => setSelectedPayslip(slip)}
                        className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 px-2 -mx-2 rounded-xl transition-colors cursor-pointer min-h-[60px]"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{slip.periodLabel}</p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {slip.totalDaysPaid} hari × {formatRupiah(slip.dailyRate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono tabular-nums text-slate-900">
                            {formatRupiah(slip.netPay)}
                          </p>
                          <span
                            className={`text-xs font-semibold ${
                              slip.status === 'Dibayar'
                                ? 'text-emerald-700'
                                : slip.status === 'Disetujui'
                                ? 'text-teal-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {slip.status}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Fixed Mobile Bottom Tab Bar (64px height, 44px+ touch targets) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe">
        <div className="grid grid-cols-4 h-16 items-center">
          {(
            [
              { id: 'beranda', label: 'Beranda', icon: Home },
              { id: 'presensi', label: 'Presensi', icon: Clock },
              { id: 'laporan', label: 'Laporan', icon: FileBarChart2 },
              { id: 'profil', label: 'Profil', icon: UserIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer ${
                  active ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.3]' : 'stroke-[1.75]'}`} />
                <span className="text-[11px] font-semibold tracking-tight mt-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Camera Selfie Modal */}
      {cameraMode && (
        <SelfieCameraModal
          mode={cameraMode}
          employeeName={employeeProfile.name}
          onClose={() => setCameraMode(null)}
          onSubmit={handleClockSubmit}
        />
      )}

      {/* Attendance Selfie Detail Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Detail Presensi · {formatIndonesianDate(detailRecord.date)}
                </h3>
                <p className="text-xs text-slate-500">
                  Status: <strong>{detailRecord.status}</strong> · Upah:{' '}
                  <span className="font-mono tabular-nums">
                    {formatRupiah(
                      detailRecord.status === 'Hadir' || detailRecord.status === 'Terlambat'
                        ? detailRecord.dailyRateSnapshot
                        : 0
                    )}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Selfie Clock-In ({formatTimeOnly(detailRecord.clockInTime)})
                </p>
                {detailRecord.clockInPhoto ? (
                  <img
                    src={detailRecord.clockInPhoto}
                    alt="Foto Clock-In"
                    className="w-full aspect-square object-cover rounded-xl border border-slate-200"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Tidak ada foto
                  </div>
                )}
                {detailRecord.clockInNote && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                    {detailRecord.clockInNote}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Selfie Clock-Out ({formatTimeOnly(detailRecord.clockOutTime)})
                </p>
                {detailRecord.clockOutPhoto ? (
                  <img
                    src={detailRecord.clockOutPhoto}
                    alt="Foto Clock-Out"
                    className="w-full aspect-square object-cover rounded-xl border border-slate-200"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Belum Clock-Out
                  </div>
                )}
                {detailRecord.clockOutNote && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                    {detailRecord.clockOutNote}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Detail Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Slip Gaji · {selectedPayslip.periodLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedPayslip.employeeCode} · {selectedPayslip.employeeName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayslip(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Tarif Gaji Harian</span>
                <span className="font-mono tabular-nums font-medium">
                  {formatRupiah(selectedPayslip.dailyRate)} / hari
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Jumlah Hari Masuk</span>
                <span className="font-mono tabular-nums font-medium">
                  {selectedPayslip.totalDaysPaid} hari (Tepat: {selectedPayslip.daysPresent}, Telat: {selectedPayslip.daysLate})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Gaji Pokok Harian</span>
                <span className="font-mono tabular-nums font-medium">
                  {formatRupiah(selectedPayslip.basePay)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Bonus / Tunjangan</span>
                <span className="font-mono tabular-nums font-medium">
                  +{formatRupiah(selectedPayslip.bonus)}
                </span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Potongan</span>
                <span className="font-mono tabular-nums font-medium">
                  -{formatRupiah(selectedPayslip.deduction)}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-900">Total Diterima</span>
                <span className="text-lg font-bold font-mono tabular-nums text-teal-700">
                  {formatRupiah(selectedPayslip.netPay)}
                </span>
              </div>
              {selectedPayslip.notes && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                  Catatan: {selectedPayslip.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Self Contact & Bank Modal */}
      {showEditProfile && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <form
            onSubmit={handleSaveProfile}
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit Kontak &amp; Rekening</h3>
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">No. Telepon</label>
                <input
                  type="text"
                  maxLength={32}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Domisili</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Bank</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={editBankName}
                    onChange={(e) => setEditBankName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">No. Rekening</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={editBankAccount}
                    onChange={(e) => setEditBankAccount(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 min-h-[44px] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 min-h-[44px] disabled:opacity-50 cursor-pointer"
              >
                {savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
