import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { Badge, Button, Card, Notice, PageHeader, inputCls, labelCls } from '../components/ui';
import { SupabaseAuthPanel } from '../components/SupabaseAuthPanel';
import { useSupabaseSession } from '../lib/supabaseSession';
import { apiRequest, ApiError } from '../services/api';
import { COMPONENTS_BY_ID } from '../data/catalog';
import { SUBMISSION_STATUSES, LIMITS, type SubmissionStatus } from '../../shared/submission';

interface AdminSubmission {
  id: string; deviceType: string; brand: string; model: string | null; condition: string; ageYears: number;
  availableComponents: { componentId: string; quantity: number; condition: string }[];
  notes: string | null; status: SubmissionStatus; reviewerNotes: string | null;
  submitterEmail: string | null; createdAt: string;
}

const LABEL: Record<SubmissionStatus, string> = {
  pending: 'Pending', under_review: 'Under review', accepted: 'Accepted', rejected: 'Rejected', needs_info: 'More info needed',
};

export function Admin() {
  const { configured, session, role, checking } = useSupabaseSession();
  if (!configured) return <Notice tone="warning">The database is not configured for this build.</Notice>;
  if (checking) return <p className="text-sm text-stone-500">Checking permissions…</p>;
  if (!session) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin: Submissions" />
        <SupabaseAuthPanel />
      </div>
    );
  }
  if (role !== 'admin') {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" />
        <h2 className="mt-3 text-lg font-semibold">Administrator access required</h2>
        <p className="mt-2 text-sm text-stone-600">Your account does not have the admin role. Ask a database administrator to grant it.</p>
      </Card>
    );
  }
  return <Review />;
}

function Review() {
  const { config, session } = useSupabaseSession();
  const token = session!.accessToken;
  const [filter, setFilter] = useState<string>('');
  const [items, setItems] = useState<AdminSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<SubmissionStatus>('pending');
  const [draftNotes, setDraftNotes] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const q = filter ? `?status=${filter}` : '';
      const data = await apiRequest<{ submissions: AdminSubmission[] }>(config.apiBase, `/api/admin/submissions${q}`, { token });
      setItems(data.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submissions.');
    }
  };
  useEffect(() => { void load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => items?.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const choose = (s: AdminSubmission) => {
    setSelectedId(s.id);
    setDraftStatus(s.status);
    setDraftNotes(s.reviewerNotes ?? '');
    setSaveMsg(null);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await apiRequest<{ submission: AdminSubmission }>(config.apiBase, `/api/admin/submissions/${selected.id}`, {
        method: 'PATCH', token, body: { status: draftStatus, reviewerNotes: draftNotes },
      });
      setItems((list) => (list ?? []).map((i) => (i.id === res.submission.id ? { ...i, ...res.submission } : i)));
      setSaveMsg({ tone: 'success', text: 'Status and notes saved.' });
    } catch (err) {
      setSaveMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not save changes.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin: Submissions"
        subtitle="Review device submissions and update their status."
        action={<Button variant="secondary" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-medium" htmlFor="sfilter">Status</label>
            <select id="sfilter" className={`${inputCls} max-w-xs`} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
            </select>
          </div>
          {items === null && !error && <p className="text-sm text-stone-500">Loading…</p>}
          {items && items.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No submissions match this filter.</p>}
          {items && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="py-2 pr-3">Submitted by</th><th className="py-2 pr-3">Device</th><th className="py-2 pr-3">Parts</th><th className="py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {items.map((s) => (
                    <tr key={s.id} className={`cursor-pointer hover:bg-emerald-50 ${selectedId === s.id ? 'bg-emerald-50' : ''}`} onClick={() => choose(s)}>
                      <td className="py-2.5 pr-3">{s.submitterEmail ?? 'Unknown'}</td>
                      <td className="py-2.5 pr-3">{s.brand} {s.deviceType}</td>
                      <td className="py-2.5 pr-3">{s.availableComponents.length}</td>
                      <td className="py-2.5"><Badge>{LABEL[s.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-2">
          {!selected ? (
            <p className="text-sm text-stone-500">Select a submission to review it.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-semibold">{selected.brand} {selected.model ?? ''}</h2>
                <p className="text-sm text-stone-500">{selected.deviceType} · {selected.condition} · {selected.ageYears} yr · {new Date(selected.createdAt).toLocaleDateString('en-IN')}</p>
                <p className="text-sm text-stone-500">From {selected.submitterEmail ?? 'unknown user'}</p>
              </div>
              {selected.notes && <p className="rounded-lg bg-stone-50 p-3 text-sm">{selected.notes}</p>}
              <ul className="space-y-1 text-sm">
                {selected.availableComponents.map((p) => (
                  <li key={p.componentId}>{p.quantity} × {COMPONENTS_BY_ID[p.componentId]?.name ?? p.componentId} <span className="text-stone-400">({p.condition})</span></li>
                ))}
              </ul>
              <div>
                <label className={labelCls} htmlFor="astatus">Status</label>
                <select id="astatus" className={inputCls} value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as SubmissionStatus)}>
                  {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="anotes">Reviewer notes</label>
                <textarea id="anotes" rows={3} maxLength={LIMITS.reviewerNotesMax} className={inputCls} value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
              </div>
              {saveMsg && <Notice tone={saveMsg.tone}>{saveMsg.text}</Notice>}
              <Button onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
