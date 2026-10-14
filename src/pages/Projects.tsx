import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertTriangle, Search, Save, Boxes } from 'lucide-react';
import { Badge, Button, Card, FeasibilityBadge, Notice, PageHeader, ProgressBar, btnClass, inputCls, labelCls } from '../components/ui';
import { ProjectCard } from '../components/ProjectCard';
import { useApp } from '../lib/store';
import { useProjectActions } from '../lib/actions';
import { PROJECTS } from '../data/catalog';
import { evaluateAll, type MatchResult } from '../lib/matching';
import { formatINR, formatMinutes } from '../lib/utils';
import { pageSlice, nextVisibleCount } from '../../shared/pagination';

const PAGE_SIZE = 6;

type Msg = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function Projects() {
  const { data } = useApp();
  const actions = useProjectActions();
  const navigate = useNavigate();
  const hasInventory = data.inventory.length > 0;
  const results = useMemo(() => evaluateAll(data.inventory), [data.inventory]);

  // "What do you want to build?"
  const [nameQuery, setNameQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customIdea, setCustomIdea] = useState('');
  const [customMatches, setCustomMatches] = useState<typeof PROJECTS | null>(null);
  const [message, setMessage] = useState<Msg>(null);

  // Catalog filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [difficulty, setDifficulty] = useState('All');
  const [feasibility, setFeasibility] = useState('All');
  const [sort, setSort] = useState<'match' | 'cost' | 'name'>('match');

  const categories = [...new Set(PROJECTS.map((p) => p.category))];
  const selected: MatchResult | null = selectedId
    ? results.find((r) => r.project.id === selectedId) ?? null
    : null;

  const pickProject = (id: string) => {
    setSelectedId(id);
    setCustomMatches(null);
    setMessage(null);
  };

  const findByName = () => {
    const t = nameQuery.trim().toLowerCase();
    if (!t) return setMessage({ tone: 'error', text: 'Enter a project name, or pick one from the suggestions.' });
    const exact = PROJECTS.find((p) => p.name.toLowerCase() === t || p.aliases.some((a) => a.toLowerCase() === t));
    const partial = PROJECTS.find((p) => [p.name, ...p.aliases].some((a) => a.toLowerCase().includes(t)));
    const found = exact ?? partial;
    if (found) pickProject(found.id);
    else {
      setSelectedId(null);
      setMessage({ tone: 'info', text: `No catalog project matches "${nameQuery}". Try a custom idea below.` });
    }
  };

  const findCustom = () => {
    const words = customIdea.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    if (words.length === 0) return setMessage({ tone: 'error', text: 'Describe your idea in a few words.' });
    const matches = PROJECTS.filter((p) => {
      const hay = [p.name, p.description, p.category, ...p.aliases].join(' ').toLowerCase();
      return words.some((w) => hay.includes(w));
    });
    setSelectedId(null);
    setCustomMatches(matches);
    setMessage(
      matches.length
        ? { tone: 'info', text: `Found ${matches.length} related catalog project(s).` }
        : {
            tone: 'info',
            text: 'No catalog project matches this idea. Custom ideas cannot be priced automatically. Add their parts manually in Build What I Have.',
          },
    );
  };

  const handleSave = (r: MatchResult) => {
    const outcome = actions.saveProject(r.project, r);
    if (outcome === 'signin') setMessage({ tone: 'info', text: 'Sign in to save projects to your account.' });
    else if (outcome === 'duplicate') setMessage({ tone: 'info', text: `"${r.project.name}" is already in My Projects.` });
    else setMessage({ tone: 'success', text: `Saved "${r.project.name}" to My Projects.` });
  };

  const filtered = results
    .filter((r) => {
      const p = r.project;
      if (search && !`${p.name} ${p.aliases.join(' ')} ${p.description}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== 'All' && p.category !== category) return false;
      if (difficulty !== 'All' && p.difficulty !== difficulty) return false;
      if (hasInventory && feasibility !== 'All' && r.feasibility !== feasibility) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'match') return b.matchPercent - a.matchPercent;
      if (sort === 'cost') return a.additionalCost - b.additionalCost;
      return a.project.name.localeCompare(b.project.name);
    });

  const selectedSaved = selectedId ? actions.isSaved(selectedId) : false;

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [search, category, difficulty, feasibility, sort]);
  const { visible: shown, remaining } = pageSlice(filtered, visibleCount);

  return (
    <div className="space-y-8">
      <PageHeader title="Projects" subtitle="Find a project to build, or see every project matched to your inventory." />

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card>
        <h2 className="text-lg font-semibold">What do you want to build?</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="pname">Project name</label>
            <div className="flex gap-2">
              <input
                id="pname"
                className={inputCls}
                placeholder="e.g. Smart Dustbin"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findByName()}
              />
              <Button onClick={findByName}><Search className="h-4 w-4" /> Find</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PROJECTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setNameQuery(p.name); pickProject(p.id); }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    selectedId === p.id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="idea">Or describe a custom product idea</label>
            <div className="flex gap-2">
              <input
                id="idea"
                className={inputCls}
                placeholder="e.g. a plant monitor with temperature"
                value={customIdea}
                onChange={(e) => setCustomIdea(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findCustom()}
              />
              <Button variant="secondary" onClick={findCustom}>Search</Button>
            </div>
            {customMatches && customMatches.length > 0 && (
              <ul className="mt-3 space-y-2">
                {customMatches.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => pickProject(p.id)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-left text-sm hover:border-emerald-300 hover:bg-emerald-50">
                      {p.name} <span className="text-stone-400">· {p.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected && (
          <div className="mt-6 space-y-5 border-t border-stone-100 pt-6 animate-fade-in">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{selected.project.name}</h3>
                <p className="text-sm text-stone-500">{selected.project.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {hasInventory ? <FeasibilityBadge value={selected.feasibility} /> : <Badge>Inventory empty: showing full component list</Badge>}
                  <Badge tone="blue">{selected.project.difficulty}</Badge>
                  <Badge>{formatMinutes(selected.project.durationMinutes)}</Badge>
                </div>
              </div>
              <div className="w-full md:w-64">
                <div className="flex justify-between text-sm"><span>Match</span><span className="font-bold">{selected.matchPercent}%</span></div>
                <ProgressBar value={selected.matchPercent} />
              </div>
            </div>

            {selected.warnings.length > 0 && (
              <Notice tone="warning">
                <ul className="list-disc space-y-1 pl-5">
                  {selected.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </Notice>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="py-2 pr-3">Component</th>
                    <th className="py-2 pr-3">Required</th>
                    <th className="py-2 pr-3">You have</th>
                    <th className="py-2 pr-3">Usable</th>
                    <th className="py-2 pr-3">Missing</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Est. cost of missing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selected.requirements.map((r) => (
                    <tr key={r.componentId}>
                      <td className="py-2.5 pr-3 font-medium">{r.name}</td>
                      <td className="py-2.5 pr-3">{r.required}</td>
                      <td className="py-2.5 pr-3">{r.available}</td>
                      <td className="py-2.5 pr-3">{r.usable}</td>
                      <td className="py-2.5 pr-3">{r.missing}</td>
                      <td className="py-2.5 pr-3">
                        {r.state === 'full' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Available</span>}
                        {r.state === 'partial' && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-4 w-4" /> Partial</span>}
                        {r.state === 'missing' && <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" /> Missing</span>}
                      </td>
                      <td className="py-2.5 text-right">{r.missing > 0 ? formatINR(r.missing * r.unitPrice) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="text-xs text-stone-500">Est. additional cost</p>
                <p className="text-lg font-bold">{formatINR(selected.additionalCost)}</p>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="text-xs text-stone-500">Est. build cost (incl. consumables)</p>
                <p className="text-lg font-bold">{formatINR(selected.buildCost)}</p>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="text-xs text-stone-500">Est. saving vs new product</p>
                <p className={`text-lg font-bold ${selected.savingsVsNew < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatINR(selected.savingsVsNew)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => navigate(`/components?project=${selected.project.id}`)}>
                <Boxes className="h-4 w-4" /> Find Components
              </Button>
              <Button onClick={() => handleSave(selected)} disabled={selectedSaved}>
                <Save className="h-4 w-4" /> {selectedSaved ? 'Already saved' : 'Save Project'}
              </Button>
              <Link to={`/projects/${selected.project.id}`} className={btnClass('ghost')}>View full details →</Link>
            </div>
          </div>
        )}
      </Card>

      {/* Catalog */}
      <section>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-bold text-stone-900">Project catalog</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <input className={`${inputCls} md:col-span-2`} placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              <option value="All">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className={inputCls} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Filter by difficulty">
              <option value="All">All difficulty</option>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
            <select className={inputCls} value={feasibility} disabled={!hasInventory} onChange={(e) => setFeasibility(e.target.value)} aria-label="Filter by feasibility">
              <option value="All">All feasibility</option>
              <option value="BUILD_NOW">Build Now</option>
              <option value="SMALL_ADDITIONS">Small Additions</option>
              <option value="NOT_FEASIBLE">Not Feasible Yet</option>
            </select>
            <select className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="match">Sort: best match</option>
              <option value="cost">Sort: lowest extra cost</option>
              <option value="name">Sort: name</option>
            </select>
          </div>
        </div>

        {!hasInventory && (
          <p className="mb-4 text-sm text-stone-500">
            Your inventory is empty, so matches show 0%. <Link to="/build" className="font-semibold text-emerald-700 hover:underline">Add components</Link> to see personalised results.
          </p>
        )}

        {filtered.length === 0 ? (
          <Card className="text-center text-sm text-stone-500">No projects match these filters.</Card>
        ) : (
          <>
            <p className="mb-3 text-xs text-stone-500">Showing {shown.length} of {filtered.length} projects</p>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((r) => (
                <ProjectCard key={r.project.id} result={r} hasInventory={hasInventory} />
              ))}
            </div>
            {remaining > 0 && (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => setVisibleCount((c) => nextVisibleCount(c, PAGE_SIZE, filtered.length))}>
                  Load more ({remaining} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
