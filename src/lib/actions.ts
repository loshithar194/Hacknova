import type { Project, ProjectStatus, SavedProject } from '../types';
import type { MatchResult } from './matching';
import { useApp, withActivity } from './store';
import { uid } from './utils';

export type SaveOutcome = 'saved' | 'duplicate' | 'signin';

/** Shared mutations for saved projects. Duplicate saves are blocked per user and project. */
export function useProjectActions() {
  const { currentUser, data, updateData } = useApp();
  const now = () => new Date().toISOString();

  const patch = (projectId: string, changes: Partial<SavedProject>, activity?: string) =>
    updateData((d) => {
      const next = {
        ...d,
        savedProjects: d.savedProjects.map((p) => (p.projectId === projectId ? { ...p, ...changes } : p)),
      };
      return activity ? withActivity(next, activity) : next;
    });

  return {
    isSaved: (projectId: string) => data.savedProjects.some((p) => p.projectId === projectId),

    saveProject(project: Project, result: MatchResult): SaveOutcome {
      if (!currentUser) return 'signin';
      if (data.savedProjects.some((p) => p.projectId === project.id)) return 'duplicate';
      updateData((d) =>
        withActivity(
          {
            ...d,
            savedProjects: [
              {
                id: uid(),
                projectId: project.id,
                status: 'saved' as ProjectStatus,
                progress: 0,
                matchAtSave: result.matchPercent,
                costAtSave: result.buildCost,
                savedAt: now(),
              },
              ...d.savedProjects,
            ],
          },
          `Saved "${project.name}"`,
        ),
      );
      return 'saved';
    },

    startProject: (project: Project) =>
      patch(project.id, { status: 'in_progress', startedAt: now() }, `Started "${project.name}"`),

    planProject: (project: Project) => patch(project.id, { status: 'planned' }, `Planned "${project.name}"`),

    setProgress: (projectId: string, progress: number) => patch(projectId, { progress }),

    completeProject: (project: Project, result: MatchResult) =>
      patch(
        project.id,
        {
          status: 'completed',
          progress: 100,
          completedAt: now(),
          reuseValue: result.reuseValue,
          reusedWeightGrams: result.reusedWeightGrams,
          savingsAtCompletion: result.savingsVsNew,
          reusedUnits: result.requirements
            .filter((r) => r.usable > 0)
            .map((r) => ({
              componentId: r.componentId,
              name: r.name,
              category: r.category,
              quantity: r.usable,
              weightGrams: r.weightGrams,
              unitPrice: r.unitPrice,
            })),
        },
        `Completed "${project.name}"`,
      ),

    removeProject: (projectId: string, name: string) =>
      updateData((d) =>
        withActivity(
          { ...d, savedProjects: d.savedProjects.filter((p) => p.projectId !== projectId) },
          `Deleted saved project "${name}"`,
        ),
      ),
  };
}
