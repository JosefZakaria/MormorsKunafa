import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/common/Button/Button';
import '../Admin.css';

export const AdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const cleanEmail = email.trim();
        const cleanPassword = password.trim();
        
        const result = await login(cleanEmail, cleanPassword);

        if (result.ok) {
            navigate('/admin/dashboard');
        } else {
            setError(result.error || 'Fel e-post eller lösenord. Försök igen.');
        }

        setIsLoading(false);
    };

    return (
        <div className="admin-login-page">
            <div className="admin-login-card animate-in">
                <h1 className="admin-title">Admin Login</h1>
                <form onSubmit={handleSubmit} className="admin-form">
                    <div className="form-group">
                        <label htmlFor="email" className="form-label" style={{ textAlign: 'left' }}>E-post</label>
                        <input
                            type="email"
                            id="email"
                            className="form-control"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="E-postadress"
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password" className="form-label" style={{ textAlign: 'left' }}>Lösenord</label>
                        <input
                            type="password"
                            id="password"
                            className="form-control"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Lösenord"
                            required
                            disabled={isLoading}
                        />
                    </div>
                    {error && <p className="text-error" style={{ color: 'var(--color-primary-red)' }}>{error}</p>}
                    <Button variant="primary" fullWidth type="submit" disabled={isLoading}>
                        {isLoading ? 'Loggar in...' : 'Logga in'}
                    </Button>
                </form>
                <Button variant="ghost" onClick={() => navigate('/')} className="admin-back-btn">
                    ← Tillbaka till hemsidan
                </Button>
            </div>
        </div>
    );
};

