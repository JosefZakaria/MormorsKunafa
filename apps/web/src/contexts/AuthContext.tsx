import React, { createContext, useContext, useState, ReactNode } from 'react';
import { adminApi } from '../services/api';

interface AdminInfo {
    id: string;
    email: string;
    name: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    admin: AdminInfo | null;
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
        return !!localStorage.getItem('authToken');
    });

    const [admin, setAdmin] = useState<AdminInfo | null>(() => {
        const stored = localStorage.getItem('adminInfo');
        return stored ? JSON.parse(stored) : null;
    });

    const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
        try {
            const result = await adminApi.login(email, password);
            localStorage.setItem('authToken', result.token);
            localStorage.setItem('adminInfo', JSON.stringify(result.admin));
            setIsAuthenticated(true);
            setAdmin(result.admin);
            return { ok: true };
        } catch (err: any) {
            const message = err?.data?.error || err?.message || 'Inloggning misslyckades';
            return { ok: false, error: message };
        }
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('adminInfo');
        setIsAuthenticated(false);
        setAdmin(null);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, admin, login, logout }}>
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
