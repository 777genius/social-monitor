import { extractYoutubeVideoId, isYoutubeVideoUrl } from './youtube-url';

describe('youtube-url', () => {
  it.each([
    ['https://www.youtube.com/watch?v=9hE5-98ZeCg', '9hE5-98ZeCg'],
    ['https://youtu.be/9hE5-98ZeCg?si=abc', '9hE5-98ZeCg'],
    ['https://www.youtube.com/shorts/9hE5-98ZeCg', '9hE5-98ZeCg'],
    ['https://www.youtube.com/embed/9hE5-98ZeCg', '9hE5-98ZeCg'],
    ['https://music.youtube.com/watch?v=9hE5-98ZeCg', '9hE5-98ZeCg'],
  ])('extracts video id from %s', (url, videoId) => {
    expect(extractYoutubeVideoId(url)).toBe(videoId);
    expect(isYoutubeVideoUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/watch?v=9hE5-98ZeCg',
    'https://notyoutube.com/watch?v=9hE5-98ZeCg',
    'https://www.youtube.com/channel/UC123',
    'https://www.youtube.com/watch?v=too-short',
    'not a url',
  ])('rejects non-video url %s', (url) => {
    expect(extractYoutubeVideoId(url)).toBeNull();
    expect(isYoutubeVideoUrl(url)).toBe(false);
  });
});
