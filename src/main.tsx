import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './lib/store';
import { SupabaseSessionProvider } from './lib/supabaseSession';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AppProvider>
      <SupabaseSessionProvider>
        <App />
      </SupabaseSessionProvider>
    </AppProvider>
  </BrowserRouter>,
);
