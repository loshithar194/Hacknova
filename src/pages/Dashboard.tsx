import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Boxes, Layers, Target, CheckCircle2, Wallet, Leaf, Hammer, Activity } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Stat } from '../components/ui';
import { ProjectCard } from '../components/ProjectCard';
import { useApp } from '../lib/store';
import { evaluateAll } from '../lib/matching';
import { impactSeries } from '../lib/impact';
import { formatINR, formatWeight, dateLabel } from '../lib/utils';

const COLORS = ['#047857', '#10b981', '#34d399', '#065f46', '#6ee7b7', '#d97706', '#0ea5e9', '#a7f3d0'];

export function Dashboard() {
  const { currentUser, data } = useApp();
  const hasInventory = data.inventory.length > 0;

  const results = useMemo(() => evaluateAll(data.inventory), [data.inventory]);

  const totalComponents = data.inventory.reduce((s, i) => s + i.quantity, 0);
  const categoryCount = new Set(data.inventory.map((i) => i.category)).size;
  const matched = results.filter((r) => r.feasibility !== 'NOT_FEASIBLE').length;
  const completed = data.savedProjects.filter((p) => p.status === 'completed');
  const moneySaved = completed.reduce((s, p) => s + (p.reuseValue ?? 0), 0);
  const ewasteGrams = completed.reduce((s, p) => s + (p.reusedWeightGrams ?? 0), 0);

  const distribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of data.inventory) map[i.category] = (map[i.category] ?? 0) + i.quantity;
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [data.inventory]);

  const recent = [...data.inventory].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 5);
  const recommended = [...results]
    .filter((r) => r.feasibility !== 'NOT_FEASIBLE')
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, 3);
  const series = impactSeries(data.savedProjects);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${currentUser?.name.split(' ')[0] ?? 'Maker'}`}
        subtitle="Your inventory, matches and reuse impact. Values come from your saved data only."
        action={
          <Link to="/build">
            <Button><Hammer className="h-4 w-4" /> Manage inventory</Button>
          </Link>
        }
      />

      {!hasInventory && (
        <EmptyState
          title="Your inventory is empty"
          body="Add components you own, or load a sample kit, to see matched projects and your summary figures."
          action={
            <Link to="/build">
              <Button>Add components</Button>
            </Link>
          }
        />
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Components" value={totalComponents} hint="Units in inventory" icon={Boxes} />
        <Stat label="Categories" value={categoryCount} icon={Layers} />
        <Stat label="Projects matched" value={matched} hint="Build now or with additions" icon={Target} />
        <Stat label="Completed" value={completed.length} icon={CheckCircle2} />
        <Stat label="Money saved" value={formatINR(moneySaved)} hint="Estimate, reused parts" icon={Wallet} />
        <Stat label="E-waste reused" value={formatWeight(ewasteGrams)} hint="Estimate, configured weights" icon={Leaf} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Inventory distribution</h2>
          {distribution.length === 0 ? (
            <p className="mt-6 text-sm text-stone-500">No inventory yet.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {distribution.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Environmental impact (estimate)</h2>
          {series.length === 0 ? (
            <p className="mt-6 text-sm text-stone-500">Not enough data yet. Complete a project to start tracking reuse.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="kg" name="E-waste reused (kg)" stroke="#047857" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Recently added</h2>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">Nothing added yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {recent.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="truncate pr-3">{i.name}</span>
                  <span className="shrink-0 font-semibold text-stone-700">× {i.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recommended projects</h2>
            <Link to="/projects" className="text-sm font-semibold text-emerald-700 hover:underline">See all</Link>
          </div>
          {recommended.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">No feasible projects yet. Add more components to get matches.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recommended.map((r) => (
                <ProjectCard key={r.project.id} result={r} hasInventory={hasInventory} />
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card>
        <h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4 text-emerald-700" /> Recent activity</h2>
        {data.activity.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Activity will appear here as you work.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {data.activity.slice(0, 8).map((a) => (
              <li key={a.id} className="flex justify-between gap-4 border-b border-stone-100 pb-2 last:border-0">
                <span>{a.text}</span>
                <span className="shrink-0 text-xs text-stone-400">{dateLabel(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
