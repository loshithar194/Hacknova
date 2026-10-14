import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  LayoutDashboard,
  Hammer,
  Search,
  FolderKanban,
  Bookmark,
  BarChart3,
  Bot,
  User,
  Menu,
  X,
  LogOut,
  LogIn,
  Recycle,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { useSupabaseSession } from '../lib/supabaseSession';
import { catalogueState, PROJECTS, COMPONENTS } from '../data/catalog';
import { Logo, btnClass } from './ui';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/build', label: 'Build What I Have', icon: Hammer },
  { to: '/components', label: 'Find Components', icon: Search },
  { to: '/ewaste', label: 'E-Waste Submit', icon: Recycle },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/my-projects', label: 'My Projects', icon: Bookmark },
  { to: '/impact', label: 'Impact Dashboard', icon: BarChart3 },
  { to: '/advisor', label: 'AI Advisor', icon: Bot },
  { to: '/profile', label: 'Profile', icon: User },
];

export function Layout() {
  const { currentUser, logout } = useApp();
  const { configured, role } = useSupabaseSession();
  const navItems = configured && role === 'admin' ? [...NAV, { to: '/admin', label: 'Admin', icon: ShieldCheck }] : NAV;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate('/');
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-emerald-700 text-white' : 'text-stone-600 hover:bg-emerald-50 hover:text-emerald-800'
            }`
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 border-t border-emerald-100 pt-4">
      <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Demo mode.</strong> Personal inventory is saved only in this browser.
        <div className="mt-1 text-amber-800">
          Catalogue: {catalogueState.source === 'database' ? `database (${PROJECTS.length} products, ${COMPONENTS.length} parts)` : 'bundled demo data'}
        </div>
      </div>
      {currentUser ? (
        <>
          <p className="truncate text-sm font-medium text-stone-800">{currentUser.name}</p>
          <button onClick={handleLogout} className={btnClass('secondary', 'w-full')}>
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </>
      ) : (
        <Link to="/login" className={btnClass('primary', 'w-full')}>
          <LogIn className="h-4 w-4" /> Sign in
        </Link>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-emerald-100 bg-white p-5 lg:flex">
        <Link to="/" className="mb-8">
          <Logo />
        </Link>
        {nav}
        {footer}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-emerald-100 bg-white px-4 py-3 lg:hidden">
        <Link to="/">
          <Logo />
        </Link>
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-stone-700 hover:bg-stone-100"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white p-5 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-stone-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl p-4 md:p-8 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
