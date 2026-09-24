import test from 'node:test';
import assert from 'node:assert/strict';
import { getYoutubeEmbedUrl } from '../../src/lib/youtube.js';

test('YouTube links are converted to privacy-enhanced embed URLs', () => {
  assert.equal(
    getYoutubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );
  assert.equal(
    getYoutubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=10'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );
});

test('non-YouTube and script URLs are rejected', () => {
  assert.equal(getYoutubeEmbedUrl('https://evil.example/watch?v=dQw4w9WgXcQ'), '');
  assert.equal(getYoutubeEmbedUrl('javascript:alert(1)'), '');
});
