import React, { useMemo, useState } from 'react';
import { Camera, Download, Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  calculateWorkMinutes,
  exportRowsToCSV,
  formatDuration,
  formatIndonesianDate,
  formatRupiah,
  formatTimeOnly,
  getLocalDateKey,
} from '../../lib/format';
import type { AttendanceRecord, AttendanceStatus, Employee } from '../../types/hrm';

interface AttendanceAdminViewProps {
  attendance: AttendanceRecord[];
  employees: Employee[];
}

export const AttendanceAdminView: React.FC<AttendanceAdminViewProps> = ({
  attendance,
  employees,
}) => {
  const [dateFilter, setDateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus>('ALL');

  const [photoModal, setPhotoModal] = useState<AttendanceRecord | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);

  // Manual / Edit Attendance Form
  const [formEmpId, setFormEmpId] = useState('');
  const [formDate, setFormDate] = useState(getLocalDateKey());
  const [formInTime, setFormInTime] = useState('08:00');
  const [formOutTime, setFormOutTime] = useState('17:00');
  const [formStatus, setFormStatus] = useState<AttendanceStatus>('Hadir');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return attendance.filter((rec) => {
      const matchDate = !dateFilter || rec.date === dateFilter;
      const matchStatus = statusFilter === 'ALL' || rec.status === statusFilter;
      const matchSearch =
        !q ||
        rec.employeeName.toLowerCase().includes(q) ||
        rec.employeeCode.toLowerCase().includes(q) ||
        rec.positionTitle.toLowerCase().includes(q);
      return matchDate && matchStatus && matchSearch;
    });
  }, [attendance, dateFilter, statusFilter, searchQuery]);

  const openManualCreate = () => {
    setEditingRecord(null);
    setFormEmpId(employees[0]?.id || '');
    setFormDate(dateFilter || getLocalDateKey());
    setFormInTime('08:00');
    setFormOutTime('17:00');
    setFormStatus('Hadir');
    setFormNote('Dicatat oleh Admin Backoffice');
    setManualModalOpen(true);
  };

  const openEditRecord = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setFormEmpId(rec.employeeId);
    setFormDate(rec.date);
    setFormInTime(formatTimeOnly(rec.clockInTime).replace('--:--', '08:00'));
    setFormOutTime(
      rec.clockOutTime ? formatTimeOnly(rec.clockOutTime).replace('--:--', '') : ''
    );
    setFormStatus(rec.status);
    setFormNote(rec.clockInNote || '');
    setManualModalOpen(true);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((em) => em.id === formEmpId);
    if (!emp) return;

    setSaving(true);
    try {
      const inIso = new Date(`${formDate}T${formInTime || '08:00'}:00`).toISOString();
      const outIso = formOutTime
        ? new Date(`${formDate}T${formOutTime}:00`).toISOString()
        : '';
      const workMins = outIso ? calculateWorkMinutes(inIso, outIso) : 0;
      const docId = editingRecord ? editingRecord.id : `${emp.id}_${formDate}`;

      if (editingRecord) {
        await updateDoc(doc(db, 'attendance', docId), {
          clockInTime: inIso,
          clockOutTime: outIso,
          workMinutes: workMins,
          status: formStatus,
          clockInNote: formNote.trim().slice(0, 240),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'attendance', docId), {
          employeeId: emp.id,
          employeeUid: emp.uid || '',
          employeeEmail: emp.email,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          positionTitle: emp.positionTitle,
          date: formDate,
          scheduleStart: '08:00',
          scheduleEnd: '17:00',
          clockInTime: inIso,
          clockInPhoto: '',
          clockInNote: formNote.trim().slice(0, 240),
          clockOutTime: outIso,
          clockOutPhoto: '',
          clockOutNote: '',
          workMinutes: workMins,
          status: formStatus,
          dailyRateSnapshot: emp.dailyRate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setManualModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec: AttendanceRecord) => {
    try {
      await deleteDoc(doc(db, 'attendance', rec.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `attendance/${rec.id}`);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Tanggal',
      'Kode',
      'Nama Karyawan',
      'Jabatan',
      'Jam Masuk',
      'Jam Pulang',
      'Durasi',
      'Status',
      'Upah Harian (Rp)',
    ];
    const rows = filtered.map((r) => [
      r.date,
      r.employeeCode,
      r.employeeName,
      r.positionTitle,
      formatTimeOnly(r.clockInTime),
      formatTimeOnly(r.clockOutTime),
      formatDuration(r.workMinutes),
      r.status,
      r.status === 'Hadir' || r.status === 'Terlambat' ? r.dailyRateSnapshot : 0,
    ]);
    exportRowsToCSV(`Data_Kehadiran_${dateFilter || 'Semua'}.csv`, headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau NIK karyawan..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs"
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Reset Tanggal
            </button>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | AttendanceStatus)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="ALL">Semua Status</option>
            <option value="Hadir">Hadir</option>
            <option value="Terlambat">Terlambat</option>
            <option value="Izin">Izin</option>
            <option value="Alpha">Alpha</option>
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
            onClick={openManualCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Input Manual</span>
          </button>
        </div>
      </div>

      {/* High-Density Attendance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Karyawan</th>
                <th className="py-3 px-4">Foto Selfie</th>
                <th className="py-3 px-4">Jam Masuk / Pulang</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Upah Harian</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Belum ada data kehadiran yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {formatIndonesianDate(rec.date)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{rec.employeeName}</p>
                      <p className="text-slate-500">
                        {rec.employeeCode} · {rec.positionTitle}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setPhotoModal(rec)}
                        className="inline-flex items-center gap-1.5 cursor-pointer group"
                        title="Lihat Foto Selfie"
                      >
                        {rec.clockInPhoto ? (
                          <img
                            src={rec.clockInPhoto}
                            alt="In"
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 group-hover:ring-2 group-hover:ring-teal-500"
                          />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                            <Camera className="w-4 h-4" />
                          </span>
                        )}
                        {rec.clockOutPhoto && (
                          <img
                            src={rec.clockOutPhoto}
                            alt="Out"
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 group-hover:ring-2 group-hover:ring-teal-500"
                          />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      <div>
                        {formatTimeOnly(rec.clockInTime)} – {formatTimeOnly(rec.clockOutTime)}
                      </div>
                      <div className="text-slate-400">{formatDuration(rec.workMinutes)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          rec.status === 'Hadir'
                            ? 'text-emerald-700'
                            : rec.status === 'Terlambat'
                            ? 'text-amber-700'
                            : 'text-red-600'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {rec.status === 'Hadir' || rec.status === 'Terlambat'
                        ? formatRupiah(rec.dailyRateSnapshot)
                        : formatRupiah(0)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditRecord(rec)}
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          title="Koreksi Kehadiran"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rec)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selfie Photo Zoom Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Verifikasi Foto Selfie · {photoModal.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  {formatIndonesianDate(photoModal.date)} · Status: {photoModal.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoModal(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Clock-In ({formatTimeOnly(photoModal.clockInTime)})
                </p>
                {photoModal.clockInPhoto ? (
                  <img
                    src={photoModal.clockInPhoto}
                    alt="Selfie Clock-In"
                    className="w-full aspect-square object-cover rounded-xl border border-slate-200"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Tidak ada foto
                  </div>
                )}
                {photoModal.clockInNote && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                    {photoModal.clockInNote}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Clock-Out ({formatTimeOnly(photoModal.clockOutTime)})
                </p>
                {photoModal.clockOutPhoto ? (
                  <img
                    src={photoModal.clockOutPhoto}
                    alt="Selfie Clock-Out"
                    className="w-full aspect-square object-cover rounded-xl border border-slate-200"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Belum Clock-Out
                  </div>
                )}
                {photoModal.clockOutNote && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                    {photoModal.clockOutNote}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual / Edit Attendance Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveManual}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingRecord ? 'Koreksi Kehadiran' : 'Input Kehadiran Manual'}
              </h3>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Karyawan</label>
                <select
                  disabled={!!editingRecord}
                  value={formEmpId}
                  onChange={(e) => setFormEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white disabled:bg-slate-50"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    disabled={!!editingRecord}
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                  >
                    <option value="Hadir">Hadir</option>
                    <option value="Terlambat">Terlambat</option>
                    <option value="Izin">Izin</option>
                    <option value="Alpha">Alpha</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Masuk</label>
                  <input
                    type="time"
                    value={formInTime}
                    onChange={(e) => setFormInTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Pulang</label>
                  <input
                    type="time"
                    value={formOutTime}
                    onChange={(e) => setFormOutTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan</label>
                <input
                  type="text"
                  maxLength={240}
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
