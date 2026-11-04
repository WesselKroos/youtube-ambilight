export const browserAPI =
  typeof globalThis.browser !== 'undefined'
    ? globalThis.browser
    : typeof globalThis.chrome !== 'undefined'
      ? globalThis.chrome
      : undefined;

export default browserAPI;
