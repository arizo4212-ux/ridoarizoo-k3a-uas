import type { Timestamp } from 'firebase/firestore';

export const HRM_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  CODE_MAX: 32,
  CODE_PATTERN: /^[A-Z0-9_-]+$/,
  NAME_MAX: 120,
  EMAIL_MAX: 160,
  PHONE_MAX: 32,
  ADDRESS_MAX: 300,
  TITLE_MAX: 80,
  DESC_MAX: 300,
  BANK_MAX: 60,
  NOTE_MAX: 240,
  PHOTO_MAX: 120000,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  TIME_PATTERN: /^([01]\d|2[0-3]):[0-5]\d$/,
} as const;

export type EmployeeStatus = 'active' | 'inactive';
export type EmployeeRole = 'employee' | 'admin';
export type AttendanceStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Alpha';
export type PayrollStatus = 'Draft' | 'Disetujui' | 'Dibayar';

export interface JobPosition {
  id: string;
  title: string;
  department: string;
  defaultDailyRate: number;
  description: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Employee {
  id: string;
  employeeCode: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  positionId: string;
  positionTitle: string;
  department: string;
  dailyRate: number;
  joinDate: string;
  status: EmployeeStatus;
  role: EmployeeRole;
  bankName: string;
  bankAccount: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface WorkSchedule {
  id: string; // 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
  dayIndex: number; // 0..6
  dayName: string;
  isWorkDay: boolean;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  graceMinutes: number;
  updatedAt?: Timestamp | null;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  officeLocation: string;
  requireSelfie: boolean;
  updatedAt?: Timestamp | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeUid: string;
  employeeEmail: string;
  employeeCode: string;
  employeeName: string;
  positionTitle: string;
  date: string; // YYYY-MM-DD
  scheduleStart: string;
  scheduleEnd: string;
  clockInTime: string; // ISO string
  clockInPhoto: string; // JPEG data URL
  clockInNote: string;
  clockOutTime: string; // ISO string or ''
  clockOutPhoto: string;
  clockOutNote: string;
  workMinutes: number;
  status: AttendanceStatus;
  dailyRateSnapshot: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PayrollRecord {
  id: string;
  periodKey: string; // YYYY-MM
  periodLabel: string;
  startDate: string;
  endDate: string;
  employeeId: string;
  employeeUid: string;
  employeeEmail: string;
  employeeCode: string;
  employeeName: string;
  positionTitle: string;
  dailyRate: number;
  daysPresent: number;
  daysLate: number;
  totalDaysPaid: number;
  basePay: number;
  bonus: number;
  deduction: number;
  netPay: number;
  status: PayrollStatus;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
