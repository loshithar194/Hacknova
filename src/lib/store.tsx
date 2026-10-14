import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ActivityItem, AppState, UserAccount, UserData } from '../types';
import { uid } from './utils';
import { sampleInventory } from '../data/catalog';

/*
 * DEMO MODE. All state lives in this browser's localStorage. Passwords are stored
 * in plain text. This is NOT production authentication. Supabase Auth is planned.
 */
const STORAGE_KEY = 'secondlife-demo-v1';
export const DEMO_EMAIL = 'demo@secondlife.local';
export const DEMO_PASSWORD = 'demo1234';

export function emptyData(): UserData {
  return { inventory: [], savedProjects: [], checklist: [], activity: [] };
}

export function withActivity(d: UserData, text: string): UserData {
  const entry: ActivityItem = { id: uid(), text, at: new Date().toISOString() };
  return { ...d, activity: [entry, ...d.activity].slice(0, 30) };
}

type Result = { ok: true } | { ok: false; error: string };

interface AppContextValue {
  currentUser: UserAccount | null;
  data: UserData;
  login: (email: string, password: string) => Result;
  register: (name: string, email: string, password: string) => Result;
  loginDemo: () => void;
  logout: () => void;
  updateName: (name: string) => void;
  updateData: (fn: (d: UserData) => UserData) => void;
  resetData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* corrupt storage: fall through to a fresh state */
  }
  return { users: [], sessionUserId: null, data: {} };
}

const GUEST_DATA: UserData = emptyData(); // never mutated

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  const currentUser = state.users.find((u) => u.id === state.sessionUserId) ?? null;
  const data: UserData = (currentUser && state.data[currentUser.id]) || GUEST_DATA;

  const login = (email: string, password: string): Result => {
    const normalized = email.trim().toLowerCase();
    const user = state.users.find((u) => u.email === normalized);
    if (!user) return { ok: false, error: 'No account found with this email. Register first, or use the demo account.' };
    if (user.password !== password) return { ok: false, error: 'Incorrect password. Please try again.' };
    setState((s) => ({ ...s, sessionUserId: user.id }));
    return { ok: true };
  };

  const register = (name: string, email: string, password: string): Result => {
    const normalized = email.trim().toLowerCase();
    if (state.users.some((u) => u.email === normalized)) {
      return { ok: false, error: 'An account with this email already exists. Try signing in.' };
    }
    const user: UserAccount = { id: uid(), name: name.trim(), email: normalized, password, isDemo: false };
    setState((s) => ({
      ...s,
      users: [...s.users, user],
      sessionUserId: user.id,
      data: { ...s.data, [user.id]: emptyData() },
    }));
    return { ok: true };
  };

  const loginDemo = () => {
    setState((s) => {
      let users = s.users;
      let dataMap = s.data;
      let demo = users.find((u) => u.email === DEMO_EMAIL);
      if (!demo) {
        demo = { id: 'demo-user', name: 'Demo Maker', email: DEMO_EMAIL, password: DEMO_PASSWORD, isDemo: true };
        users = [...users, demo];
        dataMap = {
          ...dataMap,
          [demo.id]: withActivity({ ...emptyData(), inventory: sampleInventory() }, 'Demo account created with a sample kit'),
        };
      }
      return { ...s, users, data: dataMap, sessionUserId: demo.id };
    });
  };

  const logout = () => setState((s) => ({ ...s, sessionUserId: null }));

  const updateName = (name: string) =>
    setState((s) => ({
      ...s,
      users: s.users.map((u) => (u.id === s.sessionUserId ? { ...u, name } : u)),
    }));

  const updateData = (fn: (d: UserData) => UserData) =>
    setState((s) => {
      const id = s.sessionUserId;
      if (!id) return s;
      const current = s.data[id] ?? emptyData();
      return { ...s, data: { ...s.data, [id]: fn(current) } };
    });

  const resetData = () => updateData(() => emptyData());

  const value: AppContextValue = {
    currentUser,
    data,
    login,
    register,
    loginDemo,
    logout,
    updateName,
    updateData,
    resetData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
