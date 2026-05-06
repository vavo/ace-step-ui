import React, { useEffect, useState } from 'react';
import { Copy, Lock, Mail, User } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { authApi, AuthOptions } from '../services/api';

interface UsernameModalProps {
  isOpen: boolean;
  onSubmit: (username: string) => Promise<void>;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailRegister: (email: string, password: string, username: string) => Promise<void>;
  onGoogleLogin?: () => void;
}

type EmailMode = 'login' | 'register' | 'forgot' | 'reset';

export const UsernameModal: React.FC<UsernameModalProps> = ({
  isOpen,
  onSubmit,
  onEmailLogin,
  onEmailRegister,
  onGoogleLogin,
}) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authOptions, setAuthOptions] = useState<AuthOptions | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    authApi.options()
      .then((options) => {
        if (!cancelled) setAuthOptions(options);
      })
      .catch(() => {
        if (!cancelled) setAuthOptions({ googleConfigured: Boolean(onGoogleLogin), localAuthAllowed: true, emailAuthAllowed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, onGoogleLogin]);

  useEffect(() => {
    if (!isOpen) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    if (!token) return;

    setResetToken(token);
    setEmailMode('reset');
    setError('');
    setNotice('');
    window.history.replaceState({}, '', window.location.pathname);
  }, [isOpen]);

  if (!isOpen) return null;

  const googleConfigured = authOptions?.googleConfigured ?? Boolean(onGoogleLogin);
  const localAuthAllowed = authOptions?.localAuthAllowed ?? true;
  const emailAuthAllowed = authOptions?.emailAuthAllowed ?? true;

  const validateEmailForm = (): boolean => {
    if (emailMode === 'reset') {
      if (!resetToken.trim()) {
        setError(t('resetTokenRequired'));
        return false;
      }

      if (password.length < 8) {
        setError(t('passwordMinLength'));
        return false;
      }

      return true;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('invalidEmail'));
      return false;
    }

    if (emailMode === 'forgot') return true;

    if (password.length < 8) {
      setError(t('passwordMinLength'));
      return false;
    }

    if (emailMode === 'register') {
      const trimmedUsername = emailUsername.trim();
      if (trimmedUsername.length < 2) {
        setError(t('usernameMinLength'));
        return false;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
        setError(t('usernameInvalidChars'));
        return false;
      }
    }

    return true;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateEmailForm()) return;

    setIsLoading(true);
    try {
      if (emailMode === 'forgot') {
        const result = await authApi.forgotPassword(email.trim());
        setResetUrl(result.resetUrl || '');
        setNotice(result.resetUrl ? t('passwordResetLinkCreated') : t('passwordResetGenericNotice'));
      } else if (emailMode === 'reset') {
        if (!resetToken.trim()) {
          setError(t('resetTokenRequired'));
          return;
        }
        await authApi.resetPassword(resetToken.trim(), password);
        setPassword('');
        setResetToken('');
        setEmailMode('login');
        setNotice(t('passwordUpdatedNotice'));
      } else if (emailMode === 'register') {
        await onEmailRegister(email.trim(), password, emailUsername.trim());
      } else {
        await onEmailLogin(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : emailMode === 'register' ? t('emailRegisterFailed') : t('emailLoginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError(t('usernameMinLength'));
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError(t('usernameInvalidChars'));
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSetUsername'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] bg-zinc-900 rounded-2xl shadow-2xl border border-white/10 overflow-y-auto">
        {/* Header gradient */}
        <div className="h-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500" />

        <div className="p-6 sm:p-8">
          <div className="mb-8 flex justify-center">
            <img
              src="/brand/getmusic-logo.png"
              alt={t('loginLogoAlt')}
              className="h-auto w-full max-w-[300px] object-contain drop-shadow-[0_0_28px_rgba(168,85,247,0.35)]"
            />
          </div>

          <div className="space-y-4">
            {onGoogleLogin && (
              <button
                type="button"
                onClick={onGoogleLogin}
                disabled={!googleConfigured}
                className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span className="inline-flex items-center justify-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-white">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </span>
                  {googleConfigured ? t('continueWithGoogle') : t('googleLoginUnavailable')}
                </span>
              </button>
            )}

            {onGoogleLogin && (
              <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-500">
                <div className="h-px flex-1 bg-zinc-800" />
                {t('or')}
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
            )}

            {emailAuthAllowed && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-800 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('login');
                      setError('');
                    }}
                    className={`rounded-lg py-2 text-sm font-semibold transition-colors ${emailMode === 'login' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    {t('emailLogin')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('register');
                      setError('');
                    }}
                    className={`rounded-lg py-2 text-sm font-semibold transition-colors ${emailMode === 'register' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    {t('emailRegister')}
                  </button>
                </div>

                {emailMode === 'forgot' && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-100">
                    {t('forgotPasswordSelfHostedHint')}
                  </div>
                )}

                {emailMode === 'reset' && (
                  <div>
                    <label htmlFor="reset-token" className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('resetToken')}
                    </label>
                    <input
                      type="text"
                      id="reset-token"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder={t('pasteResetToken')}
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                      disabled={isLoading}
                    />
                  </div>
                )}

                {emailMode === 'register' && (
                  <div>
                    <label htmlFor="email-username" className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('chooseUsername')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="w-5 h-5 text-zinc-500" />
                      </div>
                      <input
                        type="text"
                        id="email-username"
                        value={emailUsername}
                        onChange={(e) => setEmailUsername(e.target.value)}
                        placeholder={t('enterYourName')}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                        autoFocus
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                )}

                {emailMode !== 'reset' && (
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                    {t('emailAddress')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="w-5 h-5 text-zinc-500" />
                    </div>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                      autoFocus={emailMode === 'login'}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                )}

                {emailMode !== 'forgot' && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-2">
                    {emailMode === 'reset' ? t('newPassword') : t('password')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="w-5 h-5 text-zinc-500" />
                    </div>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('passwordPlaceholder')}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                )}

                {notice && (
                  <p className="text-sm text-green-400">{notice}</p>
                )}

                {resetUrl && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('resetLink')}</div>
                    <div className="break-all text-xs text-zinc-300">{resetUrl}</div>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(resetUrl).catch(() => {})}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                    >
                      <Copy size={14} />
                      {t('copyLink')}
                    </button>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={
                    isLoading
                    || (emailMode !== 'reset' && !email.trim())
                    || (emailMode !== 'forgot' && !password)
                    || (emailMode === 'register' && !emailUsername.trim())
                    || (emailMode === 'reset' && !resetToken.trim())
                  }
                  className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading
                    ? t('gettingStarted')
                    : emailMode === 'register'
                      ? t('createAccountWithEmail')
                    : emailMode === 'forgot'
                        ? t('createResetLink')
                        : emailMode === 'reset'
                          ? t('setNewPassword')
                          : t('signInWithEmail')}
                </button>

                <div className="flex justify-center gap-3 text-xs">
                  {emailMode === 'login' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('forgot');
                        setError('');
                        setNotice('');
                        setResetUrl('');
                      }}
                      className="text-zinc-400 hover:text-white"
                    >
                      {t('forgotPassword')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('login');
                        setError('');
                        setNotice('');
                        setResetUrl('');
                        setResetToken('');
                      }}
                      className="text-zinc-400 hover:text-white"
                    >
                      {t('backToSignIn')}
                    </button>
                  )}
                </div>
              </form>
            )}

            {localAuthAllowed && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-500">
                  <div className="h-px flex-1 bg-zinc-800" />
                  {t('localDevLogin')}
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-2">
                    {t('yourName')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="w-5 h-5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('enterYourName')}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                      autoFocus
                      disabled={isLoading}
                    />
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-red-400">{error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !username.trim()}
                  className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('gettingStarted')}
                    </span>
                  ) : (
                    t('getStarted')
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-xs text-zinc-500 text-center">
            {t('yourMusicYourWay')}
          </p>
        </div>
      </div>
    </div>
  );
};
