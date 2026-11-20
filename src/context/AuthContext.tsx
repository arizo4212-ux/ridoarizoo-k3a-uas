import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
import { emailToInviteId, getLocalDateKey } from '../lib/format';
import { ensureDefaultWorkspaceData, linkAdminRegistry } from '../lib/seedData';
import {
  HRM_LIMITS,
  type CompanySettings,
  type Employee,
  type JobPosition,
  type WorkSchedule,
} from '../types/hrm';

export type PortalMode = 'backoffice' | 'employee';

interface RegisterParams {
  name: string;
  email: string;
  password: string;
  phone: string;
  positionId?: string;
  preferredPortal?: PortalMode;
}

interface SelfOnboardParams {
  name: string;
  phone: string;
  positionId?: string;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  employeeProfile: Employee | null;
  profileLoading: boolean;
  activePortal: PortalMode;
  setActivePortal: (mode: PortalMode) => void;
  schedules: WorkSchedule[];
  positions: JobPosition[];
  companySettings: CompanySettings | null;
  loginWithGoogle: (preferredPortal?: PortalMode, switchAccount?: boolean) => Promise<void>;
  loginWithEmail: (
    email: string,
    password: string,
    preferredPortal?: PortalMode
  ) => Promise<void>;
  registerWithEmail: (params: RegisterParams) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  selfRegisterEmployee: (params: SelfOnboardParams) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  needsEmailProviderSetup: boolean;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(error: unknown): { message: string; needsProvider: boolean } {
  const code = (error as { code?: string })?.code || '';
  const rawMsg = error instanceof Error ? error.message : String(error);

  if (code === 'auth/operation-not-allowed' || rawMsg.includes('operation-not-allowed')) {
    return {
      needsProvider: true,
      message:
        'Metode login Email/Password belum diaktifkan di Firebase Console proyek ini. Aktifkan di Authentication → Sign-in method → Email/Password.',
    };
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return { needsProvider: false, message: 'Email atau kata sandi salah.' };
  }
  if (code === 'auth/email-already-in-use') {
    return {
      needsProvider: false,
      message: 'Email sudah terdaftar. Silakan masuk melalui tab Masuk.',
    };
  }
  if (code === 'auth/weak-password') {
    return { needsProvider: false, message: 'Kata sandi minimal 6 karakter.' };
  }
  if (code === 'auth/invalid-email') {
    return { needsProvider: false, message: 'Format email tidak valid.' };
  }
  if (code === 'auth/too-many-requests') {
    return {
      needsProvider: false,
      message: 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit.',
    };
  }
  return { needsProvider: false, message: rawMsg || 'Gagal memproses autentikasi.' };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [employeeProfile, setEmployeeProfile] = useState<Employee | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activePortal, setActivePortal] = useState<PortalMode>('backoffice');
  const preferredPortalRef = useRef<PortalMode | null>(null);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [needsEmailProviderSetup, setNeedsEmailProviderSetup] = useState(false);

  const clearAuthError = () => {
    setAuthError(null);
    setNeedsEmailProviderSetup(false);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthError(null);
      setNeedsEmailProviderSetup(false);

      if (!firebaseUser) {
        setIsAdmin(false);
        setEmployeeProfile(null);
        setProfileLoading(false);
        setSchedules([]);
        setPositions([]);
        setCompanySettings(null);
        setAuthReady(true);
        return;
      }

      setProfileLoading(true);
      try {
        const emailLower = (firebaseUser.email || '').trim().toLowerCase();
        const isBootstrapped =
          firebaseUser.emailVerified && emailLower === BOOTSTRAPPED_ADMIN_EMAIL;

        let adminFlag = isBootstrapped;

        if (isBootstrapped) {
          setIsAdmin(true);
          setActivePortal(preferredPortalRef.current || 'backoffice');
          setAuthReady(true);
          await Promise.all([
            linkAdminRegistry(
              firebaseUser.uid,
              emailLower,
              firebaseUser.displayName || 'HR Admin'
            ),
            ensureDefaultWorkspaceData(
              emailLower,
              firebaseUser.displayName || 'HR Admin',
              firebaseUser.uid
            ),
          ]);
          return;
        }

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

        setIsAdmin(adminFlag);
        if (preferredPortalRef.current) {
          setActivePortal(adminFlag ? preferredPortalRef.current : 'employee');
        } else {
          setActivePortal(adminFlag ? 'backoffice' : 'employee');
        }
      } catch (err) {
        console.error('Error initializing user session:', err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Listen to current user's employee profile + shared schedules + positions + settings
  useEffect(() => {
    if (!authReady || !user) {
      return;
    }

    const emailLower = (user.email || '').trim().toLowerCase();
    // Use email query only when emailVerified (satisfies anti-spoofing rule); otherwise query by UID.
    const empQuery =
      user.emailVerified && emailLower
        ? query(collection(db, 'employees'), where('email', '==', emailLower))
        : query(collection(db, 'employees'), where('uid', '==', user.uid));

    const unsubEmp = onSnapshot(
      empQuery,
      async (snapshot) => {
        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          const data = { id: docSnap.id, ...docSnap.data() } as Employee;
          setEmployeeProfile(data);

          if (!data.uid && user.emailVerified) {
            try {
              await updateDoc(doc(db, 'employees', docSnap.id), {
                uid: user.uid,
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              console.warn('Could not auto-link employee UID:', err);
            }
          }
        } else {
          // Auto-create an active employee profile immediately so any user can enter without friction
          try {
            await selfRegisterEmployee({
              name: user.displayName || (user.email ? user.email.split('@')[0] : 'Karyawan'),
              phone: '',
            });
          } catch (err) {
            console.warn('Auto-onboarding deferred:', err);
            setEmployeeProfile(null);
          }
        }
        setProfileLoading(false);
      },
      (error) => {
        setProfileLoading(false);
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
  }, [authReady, user]);

  const selfRegisterEmployee = async ({
    name,
    phone,
    positionId,
  }: SelfOnboardParams) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const chosenPos =
      positions.find((p) => p.id === positionId) ||
      positions[0] || {
        id: 'pos_operasional',
        title: 'Staff Operasional',
        department: 'Operasional',
        defaultDailyRate: 150000,
      };

    const rawCode = `KRY-${currentUser.uid.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    const safeName = (name.trim() || currentUser.displayName || 'Karyawan').slice(
      0,
      HRM_LIMITS.NAME_MAX
    );
    const emailLower = (currentUser.email || `${currentUser.uid}@karyadesk.local`)
      .trim()
      .toLowerCase()
      .slice(0, HRM_LIMITS.EMAIL_MAX);

    try {
      await setDoc(doc(db, 'employees', currentUser.uid), {
        employeeCode: rawCode,
        uid: currentUser.uid,
        name: safeName.length >= 2 ? safeName : 'Karyawan Baru',
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
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `employees/${currentUser.uid}`);
    }
  };

  const loginWithGoogle = async (portalChoice?: PortalMode, switchAccount = false) => {
    clearAuthError();
    if (portalChoice) {
      preferredPortalRef.current = portalChoice;
    }
    try {
      await signInWithPopup(auth, switchAccount ? googleSwitchProvider : googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') return;
      const mapped = mapFirebaseAuthError(error);
      setAuthError(mapped.message);
    }
  };

  const loginWithEmail = async (
    email: string,
    password: string,
    portalChoice?: PortalMode
  ) => {
    clearAuthError();
    if (portalChoice) {
      preferredPortalRef.current = portalChoice;
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      const mapped = mapFirebaseAuthError(error);
      setNeedsEmailProviderSetup(mapped.needsProvider);
      setAuthError(mapped.message);
      throw error;
    }
  };

  const registerWithEmail = async ({
    name,
    email,
    password,
    phone,
    positionId,
    preferredPortal,
  }: RegisterParams) => {
    clearAuthError();
    if (preferredPortal) {
      preferredPortalRef.current = preferredPortal;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const safeName = (name.trim() || 'Karyawan').slice(0, HRM_LIMITS.NAME_MAX);
      await updateProfile(cred.user, { displayName: safeName });
      await selfRegisterEmployee({ name: safeName, phone, positionId });
    } catch (error) {
      const mapped = mapFirebaseAuthError(error);
      setNeedsEmailProviderSetup(mapped.needsProvider);
      setAuthError(mapped.message);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    clearAuthError();
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      const mapped = mapFirebaseAuthError(error);
      setNeedsEmailProviderSetup(mapped.needsProvider);
      setAuthError(mapped.message);
      throw error;
    }
  };

  const logout = async () => {
    preferredPortalRef.current = null;
    clearAuthError();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isAdmin,
        employeeProfile,
        profileLoading,
        activePortal,
        setActivePortal,
        schedules,
        positions,
        companySettings,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        selfRegisterEmployee,
        logout,
        authError,
        needsEmailProviderSetup,
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
