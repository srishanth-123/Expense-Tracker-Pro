import React, { useContext, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, Wallet, PieChart, Users, Target, X, Bot } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { user } = useContext(AuthContext);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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
    { name: 'FinPilot AI', path: '/chat', icon: <Bot size={20} /> },
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
    </div>
  );
};

export default Sidebar;
