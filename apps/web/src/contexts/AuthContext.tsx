import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { AdminRole } from '@shared/types';
import { useLocation } from 'react-router-dom';
import { adminApi } from '../services/api';
import { isAdminPath } from '../utils/adminPath';

interface AdminInfo {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    locationId?: string | null;
}

function normalizeAdmin(raw: unknown): AdminInfo | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Partial<AdminInfo>;
    if (!value.id || !value.email) return null;
    return {
        id: String(value.id),
        email: String(value.email),
        name: String(value.name ?? value.email),
        role: value.role === 'location' ? 'location' : 'owner',
        locationId: value.locationId ?? null,
    };
}

interface AuthContextType {
    isAuthenticated: boolean;
    admin: AdminInfo | null;
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface StoredAuth {
    isAuthenticated: boolean;
    admin: AdminInfo | null;
}

function readStoredAuth(): StoredAuth {
    try {
        const stored = localStorage.getItem('adminInfo');
        return {
            isAuthenticated: !!localStorage.getItem('authToken'),
            admin: stored ? normalizeAdmin(JSON.parse(stored)) : null,
        };
    } catch {
        return { isAuthenticated: false, admin: null };
    }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Staff login lives in localStorage. Customer pages never read it, so the
    // visitor's browser is not touched before they have answered the cookie banner.
    const onAdminPage = isAdminPath(useLocation().pathname);
    const [auth, setAuth] = useState<StoredAuth | null>(() => (onAdminPage ? readStoredAuth() : null));
    if (onAdminPage && auth === null) setAuth(readStoredAuth());
    const isAuthenticated = auth?.isAuthenticated ?? false;
    const admin = auth?.admin ?? null;

    const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
        try {
            const result = await adminApi.login(email, password);
            const admin = normalizeAdmin(result.admin);
            if (!admin) return { ok: false, error: 'Inloggning misslyckades' };
            localStorage.setItem('authToken', result.token);
            localStorage.setItem('adminInfo', JSON.stringify(admin));
            setAuth({ isAuthenticated: true, admin });
            return { ok: true };
        } catch (err: any) {
            const message = err?.data?.error || err?.message || 'Inloggning misslyckades';
            return { ok: false, error: message };
        }
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('adminInfo');
        setAuth({ isAuthenticated: false, admin: null });
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
