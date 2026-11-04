import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, UserRole } from '../types';
import { authService } from '../services/authService';
import type {
  LoginCredentials,
  RegisterPassengerData,
  RegisterDriverData
} from '../services/authService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  registerPassenger: (data: RegisterPassengerData) => Promise<void>;
  registerDriver: (data: RegisterDriverData) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('access_token');
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        try {
          const profile = await authService.getMe();
          setUser(profile);
          localStorage.setItem('auth_user', JSON.stringify(profile));
        } catch {
          logout();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleAuthSuccess = (data: { user: User; tokens: { accessToken: string; refreshToken: string } }) => {
    setUser(data.user);
    setToken(data.tokens.accessToken);
    localStorage.setItem('access_token', data.tokens.accessToken);
    localStorage.setItem('refresh_token', data.tokens.refreshToken);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
  };

  const login = async (credentials: LoginCredentials) => {
    const data = await authService.login(credentials);
    handleAuthSuccess(data);
  };

  const registerPassenger = async (data: RegisterPassengerData) => {
    const res = await authService.registerPassenger(data);
    handleAuthSuccess(res);
  };

  const registerDriver = async (data: RegisterDriverData) => {
    const res = await authService.registerDriver(data);
    handleAuthSuccess(res);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role || null,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        registerPassenger,
        registerDriver,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
