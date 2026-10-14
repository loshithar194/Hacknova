import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Play, Flag, Pencil, ShoppingCart, ShieldAlert, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, FeasibilityBadge, Notice, ProgressBar, ProjectIcon, Stat, btnClass } from '../components/ui';
import { useApp } from '../lib/store';
import { useProjectActions } from '../lib/actions';
import { PROJECTS_BY_ID } from '../data/catalog';
import { evaluateProject } from '../lib/matching';
import { STATUS_LABEL, formatINR, formatMinutes, formatWeight, dateLabel } from '../lib/utils';

type Msg = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function ProjectDetail() {
  const { id } = useParams();
  const { currentUser, data } = useApp();
  const actions = useProjectActions();
  const navigate = useNavigate();
  const [message, setMessage] = useState<Msg>(null);

  const project = id ? PROJECTS_BY_ID[id] : undefined;
  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        body="This project is not in the catalog."
        action={<Link to="/projects" className={btnClass('primary')}>Back to projects</Link>}
      />
    );
  }

  const result = evaluateProject(project, data.inventory);
  const saved = data.savedProjects.find((p) => p.projectId === project.id);
  const hasInventory = data.inventory.length > 0;

  const handleSave = () => {
    const outcome = actions.saveProject(project, result);
    if (outcome === 'signin') setMessage({ tone: 'info', text: 'Sign in to save projects.' });
    else if (outcome === 'duplicate') setMessage({ tone: 'info', text: 'This project is already saved.' });
    else setMessage({ tone: 'success', text: 'Project saved to My Projects.' });
  };

  const handleComplete = () => {
    if (!window.confirm('Mark this project as completed? Reuse impact will be recorded from the parts you currently own. Inventory quantities are not reduced automatically.')) return;
    actions.completeProject(project, result);
    setMessage({ tone: 'success', text: 'Marked as completed. Impact dashboard updated.' });
  };

  const requirementRows = result.requirements;
  const warnings = result.warnings;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-4 w-4" /> Back to recommendations
      </button>

      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <ProjectIcon icon={project.icon} className="h-24 w-24" />
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{project.category}</p>
          <h1 className="text-3xl font-bold text-stone-900">{project.name}</h1>
          <p className="mt-2 max-w-2xl text-stone-600">{project.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasInventory ? <FeasibilityBadge value={result.feasibility} /> : <Badge>Add inventory to see status</Badge>}
            <Badge tone="blue">{project.difficulty}</Badge>
            <Badge>{formatMinutes(project.durationMinutes)}</Badge>
            {saved && <Badge tone="green">{STATUS_LABEL[saved.status]}</Badge>}
          </div>
        </div>
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Component match" value={`${result.matchPercent}%`} hint="Quantity-based" />
        <Stat label="Parts available" value={`${result.fullTypes} / ${requirementRows.length}`} hint="Component types fully covered" />
        <Stat label="Est. extra cost" value={formatINR(result.additionalCost)} hint="Demo reference prices" />
        <Stat label="Est. reuse value" value={formatINR(result.reuseValue)} hint="Value of parts you own" />
      </section>

      {/* Requirements */}
      <Card>
        <h2 className="mb-4 font-semibold">Component requirements</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-3">Component</th>
                <th className="py-2 pr-3">Required</th>
                <th className="py-2 pr-3">Available</th>
                <th className="py-2 pr-3">Usable</th>
                <th className="py-2 pr-3">Missing</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Unit price (est.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {requirementRows.map((r) => (
                <tr key={r.componentId}>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-stone-900">{r.name}</span>
                    {r.critical && <Badge tone="red">critical</Badge>}
                    {r.alternativeName && <p className="text-xs text-amber-700">Using {r.alternativeName} as substitute</p>}
                  </td>
                  <td className="py-2.5 pr-3">{r.required}</td>
                  <td className="py-2.5 pr-3">{r.available}</td>
                  <td className="py-2.5 pr-3">{r.usable}</td>
                  <td className="py-2.5 pr-3 font-semibold">{r.missing}</td>
                  <td className="py-2.5 pr-3">
                    {r.state === 'full' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Available</span>}
                    {r.state === 'partial' && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-4 w-4" /> Partial</span>}
                    {r.state === 'missing' && <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" /> Missing</span>}
                  </td>
                  <td className="py-2.5 text-right">{formatINR(r.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2"><Badge tone="green">{result.fullTypes} full</Badge></div>
          <div className="flex items-center gap-2"><Badge tone="amber">{result.partialTypes} partial</Badge></div>
          <div className="flex items-center gap-2"><Badge tone="red">{result.missingTypes} with missing units</Badge></div>
          <div className="flex items-center gap-2"><Badge>{result.unverifiedCount} verification items</Badge></div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Feasibility explanation and warnings */}
        <Card>
          <h2 className="mb-3 font-semibold">Why this result</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-stone-600">
            {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <h3 className="mt-5 text-sm font-semibold">Compatibility and verification</h3>
          {warnings.length === 0 && project.compatibilityNotes.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">No compatibility notes for this project.</p>
          ) : (
            <div className="mt-2 space-y-3">
              {warnings.length > 0 && (
                <Notice tone="warning">
                  <ul className="list-disc space-y-1 pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </Notice>
              )}
              <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
                {project.compatibilityNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          {project.requiresSpecCheck && (
            <div className="mt-4">
              <Notice tone="warning">
                Electrical specifications must be verified against each part’s datasheet before construction.
              </Notice>
            </div>
          )}
        </Card>

        {/* Cost */}
        <Card>
          <h2 className="mb-3 font-semibold">Cost and savings (estimates)</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              <tr><td className="py-2">Additional component cost</td><td className="py-2 text-right">{formatINR(result.additionalCost)}</td></tr>
              <tr><td className="py-2">Consumables and extras</td><td className="py-2 text-right">{formatINR(project.consumablesCost)}</td></tr>
              <tr className="font-semibold"><td className="py-2">Estimated total build cost</td><td className="py-2 text-right">{formatINR(result.buildCost)}</td></tr>
              <tr><td className="py-2">Comparable new product (approx.)</td><td className="py-2 text-right">{formatINR(result.newProductPrice)}</td></tr>
              <tr className="font-semibold">
                <td className="py-2">Estimated saving vs new product</td>
                <td className={`py-2 text-right ${result.savingsVsNew < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatINR(result.savingsVsNew)}</td>
              </tr>
              <tr><td className="py-2">Value of owned parts reused</td><td className="py-2 text-right">{formatINR(result.reuseValue)}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-stone-400">
            Demo reference prices in INR. These are not live market prices. The new-product figure is an approximate entry-level equivalent.
          </p>
          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-900">Environmental impact (estimate)</p>
            <p className="mt-1 text-emerald-900">
              Owned parts in this build weigh about <strong>{formatWeight(result.reusedWeightGrams)}</strong>, based on configured per-unit weight estimates. This is not independently verified.
            </p>
          </div>
        </Card>
      </div>

      {/* Instructions and safety */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Step-by-step build instructions</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-stone-700">
            {project.instructions.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="mt-4 text-xs text-stone-400">Adapt steps to the specific parts you own. Verify all wiring against datasheets.</p>
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" /> Safety precautions</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-stone-700">
            {project.safety.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Card>
      </div>

      {/* Saved status and actions */}
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">Project status</h2>
            {saved ? (
              <>
                <p className="text-sm text-stone-600">
                  Status: <strong>{STATUS_LABEL[saved.status]}</strong> · saved {dateLabel(saved.savedAt)} at {saved.matchAtSave}% match
                </p>
                <div className="mt-2 w-64"><ProgressBar value={saved.progress} /></div>
              </>
            ) : (
              <p className="text-sm text-stone-500">Not saved yet. Save it to track progress in My Projects.</p>
            )}
            {!currentUser && (
              <p className="mt-2 text-sm text-amber-800">
                <Link to="/login" className="font-semibold underline">Sign in</Link> to save projects.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!saved && (
              <Button onClick={handleSave} disabled={!currentUser}><Save className="h-4 w-4" /> Save Project</Button>
            )}
            {saved && saved.status !== 'in_progress' && saved.status !== 'completed' && (
              <Button onClick={() => { actions.startProject(project); setMessage({ tone: 'success', text: 'Marked as In Progress.' }); }}>
                <Play className="h-4 w-4" /> Mark as In Progress
              </Button>
            )}
            {saved && saved.status !== 'completed' && (
              <Button variant="secondary" onClick={handleComplete}><Flag className="h-4 w-4" /> Mark as Completed</Button>
            )}
            <Link to="/build" className={btnClass('secondary')}><Pencil className="h-4 w-4" /> Edit Inventory</Link>
            <Link to={`/components?project=${project.id}`} className={btnClass('secondary')}>
              <ShoppingCart className="h-4 w-4" /> Find missing parts
            </Link>
            <Link to="/projects" className={btnClass('ghost')}>Back to Recommendations</Link>
          </div>
        </div>
        {!hasInventory && (
          <p className="mt-4 text-sm text-stone-500">Your inventory is empty. Showing the full component list for this project.</p>
        )}
      </Card>
    </div>
  );
}
