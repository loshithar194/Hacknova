import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { replaceCatalogue, useBundledCatalogue } from '../data/catalog';
import { readPublicConfig, supabaseConfigured } from '../services/config';
import { loadCatalogueFromDatabase } from '../services/catalogueClient';
import { Button, Card } from './ui';

type State = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

/**
 * Loads the complete catalogue from the database before any page renders, so pages never show
 * partial data. If the database is not configured, the bundled demo catalogue is used and labelled as such.
 * A database failure is shown as an error with retry. It is never silently replaced.
 */
export function CatalogGate({ children }: { children: ReactNode }) {
  const config = readPublicConfig();
  const configured = supabaseConfigured(config);
  const [state, setState] = useState<State>(configured ? { status: 'loading' } : { status: 'ready' });

  const load = useCallback(async () => {
    if (!configured) {
      useBundledCatalogue();
      setState({ status: 'ready' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const data = await loadCatalogueFromDatabase({ url: config.supabaseUrl!, anonKey: config.supabaseAnonKey! });
      replaceCatalogue({ ...data, source: 'database' });
      setState({ status: 'ready' });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the catalogue.' });
    }
  }, [configured, config.supabaseUrl, config.supabaseAnonKey]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-stone-500" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <p className="text-sm">Loading the product catalogue…</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mx-auto mt-16 max-w-lg">
        <Card className="flex flex-col items-center text-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
          <h2 className="mt-3 text-lg font-semibold">The catalogue could not be loaded</h2>
          <p className="mt-2 text-sm text-stone-600">{state.message}</p>
          <Button className="mt-5" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Try again</Button>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
