import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PublicLayout } from './components/PublicLayout'
import { AppLayout } from './components/AppLayout'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const ProjectPage = lazy(() => import('./pages/ProjectPage'))
const CaseStudiesPage = lazy(() => import('./pages/CaseStudiesPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const DataResourcesPage = lazy(() => import('./pages/DataResourcesPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const MissionControlPage = lazy(() => import('./pages/MissionControlPage'))
const SarIngestionPage = lazy(() => import('./pages/SarIngestionPage'))
const SceneExplorerPage = lazy(() => import('./pages/SceneExplorerPage'))
const SceneDetailPage = lazy(() => import('./pages/SceneDetailPage'))
const NewInvestigationPage = lazy(() => import('./pages/NewInvestigationPage'))
const InvestigationWorkspacePage = lazy(() => import('./pages/InvestigationWorkspacePage'))
const VesselsPage = lazy(() => import('./pages/p4/VesselsPage'))
const VesselDetailPage = lazy(() => import('./pages/p4/VesselDetailPage'))
const PashaLabPage = lazy(() => import('./pages/p4/PashaLabPage'))
const HypothesesPage = lazy(() => import('./pages/p4/HypothesesPage'))
const ReplayPage = lazy(() => import('./pages/p4/ReplayPage'))
const EvidencePage = lazy(() => import('./pages/p5/EvidencePage'))
const ReportPage = lazy(() => import('./pages/p5/ReportPage'))
const HistoryDetailPage = lazy(() => import('./pages/p5/HistoryDetailPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="project" element={<ProjectPage />} />
        <Route path="case-studies" element={<CaseStudiesPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="data-resources" element={<DataResourcesPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="app" element={<MissionControlPage />} />
        <Route path="investigations/new" element={<NewInvestigationPage />} />
        <Route path="investigations/:id" element={<InvestigationWorkspacePage />} />
        <Route path="investigations/:id/vessels" element={<VesselsPage />} />
        <Route path="investigations/:id/vessels/:vesselId" element={<VesselDetailPage />} />
        <Route path="investigations/:id/pasha" element={<PashaLabPage />} />
        <Route path="investigations/:id/pasha/hypotheses" element={<HypothesesPage />} />
        <Route path="investigations/:id/pasha/replay" element={<ReplayPage />} />
        <Route path="investigations/:id/evidence" element={<EvidencePage />} />
        <Route path="investigations/:id/report" element={<ReportPage />} />
        <Route path="history/:id" element={<HistoryDetailPage />} />
        <Route path="investigations/:id/:module" element={<InvestigationWorkspacePage />} />
        <Route path="sar-ingestion" element={<SarIngestionPage />} />
        <Route path="scene-explorer" element={<SceneExplorerPage />} />
        <Route path="scene-explorer/:sceneId" element={<SceneDetailPage />} />
      </Route>
    </Routes>
  )
}
