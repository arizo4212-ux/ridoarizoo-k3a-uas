/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AdminBackoffice } from './components/admin/AdminBackoffice';
import { EmployeePWA } from './components/employee/EmployeePWA';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthProvider, useAuth } from './context/AuthContext';

const AppContent: React.FC = () => {
  const { user, authReady, profileLoading, isAdmin, activePortal } = useAuth();

  if (!authReady || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold text-lg">
          K
        </div>
        <p className="text-sm font-medium text-slate-600">
          Menghubungkan ke KaryaDesk HRM...
        </p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  if (isAdmin && activePortal === 'backoffice') {
    return <AdminBackoffice />;
  }

  return <EmployeePWA />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
        <OfflineIndicator />
      </AuthProvider>
    </ErrorBoundary>
  );
}
