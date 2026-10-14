import type { ProjectStatus } from '../types';

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  saved: 'Saved',
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export const formatWeight = (grams: number) =>
  grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;

export const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
};

export const uid = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dateLabel = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
