'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { api, ApiError } from './api';

// ─── Types ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'HOST' | 'PARTICIPANT';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name: string, role: string) => Promise<User>;
  logout: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const saveAuth = useCallback((t: string, u: User) => {
    localStorage.setItem('quizify_token', t);
    setToken(t);
    setUser(u);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('quizify_token');
    setToken(null);
    setUser(null);
  }, []);

  // Check for existing token on mount
  useEffect(() => {
    const stored = localStorage.getItem('quizify_token');
    if (stored) {
      setToken(stored);
      api
        .get<{ user: User }>('/api/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => clearAuth())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [clearAuth]);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const data = await api.post<{ token: string; user: User }>('/api/auth/login', {
        email,
        password,
      });
      saveAuth(data.token, data.user);
      return data.user;
    },
    [saveAuth]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string, role: string): Promise<User> => {
      const data = await api.post<{ token: string; user: User }>('/api/auth/signup', {
        email,
        password,
        name,
        role,
      });
      saveAuth(data.token, data.user);
      return data.user;
    },
    [saveAuth]
  );

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
