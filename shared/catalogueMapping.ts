/** Maps database rows (snake_case) to app catalogue types. Shared by server and browser. */
import type { Component, Project } from '../src/types';

export function mapComponentRow(c: Record<string, any>): Component {
  return {
    id: String(c.id),
    name: String(c.name),
    category: String(c.category),
    description: c.description ?? '',
    unitPrice: Number(c.unit_price),
    weightGrams: Number(c.weight_grams),
    specs: c.specs ?? '',
    compatibility: c.compatibility ?? '',
  };
}

export function mapProductRow(p: Record<string, any>): Project {
  return {
    id: String(p.id),
    name: String(p.name),
    aliases: p.aliases ?? [],
    category: String(p.category),
    description: p.description ?? '',
    difficulty: p.difficulty,
    durationMinutes: Number(p.duration_minutes),
    newProductPrice: Number(p.new_product_price),
    consumablesCost: Number(p.consumables_cost),
    icon: p.icon,
    requiresSpecCheck: Boolean(p.requires_spec_check),
    instructions: p.instructions ?? [],
    safety: p.safety_notes ?? [],
    compatibilityNotes: p.compatibility_notes ?? [],
    requirements: (p.product_requirements ?? []).map((r: Record<string, any>) => ({
      componentId: String(r.component_id),
      quantity: Number(r.required_quantity),
      alternatives: r.compatible_alternatives ?? [],
      critical: Boolean(r.is_critical),
    })),
  };
}
