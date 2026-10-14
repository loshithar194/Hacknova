/**
 * Shared e-waste submission rules. Imported by the browser form AND the server,
 * so validation is identical on both sides. The server is the authority.
 */
export const DEVICE_TYPES = [
  'Computer',
  'Printer',
  'Router',
  'Toy',
  'Electronics kit',
  'Circuit board',
  'Phone',
  'Other',
] as const;

export const DEVICE_CONDITIONS = ['Working', 'Partly working', 'Not working', 'Unknown'] as const;
export const COMPONENT_CONDITIONS = ['Working', 'Needs testing', 'Not working'] as const;
export const SUBMISSION_STATUSES = ['pending', 'under_review', 'accepted', 'rejected', 'needs_info'] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];
export type DeviceCondition = (typeof DEVICE_CONDITIONS)[number];
export type ComponentCondition = (typeof COMPONENT_CONDITIONS)[number];
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const LIMITS = {
  brandMax: 60,
  modelMax: 80,
  notesMax: 500,
  ageMin: 0,
  ageMax: 50,
  quantityMin: 1,
  quantityMax: 999,
  componentsMin: 1,
  componentsMax: 50,
  reviewerNotesMax: 1000,
} as const;

export interface SubmissionComponentInput {
  componentId: string;
  quantity: number;
  condition: ComponentCondition;
}

export interface SubmissionInput {
  deviceType: DeviceType;
  brand: string;
  model: string | null;
  condition: DeviceCondition;
  ageYears: number;
  availableComponents: SubmissionComponentInput[];
  notes: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates an untrusted submission payload. `knownComponentIds` comes from the live catalogue. */
export function validateSubmission(
  raw: unknown,
  knownComponentIds: ReadonlySet<string>,
): ValidationResult<SubmissionInput> {
  const errors: Record<string, string> = {};
  if (!isObj(raw)) return { ok: false, errors: { body: 'Request body must be a JSON object.' } };

  const deviceType = raw.deviceType;
  if (!(DEVICE_TYPES as readonly unknown[]).includes(deviceType)) errors.deviceType = 'Choose a device type from the list.';

  const brand = typeof raw.brand === 'string' ? raw.brand.trim() : '';
  if (!brand) errors.brand = 'Brand is required.';
  else if (brand.length > LIMITS.brandMax) errors.brand = `Brand must be ${LIMITS.brandMax} characters or fewer.`;

  let model: string | null = null;
  if (raw.model !== undefined && raw.model !== null && raw.model !== '') {
    if (typeof raw.model !== 'string') errors.model = 'Model must be text.';
    else if (raw.model.trim().length > LIMITS.modelMax) errors.model = `Model must be ${LIMITS.modelMax} characters or fewer.`;
    else model = raw.model.trim() || null;
  }

  const condition = raw.condition;
  if (!(DEVICE_CONDITIONS as readonly unknown[]).includes(condition)) errors.condition = 'Choose the device condition.';

  const ageYears = raw.ageYears;
  if (typeof ageYears !== 'number' || !Number.isInteger(ageYears)) errors.ageYears = 'Age must be a whole number of years.';
  else if (ageYears < LIMITS.ageMin || ageYears > LIMITS.ageMax) errors.ageYears = `Age must be between ${LIMITS.ageMin} and ${LIMITS.ageMax} years.`;

  let notes: string | null = null;
  if (raw.notes !== undefined && raw.notes !== null && raw.notes !== '') {
    if (typeof raw.notes !== 'string') errors.notes = 'Notes must be text.';
    else if (raw.notes.trim().length > LIMITS.notesMax) errors.notes = `Notes must be ${LIMITS.notesMax} characters or fewer.`;
    else notes = raw.notes.trim() || null;
  }

  const comps: SubmissionComponentInput[] = [];
  const list = raw.availableComponents;
  if (!Array.isArray(list)) errors.availableComponents = 'Available components must be a list.';
  else if (list.length < LIMITS.componentsMin) errors.availableComponents = 'Add at least one available component.';
  else if (list.length > LIMITS.componentsMax) errors.availableComponents = `Add at most ${LIMITS.componentsMax} components.`;
  else {
    const seen = new Set<string>();
    list.forEach((row, i) => {
      if (!isObj(row)) {
        errors[`availableComponents[${i}]`] = 'Each component must be an object.';
        return;
      }
      const cid = typeof row.componentId === 'string' ? row.componentId : '';
      if (!cid || !knownComponentIds.has(cid)) errors[`availableComponents[${i}].componentId`] = 'Unknown component.';
      else if (seen.has(cid)) errors[`availableComponents[${i}].componentId`] = 'Each component can only be listed once.';
      seen.add(cid);

      const q = row.quantity;
      if (typeof q !== 'number' || !Number.isInteger(q) || q < LIMITS.quantityMin || q > LIMITS.quantityMax) {
        errors[`availableComponents[${i}].quantity`] = `Quantity must be a whole number from ${LIMITS.quantityMin} to ${LIMITS.quantityMax}.`;
      }
      const cond = row.condition;
      if (!(COMPONENT_CONDITIONS as readonly unknown[]).includes(cond)) {
        errors[`availableComponents[${i}].condition`] = 'Choose the component condition.';
      }
      if (cid && knownComponentIds.has(cid) && typeof q === 'number' && Number.isInteger(q) && (COMPONENT_CONDITIONS as readonly unknown[]).includes(cond)) {
        comps.push({ componentId: cid, quantity: q, condition: cond as ComponentCondition });
      }
    });
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      deviceType: deviceType as DeviceType,
      brand,
      model,
      condition: condition as DeviceCondition,
      ageYears: ageYears as number,
      availableComponents: comps,
      notes,
    },
  };
}

/** Validates a reviewer's status change. */
export function validateReview(
  raw: unknown,
): ValidationResult<{ status: SubmissionStatus; reviewerNotes: string | null }> {
  if (!isObj(raw)) return { ok: false, errors: { body: 'Request body must be a JSON object.' } };
  const errors: Record<string, string> = {};
  if (!(SUBMISSION_STATUSES as readonly unknown[]).includes(raw.status)) errors.status = 'Choose a valid status.';
  let reviewerNotes: string | null = null;
  if (raw.reviewerNotes !== undefined && raw.reviewerNotes !== null && raw.reviewerNotes !== '') {
    if (typeof raw.reviewerNotes !== 'string') errors.reviewerNotes = 'Reviewer notes must be text.';
    else if (raw.reviewerNotes.trim().length > LIMITS.reviewerNotesMax) {
      errors.reviewerNotes = `Reviewer notes must be ${LIMITS.reviewerNotesMax} characters or fewer.`;
    } else reviewerNotes = raw.reviewerNotes.trim() || null;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { status: raw.status as SubmissionStatus, reviewerNotes } };
}
