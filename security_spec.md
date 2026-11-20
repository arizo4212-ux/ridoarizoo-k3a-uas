# Security Specification — KaryaDesk HRM

## 1. Data Invariants
1. **Identity & Email Verification**: All read/write access requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Admin Registry**: Backoffice privileges are granted exclusively to the bootstrapped admin (`arizo4212@gmail.com`) or users whose UID exists in `/admins/{uid}` (managed only by existing admins).
3. **Employee PII Isolation**: Employee documents contain PII (`email`, `phone`, `address`, `bankAccount`, `dailyRate`). Only Admins or the matching employee (`uid == request.auth.uid || email == request.auth.token.email`) may `get` or `list` their employee record.
4. **No Self-Promotion / Wage Tampering**: Employees cannot modify `role`, `dailyRate`, `status`, `positionId`, `employeeCode`, or `email`. They may only link their `uid` on first sign-in or update `phone` and `address`.
5. **Attendance Integrity**: An employee can only create an attendance record for themselves (`employeeUid == request.auth.uid`), referencing an active `/employees/{employeeId}` matching their verified email, and `dailyRateSnapshot` MUST equal the employee's `dailyRate` in `/employees`.
6. **Terminal Clock-Out Locking**: Once `clockOutTime` is non-empty, employees cannot overwrite their attendance record; only Admins can make corrections.
7. **Payroll Authority**: Only Admins can create, update, or delete `/payroll_records/{payrollId}`. Employees can only read/list their own payroll records.
8. **Strict Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`.

## 2. Dirty Dozen Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: Read `/employees/emp_01` without `request.auth`.
2. **Unverified Email Write**: Create `/attendance/emp_01_2026-11-19` with `email_verified: false`.
3. **PII Cross-Read**: Employee A (`uid: empA`) attempts `get` on Employee B (`/employees/emp_b`).
4. **Blanket List Query**: Employee A executes `list` on `/employees` without restricting to their own `uid`/`email`.
5. **Role Escalation**: Employee A updates `/employees/emp_a` with `{ role: "admin" }`.
6. **Daily Rate Self-Inflation**: Employee A updates `/employees/emp_a` with `{ dailyRate: 9999999 }`.
7. **Attendance Wage Snapshot Spoofing**: Employee A creates `/attendance/emp_a_2026-11-19` with `dailyRateSnapshot: 900000` when `/employees/emp_a.dailyRate` is `150000`.
8. **Shadow Field Injection**: Create `/positions/pos_1` with extra ghost field `{ isSuper: true }`.
9. **Path ID Poisoning**: Create `/positions/bad..id/../../x` or 200-char ID string.
10. **Inactive Employee Clock-In**: Employee with `status: "inactive"` attempts to create `/attendance/...`.
11. **Post-Clock-Out Tampering**: Employee A attempts to update `/attendance/emp_a_2026-11-19` after `clockOutTime` is already set.
12. **Employee Forging Payroll**: Employee A attempts to create or update `/payroll_records/2026-11_emp_a` setting `netPay: 50000000`.
