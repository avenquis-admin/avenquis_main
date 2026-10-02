/**
 * Avenquis Control Panel - Auth Context & Route Guard Provider
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AdminUser, PlatformRole } from '../types';
import { authService, LoginCredentials, AuthResult } from '../services/authService';

interface AuthContextType {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isPlatformSuperAdmin: boolean;
  isLoading: boolean;
  signIn: (credentials?: Partial<LoginCredentials>) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  hasRole: (role: PlatformRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(authService.getCurrentUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Start bootstrap process
    const initAuth = async () => {
      setIsLoading(true);
      await authService.bootstrap();
      setIsLoading(false);
    };

    initAuth();

    // 2. Subscribe to subsequent auth changes
    const unsubscribe = authService.subscribe((currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (credentials?: Partial<LoginCredentials>): Promise<AuthResult> => {
    setIsLoading(true);
    const result = await authService.signIn(credentials);
    setIsLoading(false);
    return result;
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    await authService.signOut();
    setIsLoading(false);
  };

  const hasRole = (role: PlatformRole): boolean => {
    if (!user) return false;
    return user.role === role;
  };

  const isAuthenticated = !!user && new Date(user.sessionExpiresAt).getTime() > Date.now();
  const isPlatformSuperAdmin = user?.role === 'PLATFORM_SUPER_ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isPlatformSuperAdmin,
        isLoading,
        signIn,
        signOut,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
