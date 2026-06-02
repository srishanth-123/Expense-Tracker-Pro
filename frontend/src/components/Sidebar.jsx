import React, { useContext, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Wallet, PieChart, Users, Target, LogOut, X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { user, refreshUser, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Transactions', path: '/transactions', icon: <Receipt size={20} /> },
    { name: 'Wallet Top-up', path: '/wallet', icon: <Wallet size={20} /> },
    { name: 'Split Expenses', path: '/splits', icon: <Users size={20} /> },
    { name: 'Budgets', path: '/budgets', icon: <Target size={20} /> },
    { name: 'Analytics', path: '/analytics', icon: <PieChart size={20} /> },
  ];

  const sidebarStyle = {
    width: '260px',
    height: '100vh',
    background: 'var(--surface)',
    backdropFilter: 'blur(20px)',
    borderRight: '1px solid var(--surface-border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: isMobile ? 'fixed' : 'relative',
    top: 0,
    left: 0,
    zIndex: 50,
    transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
  };

  return (
    <div style={sidebarStyle}>
      <div style={{ padding: '0 24px', marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '12px', color: 'white' }}>
            <Wallet size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.5px' }}>ExpenseTracker</h2>
        </div>
        {isMobile && (
          <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        )}
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              color: isActive ? 'white' : 'var(--text-secondary)',
              background: isActive ? 'var(--primary)' : 'transparent',
              textDecoration: 'none',
              fontWeight: 500,
              transition: 'all 0.2s ease',
            })}
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '0 16px', marginTop: 'auto' }}>
        {/* Pro Upgrade/Subscription status box */}
        {user && !user.isPro && (
          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08))',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '12px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#8b5cf6' }}>★</span> Get Pro Membership
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
              Unlock unlimited AI Chat, insights, and predictions.
            </div>
            <button
              disabled={upgrading}
              onClick={async () => {
                try {
                  setUpgrading(true);
                  const res = await api.post('/payment/subscribe-pro');
                  const dataObj = res.data ? res : { message: res.message, ...res };
                  alert(dataObj.message || "Successfully upgraded to Pro!");
                  if (refreshUser) await refreshUser();
                } catch (err) {
                  const errorText = err.response?.data?.message || err.message || "Upgrade failed.";
                  alert(errorText);
                  if (errorText.toLowerCase().includes("balance")) {
                    navigate('/wallet');
                  }
                } finally {
                  setUpgrading(false);
                }
              }}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                transition: 'opacity 0.2s'
              }}
            >
              {upgrading ? "Upgrading..." : "Upgrade for ₹499"}
            </button>
          </div>
        )}

        {user && user.isPro && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            borderRadius: '12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#34d399',
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
            <span>★</span> Pro Member Active
          </div>
        )}

        <button 
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            padding: '12px 16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--danger)',
            fontWeight: 500,
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            transition: 'background 0.2s ease',
            marginBottom: '8px'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
