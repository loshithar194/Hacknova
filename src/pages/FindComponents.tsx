import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, Trash2, Info, CheckSquare } from 'lucide-react';
import { Badge, Button, Card, Notice, PageHeader, btnClass, inputCls, labelCls } from '../components/ui';
import { useApp, withActivity } from '../lib/store';
import { COMPONENTS, COMPONENTS_BY_ID, PROJECTS, PROJECTS_BY_ID } from '../data/catalog';
import { evaluateProject } from '../lib/matching';
import { formatINR, uid } from '../lib/utils';
import type { ChecklistItem } from '../types';

type Msg = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function FindComponents() {
  const { currentUser, data, updateData } = useApp();
  const [params] = useSearchParams();
  const urlProject = params.get('project') ?? '';

  const [linkedId, setLinkedId] = useState(urlProject);
  useEffect(() => setLinkedId(urlProject), [urlProject]);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [message, setMessage] = useState<Msg>(null);

  const categories = useMemo(() => ['All', ...new Set(COMPONENTS.map((c) => c.category))], []);
  const project = linkedId ? PROJECTS_BY_ID[linkedId] : undefined;
  const result = project ? evaluateProject(project, data.inventory) : null;

  const owned = (componentId: string) =>
    data.inventory.filter((i) => i.componentId === componentId && i.condition !== 'Not working').reduce((s, i) => s + i.quantity, 0);

  const requiredFor = (componentId: string) => project?.requirements.find((r) => r.componentId === componentId)?.quantity;

  const visible = COMPONENTS.filter((c) => {
    if (category !== 'All' && c.category !== category) return false;
    if (search && !`${c.name} ${c.description} ${c.specs}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const mutateChecklist = (fn: (list: ChecklistItem[]) => ChecklistItem[]) =>
    updateData((d) => ({ ...d, checklist: fn(d.checklist) }));

  const addToChecklist = (componentId: string, qty: number, projectId?: string) => {
    if (!currentUser) return setMessage({ tone: 'info', text: 'Sign in to keep a shopping checklist.' });
    mutateChecklist((list) => {
      const existing = list.find((i) => i.componentId === componentId && i.projectId === projectId);
      if (existing) {
        return list.map((i) => (i === existing ? { ...i, quantity: Math.max(i.quantity, qty) } : i));
      }
      return [...list, { id: uid(), componentId, quantity: qty, acquired: false, projectId }];
    });
    const name = COMPONENTS_BY_ID[componentId].name;
    setMessage({ tone: 'success', text: `Added ${qty} × ${name} to your checklist.` });
  };

  const addMissingForProject = () => {
    if (!result || !project) return;
    const missing = result.requirements.filter((r) => r.missing > 0);
    if (missing.length === 0) return setMessage({ tone: 'info', text: 'You already have every required part for this project.' });
    if (!currentUser) return setMessage({ tone: 'info', text: 'Sign in to keep a shopping checklist.' });
    mutateChecklist((list) => {
      let next = [...list];
      for (const r of missing) {
        const existing = next.find((i) => i.componentId === r.componentId && i.projectId === project.id);
        if (existing) next = next.map((i) => (i === existing ? { ...i, quantity: Math.max(i.quantity, r.missing) } : i));
        else next.push({ id: uid(), componentId: r.componentId, quantity: r.missing, acquired: false, projectId: project.id });
      }
      return next;
    });
    setMessage({ tone: 'success', text: `Added ${missing.length} missing component type(s) for ${project.name} to your checklist.` });
  };

  const checklist = data.checklist;
  const remaining = checklist.filter((i) => !i.acquired);
  const remainingCost = remaining.reduce((s, i) => s + i.quantity * COMPONENTS_BY_ID[i.componentId].unitPrice, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Find Components"
        subtitle="Search the demo component catalog and build a shopping checklist."
      />

      <Notice tone="info">
        <span className="inline-flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Demo catalog. Prices are reference estimates in INR. There is no live supplier integration, so stock status is not shown and no purchase is simulated.</span>
      </Notice>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className={labelCls} htmlFor="csearch">Search components</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input id="csearch" className={`${inputCls} pl-9`} placeholder="e.g. sensor, 5V, motor" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ccategory">Category</label>
            <select id="ccategory" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelCls} htmlFor="linked">Show required quantities for project</label>
            <select id="linked" className={inputCls} value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
              <option value="">No project selected</option>
              {PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {project && result && (
        <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Linked project</p>
            <p className="font-semibold">{project.name}</p>
            <p className="text-sm text-stone-500">
              Missing: {result.requirements.filter((r) => r.missing > 0).length} type(s), {result.missingUnits} unit(s) · est. {formatINR(result.additionalCost)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={addMissingForProject}><ShoppingCart className="h-4 w-4" /> Add all missing to checklist</Button>
            <Link to={`/projects/${project.id}`} className={btnClass('secondary')}>View project</Link>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 grid gap-4 sm:grid-cols-2">
          {visible.length === 0 && <p className="text-sm text-stone-500">No components match your search.</p>}
          {visible.map((c) => {
            const req = requiredFor(c.id);
            const have = owned(c.id);
            const missing = req ? Math.max(0, req - have) : 0;
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-stone-900">{c.name}</h3>
                    <p className="text-xs text-stone-500">{c.category}</p>
                  </div>
                  <span className="shrink-0 font-bold text-emerald-800">{formatINR(c.unitPrice)}</span>
                </div>
                <p className="mt-2 text-sm text-stone-600">{c.description}</p>
                <p className="mt-2 text-xs text-stone-500"><strong>Specs:</strong> {c.specs}</p>
                {c.compatibility && <p className="mt-1 text-xs text-amber-700"><strong>Compatibility:</strong> {c.compatibility}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="gray">Demo catalog</Badge>
                  {req !== undefined && <Badge tone="blue">Required: {req}</Badge>}
                  {req !== undefined && <Badge tone={missing > 0 ? 'red' : 'green'}>Owned: {have}</Badge>}
                </div>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => addToChecklist(c.id, Math.max(1, missing), project?.id)}
                    disabled={!currentUser}
                  >
                    <Plus className="h-4 w-4" /> {missing > 0 ? `Add ${missing} missing` : 'Add to checklist'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="h-fit xl:sticky xl:top-6">
          <h2 className="flex items-center gap-2 font-semibold"><CheckSquare className="h-4 w-4 text-emerald-700" /> Shopping checklist</h2>
          {!currentUser ? (
            <p className="mt-3 text-sm text-stone-500">
              <Link to="/login" className="font-semibold text-emerald-700 underline">Sign in</Link> to keep a checklist.
            </p>
          ) : checklist.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">Nothing on your list yet. Add components from the catalog.</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-stone-100">
                {checklist.map((item) => {
                  const c = COMPONENTS_BY_ID[item.componentId];
                  const linked = item.projectId ? PROJECTS_BY_ID[item.projectId]?.name : null;
                  return (
                    <li key={item.id} className="py-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={item.acquired}
                            aria-label={`Mark ${c.name} as acquired`}
                            onChange={(e) => mutateChecklist((l) => l.map((i) => (i.id === item.id ? { ...i, acquired: e.target.checked } : i)))}
                          />
                          <span className={item.acquired ? 'text-stone-400 line-through' : 'text-stone-800'}>
                            {c.name}
                            {linked && <span className="block text-xs text-stone-400">for {linked}</span>}
                          </span>
                        </label>
                        <button
                          aria-label={`Remove ${c.name}`}
                          className="text-red-500 hover:text-red-700"
                          onClick={() => mutateChecklist((l) => l.filter((i) => i.id !== item.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2 pl-6">
                        <input
                          type="number"
                          min={1}
                          aria-label={`Quantity of ${c.name}`}
                          className="w-20 rounded-lg border border-stone-300 px-2 py-1"
                          value={item.quantity}
                          onChange={(e) => {
                            const q = Number(e.target.value);
                            if (Number.isInteger(q) && q >= 1) {
                              mutateChecklist((l) => l.map((i) => (i.id === item.id ? { ...i, quantity: q } : i)));
                            }
                          }}
                        />
                        <span className="text-xs text-stone-500">≈ {formatINR(item.quantity * c.unitPrice)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 border-t border-stone-100 pt-4 text-sm">
                <div className="flex justify-between"><span>Remaining (est.)</span><strong>{formatINR(remainingCost)}</strong></div>
                <p className="mt-1 text-xs text-stone-400">{remaining.length} item(s) not yet acquired · demo prices</p>
              </div>
              <Button variant="ghost" className="mt-3 w-full" onClick={() => {
                if (!window.confirm('Clear the whole checklist?')) return;
                mutateChecklist(() => []);
                updateData((d) => withActivity(d, 'Cleared shopping checklist'));
              }}>
                Clear checklist
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
