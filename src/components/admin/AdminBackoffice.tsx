import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Camera,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Smartphone,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  formatRupiah,
  formatTimeOnly,
  getCurrentMonthKey,
  getLocalDateKey,
} from '../../lib/format';
import type {
  AttendanceRecord,
  Employee,
  JobPosition,
  PayrollRecord,
} from '../../types/hrm';
import { PWAInstallButton } from '../PWAInstallButton';
import { AttendanceAdminView } from './AttendanceAdminView';
import { EmployeesPositionsView } from './EmployeesPositionsView';
import { PayrollAdminView } from './PayrollAdminView';
import { WorkScheduleView } from './WorkScheduleView';

type AdminSection = 'overview' | 'employees' | 'schedules' | 'attendance' | 'payroll';

const NAV_ITEMS: { id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'employees', label: 'Karyawan & Jabatan', icon: Users },
  { id: 'schedules', label: 'Hari & Jam Kerja', icon: CalendarClock },
  { id: 'attendance', label: 'Data Kehadiran', icon: Clock },
  { id: 'payroll', label: 'Payroll Harian', icon: Wallet },
];

export const AdminBackoffice: React.FC = () => {
  const { sessionLabel, schedules, companySettings, setActivePortal, logout } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);

  useEffect(() => {
    const unsubEmp = onSnapshot(
      collection(db, 'employees'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Employee))
          .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
        setEmployees(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
    );

    const unsubPos = onSnapshot(
      collection(db, 'positions'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as JobPosition))
          .sort((a, b) => a.title.localeCompare(b.title));
        setPositions(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'positions')
    );

    const unsubAtt = onSnapshot(
      collection(db, 'attendance'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
          .sort((a, b) => b.date.localeCompare(a.date));
        setAttendance(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
    );

    const unsubPay = onSnapshot(
      collection(db, 'payroll_records'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRecord));
        setPayrollRecords(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payroll_records')
    );

    return () => {
      unsubEmp();
      unsubPos();
      unsubAtt();
      unsubPay();
    };
  }, []);

  const todayKey = getLocalDateKey();
  const currentMonthKey = getCurrentMonthKey();

  const overviewStats = useMemo(() => {
    const activeEmployees = employees.filter((e) => e.status === 'active').length;
    const todayAtt = attendance.filter((a) => a.date === todayKey);
    const presentToday = todayAtt.filter(
      (a) => a.status === 'Hadir' || a.status === 'Terlambat'
    ).length;
    const lateToday = todayAtt.filter((a) => a.status === 'Terlambat').length;
    const monthPayrollEstimate = attendance
      .filter(
        (a) =>
          a.date.startsWith(currentMonthKey) &&
          (a.status === 'Hadir' || a.status === 'Terlambat')
      )
      .reduce((sum, r) => sum + (r.dailyRateSnapshot || 0), 0);

    return {
      activeEmployees,
      presentToday,
      lateToday,
      monthPayrollEstimate,
      todayAtt,
    };
  }, [employees, attendance, todayKey, currentMonthKey]);

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === section)?.label || 'Ringkasan';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col bg-slate-900 text-white shrink-0">
        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 text-teal-400 flex items-center justify-center font-bold text-sm">
            K
          </div>
          <span className="text-base font-bold tracking-tight whitespace-nowrap">
            KaryaDesk HRM
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={() => setActivePortal('employee')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-3.5 py-2.5 text-xs font-semibold text-teal-400 transition-colors cursor-pointer min-h-[40px]"
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Buka Mobile PWA Karyawan</span>
          </button>
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {sessionLabel.name || 'HR Admin'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{sessionLabel.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 cursor-pointer shrink-0"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col h-full z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="text-base font-bold">KaryaDesk HRM</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                      active
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setActivePortal('employee');
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-teal-400"
              >
                <Smartphone className="w-4 h-4" />
                <span>Buka Mobile PWA Karyawan</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate">
                {companySettings?.companyName || 'Backoffice'}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-bold text-slate-900 truncate">{currentNavLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => setActivePortal('employee')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Mode PWA Karyawan</span>
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {section === 'overview' && (
            <div className="space-y-6">
              {/* 4 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Karyawan Aktif</p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                    {overviewStats.activeEmployees}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Dari {employees.length} terdaftar · {positions.length} jabatan
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Hadir Hari Ini</p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
                    {overviewStats.presentToday}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Tercatat Clock-In selfie</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Terlambat Hari Ini</p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-amber-600 mt-1.5">
                    {overviewStats.lateToday}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Melewati batas toleransi shift</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Akumulasi Payroll Bulan Ini</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5 truncate">
                    {formatRupiah(overviewStats.monthPayrollEstimate)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Berdasarkan kehadiran harian</p>
                </div>
              </div>

              {/* Today's Live Attendance Feed */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Kehadiran Hari Ini ({todayKey})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Pembaruan otomatis secara real-time saat karyawan melakukan selfie Clock-In/Out.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('attendance')}
                    className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Kelola Semua Kehadiran
                  </button>
                </div>

                {overviewStats.todayAtt.length === 0 ? (
                  <div className="py-12 px-6 text-center space-y-2">
                    <Camera className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-medium text-slate-700">
                      Belum ada karyawan yang Clock-In hari ini
                    </p>
                    <p className="text-xs text-slate-500">
                      Buka Mode PWA Karyawan untuk mencoba Clock-In foto selfie secara langsung.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {overviewStats.todayAtt.map((rec) => (
                      <div
                        key={rec.id}
                        className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {rec.clockInPhoto ? (
                            <img
                              src={rec.clockInPhoto}
                              alt={rec.employeeName}
                              className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <Camera className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {rec.employeeName}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {rec.employeeCode} · {rec.positionTitle}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                            Masuk {formatTimeOnly(rec.clockInTime)} · Pulang {formatTimeOnly(rec.clockOutTime)}
                          </p>
                          <p
                            className={`text-xs font-semibold ${
                              rec.status === 'Hadir'
                                ? 'text-emerald-700'
                                : rec.status === 'Terlambat'
                                ? 'text-amber-700'
                                : 'text-red-600'
                            }`}
                          >
                            {rec.status} · {formatRupiah(rec.dailyRateSnapshot)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {section === 'employees' && (
            <EmployeesPositionsView employees={employees} positions={positions} />
          )}
          {section === 'schedules' && (
            <WorkScheduleView schedules={schedules} companySettings={companySettings} />
          )}
          {section === 'attendance' && (
            <AttendanceAdminView attendance={attendance} employees={employees} />
          )}
          {section === 'payroll' && (
            <PayrollAdminView
              employees={employees}
              attendance={attendance}
              payrollRecords={payrollRecords}
            />
          )}
        </main>
      </div>
    </div>
  );
};
