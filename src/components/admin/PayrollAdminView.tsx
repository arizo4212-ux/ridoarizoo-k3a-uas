import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, Download, Wallet } from 'lucide-react';
import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  exportRowsToCSV,
  formatRupiah,
  getCurrentMonthKey,
  getMonthRange,
} from '../../lib/format';
import type {
  AttendanceRecord,
  Employee,
  PayrollRecord,
  PayrollStatus,
} from '../../types/hrm';

interface PayrollAdminViewProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
}

interface AdjustmentState {
  bonus: number;
  deduction: number;
  notes: string;
}

export const PayrollAdminView: React.FC<PayrollAdminViewProps> = ({
  employees,
  attendance,
  payrollRecords,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey());
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentState>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedBanner, setGeneratedBanner] = useState<string | null>(null);

  const period = useMemo(() => getMonthRange(selectedMonth), [selectedMonth]);

  // Live daily-rate payroll preview calculated directly from Firestore attendance records
  const liveCalculations = useMemo(() => {
    const periodAttendance = attendance.filter(
      (a) => a.date >= period.startDate && a.date <= period.endDate
    );

    return employees.map((emp) => {
      const empAtt = periodAttendance.filter((a) => a.employeeId === emp.id);
      const daysPresent = empAtt.filter((a) => a.status === 'Hadir').length;
      const daysLate = empAtt.filter((a) => a.status === 'Terlambat').length;
      const totalDaysPaid = daysPresent + daysLate;

      // Sum exact dailyRateSnapshot from recorded days (or fallback to emp.dailyRate)
      const basePay = empAtt
        .filter((a) => a.status === 'Hadir' || a.status === 'Terlambat')
        .reduce((sum, rec) => sum + (rec.dailyRateSnapshot || emp.dailyRate), 0);

      const existingSaved = payrollRecords.find(
        (p) => p.periodKey === period.periodKey && p.employeeId === emp.id
      );

      const adj = adjustments[emp.id] ?? {
        bonus: existingSaved?.bonus ?? 0,
        deduction: existingSaved?.deduction ?? 0,
        notes: existingSaved?.notes ?? '',
      };

      const netPay = Math.max(0, basePay + adj.bonus - adj.deduction);

      return {
        employee: emp,
        daysPresent,
        daysLate,
        totalDaysPaid,
        basePay,
        bonus: adj.bonus,
        deduction: adj.deduction,
        notes: adj.notes,
        netPay,
        savedStatus: existingSaved?.status || null,
      };
    });
  }, [employees, attendance, payrollRecords, period, adjustments]);

  const totalPayrollOutlay = useMemo(
    () => liveCalculations.reduce((sum, row) => sum + row.netPay, 0),
    [liveCalculations]
  );

  const setEmpAdjustment = (empId: string, patch: Partial<AdjustmentState>) => {
    setAdjustments((prev) => {
      const current = prev[empId] ?? { bonus: 0, deduction: 0, notes: '' };
      return { ...prev, [empId]: { ...current, ...patch } };
    });
  };

  const handleGeneratePayroll = async () => {
    setGenerating(true);
    setGeneratedBanner(null);
    try {
      const batch = writeBatch(db);
      for (const row of liveCalculations) {
        const payrollId = `${period.periodKey}_${row.employee.id}`;
        const existing = payrollRecords.find((p) => p.id === payrollId);
        const ref = doc(db, 'payroll_records', payrollId);

        batch.set(ref, {
          periodKey: period.periodKey,
          periodLabel: period.periodLabel,
          startDate: period.startDate,
          endDate: period.endDate,
          employeeId: row.employee.id,
          employeeUid: row.employee.uid || '',
          employeeEmail: row.employee.email,
          employeeCode: row.employee.employeeCode,
          employeeName: row.employee.name,
          positionTitle: row.employee.positionTitle,
          dailyRate: row.employee.dailyRate,
          daysPresent: row.daysPresent,
          daysLate: row.daysLate,
          totalDaysPaid: row.totalDaysPaid,
          basePay: row.basePay,
          bonus: row.bonus,
          deduction: row.deduction,
          netPay: row.netPay,
          status: existing?.status || 'Draft',
          notes: row.notes.trim().slice(0, 300),
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setGeneratedBanner(
        `Payroll periode ${period.periodLabel} berhasil disimpan ke database untuk ${liveCalculations.length} karyawan.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payroll_records');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdatePayrollStatus = async (record: PayrollRecord, nextStatus: PayrollStatus) => {
    try {
      await updateDoc(doc(db, 'payroll_records', record.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payroll_records/${record.id}`);
    }
  };

  const handleExportPayrollCSV = () => {
    const headers = [
      'Periode',
      'Kode',
      'Nama Karyawan',
      'Jabatan',
      'Tarif Harian (Rp)',
      'Hari Masuk',
      'Gaji Pokok Harian (Rp)',
      'Bonus (Rp)',
      'Potongan (Rp)',
      'Total Gaji Bersih (Rp)',
    ];
    const rows = liveCalculations.map((r) => [
      period.periodLabel,
      r.employee.employeeCode,
      r.employee.name,
      r.employee.positionTitle,
      r.employee.dailyRate,
      r.totalDaysPaid,
      r.basePay,
      r.bonus,
      r.deduction,
      r.netPay,
    ]);
    exportRowsToCSV(`Payroll_Harian_${period.periodKey}.csv`, headers, rows);
  };

  const periodSavedRecords = useMemo(
    () => payrollRecords.filter((p) => p.periodKey === period.periodKey),
    [payrollRecords, period.periodKey]
  );

  return (
    <div className="space-y-5">
      {/* Payroll Period Controls & Formula Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Kalkulasi Payroll Harian · {period.periodLabel}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rumus otomatis: <strong className="text-slate-700">Hari Tercatat Masuk (Hadir / Terlambat) × Tarif Harian (Rp/hari) + Bonus - Potongan</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 min-h-[40px]"
          />
          <button
            type="button"
            onClick={handleExportPayrollCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
          <button
            type="button"
            disabled={generating || liveCalculations.length === 0}
            onClick={handleGeneratePayroll}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[40px] disabled:opacity-50 cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            <span>{generating ? 'Menyimpan...' : 'Generate & Simpan Slip Gaji'}</span>
          </button>
        </div>
      </div>

      {generatedBanner && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{generatedBanner}</span>
        </div>
      )}

      {/* Live Daily Payroll Calculation Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Karyawan</th>
                <th className="py-3 px-4 text-right">Tarif / Hari</th>
                <th className="py-3 px-4 text-center">Masuk (Hr)</th>
                <th className="py-3 px-4 text-right">Upah Pokok</th>
                <th className="py-3 px-4 text-right">Bonus (Rp)</th>
                <th className="py-3 px-4 text-right">Potongan (Rp)</th>
                <th className="py-3 px-4 text-right">Total Gaji</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {liveCalculations.map((row) => (
                <tr key={row.employee.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900">{row.employee.name}</p>
                    <p className="text-slate-500">
                      {row.employee.employeeCode} · {row.employee.positionTitle}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {formatRupiah(row.employee.dailyRate)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {row.totalDaysPaid}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {row.daysPresent} Hadir, {row.daysLate} Telat
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                    {formatRupiah(row.basePay)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={row.bonus}
                      onChange={(e) =>
                        setEmpAdjustment(row.employee.id, {
                          bonus: Number(e.target.value) || 0,
                        })
                      }
                      className="w-28 text-right rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono tabular-nums text-xs"
                    />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={row.deduction}
                      onChange={(e) =>
                        setEmpAdjustment(row.employee.id, {
                          deduction: Number(e.target.value) || 0,
                        })
                      }
                      className="w-28 text-right rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono tabular-nums text-xs"
                    />
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-teal-700 text-sm">
                    {formatRupiah(row.netPay)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white text-xs font-semibold">
                <td colSpan={6} className="py-3.5 px-4">
                  Total Estimasi Beban Payroll ({period.periodLabel})
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-teal-400 text-sm">
                  {formatRupiah(totalPayrollOutlay)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Saved Payroll Records & Approval Workflow */}
      {periodSavedRecords.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              Slip Gaji Tersimpan · {period.periodLabel}
            </h3>
            <p className="text-xs text-slate-500">
              Slip gaji yang tersimpan otomatis muncul di tab Profil &amp; Gaji pada Mobile PWA masing-masing karyawan.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Karyawan</th>
                  <th className="py-2.5 px-4 text-center">Hari Masuk</th>
                  <th className="py-2.5 px-4 text-right">Net Pay</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Ubah Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {periodSavedRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {rec.employeeName}{' '}
                      <span className="font-normal text-slate-500">({rec.employeeCode})</span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono tabular-nums">
                      {rec.totalDaysPaid} hari
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      {formatRupiah(rec.netPay)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          rec.status === 'Dibayar'
                            ? 'text-emerald-700'
                            : rec.status === 'Disetujui'
                            ? 'text-teal-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {rec.status === 'Draft' && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePayrollStatus(rec, 'Disetujui')}
                            className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Setujui</span>
                          </button>
                        )}
                        {rec.status !== 'Dibayar' && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePayrollStatus(rec, 'Dibayar')}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                          >
                            <span>Tandai Dibayar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
