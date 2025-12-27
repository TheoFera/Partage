import React from 'react';
import { createPortal } from 'react-dom';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  unread?: boolean;
};

interface NotificationsPopoverProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
}

export function NotificationsPopover({ open, onClose, notifications }: NotificationsPopoverProps) {
  const notificationsAnchor =
    typeof document !== 'undefined' ? document.getElementById('notifications-anchor') : null;
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  // Fermer avec Echap
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Fermer quand on clique en dehors (sans overlay)
  React.useEffect(() => {
    if (!open) return;
    if (!notificationsAnchor) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      const pop = popoverRef.current;

      if (!target) return;
      if (pop && pop.contains(target)) return;
      if (notificationsAnchor.contains(target)) return;

      onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, onClose, notificationsAnchor]);

  if (!open || !notificationsAnchor) return null;

  const unreadCount = notifications.filter((item) => item.unread).length;

  return createPortal(
    <div
      id="notifications-popover"
      ref={popoverRef}
      style={{
        position: 'absolute',
        right: 0,
        marginTop: 8,
        width: 'min(70vw, 340px)',
        borderRadius: 16,
        border: '1px solid #E5E7EB',
        background: '#FFFFFF',
        opacity: 1,
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        mixBlendMode: 'normal',
        isolation: 'isolate',
        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight: '70vh',
        overflowY: 'auto',
        zIndex: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>Notifications</p>
        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
          {unreadCount ? `${unreadCount} non lues` : 'Tout lu'}
        </p>
      </div>

      {notifications.length === 0 ? (
        <div
          style={{
            padding: '16px 12px',
            borderRadius: 12,
            border: '1px dashed #E5E7EB',
            background: '#F9FAFB',
            fontSize: 13,
            color: '#6B7280',
            textAlign: 'center',
          }}
        >
          Aucune notification pour le moment.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {notifications.map((notification) => (
            <div
              key={notification.id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                background: notification.unread ? '#FFF1E6' : '#FFFFFF',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: notification.unread ? '#FF6B4A' : '#E5E7EB',
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>
                  {notification.title}
                </p>
                <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0' }}>
                  {notification.message}
                </p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '6px 0 0' }}>
                  {notification.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            borderRadius: 9999,
            background: '#F9FAFB',
            color: '#374151',
            fontSize: 13,
            fontWeight: 600,
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>
    </div>,
    notificationsAnchor
  );
}
