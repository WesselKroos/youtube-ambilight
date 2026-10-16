// Returns the translated message from _locales/<locale>/messages.json.
// Falls back to the key itself so that a missing message is easy to spot.
export const t = (key, substitutions) => {
  let message;
  try {
    message = globalThis.chrome?.i18n?.getMessage(
      key,
      substitutions === undefined
        ? undefined
        : [].concat(substitutions).map((value) => `${value}`)
    );
  } catch {
    // chrome.i18n is unavailable after the extension has been reloaded or updated
  }
  return message || key;
};

// Fills the textContent, title and alt attributes of elements with a
// data-i18n, data-i18n-title or data-i18n-alt attribute.
export const translateDocument = (root = document) => {
  const language = globalThis.chrome?.i18n?.getUILanguage?.();
  if (language) document.documentElement.lang = language;
  for (const elem of root.querySelectorAll('[data-i18n]')) {
    elem.textContent = t(elem.getAttribute('data-i18n'));
  }
  for (const elem of root.querySelectorAll('[data-i18n-title]')) {
    elem.title = t(elem.getAttribute('data-i18n-title'));
  }
  for (const elem of root.querySelectorAll('[data-i18n-alt]')) {
    elem.alt = t(elem.getAttribute('data-i18n-alt'));
  }
};
