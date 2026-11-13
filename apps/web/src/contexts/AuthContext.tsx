import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { AdminRole } from '@shared/types';
import { useLocation } from 'react-router-dom';
import { adminApi, clearAdminCsrf } from '../services/api';
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
    isLoading: boolean;
    admin: AdminInfo | null;
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface StoredAuth {
    isAuthenticated: boolean;
    admin: AdminInfo | null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const onAdminPage = isAdminPath(useLocation().pathname);
    const [auth, setAuth] = useState<StoredAuth | null>(null);
    useEffect(() => {
        if (!onAdminPage) return;
        let active = true;
        // Remove credentials saved by the old login, only when entering the staff area.
        try { localStorage.removeItem('authToken'); localStorage.removeItem('adminInfo'); } catch { /* Storage may be disabled. */ }
        const expired = () => { clearAdminCsrf(); setAuth({ isAuthenticated: false, admin: null }); };
        window.addEventListener('admin-session-expired', expired);
        void adminApi.getSession().then(result => {
            const admin = normalizeAdmin(result.admin);
            if (active) setAuth({ isAuthenticated: Boolean(admin), admin });
        }).catch(() => { if (active) expired(); });
        return () => { active = false; window.removeEventListener('admin-session-expired', expired); };
    }, [onAdminPage]);
    const isAuthenticated = auth?.isAuthenticated ?? false;
    const admin = auth?.admin ?? null;

    const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
        try {
            const result = await adminApi.login(email, password);
            const admin = normalizeAdmin(result.admin);
            if (!admin) return { ok: false, error: 'Inloggning misslyckades' };
            setAuth({ isAuthenticated: true, admin });
            return { ok: true };
        } catch (err: any) {
            const message = err?.data?.error || err?.message || 'Inloggning misslyckades';
            return { ok: false, error: message };
        }
    };

    const logout = useCallback(async () => {
        await adminApi.logout();
        setAuth({ isAuthenticated: false, admin: null });
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading: onAdminPage && auth === null, admin, login, logout }}>
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
