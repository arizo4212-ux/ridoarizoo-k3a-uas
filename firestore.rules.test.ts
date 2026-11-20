/**
 * Security Rule Verification Scenarios (Dirty Dozen) for KaryaDesk HRM.
 * Validates all 12 adversarial payloads against DRAFT_firestore.rules / firestore.rules invariants.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated Read on Employees',
    collection: '/employees/emp_01',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'Master gate requires request.auth != null and email_verified == true.',
  },
  {
    id: 2,
    name: 'Unverified Email Clock-In',
    collection: '/attendance/emp_01_2026-11-19',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isVerified() rejects email_verified == false.',
  },
  {
    id: 3,
    name: 'Cross-Employee PII Read',
    collection: '/employees/emp_b',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'Employee A cannot read Employee B biodata or dailyRate.',
  },
  {
    id: 4,
    name: 'Blanket Collection List on Attendance',
    collection: '/attendance',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list requires resource.data.employeeUid == request.auth.uid or matching verified email unless isAdmin().',
  },
  {
    id: 5,
    name: 'Employee Privilege Escalation to Admin',
    collection: '/employees/emp_a',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Employee update affectedKeys().hasOnly([phone, address, updatedAt]) blocks role change.',
  },
  {
    id: 6,
    name: 'Employee Self-Inflation of Daily Rate',
    collection: '/employees/emp_a',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'dailyRate is locked to Admin writes only.',
  },
  {
    id: 7,
    name: 'Attendance Daily Rate Snapshot Spoofing',
    collection: '/attendance/emp_a_2026-11-19',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Rule verifies incoming().dailyRateSnapshot == get(employees/employeeId).data.dailyRate.',
  },
  {
    id: 8,
    name: 'Shadow Field Injection on Position',
    collection: '/positions/pos_ops',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidPosition enforces keys().hasAll(...) && keys().hasOnly(...).',
  },
  {
    id: 9,
    name: 'Path ID Poisoning on Position',
    collection: '/positions/' + 'a'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId enforces <= 128 chars and ^[a-zA-Z0-9_-]+$.',
  },
  {
    id: 10,
    name: 'Inactive Employee Clock-In',
    collection: '/attendance/emp_inactive_2026-11-19',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Rule enforces get(employees/employeeId).data.status == "active".',
  },
  {
    id: 11,
    name: 'Post-Clock-Out Tampering by Employee',
    collection: '/attendance/emp_a_2026-11-19',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Terminal lock enforces existing().clockOutTime == "" for employee clock-out update.',
  },
  {
    id: 12,
    name: 'Employee Forging Payroll Record',
    collection: '/payroll_records/2026-11_emp_a',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Only isAdmin() may create/update/delete payroll_records.',
  },
];
