import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  googleSwitchProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { emailToInviteId, getLocalDateKey, sanitizeId } from '../lib/format';
import { ensureDefaultWorkspaceData, linkAdminRegistry } from '../lib/seedData';
import {
  HRM_LIMITS,
  type CompanySettings,
  type Employee,
  type JobPosition,
  type WorkSchedule,
} from '../types/hrm';

export type PortalMode = 'backoffice' | 'employee';

export interface LocalSession {
  mode: 'admin' | 'employee';
  employeeId?: string;
  name: string;
  email: string;
  uid: string;
}

interface SelfOnboardParams {
  name: string;
  phone: string;
  positionId?: string;
}

interface AuthContextValue {
  user: User | null;
  session: LocalSession | null;
  isAuthenticated: boolean;
  sessionLabel: { name: string; email: string };
  authReady: boolean;
  isAdmin: boolean;
  employeeProfile: Employee | null;
  profileLoading: boolean;
  activePortal: PortalMode;
  setActivePortal: (mode: PortalMode) => void;
  workspaceEmployees: Employee[];
  employeesLoading: boolean;
  schedules: WorkSchedule[];
  positions: JobPosition[];
  companySettings: CompanySettings | null;
  instantLoginAsAdmin: () => Promise<void>;
  instantLoginAsEmployee: (emp: Employee) => void;
  instantRegisterAndLoginEmployee: (params: SelfOnboardParams) => Promise<void>;
  loginWithGoogle: (preferredPortal?: PortalMode, switchAccount?: boolean) => Promise<void>;
  selfRegisterEmployee: (params: SelfOnboardParams) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

const SESSION_STORAGE_KEY = 'karyadesk_local_session';
const PORTAL_STORAGE_KEY = 'karyadesk_active_portal';

function readStoredSession(): LocalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSession;
    if (parsed && (parsed.mode === 'admin' || parsed.mode === 'employee')) {
      return parsed;
    }
  } catch {
    // Ignore invalid storage
  }
  return null;
}

function readStoredPortal(fallback: PortalMode): PortalMode {
  try {
    const raw = localStorage.getItem(PORTAL_STORAGE_KEY);
    if (raw === 'backoffice' || raw === 'employee') return raw;
  } catch {
    // Ignore
  }
  return fallback;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapGoogleError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const rawMsg = error instanceof Error ? error.message : String(error);
  if (code === 'auth/unauthorized-domain' || rawMsg.includes('unauthorized-domain')) {
    return 'Popup Google diblokir pada domain pratinjau ini. Silakan gunakan tombol Masuk 1-Klik Tanpa Sandi di atas.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup browser diblokir. Gunakan tombol Masuk 1-Klik Tanpa Sandi di atas.';
  }
  return rawMsg || 'Gagal masuk dengan Google. Gunakan Masuk 1-Klik Tanpa Sandi di atas.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [localSession, setLocalSession] = useState<LocalSession | null>(() => readStoredSession());
  const [firebaseChecked, setFirebaseChecked] = useState(false);
  const [googleAdminFlag, setGoogleAdminFlag] = useState(false);

  const [workspaceEmployees, setWorkspaceEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

  const [activePortal, setActivePortalState] = useState<PortalMode>(() => {
    const initialSession = readStoredSession();
    if (initialSession?.mode === 'employee') return readStoredPortal('employee');
    return readStoredPortal('backoffice');
  });
  const preferredPortalRef = useRef<PortalMode | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const setActivePortal = (mode: PortalMode) => {
    setActivePortalState(mode);
    try {
      localStorage.setItem(PORTAL_STORAGE_KEY, mode);
    } catch {
      // Ignore
    }
  };

  const persistLocalSession = (next: LocalSession | null) => {
    setLocalSession(next);
    try {
      if (next) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  // Seed default workspace & subscribe to shared Firestore collections on mount
  useEffect(() => {
    ensureDefaultWorkspaceData(BOOTSTRAPPED_ADMIN_EMAIL, 'HR Manager', 'admin_default').catch((err) =>
      console.warn('Workspace seed check deferred:', err)
    );

    const unsubEmp = onSnapshot(
      collection(db, 'employees'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as Employee))
          .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
        setWorkspaceEmployees(list);
        setEmployeesLoading(false);
      },
      (error) => {
        setEmployeesLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'employees');
      }
    );

    const unsubSchedules = onSnapshot(
      collection(db, 'work_schedules'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as WorkSchedule))
          .sort((a, b) => {
            const orderA = a.dayIndex === 0 ? 7 : a.dayIndex;
            const orderB = b.dayIndex === 0 ? 7 : b.dayIndex;
            return orderA - orderB;
          });
        setSchedules(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'work_schedules')
    );

    const unsubPositions = onSnapshot(
      collection(db, 'positions'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as JobPosition))
          .sort((a, b) => a.title.localeCompare(b.title));
        setPositions(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'positions')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'company'),
      (snapshot) => {
        if (snapshot.exists()) {
          setCompanySettings({ id: snapshot.id, ...snapshot.data() } as CompanySettings);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'settings/company')
    );

    return () => {
      unsubEmp();
      unsubSchedules();
      unsubPositions();
      unsubSettings();
    };
  }, []);

  // Optional Firebase Auth state listener (for Google Sign-In when available)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthError(null);

      if (!firebaseUser) {
        setGoogleAdminFlag(false);
        setFirebaseChecked(true);
        return;
      }

      try {
        const emailLower = (firebaseUser.email || '').trim().toLowerCase();
        const isBootstrapped =
          firebaseUser.emailVerified && emailLower === BOOTSTRAPPED_ADMIN_EMAIL;

        let adminFlag = isBootstrapped;

        if (isBootstrapped) {
          await linkAdminRegistry(
            firebaseUser.uid,
            emailLower,
            firebaseUser.displayName || 'HR Admin'
          );
        } else {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
            if (adminSnap.exists()) {
              adminFlag = true;
            } else if (firebaseUser.emailVerified && emailLower) {
              const inviteSnap = await getDoc(
                doc(db, 'admin_invites', emailToInviteId(emailLower))
              );
              if (inviteSnap.exists()) {
                adminFlag = true;
                linkAdminRegistry(
                  firebaseUser.uid,
                  emailLower,
                  firebaseUser.displayName || 'HR Admin'
                ).catch(() => {});
              }
            }
          } catch {
            // Not an admin
          }
        }

        setGoogleAdminFlag(adminFlag);
        if (preferredPortalRef.current) {
          setActivePortal(adminFlag ? preferredPortalRef.current : 'employee');
        } else {
          setActivePortal(adminFlag ? 'backoffice' : 'employee');
        }
      } catch (err) {
        console.error('Error initializing Google user session:', err);
      } finally {
        setFirebaseChecked(true);
      }
    });

    return () => unsub();
  }, []);

  // Derive active employee profile & admin role deterministically
  const { employeeProfile, isAdmin } = useMemo(() => {
    if (localSession?.mode === 'admin') {
      const matched =
        workspaceEmployees.find((e) => e.id === (localSession.employeeId || 'emp_admin_01')) ||
        workspaceEmployees.find((e) => e.role === 'admin') ||
        workspaceEmployees[0] ||
        null;
      return { employeeProfile: matched, isAdmin: true };
    }

    if (localSession?.mode === 'employee') {
      const matched =
        workspaceEmployees.find((e) => e.id === localSession.employeeId) || null;
      return {
        employeeProfile: matched,
        isAdmin: matched?.role === 'admin',
      };
    }

    if (user) {
      const emailLower = (user.email || '').trim().toLowerCase();
      const matched =
        workspaceEmployees.find(
          (e) =>
            (user.emailVerified && emailLower && e.email === emailLower) ||
            e.uid === user.uid
        ) || null;
      return {
        employeeProfile: matched,
        isAdmin: googleAdminFlag || matched?.role === 'admin',
      };
    }

    return { employeeProfile: null, isAdmin: false };
  }, [localSession, user, workspaceEmployees, googleAdminFlag]);

  // Auto-link UID or auto-create profile when signed in via Google
  useEffect(() => {
    if (!user || localSession || employeesLoading) return;

    if (employeeProfile) {
      if (!employeeProfile.uid && user.emailVerified) {
        updateDoc(doc(db, 'employees', employeeProfile.id), {
          uid: user.uid,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      return;
    }

    selfRegisterEmployee({
      name: user.displayName || (user.email ? user.email.split('@')[0] : 'Karyawan'),
      phone: '',
    }).catch((err) => console.warn('Auto-onboarding Google user deferred:', err));
  }, [user, localSession, employeesLoading, employeeProfile]);

  const authReady = Boolean(localSession) || firebaseChecked;
  const isAuthenticated = Boolean(localSession || user);
  const profileLoading = isAuthenticated && employeesLoading;

  const sessionLabel = useMemo(() => {
    if (employeeProfile) {
      return { name: employeeProfile.name, email: employeeProfile.email };
    }
    if (localSession) {
      return { name: localSession.name, email: localSession.email };
    }
    if (user) {
      return {
        name: user.displayName || 'HR Admin',
        email: user.email || '',
      };
    }
    return { name: 'KaryaDesk User', email: '' };
  }, [employeeProfile, localSession, user]);

  const selfRegisterEmployee = async ({ name, phone, positionId }: SelfOnboardParams) => {
    const chosenPos =
      positions.find((p) => p.id === positionId) ||
      positions[0] || {
        id: 'pos_operasional',
        title: 'Staff Operasional',
        department: 'Operasional',
        defaultDailyRate: 150000,
      };

    const currentUser = auth.currentUser;
    const docId = currentUser
      ? currentUser.uid
      : sanitizeId(`emp_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`);
    const nextNumber = workspaceEmployees.length + 1;
    const candidateCode = `KRY-${String(nextNumber).padStart(3, '0')}`;
    const codeExists = workspaceEmployees.some((e) => e.employeeCode === candidateCode);
    const rawCode = codeExists
      ? `KRY-${String(Date.now()).slice(-4)}`
      : candidateCode;

    const cleanName = (name.trim() || currentUser?.displayName || 'Karyawan Baru').slice(
      0,
      HRM_LIMITS.NAME_MAX
    );
    const safeName = cleanName.length >= 2 ? cleanName : 'Karyawan Baru';
    const emailLower = (
      currentUser?.email || `${rawCode.toLowerCase()}@karyadesk.id`
    )
      .trim()
      .toLowerCase()
      .slice(0, HRM_LIMITS.EMAIL_MAX);

    try {
      await setDoc(doc(db, 'employees', docId), {
        employeeCode: rawCode,
        uid: docId,
        name: safeName,
        email: emailLower,
        phone: phone.trim().slice(0, HRM_LIMITS.PHONE_MAX),
        address: '',
        positionId: chosenPos.id,
        positionTitle: chosenPos.title.slice(0, HRM_LIMITS.TITLE_MAX),
        department: chosenPos.department.slice(0, HRM_LIMITS.TITLE_MAX),
        dailyRate: chosenPos.defaultDailyRate,
        joinDate: getLocalDateKey(),
        status: 'active',
        role: 'employee',
        bankName: '',
        bankAccount: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (!currentUser || localSession) {
        persistLocalSession({
          mode: 'employee',
          employeeId: docId,
          name: safeName,
          email: emailLower,
          uid: docId,
        });
        setActivePortal('employee');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `employees/${docId}`);
    }
  };

  const instantLoginAsAdmin = async () => {
    clearAuthError();
    await ensureDefaultWorkspaceData(BOOTSTRAPPED_ADMIN_EMAIL, 'HR Manager', 'admin_default');
    const adminEmp =
      workspaceEmployees.find((e) => e.role === 'admin') || workspaceEmployees[0];
    persistLocalSession({
      mode: 'admin',
      employeeId: adminEmp?.id || 'emp_admin_01',
      name: adminEmp?.name || 'HR Manager',
      email: adminEmp?.email || BOOTSTRAPPED_ADMIN_EMAIL,
      uid: adminEmp?.uid || 'admin_default',
    });
    setActivePortal('backoffice');
  };

  const instantLoginAsEmployee = (emp: Employee) => {
    clearAuthError();
    persistLocalSession({
      mode: 'employee',
      employeeId: emp.id,
      name: emp.name,
      email: emp.email,
      uid: emp.uid || emp.id,
    });
    setActivePortal('employee');
  };

  const instantRegisterAndLoginEmployee = async (params: SelfOnboardParams) => {
    clearAuthError();
    await selfRegisterEmployee(params);
  };

  const loginWithGoogle = async (portalChoice?: PortalMode, switchAccount = false) => {
    clearAuthError();
    if (portalChoice) {
      preferredPortalRef.current = portalChoice;
    }
    try {
      persistLocalSession(null);
      await signInWithPopup(auth, switchAccount ? googleSwitchProvider : googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') return;
      setAuthError(mapGoogleError(error));
    }
  };

  const logout = async () => {
    preferredPortalRef.current = null;
    clearAuthError();
    persistLocalSession(null);
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session: localSession,
        isAuthenticated,
        sessionLabel,
        authReady,
        isAdmin,
        employeeProfile,
        profileLoading,
        activePortal,
        setActivePortal,
        workspaceEmployees,
        employeesLoading,
        schedules,
        positions,
        companySettings,
        instantLoginAsAdmin,
        instantLoginAsEmployee,
        instantRegisterAndLoginEmployee,
        loginWithGoogle,
        selfRegisterEmployee,
        logout,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
