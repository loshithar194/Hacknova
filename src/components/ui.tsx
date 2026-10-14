import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Recycle, Sprout, CloudSun, Trash2, Bot, Lightbulb, Thermometer, Radar } from 'lucide-react';
import type { Feasibility, ProjectIconKey } from '../types';
import { FEASIBILITY_META } from '../lib/matching';

export const inputCls =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100';
export const labelCls = 'mb-1 block text-sm font-medium text-stone-700';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function btnClass(variant: ButtonVariant = 'primary', extra = '') {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
    secondary: 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50',
    ghost: 'text-stone-600 hover:bg-stone-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${extra}`;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={btnClass(variant, className)} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-stone-100 text-stone-600',
  blue: 'bg-sky-100 text-sky-800',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function FeasibilityBadge({ value }: { value: Feasibility }) {
  const meta = FEASIBILITY_META[value];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'amber' | 'red' }) {
  const bar = { green: 'bg-emerald-600', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${bar}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-stone-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

const NOTICE_TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
} as const;

export function Notice({ tone = 'info', children }: { tone?: keyof typeof NOTICE_TONES; children: ReactNode }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${NOTICE_TONES[tone]}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-emerald-700" />}
      </div>
      <p className="mt-2 text-2xl font-bold text-stone-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </Card>
  );
}

const ICONS: Record<ProjectIconKey, LucideIcon> = {
  sprout: Sprout,
  cloud: CloudSun,
  trash: Trash2,
  bot: Bot,
  bulb: Lightbulb,
  thermo: Thermometer,
  radar: Radar,
};

export function ProjectIcon({ icon, className = '' }: { icon: ProjectIconKey; className?: string }) {
  const Icon = ICONS[icon];
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 text-emerald-700 ${className}`}>
      <Icon className="h-9 w-9" />
    </div>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
        <Recycle className="h-5 w-5" />
      </div>
      {!compact && (
        <span className="text-lg font-bold text-stone-900">
          Second<span className="text-emerald-700">Life</span>
        </span>
      )}
    </div>
  );
}
