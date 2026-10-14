import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './lib/store';
import { Layout } from './components/Layout';
import { CatalogGate } from './components/CatalogGate';
import { EWaste } from './pages/EWaste';
import { Admin } from './pages/Admin';
import { Home } from './pages/Home';
import { LoginPage, RegisterPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { BuildWhatIHave } from './pages/BuildWhatIHave';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { FindComponents } from './pages/FindComponents';
import { MyProjects } from './pages/MyProjects';
import { Impact } from './pages/Impact';
import { Advisor } from './pages/Advisor';
import { Profile } from './pages/Profile';

/** Blocks personal pages until a demo or registered account is signed in. */
function RequireAuth() {
  const { currentUser } = useApp();
  const location = useLocation();
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <CatalogGate>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/components" element={<FindComponents />} />
        <Route path="/ewaste" element={<EWaste />} />
        <Route path="/admin" element={<Admin />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/build" element={<BuildWhatIHave />} />
          <Route path="/my-projects" element={<MyProjects />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/advisor" element={<Advisor />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </CatalogGate>
  );
}
