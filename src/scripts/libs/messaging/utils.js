export const origin = 'https://www.youtube.com';
export const extensionId = 'youtube-ambient-light-extension';

export const isSameWindowMessage = (event) =>
  event.source === window && event.origin === origin;
