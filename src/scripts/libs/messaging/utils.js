export const origin = 'https://www.youtube.com'
export const extensionId = 'youtube-ambientlight'

export const isSameWindowMessage = (event) => (
  event.source === window &&
  event.origin === origin
)