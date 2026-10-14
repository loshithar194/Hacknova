import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle2, Boxes, Leaf, Wallet } from 'lucide-react';
import { Card, EmptyState, PageHeader, Stat, btnClass } from '../components/ui';
import { useApp } from '../lib/store';
import { completedProjects, impactSeries } from '../lib/impact';
import { PROJECTS_BY_ID } from '../data/catalog';
import { dateLabel, formatINR, formatWeight } from '../lib/utils';

export function Impact() {
  const { data } = useApp();
  const completed = completedProjects(data.savedProjects);
  const series = impactSeries(data.savedProjects);

  const componentsReused = completed.reduce(
    (s, p) => s + (p.reusedUnits ?? []).reduce((t, u) => t + u.quantity, 0),
    0,
  );
  const ewasteGrams = completed.reduce((s, p) => s + (p.reusedWeightGrams ?? 0), 0);
  const moneySaved = completed.reduce((s, p) => s + (p.reuseValue ?? 0), 0);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of completed) {
      for (const u of p.reusedUnits ?? []) map[u.category] = (map[u.category] ?? 0) + u.quantity;
    }
    return Object.entries(map).map(([category, quantity]) => ({ category, quantity }));
  }, [completed]);

  if (completed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Impact Dashboard" subtitle="Only completed projects are counted. Saved or planned projects are not." />
        <EmptyState
          title="Not enough data yet"
          body="Complete a project to start recording components reused, estimated e-waste diverted and cost savings."
          action={<Link to="/my-projects" className={btnClass('primary')}>Go to My Projects</Link>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Impact Dashboard" subtitle="Figures are estimates based on recorded component usage and configured weights." />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Projects completed" value={completed.length} icon={CheckCircle2} />
        <Stat label="Components reused" value={componentsReused} hint="Units across completed projects" icon={Boxes} />
        <Stat label="E-waste diverted" value={formatWeight(ewasteGrams)} hint="Estimate, configured weights" icon={Leaf} />
        <Stat label="Money saved (reuse)" value={formatINR(moneySaved)} hint="Estimate, value of reused parts" icon={Wallet} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Components reused by category</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="category" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="quantity" name="Units" fill="#047857" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Project completion history</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Line type="stepAfter" dataKey="completions" name="Cumulative completions" stroke="#0ea5e9" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Estimated cost savings over time</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Line type="monotone" dataKey="savings" name="Cumulative reuse value" stroke="#047857" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Estimated e-waste reused over time (kg)</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="kg" name="Cumulative kg" stroke="#d97706" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="font-semibold">Completed projects</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-3">Project</th>
                <th className="py-2 pr-3">Completed</th>
                <th className="py-2 pr-3">Units reused</th>
                <th className="py-2 pr-3">E-waste (est.)</th>
                <th className="py-2 pr-3">Reuse value</th>
                <th className="py-2 text-right">Saving vs new</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {completed.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 pr-3 font-medium">{PROJECTS_BY_ID[p.projectId]?.name ?? 'Unknown project'}</td>
                  <td className="py-2.5 pr-3">{dateLabel(p.completedAt)}</td>
                  <td className="py-2.5 pr-3">{(p.reusedUnits ?? []).reduce((s, u) => s + u.quantity, 0)}</td>
                  <td className="py-2.5 pr-3">{formatWeight(p.reusedWeightGrams ?? 0)}</td>
                  <td className="py-2.5 pr-3">{formatINR(p.reuseValue ?? 0)}</td>
                  <td className={`py-2.5 text-right ${(p.savingsAtCompletion ?? 0) < 0 ? 'text-red-600' : ''}`}>
                    {formatINR(p.savingsAtCompletion ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
