import { Canvas } from './components/Canvas';
import { ReportPage } from './components/ReportPage';

function App() {
  const isReportPage = window.location.hash === '#/report';
  return isReportPage ? <ReportPage /> : <Canvas />;
}

export default App;

