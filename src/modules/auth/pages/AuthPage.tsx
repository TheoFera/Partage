import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { Mail, Lock, UserPlus, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import './AuthPage.css';

type AuthMode = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';

type AuthLocationState = {
  redirectTo?: string;
  mode?: AuthMode;
  emailPrefill?: string;
};

interface AuthPageProps {
  supabaseClient: SupabaseClient | null;
  onAuthSuccess: (user: SupabaseAuthUser) => void;
  onDemoLogin: () => void;
}

export function AuthPage({ supabaseClient, onAuthSuccess, onDemoLogin }: AuthPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as AuthLocationState | null;
  const initialMode = locationState?.mode ?? 'login';
  const [mode, setMode] = React.useState<AuthMode>(initialMode);
  const [email, setEmail] = React.useState(initialMode === 'signup' ? '' : locationState?.emailPrefill ?? '');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [resetPassword, setResetPassword] = React.useState('');
  const [showResetPassword, setShowResetPassword] = React.useState(false);
  const [resetPasswordConfirm, setResetPasswordConfirm] = React.useState('');
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = React.useState(false);
  const [fullName, setFullName] = React.useState('');
  const [handleValue, setHandleValue] = React.useState('');
  const [isHandleEdited, setIsHandleEdited] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [postcode, setPostcode] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [addressDetails, setAddressDetails] = React.useState('');
  const [accountType, setAccountType] = React.useState<
    'individual' | 'auto_entrepreneur' | 'company' | 'association' | 'public_institution'
  >('individual');
  const [loading, setLoading] = React.useState(false);
  const [resetEmailSent, setResetEmailSent] = React.useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = React.useState(false);

  const isRecoveryLink = React.useMemo(() => {
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const searchParams = new URLSearchParams(location.search || '');
    return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery' || searchParams.get('reset') === '1';
  }, [location.hash, location.search]);
  const activeMode: AuthMode = isRecoveryLink ? 'reset' : mode;

  React.useEffect(() => {
    if (locationState?.mode && !isRecoveryLink) {
      setMode(locationState.mode);
    }
    if (locationState?.emailPrefill && locationState?.mode !== 'signup') {
      setEmail(locationState.emailPrefill);
    }
  }, [isRecoveryLink, locationState?.emailPrefill, locationState?.mode]);

  const storedRedirect = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      return window.sessionStorage.getItem('authRedirectTo') || undefined;
    } catch {
      return undefined;
    }
  }, []);

  const redirectTo = locationState?.redirectTo || storedRedirect || location.pathname || '/';
  const resetRedirectTo = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}/connexion`;
  }, []);

  const clearStoredRedirect = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem('authRedirectTo');
    } catch {}
  }, []);

  const passwordPolicyLabel =
    '8 caracteres minimum, avec une minuscule, une majuscule, un chiffre et un symbole.';
  const isPasswordCompliant = (value: string) => {
    if (value.length < 8) return false;
    if (!/[a-z]/.test(value)) return false;
    if (!/[A-Z]/.test(value)) return false;
    if (!/\d/.test(value)) return false;
    return /[^A-Za-z0-9]/.test(value);
  };

  const sanitizeHandle = (value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20);
  };

  const resolveUniqueHandle = React.useCallback(
    async (source: string) => {
      const baseHandle = sanitizeHandle(source) || 'profil';
      if (!supabaseClient) return baseHandle;
      const withHandleSuffix = (base: string, suffix: number) => {
        const suffixValue = `${suffix}`;
        const baseMaxLength = Math.max(1, 20 - suffixValue.length);
        return `${base.slice(0, baseMaxLength)}${suffixValue}`;
      };

      const { data, error } = await supabaseClient
        .from('profiles')
        .select('handle')
        .ilike('handle', `${baseHandle}%`)
        .limit(500);

      if (error) {
        throw new Error('Impossible de verifier le tag pour le moment.');
      }

      const takenHandles = new Set(
        ((data ?? []) as Array<{ handle: string | null }>)
          .map((row) => (row.handle ?? '').toLowerCase())
          .filter(Boolean)
      );

      if (!takenHandles.has(baseHandle)) {
        return baseHandle;
      }

      let suffix = 1;
      while (suffix < 10000) {
        const candidate = withHandleSuffix(baseHandle, suffix);
        if (!takenHandles.has(candidate)) {
          return candidate;
        }
        suffix += 1;
      }

      throw new Error('Impossible de generer un tag unique.');
    },
    [supabaseClient]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabaseClient) {
      toast.error('Supabase n est pas configuré. Utilisez le mode démo pour tester.');
      return;
    }
    setLoading(true);
    try {
      if (activeMode === 'login') {
        const loginEmail = email.trim();
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email: loginEmail, password });
        if (error) {
          const normalizedMessage = (error.message || '').toLowerCase();
          if (normalizedMessage.includes('email not confirmed') || normalizedMessage.includes('email_not_confirmed')) {
            setMode('verify');
            setPassword('');
            toast.error('Votre email doit etre verifie avant de continuer.');
            return;
          }
          throw error;
        }
        if (data.user) {
          onAuthSuccess(data.user);
          clearStoredRedirect();
          toast.success('Connexion réussie');
          navigate(redirectTo, { replace: true });
        } else {
          toast.info('Vérifiez vos emails pour confirmer votre connexion.');
        }
      } else if (activeMode === 'signup') {
        if (!isPasswordCompliant(password)) {
          toast.error(`Le mot de passe doit respecter : ${passwordPolicyLabel}`);
          return;
        }
        const requestedHandle = sanitizeHandle(handleValue || fullName);
        if (!requestedHandle) {
          toast.error('Choisissez un tag valide (lettres et chiffres, sans espace).');
          return;
        }
        const safeHandle = await resolveUniqueHandle(requestedHandle);
        if (!safeHandle) {
          toast.error('Choisissez un tag valide (lettres et chiffres, sans espace).');
          return;
        }
        if (safeHandle !== requestedHandle) {
          setHandleValue(safeHandle);
          toast.info(`Tag deja pris. Proposition appliquee: @${safeHandle}`);
        }

        const displayName = fullName.trim() || email.trim().split('@')[0] || 'Utilisateur';
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: displayName,
              role: 'sharer',
              handle: safeHandle,
              phone,
              city,
              postcode,
              address,
              address_details: addressDetails.trim(),
              account_type: accountType,
            },
          },
        });
        if (error) throw error;
        const sessionUser = data.session?.user;
        if (sessionUser) {
          onAuthSuccess(sessionUser);
          clearStoredRedirect();
          toast.success('Compte crée et connecté');
          navigate(redirectTo, { replace: true });
        } else {
          setMode('verify');
          setPassword('');
          setVerificationEmailSent(true);
          toast.info('Compte crée. Vérifiez votre email avant de vous connecter.');
        }
      } else if (activeMode === 'verify') {
        const verificationEmail = email.trim();
        if (!verificationEmail) {
          toast.error('Merci de saisir votre email.');
          return;
        }
        const { error } = await supabaseClient.auth.resend({
          type: 'signup',
          email: verificationEmail,
        });
        if (error) throw error;
        setVerificationEmailSent(true);
        toast.success('Email de verification renvoyé.');
      } else if (activeMode === 'forgot') {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
          toast.error('Merci de saisir votre email.');
          return;
        }
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
          trimmedEmail,
          resetRedirectTo ? { redirectTo: resetRedirectTo } : undefined
        );
        if (error) throw error;
        setResetEmailSent(true);
        toast.success('Email envoyé. Consultez votre boite pour réinitialiser votre mot de passe.');
      } else {
        if (!isPasswordCompliant(resetPassword)) {
          toast.error(`Le mot de passe doit respecter : ${passwordPolicyLabel}`);
          return;
        }
        if (resetPassword !== resetPasswordConfirm) {
          toast.error('Les mots de passe ne correspondent pas.');
          return;
        }
        const { data, error } = await supabaseClient.auth.updateUser({ password: resetPassword });
        if (error) throw error;
        if (data.user) {
          onAuthSuccess(data.user);
        }
        clearStoredRedirect();
        toast.success('Mot de passe mis a jour.');
        navigate(storedRedirect || '/', { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de terminer la demande.';
      if (activeMode === 'login') {
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes('email not confirmed') || normalizedMessage.includes('email_not_confirmed')) {
          setMode('verify');
          setPassword('');
          toast.error('Votre email doit etre verifie avant de continuer.');
          return;
        }
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    onDemoLogin();
    clearStoredRedirect();
    navigate(redirectTo, { replace: true });
  };

  React.useEffect(() => {
    if (activeMode === 'forgot') return;
    setResetEmailSent(false);
  }, [activeMode]);

  React.useEffect(() => {
    if (activeMode === 'verify') return;
    setVerificationEmailSent(false);
  }, [activeMode]);

  React.useEffect(() => {
    if (activeMode !== 'signup') return;
    setEmail('');
    setPassword('');
    setFullName('');
    setHandleValue('');
    setIsHandleEdited(false);
    setPhone('');
    setCity('');
    setPostcode('');
    setAddress('');
    setAddressDetails('');
    setAccountType('individual');
  }, [activeMode]);

  React.useEffect(() => {
    if (activeMode !== 'signup' || isHandleEdited) return;
    const sourceValue = fullName.trim();
    if (!sourceValue) {
      setHandleValue('');
      return;
    }

    const fallbackHandle = sanitizeHandle(sourceValue);
    if (!fallbackHandle) {
      setHandleValue('');
      return;
    }

    let active = true;
    const timeoutId = setTimeout(() => {
      resolveUniqueHandle(fallbackHandle)
        .then((uniqueHandle) => {
          if (!active) return;
          setHandleValue(uniqueHandle);
        })
        .catch(() => {
          if (!active) return;
          setHandleValue(fallbackHandle);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [activeMode, fullName, isHandleEdited, resolveUniqueHandle]);

  React.useEffect(() => {
    if (activeMode === 'reset') return;
    setResetPassword('');
    setResetPasswordConfirm('');
  }, [activeMode]);

  const title =
    activeMode === 'login'
      ? 'Connexion'
      : activeMode === 'signup'
      ? 'Créer un compte'
      : activeMode === 'verify'
      ? 'Vérifiez votre email'
      : activeMode === 'forgot'
      ? 'Mot de passe oublié'
      : 'Reinitialiser le mot de passe';
  const submitLabel =
    activeMode === 'login'
      ? 'Se connecter'
      : activeMode === 'signup'
      ? 'Créer un compte'
      : activeMode === 'verify'
      ? 'Renvoyer le lien'
      : activeMode === 'forgot'
      ? 'Envoyer le lien'
      : 'Mettre à jour le mot de passe';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__side auth-card__side--text">
          <div>
            <h1 className="auth-card__heading">Rejoignez la communauté des partageurs</h1>
            <p className="auth-card__paragraph">
              Connectez-vous pour travailler en direct avec des producteurs ou procurez-vous des produits auprès des
              partageurs de votre quartier.
            </p>
          </div>
        </div>
        <div className="auth-card__side auth-card__side--form">
          <div className="auth-card__form-header">
            <div>
              <p className="auth-card__eyebrow">{activeMode === 'login' ? '' : ''}</p>
              <h2 className="auth-card__subtitle">{title}</h2>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {activeMode === 'signup' ? (
              <>
                <div className="auth-form__row">
                  <div className="auth-form__col">
                    <label className="auth-form__label">Nom complet ou d'entreprise</label>
                    <div className="auth-form__input-wrapper">
                      <UserPlus className="auth-form__icon" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ex: Emma Martin"
                        className="auth-form__input"
                        autoComplete="name"
                      />
                    </div>
                  </div>
                  <div className="auth-form__col">
                    <label className="auth-form__label">Tag public</label>
                    <div className="auth-form__input-wrapper">
                      <span className="auth-form__icon">@</span>
                      <input
                        type="text"
                        value={handleValue}
                        onChange={(e) => {
                          setIsHandleEdited(true);
                          setHandleValue(sanitizeHandle(e.target.value));
                        }}
                        placeholder="votrenom"
                        className="auth-form__input"
                        autoComplete="off"
                        required
                      />
                    </div>
                    <p className="auth-form__helper">
                      Proposition auto depuis votre nom, modifiable. Sans espace ni majuscule, ce tag définira l'URL
                      de votre profil (/profil/votretag) et reste unique.
                    </p>
                  </div>
                </div>

                <div className="auth-form__row">
                  <div className="auth-form__col">
                    <label className="auth-form__label">Email</label>
                    <div className="auth-form__input-wrapper">
                      <Mail className="auth-form__icon" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.fr"
                        className="auth-form__input"
                        autoComplete="new-email"
                        required
                      />
                    </div>
                  </div>
                  <div className="auth-form__col">
                    <label className="auth-form__label">Téléphone (obligatoire)</label>
                    <div className="auth-form__input-wrapper">
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="06 00 00 00 00"
                        className="auth-form__input"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-form__row">
                  <div className="auth-form__col">
                    <label className="auth-form__label">Mot de passe</label>
                    <div className="auth-form__input-wrapper">
                      <Lock className="auth-form__icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 8 caracteres"
                        className="auth-form__input"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="auth-password-toggle"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff className="auth-eye-icon" /> : <Eye className="auth-eye-icon" />}
                      </button>
                    </div>
                    <p className="auth-form__helper">{passwordPolicyLabel}</p>
                  </div>
                  <div className="auth-form__col">
                    <label className="auth-form__label">Type de compte</label>
                    <div className="auth-form__input-wrapper">
                      <select
                        value={accountType}
                        onChange={(e) =>
                          setAccountType(
                            (e.target.value as
                              | 'individual'
                              | 'auto_entrepreneur'
                              | 'company'
                              | 'association'
                              | 'public_institution') ??
                              'individual'
                          )
                        }
                        className="auth-form__input"
                        required
                      >
                        <option value="individual">Particulier</option>
                        <option value="auto_entrepreneur">Auto-entreprise</option>
                        <option value="company">Entreprise</option>
                        <option value="association">Association</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="auth-form__row">
                  <div className="auth-form__col">
                    <label className="auth-form__label">Adresse</label>
                    <div className="auth-form__input-wrapper">
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="12 rue des Lilas"
                        className="auth-form__input"
                        required
                      />
                    </div>
                  </div>
                  <div className="auth-form__col">
                    <label className="auth-form__label">Complément adresse</label>
                    <div className="auth-form__input-wrapper">
                      <input
                        type="text"
                        value={addressDetails}
                        onChange={(e) => setAddressDetails(e.target.value)}
                        placeholder="Batiment, etage, code entree"
                        className="auth-form__input"
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-form__row">
                  <div className="auth-form__col">
                    <label className="auth-form__label">Code postal</label>
                    <div className="auth-form__input-wrapper">
                      <input
                        type="text"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                        placeholder="75001"
                        className="auth-form__input"
                        required
                      />
                    </div>
                  </div>
                  <div className="auth-form__col">
                    <label className="auth-form__label">Ville</label>
                    <div className="auth-form__input-wrapper">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Paris"
                        className="auth-form__input"
                        required
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : activeMode === 'login' ? (
              <>
                <div className="auth-form__col auth-form__col_single">
                  <label className="auth-form__label">Email</label>
                  <div className="auth-form__input-wrapper">
                    <Mail className="auth-form__icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.fr"
                      className="auth-form__input"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                <div className="auth-form__col auth-form__col_single">
                  <label className="auth-form__label">Mot de passe</label>
                  <div className="auth-form__input-wrapper">
                    <Lock className="auth-form__icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 caracteres"
                      className="auth-form__input"
                      autoComplete="current-password"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="auth-password-toggle"
                      aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="auth-eye-icon" /> : <Eye className="auth-eye-icon" />}
                    </button>
                  </div>
                </div>
                <div className="auth-form__action-row">
                  <button type="button" onClick={() => setMode('forgot')} className="auth-link-button">
                    Mot de passe oublié ?
                  </button>
                </div>
              </>
            ) : activeMode === 'verify' ? (
              <>
                <div className="auth-form__col auth-form__col_single">
                  <p className="auth-form__helper">
                    Ouvrez le lien de confirmation recu par email avant de poursuivre votre commande.
                  </p>
                  <label className="auth-form__label">Email</label>
                  <div className="auth-form__input-wrapper">
                    <Mail className="auth-form__icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.fr"
                      className="auth-form__input"
                      autoComplete="email"
                      required
                    />
                  </div>
                  {verificationEmailSent ? (
                    <p className="auth-form__helper auth-form__helper--valid">
                      Email envoyé. Pensez a vérifier vos spams.
                    </p>
                  ) : null}
                </div>
                <div className="auth-form__action-row">
                  <button type="button" onClick={() => setMode('login')} className="auth-btn auth-btn--primary">
                    J'ai verifié mon email et je souhaite poursuivre vers la commande
                  </button>
                </div>
              </>
            ) : activeMode === 'forgot' ? (
              <>
                <div className="auth-form__col auth-form__col_single">
                  <p className="auth-form__helper">
                    Saisissez votre email pour recevoir un lien de réinitialisation.
                  </p>
                  <label className="auth-form__label">Email</label>
                  <div className="auth-form__input-wrapper">
                    <Mail className="auth-form__icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.fr"
                      className="auth-form__input"
                      autoComplete="email"
                      required
                    />
                  </div>
                      {resetEmailSent ? (
                        <p className="auth-form__helper auth-form__helper--valid">
                          Lien envoyé. Pensez a vérifier vos spams.
                        </p>
                      ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="auth-form__col auth-form__col_single">
                  <p className="auth-form__helper">Choisissez un nouveau mot de passe.</p>
                </div>
                <div className="auth-form__row">
                  <div className="auth-form__col">
                    <label className="auth-form__label">Nouveau mot de passe</label>
                    <div className="auth-form__input-wrapper">
                      <Lock className="auth-form__icon" />
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder="Minimum 8 caracteres"
                        className="auth-form__input"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((prev) => !prev)}
                        className="auth-password-toggle"
                        aria-label={showResetPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        aria-pressed={showResetPassword}
                      >
                        {showResetPassword ? <EyeOff className="auth-eye-icon" /> : <Eye className="auth-eye-icon" />}
                      </button>
                    </div>
                    <p className="auth-form__helper">{passwordPolicyLabel}</p>
                  </div>
                  <div className="auth-form__col">
                    <label className="auth-form__label">Confirmer le mot de passe</label>
                    <div className="auth-form__input-wrapper">
                      <ShieldCheck className="auth-form__icon" />
                      <input
                        type={showResetPasswordConfirm ? 'text' : 'password'}
                        value={resetPasswordConfirm}
                        onChange={(e) => setResetPasswordConfirm(e.target.value)}
                        placeholder="Confirmez le mot de passe"
                        className="auth-form__input"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPasswordConfirm((prev) => !prev)}
                        className="auth-password-toggle"
                        aria-label={showResetPasswordConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        aria-pressed={showResetPasswordConfirm}
                      >
                        {showResetPasswordConfirm ? <EyeOff className="auth-eye-icon" /> : <Eye className="auth-eye-icon" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
              {loading ? 'Traitement...' : submitLabel}
              <ArrowRight className="auth-eye-icon" />
            </button>
          </form>

          {!isRecoveryLink ? (
            <div className="auth-form__action-row">
              {activeMode === 'login' || activeMode === 'signup' ? (
                <>
                  <span className="auth-form__helper">
                    {activeMode === 'login' ? 'Pas encore de compte ?' : 'Déjà inscrit ?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode(activeMode === 'login' ? 'signup' : 'login')}
                    className="auth-link-button"
                  >
                    {activeMode === 'login' ? 'Créer un compte' : 'Se connecter'}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="auth-card__footer">
            <p></p>
            <button onClick={handleDemo} className="auth-card__demo-button" type="button">
              Mode démo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
