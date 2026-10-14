import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Notice, PageHeader, inputCls, labelCls } from '../components/ui';
import { useApp } from '../lib/store';

export function Profile() {
  const { currentUser, data, updateName, resetData, logout } = useApp();
  const [name, setName] = useState(currentUser?.name ?? '');
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  if (!currentUser) {
    return <Notice tone="info">Please <Link to="/login" className="font-semibold underline">sign in</Link> to view your profile.</Notice>;
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setMessage({ tone: 'error', text: 'Full name cannot be empty.' });
    updateName(name.trim());
    setMessage({ tone: 'success', text: 'Profile updated.' });
  };

  const reset = () => {
    if (!window.confirm('Delete all inventory, saved projects, checklist and activity for this account? This cannot be undone.')) return;
    resetData();
    setMessage({ tone: 'info', text: 'Your data has been cleared.' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Account details and data controls." />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Account</h2>
          <form onSubmit={save} className="mt-4 space-y-4">
            <div>
              <label className={labelCls} htmlFor="pname">Full name</label>
              <input id="pname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={`${inputCls} bg-stone-50 text-stone-500`} value={currentUser.email} readOnly />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save changes</Button>
              <Button variant="secondary" type="button" onClick={() => { logout(); }}>Log out</Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-stone-500">
            Account type: {currentUser.isDemo ? 'Demo account (starts with sample data)' : 'Local demo account (starts empty)'}
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold">Your data</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs text-stone-500">Inventory entries</dt><dd className="text-lg font-bold">{data.inventory.length}</dd></div>
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs text-stone-500">Saved projects</dt><dd className="text-lg font-bold">{data.savedProjects.length}</dd></div>
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs text-stone-500">Checklist items</dt><dd className="text-lg font-bold">{data.checklist.length}</dd></div>
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs text-stone-500">Activity entries</dt><dd className="text-lg font-bold">{data.activity.length}</dd></div>
          </dl>
          <div className="mt-5">
            <Button variant="danger" onClick={reset}>Clear all my data</Button>
          </div>
          <div className="mt-6">
            <Notice tone="warning">
              Demo storage: this data lives only in this browser. Passwords are stored unhashed in localStorage. Do not reuse a real password here.
            </Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
