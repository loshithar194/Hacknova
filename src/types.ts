export type Condition = 'Working' | 'Needs testing' | 'Not working';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type ProjectStatus = 'saved' | 'planned' | 'in_progress' | 'completed';
export type Feasibility = 'BUILD_NOW' | 'SMALL_ADDITIONS' | 'NOT_FEASIBLE';
export type ProjectIconKey = 'sprout' | 'cloud' | 'trash' | 'bot' | 'bulb' | 'thermo' | 'radar';

export interface Component {
  id: string;
  name: string;
  category: string;
  description: string;
  unitPrice: number;        // INR, demo reference price
  weightGrams: number;      // configured estimate per unit
  specs: string;
  compatibility: string;
}

export interface Requirement {
  componentId: string;
  quantity: number;
  alternatives?: string[];  // compatible substitutes, counted with a verification warning
  critical?: boolean;       // missing critical parts block the project
}

export interface Project {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  description: string;
  difficulty: Difficulty;
  durationMinutes: number;
  newProductPrice: number;  // INR, approximate comparable entry-level product
  consumablesCost: number;  // INR, wiring/tubing/misc. consumables
  icon: ProjectIconKey;
  requiresSpecCheck: boolean;
  requirements: Requirement[];
  instructions: string[];
  safety: string[];
  compatibilityNotes: string[];
}

export interface InventoryItem {
  id: string;
  componentId: string;
  name: string;
  category: string;
  quantity: number;
  condition: Condition;
  specs: string;
  notes: string;
  source: string;
  addedAt: string;
}

export interface ReusedUnit {
  componentId: string;
  name: string;
  category: string;
  quantity: number;
  weightGrams: number;
  unitPrice: number;
}

export interface SavedProject {
  id: string;
  projectId: string;
  status: ProjectStatus;
  progress: number;
  matchAtSave: number;
  costAtSave: number;
  savedAt: string;
  startedAt?: string;
  completedAt?: string;
  reuseValue?: number;
  reusedWeightGrams?: number;
  savingsAtCompletion?: number;
  reusedUnits?: ReusedUnit[];
}

export interface ChecklistItem {
  id: string;
  componentId: string;
  quantity: number;
  acquired: boolean;
  projectId?: string;
}

export interface ActivityItem {
  id: string;
  text: string;
  at: string;
}

export interface UserData {
  inventory: InventoryItem[];
  savedProjects: SavedProject[];
  checklist: ChecklistItem[];
  activity: ActivityItem[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;         // demo only: stored in plain text in localStorage
  isDemo: boolean;
}

export interface AppState {
  users: UserAccount[];
  sessionUserId: string | null;
  data: Record<string, UserData>;
}
