import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Logo, Notice, inputCls, labelCls } from '../components/ui';
import { useApp, DEMO_EMAIL, DEMO_PASSWORD } from '../lib/store';
import { EMAIL_RE } from '../lib/utils';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm' | 'form', string>>;

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link to="/"><Logo /></Link>
        </div>
        <Card className="p-7">
          <h1 className="text-xl font-bold text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </Card>
        <p className="mt-4 text-center text-xs text-stone-400">
          Demo authentication only. Not production-grade security.
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, loginDemo } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [success, setSuccess] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const result = login(email, password);
    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    setSuccess('Signed in. Redirecting…');
    navigate(from, { replace: true });
  };

  const tryDemo = () => {
    loginDemo();
    navigate(from === '/login' ? '/dashboard' : from, { replace: true });
  };

  return (
    <AuthShell title="Sign in" subtitle="Access your inventory, saved projects and impact.">
      {errors.form && <div className="mb-4"><Notice tone="error">{errors.form}</Notice></div>}
      {success && <div className="mb-4"><Notice tone="success">{success}</Notice></div>}

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className={inputCls} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className={inputCls} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>

      <div className="mt-6 border-t border-stone-100 pt-5">
        <p className="text-sm text-stone-600">
          New here? <Link to="/register" className="font-semibold text-emerald-700 hover:underline">Create an account</Link>
        </p>
        <Button variant="secondary" className="mt-4 w-full" onClick={tryDemo}>
          Try the demo account
        </Button>
        <p className="mt-2 text-xs text-stone-500">
          Demo account: {DEMO_EMAIL} / {DEMO_PASSWORD}. It starts with a sample kit.
        </p>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [success, setSuccess] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!name.trim()) errs.name = 'Full name is required.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 8) errs.password = 'Use at least 8 characters.';
    if (!confirm) errs.confirm = 'Please confirm your password.';
    else if (confirm !== password) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const result = register(name, email, password);
    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    setSuccess('Account created. Taking you to your dashboard…');
    navigate('/dashboard', { replace: true });
  };

  return (
    <AuthShell title="Create your account" subtitle="Start with an empty inventory and build your own history.">
      {errors.form && <div className="mb-4"><Notice tone="error">{errors.form}</Notice></div>}
      {success && <div className="mb-4"><Notice tone="success">{success}</Notice></div>}

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="name">Full name</label>
          <input id="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-email">Email</label>
          <input id="reg-email" type="email" autoComplete="email" className={inputCls} value={email}
            onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-password">Password</label>
          <input id="reg-password" type="password" autoComplete="new-password" className={inputCls} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password" className={inputCls} value={confirm}
            onChange={(e) => setConfirm(e.target.value)} />
          {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm}</p>}
        </div>
        <Button type="submit" className="w-full">Create account</Button>
      </form>

      <p className="mt-6 text-sm text-stone-600">
        Already registered? <Link to="/login" className="font-semibold text-emerald-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
