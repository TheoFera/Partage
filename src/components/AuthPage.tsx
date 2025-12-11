import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { Mail, Lock, UserPlus, ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from './Logo';

type AuthMode = 'login' | 'signup';

interface AuthPageProps {
  supabaseClient: SupabaseClient | null;
  onAuthSuccess: (user: SupabaseAuthUser) => void;
  onDemoLogin: () => void;
}

export function AuthPage({ supabaseClient, onAuthSuccess, onDemoLogin }: AuthPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as { redirectTo?: string; mode?: AuthMode } | null;
  const [mode, setMode] = React.useState<AuthMode>(locationState?.mode ?? 'login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [handleValue, setHandleValue] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [postcode, setPostcode] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [accountType, setAccountType] = React.useState<'individual' | 'company' | 'association' | 'public_institution'>('individual');
  const [loading, setLoading] = React.useState(false);

  const redirectTo = locationState?.redirectTo || location.pathname || '/';
  const supabaseIsReady = Boolean(supabaseClient);

  const handleLogoClick = () => {
    navigate('/', { replace: false });
  };

  const sanitizeHandle = (value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabaseClient) {
      toast.error('Supabase n est pas configuré. Utilisez le mode demo pour tester.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          onAuthSuccess(data.user);
          toast.success('Connexion réussie');
          navigate(redirectTo, { replace: true });
        } else {
          toast.info('Vérifiez vos emails pour confirmer votre connexion.');
        }
      } else {
        const safeHandle = sanitizeHandle(handleValue || email);
        if (!safeHandle) {
          toast.error('Choisissez un tag valide (lettres et chiffres, sans espace).');
          return;
        }
        if (supabaseIsReady) {
          const { data: existing, error: existingError } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('handle', safeHandle)
            .maybeSingle();
          if (existingError) {
            toast.error('Impossible de verifier le tag pour le moment.');
            return;
          }
          if (existing) {
            toast.error('Ce tag est deja utilisé. Merci d en choisir un autre.');
            return;
          }
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
              account_type: accountType,
            },
          },
        });
        if (error) throw error;
        const newUser = data.user ?? data.session?.user;
        if (newUser) {
          onAuthSuccess(newUser);
          toast.success('Compte cree et connecte');
          navigate(redirectTo, { replace: true });
        } else {
          toast.success('Compte crée. Consultez vos emails pour activer votre accès.');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de terminer la demande.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    onDemoLogin();
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="w-full flex justify-center px-2 sm:px-4 py-6 sm:py-10">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 bg-white border border-[#FFE0D1] rounded-3xl shadow-xl overflow-hidden">
        <div className="p-8 md:p-10 bg-white text-[#1F2937] flex flex-col justify-between">
          <div className="space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              Rejoignez la communauté des partageurs
            </h1>
            <p className="text-base text-[#4B5563] leading-relaxed">
              Connectez-vous pour travailler en direct avec des producteurs ou procurez-vous des produits auprès des
              partageurs de votre quartier.
            </p>
          </div>
        </div>

        <div className="p-8 md:p-10 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#6B7280]">{mode === 'login' ? '' : ''}</p>
              <h2 className="text-2xl font-semibold text-[#1F2937]">
                {mode === 'login' ? 'Connexion' : 'Créer un compte'}
              </h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Nom complet ou d'entreprise</label>
                    <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white focus-within:border-[#FF6B4A] transition-colors">
                      <UserPlus className="w-5 h-5 text-[#9CA3AF]" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ex: Emma Martin"
                        className="flex-1 outline-none text-[#1F2937]"
                        autoComplete="name"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Tag public</label>
                    <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white focus-within:border-[#FF6B4A] transition-colors">
                      <span className="text-[#9CA3AF] text-sm">@</span>
                      <input
                        type="text"
                        value={handleValue}
                        onChange={(e) => setHandleValue(sanitizeHandle(e.target.value))}
                        placeholder="votrenom"
                        className="flex-1 outline-none text-[#1F2937]"
                        autoComplete="off"
                        required
                      />
                    </div>
                    <p className="text-xs text-[#6B7280]">
                       Sans espace, ni majuscule, ni caractère spécial, ce tag permettra de definir l'URL de votre profil : /profil/votretag. Deux comptes différents ne peuvent pas avoir le même tag.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Email</label>
                    <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white focus-within:border-[#FF6B4A] transition-colors">
                      <Mail className="w-5 h-5 text-[#9CA3AF]" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.fr"
                        className="flex-1 outline-none text-[#1F2937]"
                        autoComplete="new-email"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Téléphone (obligatoire)</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+33..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#FF6B4A]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Mot de passe</label>
                    <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white focus-within:border-[#FF6B4A] transition-colors">
                      <Lock className="w-5 h-5 text-[#9CA3AF]" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 6 caracteres"
                        className="flex-1 outline-none text-[#1F2937]"
                        autoComplete="new-password"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Type de compte</label>
                    <select
                      value={accountType}
                      onChange={(e) =>
                        setAccountType(
                          (e.target.value as 'individual' | 'company' | 'association' | 'public_institution') ?? 'individual'
                        )
                      }
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#FF6B4A]"
                      required
                    >
                      <option value="individual">Particulier</option>
                      <option value="company">Entreprise</option>
                      <option value="association">Association</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm text-[#374151] font-semibold">Adresse</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="12 rue des Lilas"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#FF6B4A]"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Code postal</label>
                    <input
                      type="text"
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      placeholder="75001"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#FF6B4A]"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-[#374151] font-semibold">Ville</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Paris"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#FF6B4A]"
                      required
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-[#374151] font-semibold">Email</label>
                  <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white focus-within:border-[#FF6B4A] transition-colors">
                    <Mail className="w-5 h-5 text-[#9CA3AF]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.fr"
                      className="flex-1 outline-none text-[#1F2937]"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-[#374151] font-semibold">Mot de passe</label>
                  <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white focus-within:border-[#FF6B4A] transition-colors">
                    <Lock className="w-5 h-5 text-[#9CA3AF]" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 caracteres"
                      className="flex-1 outline-none text-[#1F2937]"
                      autoComplete="current-password"
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#FF6B4A] text-white font-semibold shadow-md hover:bg-[#FF5A39] transition-colors disabled:opacity-60"
            >
              {loading ? 'Traitement...' : mode === 'login' ? 'Se connecter' : 'Créer et continuer'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6B7280]">
              {mode === 'login' ? 'Pas encore de compte ?' : 'Deja inscrit ?'}
            </span>
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-sm text-[#FF6B4A] font-semibold hover:text-[#FF5A39]"
            >
              {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
            </button>
          </div>

          <div className="pt-4 border-t border-dashed border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#6B7280]"></p>
              <button
                onClick={handleDemo}
                className="text-sm font-semibold text-[#1F2937] px-3 py-2 rounded-lg border border-gray-200 hover:border-[#FF6B4A] hover:text-[#FF6B4A] transition-colors"
              >
                Mode demo
              </button>
            </div>
            <p className="text-xs text-[#9CA3AF]">
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
