import { useSocket } from '../../context/SocketContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';

const NotificationDropdown = () => {
    const { unreadCount } = useSocket() || {};
    const navigate = useNavigate();
    const location = useLocation();

    const isOnNotifications = location.pathname === '/notifications';

    const handleClick = () => {
        if (isOnNotifications) {
            // Go back to previous page
            navigate(-1);
        } else {
            navigate('/notifications');
        }
    };

    return (
        <button
            onClick={handleClick}
            style={{
                background: isOnNotifications ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s ease',
                position: 'relative'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = isOnNotifications ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = isOnNotifications ? 'rgba(99, 102, 241, 0.12)' : 'transparent'}
            title={isOnNotifications ? 'Close Notifications' : 'Notifications'}
        >
            <Bell size={20} />
            {unreadCount > 0 && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        fontSize: '0.6rem',
                        minWidth: '16px',
                        height: '16px',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '10px',
                        fontWeight: 700,
                        lineHeight: 1,
                        boxShadow: '0 0 6px rgba(239, 68, 68, 0.4)'
                    }}
                >
                    {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
            )}
        </button>
    );
};

export default NotificationDropdown;
