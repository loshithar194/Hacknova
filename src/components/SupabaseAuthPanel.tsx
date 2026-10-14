import { useState, type FormEvent } from 'react';
import { Button, Card, Notice, inputCls, labelCls } from './ui';
import { useSupabaseSession } from '../lib/supabaseSession';
import { EMAIL_RE } from '../lib/utils';

/** Sign-in and sign-up for the e-waste features, which need a Supabase account. */
export function SupabaseAuthPanel() {
  const { signIn, signUp } = useSupabaseSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'signup' && !fullName.trim()) return setError('Full name is required.');
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else {
        const out = await signUp({ email: email.trim(), password, fullName: fullName.trim() });
        if (out.kind === 'confirm_email') setInfo(out.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-md">
      <h2 className="text-lg font-semibold">{mode === 'signin' ? 'Sign in to submit e-waste' : 'Create a SecondLife account'}</h2>
      <p className="mt-1 text-sm text-stone-500">Submissions and recommendations are saved to your account.</p>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {info && <div className="mt-4"><Notice tone="success">{info}</Notice></div>}
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        {mode === 'signup' && (
          <div>
            <label className={labelCls} htmlFor="sb-name">Full name</label>
            <input id="sb-name" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        )}
        <div>
          <label className={labelCls} htmlFor="sb-email">Email</label>
          <input id="sb-email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="sb-password">Password</label>
          <input id="sb-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      <button className="mt-4 text-sm font-semibold text-emerald-700 hover:underline" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}>
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </Card>
  );
}
