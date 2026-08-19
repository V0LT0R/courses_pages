import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCourseForLearning, markSectionCompleted, requestCertificate } from '../lib/courseService';
import { getAttemptQuestions, getCourseTestSummary, startCourseTest, submitCourseTest } from '../lib/testService';
import { getYoutubeEmbedUrl } from '../lib/youtube';

const TEST_TAB = '__testing__';

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function shuffleTestQuestions(questions) {
  return shuffle(questions.map((question) => ({
    ...question,
    options: shuffle(question.options || []),
  })));
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function ContentBlock({ block }) {
  if (block.type === 'text') {
    return (
      <div className="learning-block text-learning-block">
        {block.title ? <h3>{block.title}</h3> : null}
        <div className="rich-text-block">{block.content}</div>
      </div>
    );
  }

  if (block.type === 'youtube') {
    const embedUrl = getYoutubeEmbedUrl(block.content);
    return (
      <div className="learning-block video-learning-block">
        {block.title ? <h3>{block.title}</h3> : null}
        <div className="youtube-frame">
          <iframe
            title={block.title || 'YouTube video'}
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  if (block.type === 'pdf') {
    const viewerUrl = block.content && !block.content.includes('#') ? `${block.content}#toolbar=1&navpanes=0&scrollbar=1` : block.content;
    return (
      <div className="learning-block pdf-learning-block">
        <div className="pdf-card-head">
          <div>
            <span className="badge">PDF</span>
            <h3>{block.title || 'PDF материал'}</h3>
          </div>
          {block.content ? <a className="cta-button small" href={block.content} target="_blank" rel="noreferrer">Открыть отдельно</a> : null}
        </div>
        {block.content ? (
          <div className="seminar-pdf-viewer course-pdf-viewer">
            <iframe title={block.title || 'PDF'} src={viewerUrl} />
          </div>
        ) : (
          <div className="pdf-empty-state"><strong>PDF не прикреплен</strong></div>
        )}
      </div>
    );
  }

  if (block.type === 'image') {
    return (
      <div className="learning-block image-learning-block">
        {block.title ? <h3>{block.title}</h3> : null}
        {block.content ? (
          <img className="learning-image" src={block.content} alt={block.title || 'Фото материала'} />
        ) : (
          <div className="pdf-empty-state"><strong>Фото не прикреплено</strong></div>
        )}
      </div>
    );
  }

  return null;
}

export default function CourseLearningPage() {
  const { seminarId } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [sections, setSections] = useState([]);
  const [progress, setProgress] = useState([]);
  const [testSummary, setTestSummary] = useState(null);
  const [activeItemId, setActiveItemId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [certificateResult, setCertificateResult] = useState(null);
  const [working, setWorking] = useState(false);

  const [testAttempt, setTestAttempt] = useState(null);
  const [testQuestions, setTestQuestions] = useState([]);
  const [testAnswers, setTestAnswers] = useState({});
  const [testQuestionIndex, setTestQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [testResult, setTestResult] = useState(null);
  const [testWorking, setTestWorking] = useState(false);
  const autoSubmitTriedRef = useRef(false);
  const submitInProgressRef = useRef(false);

  const completedSectionIds = useMemo(
    () => new Set(progress.filter((item) => item.is_completed).map((item) => item.section_id)),
    [progress]
  );

  const activeSection = useMemo(
    () => activeItemId === TEST_TAB ? null : (sections.find((section) => section.id === activeItemId) || sections[0]),
    [sections, activeItemId]
  );

  const activeQuestion = testQuestions[testQuestionIndex] || null;
  const allCompleted = sections.length > 0 && sections.every((section) => completedSectionIds.has(section.id));
  const progressPercent = sections.length ? Math.round((completedSectionIds.size / sections.length) * 100) : 0;
  const certificateEligible = Boolean(allCompleted && testSummary?.bestPassed && course?.certificate);
  const isTestingTab = activeItemId === TEST_TAB;

  const loadCourse = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCourseForLearning(seminarId, user);
      const summary = await getCourseTestSummary(data.course.uuid);
      setCourse(data.course);
      setSections(data.sections);
      setProgress(data.progress);
      setTestSummary(summary);
      setActiveItemId((prev) => prev || data.sections[0]?.id || TEST_TAB);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [seminarId, user?.id, user?.role]);

  const handleCompleteSection = async () => {
    if (!activeSection) return;
    setError('');
    setMessage('');
    setCertificateResult(null);
    try {
      setWorking(true);
      await markSectionCompleted(activeSection.id);
      await loadCourse();
      setMessage('Раздел отмечен как ознакомленный.');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleCertificate = async () => {
    setError('');
    setMessage('');
    setCertificateResult(null);
    try {
      setWorking(true);
      const result = await requestCertificate({ course, profile: user });
      const response = result?.certificateResponse || {};
      setCertificateResult(response);
      setMessage('Сертификат успешно выпущен. Теперь его можно скачать или открыть страницу проверки.');
      await loadCourse();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleStartTest = async () => {
    setError('');
    setMessage('');
    setCertificateResult(null);
    setTestResult(null);
    if (!allCompleted) {
      setError('Для начала тестирования необходимо ознакомиться со всеми разделами курса.');
      return;
    }
    if (!testSummary) {
      setError('Создатель курса еще не настроил итоговый тест.');
      return;
    }

    try {
      setTestWorking(true);
      const attempt = await startCourseTest(course.uuid);
      const questions = await getAttemptQuestions(attempt);
      setTestAttempt(attempt);
      setTestQuestions(shuffleTestQuestions(questions));
      setTestAnswers({});
      setTestQuestionIndex(0);
      setSecondsLeft(Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000)));
      autoSubmitTriedRef.current = false;
      submitInProgressRef.current = false;
    } catch (err) {
      setError(err.message);
    } finally {
      setTestWorking(false);
    }
  };

  const handleSubmitTest = async (fromTimeout = false) => {
    if (!testAttempt || submitInProgressRef.current) return;
    submitInProgressRef.current = true;
    setError('');
    setMessage('');
    try {
      setTestWorking(true);
      const result = await submitCourseTest(testAttempt.attemptId, testAnswers);
      setTestResult(result);
      setTestAttempt(null);
      setTestQuestions([]);
      setTestAnswers({});
      setTestQuestionIndex(0);
      setSecondsLeft(0);
      setActiveItemId(TEST_TAB);
      await loadCourse();
      if (result.passed) {
        setMessage(`Тест пройден: ${result.score}%. Лучший результат сохранен.`);
      } else if (fromTimeout || result.timedOut) {
        setMessage(`Время теста завершилось. Результат: ${result.score}%. Тест можно пройти снова.`);
      } else {
        setMessage(`Результат: ${result.score}%. Проходной балл не набран. Тест можно пройти снова.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTestWorking(false);
      submitInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!testAttempt?.expiresAt) return undefined;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(testAttempt.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !autoSubmitTriedRef.current) {
        autoSubmitTriedRef.current = true;
        handleSubmitTest(true);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [testAttempt?.attemptId, testAttempt?.expiresAt, testAnswers]);

  const selectTestAnswer = (questionId, optionId) => {
    setTestAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  if (loading) {
    return <section className="page-section top-spaced"><div className="container"><div className="card content-card">Загрузка курса...</div></div></section>;
  }

  if (error && !course) {
    return (
      <section className="page-section top-spaced">
        <div className="container">
          <div className="card content-card error-card">{error}</div>
          <Link to={`/seminars/${seminarId}`} className="text-link">Вернуться к описанию семинара</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section top-spaced learning-page-section">
      <div className="learning-layout">
        <aside className="card learning-sidebar">
          <Link to={`/seminars/${course.slug}`} className="text-link">← Описание семинара</Link>
          <h2>{course.title}</h2>
          <div className="progress-mini">
            <div className="progress-mini-head"><span>Материалы курса</span><strong>{progressPercent}%</strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPercent}%` }} /></div>
          </div>

          <div className="learning-section-list">
            {sections.map((section, index) => {
              const done = completedSectionIds.has(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`learning-section-button ${activeSection?.id === section.id && !isTestingTab ? 'active' : ''}`}
                  onClick={() => setActiveItemId(section.id)}
                >
                  <span>{done ? '✓' : index + 1}</span>
                  <strong>{section.title}</strong>
                </button>
              );
            })}

            <button
              type="button"
              className={`learning-section-button testing-sidebar-button ${isTestingTab ? 'active' : ''} ${!allCompleted ? 'locked' : ''}`}
              onClick={() => setActiveItemId(TEST_TAB)}
            >
              <span>{testSummary?.bestPassed ? '✓' : !allCompleted ? '🔒' : 'T'}</span>
              <strong>Тестирование</strong>
            </button>
          </div>
        </aside>

        <main className="card learning-content-card">
          {error ? <div className="error-text">{error}</div> : null}
          {message ? <div className="success-text">{message}</div> : null}
          {certificateResult ? (
            <div className="certificate-result-card">
              <div>
                <strong>Сертификат выпущен</strong>
                {certificateResult.certificate_number ? <span>Номер: {certificateResult.certificate_number}</span> : null}
                {certificateResult.status ? <span>Статус: {certificateResult.status}</span> : null}
              </div>
              <div className="certificate-result-actions">
                {certificateResult.pdf_url ? (
                  <a className="cta-button small" href={certificateResult.pdf_url} target="_blank" rel="noreferrer">Скачать PDF</a>
                ) : null}
                {certificateResult.verify_url || certificateResult.verification_url ? (
                  <a className="ghost-inline-button" href={certificateResult.verify_url || certificateResult.verification_url} target="_blank" rel="noreferrer">Открыть проверку</a>
                ) : null}
              </div>
            </div>
          ) : null}

          {isTestingTab ? (
            <div className="testing-content">
              <div className="learning-content-head">
                <span className="badge">Тестирование</span>
                <h1>Итоговый тест</h1>
                <p>Тест становится доступен после того, как все разделы курса отмечены как ознакомленные.</p>
              </div>

              {!testSummary ? (
                <div className="test-locked-card">
                  <strong>Тест пока не настроен</strong>
                  <p>Создатель курса еще не добавил вопросы итогового тестирования.</p>
                </div>
              ) : (
                <>
                  <div className="test-info-grid">
                    <div className="test-info-card"><span>Вопросов</span><strong>{testSummary.questionCount}</strong></div>
                    <div className="test-info-card"><span>Время</span><strong>{testSummary.timeLimitMinutes} мин.</strong></div>
                    <div className="test-info-card"><span>Для прохождения</span><strong>{testSummary.passingScore}%</strong></div>
                    <div className="test-info-card"><span>Попытки</span><strong>Без ограничений</strong></div>
                  </div>

                  {testSummary.bestScore !== null ? (
                    <div className={`test-best-result ${testSummary.bestPassed ? 'passed' : ''}`}>
                      <span>Лучший результат</span>
                      <strong>{testSummary.bestScore}%</strong>
                      <small>{testSummary.bestPassed ? 'Тест успешно пройден' : `Нужно набрать минимум ${testSummary.passingScore}%`}</small>
                    </div>
                  ) : null}

                  {testResult ? (
                    <div className={`test-result-card ${testResult.passed ? 'passed' : 'failed'}`}>
                      <span>{testResult.passed ? 'Тест пройден' : 'Тест не пройден'}</span>
                      <strong>{testResult.score}%</strong>
                      <p>Правильных ответов: {testResult.correctAnswers} из {testResult.totalQuestions}. Детализация правильных ответов не показывается.</p>
                      {testResult.timedOut ? <small>Попытка была завершена по истечении времени.</small> : null}
                    </div>
                  ) : null}

                  {!allCompleted && !testAttempt ? (
                    <div className="test-locked-card">
                      <strong>🔒 Тестирование пока закрыто</strong>
                      <p>Для начала тестирования необходимо ознакомиться со всеми разделами курса.</p>
                    </div>
                  ) : null}

                  {testAttempt && activeQuestion ? (
                    <div className="active-test-card">
                      <div className="active-test-topbar">
                        <div>
                          <span>Вопрос {testQuestionIndex + 1} из {testQuestions.length}</span>
                          <div className="test-question-progress"><div style={{ width: `${((testQuestionIndex + 1) / testQuestions.length) * 100}%` }} /></div>
                        </div>
                        <div className={`test-timer ${secondsLeft <= 60 ? 'warning' : ''}`}>
                          <span>Осталось</span>
                          <strong>{formatTime(secondsLeft)}</strong>
                        </div>
                      </div>

                      <div className="test-question-card">
                        <h2>{activeQuestion.text}</h2>
                        <div className="student-test-options">
                          {activeQuestion.options.map((option, optionIndex) => {
                            const selected = testAnswers[activeQuestion.id] === option.id;
                            return (
                              <label className={`student-test-option ${selected ? 'selected' : ''}`} key={option.id}>
                                <input
                                  type="radio"
                                  name={`question-${activeQuestion.id}`}
                                  checked={selected}
                                  onChange={() => selectTestAnswer(activeQuestion.id, option.id)}
                                />
                                <span className="student-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                                <strong>{option.text}</strong>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="test-navigation-actions">
                        <button
                          type="button"
                          className="ghost-inline-button"
                          onClick={() => setTestQuestionIndex((index) => Math.max(0, index - 1))}
                          disabled={testQuestionIndex === 0 || testWorking}
                        >
                          ← Назад
                        </button>
                        <span>Отвечено: {Object.keys(testAnswers).length} / {testQuestions.length}</span>
                        {testQuestionIndex < testQuestions.length - 1 ? (
                          <button
                            type="button"
                            className="cta-button"
                            onClick={() => setTestQuestionIndex((index) => Math.min(testQuestions.length - 1, index + 1))}
                            disabled={testWorking}
                          >
                            Далее →
                          </button>
                        ) : (
                          <button type="button" className="cta-button" onClick={() => handleSubmitTest(false)} disabled={testWorking}>
                            {testWorking ? 'Проверяем...' : 'Завершить тест'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {!testAttempt && allCompleted ? (
                    <div className="test-start-actions">
                      <button type="button" className="cta-button" onClick={handleStartTest} disabled={testWorking}>
                        {testWorking ? 'Подготавливаем тест...' : testSummary.attemptCount > 0 ? 'Пройти тест снова' : 'Начать тестирование'}
                      </button>
                      <span>Порядок вопросов и вариантов ответа меняется при каждой попытке.</span>
                    </div>
                  ) : null}

                  {certificateEligible && !testAttempt ? (
                    <div className="certificate-unlocked-card">
                      <div>
                        <strong>Сертификат доступен</strong>
                        <p>Все материалы завершены, а итоговый тест успешно пройден.</p>
                      </div>
                      <button type="button" className="cta-button" onClick={handleCertificate} disabled={working}>
                        {working ? 'Формируем...' : 'Получить сертификат'}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : activeSection ? (
            <>
              <div className="learning-content-head">
                <span className="badge">Раздел</span>
                <h1>{activeSection.title}</h1>
                {activeSection.description ? <p>{activeSection.description}</p> : null}
              </div>

              <div className="learning-blocks-list">
                {activeSection.blocks.length ? (
                  activeSection.blocks.map((block) => <ContentBlock key={block.id} block={block} />)
                ) : (
                  <div className="pdf-empty-state"><strong>Материалы в этом разделе пока не добавлены.</strong></div>
                )}
              </div>

              <div className="learning-bottom-actions">
                <button
                  type="button"
                  className="cta-button"
                  onClick={handleCompleteSection}
                  disabled={working || completedSectionIds.has(activeSection.id)}
                >
                  {completedSectionIds.has(activeSection.id) ? 'Раздел уже отмечен' : 'Ознакомлен с разделом'}
                </button>

                {certificateEligible ? (
                  <button type="button" className="ghost-inline-button certificate-action" onClick={handleCertificate} disabled={working}>
                    Получить сертификат
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="pdf-empty-state"><strong>Разделы пока не добавлены.</strong></div>
          )}
        </main>
      </div>
    </section>
  );
}
