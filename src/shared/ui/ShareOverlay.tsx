import React from 'react';
import { createPortal } from 'react-dom';
import { Copy, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from './Logo';

type Detail = { label: string; value: string };

interface ShareOverlayProps {
  open: boolean;
  link: string;
  title: string;
  subtitle?: string;
  description?: string;
  details?: Detail[];
  onClose: () => void;
}

export function ShareOverlay({ open, link, title, subtitle, description, details, onClose }: ShareOverlayProps) {
  const qrUrl = React.useMemo(() => {
    const safeLink = link || (typeof window !== 'undefined' ? window.location.href : '');
    return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(safeLink)}`;
  }, [link]);

  const handleCopy = React.useCallback(() => {
    const text = link || window.location.href;
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success('Lien copié dans le presse-papier'))
      .catch(() => toast.error('Impossible de copier le lien'));
  }, [link]);

  const handlePrint = React.useCallback(() => {
    const overlayEl = document.querySelector('.share-overlay-card') as HTMLElement | null;
    if (!overlayEl) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) {
      window.print();
      return;
    }

    const html = `
      <html>
        <head>
          <title>Impression</title>
          <style>
            @page { margin: 12mm; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; }
          </style>
        </head>
        <body>${overlayEl.outerHTML}</body>
      </html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, []);

  if (!open) return null;

  const content = (
    <div
      className="share-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Fenêtre de partage"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <style>
        {`
          @media print {
            .share-overlay { position: static !important; inset: auto !important; background: white !important; padding: 0 !important; }
            .share-overlay-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
            .share-overlay-close { display: none !important; }
            .share-overlay-print { display: none !important; }
          }
          @media (max-width: 640px) {
            .share-overlay { align-items: flex-start !important; }
            .share-overlay-card { max-width: 100% !important; border-radius: 18px !important; }
            .share-overlay-actions { position: static !important; justify-content: flex-end !important; padding: 12px 16px 0 !important; }
            .share-overlay-content { padding: 18px 16px 22px !important; gap: 16px !important; }
            .share-overlay-link-row { flex-direction: column !important; }
            .share-overlay-link-row input { width: 100% !important; }
            .share-overlay-copy-button { width: 100% !important; justify-content: center !important; }
            .share-overlay-details { grid-template-columns: 1fr !important; }
            .share-overlay-qr img { width: 180px !important; height: 180px !important; }
          }
          @media (max-width: 420px) {
            .share-overlay-card { border-radius: 16px !important; }
            .share-overlay-content { padding: 16px 14px 20px !important; }
            .share-overlay-qr img { width: 160px !important; height: 160px !important; }
          }
        `}
      </style>
      <div
        className="share-overlay-card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '880px',
          background: '#fff',
          borderRadius: '24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          border: '1px solid #f3f4f6',
        }}
      >
        <div
          className="share-overlay-actions"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={handlePrint}
            className="share-overlay-print"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '9999px',
              border: '1px solid #FF6B4A',
              color: '#FF6B4A',
              background: '#fff',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
              cursor: 'pointer',
            }}
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
          <button
            type="button"
            onClick={onClose}
            className="share-overlay-close"
            aria-label="Fermer la fenêtre de partage"
            style={{
              width: '36px',
              height: '36px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid #E5E7EB',
              background: '#fff',
              color: '#111827',
              boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
              cursor: 'pointer',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="share-overlay-content" style={{ padding: '28px 28px 32px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo className="text-[#FF6B4A]" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B7280' }}>
              Lien direct
            </label>
            <div className="share-overlay-link-row" style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
              <input
                value={link}
                readOnly
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '18px',
                  border: '1px solid #E5E7EB',
                  background: '#F9FAFB',
                  fontSize: '14px',
                  color: '#111827',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="share-overlay-copy-button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '18px',
                  border: 'none',
                  background: '#FF6B4A',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: '0 8px 18px rgba(255,107,74,0.25)',
                  cursor: 'pointer',
                }}
              >
                <Copy className="w-4 h-4" />
                Copier
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>{title}</h3>
              {subtitle && <p style={{ fontSize: '14px', color: '#4B5563', margin: '4px 0 0' }}>{subtitle}</p>}
            </div>
            {description && (
              <p style={{ fontSize: '14px', color: '#374151', margin: 0, maxWidth: '720px', lineHeight: 1.5 }}>{description}</p>
            )}
          </div>

          {details && details.length > 0 && (
            <div
              className="share-overlay-details"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                gap: '12px',
              }}
            >
              {details.map((item) => (
                <div
                  key={`${item.label}-${item.value}`}
                  style={{
                    border: '1px solid #E5E7EB',
                    background: '#F9FAFB',
                    borderRadius: '16px',
                    padding: '12px',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginTop: '4px' }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div
              className="share-overlay-qr"
              style={{
                border: '1px dashed #FFD8BF',
                background: '#FFF6EF',
                borderRadius: '24px',
                padding: '18px',
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: '16px',
                  padding: '12px',
                  boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
                  border: '1px solid #FFE0D1',
                }}
              >
                <img
                  src={qrUrl}
                  alt="QR code vers la page à partager"
                  style={{ width: '220px', height: '220px', objectFit: 'contain' }}
                />
              </div>
            </div>
            <p style={{ fontSize: '14px', color: '#6B7280', textAlign: 'center', margin: 0, maxWidth: '640px' }}>
              Scannez pour ouvrir directement cette page ou imprimez pour l&apos;afficher en boutique, sur une affiche ou à partager autour de vous.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
