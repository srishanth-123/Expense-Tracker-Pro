import { useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Search, Menu, Sun, Moon, Sparkles, LogOut, Crown, ChevronDown, UserCog } from 'lucide-react';
import NotificationDropdown from './ui/NotificationDropdown';
import api from '../api';
import { toast } from 'react-hot-toast';
import ConfirmModal from './ui/ConfirmModal';

const Navbar = ({ onMenuClick, onAIChatToggle }) => {
  const { user, logout, refreshUser } = useContext(AuthContext);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showConfirmUpgrade, setShowConfirmUpgrade] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/transactions?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handleConfirmUpgrade = async () => {
    try {
      setUpgrading(true);
      const res = await api.post('/payment/subscribe-pro');
      const dataObj = res.data ? res : { message: res.message, ...res };
      toast.success(dataObj.message || "Successfully upgraded to Pro!");
      if (refreshUser) await refreshUser();
      setShowConfirmUpgrade(false);
      setIsProfileOpen(false);
    } catch (err) {
      const errorText = err.response?.data?.message || err.message || "Upgrade failed.";
      toast.error(errorText);
      setShowConfirmUpgrade(false);
      if (errorText.toLowerCase().includes("balance")) {
        setIsProfileOpen(false);
        navigate('/wallet');
      }
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <>
      <header style={{
      height: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      borderBottom: '1px solid var(--surface-border)',
      background: 'var(--surface)',
      backdropFilter: 'blur(8px)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          className="mobile-menu-btn"
          onClick={onMenuClick}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'none' }}
        >
          <Menu size={24} />
        </button>
        <div style={{ position: 'relative', width: '300px' }} className="nav-search-container">
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search transactions..." 
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            style={{ 
              paddingLeft: '44px', 
              background: 'var(--input-bg)', 
              border: '1px solid var(--input-border)', 
              borderRadius: '24px',
              color: 'var(--text-primary)',
              width: '100%',
              padding: '10px 16px 10px 44px',
              fontSize: '0.9rem'
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <button
          onClick={toggleTheme}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button
          onClick={onAIChatToggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="FinPilot AI"
        >
          <Sparkles size={20} className="animate-pulse" />
        </button>
        <NotificationDropdown />

        {/* ─── Profile Dropdown ─── */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <div 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '10px',
              transition: 'background 0.2s',
              userSelect: 'none',
              background: isProfileOpen ? 'rgba(99, 102, 241, 0.06)' : 'transparent'
            }}
            className="navbar-profile-trigger"
          >
            <div style={{ textAlign: 'right' }} className="navbar-profile-text">
              <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{user?.name || 'User'}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>
                {user?.isPro ? '✦ Pro' : 'Free Plan'} · ₹{user?.walletBalance?.toFixed(0) || '0'}
              </p>
            </div>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: user?.profilePic ? `url(${user.profilePic}) center/cover no-repeat` : 'linear-gradient(135deg, var(--primary), #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: user?.profilePic ? 0 : '1.1rem',
              color: 'white',
              border: user?.isPro ? '2px solid #a78bfa' : '2px solid transparent',
              boxShadow: user?.isPro ? '0 0 8px rgba(139, 92, 246, 0.35)' : 'none'
            }}>
              {!user?.profilePic && (user?.name?.charAt(0).toUpperCase() || 'U')}
            </div>
            <ChevronDown 
              size={14} 
              color="var(--text-secondary)" 
              className="navbar-profile-chevron"
              style={{ 
                transition: 'transform 0.2s', 
                transform: isProfileOpen ? 'rotate(180deg)' : 'rotate(0deg)' 
              }} 
            />
          </div>

          {/* Dropdown */}
          {isProfileOpen && (
            <div 
              style={{
                position: 'absolute',
                top: '56px',
                right: 0,
                width: '240px',
                background: theme === 'dark' ? '#1e293b' : '#ffffff',
                border: '1px solid var(--surface-border)',
                borderRadius: '12px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                zIndex: 20,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                backdropFilter: 'blur(20px)'
              }}
            >
              {/* User Info Header */}
              <div style={{
                padding: '12px',
                borderBottom: '1px solid var(--surface-border)',
                marginBottom: '4px'
              }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {user?.name || 'User'}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  {user?.email || ''}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Wallet Balance: ₹{user?.walletBalance?.toFixed(2) || '0.00'}
                </p>
              </div>

              {/* Edit Profile */}
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  navigate('/profile');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: '8px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <UserCog size={15} />
                Edit Profile
              </button>

              {/* Pro Status */}
              {user?.isPro ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(99, 102, 241, 0.06))',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '8px',
                  color: '#a78bfa',
                  fontSize: '0.78rem',
                  fontWeight: 600
                }}>
                  <Crown size={14} />
                  Pro Member Active
                </div>
              ) : (
                <button
                  disabled={upgrading}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmUpgrade(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Crown size={14} />
                  {upgrading ? 'Upgrading...' : 'Upgrade to Pro · ₹499'}
                </button>
              )}

              {/* Divider */}
              <div style={{ height: '1px', background: 'var(--surface-border)', margin: '4px 0' }} />

              {/* Logout */}
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  setShowConfirmLogout(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: '8px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    <ConfirmModal
      isOpen={showConfirmUpgrade}
      onClose={() => setShowConfirmUpgrade(false)}
      onConfirm={handleConfirmUpgrade}
      title="Upgrade to Pro"
      message="Are you sure you want to upgrade to the Pro plan? This will deduct ₹499 from your wallet balance."
      confirmText={upgrading ? "Upgrading..." : "Upgrade Now"}
      cancelText="Cancel"
      isDanger={false}
      loading={upgrading}
    />
    <ConfirmModal
      isOpen={showConfirmLogout}
      onClose={() => setShowConfirmLogout(false)}
      onConfirm={() => {
        setShowConfirmLogout(false);
        logout();
      }}
      title="Logout"
      message="Are you sure you want to log out of your account?"
      confirmText="Logout"
      cancelText="Cancel"
      isDanger={true}
    />
    </>
  );
};

export default Navbar;
