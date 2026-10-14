import { Link } from 'react-router-dom';
import { Clock, Gauge, Wallet, PiggyBank, Boxes, PackageOpen } from 'lucide-react';
import type { MatchResult } from '../lib/matching';
import { formatINR, formatMinutes } from '../lib/utils';
import { Badge, FeasibilityBadge, ProgressBar, ProjectIcon, btnClass } from './ui';

export function ProjectCard({ result, hasInventory }: { result: MatchResult; hasInventory: boolean }) {
  const { project } = result;
  const availableTypes = result.requirements.length - result.missingTypes;
  const tone = result.matchPercent >= 75 ? 'green' : result.matchPercent >= 40 ? 'amber' : 'red';

  return (
    <div className="flex flex-col rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-4">
        <ProjectIcon icon={project.icon} className="h-16 w-16" />
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug text-stone-900">{project.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-stone-500">{project.description}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-stone-700">Component match</span>
          <span className="font-bold text-emerald-800">{result.matchPercent}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar value={result.matchPercent} tone={tone} />
        </div>
        <p className="mt-1 text-xs text-stone-400">Quantity-based. Not a guarantee of compatibility.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {hasInventory ? (
          <FeasibilityBadge value={result.feasibility} />
        ) : (
          <Badge tone="gray">Add inventory to see status</Badge>
        )}
        <Badge tone="blue">{project.difficulty}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-stone-600">
          <Boxes className="h-4 w-4 text-emerald-700" />
          <span>{availableTypes} / {result.requirements.length} types available</span>
        </div>
        <div className="flex items-center gap-2 text-stone-600">
          <PackageOpen className="h-4 w-4 text-amber-600" />
          <span>{result.missingTypes} types missing</span>
        </div>
        <div className="flex items-center gap-2 text-stone-600">
          <Wallet className="h-4 w-4 text-emerald-700" />
          <span>{formatINR(result.additionalCost)} extra</span>
        </div>
        <div className="flex items-center gap-2 text-stone-600">
          <PiggyBank className="h-4 w-4 text-emerald-700" />
          <span>{formatINR(result.reuseValue)} reused</span>
        </div>
        <div className="flex items-center gap-2 text-stone-600">
          <Clock className="h-4 w-4 text-stone-400" />
          <span>{formatMinutes(project.durationMinutes)}</span>
        </div>
        <div className="flex items-center gap-2 text-stone-600">
          <Gauge className="h-4 w-4 text-stone-400" />
          <span>{project.difficulty}</span>
        </div>
      </dl>

      <Link to={`/projects/${project.id}`} className={btnClass('primary', 'mt-5 w-full')}>
        View Details
      </Link>
    </div>
  );
}
