export default function TestQuestion({ question, value, onChange, disabled = false }) {
  const multiple = question.type === 'multiple_choice';
  return <div className="test-question-card">
    <h2>{question.text}</h2>
    {question.type === 'short_answer' ? <label>
      <span>Ваш ответ</span>
      <input type="text" maxLength="500" value={value?.text || ''} onChange={event => onChange({ text: event.target.value })} disabled={disabled} />
      <small>Регистр и лишние пробелы не учитываются.</small>
    </label> : <>
      <p>{multiple ? 'Выберите все правильные ответы. Неполный набор или лишний вариант не засчитывается.' : 'Выберите один ответ.'}</p>
      <div className="student-test-options">
        {question.options.map((option, index) => {
          const selected = multiple ? (value || []).includes(option.id) : value === option.id;
          const select = () => onChange(multiple
            ? (selected ? value.filter(id => id !== option.id) : [...(value || []), option.id])
            : option.id);
          return <label className={`student-test-option ${selected ? 'selected' : ''}`} key={option.id}>
            <input type={multiple ? 'checkbox' : 'radio'} disabled={disabled} name={`question-${question.id}`} checked={selected} onChange={select} />
            <span className="student-option-letter">{String.fromCharCode(65 + index)}</span>
            <strong>{option.text}</strong>
          </label>;
        })}
      </div>
    </>}
  </div>;
}
