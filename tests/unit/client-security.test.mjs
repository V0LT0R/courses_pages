import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, safeHttpUrl, validateStudentRegistration } from '../../src/lib/security.js';

globalThis.window = { location: { origin: 'https://courses.example' } };

test('safeHttpUrl allows HTTP(S) and relative links only', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('data:text/html,<h1>x</h1>'), '');
  assert.equal(safeHttpUrl('/materials/1'), 'https://courses.example/materials/1');
  assert.equal(safeHttpUrl('https://cdn.example/file.pdf'), 'https://cdn.example/file.pdf');
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  USER@Example.COM  '), 'user@example.com');
});

test('student registration rejects malformed email and weak password', () => {
  const result = validateStudentRegistration({ fullName: 'A', email: 'bad email', password: '123' });
  assert.ok(result.errors.length >= 3);
});

test('student registration normalizes valid input without mutating password', () => {
  const result = validateStudentRegistration({
    fullName: '  Ivan   Ivanov  ',
    email: ' IVAN@EXAMPLE.COM ',
    password: 'ValidPass123!',
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.fullName, 'Ivan Ivanov');
  assert.equal(result.email, 'ivan@example.com');
  assert.equal(result.password, 'ValidPass123!');
});
