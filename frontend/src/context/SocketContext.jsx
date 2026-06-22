import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';
import api from '../api';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user, refreshUser } = useAuth();
    const [socket, setSocket] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notificationsReady, setNotificationsReady] = useState(false);
    const processedNotifs = useRef(new Set());

    const userId = user?._id;

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (userId && token) {
            const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
                .replace('/api/v1', '')
                .replace('/api', '');
            
            const newSocket = io(socketUrl, {
                auth: { token },
                transports: ['websocket', 'polling']
            });

            newSocket.on('connect', () => {
                if (import.meta.env.DEV) console.log('Socket connected');
            });

            newSocket.on('new_notification', (notification) => {
                if (!notification) return;

                // Transient notification toast for AI Insights
                if (notification.type === 'insights_ready') {
                    toast(notification.message || "Your AI financial insights are ready!", {
                        icon: '✨',
                        style: {
                            background: '#1f2937',
                            color: '#f3f4f6',
                            border: '1px solid #374151'
                        }
                    });
                    window.dispatchEvent(new CustomEvent('financialDataUpdated', { detail: notification }));
                    return;
                }

                // Dedup check using Set
                if (notification._id && processedNotifs.current.has(notification._id)) {
                    return;
                }
                if (notification._id) {
                    processedNotifs.current.add(notification._id);
                }

                setNotifications(prev => [notification, ...prev]);
                setUnreadCount(c => c + 1);

                // Show a toast when a new notification arrives
                toast(notification.message, {
                    icon: '🔔',
                    style: {
                        background: '#1f2937',
                        color: '#f3f4f6',
                        border: '1px solid #374151'
                    }
                });

                // Refresh user balance on all tabs & dispatch update event
                if (refreshUser) {
                    refreshUser();
                }
                window.dispatchEvent(new CustomEvent('financialDataUpdated', { detail: notification }));
            });

            setSocket(newSocket);

            return () => newSocket.close();
        }
    }, [userId, refreshUser]);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            if (res && res.success) {
                const list = res.notifications || [];
                setNotifications(list);
                setUnreadCount(res.unreadCount || 0);
                
                // Add fetched notification IDs to processed Set
                list.forEach(n => {
                    if (n._id) processedNotifs.current.add(n._id);
                });
            }
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            setNotificationsReady(true);
        }
    };

    useEffect(() => {
        if (userId) fetchNotifications();
    }, [userId]);

    const markAsRead = async (id) => {
        try {
            const res = await api.patch(`/notifications/${id}/read`);
            if (res && res.success) {
                setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error("Failed to mark notification as read", error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const res = await api.patch('/notifications/read-all');
            if (res && res.success) {
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                setUnreadCount(0);
            }
        } catch (error) {
            console.error("Failed to mark all as read", error);
        }
    };

    const deleteNotification = async (id) => {
        try {
            const res = await api.delete(`/notifications/${id}`);
            if (res && res.success) {
                setNotifications(prev => {
                    const toDelete = prev.find(n => n._id === id);
                    if (toDelete && !toDelete.read) setUnreadCount(c => Math.max(0, c - 1));
                    return prev.filter(n => n._id !== id);
                });
                processedNotifs.current.delete(id);
                toast.success('Notification deleted');
            }
        } catch (error) {
            console.error("Failed to delete notification", error);
            toast.error('Failed to delete notification');
        }
    };

    const deleteBulkNotifications = async (ids) => {
        try {
            const res = await api.delete('/notifications/bulk', { data: { ids } });
            if (res && res.success) {
                setNotifications(prev => {
                    let unreadDeleted = 0;
                    const remaining = prev.filter(n => {
                        if (ids.includes(n._id)) {
                            if (!n.read) unreadDeleted++;
                            processedNotifs.current.delete(n._id);
                            return false;
                        }
                        return true;
                    });
                    setUnreadCount(c => Math.max(0, c - unreadDeleted));
                    return remaining;
                });
                toast.success('Selected notifications deleted');
            }
        } catch (error) {
            console.error("Failed to delete notifications", error);
            toast.error('Failed to delete notifications');
        }
    };

    const deleteAllNotifications = async () => {
        try {
            const res = await api.delete('/notifications/all');
            if (res && res.success) {
                setNotifications([]);
                setUnreadCount(0);
                processedNotifs.current.clear();
                toast.success('All notifications cleared');
            }
        } catch (error) {
            console.error("Failed to clear notifications", error);
            toast.error('Failed to clear notifications');
        }
    };

    return (
        <SocketContext.Provider value={{ 
            socket, notifications, unreadCount, notificationsReady, 
            markAsRead, markAllAsRead, fetchNotifications,
            deleteNotification, deleteBulkNotifications, deleteAllNotifications
        }}>
            {children}
        </SocketContext.Provider>
    );
};

