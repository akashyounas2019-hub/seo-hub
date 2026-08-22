import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const MASTER_PASSWORD = "03335148974@Abu";
const AUTH_STORAGE_KEY = "aks_master_auth_v1";

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(AUTH_STORAGE_KEY) === "authenticated";
  });

  const login = (password: string): boolean => {
    if (password === MASTER_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, "authenticated");
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
