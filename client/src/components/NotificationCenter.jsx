import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.warn('Could not load notifications:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Set polling interval for notification sync (every 60 seconds)
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click or escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (notif, e) => {
    if (e) e.stopPropagation();
    if (!notif || notif.isRead) return;

    try {
      await api.patch(`/notifications/${notif._id}/read`);
      setNotifications(prev =>
        prev.map(n => (n._id === notif._id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Error marking notification as read:', err.message);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Error marking all as read:', err.message);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      await handleMarkAsRead(notif);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'DEADLINE_TODAY':
        return (
          <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
            Due Today
          </span>
        );
      case 'DEADLINE_APPROACHING':
        return (
          <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
            Upcoming
          </span>
        );
      case 'APPLICATION_UPDATE':
        return (
          <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
            Application
          </span>
        );
      default:
        return (
          <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
            Alert
          </span>
        );
    }
  };

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-1.5 rounded-full text-muted hover:text-ink hover:bg-canvas transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center leading-none shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-paper rounded-lg shadow-xl border border-line z-50 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-canvas/40">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-ink">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-accent/10 text-accent font-medium px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs sm:text-sm text-muted hover:text-accent transition-colors font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto divide-y divide-line/60">
            {loading && notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <svg
                  className="w-8 h-8 mx-auto text-muted/50 mb-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                  />
                </svg>
                <p className="text-sm font-semibold text-ink">No notifications</p>
                <p className="text-xs sm:text-sm text-muted mt-0.5">
                  Reminders for closing opportunities will appear here.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 hover:bg-canvas transition-colors cursor-pointer flex gap-3 items-start ${
                    !notif.isRead ? 'bg-accent/[0.03]' : ''
                  }`}
                >
                  {/* Unread indicator */}
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      !notif.isRead ? 'bg-accent ring-2 ring-accent/20' : 'bg-transparent'
                    }`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {getTypeBadge(notif.type)}
                      <span className="text-xs text-muted shrink-0">
                        {formatTimestamp(notif.createdAt)}
                      </span>
                    </div>

                    <p
                      className={`text-sm leading-snug break-words ${
                        !notif.isRead ? 'font-semibold text-ink' : 'font-medium text-ink/90'
                      }`}
                    >
                      {notif.title}
                    </p>

                    <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2.5 border-t border-line text-center bg-canvas/30">
              <button
                type="button"
                onClick={fetchNotifications}
                className="text-xs font-medium text-muted hover:text-ink transition-colors"
              >
                Refresh notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
