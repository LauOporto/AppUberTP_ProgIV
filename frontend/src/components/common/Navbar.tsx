import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Car, LogOut, History, Wifi, WifiOff } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, role, logout, isAuthenticated } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo / Brand */}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight hover:opacity-90">
          <div className="bg-amber-400 p-1.5 rounded-lg text-slate-900">
            <Car className="w-6 h-6" />
          </div>
          <span>UTN<span className="text-amber-400">Drive</span></span>
        </Link>

        {/* Status & Navigation */}
        <div className="flex items-center gap-4">
          {/* WebSocket Live Indicator */}
          <div
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
              isConnected ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-700'
            }`}
            title={isConnected ? 'Conectado a WebSockets en tiempo real' : 'Desconectado del servidor de eventos'}
          >
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isConnected ? 'En Línea' : 'Sin Conexión'}</span>
          </div>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              {/* Role-specific Nav Links */}
              {role === 'PASSENGER' && (
                <>
                  <Link
                    to="/passenger/request"
                    className="text-sm font-medium hover:text-amber-400 transition"
                  >
                    Pedir Viaje
                  </Link>
                  <Link
                    to="/passenger/history"
                    className="flex items-center gap-1 text-sm font-medium hover:text-amber-400 transition"
                  >
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">Historial</span>
                  </Link>
                </>
              )}

              {role === 'DRIVER' && (
                <>
                  <Link
                    to="/driver/dashboard"
                    className="text-sm font-medium hover:text-amber-400 transition"
                  >
                    Panel Conductor
                  </Link>
                  <Link
                    to="/driver/active-trip"
                    className="text-sm font-medium hover:text-amber-400 transition"
                  >
                    Viaje Actual
                  </Link>
                </>
              )}

              {/* User badge */}
              <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
                <div className="flex flex-col text-right">
                  <span className="text-sm font-semibold leading-tight">{user.name}</span>
                  <span className="text-xs text-amber-400 font-medium">{role === 'DRIVER' ? '🚗 Conductor' : '👤 Pasajero'}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm font-medium hover:text-amber-400 transition"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/register/passenger"
                className="bg-amber-400 text-slate-900 font-medium text-sm px-3.5 py-1.5 rounded-lg hover:bg-amber-300 transition"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
