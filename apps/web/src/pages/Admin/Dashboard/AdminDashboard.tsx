import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../../components/common/Container/Container';
import { Button } from '../../../components/common/Button/Button';
import { orderApi, productApi, adminApi } from '../../../services/api';
import { printKitchenTicket, printReceipt, testConnection, isPrinterConfigured, getPrinterConfig, setPrinterConfig } from '../../../services/printer';
import type { Order, Product, AdminSettings } from '@shared/types';
import '../Admin.css';

const REFUND_STATUS_LABELS: Record<Order['refundStatus'], string> = {
    none: 'Ingen',
    pending: 'Väntar',
    refunded: 'Återbetald',
    failed: 'Misslyckad',
};
const REFUND_STATUS_OPTIONS: Order['refundStatus'][] = ['none', 'pending', 'refunded', 'failed'];

// --- Helper: countdown string from ISO time ---
function getCountdown(isoTime: string | undefined): string {
    if (!isoTime) return '--:--';
    const diff = new Date(isoTime).getTime() - Date.now();
    const isOverdue = diff < 0;
    const absoluteDiff = Math.abs(diff);
    const mins = Math.floor(absoluteDiff / 60000);
    const secs = Math.floor((absoluteDiff % 60000) / 1000);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return isOverdue ? `-${formatted}` : formatted;
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
            ⏱ {countdown} {isOverdue ? '(SEN)' : ''}
        </span>
    );
}

type StatsData = Awaited<ReturnType<typeof adminApi.getStatistics>>;

function PrinterSettings() {
    const config = getPrinterConfig();
    const [ip, setIp] = useState(config.ip);
    const [deviceId, setDeviceId] = useState(config.deviceId);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);

    const handleSave = () => {
        setPrinterConfig(ip.trim(), deviceId.trim() || undefined);
        setTestResult('Inställningar sparade.');
    };

    const handleTest = async () => {
        if (!ip.trim()) {
            setTestResult('Ange en IP-adress först.');
            return;
        }
        setPrinterConfig(ip.trim(), deviceId.trim() || undefined);
        setTesting(true);
        setTestResult(null);
        const res = await testConnection();
        setTesting(false);
        setTestResult(res.success ? 'Anslutning lyckades!' : (res.error || 'Kunde inte nå skrivaren.'));
    };

    return (
        <div className="rush-card" style={{ marginTop: '1rem' }}>
            <h3>Skrivare (ePOS-Print)</h3>
            <p>Anslut till en Epson-kvittoskrivare på det lokala nätverket.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Skrivarens IP-adress</label>
                    <input
                        type="text"
                        placeholder="t.ex. 192.168.1.50"
                        value={ip}
                        onChange={e => setIp(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enhets-ID</label>
                    <input
                        type="text"
                        placeholder="local_printer"
                        value={deviceId}
                        onChange={e => setDeviceId(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="primary" size="sm" onClick={handleSave}>Spara</Button>
                    <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
                        {testing ? 'Testar...' : 'Testa anslutning'}
                    </Button>
                </div>
                {testResult && (
                    <p style={{ fontSize: '0.85rem', margin: 0, color: testResult.includes('lyckades') ? '#16a34a' : '#dc2626' }}>
                        {testResult}
                    </p>
                )}
            </div>
        </div>
    );
}

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

function CancelOrderModal({
    open,
    reason,
    onReasonChange,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    reason: string;
    onReasonChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div className="stats-modal-overlay" onClick={onClose}>
            <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Avbryt beställning</h2>
                <p>Ange anledning till avbokning.</p>
                <textarea
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    className="stats-modal-input"
                    rows={4}
                    placeholder="Skriv anledning..."
                    autoFocus
                />
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button
                        variant="primary"
                        onClick={onConfirm}
                        style={{ flex: 1 }}
                        disabled={loading || !reason.trim()}
                    >
                        {loading ? 'Sparar...' : 'Spara och avbryt'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function RefundStatusModal({
    open,
    value,
    onChange,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    value: Order['refundStatus'];
    onChange: (value: Order['refundStatus']) => void;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div className="stats-modal-overlay" onClick={onClose}>
            <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Uppdatera refund-status</h2>
                <p>Välj aktuell status för återbetalningen.</p>
                <select
                    className="stats-modal-input"
                    value={value}
                    onChange={(e) => onChange(e.target.value as Order['refundStatus'])}
                    autoFocus
                >
                    {REFUND_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                            {REFUND_STATUS_LABELS[status]}
                        </option>
                    ))}
                </select>
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }} disabled={loading}>
                        {loading ? 'Sparar...' : 'Spara'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function InternalNotesModal({
    open,
    notes,
    onNotesChange,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    notes: string;
    onNotesChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div className="stats-modal-overlay" onClick={onClose}>
            <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Intern notis</h2>
                <p>Spara en intern anteckning för ordern.</p>
                <textarea
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    className="stats-modal-input"
                    rows={4}
                    placeholder="Skriv intern notis..."
                    maxLength={500}
                    autoFocus
                />
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }} disabled={loading}>
                        {loading ? 'Sparar...' : 'Spara'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ConfirmDeleteOrderModal({
    open,
    orderNumber,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    orderNumber?: string;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div className="stats-modal-overlay" onClick={onClose}>
            <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Ta bort order</h2>
                <p>
                    Är du säker på att du vill ta bort {orderNumber ? `order ${orderNumber}` : 'den här ordern'}?
                    Detta går inte att ångra.
                </p>
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }} disabled={loading}>
                        {loading ? 'Tar bort...' : 'Ta bort'}
                    </Button>
                </div>
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
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [refundModalOpen, setRefundModalOpen] = useState(false);
    const [refundOrderId, setRefundOrderId] = useState<string | null>(null);
    const [refundStatusValue, setRefundStatusValue] = useState<Order['refundStatus']>('none');
    const [refundSubmitting, setRefundSubmitting] = useState(false);
    const [notesModalOpen, setNotesModalOpen] = useState(false);
    const [notesOrderId, setNotesOrderId] = useState<string | null>(null);
    const [notesValue, setNotesValue] = useState('');
    const [notesSubmitting, setNotesSubmitting] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
    const [deleteOrderNumber, setDeleteOrderNumber] = useState<string>('');
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const statsAuthPasswordRef = useRef('');

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

            if (isPrinterConfigured()) {
                printKitchenTicket(accepted).then(res => {
                    if (!res.success) console.error('[Auto-print]', res.error);
                });
            }
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

    const openCancelModal = (orderId: string) => {
        setCancelOrderId(orderId);
        setCancelReason('');
        setCancelModalOpen(true);
    };

    const closeCancelModal = () => {
        setCancelModalOpen(false);
        setCancelOrderId(null);
        setCancelReason('');
        setCancelSubmitting(false);
    };

    const handleCancelOrder = async () => {
        if (!cancelOrderId || !cancelReason.trim()) return;
        setCancelSubmitting(true);
        try {
            const updated = await orderApi.updateStatus(cancelOrderId, { status: 'avbruten', cancellationReason: cancelReason.trim() });
            setActiveOrders(prev => prev.filter(o => o.id !== cancelOrderId));
            setHistoryOrders(prev => [updated, ...prev.filter(o => o.id !== cancelOrderId)]);
            closeCancelModal();
        } catch {
            setError('Kunde inte avbryta ordern.');
            setCancelSubmitting(false);
        }
    };

    const openRefundModal = (order: Order) => {
        setRefundOrderId(order.id);
        setRefundStatusValue(order.refundStatus || 'none');
        setRefundModalOpen(true);
    };

    const closeRefundModal = () => {
        setRefundModalOpen(false);
        setRefundOrderId(null);
        setRefundStatusValue('none');
        setRefundSubmitting(false);
    };

    const handleUpdateRefundStatus = async () => {
        if (!refundOrderId) return;
        setRefundSubmitting(true);
        try {
            const updated = await orderApi.updateRefundStatus(refundOrderId, { refundStatus: refundStatusValue });
            setHistoryOrders(prev => prev.map(o => (o.id === refundOrderId ? updated : o)));
            closeRefundModal();
        } catch {
            setError('Kunde inte uppdatera refund-status.');
            setRefundSubmitting(false);
        }
    };

    const openNotesModal = (order: Order) => {
        setNotesOrderId(order.id);
        setNotesValue(order.internalNotes || '');
        setNotesModalOpen(true);
    };

    const closeNotesModal = () => {
        setNotesModalOpen(false);
        setNotesOrderId(null);
        setNotesValue('');
        setNotesSubmitting(false);
    };

    const handleUpdateInternalNotes = async () => {
        if (!notesOrderId) return;
        setNotesSubmitting(true);
        try {
            const updated = await orderApi.updateInternalNotes(notesOrderId, { internalNotes: notesValue });
            setHistoryOrders(prev => prev.map(o => (o.id === notesOrderId ? updated : o)));
            closeNotesModal();
        } catch {
            setError('Kunde inte spara intern anteckning.');
            setNotesSubmitting(false);
        }
    };

    const openDeleteModal = (order: Order) => {
        setDeleteOrderId(order.id);
        setDeleteOrderNumber(order.orderNumber || '');
        setDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
        setDeleteModalOpen(false);
        setDeleteOrderId(null);
        setDeleteOrderNumber('');
        setDeleteSubmitting(false);
    };

    const handleDeleteOrder = async () => {
        if (!deleteOrderId) return;
        setDeleteSubmitting(true);
        try {
            await orderApi.deleteOrder(deleteOrderId);
            setHistoryOrders(prev => prev.filter(o => o.id !== deleteOrderId));
            closeDeleteModal();
        } catch {
            setError('Kunde inte ta bort ordern.');
            setDeleteSubmitting(false);
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

    const handlePrintReceipt = async (order: Order) => {
        if (!isPrinterConfigured()) {
            setError('Skrivaren är inte konfigurerad. Ange IP-adress under Inställningar.');
            return;
        }
        const result = await printReceipt(order);
        if (!result.success) {
            setError(result.error || 'Kunde inte skriva ut kvitto. Kontrollera skrivaren.');
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
        const password = statsPassword.trim();
        try {
            const data = await adminApi.getStatistics(password, statsStartDate || undefined, statsEndDate || undefined);
            setStatsData(data);
            statsAuthPasswordRef.current = password;
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
        const password = statsAuthPasswordRef.current;
        if (!password) return;
        setStatsLoading(true);
        try {
            const data = await adminApi.getStatistics(password, start, end);
            setStatsData(data);
            setStatsPeriod('custom');
        } catch (e) {
            console.error('Kunde inte uppdatera statistik:', e);
        } finally {
            setStatsLoading(false);
        }
    };

    const isPaused = settings?.isPaused ?? false;
    const hasCustomDateRange = !!(statsStartDate && statsEndDate);
    const formatStatsDateLabel = (dateValue: string) =>
        new Date(dateValue).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    const statsDateButtonLabel = hasCustomDateRange
        ? `Datum: ${formatStatsDateLabel(statsStartDate)} - ${formatStatsDateLabel(statsEndDate)}`
        : 'Datum';

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
                <CancelOrderModal
                    open={cancelModalOpen}
                    reason={cancelReason}
                    onReasonChange={setCancelReason}
                    onClose={closeCancelModal}
                    onConfirm={handleCancelOrder}
                    loading={cancelSubmitting}
                />
                <RefundStatusModal
                    open={refundModalOpen}
                    value={refundStatusValue}
                    onChange={setRefundStatusValue}
                    onClose={closeRefundModal}
                    onConfirm={handleUpdateRefundStatus}
                    loading={refundSubmitting}
                />
                <InternalNotesModal
                    open={notesModalOpen}
                    notes={notesValue}
                    onNotesChange={setNotesValue}
                    onClose={closeNotesModal}
                    onConfirm={handleUpdateInternalNotes}
                    loading={notesSubmitting}
                />
                <ConfirmDeleteOrderModal
                    open={deleteModalOpen}
                    orderNumber={deleteOrderNumber}
                    onClose={closeDeleteModal}
                    onConfirm={handleDeleteOrder}
                    loading={deleteSubmitting}
                />

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
                                            <Button size="sm" variant="ghost" onClick={() => openCancelModal(order.id)}>
                                                Avbryt
                                            </Button>
                                            <Button size="sm" variant="primary" onClick={() => handleUpdateStatus(order.id, 'klar')}>
                                                Färdig
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handlePrintReceipt(order)}>
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
                                            {order.status === 'avbruten' && (
                                                <>
                                                    {order.cancelledAt && (
                                                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.35rem' }}>
                                                            Avbruten: {new Date(order.cancelledAt).toLocaleString('sv-SE')}
                                                        </p>
                                                    )}
                                                    {order.cancellationReason && (
                                                        <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.25rem' }}>
                                                            Orsak: {order.cancellationReason}
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                            <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.35rem' }}>
                                                Refund: {REFUND_STATUS_LABELS[order.refundStatus || 'none']}
                                            </p>
                                            {order.internalNotes && (
                                                <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.25rem' }}>
                                                    Intern notis: {order.internalNotes}
                                                </p>
                                            )}
                                        </div>
                                        <div className="order-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                                            <Button size="sm" variant="ghost" onClick={() => openRefundModal(order)}>
                                                Refund-status
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => openNotesModal(order)}>
                                                Intern notis
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handlePrintReceipt(order)}>
                                                Kvitto
                                            </Button>
                                            <Button size="sm" variant="ghost" style={{ color: '#DC2626' }} onClick={() => openDeleteModal(order)}>
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
                                            {statsDateButtonLabel}
                                        </Button>
                                        {hasCustomDateRange && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStatsStartDate('');
                                                    setStatsEndDate('');
                                                    setStatsPeriod('dag');
                                                    setIsSelectingDate(false);
                                                }}
                                                style={{ marginLeft: '0.5rem', border: 'none', background: 'transparent', color: '#666', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                Rensa
                                            </button>
                                        )}
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
                            <PrinterSettings />
                        </div>
                    )}
                </div>
            </Container>
        </div>
    );
};




