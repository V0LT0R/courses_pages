import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <div className="container page-section"><div className="card content-card">Загрузка...</div></div>;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
