import type { InventoryItem } from '../types';
import type { MatchResult } from './matching';
import { formatINR } from './utils';

/**
 * Rule-based demo advisor. It never calls an AI API. Every answer is derived from
 * the user's inventory and the project catalog evaluation results.
 */
export function answerQuestion(question: string, inventory: InventoryItem[], results: MatchResult[]): string {
  const q = question.toLowerCase();

  if (inventory.length === 0) {
    return 'Your inventory is empty, so I cannot compare projects against your parts yet. Add components in "Build What I Have", or load the sample kit, then ask again.';
  }

  if (/missing|lack|shopping|need to buy|what .*need/.test(q)) {
    const target = [...results].sort((a, b) => a.missingUnits - b.missingUnits)[0];
    if (!target) return 'No project data is available.';
    const missing = target.requirements.filter((r) => r.missing > 0);
    if (missing.length === 0) return `You already have all the parts for ${target.project.name}.`;
    const list = missing.map((r) => `${r.missing} × ${r.name}`).join(', ');
    return `The project closest to completion is ${target.project.name}. You are missing: ${list}. Estimated cost of the missing parts is ${formatINR(target.additionalCost)} (demo reference prices).`;
  }

  if (/cheap|cost|budget|save|money|price/.test(q)) {
    const top = [...results].sort((a, b) => a.additionalCost - b.additionalCost).slice(0, 3);
    const list = top
      .map((r) => `${r.project.name} (${formatINR(r.additionalCost)} extra, ${r.matchPercent}% match)`)
      .join('; ');
    return `Projects with the lowest additional cost for your inventory: ${list}. Reusing parts you already own is the biggest saving, because owned units are excluded from the additional cost.`;
  }

  if (/beginner|easy|easiest|simple/.test(q)) {
    const beginner = results
      .filter((r) => r.project.difficulty === 'Beginner')
      .sort((a, b) => b.matchPercent - a.matchPercent);
    if (beginner.length === 0) return 'No beginner projects are in the catalog.';
    return `Beginner projects, best match first: ${beginner
      .map((r) => `${r.project.name} (${r.matchPercent}% match)`)
      .join('; ')}.`;
  }

  if (/reus|reusable|my parts|have|own|inventory/.test(q)) {
    const working = inventory.filter((i) => i.condition === 'Working');
    const testing = inventory.filter((i) => i.condition === 'Needs testing');
    const broken = inventory.filter((i) => i.condition === 'Not working');
    const parts = (items: InventoryItem[]) => items.map((i) => `${i.quantity} × ${i.name}`).join(', ');
    let text = working.length
      ? `Marked Working and reusable: ${parts(working)}.`
      : 'None of your entries are marked Working yet.';
    if (testing.length) text += ` These need testing before use: ${parts(testing)}.`;
    if (broken.length) text += ` These are excluded from matching: ${parts(broken)}.`;
    return text;
  }

  if (/build|can i|what can|make|project|arduino|sensor/.test(q)) {
    const pool = /arduino/.test(q)
      ? results.filter((r) => r.project.requirements.some((req) => req.componentId === 'arduino-uno'))
      : results;
    const buildable = pool.filter((r) => r.feasibility === 'BUILD_NOW');
    const nearly = pool.filter((r) => r.feasibility === 'SMALL_ADDITIONS');
    if (buildable.length) {
      return `You can build now: ${buildable.map((r) => r.project.name).join(', ')}. Check the verification notes on each project before construction.`;
    }
    if (nearly.length) {
      return `Nothing is Build Now yet. These need only small additions: ${nearly
        .map((r) => `${r.project.name} (${r.missingUnits} unit(s) missing)`)
        .join('; ')}.`;
    }
    return 'No project in the catalog is feasible with your current inventory. Try loading the sample kit or adding more components.';
  }

  return 'I can only answer from the project catalog and your inventory. Try asking which projects you can build, what you are missing, how to reduce cost, which of your parts are reusable, or which project is easiest for a beginner.';
}
