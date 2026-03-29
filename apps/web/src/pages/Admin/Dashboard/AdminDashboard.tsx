import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../../components/common/Container/Container';
import { Button } from '../../../components/common/Button/Button';
import { orderApi, productApi, adminApi } from '../../../services/api';
import type { Order, Product, AdminSettings } from '@shared/types';
import '../Admin.css';

// --- Helper: countdown string from ISO time ---
function getCountdown(isoTime: string | undefined): string {
    if (!isoTime) return '--:--';
    const diff = new Date(isoTime).getTime() - Date.now();
    if (diff <= 0) return '00:00';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function OrderTypeLabel({ type }: { type: string }) {
    const labels: Record<string, string> = {
        'eat-here': '🍽 Äta här',
        'takeaway': '🥡 Ta med',
        'delivery': '🚗 Leverans',
    };
    return <span>{labels[type] ?? type}</span>;
}

// --- Per-order timer component ---
function OrderTimer({ estimatedReadyTime }: { estimatedReadyTime: string }) {
    const [countdown, setCountdown] = useState(() => getCountdown(estimatedReadyTime));
    const isOverdue = new Date(estimatedReadyTime).getTime() < Date.now();

    useEffect(() => {
        setCountdown(getCountdown(estimatedReadyTime));
        const id = setInterval(() => setCountdown(getCountdown(estimatedReadyTime)), 1000);
        return () => clearInterval(id);
    }, [estimatedReadyTime]);

    return (
        <span className={`order-timer ${isOverdue ? 'timer-overdue' : ''}`}>
            ⏱ {countdown}
        </span>
    );
}

export const AdminDashboard: React.FC = () => {
    const { logout, admin } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'stock' | 'rush'>('active');

    // Data state
    const [activeOrders, setActiveOrders] = useState<Order[]>([]);
    const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [settings, setSettings] = useState<AdminSettings | null>(null);

    // UI state
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // --- Fetch active orders ---
    const fetchActiveOrders = useCallback(async () => {
        try {
            const orders = await orderApi.getActive();
            setActiveOrders(orders);
            setError(null);
        } catch (e: any) {
            setError('Kunde inte hämta aktiva ordrar.');
        } finally {
            setLoadingOrders(false);
        }
    }, []);

    // --- Polling every 10s ---
    useEffect(() => {
        fetchActiveOrders();
        pollingRef.current = setInterval(fetchActiveOrders, 10000);
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchActiveOrders]);

    // --- Fetch products + settings on mount ---
    useEffect(() => {
        productApi.getAll().then(setProducts).finally(() => setLoadingProducts(false));
        adminApi.getSettings().then(setSettings);
    }, []);

    // --- Fetch history when tab opens ---
    useEffect(() => {
        if (activeTab === 'history' && historyOrders.length === 0) {
            setLoadingHistory(true);
            orderApi.getHistory(100).then(setHistoryOrders).finally(() => setLoadingHistory(false));
        }
    }, [activeTab]);

    // --- Order actions ---
    const handleUpdateStatus = async (orderId: string, status: Order['status']) => {
        try {
            const updated = await orderApi.updateStatus(orderId, { status });
            setActiveOrders(prev =>
                status === 'klar' || status === 'uthämtad' || status === 'levererad'
                    ? prev.filter(o => o.id !== orderId)
                    : prev.map(o => o.id === orderId ? updated : o)
            );
        } catch {
            setError('Kunde inte uppdatera orderstatus.');
        }
    };

    const handleAddTime = async (order: Order, extraMinutes: number) => {
        const current = new Date(order.estimatedReadyTime).getTime();
        const newTime = new Date(current + extraMinutes * 60000).toISOString();
        try {
            const updated = await orderApi.updateTime(order.id, { estimatedReadyTime: newTime });
            setActiveOrders(prev => prev.map(o => o.id === order.id ? updated : o));
        } catch {
            setError('Kunde inte uppdatera tid.');
        }
    };

    // --- Stock toggle ---
    const handleToggleStock = async (product: Product) => {
        try {
            const updated = await productApi.updateStock(product.id, !product.inStock);
            setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
        } catch {
            setError('Kunde inte uppdatera lagerstatus.');
        }
    };

    // --- Settings ---
    const handleUpdateSettings = async (patch: Partial<AdminSettings>) => {
        if (!settings) return;
        try {
            const updated = await adminApi.updateSettings(patch);
            setSettings(updated);
        } catch {
            setError('Kunde inte spara inställningar.');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const isPaused = settings?.isPaused ?? false;

    return (
        <div className="admin-dashboard">
            <Container>
                <header className="admin-header">
                    <div className="admin-header-left">
                        <h1>Admin Dashboard</h1>
                        {admin && <span className="admin-name">👤 {admin.name}</span>}
                        <span className={`status-badge ${isPaused ? 'status-paused' : 'status-active'}`}>
                            {isPaused ? '🔴 STOPPAD' : '🟢 ONLINE'}
                        </span>
                    </div>
                    <div className="admin-header-actions">
                        <Button
                            variant={isPaused ? 'primary' : 'ghost'}
                            className={isPaused ? 'btn-resume' : 'btn-pause'}
                            onClick={() => handleUpdateSettings({ isPaused: !isPaused })}
                        >
                            {isPaused ? 'Återuppta Beställningar' : 'Pausa Beställningar'}
                        </Button>
                        <Button variant="ghost" onClick={handleLogout}>Logga ut</Button>
                    </div>
                </header>

                {error && (
                    <div style={{ padding: '0.75rem 1rem', background: '#fee', color: '#c00', borderRadius: '8px', marginBottom: '1rem' }}>
                        {error} <button onClick={() => setError(null)} style={{ marginLeft: '1rem', cursor: 'pointer' }}>✕</button>
                    </div>
                )}

                <div className="admin-tabs">
                    <button className={`admin-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>
                        Aktiva Ordrar ({activeOrders.length})
                    </button>
                    <button className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                        Orderhistorik
                    </button>
                    <button className={`admin-tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
                        Lager
                    </button>
                    <button className={`admin-tab ${activeTab === 'rush' ? 'active' : ''}`} onClick={() => setActiveTab('rush')}>
                        Inställningar
                    </button>
                </div>

                <div className="admin-content animate-in">
                    {/* ── AKTIVA ORDRAR ── */}
                    {activeTab === 'active' && (
                        <div className="orders-list">
                            {loadingOrders ? (
                                <p>Laddar ordrar...</p>
                            ) : activeOrders.length === 0 ? (
                                <p>Inga aktiva ordrar just nu.</p>
                            ) : (
                                activeOrders.map(order => (
                                    <div key={order.id} className="admin-order-card">
                                        <div className="order-details">
                                            <h3>
                                                {order.orderNumber}
                                                &nbsp;·&nbsp;
                                                <OrderTypeLabel type={order.orderType} />
                                            </h3>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <OrderTimer estimatedReadyTime={order.estimatedReadyTime} />
                                                <span className={`status-badge status-${order.status}`}>{order.status}</span>
                                            </div>
                                            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                                                {order.items.map((item, i) => (
                                                    <li key={i}>{item.quantity}x {item.productName} – {(item.price * item.quantity / 100).toFixed(0)} kr</li>
                                                ))}
                                            </ul>
                                            <p className="order-total">{(order.totalPrice / 100).toFixed(0)} kr</p>
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                                <Button size="sm" variant="ghost" onClick={() => handleAddTime(order, -5)}>−5 min</Button>
                                                <Button size="sm" variant="ghost" onClick={() => handleAddTime(order, 5)}>+5 min</Button>
                                                <Button size="sm" variant="ghost" onClick={() => handleAddTime(order, 10)}>+10 min</Button>
                                            </div>
                                        </div>
                                        <div className="order-actions">
                                            {order.status === 'mottagen' && (
                                                <Button size="sm" variant="primary" onClick={() => handleUpdateStatus(order.id, 'påbörjad')}>
                                                    Påbörja
                                                </Button>
                                            )}
                                            {order.status === 'påbörjad' && (
                                                <Button size="sm" variant="primary" onClick={() => handleUpdateStatus(order.id, 'klar')}>
                                                    Markera Klar
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(order.id, order.orderType === 'delivery' ? 'levererad' : 'uthämtad')}>
                                                Avsluta
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── HISTORIK ── */}
                    {activeTab === 'history' && (
                        <div className="orders-list">
                            {loadingHistory ? (
                                <p>Laddar historik...</p>
                            ) : historyOrders.length === 0 ? (
                                <p>Ingen orderhistorik ännu.</p>
                            ) : (
                                historyOrders.map(order => (
                                    <div key={order.id} className="admin-order-card" style={{ borderLeftColor: 'var(--color-gray-500)' }}>
                                        <div className="order-details">
                                            <h3>{order.orderNumber} · <OrderTypeLabel type={order.orderType} /></h3>
                                            <span className={`status-badge status-${order.status}`}>{order.status}</span>
                                            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                                                {order.items.map((item, i) => (
                                                    <li key={i}>{item.quantity}x {item.productName}</li>
                                                ))}
                                            </ul>
                                            <p className="order-total">{(order.totalPrice / 100).toFixed(0)} kr</p>
                                            <p style={{ fontSize: '0.8rem', color: '#888' }}>{new Date(order.createdAt).toLocaleString('sv-SE')}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── LAGER ── */}
                    {activeTab === 'stock' && (
                        <div className="stock-list">
                            {loadingProducts ? (
                                <p>Laddar produkter...</p>
                            ) : products.map(product => (
                                <div key={product.id} className="admin-stock-card">
                                    <span className="stock-name">{product.name}</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={product.inStock}
                                            onChange={() => handleToggleStock(product)}
                                        />
                                        <span className="slider round"></span>
                                    </label>
                                    <span className={`stock-status ${product.inStock ? 'text-success' : 'text-error'}`}>
                                        {product.inStock ? 'I lager' : 'Slut'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── INSTÄLLNINGAR ── */}
                    {activeTab === 'rush' && settings && (
                        <div className="rush-settings">
                            <div className="rush-card">
                                <h3>Standard tillagningstid</h3>
                                <p>Används för alla nya beställningar.</p>
                                <div className="rush-controls">
                                    <Button variant="ghost" onClick={() => handleUpdateSettings({ defaultPreparationTime: Math.max(5, settings.defaultPreparationTime - 5) })}>- 5 min</Button>
                                    <div className="rush-display">
                                        <span className="time-value">{settings.defaultPreparationTime}</span>
                                        <span className="time-unit">minuter</span>
                                    </div>
                                    <Button variant="ghost" onClick={() => handleUpdateSettings({ defaultPreparationTime: settings.defaultPreparationTime + 5 })}>+ 5 min</Button>
                                </div>
                            </div>
                            <div className="rush-card" style={{ marginTop: '1rem' }}>
                                <h3>Extraköns-justering</h3>
                                <p>Läggs på under högt tryck.</p>
                                <div className="rush-controls">
                                    <Button variant="ghost" onClick={() => handleUpdateSettings({ rushTimeAdjustment: Math.max(0, settings.rushTimeAdjustment - 5) })}>- 5 min</Button>
                                    <div className="rush-display">
                                        <span className="time-value">+{settings.rushTimeAdjustment}</span>
                                        <span className="time-unit">minuter</span>
                                    </div>
                                    <Button variant="ghost" onClick={() => handleUpdateSettings({ rushTimeAdjustment: settings.rushTimeAdjustment + 5 })}>+ 5 min</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Container>
        </div>
    );
};




