import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import SeminarsPage from './pages/SeminarsPage';
import SeminarDetailPage from './pages/SeminarDetailPage';
import RegisterPage from './pages/RegisterPage';
import SignupPage from './pages/SignupPage';
import CourseLearningPage from './pages/CourseLearningPage';
import QuestionnairePage from './pages/QuestionnairePage';
import ResultsPage from './pages/ResultsPage';
import MaterialsPage from './pages/MaterialsPage';
import NewsPage from './pages/NewsPage';
import LoginPage from './pages/LoginPage';
import CabinetPage from './pages/CabinetPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="seminars" element={<SeminarsPage />} />
        <Route path="seminars/:seminarId" element={<SeminarDetailPage />} />
        <Route path="register/:seminarId" element={<RegisterPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="questionnaire" element={<QuestionnairePage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="cabinet" element={<CabinetPage />} />
          <Route path="learn/:seminarId" element={<CourseLearningPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
