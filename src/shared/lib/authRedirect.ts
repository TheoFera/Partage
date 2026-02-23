const AUTH_REDIRECT_KEY = 'authRedirectTo';

export const sanitizeAuthRedirect = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  // Only allow in-app paths to prevent open redirects.
  if (trimmed.startsWith('/')) return trimmed;
  return undefined;
};

export const getStoredAuthRedirect = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const read = (storage: Storage): string | undefined => {
    try {
      return sanitizeAuthRedirect(storage.getItem(AUTH_REDIRECT_KEY));
    } catch {
      return undefined;
    }
  };

  return read(window.sessionStorage) ?? read(window.localStorage);
};

export const setStoredAuthRedirect = (value?: string | null) => {
  if (typeof window === 'undefined') return;
  const redirect = sanitizeAuthRedirect(value);

  const write = (storage: Storage) => {
    try {
      if (redirect) {
        storage.setItem(AUTH_REDIRECT_KEY, redirect);
      } else {
        storage.removeItem(AUTH_REDIRECT_KEY);
      }
    } catch {}
  };

  write(window.sessionStorage);
  write(window.localStorage);
};

export const clearStoredAuthRedirect = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(AUTH_REDIRECT_KEY);
  } catch {}
};
