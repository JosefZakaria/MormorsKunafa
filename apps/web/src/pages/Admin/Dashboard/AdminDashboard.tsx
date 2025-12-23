import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../../components/common/Container/Container';
import { Button } from '../../../components/common/Button/Button';
import '../Admin.css';

// Mock Data
const MOCK_ORDERS = [
    { id: '#1001', customer: 'Anna Svensson', type: 'Hemkörning', items: '2x Pistage Baklawa, 1x Finmald Kunafa', total: '345 kr', status: 'pending', time: '10 min sedan' },
    { id: '#1002', customer: 'Erik Johansson', type: 'Avhämtning', items: '1x Ostkaka', total: '85 kr', status: 'pending', time: '15 min sedan' },
    { id: '#1003', customer: 'Maria Larsson', type: 'Hemkörning', items: '4x Ashta Kunafa', total: '420 kr', status: 'completed', time: '1 timme sedan' },
    { id: '#1004', customer: 'Karl Andersson', type: 'Avhämtning', items: '1x Harise', total: '45 kr', status: 'completed', time: '2 timmar sedan' },
];

const MOCK_PRODUCTS = [
    { id: 1, name: 'Pistage Baklawa', inStock: true },
    { id: 2, name: 'Walnut Baklawa', inStock: true },
    { id: 3, name: 'Finmald Kunafa', inStock: true },
    { id: 4, name: 'Kaake med Kunafa', inStock: false },
    { id: 5, name: 'Ashta Kunafa', inStock: true },
    { id: 6, name: 'Harise med Ashta', inStock: true },
    { id: 7, name: 'Ostkaka (Halawet el Jibn)', inStock: true },
    { id: 8, name: 'Krispig Kunafa (Grov)', inStock: true },
];

export const AdminDashboard: React.FC = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'stock' | 'rush'>('active');
    const [isPaused, setIsPaused] = useState(false);
    const [products, setProducts] = useState(MOCK_PRODUCTS);
    const [extraTime, setExtraTime] = useState(0);

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const toggleStock = (id: number) => {
        setProducts(products.map(p => p.id === id ? { ...p, inStock: !p.inStock } : p));
    };

    const activeOrders = MOCK_ORDERS.filter(o => o.status === 'pending');
    const historyOrders = MOCK_ORDERS.filter(o => o.status === 'completed');

    return (
        <div className="admin-dashboard">
            <Container>
                <header className="admin-header">
                    <div className="admin-header-left">
                        <h1>Admin Dashboard</h1>
                        <span className={`status-badge ${isPaused ? 'status-paused' : 'status-active'}`}>
                            {isPaused ? '🔴 STOPPAD' : '🟢 ONLINE'}
                        </span>
                    </div>
                    <div className="admin-header-actions">
                        <Button
                            variant={isPaused ? "primary" : "ghost"}
                            className={isPaused ? "btn-resume" : "btn-pause"}
                            onClick={() => setIsPaused(!isPaused)}
                        >
                            {isPaused ? 'Återuppta Beställningar' : 'Pausa Beställningar'}
                        </Button>
                        <Button variant="ghost" onClick={handleLogout}>Logga ut</Button>
                    </div>
                </header>

                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'active' ? 'active' : ''}`}
                        onClick={() => setActiveTab('active')}
                    >
                        Aktiva Ordrar ({activeOrders.length})
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        Orderhistorik
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'stock' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stock')}
                    >
                        Lager
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'rush' ? 'active' : ''}`}
                        onClick={() => setActiveTab('rush')}
                    >
                        Rusningstid
                    </button>
                </div>

                <div className="admin-content animate-in">
                    {activeTab === 'active' && (
                        <div className="orders-list">
                            {activeOrders.length === 0 ? <p>Inga aktiva ordrar.</p> : activeOrders.map(order => (
                                <div key={order.id} className="admin-order-card">
                                    <div className="order-details">
                                        <h3>{order.id} - {order.customer}</h3>
                                        <p><strong>{order.type}</strong> • {order.time}</p>
                                        <p>{order.items}</p>
                                        <p className="order-total">{order.total}</p>
                                    </div>
                                    <div className="order-actions">
                                        <Button size="sm" variant="primary">Acceptera</Button>
                                        <Button size="sm" variant="ghost">Avvisa</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="orders-list">
                            {historyOrders.map(order => (
                                <div key={order.id} className="admin-order-card" style={{ borderLeftColor: 'var(--color-gray-500)' }}>
                                    <div className="order-details">
                                        <h3>{order.id} - {order.customer}</h3>
                                        <span className="status-badge status-completed">Slutförd</span>
                                        <p>{order.items}</p>
                                        <p className="order-total">{order.total}</p>
                                    </div>
                                    <div className="order-actions">
                                        <Button size="sm" variant="ghost">Visa detaljer</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'stock' && (
                        <div className="stock-list">
                            {products.map(product => (
                                <div key={product.id} className="admin-stock-card">
                                    <span className="stock-name">{product.name}</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={product.inStock}
                                            onChange={() => toggleStock(product.id)}
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

                    {activeTab === 'rush' && (
                        <div className="rush-settings">
                            <div className="rush-card">
                                <h3>Hantera Väntetid</h3>
                                <p>Justera förväntad väntetid för kunder när det är högt tryck.</p>
                                <div className="rush-controls">
                                    <Button variant="ghost" onClick={() => setExtraTime(Math.max(0, extraTime - 5))}>- 5 min</Button>
                                    <div className="rush-display">
                                        <span className="time-value">+{extraTime}</span>
                                        <span className="time-unit">minuter</span>
                                    </div>
                                    <Button variant="ghost" onClick={() => setExtraTime(extraTime + 5)}>+ 5 min</Button>
                                </div>
                                <p className="rush-preview">Kunder ser: <strong>"Förväntad leverans: {30 + extraTime} - {45 + extraTime} min"</strong></p>
                            </div>
                        </div>
                    )}
                </div>
            </Container>
        </div>
    );
};
