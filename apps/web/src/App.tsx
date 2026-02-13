import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ScrollToTop } from './components/ScrollToTop';
import { MainLayout } from './components/layout/MainLayout';
import { Landing } from './pages/Landing/Landing';
import { Menu } from './pages/Menu/Menu';
import { Cart } from './pages/Cart/Cart';
import { OrderStatus } from './pages/OrderStatus/OrderStatus';
import { FindUs } from './pages/FindUs/FindUs';
import { Delivery } from './pages/Delivery/Delivery';
import { SelectLocation } from './pages/SelectLocation/SelectLocation';
import { AdminLogin } from './pages/Admin/Login/AdminLogin';
import { AdminDashboard } from './pages/Admin/Dashboard/AdminDashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { CartProvider } from './contexts/CartContext';
import { ToastProvider } from './contexts/ToastContext';
import { Toast } from './components/common/Toast/Toast';

const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/admin/login" />;
};

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <LanguageProvider>
          <CartProvider>
            <ToastProvider>
              <Toast />
              <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Landing />} />
              <Route path="menu" element={<Menu />} />
              <Route path="cart" element={<Cart />} />
              <Route path="status" element={<OrderStatus />} />
              <Route path="find-us" element={<FindUs />} />
              <Route path="delivery" element={<Delivery />} />
              <Route path="select-location" element={<SelectLocation />} />
            </Route>

            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={
              <PrivateRoute>
                <AdminDashboard />
              </PrivateRoute>
            } />
            </Routes>
            </ToastProvider>
          </CartProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App