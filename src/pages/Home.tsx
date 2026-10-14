import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, Hammer, Leaf, ListChecks, Search, Target } from 'lucide-react';
import { Card, ProjectIcon, btnClass } from '../components/ui';
import { PROJECTS_BY_ID } from '../data/catalog';
import { formatINR } from '../lib/utils';

const FEATURES = [
  { icon: Cpu, title: 'Smart Component Matching', body: 'Compare your parts against a structured project catalog with transparent, quantity-based match scores.' },
  { icon: Hammer, title: 'Build With What You Have', body: 'See which projects you can build right now, and the smallest set of parts to add next.' },
  { icon: Leaf, title: 'Track Your Environmental Impact', body: 'Record completed projects to estimate reused electronics and cost savings. Figures are estimates.' },
];

const STEPS = [
  { icon: ListChecks, text: 'Enter the components you own.' },
  { icon: Target, text: 'Discover compatible projects.' },
  { icon: Search, text: 'Find missing components and their estimated costs.' },
  { icon: Hammer, text: 'Build useful products and track your impact.' },
];

const EXAMPLE_IDS = [
  'plant-watering',
  'weather-station',
  'smart-dustbin',
  'obstacle-robot',
  'led-emergency',
  'temp-monitor',
];

export function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-2">
        <div>
          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Circular electronics reuse
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight text-stone-900 md:text-5xl">
            Don't Waste Electronics. Build Something New.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-stone-600">
            Turn discarded electronic components into useful products with intelligent reuse recommendations.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/build" className={btnClass('primary')}>
              Start Building <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/projects" className={btnClass('secondary')}>
              Explore Projects
            </Link>
          </div>
          <p className="mt-4 text-xs text-stone-400">
            Demo mode: prices are reference estimates in INR, and data is stored in your browser.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {EXAMPLE_IDS.slice(0, 4).map((id) => {
            const p = PROJECTS_BY_ID[id];
            if (!p) return null;
            return (
              <div key={id} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <ProjectIcon icon={p.icon} className="h-14 w-14" />
                <p className="mt-3 text-sm font-semibold text-stone-900">{p.name}</p>
                <p className="text-xs text-stone-500">{p.difficulty} · {formatINR(p.newProductPrice)} new</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-stone-500">{f.body}</p>
          </Card>
        ))}
      </section>

      <section>
        <h2 className="text-2xl font-bold text-stone-900">How It Works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.text} className="rounded-2xl border border-emerald-100 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <s.icon className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-3 text-sm font-medium text-stone-700">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-stone-900">Example Projects</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLE_IDS.map((id) => {
            const p = PROJECTS_BY_ID[id];
            if (!p) return null;
            return (
              <Link
                key={id}
                to={`/projects/${id}`}
                className="group flex gap-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <ProjectIcon icon={p.icon} className="h-16 w-16" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-stone-900 group-hover:text-emerald-800">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-stone-500">{p.description}</p>
                  <p className="mt-2 text-xs font-medium text-emerald-700">{p.difficulty} · view details →</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl bg-emerald-800 px-6 py-12 text-center text-white md:px-12">
        <h2 className="text-3xl font-extrabold">Give Your Electronics a Second Life.</h2>
        <p className="mx-auto mt-3 max-w-xl text-emerald-100">
          Add what you own, see what you can build, and keep useful parts out of the bin.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/build" className={btnClass('secondary', 'border-white bg-white text-emerald-900 hover:bg-emerald-50')}>
            Start Building
          </Link>
          <Link to="/login" className={btnClass('ghost', 'text-white hover:bg-emerald-700')}>
            Sign in or try the demo
          </Link>
        </div>
      </section>
    </div>
  );
}
