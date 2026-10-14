import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Play, Flag, Trash2, Eye, ListTodo } from 'lucide-react';
import { Badge, Button, Card, EmptyState, FeasibilityBadge, Notice, PageHeader, ProgressBar, ProjectIcon, btnClass } from '../components/ui';
import { useApp } from '../lib/store';
import { useProjectActions } from '../lib/actions';
import { PROJECTS_BY_ID } from '../data/catalog';
import { evaluateProject } from '../lib/matching';
import { STATUS_LABEL, dateLabel, formatINR, formatWeight } from '../lib/utils';
import type { ProjectStatus, SavedProject } from '../types';

const TABS: ProjectStatus[] = ['saved', 'planned', 'in_progress', 'completed'];

export function MyProjects() {
  const { data } = useApp();
  const actions = useProjectActions();
  const [tab, setTab] = useState<ProjectStatus>('saved');
  const [message, setMessage] = useState<string | null>(null);

  const counts = TABS.reduce<Record<ProjectStatus, number>>((acc, t) => {
    acc[t] = data.savedProjects.filter((p) => p.status === t).length;
    return acc;
  }, { saved: 0, planned: 0, in_progress: 0, completed: 0 });

  const list = data.savedProjects.filter((p) => p.status === tab);

  const remove = (s: SavedProject, name: string) => {
    if (!window.confirm(`Delete "${name}" from My Projects? This cannot be undone.`)) return;
    actions.removeProject(s.projectId, name);
    setMessage(`Deleted "${name}".`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Projects" subtitle="Track saved, planned, in-progress and completed builds." />

      {message && <Notice tone="info">{message}</Notice>}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === t ? 'bg-emerald-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
            }`}
          >
            {STATUS_LABEL[t]} <span className="opacity-70">({counts[t]})</span>
          </button>
        ))}
      </div>

      {data.savedProjects.length === 0 && (
        <EmptyState
          title="No saved projects yet"
          body="Save a project from Projects or Build What I Have to start tracking it here."
          action={<Link to="/projects" className={btnClass('primary')}>Browse projects</Link>}
        />
      )}

      {data.savedProjects.length > 0 && list.length === 0 && (
        <Card className="text-center text-sm text-stone-500">Nothing in {STATUS_LABEL[tab]} right now.</Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {list.map((s) => {
          const project = PROJECTS_BY_ID[s.projectId];
          if (!project) return null;
          const current = evaluateProject(project, data.inventory);
          return (
            <Card key={s.id} className="flex flex-col">
              <div className="flex gap-4">
                <ProjectIcon icon={project.icon} className="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-stone-900">{project.name}</h3>
                    <Badge tone={s.status === 'completed' ? 'green' : s.status === 'in_progress' ? 'blue' : 'gray'}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-500">Saved {dateLabel(s.savedAt)}{s.startedAt ? ` · started ${dateLabel(s.startedAt)}` : ''}{s.completedAt ? ` · completed ${dateLabel(s.completedAt)}` : ''}</p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-stone-500">Match at save</dt><dd className="font-semibold">{s.matchAtSave}%</dd></div>
                <div><dt className="text-xs text-stone-500">Match now</dt><dd className="font-semibold">{current.matchPercent}%</dd></div>
                <div><dt className="text-xs text-stone-500">Missing types now</dt><dd className="font-semibold">{current.missingTypes}</dd></div>
                <div><dt className="text-xs text-stone-500">Est. build cost (at save)</dt><dd className="font-semibold">{formatINR(s.costAtSave)}</dd></div>
              </dl>

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-stone-500">
                  <span>Progress</span><span>{s.progress}%</span>
                </div>
                <ProgressBar value={s.progress} />
                {s.status !== 'completed' && (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={s.progress}
                    aria-label={`Progress for ${project.name}`}
                    onChange={(e) => actions.setProgress(s.projectId, Number(e.target.value))}
                    className="mt-2 w-full accent-emerald-700"
                  />
                )}
              </div>

              {s.status === 'completed' && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                  Reused about <strong>{formatWeight(s.reusedWeightGrams ?? 0)}</strong> of electronics (estimate) · reuse value {formatINR(s.reuseValue ?? 0)} · saving vs new {formatINR(s.savingsAtCompletion ?? 0)}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                {s.status === 'saved' && (
                  <Button variant="secondary" onClick={() => { actions.planProject(project); setMessage(`Moved "${project.name}" to Planned.`); }}>
                    <ListTodo className="h-4 w-4" /> Move to Planned
                  </Button>
                )}
                {(s.status === 'saved' || s.status === 'planned') && (
                  <Button onClick={() => { actions.startProject(project); setMessage(`Started "${project.name}".`); }}>
                    <Play className="h-4 w-4" /> Start project
                  </Button>
                )}
                {s.status === 'in_progress' && (
                  <Button onClick={() => {
                    if (!window.confirm(`Mark "${project.name}" as completed? Impact will be recorded from the parts you currently own.`)) return;
                    actions.completeProject(project, current);
                    setMessage(`Completed "${project.name}". Impact updated.`);
                  }}>
                    <Flag className="h-4 w-4" /> Mark as completed
                  </Button>
                )}
                <Link to={`/projects/${project.id}`} className={btnClass('ghost')}>
                  <Eye className="h-4 w-4" /> View results
                </Link>
                <button onClick={() => remove(s, project.name)} className={btnClass('ghost', 'text-red-600 hover:bg-red-50')}>
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
              {s.status !== 'completed' && (
                <p className="mt-3 text-xs text-stone-400 flex items-center gap-1">
                  <ClipboardList className="h-3 w-3" />
                  <FeasibilityBadge value={current.feasibility} />
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
