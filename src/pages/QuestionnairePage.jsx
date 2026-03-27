export default function QuestionnairePage() {
  return (
    <section className="page-section top-spaced">
      <div className="container questionnaire-layout">
        <div className="card questionnaire-card">
          <span className="badge">Опросник после семинара</span>
          <h1>Оценка курса и обратная связь</h1>
          <p>Форма напоминает модели обратной связи на образовательных платформах: оценка полезности, качества преподавания и общей удовлетворенности.</p>

          <form className="questionnaire-form">
            <div className="question-block">
              <h3>Насколько вам понравился курс?</h3>
              <div className="scale-row">{[1,2,3,4,5].map((n) => <button type="button" key={n} className="scale-pill">{n}</button>)}</div>
            </div>
            <div className="question-block">
              <h3>Насколько материал был полезным для вашей практики?</h3>
              <div className="scale-row">{[1,2,3,4,5].map((n) => <button type="button" key={n} className="scale-pill">{n}</button>)}</div>
            </div>
            <div className="question-block">
              <h3>Понравилась ли подача лектора?</h3>
              <div className="option-row">
                <label><input type="radio" name="lecturer" /> Да</label>
                <label><input type="radio" name="lecturer" /> Частично</label>
                <label><input type="radio" name="lecturer" /> Нет</label>
              </div>
            </div>
            <label>
              Комментарий
              <textarea rows="5" placeholder="Что было особенно полезно и что можно улучшить?"></textarea>
            </label>
            <button type="button" className="cta-button">Отправить отзыв</button>
          </form>
        </div>
      </div>
    </section>
  );
}
