import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const NotificationDropdown = () => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useSocket();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (type) => {
        switch (type) {
            case 'WALLET_TOPUP': return '💰';
            case 'SPLIT_CREATED': return '👥';
            case 'SPLIT_SETTLED': return '✅';
            case 'BUDGET_WARNING': return '⚠️';
            default: return '🔔';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            >
                <Bell size={20} className="text-gray-300" />
                {unreadCount > 0 && (
                    <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-500 rounded-full"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </motion.span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 glassmorphism rounded-xl shadow-2xl z-50 border border-white/10 overflow-hidden"
                    >
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900/50">
                            <h3 className="text-lg font-semibold text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <button 
                                    onClick={markAllAsRead}
                                    className="text-xs text-primary hover:text-primary-light transition-colors flex items-center gap-1"
                                >
                                    <Check size={14} />
                                    Mark all as read
                                </button>
                            )}
                        </div>
                        
                        <div className="max-h-[60vh] overflow-y-auto hide-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    <Bell size={32} className="mx-auto mb-3 opacity-20" />
                                    <p>You're all caught up!</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-white/5">
                                    {notifications.slice(0, 10).map((notification) => (
                                        <li 
                                            key={notification._id} 
                                            className={`p-4 transition-colors hover:bg-white/5 flex gap-3 ${!notification.read ? 'bg-primary/10' : ''}`}
                                            onClick={() => {
                                                if (!notification.read) markAsRead(notification._id);
                                            }}
                                        >
                                            <div className="text-2xl mt-1">{getIcon(notification.type)}</div>
                                            <div className="flex-1">
                                                <p className={`text-sm ${!notification.read ? 'text-white font-medium' : 'text-gray-300'}`}>
                                                    {notification.message}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                                </p>
                                            </div>
                                            {!notification.read && (
                                                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        
                        <div className="p-3 border-t border-white/10 text-center bg-gray-900/50 hover:bg-gray-800/50 transition-colors">
                            <Link 
                                to="/notifications" 
                                onClick={() => setIsOpen(false)}
                                className="text-sm font-medium text-primary block w-full"
                            >
                                View All Notifications
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationDropdown;
