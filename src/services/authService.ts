import { AdminUser } from '../types';
import { apiClient } from './apiClient';

const AUTH_STORAGE_KEY =
  'avenquis_platform_session';

const TOKEN_KEY =
  'avenquis_platform_token';

const REMEMBER_ME_KEY =
  'avenquis_platform_remember_me';

export interface LoginCredentials {
  email: string;
  password?: string;
  rememberMe?: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: AdminUser;
  errorMessage?: string;
  errorCode?:
    | 'INVALID_CREDENTIALS'
    | 'UNAUTHORIZED_ROLE'
    | 'ACCOUNT_LOCKED'
    | 'MFA_REQUIRED';
}

type LoginResponse = {
  id: number;
  email: string;
  platformRole: string;
  mustChangePassword: boolean;
};

class AuthService {
  private currentUser: AdminUser | null =
    null;

  private listeners: Array<
    (user: AdminUser | null) => void
  > = [];

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    try {
      const stored =
        localStorage.getItem(
          AUTH_STORAGE_KEY,
        );

      if (stored) {
        this.currentUser =
          JSON.parse(stored);
      } else {
        this.currentUser = null;
      }
    } catch {
      this.currentUser = null;
    }
  }

  public async bootstrap(): Promise<void> {
    try {
      const response =
        await apiClient.get<{
          success: boolean;
          data: AdminUser;
        }>('/auth/me');

      if (
        response.ok &&
        response.data?.data
      ) {
        this.currentUser =
          response.data.data;

        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify(
            response.data.data,
          ),
        );
      } else {
        this.clearSession();
      }
    } catch {
      this.clearSession();
    }

    this.notify();
  }

  public subscribe(
    callback: (
      user: AdminUser | null,
    ) => void,
  ): () => void {
    this.listeners.push(callback);

    callback(this.currentUser);

    return () => {
      this.listeners =
        this.listeners.filter(
          (cb) => cb !== callback,
        );
    };
  }

  private notify() {
    this.listeners.forEach((cb) =>
      cb(this.currentUser),
    );
  }

  public getCurrentUser() {
    return this.currentUser;
  }

  public isAuthenticated() {
    return Boolean(this.currentUser);
  }

  public isPlatformSuperAdmin() {
    return (
      this.currentUser?.role ===
      'PLATFORM_SUPER_ADMIN'
    );
  }

  public async signIn(
    credentials?: Partial<LoginCredentials>,
  ): Promise<AuthResult> {
    if (
      !credentials?.email ||
      !credentials?.password
    ) {
      return {
        success: false,
        errorMessage:
          'Email and password are required.',
        errorCode:
          'INVALID_CREDENTIALS',
      };
    }

    try {
      const response =
        await apiClient.post<{ success: boolean; data: LoginResponse }>(
          '/auth/login',
          {
            email:
              credentials.email
                .trim()
                .toLowerCase(),

            password:
              credentials.password,

            rememberMe:
              credentials.rememberMe,
          },
        );

      const user = response.data.data;

      // Fetch full user details from /auth/me now that we have the cookie
      const meResponse = await apiClient.get<{ success: boolean; data: AdminUser }>('/auth/me');
      
      if (!meResponse.ok || !meResponse.data?.data) {
        throw new Error('Failed to fetch user profile after login.');
      }

      const fullUser = meResponse.data.data;

      const storedUser = {
        ...fullUser,
      } as AdminUser;

      this.currentUser =
        storedUser;

      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify(storedUser),
      );

      if (credentials.rememberMe) {
        localStorage.setItem(
          REMEMBER_ME_KEY,
          user.email,
        );
      }

      this.notify();

      return {
        success: true,
        user: storedUser,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unable to sign in.',
        errorCode:
          'INVALID_CREDENTIALS',
      };
    }
  }

  public getRememberedEmail(): string {
    try {
      return (
        localStorage.getItem(
          REMEMBER_ME_KEY,
        ) || ''
      );
    } catch {
      return '';
    }
  }

  public async requestPasswordReset(
    _email: string,
  ): Promise<{
    success: boolean;
    errorMessage?: string;
  }> {
    return {
      success: false,
      errorMessage:
        'Password reset is not enabled yet.',
    };
  }

  public async signOut(): Promise<void> {
    try {
      await apiClient.post(
        '/auth/logout',
        {},
      );
    } catch {
      // Local cleanup still runs.
    } finally {
      this.clearSession();
      this.notify();
    }
  }

  private clearSession() {
    this.currentUser = null;

    try {
      localStorage.removeItem(
        AUTH_STORAGE_KEY,
      );

      localStorage.removeItem(
        TOKEN_KEY,
      );
    } catch {
      // Ignore storage cleanup error.
    }
  }
}

export const authService =
  new AuthService();
