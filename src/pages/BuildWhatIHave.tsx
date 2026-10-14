import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, Save, Eraser, Plus, Sparkles, Wrench, Info, Database } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, btnClass, inputCls, labelCls } from '../components/ui';
import { ProjectCard } from '../components/ProjectCard';
import { useApp, withActivity } from '../lib/store';
import { COMPONENTS, sampleInventory } from '../data/catalog';
import { evaluateAll } from '../lib/matching';
import type { Condition, Feasibility, InventoryItem } from '../types';
import { slugify, uid } from '../lib/utils';

const CATEGORIES = [...new Set(COMPONENTS.map((c) => c.category)), 'Other'];
const DEVICES = [
  'Old computer',
  'Old printer',
  'Broken toy',
  'Old router',
  'Unused electronics kit',
  'Discarded electronic circuit board',
];
const CONDITIONS: Condition[] = ['Working', 'Needs testing', 'Not working'];
const CONDITION_TONE: Record<Condition, 'green' | 'amber' | 'red'> = {
  Working: 'green',
  'Needs testing': 'amber',
  'Not working': 'red',
};

const BLANK_DRAFT = { name: '', category: '', quantity: '1', condition: 'Working' as Condition, specs: '', notes: '' };

type Msg = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function BuildWhatIHave() {
  const { currentUser, data, updateData } = useApp();
  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Msg>(null);
  const [showResults, setShowResults] = useState(false);

  // Method B state
  const [device, setDevice] = useState(DEVICES[0]);
  const [pick, setPick] = useState({ componentId: '', quantity: '1', condition: 'Needs testing' as Condition });
  const [recovered, setRecovered] = useState<{ componentId: string; quantity: number; condition: Condition }[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const catalogMatch = COMPONENTS.find((c) => c.name.toLowerCase() === draft.name.trim().toLowerCase());
  const hasInventory = data.inventory.length > 0;
  const results = useMemo(() => evaluateAll(data.inventory), [data.inventory]);

  if (!currentUser) {
    return <EmptyState title="Sign in required" body="Sign in to build and save your inventory." action={<Link to="/login" className={btnClass('primary')}>Sign in</Link>} />;
  }

  const resetDraft = () => {
    setDraft(BLANK_DRAFT);
    setEditingId(null);
    setErrors({});
  };

  const submitEntry = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const name = draft.name.trim();
    if (!name) errs.name = 'Component name is required.';
    const qty = Number(draft.quantity);
    if (!Number.isInteger(qty) || qty < 1) errs.quantity = 'Quantity must be a whole number of at least 1.';
    const category = catalogMatch?.category ?? draft.category;
    if (!category) errs.category = 'Choose a category for a custom component.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const componentId = catalogMatch?.id ?? `custom-${slugify(name)}`;
    const item: Omit<InventoryItem, 'id' | 'addedAt'> = {
      componentId,
      name: catalogMatch?.name ?? name,
      category,
      quantity: qty,
      condition: draft.condition,
      specs: draft.specs.trim() || catalogMatch?.specs || '',
      notes: draft.notes.trim(),
      source: 'Manual entry',
    };

    if (editingId) {
      updateData((d) =>
        withActivity(
          {
            ...d,
            inventory: d.inventory.map((i) => (i.id === editingId ? { ...i, ...item } : i)),
          },
          `Updated ${item.name}`,
        ),
      );
      setMessage({ tone: 'success', text: `Updated ${item.name}.` });
    } else {
      const merge = data.inventory.find(
        (i) => i.componentId === componentId && i.condition === item.condition && i.source === item.source,
      );
      if (merge) {
        updateData((d) =>
          withActivity(
            {
              ...d,
              inventory: d.inventory.map((i) => (i.id === merge.id ? { ...i, quantity: i.quantity + qty } : i)),
            },
            `Added ${qty} more ${item.name}`,
          ),
        );
        setMessage({ tone: 'success', text: `Merged with existing ${item.name} entry (now ${merge.quantity + qty}).` });
      } else {
        const newItem: InventoryItem = { ...item, id: uid(), addedAt: new Date().toISOString() };
        updateData((d) => withActivity({ ...d, inventory: [newItem, ...d.inventory] }, `Added ${qty} × ${item.name}`));
        setMessage({ tone: 'success', text: `Added ${qty} × ${item.name} to your inventory.` });
      }
    }
    resetDraft();
  };

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      condition: item.condition,
      specs: item.specs,
      notes: item.notes,
    });
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeQty = (id: string, qty: number) => {
    if (!Number.isInteger(qty) || qty < 1) return;
    updateData((d) => ({ ...d, inventory: d.inventory.map((i) => (i.id === id ? { ...i, quantity: qty } : i)) }));
  };

  const removeItem = (item: InventoryItem) => {
    if (!window.confirm(`Delete "${item.name}" from your inventory?`)) return;
    updateData((d) => withActivity({ ...d, inventory: d.inventory.filter((i) => i.id !== item.id) }, `Deleted ${item.name}`));
    setMessage({ tone: 'info', text: `Deleted ${item.name}.` });
  };

  const saveInventory = () => {
    updateData((d) => withActivity(d, `Saved inventory (${d.inventory.length} entries)`));
    setMessage({ tone: 'success', text: 'Inventory saved to this browser.' });
  };

  const clearForm = () => {
    if (!window.confirm('Clear the entry form? Unsaved fields will be lost.')) return;
    resetDraft();
  };

  const clearAll = () => {
    if (!window.confirm('Remove ALL inventory entries? This cannot be undone.')) return;
    updateData((d) => withActivity({ ...d, inventory: [] }, 'Cleared all inventory'));
    setMessage({ tone: 'info', text: 'Inventory cleared.' });
  };

  const loadSample = () => {
    const existing = new Set(data.inventory.map((i) => i.componentId));
    const toAdd = sampleInventory().filter((i) => !existing.has(i.componentId));
    if (toAdd.length === 0) {
      setMessage({ tone: 'info', text: 'The sample kit is already in your inventory.' });
      return;
    }
    updateData((d) => withActivity({ ...d, inventory: [...toAdd, ...d.inventory] }, `Loaded sample kit (${toAdd.length} entries)`));
    setMessage({ tone: 'success', text: `Loaded ${toAdd.length} sample entries.` });
  };

  // Method B helpers
  const addRecovered = () => {
    const qty = Number(pick.quantity);
    if (!pick.componentId) return setMessage({ tone: 'error', text: 'Choose a component to add.' });
    if (!Number.isInteger(qty) || qty < 1) return setMessage({ tone: 'error', text: 'Quantity must be at least 1.' });
    setRecovered((r) => [...r, { componentId: pick.componentId, quantity: qty, condition: pick.condition }]);
    setPick({ componentId: '', quantity: '1', condition: 'Needs testing' });
  };

  const submitRecovered = () => {
    if (!confirmed) return setMessage({ tone: 'error', text: 'Confirm that you physically recovered these parts first.' });
    if (recovered.length === 0) return setMessage({ tone: 'error', text: 'Add at least one recovered component.' });
    const now = new Date().toISOString();
    const items: InventoryItem[] = recovered.map((r) => {
      const c = COMPONENTS.find((x) => x.id === r.componentId)!;
      return {
        id: uid(),
        componentId: c.id,
        name: c.name,
        category: c.category,
        quantity: r.quantity,
        condition: r.condition,
        specs: c.specs,
        notes: '',
        source: `Recovered from ${device}`,
        addedAt: now,
      };
    });
    updateData((d) => withActivity({ ...d, inventory: [...items, ...d.inventory] }, `Recovered ${items.length} part type(s) from ${device}`));
    setMessage({ tone: 'success', text: `Added ${items.length} recovered part type(s) to your inventory.` });
    setRecovered([]);
    setConfirmed(false);
  };

  const groups: Record<Feasibility, typeof results> = {
    BUILD_NOW: results.filter((r) => r.feasibility === 'BUILD_NOW').sort((a, b) => b.matchPercent - a.matchPercent),
    SMALL_ADDITIONS: results.filter((r) => r.feasibility === 'SMALL_ADDITIONS').sort((a, b) => b.matchPercent - a.matchPercent),
    NOT_FEASIBLE: results.filter((r) => r.feasibility === 'NOT_FEASIBLE').sort((a, b) => b.matchPercent - a.matchPercent),
  };

  const sections: { key: Feasibility; title: string; body: string }[] = [
    { key: 'BUILD_NOW', title: 'A. Build Now', body: 'All required components are available, and no compatibility or verification item is open.' },
    { key: 'SMALL_ADDITIONS', title: 'B. Build With Small Additions', body: 'Feasible, with only a few missing components. Check verification notes before building.' },
    { key: 'NOT_FEASIBLE', title: 'C. Not Feasible Yet', body: 'Too many missing components, a critical part missing, or a major issue unresolved.' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Build What I Have"
        subtitle="Record the electronics you own, then discover what you can build with them."
        action={
          <Button onClick={() => setShowResults(true)} disabled={!hasInventory}>
            <Sparkles className="h-4 w-4" /> Discover What I Can Build
          </Button>
        }
      />

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Method A */}
        <Card className="xl:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-emerald-700" />
            <h2 className="font-semibold">Method A · Add components manually</h2>
          </div>

          <form onSubmit={submitEntry} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="cname">Component name</label>
              <input
                id="cname"
                list="component-options"
                className={inputCls}
                placeholder="Start typing, or enter a custom name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <datalist id="component-options">
                {COMPONENTS.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
              {catalogMatch && (
                <p className="mt-1 text-xs text-emerald-700">Matched to catalog: {catalogMatch.category}</p>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="ccat">Category</label>
              <select
                id="ccat"
                className={inputCls}
                disabled={!!catalogMatch}
                value={catalogMatch?.category ?? draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category}</p>}
            </div>

            <div>
              <label className={labelCls} htmlFor="cqty">Quantity available</label>
              <input id="cqty" type="number" min={1} className={inputCls} value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
              {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity}</p>}
            </div>

            <div>
              <label className={labelCls} htmlFor="ccond">Functional condition</label>
              <select id="ccond" className={inputCls} value={draft.condition}
                onChange={(e) => setDraft({ ...draft, condition: e.target.value as Condition })}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="cspecs">Specifications (optional)</label>
              <input id="cspecs" className={inputCls} value={draft.specs}
                onChange={(e) => setDraft({ ...draft, specs: e.target.value })}
                placeholder="e.g. 5V, 2 A" />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="cnotes">Notes (optional)</label>
              <input id="cnotes" className={inputCls} value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit">
                {editingId ? <><Save className="h-4 w-4" /> Update entry</> : <><Plus className="h-4 w-4" /> Add entry</>}
              </Button>
              {editingId && (
                <Button variant="secondary" onClick={resetDraft} type="button">Cancel edit</Button>
              )}
              <Button variant="ghost" type="button" onClick={clearForm}>
                <Eraser className="h-4 w-4" /> Clear form
              </Button>
            </div>
          </form>
        </Card>

        {/* Method B */}
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-700" />
            <h2 className="font-semibold">Method B · Discarded electronics</h2>
          </div>
          <Notice tone="warning">
            The app does not assume what a device contains. Add only the parts you have actually recovered and checked.
          </Notice>

          <div className="mt-4 space-y-4">
            <div>
              <label className={labelCls} htmlFor="device">Discarded item</label>
              <select id="device" className={inputCls} value={device} onChange={(e) => setDevice(e.target.value)}>
                {DEVICES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls} htmlFor="rcomp">Recovered component</label>
                <select id="rcomp" className={inputCls} value={pick.componentId}
                  onChange={(e) => setPick({ ...pick, componentId: e.target.value })}>
                  <option value="">Select a component</option>
                  {COMPONENTS.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="rqty">Quantity</label>
                <input id="rqty" type="number" min={1} className={inputCls} value={pick.quantity}
                  onChange={(e) => setPick({ ...pick, quantity: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="rcond">Condition</label>
                <select id="rcond" className={inputCls} value={pick.condition}
                  onChange={(e) => setPick({ ...pick, condition: e.target.value as Condition })}>
                  {CONDITIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={addRecovered}>
              <Plus className="h-4 w-4" /> Add to recovered list
            </Button>

            {recovered.length > 0 && (
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {recovered.map((r, idx) => {
                  const c = COMPONENTS.find((x) => x.id === r.componentId);
                  return (
                    <li key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{c?.name} × {r.quantity} <span className="text-xs text-stone-400">({r.condition})</span></span>
                      <button className="text-red-600 hover:underline"
                        onClick={() => setRecovered((list) => list.filter((_, i) => i !== idx))}>Remove</button>
                    </li>
                  );
                })}
              </ul>
            )}

            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I confirm these parts were physically recovered from the {device.toLowerCase()}.
            </label>
            <Button className="w-full" onClick={submitRecovered} disabled={recovered.length === 0 || !confirmed}>
              Add recovered components
            </Button>
          </div>
        </Card>
      </div>

      {/* Inventory table */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Your inventory</h2>
            <p className="text-xs text-stone-500">{data.inventory.length} entries · changes are saved automatically</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={loadSample}><Info className="h-4 w-4" /> Load sample kit</Button>
            <Button variant="secondary" onClick={saveInventory} disabled={!hasInventory}><Save className="h-4 w-4" /> Save inventory</Button>
            <Button variant="danger" onClick={clearAll} disabled={!hasInventory}><Trash2 className="h-4 w-4" /> Clear all</Button>
          </div>
        </div>

        {!hasInventory ? (
          <p className="py-8 text-center text-sm text-stone-500">No entries yet. Add components above or load the sample kit.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-3">Component</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Condition</th>
                  <th className="py-2 pr-3">Specs</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.inventory.map((item) => (
                  <tr key={item.id} className="align-middle">
                    <td className="py-2.5 pr-3 font-medium text-stone-900">{item.name}</td>
                    <td className="py-2.5 pr-3 text-stone-600">{item.category}</td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="number"
                        min={1}
                        aria-label={`Quantity of ${item.name}`}
                        className="w-20 rounded-lg border border-stone-300 px-2 py-1"
                        value={item.quantity}
                        onChange={(e) => changeQty(item.id, Number(e.target.value))}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={CONDITION_TONE[item.condition]}>{item.condition}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-stone-500">{item.specs || '—'}</td>
                    <td className="py-2.5 pr-3 text-xs text-stone-500">{item.source}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(item)} className="mr-3 inline-flex items-center gap-1 text-emerald-700 hover:underline">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => removeItem(item)} className="inline-flex items-center gap-1 text-red-600 hover:underline">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Results */}
      {showResults && (
        <section className="space-y-10 animate-fade-in">
          {sections.map((s) => (
            <div key={s.key}>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-stone-900">
                  {s.title} <span className="text-base font-medium text-stone-400">({groups[s.key].length})</span>
                </h2>
                <p className="text-sm text-stone-500">{s.body}</p>
              </div>
              {groups[s.key].length === 0 ? (
                <Card className="text-sm text-stone-500">No projects in this category for your current inventory.</Card>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {groups[s.key].map((r) => (
                    <ProjectCard key={r.project.id} result={r} hasInventory={hasInventory} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
