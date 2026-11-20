import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { getLocalDateKey } from './format';

export const DEFAULT_SCHEDULES = [
  { id: 'mon', dayIndex: 1, dayName: 'Senin', isWorkDay: true, startTime: '08:00', endTime: '17:00', graceMinutes: 15 },
  { id: 'tue', dayIndex: 2, dayName: 'Selasa', isWorkDay: true, startTime: '08:00', endTime: '17:00', graceMinutes: 15 },
  { id: 'wed', dayIndex: 3, dayName: 'Rabu', isWorkDay: true, startTime: '08:00', endTime: '17:00', graceMinutes: 15 },
  { id: 'thu', dayIndex: 4, dayName: 'Kamis', isWorkDay: true, startTime: '08:00', endTime: '17:00', graceMinutes: 15 },
  { id: 'fri', dayIndex: 5, dayName: 'Jumat', isWorkDay: true, startTime: '08:00', endTime: '17:00', graceMinutes: 15 },
  { id: 'sat', dayIndex: 6, dayName: 'Sabtu', isWorkDay: true, startTime: '08:00', endTime: '13:00', graceMinutes: 15 },
  { id: 'sun', dayIndex: 0, dayName: 'Minggu', isWorkDay: false, startTime: '08:00', endTime: '17:00', graceMinutes: 15 },
];

export const DEFAULT_POSITIONS = [
  {
    id: 'pos_operasional',
    title: 'Staff Operasional',
    department: 'Operasional',
    defaultDailyRate: 150000,
    description: 'Pelaksana operasional harian dan koordinasi lapangan.',
  },
  {
    id: 'pos_teknisi',
    title: 'Teknisi Lapangan',
    department: 'Teknik & Pemeliharaan',
    defaultDailyRate: 185000,
    description: 'Instalasi, inspeksi teknis, dan pemeliharaan unit.',
  },
  {
    id: 'pos_supervisor',
    title: 'Supervisor Shift',
    department: 'Manajemen Lapangan',
    defaultDailyRate: 250000,
    description: 'Pengawasan shift harian dan verifikasi target harian.',
  },
];

export async function ensureDefaultWorkspaceData(adminEmail?: string | null, adminName?: string | null, adminUid?: string | null): Promise<void> {
  try {
    const [schedulesSnap, positionsSnap, settingsSnap, employeesSnap] = await Promise.all([
      getDocs(collection(db, 'work_schedules')),
      getDocs(collection(db, 'positions')),
      getDocs(collection(db, 'settings')),
      getDocs(collection(db, 'employees')),
    ]);

    const batch = writeBatch(db);
    let hasWrites = false;

    if (schedulesSnap.empty) {
      for (const s of DEFAULT_SCHEDULES) {
        batch.set(doc(db, 'work_schedules', s.id), {
          dayIndex: s.dayIndex,
          dayName: s.dayName,
          isWorkDay: s.isWorkDay,
          startTime: s.startTime,
          endTime: s.endTime,
          graceMinutes: s.graceMinutes,
          updatedAt: serverTimestamp(),
        });
      }
      hasWrites = true;
    }

    if (settingsSnap.empty) {
      batch.set(doc(db, 'settings', 'company'), {
        companyName: 'PT Karya Nusantara Mandiri',
        officeLocation: 'Kantor Pusat Jakarta',
        requireSelfie: true,
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    if (positionsSnap.empty) {
      for (const p of DEFAULT_POSITIONS) {
        batch.set(doc(db, 'positions', p.id), {
          title: p.title,
          department: p.department,
          defaultDailyRate: p.defaultDailyRate,
          description: p.description,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      hasWrites = true;
    }

    if (employeesSnap.empty && adminEmail) {
      const today = getLocalDateKey();
      const normalizedEmail = adminEmail.trim().toLowerCase();
      batch.set(doc(db, 'employees', 'emp_admin_01'), {
        employeeCode: 'KRY-001',
        uid: adminUid || '',
        name: (adminName || 'HR Manager').slice(0, 120),
        email: normalizedEmail,
        phone: '0812-0000-0001',
        address: 'Jakarta Pusat',
        positionId: 'pos_supervisor',
        positionTitle: 'Supervisor Shift',
        department: 'Manajemen Lapangan',
        dailyRate: 250000,
        joinDate: today,
        status: 'active',
        role: 'admin',
        bankName: 'BCA',
        bankAccount: '1234567890',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'employees', 'emp_staff_02'), {
        employeeCode: 'KRY-002',
        uid: '',
        name: 'Budi Santoso',
        email: 'budi.santoso@karyadesk.id',
        phone: '0812-3456-7890',
        address: 'Jl. Sudirman No. 45, Jakarta',
        positionId: 'pos_operasional',
        positionTitle: 'Staff Operasional',
        department: 'Operasional',
        dailyRate: 150000,
        joinDate: today,
        status: 'active',
        role: 'employee',
        bankName: 'Mandiri',
        bankAccount: '1400098765432',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'employees', 'emp_tek_03'), {
        employeeCode: 'KRY-003',
        uid: '',
        name: 'Siti Rahmawati',
        email: 'siti.rahma@karyadesk.id',
        phone: '0813-9876-5432',
        address: 'Jl. Gatot Subroto Kav. 12, Jakarta',
        positionId: 'pos_teknisi',
        positionTitle: 'Teknisi Lapangan',
        department: 'Teknik & Pemeliharaan',
        dailyRate: 185000,
        joinDate: today,
        status: 'active',
        role: 'employee',
        bankName: 'BRI',
        bankAccount: '020601001234567',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'workspace_seed');
  }
}

export async function linkAdminRegistry(uid: string, email: string, name: string): Promise<void> {
  try {
    const adminRef = doc(db, 'admins', uid);
    const existingSnap = await getDoc(adminRef);
    const trimmedName = (name || '').trim();
    const safeName = (trimmedName.length >= 2 ? trimmedName : 'HR Admin').slice(0, 120);
    if (!existingSnap.exists()) {
      await setDoc(adminRef, {
        email: email.trim().toLowerCase(),
        name: safeName,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `admins/${uid}`);
  }
}
