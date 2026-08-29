import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// The master password itself now lives server-side only (src/lib/session.ts,
// AKS_MASTER_PASSWORD env var) and is verified by POST /api/auth/login,
// which issues a real httpOnly session cookie backed by the `sessions`
// table. Previously this file held the password as a plaintext constant
// compared entirely in the browser -- readable by anyone who opened the
// shipped JS bundle or devtools, regardless of how "protected" the UI
// looked. `login()` is now async since it's a real network call.

interface AuthContextType {
  isAuthenticated: boolean;
  checking: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((json) => {
        if (!cancelled) setIsAuthenticated(!!json?.authenticated);
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const ok = res.ok;
      if (ok) setIsAuthenticated(true);
      return ok;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, checking, login, logout }}>
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
