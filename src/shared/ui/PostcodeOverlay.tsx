import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './PostcodeOverlay.css';

interface PostcodeOverlayProps {
  open: boolean;
  initialValue?: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (postcode: string) => void;
}

const POSTCODE_REGEX = /^\d{5}$/;

const sanitizePostcode = (value: string) => value.replace(/\D+/g, '').slice(0, 5);

export function PostcodeOverlay({
  open,
  initialValue = '',
  loading = false,
  error = null,
  onClose,
  onSubmit,
}: PostcodeOverlayProps) {
  const [postcode, setPostcode] = React.useState(sanitizePostcode(initialValue));
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setPostcode(sanitizePostcode(initialValue));
    setValidationError(null);
  }, [initialValue, open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleBackdropMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose]
  );

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextPostcode = sanitizePostcode(postcode);
      if (!POSTCODE_REGEX.test(nextPostcode)) {
        setValidationError('Veuillez saisir un code postal valide (5 chiffres).');
        return;
      }
      setValidationError(null);
      onSubmit(nextPostcode);
    },
    [onSubmit, postcode]
  );

  const displayError = validationError || error;

  if (!open) return null;

  const content = (
    <div
      className="postcode-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choix du code postal"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="postcode-overlay__card" onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="postcode-overlay__close"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="postcode-overlay__content">
          <h2 className="postcode-overlay__title">Entrez votre code postal</h2>
          <p className="postcode-overlay__subtitle">
            Pour trouver les commandes et producteurs proches de chez vous.
          </p>

          <form className="postcode-overlay__form" onSubmit={handleSubmit}>
            <label className="postcode-overlay__label" htmlFor="postcode-overlay-input">
              Code postal
            </label>
            <input
              id="postcode-overlay-input"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={postcode}
              onChange={(event) => {
                setPostcode(sanitizePostcode(event.target.value));
                setValidationError(null);
              }}
              placeholder="75001"
              className="postcode-overlay__input"
            />
            {displayError ? <p className="postcode-overlay__error">{displayError}</p> : null}
            <button type="submit" className="postcode-overlay__submit" disabled={loading}>
              {loading ? 'Recherche...' : 'Voir autour de ce code postal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
