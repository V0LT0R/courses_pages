import {lazy, Suspense} from 'react';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import SeminarsPage from './pages/SeminarsPage';
import SeminarDetailPage from './pages/SeminarDetailPage';
import RegisterPage from './pages/RegisterPage';
import SignupPage from './pages/SignupPage';
const CourseLearningPage=lazy(()=>import('./pages/CourseLearningPage'));
const QuestionnairePage=lazy(()=>import('./pages/QuestionnairePage'));
const ResultsPage=lazy(()=>import('./pages/ResultsPage'));
import MaterialsPage from './pages/MaterialsPage';
import NewsPage from './pages/NewsPage';
import LoginPage from './pages/LoginPage';
const CabinetPage=lazy(()=>import('./pages/CabinetPage'));

export default function App() {
  return (
    <Suspense fallback={<div className="container page-section" role="status">Загрузка…</div>}><Routes>
      <Route path="/" element={<Layout />}>
        <Route path="*" element={<div className="container page-section"><h1>Страница не найдена</h1><Link to="/">На главную</Link></div>} />
        <Route index element={<HomePage />} />
        <Route path="seminars" element={<SeminarsPage />} />
        <Route path="seminars/:seminarId" element={<SeminarDetailPage />} />
        <Route path="register/:seminarId" element={<RegisterPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="questionnaire" element={<QuestionnairePage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="forgot-password" element={<ResetPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage recovery />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="cabinet" element={<CabinetPage />} />
          <Route path="learn/:seminarId" element={<CourseLearningPage />} />
        </Route>
      </Route>
    </Routes></Suspense>
  );
}
