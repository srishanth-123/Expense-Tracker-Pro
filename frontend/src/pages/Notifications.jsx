import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Bell, CheckCircle, Trash2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

const Notifications = () => {
    const { notifications, fetchNotifications, markAsRead, markAllAsRead } = useSocket();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            await fetchNotifications();
            setLoading(false);
        };
        load();
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
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 sm:p-8 max-w-4xl mx-auto"
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Notifications</h1>
                    <p className="text-gray-400">Stay updated with your account activity</p>
                </div>
                {notifications.some(n => !n.read) && (
                    <Button 
                        variant="secondary" 
                        onClick={markAllAsRead}
                        className="flex items-center gap-2"
                    >
                        <CheckCircle size={18} />
                        Mark all as read
                    </Button>
                )}
            </div>

            <Card className="p-0 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading notifications...</div>
                ) : notifications.length === 0 ? (
                    <EmptyState 
                        icon={Bell}
                        title="No notifications yet"
                        message="You're all caught up! When you receive alerts, they will appear here."
                    />
                ) : (
                    <ul className="divide-y divide-white/5">
                        {notifications.map((notification, index) => (
                            <motion.li 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                key={notification._id} 
                                className={`p-6 transition-colors hover:bg-white/5 flex gap-4 ${!notification.read ? 'bg-primary/5' : ''}`}
                            >
                                <div className="text-3xl mt-1 p-3 bg-gray-800 rounded-full h-14 w-14 flex items-center justify-center flex-shrink-0 border border-white/10">
                                    {getIcon(notification.type)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <p className={`text-base ${!notification.read ? 'text-white font-semibold' : 'text-gray-300'}`}>
                                            {notification.message}
                                        </p>
                                        {!notification.read && (
                                            <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0 ml-4 mt-1" />
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
                                        <span>{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</span>
                                    </p>
                                    
                                    {!notification.read && (
                                        <button 
                                            onClick={() => markAsRead(notification._id)}
                                            className="mt-3 text-sm text-primary hover:text-primary-light transition-colors font-medium"
                                        >
                                            Mark as read
                                        </button>
                                    )}
                                </div>
                            </motion.li>
                        ))}
                    </ul>
                )}
            </Card>
        </motion.div>
    );
};

export default Notifications;
