import React, { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import type { CompanySettings, WorkSchedule } from '../../types/hrm';

interface WorkScheduleViewProps {
  schedules: WorkSchedule[];
  companySettings: CompanySettings | null;
}

export const WorkScheduleView: React.FC<WorkScheduleViewProps> = ({
  schedules,
  companySettings,
}) => {
  const [draftSchedules, setDraftSchedules] = useState<WorkSchedule[]>(schedules);
  const [companyName, setCompanyName] = useState(companySettings?.companyName || 'PT Karya Nusantara Mandiri');
  const [officeLocation, setOfficeLocation] = useState(companySettings?.officeLocation || 'Kantor Pusat Jakarta');
  const [requireSelfie, setRequireSelfie] = useState(companySettings?.requireSelfie ?? true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    setDraftSchedules(schedules);
  }, [schedules]);

  useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.companyName);
      setOfficeLocation(companySettings.officeLocation);
      setRequireSelfie(companySettings.requireSelfie);
    }
  }, [companySettings]);

  const updateRow = (id: string, patch: Partial<WorkSchedule>) => {
    setDraftSchedules((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedToast(false);
    try {
      const batch = writeBatch(db);
      for (const s of draftSchedules) {
        batch.set(doc(db, 'work_schedules', s.id), {
          dayIndex: s.dayIndex,
          dayName: s.dayName,
          isWorkDay: s.isWorkDay,
          startTime: s.startTime,
          endTime: s.endTime,
          graceMinutes: Number(s.graceMinutes) || 0,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      await setDoc(doc(db, 'settings', 'company'), {
        companyName: companyName.trim().slice(0, 120) || 'KaryaDesk HRM',
        officeLocation: officeLocation.trim().slice(0, 200),
        requireSelfie,
        updatedAt: serverTimestamp(),
      });

      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'work_schedules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSaveAll} className="space-y-5">
      {/* Company & Attendance Policy */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Identitas Perusahaan &amp; Kebijakan Selfie</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Perubahan langsung tersinkronisasi ke Mobile PWA seluruh karyawan.
            </p>
          </div>
          {savedToast && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check className="w-4 h-4" />
              <span>Tersimpan</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Perusahaan</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Lokasi Kantor / Area Kerja</label>
            <input
              type="text"
              value={officeLocation}
              onChange={(e) => setOfficeLocation(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 cursor-pointer bg-slate-50">
              <span className="text-xs font-semibold text-slate-700">Wajib Foto Selfie Clock-In/Out</span>
              <input
                type="checkbox"
                checked={requireSelfie}
                onChange={(e) => setRequireSelfie(e.target.checked)}
                className="w-4 h-4 accent-teal-600"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Weekly Work Schedule Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Data Hari &amp; Jam Kerja Mingguan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Menentukan status Tepat Waktu atau Terlambat secara otomatis saat karyawan Clock-In.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Jadwal'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Hari</th>
                <th className="py-3 px-4">Status Hari</th>
                <th className="py-3 px-4">Jam Masuk</th>
                <th className="py-3 px-4">Jam Pulang</th>
                <th className="py-3 px-4">Toleransi Terlambat (Menit)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {draftSchedules.map((row) => (
                <tr key={row.id} className={row.isWorkDay ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{row.dayName}</td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => updateRow(row.id, { isWorkDay: !row.isWorkDay })}
                      className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                        row.isWorkDay
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {row.isWorkDay ? 'Hari Kerja' : 'Hari Libur'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="time"
                      disabled={!row.isWorkDay}
                      value={row.startTime}
                      onChange={(e) => updateRow(row.id, { startTime: e.target.value })}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono tabular-nums disabled:opacity-40"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="time"
                      disabled={!row.isWorkDay}
                      value={row.endTime}
                      onChange={(e) => updateRow(row.id, { endTime: e.target.value })}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono tabular-nums disabled:opacity-40"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      disabled={!row.isWorkDay}
                      value={row.graceMinutes}
                      onChange={(e) =>
                        updateRow(row.id, { graceMinutes: Number(e.target.value) || 0 })
                      }
                      className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono tabular-nums disabled:opacity-40"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  );
};
