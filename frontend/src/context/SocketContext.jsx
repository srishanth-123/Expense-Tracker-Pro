import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';
import api from '../api';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notificationsReady, setNotificationsReady] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (user && token) {
            const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
                .replace('/api/v1', '')
                .replace('/api', '');
            
            const newSocket = io(socketUrl, {
                auth: { token },
                transports: ['websocket', 'polling']
            });

            newSocket.on('connect', () => {
                console.log('Socket connected');
            });

            newSocket.on('new_notification', (notification) => {
                setNotifications(prev => [notification, ...prev]);
                setUnreadCount(prev => prev + 1);
                
                // Show a toast when a new notification arrives
                toast(notification.message, {
                    icon: '🔔',
                    style: {
                        background: '#1f2937',
                        color: '#f3f4f6',
                        border: '1px solid #374151'
                    }
                });
            });

            setSocket(newSocket);

            return () => newSocket.close();
        }
    }, [user]);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            if (res && res.success) {
                setNotifications(res.notifications || []);
                setUnreadCount(res.unreadCount || 0);
            }
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            setNotificationsReady(true);
        }
    };

    useEffect(() => {
        if (user) fetchNotifications();
    }, [user]);

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

    return (
        <SocketContext.Provider value={{ socket, notifications, unreadCount, notificationsReady, markAsRead, markAllAsRead, fetchNotifications }}>
            {children}
        </SocketContext.Provider>
    );
};

