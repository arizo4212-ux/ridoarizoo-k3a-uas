import React, { useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Check,
  Download,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  calculateInclusiveDays,
  enumerateDateRange,
  exportRowsToCSV,
  formatIndonesianDate,
  getCurrentMonthKey,
  getLocalDateKey,
  sanitizeId,
} from '../../lib/format';
import {
  HRM_LIMITS,
  type AttendanceRecord,
  type Employee,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from '../../types/hrm';

interface LeaveAdminViewProps {
  leaveRequests: LeaveRequest[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  reviewerName: string;
}

const LEAVE_TYPES: LeaveType[] = [
  'Cuti Tahunan',
  'Cuti Sakit',
  'Izin Khusus',
  'Cuti Melahirkan',
];

export const LeaveAdminView: React.FC<LeaveAdminViewProps> = ({
  leaveRequests,
  employees,
  attendance,
  reviewerName,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LeaveStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | LeaveType>('ALL');

  // Review (Approve / Reject) Modal
  const [reviewTarget, setReviewTarget] = useState<{
    req: LeaveRequest;
    action: 'Disetujui' | 'Ditolak';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processingReview, setProcessingReview] = useState(false);

  // Manual Leave Modal
  const [manualOpen, setManualOpen] = useState(false);
  const [formEmpId, setFormEmpId] = useState('');
  const [formType, setFormType] = useState<LeaveType>('Cuti Tahunan');
  const [formStart, setFormStart] = useState(() => getLocalDateKey());
  const [formEnd, setFormEnd] = useState(() => getLocalDateKey());
  const [formReason, setFormReason] = useState('');
  const [formStatus, setFormStatus] = useState<LeaveStatus>('Disetujui');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);

  const todayKey = getLocalDateKey();
  const currentMonthKey = getCurrentMonthKey();
  const currentYear = todayKey.slice(0, 4);

  const kpis = useMemo(() => {
    const pendingCount = leaveRequests.filter((r) => r.status === 'Menunggu').length;
    const approvedThisMonth = leaveRequests.filter(
      (r) => r.status === 'Disetujui' && r.startDate.startsWith(currentMonthKey)
    ).length;
    const onLeaveToday = leaveRequests.filter(
      (r) => r.status === 'Disetujui' && r.startDate <= todayKey && r.endDate >= todayKey
    ).length;
    const rejectedCount = leaveRequests.filter((r) => r.status === 'Ditolak').length;
    return { pendingCount, approvedThisMonth, onLeaveToday, rejectedCount };
  }, [leaveRequests, todayKey, currentMonthKey]);

  const usedAnnualQuotaByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of leaveRequests) {
      if (
        r.status === 'Disetujui' &&
        r.leaveType === 'Cuti Tahunan' &&
        r.startDate.startsWith(currentYear)
      ) {
        map[r.employeeId] = (map[r.employeeId] || 0) + r.totalDays;
      }
    }
    return map;
  }, [leaveRequests, currentYear]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leaveRequests.filter((r) => {
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const matchType = typeFilter === 'ALL' || r.leaveType === typeFilter;
      const matchSearch =
        !q ||
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.leaveType.toLowerCase().includes(q);
      return matchStatus && matchType && matchSearch;
    });
  }, [leaveRequests, statusFilter, typeFilter, searchQuery]);

  const syncApprovedLeaveToAttendance = async (req: LeaveRequest) => {
    const dates = enumerateDateRange(req.startDate, req.endDate);
    if (dates.length === 0) return;

    const batch = writeBatch(db);
    let hasWrites = false;

    for (const dateStr of dates) {
      const attId = `${req.employeeId}_${dateStr}`;
      const localExisting = attendance.find((a) => a.id === attId);
      if (localExisting) continue;

      const attRef = doc(db, 'attendance', attId);
      const serverSnap = await getDoc(attRef);
      if (serverSnap.exists()) continue;

      batch.set(attRef, {
        employeeId: req.employeeId,
        employeeUid: req.employeeUid || req.employeeId,
        employeeEmail: req.employeeEmail,
        employeeCode: req.employeeCode,
        employeeName: req.employeeName,
        positionTitle: req.positionTitle,
        date: dateStr,
        scheduleStart: '08:00',
        scheduleEnd: '17:00',
        clockInTime: `${dateStr}T00:00:00.000Z`,
        clockInPhoto: '',
        clockInNote: `${req.leaveType}: ${req.reason}`.slice(0, 240),
        clockOutTime: '',
        clockOutPhoto: '',
        clockOutNote: '',
        workMinutes: 0,
        status: 'Izin',
        dailyRateSnapshot: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }
  };

  const openReviewModal = (req: LeaveRequest, action: 'Disetujui' | 'Ditolak') => {
    setReviewTarget({ req, action });
    setReviewNote(
      action === 'Disetujui'
        ? 'Pengajuan cuti disetujui oleh Manajemen.'
        : ''
    );
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setProcessingReview(true);
    const { req, action } = reviewTarget;

    try {
      await updateDoc(doc(db, 'leave_requests', req.id), {
        status: action,
        adminNote: reviewNote.trim().slice(0, 300),
        reviewedBy: (reviewerName || 'HR Admin').slice(0, 120),
        updatedAt: serverTimestamp(),
      });

      if (action === 'Disetujui') {
        await syncApprovedLeaveToAttendance(req);
      }

      setReviewTarget(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leave_requests/${req.id}`);
    } finally {
      setProcessingReview(false);
    }
  };

  const openManualModal = () => {
    const firstActive = employees.find((e) => e.status === 'active') || employees[0];
    setFormEmpId(firstActive?.id || '');
    setFormType('Cuti Tahunan');
    setFormStart(getLocalDateKey());
    setFormEnd(getLocalDateKey());
    setFormReason('');
    setFormStatus('Disetujui');
    setFormError(null);
    setManualOpen(true);
  };

  const manualDaysCount = useMemo(
    () => calculateInclusiveDays(formStart, formEnd),
    [formStart, formEnd]
  );

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const emp = employees.find((em) => em.id === formEmpId);
    if (!emp) {
      setFormError('Pilih karyawan terlebih dahulu.');
      return;
    }
    if (manualDaysCount <= 0) {
      setFormError('Tanggal selesai harus sama atau lebih besar dari tanggal mulai.');
      return;
    }
    if (formReason.trim().length < 3) {
      setFormError('Alasan cuti minimal 3 karakter.');
      return;
    }

    setSavingManual(true);
    try {
      const leaveId = sanitizeId(`leave_${emp.id}_${Date.now()}`);
      const payload = {
        employeeId: emp.id,
        employeeUid: emp.uid || emp.id,
        employeeEmail: emp.email,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        positionTitle: emp.positionTitle,
        department: emp.department,
        leaveType: formType,
        startDate: formStart,
        endDate: formEnd,
        totalDays: manualDaysCount,
        reason: formReason.trim().slice(0, 300),
        status: formStatus,
        adminNote:
          formStatus === 'Disetujui'
            ? 'Dicatat dan disetujui langsung oleh HR Admin.'
            : '',
        reviewedBy: formStatus === 'Menunggu' ? '' : (reviewerName || 'HR Admin').slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'leave_requests', leaveId), payload);

      if (formStatus === 'Disetujui') {
        await syncApprovedLeaveToAttendance({
          id: leaveId,
          ...payload,
        } as LeaveRequest);
      }

      setManualOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'leave_requests');
    } finally {
      setSavingManual(false);
    }
  };

  const handleDelete = async (req: LeaveRequest) => {
    try {
      await deleteDoc(doc(db, 'leave_requests', req.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `leave_requests/${req.id}`);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Kode',
      'Nama Karyawan',
      'Jabatan',
      'Jenis Cuti',
      'Tanggal Mulai',
      'Tanggal Selesai',
      'Total Hari',
      'Alasan',
      'Status',
      'Catatan HR',
    ];
    const rows = filtered.map((r) => [
      r.employeeCode,
      r.employeeName,
      r.positionTitle,
      r.leaveType,
      r.startDate,
      r.endDate,
      r.totalDays,
      r.reason,
      r.status,
      r.adminNote || '-',
    ]);
    exportRowsToCSV(`Manajemen_Cuti_${getLocalDateKey()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* 4 Leave KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Menunggu Persetujuan</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-amber-600 mt-1.5">
            {kpis.pendingCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Perlu tinjauan HR</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Sedang Cuti Hari Ini</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-teal-700 mt-1.5">
            {kpis.onLeaveToday}
          </p>
          <p className="text-xs text-slate-500 mt-1">Karyawan izin/cuti aktif</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Disetujui Bulan Ini</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
            {kpis.approvedThisMonth}
          </p>
          <p className="text-xs text-slate-500 mt-1">Otomatis tercatat di Kehadiran</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Ditolak</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
            {kpis.rejectedCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Total pengajuan ditolak</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, NIK, alasan..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | LeaveStatus)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="ALL">Semua Status</option>
            <option value="Menunggu">Menunggu</option>
            <option value="Disetujui">Disetujui</option>
            <option value="Ditolak">Ditolak</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | LeaveType)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="ALL">Semua Jenis Cuti</option>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
          <button
            type="button"
            onClick={openManualModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Input Cuti Manual</span>
          </button>
        </div>
      </div>

      {/* Leave Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Karyawan</th>
                <th className="py-3 px-4">Jenis &amp; Alasan</th>
                <th className="py-3 px-4">Periode Cuti</th>
                <th className="py-3 px-4 text-center">Sisa Kuota ({currentYear})</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <CalendarCheck2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-700">Belum ada data pengajuan cuti</p>
                    <p className="text-slate-400 mt-0.5">
                      Pengajuan cuti dari Mobile PWA karyawan akan langsung muncul di sini.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((req) => {
                  const used = usedAnnualQuotaByEmp[req.employeeId] || 0;
                  const remaining = Math.max(0, HRM_LIMITS.ANNUAL_LEAVE_QUOTA - used);
                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{req.employeeName}</p>
                        <p className="text-slate-500">
                          <span className="font-mono tabular-nums">{req.employeeCode}</span> ·{' '}
                          {req.positionTitle}
                        </p>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="font-semibold text-slate-900">{req.leaveType}</p>
                        <p className="text-slate-600 line-clamp-2 mt-0.5">{req.reason}</p>
                        {req.adminNote && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Catatan HR: {req.adminNote}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-medium text-slate-900">
                          {formatIndonesianDate(req.startDate)}
                          {req.endDate !== req.startDate
                            ? ` – ${formatIndonesianDate(req.endDate)}`
                            : ''}
                        </p>
                        <p className="font-mono tabular-nums text-slate-500 mt-0.5">
                          {req.totalDays} hari
                        </p>
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums">
                        <span className="font-semibold text-slate-900">{remaining}</span>
                        <span className="text-slate-400"> / {HRM_LIMITS.ANNUAL_LEAVE_QUOTA} hr</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            req.status === 'Disetujui'
                              ? 'text-emerald-700'
                              : req.status === 'Menunggu'
                              ? 'text-amber-700'
                              : 'text-red-600'
                          }`}
                        >
                          {req.status}
                        </span>
                        {req.reviewedBy && (
                          <span className="block text-[11px] text-slate-400">
                            oleh {req.reviewedBy}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {req.status === 'Menunggu' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReviewModal(req, 'Disetujui')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white cursor-pointer"
                                title="Setujui Pengajuan Cuti"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Setujui</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openReviewModal(req, 'Ditolak')}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-700 cursor-pointer"
                                title="Tolak Pengajuan Cuti"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Tolak</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(req)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Hapus Pengajuan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Confirmation Modal */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmReview}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {reviewTarget.action === 'Disetujui'
                  ? 'Setujui Pengajuan Cuti'
                  : 'Tolak Pengajuan Cuti'}
              </h3>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1">
                <p className="font-semibold text-slate-900">
                  {reviewTarget.req.employeeName} ({reviewTarget.req.employeeCode})
                </p>
                <p className="text-slate-600">
                  {reviewTarget.req.leaveType} ·{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {reviewTarget.req.totalDays} hari
                  </span>{' '}
                  ({formatIndonesianDate(reviewTarget.req.startDate)} –{' '}
                  {formatIndonesianDate(reviewTarget.req.endDate)})
                </p>
                <p className="text-slate-500 pt-1">Alasan: {reviewTarget.req.reason}</p>
              </div>

              {reviewTarget.action === 'Disetujui' && (
                <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-xl p-3">
                  Tanggal cuti yang disetujui otomatis dicatat sebagai status{' '}
                  <strong>Izin</strong> pada Data Kehadiran tanpa memengaruhi hitungan hari masuk payroll harian.
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan HR {reviewTarget.action === 'Ditolak' ? '(Alasan Penolakan)' : '(Opsional)'}
                </label>
                <textarea
                  rows={3}
                  required={reviewTarget.action === 'Ditolak'}
                  maxLength={300}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={
                    reviewTarget.action === 'Ditolak'
                      ? 'Tuliskan alasan penolakan untuk karyawan...'
                      : 'Catatan tambahan untuk karyawan...'
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={processingReview}
                className={`px-5 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 cursor-pointer ${
                  reviewTarget.action === 'Disetujui'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processingReview
                  ? 'Memproses...'
                  : reviewTarget.action === 'Disetujui'
                  ? 'Ya, Setujui Cuti'
                  : 'Tolak Pengajuan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Leave Entry Modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveManual}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Input Cuti Karyawan</h3>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Karyawan</label>
                <select
                  value={formEmpId}
                  onChange={(e) => setFormEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                >
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.employeeCode} — {em.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Cuti
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as LeaveType)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Awal
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as LeaveStatus)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                  >
                    <option value="Disetujui">Disetujui</option>
                    <option value="Menunggu">Menunggu</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => {
                      setFormStart(e.target.value);
                      if (e.target.value > formEnd) setFormEnd(e.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    min={formStart}
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs flex justify-between">
                <span className="text-slate-500">Durasi pengajuan</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {manualDaysCount} hari
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan / Keterangan
                </label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  maxLength={300}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Contoh: Keperluan keluarga / sakit dengan surat dokter"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingManual}
                className="px-5 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {savingManual ? 'Menyimpan...' : 'Simpan Pengajuan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
