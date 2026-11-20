import React, { useMemo, useState } from 'react';
import { Briefcase, Edit2, Plus, Search, Trash2, Users, X } from 'lucide-react';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  emailToInviteId,
  formatIndonesianDate,
  formatRupiah,
  getLocalDateKey,
  sanitizeId,
} from '../../lib/format';
import { HRM_LIMITS, type Employee, type EmployeeRole, type EmployeeStatus, type JobPosition } from '../../types/hrm';

interface EmployeesPositionsViewProps {
  employees: Employee[];
  positions: JobPosition[];
}

export const EmployeesPositionsView: React.FC<EmployeesPositionsViewProps> = ({
  employees,
  positions,
}) => {
  const [subTab, setSubTab] = useState<'employees' | 'positions'>('employees');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EmployeeStatus>('ALL');

  // Employee Modal State
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empCode, setEmpCode] = useState('');
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empAddress, setEmpAddress] = useState('');
  const [empPositionId, setEmpPositionId] = useState('');
  const [empDailyRate, setEmpDailyRate] = useState('150000');
  const [empJoinDate, setEmpJoinDate] = useState(getLocalDateKey());
  const [empStatus, setEmpStatus] = useState<EmployeeStatus>('active');
  const [empRole, setEmpRole] = useState<EmployeeRole>('employee');
  const [empBankName, setEmpBankName] = useState('');
  const [empBankAccount, setEmpBankAccount] = useState('');
  const [empError, setEmpError] = useState<string | null>(null);
  const [savingEmp, setSavingEmp] = useState(false);

  // Position Modal State
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [editingPos, setEditingPos] = useState<JobPosition | null>(null);
  const [posTitle, setPosTitle] = useState('');
  const [posDept, setPosDept] = useState('');
  const [posRate, setPosRate] = useState('150000');
  const [posDesc, setPosDesc] = useState('');
  const [posError, setPosError] = useState<string | null>(null);
  const [savingPos, setSavingPos] = useState(false);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((e) => {
      const matchStatus = statusFilter === 'ALL' || e.status === statusFilter;
      const matchSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.positionTitle.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [employees, searchQuery, statusFilter]);

  const openCreateEmployee = () => {
    setEditingEmp(null);
    const nextNum = String(employees.length + 1).padStart(3, '0');
    setEmpCode(`KRY-${nextNum}`);
    setEmpName('');
    setEmpEmail('');
    setEmpPhone('');
    setEmpAddress('');
    const firstPos = positions[0];
    setEmpPositionId(firstPos?.id || '');
    setEmpDailyRate(String(firstPos?.defaultDailyRate ?? 150000));
    setEmpJoinDate(getLocalDateKey());
    setEmpStatus('active');
    setEmpRole('employee');
    setEmpBankName('BCA');
    setEmpBankAccount('');
    setEmpError(null);
    setEmpModalOpen(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpCode(emp.employeeCode);
    setEmpName(emp.name);
    setEmpEmail(emp.email);
    setEmpPhone(emp.phone);
    setEmpAddress(emp.address);
    setEmpPositionId(emp.positionId);
    setEmpDailyRate(String(emp.dailyRate));
    setEmpJoinDate(emp.joinDate);
    setEmpStatus(emp.status);
    setEmpRole(emp.role);
    setEmpBankName(emp.bankName);
    setEmpBankAccount(emp.bankAccount);
    setEmpError(null);
    setEmpModalOpen(true);
  };

  const handlePositionSelect = (posId: string) => {
    setEmpPositionId(posId);
    const found = positions.find((p) => p.id === posId);
    if (found && !editingEmp) {
      setEmpDailyRate(String(found.defaultDailyRate));
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpError(null);

    const codeUpper = empCode.trim().toUpperCase();
    const nameClean = empName.trim();
    const emailLower = empEmail.trim().toLowerCase();
    const rateNum = Number(empDailyRate);
    const posObj = positions.find((p) => p.id === empPositionId);

    if (!HRM_LIMITS.CODE_PATTERN.test(codeUpper) || codeUpper.length < 2) {
      setEmpError('Kode Karyawan hanya boleh huruf kapital, angka, tanda hubung (-), atau garis bawah (_).');
      return;
    }
    if (nameClean.length < 2 || nameClean.length > HRM_LIMITS.NAME_MAX) {
      setEmpError('Nama lengkap minimal 2 karakter.');
      return;
    }
    if (!emailLower.includes('@') || emailLower.length > HRM_LIMITS.EMAIL_MAX) {
      setEmpError('Format email tidak valid.');
      return;
    }
    if (!posObj) {
      setEmpError('Pilih jabatan karyawan terlebih dahulu.');
      return;
    }
    if (isNaN(rateNum) || rateNum < 0) {
      setEmpError('Tarif gaji harian harus berupa angka valid.');
      return;
    }

    setSavingEmp(true);
    try {
      const targetId = editingEmp ? editingEmp.id : sanitizeId(`emp_${codeUpper}_${Date.now()}`);
      const payload = {
        employeeCode: codeUpper.slice(0, HRM_LIMITS.CODE_MAX),
        uid: editingEmp?.uid || '',
        name: nameClean.slice(0, HRM_LIMITS.NAME_MAX),
        email: emailLower.slice(0, HRM_LIMITS.EMAIL_MAX),
        phone: empPhone.trim().slice(0, HRM_LIMITS.PHONE_MAX),
        address: empAddress.trim().slice(0, HRM_LIMITS.ADDRESS_MAX),
        positionId: posObj.id,
        positionTitle: posObj.title.slice(0, HRM_LIMITS.TITLE_MAX),
        department: posObj.department.slice(0, HRM_LIMITS.TITLE_MAX),
        dailyRate: Math.round(rateNum),
        joinDate: empJoinDate,
        status: empStatus,
        role: empRole,
        bankName: empBankName.trim().slice(0, HRM_LIMITS.BANK_MAX),
        bankAccount: empBankAccount.trim().slice(0, HRM_LIMITS.BANK_MAX),
        updatedAt: serverTimestamp(),
      };

      if (editingEmp) {
        await updateDoc(doc(db, 'employees', targetId), payload);
      } else {
        await setDoc(doc(db, 'employees', targetId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      // Sync admin invite / registry for HR Admin role
      const inviteRef = doc(db, 'admin_invites', emailToInviteId(emailLower));
      if (empRole === 'admin') {
        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists()) {
          await setDoc(inviteRef, {
            email: emailLower,
            name: nameClean.slice(0, HRM_LIMITS.NAME_MAX),
            createdAt: serverTimestamp(),
          });
        }
        if (editingEmp?.uid) {
          const adminRef = doc(db, 'admins', editingEmp.uid);
          const adminSnap = await getDoc(adminRef);
          if (!adminSnap.exists()) {
            await setDoc(adminRef, {
              email: emailLower,
              name: nameClean.slice(0, HRM_LIMITS.NAME_MAX),
              createdAt: serverTimestamp(),
            });
          }
        }
      } else {
        await deleteDoc(inviteRef).catch(() => {});
      }

      setEmpModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, editingEmp ? OperationType.UPDATE : OperationType.CREATE, 'employees');
    } finally {
      setSavingEmp(false);
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    try {
      await deleteDoc(doc(db, 'employees', emp.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employees/${emp.id}`);
    }
  };

  const openCreatePosition = () => {
    setEditingPos(null);
    setPosTitle('');
    setPosDept('');
    setPosRate('150000');
    setPosDesc('');
    setPosError(null);
    setPosModalOpen(true);
  };

  const openEditPosition = (pos: JobPosition) => {
    setEditingPos(pos);
    setPosTitle(pos.title);
    setPosDept(pos.department);
    setPosRate(String(pos.defaultDailyRate));
    setPosDesc(pos.description);
    setPosError(null);
    setPosModalOpen(true);
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosError(null);
    const titleClean = posTitle.trim();
    const deptClean = posDept.trim();
    const rateNum = Number(posRate);

    if (titleClean.length < 2 || deptClean.length < 2) {
      setPosError('Nama jabatan dan departemen minimal 2 karakter.');
      return;
    }
    if (isNaN(rateNum) || rateNum < 0) {
      setPosError('Tarif gaji harian default harus angka valid.');
      return;
    }

    setSavingPos(true);
    try {
      const targetId = editingPos
        ? editingPos.id
        : sanitizeId(`pos_${titleClean.toLowerCase()}_${Date.now()}`);
      const payload = {
        title: titleClean.slice(0, HRM_LIMITS.TITLE_MAX),
        department: deptClean.slice(0, HRM_LIMITS.TITLE_MAX),
        defaultDailyRate: Math.round(rateNum),
        description: posDesc.trim().slice(0, HRM_LIMITS.DESC_MAX),
        updatedAt: serverTimestamp(),
      };
      if (editingPos) {
        await updateDoc(doc(db, 'positions', targetId), payload);
      } else {
        await setDoc(doc(db, 'positions', targetId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setPosModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, editingPos ? OperationType.UPDATE : OperationType.CREATE, 'positions');
    } finally {
      setSavingPos(false);
    }
  };

  const handleDeletePosition = async (pos: JobPosition) => {
    try {
      await deleteDoc(doc(db, 'positions', pos.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `positions/${pos.id}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs & primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setSubTab('employees')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'employees'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Data Karyawan ({employees.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('positions')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'positions'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Master Jabatan ({positions.length})</span>
          </button>
        </div>

        {subTab === 'employees' ? (
          <button
            type="button"
            onClick={openCreateEmployee}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Karyawan</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={openCreatePosition}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Jabatan</span>
          </button>
        )}
      </div>

      {/* DATA KARYAWAN */}
      {subTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, NIK, email, jabatan..."
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | EmployeeStatus)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 bg-white"
              >
                <option value="ALL">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode &amp; Karyawan</th>
                  <th className="py-3 px-4">Jabatan &amp; Dept</th>
                  <th className="py-3 px-4">Kontak</th>
                  <th className="py-3 px-4 text-right">Gaji Harian</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Tidak ada karyawan yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{emp.name}</p>
                        <p className="text-slate-500 font-mono tabular-nums">
                          {emp.employeeCode} · {emp.email}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{emp.positionTitle}</p>
                        <p className="text-slate-500">{emp.department}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono tabular-nums text-slate-700">{emp.phone || '-'}</p>
                        <p className="text-slate-500 truncate max-w-[180px]">{emp.address || '-'}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatRupiah(emp.dailyRate)}/hr
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            emp.status === 'active' ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {emp.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditEmployee(emp)}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            title="Edit Karyawan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Hapus Karyawan"
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
      )}

      {/* MASTER JABATAN */}
      {subTab === 'positions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nama Jabatan</th>
                  <th className="py-3 px-4">Departemen</th>
                  <th className="py-3 px-4">Deskripsi Tugas</th>
                  <th className="py-3 px-4 text-right">Tarif Harian Default</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      Belum ada master jabatan. Klik &ldquo;Tambah Jabatan&rdquo; untuk memulai.
                    </td>
                  </tr>
                ) : (
                  positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-slate-900">{pos.title}</td>
                      <td className="py-3 px-4 text-slate-700">{pos.department}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {pos.description || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatRupiah(pos.defaultDailyRate)}/hr
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditPosition(pos)}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            title="Edit Jabatan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePosition(pos)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Hapus Jabatan"
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
      )}

      {/* MODAL: TAMBAH / EDIT KARYAWAN */}
      {empModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveEmployee}
            className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingEmp ? 'Edit Data Karyawan' : 'Tambah Karyawan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setEmpModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {empError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
                  {empError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode / NIK Karyawan
                  </label>
                  <input
                    type="text"
                    required
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    placeholder="KRY-004"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="Ahmad Fauzi"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Google (untuk Login PWA)
                  </label>
                  <input
                    type="email"
                    required
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="karyawan@gmail.com"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Telepon
                  </label>
                  <input
                    type="text"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan</label>
                  <select
                    value={empPositionId}
                    onChange={(e) => handlePositionSelect(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                  >
                    <option value="">-- Pilih Jabatan --</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.department})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarif Gaji Harian (Rp / hari)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={5000}
                    value={empDailyRate}
                    onChange={(e) => setEmpDailyRate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Bergabung
                  </label>
                  <input
                    type="date"
                    required
                    value={empJoinDate}
                    onChange={(e) => setEmpJoinDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={empStatus}
                    onChange={(e) => setEmpStatus(e.target.value as EmployeeStatus)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hak Akses</label>
                  <select
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value as EmployeeRole)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
                  >
                    <option value="employee">Karyawan</option>
                    <option value="admin">Admin HR</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank</label>
                  <input
                    type="text"
                    value={empBankName}
                    onChange={(e) => setEmpBankName(e.target.value)}
                    placeholder="BCA / Mandiri / BRI"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Rekening
                  </label>
                  <input
                    type="text"
                    value={empBankAccount}
                    onChange={(e) => setEmpBankAccount(e.target.value)}
                    placeholder="1234567890"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat</label>
                <textarea
                  rows={2}
                  value={empAddress}
                  onChange={(e) => setEmpAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmpModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 min-h-[40px] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEmp}
                className="px-5 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] disabled:opacity-50 cursor-pointer"
              >
                {savingEmp ? 'Menyimpan...' : 'Simpan Karyawan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: TAMBAH / EDIT JABATAN */}
      {posModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSavePosition}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingPos ? 'Edit Jabatan' : 'Tambah Jabatan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setPosModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {posError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
                  {posError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Jabatan
                </label>
                <input
                  type="text"
                  required
                  value={posTitle}
                  onChange={(e) => setPosTitle(e.target.value)}
                  placeholder="Contoh: Kurir Logistik"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Departemen
                </label>
                <input
                  type="text"
                  required
                  value={posDept}
                  onChange={(e) => setPosDept(e.target.value)}
                  placeholder="Contoh: Distribusi"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tarif Gaji Harian Default (Rp / hari)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={5000}
                  value={posRate}
                  onChange={(e) => setPosRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deskripsi Singkat
                </label>
                <textarea
                  rows={2}
                  value={posDesc}
                  onChange={(e) => setPosDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPosModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 min-h-[40px] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingPos}
                className="px-5 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px] disabled:opacity-50 cursor-pointer"
              >
                {savingPos ? 'Menyimpan...' : 'Simpan Jabatan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
