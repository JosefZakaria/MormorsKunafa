import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../../components/common/Container/Container';
import { Button } from '../../../components/common/Button/Button';
import { orderApi, productApi, adminApi } from '../../../services/api';
import { printKitchenTicket, printReceipt, testConnection, isPrinterConfigured, getPrinterConfig, setPrinterConfig } from '../../../services/printer';
import type { Order, Product, AdminSettings } from '@shared/types';
import '../Admin.css';

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

function formatScheduledDate(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Stockholm',
    });
    const capitalized = datePart.charAt(0).toUpperCase() + datePart.slice(1);
    return capitalized;
}

function daysUntil(iso: string | undefined): number | null {
    if (!iso) return null;
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    const targetStr = new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    if (!todayStr || !targetStr) return null;
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const [y, m, d] = targetStr.split('-').map(Number);
    const todayUtc = Date.UTC(ty, tm - 1, td);
    const targetUtc = Date.UTC(y, m - 1, d);
    return Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

function PreOrderCard({ order, onEditNotes, onDelete }: {
    order: Order;
    onEditNotes: (order: Order) => void;
    onDelete: (order: Order) => void;
}) {
    const dateLabel = formatScheduledDate(order.scheduledTime);
    const diffDays = daysUntil(order.scheduledTime);
    const relativeLabel =
        diffDays === 1 ? 'Imorgon' :
            diffDays != null && diffDays > 1 ? `Om ${diffDays} dagar` :
                diffDays === 0 ? 'Idag' : '';

    return (
        <div className="admin-order-card preorder-card">
            <div className="order-details">
                <h3>
                    {order.orderNumber}
                    &nbsp;·&nbsp;
                    <OrderTypeLabel type={order.orderType} />
                </h3>
                <div className="preorder-date-banner">
                    <span className="preorder-date-relative">{relativeLabel}</span>
                    <span className="preorder-date-absolute">{dateLabel}</span>
                </div>
                <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                    {order.items.map((item, i) => (
                        <li key={i}>{item.quantity}x {item.productName} – {(item.price * item.quantity / 100).toFixed(0)} kr</li>
                    ))}
                </ul>
                <p className="order-total">{(order.totalPrice / 100).toFixed(0)} kr</p>
                {order.customerInfo?.name && (
                    <p style={{ fontSize: '0.85rem', color: '#444', margin: '0.25rem 0 0' }}>
                        Kund: {order.customerInfo.name}
                        {order.customerInfo.phone ? ` · ${order.customerInfo.phone}` : ''}
                    </p>
                )}
                {order.internalNotes && (
                    <div className="preorder-notes">
                        <span className="preorder-notes-label">Notis:</span> {order.internalNotes}
                    </div>
                )}
                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                    Beställd {new Date(order.createdAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}
                </p>
            </div>
            <div className="order-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                <Button size="sm" variant="ghost" onClick={() => onEditNotes(order)}>
                    {order.internalNotes ? 'Ändra notis' : 'Lägg till notis'}
                </Button>
                <Button size="sm" variant="ghost" style={{ color: '#DC2626' }} onClick={() => onDelete(order)}>
                    Ta bort
                </Button>
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
    password,
    onPasswordChange,
    errorMsg,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    reason: string;
    onReasonChange: (value: string) => void;
    password: string;
    onPasswordChange: (value: string) => void;
    errorMsg: string | null;
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
                <input
                    className="stats-modal-input"
                    type="password"
                    placeholder="Lösenord"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim() && password.trim() && !loading) onConfirm(); }}
                />
                {errorMsg && <p className="stats-modal-error">{errorMsg}</p>}
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button
                        variant="primary"
                        onClick={onConfirm}
                        style={{ flex: 1 }}
                        disabled={loading || !reason.trim() || !password.trim()}
                    >
                        {loading ? 'Sparar...' : 'Spara och avbryt'}
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
    password,
    onPasswordChange,
    errorMsg,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    orderNumber?: string;
    password: string;
    onPasswordChange: (value: string) => void;
    errorMsg: string | null;
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
                <input
                    className="stats-modal-input"
                    type="password"
                    placeholder="Lösenord"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && password.trim() && !loading) onConfirm(); }}
                    autoFocus
                />
                {errorMsg && <p className="stats-modal-error">{errorMsg}</p>}
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }} disabled={loading || !password.trim()}>
                        {loading ? 'Tar bort...' : 'Ta bort'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ConfirmDeleteAllHistoryModal({
    open,
    password,
    onPasswordChange,
    errorMsg,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    password: string;
    onPasswordChange: (value: string) => void;
    errorMsg: string | null;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div className="stats-modal-overlay" onClick={onClose}>
            <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Radera all historik</h2>
                <p>
                    Är du säker på att du vill radera hela orderhistoriken? Detta går inte att ångra.
                </p>
                <input
                    className="stats-modal-input"
                    type="password"
                    placeholder="Lösenord"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && password.trim() && !loading) onConfirm(); }}
                    autoFocus
                />
                {errorMsg && <p className="stats-modal-error">{errorMsg}</p>}
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
                        Avbryt
                    </Button>
                    <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }} disabled={loading || !password.trim()}>
                        {loading ? 'Raderar...' : 'Radera allt'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// One row in the Lager tab. Keeps its own input draft state so the admin can
// type freely without triggering a save on every keystroke; the draft is
// committed on blur or when Enter is pressed.
function StockRow({
    product,
    onToggle,
    onUpdateQuantity,
}: {
    product: Product;
    onToggle: (product: Product) => void;
    onUpdateQuantity: (product: Product, value: string) => void | Promise<void>;
}) {
    const stored = product.stockQuantity == null ? '' : String(product.stockQuantity);
    const [draft, setDraft] = useState(stored);

    useEffect(() => {
        setDraft(stored);
    }, [stored]);

    const isTracked = product.stockQuantity != null;
    const outOfStock = !product.inStock;
    const outReason =
        !product.inStock && isTracked && product.stockQuantity === 0
            ? 'Slut'
            : !product.inStock
                ? 'Avstängd'
                : null;

    return (
        <div className={`admin-stock-card ${outOfStock ? 'stock-card-out' : ''}`}>
            <span className="stock-name">{product.name}</span>

            <div className="stock-qty-wrapper">
                <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className="stock-qty-input"
                    placeholder="—"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                        if (draft !== stored) void onUpdateQuantity(product, draft);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                        } else if (e.key === 'Escape') {
                            setDraft(stored);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                />
                <span className="stock-qty-unit">st</span>
            </div>

            <label className="switch">
                <input
                    type="checkbox"
                    checked={product.inStock}
                    onChange={() => onToggle(product)}
                />
                <span className="slider round"></span>
            </label>
            <span className={`stock-status ${product.inStock ? 'text-success' : 'text-error'}`}>
                {product.inStock ? 'I lager' : outReason ?? 'Slut'}
            </span>
        </div>
    );
}

export const AdminDashboard: React.FC = () => {
    const { logout, admin } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'pending' | 'preorders' | 'active' | 'history' | 'stock' | 'rush' | 'stats'>('pending');

    // Data state
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [preOrders, setPreOrders] = useState<Order[]>([]);
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
    const [cancelPassword, setCancelPassword] = useState('');
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [notesModalOpen, setNotesModalOpen] = useState(false);
    const [notesOrderId, setNotesOrderId] = useState<string | null>(null);
    const [notesValue, setNotesValue] = useState('');
    const [notesSubmitting, setNotesSubmitting] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
    const [deleteOrderNumber, setDeleteOrderNumber] = useState<string>('');
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
    const [deleteAllSubmitting, setDeleteAllSubmitting] = useState(false);
    const [deleteAllPassword, setDeleteAllPassword] = useState('');
    const [deleteAllError, setDeleteAllError] = useState<string | null>(null);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const statsAuthPasswordRef = useRef('');

    // --- Fetch pending + active + pre-orders ---
    const fetchOrders = useCallback(async () => {
        try {
            const [pending, active, preOrdersList] = await Promise.all([
                orderApi.getPending(),
                orderApi.getActive(),
                orderApi.getPreOrders(),
            ]);
            setPendingOrders(pending);
            setActiveOrders(active);
            setPreOrders(preOrdersList);
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
        pollingRef.current = setInterval(fetchOrders, 3000);
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchOrders]);

    // --- Fetch products + settings on mount ---
    useEffect(() => {
        productApi.getAll().then(setProducts).finally(() => setLoadingProducts(false));
        adminApi.getSettings().then(setSettings);
    }, []);

    // Refresh products while viewing the Lager tab so the stock counters
    // reflect new orders placed by customers in (near) real time.
    useEffect(() => {
        if (activeTab !== 'stock') return;
        const refresh = () => productApi.getAll().then(setProducts).catch(() => undefined);
        const id = setInterval(refresh, 5000);
        return () => clearInterval(id);
    }, [activeTab]);

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
        setCancelPassword('');
        setCancelError(null);
        setCancelModalOpen(true);
    };

    const closeCancelModal = () => {
        setCancelModalOpen(false);
        setCancelOrderId(null);
        setCancelReason('');
        setCancelSubmitting(false);
        setCancelPassword('');
        setCancelError(null);
    };

    const handleCancelOrder = async () => {
        if (!cancelOrderId || !cancelReason.trim() || !cancelPassword.trim()) return;
        setCancelSubmitting(true);
        setCancelError(null);
        try {
            const updated = await orderApi.cancelOrder(cancelOrderId, cancelReason.trim(), cancelPassword.trim());
            setActiveOrders(prev => prev.filter(o => o.id !== cancelOrderId));
            setHistoryOrders(prev => [updated, ...prev.filter(o => o.id !== cancelOrderId)]);
            closeCancelModal();
        } catch (e: any) {
            const msg = e?.status === 401 ? 'Felaktigt lösenord.' : 'Kunde inte avbryta ordern.';
            setCancelError(msg);
            setCancelSubmitting(false);
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
            setPreOrders(prev => prev.map(o => (o.id === notesOrderId ? updated : o)));
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
        setDeletePassword('');
        setDeleteError(null);
    };

    const handleDeleteOrder = async () => {
        if (!deleteOrderId || !deletePassword.trim()) return;
        setDeleteSubmitting(true);
        setDeleteError(null);
        try {
            await orderApi.deleteOrder(deleteOrderId, deletePassword.trim());
            setHistoryOrders(prev => prev.filter(o => o.id !== deleteOrderId));
            setPreOrders(prev => prev.filter(o => o.id !== deleteOrderId));
            closeDeleteModal();
        } catch (e: any) {
            const msg = e?.status === 401 ? 'Felaktigt lösenord.' : 'Kunde inte ta bort ordern.';
            setDeleteError(msg);
            setDeleteSubmitting(false);
        }
    };

    const openDeleteAllModal = () => {
        setDeleteAllPassword('');
        setDeleteAllError(null);
        setDeleteAllModalOpen(true);
    };

    const closeDeleteAllModal = () => {
        setDeleteAllModalOpen(false);
        setDeleteAllSubmitting(false);
        setDeleteAllPassword('');
        setDeleteAllError(null);
    };

    const handleDeleteAllHistory = async () => {
        if (!deleteAllPassword.trim()) return;
        setDeleteAllSubmitting(true);
        setDeleteAllError(null);
        try {
            await orderApi.deleteAllHistory(deleteAllPassword.trim());
            setHistoryOrders([]);
            closeDeleteAllModal();
        } catch (e: any) {
            const msg = e?.status === 401 ? 'Felaktigt lösenord.' : 'Kunde inte radera historiken.';
            setDeleteAllError(msg);
            setDeleteAllSubmitting(false);
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

    // --- Stock quantity update (daily counter) ---
    const handleUpdateStockQuantity = async (product: Product, value: string) => {
        const trimmed = value.trim();
        let qty: number | null;
        if (trimmed === '') {
            qty = null;
        } else {
            const parsed = Math.floor(Number(trimmed));
            if (!Number.isFinite(parsed) || parsed < 0) {
                setError('Antal måste vara 0 eller högre.');
                return;
            }
            qty = parsed;
        }
        if ((product.stockQuantity ?? null) === qty) return;
        try {
            const updated = await productApi.updateStockQuantity(product.id, qty);
            setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
        } catch {
            setError('Kunde inte uppdatera antal i lager.');
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
                    <button className={`admin-tab ${activeTab === 'preorders' ? 'active' : ''}`} onClick={() => { setActiveTab('preorders'); setStatsData(null); }}>
                        Förbeställningar {preOrders.length > 0 && <span className="tab-badge">{preOrders.length}</span>}
                    </button>
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
                    password={cancelPassword}
                    onPasswordChange={setCancelPassword}
                    errorMsg={cancelError}
                    onClose={closeCancelModal}
                    onConfirm={handleCancelOrder}
                    loading={cancelSubmitting}
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
                    password={deletePassword}
                    onPasswordChange={setDeletePassword}
                    errorMsg={deleteError}
                    onClose={closeDeleteModal}
                    onConfirm={handleDeleteOrder}
                    loading={deleteSubmitting}
                />
                <ConfirmDeleteAllHistoryModal
                    open={deleteAllModalOpen}
                    password={deleteAllPassword}
                    onPasswordChange={setDeleteAllPassword}
                    errorMsg={deleteAllError}
                    onClose={closeDeleteAllModal}
                    onConfirm={handleDeleteAllHistory}
                    loading={deleteAllSubmitting}
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

                    {/* ── FÖRBESTÄLLNINGAR ── */}
                    {activeTab === 'preorders' && (
                        <div className="orders-list">
                            {loadingOrders ? (
                                <p>Laddar förbeställningar...</p>
                            ) : preOrders.length === 0 ? (
                                <p>Inga förbeställningar just nu.</p>
                            ) : (
                                (() => {
                                    const groups = new Map<string, Order[]>();
                                    for (const order of preOrders) {
                                        const key = order.scheduledTime
                                            ? new Date(order.scheduledTime).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
                                            : 'okänt';
                                        if (!groups.has(key)) groups.set(key, []);
                                        groups.get(key)!.push(order);
                                    }
                                    const sortedKeys = Array.from(groups.keys()).sort();
                                    return sortedKeys.map(key => {
                                        const ordersForDate = groups.get(key)!;
                                        const first = ordersForDate[0];
                                        const heading = formatScheduledDate(first.scheduledTime);
                                        const diff = daysUntil(first.scheduledTime);
                                        const relative =
                                            diff === 1 ? 'Imorgon' :
                                                diff != null && diff > 1 ? `Om ${diff} dagar` : '';
                                        return (
                                            <div key={key} className="preorder-group">
                                                <h2 className="preorder-group-heading">
                                                    {heading}
                                                    {relative && <span className="preorder-group-relative"> · {relative}</span>}
                                                </h2>
                                                {ordersForDate.map(o => (
                                                    <PreOrderCard
                                                        key={o.id}
                                                        order={o}
                                                        onEditNotes={openNotesModal}
                                                        onDelete={openDeleteModal}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    });
                                })()
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
                                        onClick={openDeleteAllModal}
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
                                            {order.internalNotes && (
                                                <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.25rem' }}>
                                                    Intern notis: {order.internalNotes}
                                                </p>
                                            )}
                                        </div>
                                        <div className="order-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
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
                                <StockRow
                                    key={product.id}
                                    product={product}
                                    onToggle={handleToggleStock}
                                    onUpdateQuantity={handleUpdateStockQuantity}
                                />
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
                        const cancelledOrders = statsPeriod === 'dag' ? t.ordersCancelledDay
                            : statsPeriod === 'vecka' ? t.ordersCancelledWeek
                                : statsPeriod === 'manad' ? t.ordersCancelledMonth
                                    : statsPeriod === 'ar' ? t.ordersCancelledYear
                                        : statsPeriod === 'custom' ? t.ordersCancelledCustom
                                            : t.ordersCancelledTotal;
                        const completedOrders = orders;
                        const allFinishedOrders = completedOrders + cancelledOrders;
                        const cancellationRate = allFinishedOrders > 0 ? (cancelledOrders / allFinishedOrders) * 100 : 0;

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
                                </div>

                                <div className="history-date-filter">
                                    <div className="history-date-field">
                                        <label>Från</label>
                                        <input
                                            type="date"
                                            value={statsStartDate}
                                            onChange={(e) => setStatsStartDate(e.target.value)}
                                        />
                                    </div>
                                    <div className="history-date-field">
                                        <label>Till</label>
                                        <input
                                            type="date"
                                            value={statsEndDate}
                                            onChange={(e) => setStatsEndDate(e.target.value)}
                                        />
                                    </div>
                                    {(statsStartDate || statsEndDate) && (
                                        <button
                                            type="button"
                                            className="history-date-clear"
                                            onClick={() => {
                                                setStatsStartDate('');
                                                setStatsEndDate('');
                                                setStatsPeriod('dag');
                                            }}
                                        >
                                            Rensa filter
                                        </button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => {
                                            if (statsStartDate && statsEndDate) {
                                                handleUpdateCustomStats(statsStartDate, statsEndDate);
                                            }
                                        }}
                                        disabled={!statsStartDate || !statsEndDate || statsLoading}
                                    >
                                        {statsLoading ? 'Laddar...' : 'Visa'}
                                    </Button>
                                </div>
                                {/* KPI-kort */}
                                <div className="stats-big-cards">
                                    <div className="stats-big-card">
                                        <span className="stats-card-label">Genomförda ordrar</span>
                                        <span className="stats-big-value">{completedOrders.toLocaleString('sv-SE')} <span>st</span></span>
                                    </div>
                                    <div className="stats-big-card">
                                        <span className="stats-card-label">Avbrutna ordrar</span>
                                        <span className="stats-big-value">{cancelledOrders.toLocaleString('sv-SE')} <span>st</span></span>
                                    </div>
                                    <div className="stats-big-card highlight">
                                        <span className="stats-card-label">Intäkter</span>
                                        <span className="stats-big-value">{Math.round(revenueOre / 100).toLocaleString('sv-SE')} <span>kr</span></span>
                                    </div>
                                    <div className="stats-big-card">
                                        <span className="stats-card-label">Avbokningsgrad</span>
                                        <span className="stats-big-value">{cancellationRate.toFixed(1).replace('.', ',')} <span>%</span></span>
                                    </div>
                                    <div className="stats-big-card">
                                        <span className="stats-card-label">Sålda varor</span>
                                        <span className="stats-big-value">{items.toLocaleString('sv-SE')} <span>st</span></span>
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




