export const SEMINAR_FORMATS = ['Онлайн', 'Офлайн', 'Смешанный'];

export function normalizeSeminarFormat(value) {
  const text = String(value || '').trim();
  if (/^(онлайн|online)$/i.test(text)) return 'Онлайн';
  if (/^(офф?лайн|offline)$/i.test(text)) return 'Офлайн';
  if (/^(смешанный( формат)?|гибридный( формат)?|hybrid|онлайн\s*[/+]\s*офф?лайн)$/i.test(text)) return 'Смешанный';
  return text;
}

const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function toDateInput(value) {
  const text = String(value || '').trim().toLowerCase();
  let parts = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)?.slice(1);
  const numeric = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  const written = text.match(/^(\d{1,2})\s+([а-я]+)\s+(\d{4})(?:\s*г\.?)?$/);
  if (numeric) parts = [numeric[3], numeric[2], numeric[1]];
  if (written) parts = [written[3], months.indexOf(written[2]) + 1, written[1]];
  if (!parts) return '';
  const [year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatSeminarDate(value) {
  const iso = toDateInput(value);
  return iso ? iso.split('-').reverse().join('.') : '';
}

export const DURATION_UNITS = { hours: 'Часы', days: 'Дни', weeks: 'Недели', months: 'Месяцы', custom: 'Другое' };
const durationWords = {
  hours: ['час', 'часа', 'часов'], days: ['день', 'дня', 'дней'],
  weeks: ['неделя', 'недели', 'недель'], months: ['месяц', 'месяца', 'месяцев'],
};
export function parseDuration(value) {
  const text = String(value || '').trim();
  if (!text) return { durationAmount: '', durationUnit: 'days', durationCustom: '' };
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s+(час(?:а|ов)?|день|дня|дней|недел[яьи]|месяц(?:а|ев)?)$/i);
  if (match) {
    const unit = Object.keys(durationWords).find(key => durationWords[key].includes(match[2].toLowerCase()));
    if (unit) return { durationAmount: match[1].replace(',', '.'), durationUnit: unit, durationCustom: '' };
  }
  return { durationAmount: '', durationUnit: 'custom', durationCustom: text };
}
export function formatDuration({ durationAmount, durationUnit, durationCustom }) {
  if (durationUnit === 'custom') return String(durationCustom || '').trim();
  const amount = Number(durationAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000 || !durationWords[durationUnit]) return '';
  const plural = new Intl.PluralRules('ru').select(amount);
  const word = durationWords[durationUnit][plural === 'one' ? 0 : plural === 'few' || plural === 'other' ? 1 : 2];
  return `${String(amount).replace('.', ',')} ${word}`;
}
