import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Eye, EyeOff, Sparkles, Inbox, Trash2 } from 'lucide-react';
import Card from '../components/ui/Card';
import ConfirmModal from '../components/ui/ConfirmModal';

const Notifications = () => {
    const { 
        notifications = [], notificationsReady = false, fetchNotifications = () => {}, 
        markAsRead = () => {}, markAllAsRead = () => {},
        deleteNotification = () => {}, deleteBulkNotifications = () => {}, deleteAllNotifications = () => {}
    } = useSocket() || {};
    
    const [showAll, setShowAll] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    
    const handleClearAllConfirm = async () => {
        setIsClearing(true);
        try {
            await deleteAllNotifications();
            setSelected(new Set());
            await fetchNotifications();
        } catch (error) {
            console.error("Failed to clear notifications:", error);
        } finally {
            setIsClearing(false);
            setIsClearModalOpen(false);
        }
    };
    
    // Trigger a fresh fetch on mount
    useEffect(() => {
        fetchNotifications();
    }, []);

    const toggleSelect = (id, e) => {
        e.stopPropagation();
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const getIcon = (type) => {
        switch (type) {
            case 'WALLET_TOPUP': return '💰';
            case 'WALLET_WITHDRAWAL': return '💸';
            case 'SPLIT_CREATED': return '👥';
            case 'SPLIT_SETTLED': return '✅';
            case 'SPLIT_SETTLEMENT_RECEIVED': return '🤝';
            case 'BUDGET_WARNING': return '⚠️';
            case 'PRO_UPGRADE': return '👑';
            case 'TRANSACTION_CREATED': return '📝';
            case 'TRANSACTION_UPDATED': return '✏️';
            case 'TRANSACTION_DELETED': return '🗑️';
            case 'TRANSACTION_RESTORED': return '♻️';
            case 'SYSTEM': return '⚙️';
            default: return '🔔';
        }
    };

    const formatTime = (dateStr) => {
        try {
            if (!dateStr) return 'some time ago';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'some time ago';
            return formatDistanceToNow(d, { addSuffix: true });
        } catch {
            return 'some time ago';
        }
    };

    const displayedNotifications = showAll 
        ? notifications 
        : notifications.filter(n => !n.read);

    const unreadCount = notifications.filter(n => !n.read).length;

    // ─── Skeleton loader shown while context is still fetching ───
    if (!notificationsReady && notifications.length === 0) {
        return (
            <div className="p-4 sm:p-8 max-w-4xl mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '24px', background: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(16px)',
                    borderRadius: '16px', border: '1px solid var(--surface-border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="skeleton-pulse" style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="skeleton-pulse" style={{ width: '140px', height: '22px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }} />
                            <div className="skeleton-pulse" style={{ width: '220px', height: '14px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)' }} />
                        </div>
                    </div>
                </div>
                <Card style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ padding: '20px 24px', display: 'flex', gap: '20px', borderBottom: '1px solid var(--surface-border)' }}>
                            <div className="skeleton-pulse" style={{ width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0, background: 'rgba(255,255,255,0.04)', animationDelay: `${i * 0.1}s` }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div className="skeleton-pulse" style={{ width: `${60 + i * 8}%`, height: '16px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', animationDelay: `${i * 0.1}s` }} />
                                <div className="skeleton-pulse" style={{ width: '90px', height: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', animationDelay: `${i * 0.15}s` }} />
                            </div>
                        </div>
                    ))}
                </Card>
                <style>{`
                    .skeleton-pulse { animation: skPulse 1.5s ease-in-out infinite; }
                    @keyframes skPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                `}</style>
            </div>
        );
    }

    return (
        <div
            className="p-4 sm:p-8 max-w-4xl mx-auto"
            style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
            {/* Header */}
            <div style={{
                display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                padding: '24px', background: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(16px)',
                borderRadius: '16px', border: '1px solid var(--surface-border)', gap: '16px', flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--primary), #a855f7)', padding: '12px',
                        borderRadius: '12px', color: 'white', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Bell size={24} className={unreadCount > 0 ? 'animate-bounce' : ''} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Notifications
                            {unreadCount > 0 && (
                                <span style={{ fontSize: '0.8rem', padding: '2px 8px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#ef4444', fontWeight: 600 }}>
                                    {unreadCount} new
                                </span>
                            )}
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
                            Real-time updates of your account activity
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {selected.size > 0 && (
                        <button
                            onClick={() => {
                                deleteBulkNotifications(Array.from(selected));
                                setSelected(new Set());
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                                borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                                fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Trash2 size={16} />
                            Delete ({selected.size})
                        </button>
                    )}

                    <button
                        onClick={() => setShowAll(!showAll)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                            borderRadius: '10px', border: '1px solid var(--surface-border)',
                            background: showAll ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                            color: 'white', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: showAll ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
                        }}
                    >
                        {showAll ? <EyeOff size={16} /> : <Eye size={16} />}
                        {showAll ? 'Hide Read' : 'Show Read History'}
                    </button>

                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                                borderRadius: '10px', border: 'none',
                                background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
                                fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
                                transition: 'transform 0.2s', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <Check size={16} />
                            Mark all as read
                        </button>
                    )}
                    
                    {notifications.length > 0 && (
                        <button
                            onClick={() => setIsClearModalOpen(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                                borderRadius: '10px', border: 'none',
                                background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)',
                                fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                            <Trash2 size={16} />
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Notifications List */}
            <Card style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                {displayedNotifications.length === 0 ? (
                    <div style={{ padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                            width: '72px', height: '72px', borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--surface-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-secondary)', opacity: 0.6
                        }}>
                            {showAll ? <Inbox size={32} /> : <Sparkles size={32} />}
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                                {showAll ? 'No notification history' : 'You are all caught up!'}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, maxWidth: '320px' }}>
                                {showAll 
                                    ? 'You do not have any notifications saved in your account.' 
                                    : 'All active notifications have been read and filtered out. Click "Show Read History" to view old alerts.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                        <AnimatePresence initial={false}>
                            {displayedNotifications.map((notification) => (
                                <motion.li
                                    key={notification._id}
                                    initial={{ opacity: 0, height: 0, y: 15 }}
                                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                                    exit={{ opacity: 0, height: 0, x: 50, transition: { duration: 0.25 } }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--surface-border)' }}
                                >
                                    <div 
                                        onClick={() => { if (!notification.read) markAsRead(notification._id); }}
                                        style={{
                                            padding: '20px 24px', display: 'flex', gap: '20px',
                                            cursor: !notification.read ? 'pointer' : 'default',
                                            background: !notification.read ? 'rgba(99, 102, 241, 0.03)' : 'transparent',
                                            transition: 'background 0.2s', alignItems: 'flex-start'
                                        }}
                                        className="notification-item-hover"
                                    >
                                        <div 
                                            onClick={(e) => toggleSelect(notification._id, e)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                padding: '0 8px', cursor: 'pointer', zIndex: 10
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '4px',
                                                border: `2px solid ${selected.has(notification._id) ? 'var(--primary)' : 'var(--surface-border)'}`,
                                                background: selected.has(notification._id) ? 'var(--primary)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s'
                                            }}>
                                                {selected.has(notification._id) && <Check size={12} color="white" strokeWidth={3} />}
                                            </div>
                                        </div>

                                        {/* Icon */}
                                        <div style={{
                                            fontSize: '1.75rem', width: '48px', height: '48px', borderRadius: '12px',
                                            background: !notification.read ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid var(--surface-border)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                        }}>
                                            {getIcon(notification.type)}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                                <p style={{
                                                    fontSize: '0.95rem',
                                                    fontWeight: !notification.read ? 600 : 400,
                                                    color: !notification.read ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    margin: 0, lineHeight: 1.4
                                                }}>
                                                    {notification.message}
                                                </p>
                                                
                                                {!notification.read ? (
                                                    <span style={{
                                                        width: '8px', height: '8px', borderRadius: '50%',
                                                        background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)',
                                                        flexShrink: 0, marginTop: '6px'
                                                    }} />
                                                ) : (
                                                    <span style={{
                                                        fontSize: '0.72rem', color: 'var(--text-secondary)',
                                                        background: 'rgba(255, 255, 255, 0.05)', padding: '2px 6px',
                                                        borderRadius: '6px', textTransform: 'uppercase',
                                                        fontWeight: 500, letterSpacing: '0.5px'
                                                    }}>
                                                        Read
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    {formatTime(notification.createdAt)}
                                                </span>

                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {!notification.read && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); markAsRead(notification._id); }}
                                                            style={{
                                                                background: 'transparent', border: 'none',
                                                                color: 'var(--primary)', fontSize: '0.8rem',
                                                                fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
                                                                borderRadius: '6px', transition: 'background 0.2s'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            Dismiss
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteNotification(notification._id); }}
                                                        style={{
                                                            background: 'transparent', border: 'none',
                                                            color: 'var(--text-secondary)', fontSize: '0.8rem',
                                                            fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
                                                            borderRadius: '6px', transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </Card>

            <ConfirmModal
                isOpen={isClearModalOpen}
                onClose={() => { if (!isClearing) setIsClearModalOpen(false); }}
                onConfirm={handleClearAllConfirm}
                title="Clear All Notifications"
                message="Are you sure you want to delete all notifications? This action cannot be undone."
                confirmText="Delete All"
                cancelText="Cancel"
                loading={isClearing}
            />
        </div>
    );
};

export default Notifications;
