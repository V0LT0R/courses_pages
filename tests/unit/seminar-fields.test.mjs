import test from 'node:test';
import assert from 'node:assert/strict';
import { toDateInput, formatSeminarDate, normalizeSeminarFormat, parseDuration, formatDuration } from '../../src/lib/seminarFields.js';

test('legacy dates convert to calendar values without time-zone shifts', () => {
  for (const value of ['14.09.2026', '14/09/2026', '2026-09-14', '14 сентября 2026']) {
    assert.equal(toDateInput(value), '2026-09-14');
    assert.equal(formatSeminarDate(toDateInput(value)), '14.09.2026');
  }
  assert.equal(toDateInput('29.02.2024'), '2024-02-29');
  for (const value of ['29.02.2026', '31.04.2026', '2026-13-01', '2026-00-12', '14–16 сентября 2026', '', 'bad']) assert.equal(toDateInput(value), '');
});
test('duration controls preserve custom schedules and use Russian units', () => {
  for (const value of ['1 день', '3 дня', '12 дней', '21 час', '1,5 часа', '2 недели', '5 месяцев', '2 занятия по 90 минут']) {
    assert.equal(formatDuration(parseDuration(value)), value);
  }
  assert.equal(formatDuration(parseDuration('')), '');
  for (const durationAmount of ['0', '-1', 'no', '10001']) assert.equal(formatDuration({ durationAmount, durationUnit: 'days' }), '');
});
test('legacy formats normalize without losing an unknown existing format', () => {
  assert.equal(normalizeSeminarFormat('онлайн'), 'Онлайн');
  assert.equal(normalizeSeminarFormat('оффлайн'), 'Офлайн');
  assert.equal(normalizeSeminarFormat('Смешанный формат'), 'Смешанный');
  assert.equal(normalizeSeminarFormat('Гибридный'), 'Смешанный');
  assert.equal(normalizeSeminarFormat('Самостоятельно'), 'Самостоятельно');
});
