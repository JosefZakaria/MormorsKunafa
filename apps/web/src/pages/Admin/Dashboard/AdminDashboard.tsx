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
        'eat-here': 'Äta här',
        'takeaway': 'Ta med',
        'delivery': 'Hemleverans',
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

type StatsData = Awaited<ReturnType<typeof adminApi.getStatistics>>;

function PendingOrderCard({ order, defaultPrepTime, onAccept }: {
    order: Order;
    defaultPrepTime: number;
    onAccept: (orderId: string, extraMinutes: number) => void;
}) {
    const [extraMinutes, setExtraMinutes] = useState(0);
    const totalMinutes = defaultPrepTime + extraMinutes;

    return (
        <div className="admin-order-card pending-order-card">
            <div className="order-details">
                <h3>
                    {order.orderNumber}
                    &nbsp;·&nbsp;
                    <OrderTypeLabel type={order.orderType} />
                </h3>
                <span className="status-badge status-ny">Ny</span>
                <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                    {order.items.map((item, i) => (
                        <li key={i}>{item.quantity}x {item.productName} – {(item.price * item.quantity / 100).toFixed(0)} kr</li>
                    ))}
                </ul>
                <p className="order-total">{(order.totalPrice / 100).toFixed(0)} kr</p>
                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                    Beställd {new Date(order.createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
            <div className="pending-actions">
                <div className="pending-time-display">
                    <span className="pending-time-value">{totalMinutes}</span>
                    <span className="pending-time-unit">min</span>
                </div>
                <div className="pending-time-buttons">
                    <Button size="sm" variant="ghost" onClick={() => setExtraMinutes(prev => Math.max(-defaultPrepTime + 5, prev - 5))}>−5</Button>
                    <Button size="sm" variant="ghost" onClick={() => setExtraMinutes(prev => prev + 5)}>+5</Button>
                    <Button size="sm" variant="ghost" onClick={() => setExtraMinutes(prev => prev + 10)}>+10</Button>
                </div>
                <Button size="sm" variant="primary" onClick={() => onAccept(order.id, extraMinutes)}>
                    Acceptera
                </Button>
            </div>
        </div>
    );
}

export const AdminDashboard: React.FC = () => {
    const { logout, admin } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'history' | 'stock' | 'rush' | 'stats'>('pending');

    // Data state
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [activeOrders, setActiveOrders] = useState<Order[]>([]);
    const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [settings, setSettings] = useState<AdminSettings | null>(null);

    // Statistics state
    const [showStatsModal, setShowStatsModal] = useState(false);
    const [statsPassword, setStatsPassword] = useState('');
    const [statsError, setStatsError] = useState<string | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsData, setStatsData] = useState<StatsData | null>(null);
    const [statsPeriod, setStatsPeriod] = useState<'dag' | 'vecka' | 'manad' | 'ar' | 'custom'>('dag');
    const [statsStartDate, setStatsStartDate] = useState<string>('');
    const [statsEndDate, setStatsEndDate] = useState<string>('');
    const [isSelectingDate, setIsSelectingDate] = useState(false);

    // UI state
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // --- Fetch pending + active orders ---
    const fetchOrders = useCallback(async () => {
        try {
            const [pending, active] = await Promise.all([
                orderApi.getPending(),
                orderApi.getActive(),
            ]);
            setPendingOrders(pending);
            setActiveOrders(active);
            setError(null);
        } catch (e: any) {
            setError('Kunde inte hämta ordrar.');
        } finally {
            setLoadingOrders(false);
        }
    }, []);

    // --- Polling every 5s ---
    useEffect(() => {
        fetchOrders();
        pollingRef.current = setInterval(fetchOrders, 5000);
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchOrders]);

    // --- Fetch products + settings on mount ---
    useEffect(() => {
        productApi.getAll().then(setProducts).finally(() => setLoadingProducts(false));
        adminApi.getSettings().then(setSettings);
    }, []);

    // --- Fetch history when tab opens + poll while on tab ---
    useEffect(() => {
        if (activeTab !== 'history') return;

        const fetchHistory = () => {
            orderApi.getHistory(200, historyDateFrom || undefined, historyDateTo || undefined)
                .then(setHistoryOrders)
                .finally(() => setLoadingHistory(false));
        };

        setLoadingHistory(true);
        fetchHistory();
        const id = setInterval(fetchHistory, 5000);
        return () => clearInterval(id);
    }, [activeTab, historyDateFrom, historyDateTo]);

    // --- Accept pending order ---
    const handleAcceptOrder = async (orderId: string, extraMinutes?: number) => {
        try {
            const accepted = await orderApi.acceptOrder(orderId, extraMinutes);
            setPendingOrders(prev => prev.filter(o => o.id !== orderId));
            setActiveOrders(prev => [...prev, accepted]);
        } catch {
            setError('Kunde inte acceptera ordern.');
        }
    };

    // --- Order actions ---
    const handleUpdateStatus = async (orderId: string, status: Order['status']) => {
        try {
            const updated = await orderApi.updateStatus(orderId, { status });
            setActiveOrders(prev =>
                status === 'klar' || status === 'avbruten' || status === 'uthämtad' || status === 'levererad'
                    ? prev.filter(o => o.id !== orderId)
                    : prev.map(o => o.id === orderId ? updated : o)
            );
        } catch {
            setError('Kunde inte uppdatera orderstatus.');
        }
    };

    const handleDeleteOrder = async (orderId: string) => {
        try {
            await orderApi.deleteOrder(orderId);
            setHistoryOrders(prev => prev.filter(o => o.id !== orderId));
        } catch {
            setError('Kunde inte ta bort ordern.');
        }
    };

    const handleDeleteAllHistory = async () => {
        if (!confirm('Är du säker på att du vill radera hela orderhistoriken?')) return;
        try {
            await orderApi.deleteAllHistory();
            setHistoryOrders([]);
        } catch {
            setError('Kunde inte radera historiken.');
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

    const handlePrintReceipt = async (orderId: string) => {
        try {
            await orderApi.printReceipt(orderId);
        } catch {
            setError('Kunde inte skriva ut kvitto. Kontrollera skrivaren.');
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

    const handleStatsTabClick = () => {
        if (statsData) {
            setActiveTab('stats');
        } else {
            setShowStatsModal(true);
        }
    };

    const handleStatsSubmit = async () => {
        setStatsLoading(true);
        setStatsError(null);
        try {
            const data = await adminApi.getStatistics(statsPassword, statsStartDate || undefined, statsEndDate || undefined);
            setStatsData(data);
            if (statsStartDate && statsEndDate) {
                setStatsPeriod('custom');
            }
            setShowStatsModal(false);
            setStatsPassword('');
            setActiveTab('stats');
        } catch {
            setStatsError('Fel lösenord eller problem vid hämtning.');
        } finally {
            setStatsLoading(false);
        }
    };

    const handleUpdateCustomStats = async (start: string, end: string) => {
        if (!statsPassword) return;
        setStatsLoading(true);
        try {
            const data = await adminApi.getStatistics(statsPassword, start, end);
            setStatsData(data);
            setStatsPeriod('custom');
        } catch (e) {
            console.error('Kunde inte uppdatera statistik:', e);
        } finally {
            setStatsLoading(false);
        }
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
                    <button className={`admin-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => { setActiveTab('pending'); setStatsData(null); }}>
                        Inkommande {pendingOrders.length > 0 && <span className="tab-badge">{pendingOrders.length}</span>}
                    </button>
                    <button className={`admin-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => { setActiveTab('active'); setStatsData(null); }}>
                        Aktiva Ordrar ({activeOrders.length})
                    </button>
                    <button className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => { setActiveTab('history'); setStatsData(null); }}>
                        Orderhistorik
                    </button>
                    <button className={`admin-tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => { setActiveTab('stock'); setStatsData(null); }}>
                        Lager
                    </button>
                    <button className={`admin-tab ${activeTab === 'rush' ? 'active' : ''}`} onClick={() => { setActiveTab('rush'); setStatsData(null); }}>
                        Inställningar
                    </button>
                    <button className={`admin-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={handleStatsTabClick}>
                        Statistik
                    </button>
                </div>

                {/* ── STATISTIK LÖSENORDS-POPUP ── */}
                {showStatsModal && (
                    <div className="stats-modal-overlay">
                        <div className="stats-modal">
                            <h2>Statistik</h2>
                            <p>Ange lösenord för att se statistiken</p>
                            <input
                                id="stats-password-input"
                                className="stats-modal-input"
                                type="password"
                                placeholder="Lösenord"
                                value={statsPassword}
                                onChange={e => setStatsPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleStatsSubmit()}
                                autoFocus
                            />
                            {statsError && <p className="stats-modal-error">{statsError}</p>}
                            <div className="stats-modal-actions">
                                <Button variant="ghost" onClick={() => { setShowStatsModal(false); setStatsPassword(''); setStatsError(null); }} style={{ flex: 1 }}>Avbryt</Button>
                                <Button variant="primary" onClick={handleStatsSubmit} style={{ flex: 1 }} id="stats-submit-btn">
                                    {statsLoading ? 'Laddar...' : 'Öppna'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="admin-content animate-in">
                    {/* ── INKOMMANDE ORDRAR ── */}
                    {activeTab === 'pending' && (
                        <div className="orders-list">
                            {loadingOrders ? (
                                <p>Laddar ordrar...</p>
                            ) : pendingOrders.length === 0 ? (
                                <p>Inga inkommande ordrar just nu.</p>
                            ) : (
                                pendingOrders.map(order => (
                                    <PendingOrderCard
                                        key={order.id}
                                        order={order}
                                        defaultPrepTime={settings?.defaultPreparationTime ?? 30}
                                        onAccept={handleAcceptOrder}
                                    />
                                ))
                            )}
                        </div>
                    )}

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
                                        <div className="order-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                                            <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(order.id, 'avbruten')}>
                                                Avbryt
                                            </Button>
                                            <Button size="sm" variant="primary" onClick={() => handleUpdateStatus(order.id, 'klar')}>
                                                Färdig
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handlePrintReceipt(order.id)}>
                                                Kvitto
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
                            <div className="history-date-filter">
                                <div className="history-date-field">
                                    <label>Från</label>
                                    <input
                                        type="date"
                                        value={historyDateFrom}
                                        onChange={(e) => setHistoryDateFrom(e.target.value)}
                                    />
                                </div>
                                <div className="history-date-field">
                                    <label>Till</label>
                                    <input
                                        type="date"
                                        value={historyDateTo}
                                        onChange={(e) => setHistoryDateTo(e.target.value)}
                                    />
                                </div>
                                {(historyDateFrom || historyDateTo) && (
                                    <button
                                        className="history-date-clear"
                                        onClick={() => { setHistoryDateFrom(''); setHistoryDateTo(''); }}
                                    >
                                        Rensa filter
                                    </button>
                                )}
                                {historyOrders.length > 0 && (
                                    <button
                                        className="history-delete-all"
                                        onClick={handleDeleteAllHistory}
                                    >
                                        Radera all historik
                                    </button>
                                )}
                            </div>
                            {loadingHistory ? (
                                <p>Laddar historik...</p>
                            ) : historyOrders.length === 0 ? (
                                <p>Ingen orderhistorik ännu.</p>
                            ) : (
                                historyOrders.map(order => (
                                    <div key={order.id} className={`admin-order-card ${order.status === 'avbruten' ? 'history-card-cancelled' : 'history-card-done'}`}>
                                        <div className="order-details">
                                            <h3>{order.orderNumber} · <OrderTypeLabel type={order.orderType} /></h3>
                                            <span className={`status-badge ${order.status === 'avbruten' ? 'status-avbruten' : 'status-klar'}`}>
                                                {order.status === 'avbruten' ? 'Avbruten' : 'Klar'}
                                            </span>
                                            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                                                {order.items.map((item, i) => (
                                                    <li key={i}>{item.quantity}x {item.productName}</li>
                                                ))}
                                            </ul>
                                            <p className="order-total">{(order.totalPrice / 100).toFixed(0)} kr</p>
                                            <p style={{ fontSize: '0.8rem', color: '#888', margin: 0 }}>{new Date(order.createdAt).toLocaleString('sv-SE')}</p>
                                        </div>
                                        <div className="order-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                                            <Button size="sm" variant="ghost" onClick={() => handlePrintReceipt(order.id)}>
                                                Kvitto
                                            </Button>
                                            <Button size="sm" variant="ghost" style={{ color: '#DC2626' }} onClick={() => handleDeleteOrder(order.id)}>
                                                Ta bort
                                            </Button>
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

                    {/* ── STATISTIK ── */}
                    {activeTab === 'stats' && statsData && (() => {
                        const t = statsData.totals;
                        const orders = statsPeriod === 'dag' ? t.ordersDay
                            : statsPeriod === 'vecka' ? t.ordersWeek
                                : statsPeriod === 'manad' ? t.ordersMonth
                                    : statsPeriod === 'ar' ? t.ordersYear
                                        : statsPeriod === 'custom' ? t.ordersCustom
                                            : t.ordersTotal;
                        const items = statsPeriod === 'dag' ? t.itemsDay
                            : statsPeriod === 'vecka' ? t.itemsWeek
                                : statsPeriod === 'manad' ? t.itemsMonth
                                    : statsPeriod === 'ar' ? t.itemsYear
                                        : statsPeriod === 'custom' ? t.itemsCustom
                                            : t.itemsTotal;
                        const revenueOre = statsPeriod === 'dag' ? t.revenueDayOre
                            : statsPeriod === 'vecka' ? t.revenueWeekOre
                                : statsPeriod === 'manad' ? t.revenueMonthOre
                                    : statsPeriod === 'ar' ? t.revenueYearOre
                                        : statsPeriod === 'custom' ? t.revenueCustomOre
                                            : t.revenueTotalOre;

                        return (
                            <div className="stats-section">
                                {/* Rubrik + dropdown + Datum */}
                                <div className="stats-overview-header">
                                    <h3 className="stats-overview-title">Översikt</h3>
                                    <select
                                        id="stats-period-select"
                                        className="stats-period-select"
                                        value={statsPeriod === 'custom' ? 'custom' : statsPeriod}
                                        onChange={e => {
                                            const val = e.target.value as any;
                                            if (val !== 'custom') {
                                                setStatsPeriod(val);
                                                setStatsStartDate('');
                                                setStatsEndDate('');
                                            }
                                        }}
                                    >
                                        <option value="dag">Dag</option>
                                        <option value="vecka">Vecka</option>
                                        <option value="manad">Månad</option>
                                        <option value="ar">År</option>
                                        {statsPeriod === 'custom' && <option value="custom">Anpassat</option>}
                                    </select>

                                    <div className="stats-date-picker-trigger">
                                        <Button variant="ghost" size="sm" onClick={() => setIsSelectingDate(!isSelectingDate)} id="stats-date-btn">
                                            Datum
                                        </Button>
                                        {isSelectingDate && (
                                            <div className="stats-date-popover">
                                                <div className="date-inputs">
                                                    <div>
                                                        <label>Från</label>
                                                        <input
                                                            type="date"
                                                            value={statsStartDate}
                                                            onChange={e => setStatsStartDate(e.target.value)}
                                                            onDoubleClick={() => {
                                                                if (statsStartDate) {
                                                                    setStatsEndDate(statsStartDate);
                                                                    handleUpdateCustomStats(statsStartDate, statsStartDate);
                                                                    setIsSelectingDate(false);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label>Till</label>
                                                        <input
                                                            type="date"
                                                            value={statsEndDate}
                                                            onChange={e => setStatsEndDate(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="primary" onClick={() => {
                                                    if (statsStartDate && statsEndDate) {
                                                        handleUpdateCustomStats(statsStartDate, statsEndDate);
                                                        setIsSelectingDate(false);
                                                    }
                                                }}>Visa</Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 3 stora kort */}
                                <div className="stats-big-cards">
                                    <div className="stats-big-card">
                                        <span className="stats-card-label">Ordrar</span>
                                        <span className="stats-big-value">{orders.toLocaleString('sv-SE')} <span>st</span></span>
                                    </div>
                                    <div className="stats-big-card">
                                        <span className="stats-card-label">Sålda varor</span>
                                        <span className="stats-big-value">{items.toLocaleString('sv-SE')} <span>st</span></span>
                                    </div>
                                    <div className="stats-big-card highlight">
                                        <span className="stats-card-label">Intäkter</span>
                                        <span className="stats-big-value">{Math.round(revenueOre / 100).toLocaleString('sv-SE')} <span>kr</span></span>
                                    </div>
                                </div>

                                {/* Per-produkt tabell */}
                                <div className="stats-table-section">
                                    <h3>Per produkt</h3>
                                    <div className="stats-table-wrapper">
                                        <table className="stats-table">
                                            <thead>
                                                <tr>
                                                    <th>Produkt</th>
                                                    <th className="right">Sålda</th>
                                                    <th className="right">Intäkt</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {statsData.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'sv')).map((p, i) => {
                                                    const pSold = statsPeriod === 'dag' ? p.soldDay
                                                        : statsPeriod === 'vecka' ? p.soldWeek
                                                            : statsPeriod === 'manad' ? p.soldMonth
                                                                : statsPeriod === 'ar' ? p.soldYear
                                                                    : statsPeriod === 'custom' ? p.soldCustom
                                                                        : p.soldTotal;
                                                    const pRev = statsPeriod === 'dag' ? p.revenueDayOre
                                                        : statsPeriod === 'vecka' ? p.revenueWeekOre
                                                            : statsPeriod === 'manad' ? p.revenueMonthOre
                                                                : statsPeriod === 'ar' ? p.revenueYearOre
                                                                    : statsPeriod === 'custom' ? p.revenueCustomOre
                                                                        : p.revenueTotalOre;
                                                    return (
                                                        <tr key={i}>
                                                            <td className="product-name">{p.name}</td>
                                                            <td className="right">{pSold}</td>
                                                            <td className="right revenue-total">{Math.round(pRev / 100).toLocaleString('sv-SE')} kr</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

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




