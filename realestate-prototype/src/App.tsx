import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './ui/toast';
import { ErrorState, Button, Spinner } from './ui/kit';
import { runWorker, resetDemo } from './services/local';
import PublicLayout from './layouts/PublicLayout';
import Home from './pages/customer/Home';
import Projects from './pages/customer/Projects';
import ProjectDetail from './pages/customer/ProjectDetail';
import Enquire from './pages/customer/Enquire';
import { Compare, NotFound, Partners, Shortlist } from './pages/customer/Collections';
import { EnquiryTrack, MyEnquiries } from './pages/customer/MyEnquiries';

const CpRoutes = lazy(() => import('./pages/cp/CpRoutes'));
const DeveloperRoutes = lazy(() => import('./pages/developer/DeveloperRoutes'));
const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes'));

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <ErrorState title="This screen hit an error" body={<>The demo data may be out of date. You can reload, or reset the demo data.<br /><code className="text-xs">{this.state.error.message}</code></>} action={<div className="flex gap-2"><Button variant="secondary" onClick={() => location.reload()}>Reload</Button><Button variant="danger" onClick={() => { resetDemo(); location.href = '/'; }}>Reset demo data</Button></div>} />
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** The demo "settlement worker": closes due auctions every second. */
function Worker() {
  useEffect(() => {
    runWorker();
    const t = setInterval(runWorker, 1000);
    return () => clearInterval(t);
  }, []);
  return null;
}

// Single-file builds (e.g. hosted previews) use hash routing; normal builds use clean URLs.
const Router = import.meta.env.VITE_HASH_ROUTER === '1' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <ErrorBoundary>
          <ScrollToTop />
          <Worker />
          <Suspense fallback={<Spinner label="Loading workspace…" />}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<Home />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="compare" element={<Compare />} />
                <Route path="shortlist" element={<Shortlist />} />
                <Route path="enquire" element={<Enquire />} />
                <Route path="my-enquiries" element={<MyEnquiries />} />
                <Route path="my-enquiries/:id" element={<EnquiryTrack />} />
                <Route path="partners" element={<Partners />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="cp/*" element={<CpRoutes />} />
              <Route path="developer/*" element={<DeveloperRoutes />} />
              <Route path="admin/*" element={<AdminRoutes />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </ToastProvider>
    </Router>
  );
}
