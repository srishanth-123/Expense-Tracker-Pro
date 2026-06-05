import React from 'react';
import { useSocket } from '../../context/SocketContext';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

const NotificationDropdown = () => {
    const { unreadCount } = useSocket();

    return (
        <Link 
            to="/notifications"
            className="relative p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-center"
            title="Notifications"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <Bell size={20} style={{ color: 'var(--text-primary)' }} />
            {unreadCount > 0 && (
                <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-0 right-0 inline-flex items-center justify-center text-xs font-bold leading-none text-white bg-red-500 rounded-full"
                    style={{ 
                        fontSize: '0.65rem', 
                        minWidth: '16px', 
                        height: '16px', 
                        padding: '0 4px',
                        transform: 'translate(25%, -25%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
            )}
        </Link>
    );
};

export default NotificationDropdown;
