import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/common/Button/Button';
import '../Admin.css';

export const AdminLogin: React.FC = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (login(password)) {
            navigate('/admin/dashboard');
        } else {
            setError('Fel lösenord. Försök igen.');
        }
    };

    return (
        <div className="admin-login-page">
            <div className="admin-login-card animate-in">
                <h1 className="admin-title">Admin Login</h1>
                <form onSubmit={handleSubmit} className="admin-form">
                    <div className="form-group">
                        <label htmlFor="password" className="form-label" style={{ textAlign: 'left' }}>Lösenord</label>
                        <input
                            type="password"
                            id="password"
                            className="form-control"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ange admin-lösenord"
                        />
                    </div>
                    {error && <p className="text-error" style={{ color: 'var(--color-primary-red)' }}>{error}</p>}
                    <Button variant="primary" fullWidth type="submit">
                        Logga in
                    </Button>
                </form>
                <Button variant="ghost" onClick={() => navigate('/')} className="admin-back-btn">
                    ← Tillbaka till hemsidan
                </Button>
            </div>
        </div>
    );
};
