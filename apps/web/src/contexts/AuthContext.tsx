import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { adminApi } from '../services/api';

interface AdminInfo {
    id: string;
    email: string;
    name: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    admin: AdminInfo | null;
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [admin, setAdmin] = useState<AdminInfo | null>(null);

    useEffect(() => {
        // Remove credentials left by older builds; authentication now lives only
        // in the HttpOnly cookie that JavaScript cannot read.
        localStorage.removeItem('authToken');
        localStorage.removeItem('adminInfo');
        let active = true;
        void adminApi.getSession()
            .then((result) => {
                if (!active) return;
                setAdmin(result.admin);
                setIsAuthenticated(true);
            })
            .catch(() => {
                if (!active) return;
                setAdmin(null);
                setIsAuthenticated(false);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, []);

    const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
        try {
            const result = await adminApi.login(email, password);
            setIsAuthenticated(true);
            setAdmin(result.admin);
            return { ok: true };
        } catch (err: any) {
            const message = err?.data?.error || err?.message || 'Inloggning misslyckades';
            return { ok: false, error: message };
        }
    };

    const logout = () => {
        void adminApi.logout().catch(() => undefined);
        setIsAuthenticated(false);
        setAdmin(null);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, admin, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
