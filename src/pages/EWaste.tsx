import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, Send, Sparkles, RefreshCw, Info } from 'lucide-react';
import { Badge, Button, Card, Notice, PageHeader, inputCls, labelCls } from '../components/ui';
import { SupabaseAuthPanel } from '../components/SupabaseAuthPanel';
import { useSupabaseSession } from '../lib/supabaseSession';
import { apiRequest, ApiError } from '../services/api';
import { COMPONENTS, COMPONENTS_BY_ID } from '../data/catalog';
import { validateSubmission, DEVICE_TYPES, DEVICE_CONDITIONS, COMPONENT_CONDITIONS, LIMITS, type ComponentCondition, type DeviceCondition, type DeviceType } from '../../shared/submission';
import { formatINR } from '../lib/utils';

interface Submission {
  id: string; deviceType: string; brand: string; model: string | null; condition: string; ageYears: number;
  availableComponents: { componentId: string; quantity: number; condition: string }[];
  notes: string | null; status: string; reviewerNotes: string | null; createdAt: string;
}
interface Recommendation {
  rank: number; productId: string; productName: string; feasibility: string; matchPercent: number;
  missing: { name: string; quantity: number }[]; explanation: string; safetyNotes: string[];
  source: 'ai' | 'rule_based'; estimatedBuildCost: number; estimatedNewPrice: number;
}
interface RecommendationResponse {
  source: 'ai' | 'rule_based'; aiStatus: string; aiNote: string; recommendations: Recommendation[];
}

const FEASIBILITY_LABEL: Record<string, string> = {
  BUILD_NOW: 'Build now', SMALL_ADDITIONS: 'Small additions', NOT_FEASIBLE: 'Not feasible',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', under_review: 'Under review', accepted: 'Accepted', rejected: 'Rejected', needs_info: 'More info needed',
};

interface AiIdea {
  rank: number; name: string; description: string; difficulty: string; durationMinutes: number;
  parts: { componentId: string; quantity: number }[]; steps: string[]; safetyNotes: string[];
  feasibility: 'BUILD_NOW' | 'SMALL_ADDITIONS' | 'NOT_FEASIBLE'; matchPercent: number;
  missing: { componentId: string; name: string; quantity: number }[]; estimatedBuildCost: number;
}
interface IdeaResponse { aiStatus: string; aiNote: string; ideas: AiIdea[] }

const BLANK = {
  deviceType: 'Computer' as DeviceType, brand: '', model: '', condition: 'Unknown' as DeviceCondition, ageYears: '', notes: '',
  parts: [{ componentId: '', quantity: '1', condition: 'Working' as ComponentCondition }],
};

export function EWaste() {
  const { configured, session, checking } = useSupabaseSession();
  if (!configured) {
    return (
      <div className="space-y-6">
        <PageHeader title="E-Waste Submissions" />
        <Notice tone="warning">
          The database is not configured for this build, so e-waste submissions are unavailable. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).
        </Notice>
      </div>
    );
  }
  if (checking) return <p className="text-sm text-stone-500">Checking your session…</p>;
  if (!session) {
    return (
      <div className="space-y-6">
        <PageHeader title="E-Waste Submissions" subtitle="Describe a device you want to reuse. We suggest safe projects for its parts." />
        <SupabaseAuthPanel />
      </div>
    );
  }
  return <Workspace />;
}

function Workspace() {
  const { config, session } = useSupabaseSession();
  const token = session!.accessToken;
  const [form, setForm] = useState(BLANK);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [recs, setRecs] = useState<RecommendationResponse | null>(null);
  const [recsBusy, setRecsBusy] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<AiIdea[]>([]);
  const [ideaNote, setIdeaNote] = useState<string | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  const loadList = async () => {
    try {
      const data = await apiRequest<{ submissions: Submission[] }>(config.apiBase, '/api/submissions', { token });
      setSubs(data.submissions);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your submissions.');
    }
  };
  useEffect(() => { void loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const known = new Set(COMPONENTS.map((c) => c.id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(null);
    const payload = {
      deviceType: form.deviceType,
      brand: form.brand,
      model: form.model,
      condition: form.condition,
      ageYears: form.ageYears === '' ? NaN : Number(form.ageYears),
      notes: form.notes,
      availableComponents: form.parts
        .filter((p) => p.componentId)
        .map((p) => ({ componentId: p.componentId, quantity: Number(p.quantity), condition: p.condition })),
    };
    // Same rules the server enforces. Checking here gives instant feedback.
    const local = validateSubmission(payload, known);
    if (!local.ok) {
      setFieldErrors(local.errors);
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await apiRequest<{ submission: Submission }>(config.apiBase, '/api/submissions', { method: 'POST', token, body: payload });
      setSaved(`Submission saved. Reference ${res.submission.id.slice(0, 8)}.`);
      setForm(BLANK);
      await loadList();
      setSelected(res.submission);
      setRecs(null);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields);
        setFormError('The server rejected some fields. Please correct them.');
      } else setFormError(err instanceof Error ? err.message : 'Could not save the submission.');
    } finally {
      setSubmitting(false);
    }
  };

  const open = async (s: Submission) => {
    setSelected(s);
    setRecs(null);
    setRecsError(null);
    setIdeas([]);
    setIdeaNote(null);
    setIdeasError(null);
    void loadIdeas(s.id);
    try {
      const data = await apiRequest<{ recommendations: Recommendation[] }>(config.apiBase, `/api/submissions/${s.id}/recommendations`, { token });
      if (data.recommendations.length) setRecs({ source: data.recommendations[0].source, aiStatus: 'stored', aiNote: 'Previously generated recommendations.', recommendations: data.recommendations });
    } catch {
      /* no stored results yet */
    }
  };

  const loadIdeas = async (submissionId: string) => {
    try {
      const data = await apiRequest<IdeaResponse>(config.apiBase, `/api/submissions/${submissionId}/ai-ideas`, { token });
      setIdeas(data.ideas);
      setIdeaNote(data.ideas.length ? 'Saved predictions for this device.' : null);
    } catch {
      setIdeas([]);
    }
  };

  const predictIdeas = async () => {
    if (!selected) return;
    setIdeasBusy(true);
    setIdeasError(null);
    try {
      const data = await apiRequest<IdeaResponse>(config.apiBase, `/api/submissions/${selected.id}/ai-ideas`, { method: 'POST', token });
      setIdeaNote(data.aiNote);
      if (data.aiStatus === 'used') setIdeas(data.ideas);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : 'Could not predict projects.');
    } finally {
      setIdeasBusy(false);
    }
  };

  const generate = async () => {
    if (!selected) return;
    setRecsBusy(true);
    setRecsError(null);
    try {
      const data = await apiRequest<RecommendationResponse>(config.apiBase, `/api/submissions/${selected.id}/recommendations`, { method: 'POST', token });
      setRecs(data);
    } catch (err) {
      setRecsError(err instanceof Error ? err.message : 'Could not generate recommendations.');
    } finally {
      setRecsBusy(false);
    }
  };

  const setPart = (i: number, patch: Partial<(typeof BLANK)['parts'][number]>) =>
    setForm((f) => ({ ...f, parts: f.parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }));

  return (
    <div className="space-y-8">
      <PageHeader title="E-Waste Submissions" subtitle="Describe a device and the working parts you can recover. Suggestions are checked against the catalogue." />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h2 className="font-semibold">New submission</h2>
          {formError && <div className="mt-3"><Notice tone="error">{formError}</Notice></div>}
          {saved && <div className="mt-3"><Notice tone="success">{saved}</Notice></div>}
          <form onSubmit={submit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="dtype">Device type</label>
              <select id="dtype" className={inputCls} value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value as DeviceType })}>
                {DEVICE_TYPES.map((d) => <option key={d}>{d}</option>)}
              </select>
              {fieldErrors.deviceType && <p className="mt-1 text-xs text-red-600">{fieldErrors.deviceType}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="brand">Brand</label>
              <input id="brand" maxLength={LIMITS.brandMax} className={inputCls} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              {fieldErrors.brand && <p className="mt-1 text-xs text-red-600">{fieldErrors.brand}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="model">Model (optional)</label>
              <input id="model" maxLength={LIMITS.modelMax} className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              {fieldErrors.model && <p className="mt-1 text-xs text-red-600">{fieldErrors.model}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="dcond">Device condition</label>
              <select id="dcond" className={inputCls} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as DeviceCondition })}>
                {DEVICE_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
              {fieldErrors.condition && <p className="mt-1 text-xs text-red-600">{fieldErrors.condition}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="age">Age (years)</label>
              <input id="age" type="number" min={LIMITS.ageMin} max={LIMITS.ageMax} className={inputCls} value={form.ageYears} onChange={(e) => setForm({ ...form, ageYears: e.target.value })} />
              {fieldErrors.ageYears && <p className="mt-1 text-xs text-red-600">{fieldErrors.ageYears}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="notes">Notes (optional)</label>
              <textarea id="notes" rows={2} maxLength={LIMITS.notesMax} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              {fieldErrors.notes && <p className="mt-1 text-xs text-red-600">{fieldErrors.notes}</p>}
            </div>

            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-stone-700">Recovered parts you have checked</p>
              <p className="mt-1 text-xs text-stone-500">List only parts you actually have. Mark anything untested as “Needs testing”.</p>
              <div className="mt-3 space-y-3">
                {form.parts.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <select aria-label={`Part ${i + 1}`} className={`${inputCls} col-span-12 sm:col-span-5`} value={p.componentId} onChange={(e) => setPart(i, { componentId: e.target.value })}>
                      <option value="">Select a part</option>
                      {COMPONENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input aria-label={`Quantity ${i + 1}`} type="number" min={LIMITS.quantityMin} max={LIMITS.quantityMax} className={`${inputCls} col-span-4 sm:col-span-2`} value={p.quantity} onChange={(e) => setPart(i, { quantity: e.target.value })} />
                    <select aria-label={`Condition ${i + 1}`} className={`${inputCls} col-span-6 sm:col-span-4`} value={p.condition} onChange={(e) => setPart(i, { condition: e.target.value as ComponentCondition })}>
                      {COMPONENT_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <button type="button" aria-label={`Remove part ${i + 1}`} className="col-span-2 flex items-center justify-center text-red-600 hover:text-red-700 sm:col-span-1"
                      onClick={() => setForm((f) => ({ ...f, parts: f.parts.length > 1 ? f.parts.filter((_, idx) => idx !== i) : f.parts }))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {Object.entries(fieldErrors).filter(([k]) => k.startsWith(`availableComponents[${i}]`)).map(([k, v]) => (
                      <p key={k} className="col-span-12 text-xs text-red-600">{v}</p>
                    ))}
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" className="mt-3" onClick={() => setForm((f) => ({ ...f, parts: [...f.parts, { componentId: '', quantity: '1', condition: 'Working' }] }))}>
                <Plus className="h-4 w-4" /> Add part
              </Button>
              {fieldErrors.availableComponents && <p className="mt-2 text-xs text-red-600">{fieldErrors.availableComponents}</p>}
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}><Send className="h-4 w-4" /> {submitting ? 'Saving…' : 'Submit device'}</Button>
            </div>
          </form>
        </Card>

        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your submissions</h2>
            <Button variant="ghost" onClick={() => void loadList()} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
          </div>
          {listError && <div className="mt-3"><Notice tone="error">{listError}</Notice></div>}
          {subs === null && !listError && <p className="mt-4 text-sm text-stone-500">Loading…</p>}
          {subs && subs.length === 0 && <p className="mt-4 text-sm text-stone-500">No submissions yet.</p>}
          <ul className="mt-3 divide-y divide-stone-100">
            {subs?.map((s) => (
              <li key={s.id}>
                <button onClick={() => void open(s)} className={`flex w-full items-center justify-between gap-2 px-2 py-3 text-left text-sm hover:bg-emerald-50 ${selected?.id === s.id ? 'bg-emerald-50' : ''}`}>
                  <span><span className="font-medium">{s.brand}</span> <span className="text-stone-500">{s.deviceType}</span></span>
                  <Badge tone={s.status === 'accepted' ? 'green' : s.status === 'rejected' ? 'red' : 'gray'}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {selected && (
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold">{selected.brand} · {selected.deviceType}</h2>
              <p className="text-sm text-stone-500">
                Condition: {selected.condition} · age {selected.ageYears} yr · status: {STATUS_LABEL[selected.status] ?? selected.status}
              </p>
              {selected.reviewerNotes && <p className="mt-2 text-sm"><strong>Reviewer note:</strong> {selected.reviewerNotes}</p>}
            </div>
            <Button onClick={() => void generate()} disabled={recsBusy}>
              <Sparkles className="h-4 w-4" /> {recsBusy ? 'Generating…' : 'Generate recommendations'}
            </Button>
          </div>

          {recsError && <div className="mt-4"><Notice tone="error">{recsError}</Notice></div>}

          {recs && (
            <div className="mt-5 space-y-4">
              <Notice tone={recs.source === 'ai' ? 'success' : 'info'}>
                <span className="inline-flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{recs.source === 'ai' ? 'AI-assisted recommendations (validated).' : 'Rule-based recommendations.'}</strong>{' '}
                    {recs.aiNote}
                  </span>
                </span>
              </Notice>
              {recs.recommendations.length === 0 && <p className="text-sm text-stone-500">No safe, feasible project matches these parts yet.</p>}
              {recs.recommendations.map((r) => (
                <div key={r.productId} className="rounded-xl border border-stone-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-stone-500">#{r.rank}</span>
                    <h3 className="font-semibold">{r.productName}</h3>
                    <Badge tone={r.feasibility === 'BUILD_NOW' ? 'green' : 'amber'}>{FEASIBILITY_LABEL[r.feasibility] ?? r.feasibility}</Badge>
                    <Badge>{r.matchPercent}% quantity match</Badge>
                  </div>
                  <p className="mt-2 text-sm text-stone-700">{r.explanation}</p>
                  {r.missing.length > 0 && (
                    <p className="mt-2 text-sm"><strong>Still needed:</strong> {r.missing.map((m) => `${m.quantity} × ${m.name}`).join(', ')}</p>
                  )}
                  <p className="mt-2 text-xs text-stone-500">Est. build cost {formatINR(r.estimatedBuildCost)} · comparable new product {formatINR(r.estimatedNewPrice)} (demo reference prices)</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {r.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {selected && (
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold">AI-predicted projects</h2>
              <p className="text-sm text-stone-500">
                New project ideas from this device’s parts. Not limited to a fixed list. Every part and every
                feasibility result is checked by SecondLife, not the model.
              </p>
            </div>
            <Button onClick={() => void predictIdeas()} disabled={ideasBusy}>
              <Sparkles className="h-4 w-4" /> {ideasBusy ? 'Predicting…' : 'Predict projects with AI'}
            </Button>
          </div>

          {ideasError && <div className="mt-4"><Notice tone="error">{ideasError}</Notice></div>}
          {ideaNote && <div className="mt-4"><Notice tone="info"><span className="inline-flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>{ideaNote}</span></span></Notice></div>}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {ideas.map((d) => (
              <div key={d.name} className="rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{d.name}</h3>
                  <Badge tone={d.feasibility === 'BUILD_NOW' ? 'green' : d.feasibility === 'SMALL_ADDITIONS' ? 'amber' : 'red'}>
                    {FEASIBILITY_LABEL[d.feasibility] ?? d.feasibility}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-stone-500">{d.difficulty} · about {d.durationMinutes} min · {d.matchPercent}% of parts owned</p>
                <p className="mt-2 text-sm text-stone-700">{d.description}</p>
                <p className="mt-3 text-sm"><strong>Parts:</strong> {d.parts.map((p) => `${p.quantity} × ${COMPONENTS_BY_ID[p.componentId]?.name ?? p.componentId}`).join(', ')}</p>
                {d.missing.length > 0 && (
                  <p className="mt-1 text-sm text-amber-900"><strong>You would need:</strong> {d.missing.map((m) => `${m.quantity} × ${m.name}`).join(', ')} (est. {formatINR(d.estimatedBuildCost)})</p>
                )}
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                  {d.steps.map((st, i) => <li key={i}>{st}</li>)}
                </ol>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {d.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
