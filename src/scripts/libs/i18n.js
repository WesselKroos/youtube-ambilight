/**
 * Helper function to retrieve localized messages via chrome.i18n.getMessage.
 * Falls back to defaultMessage (or the key) if chrome.i18n is not available or if the key is missing.
 *
 * @param {string} key - The message key in messages.json
 * @param {string} [defaultMessage] - Fallback text if message key is not found
 * @param {string | string[]} [substitutions] - Placeholder substitutions
 * @returns {string}
 */
export const getMessage = (key, defaultMessage = '', substitutions = undefined) => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.i18n?.getMessage) {
      const msg = chrome.i18n.getMessage(key, substitutions);
      if (msg) return msg;
    }
  } catch {
    // Ignore error and fall back
  }

  let result = defaultMessage || key;
  if (substitutions !== undefined) {
    const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
    subs.forEach((sub, idx) => {
      result = result.replace(new RegExp(`\\$${idx + 1}`, 'g'), sub);
    });
  }
  return result;
};

/**
 * Initializes i18n translations for the given DOM root (e.g. document).
 * Looks for elements with data-i18n, data-i18n-title, data-i18n-placeholder, data-i18n-alt attributes.
 *
 * @param {HTMLElement | Document} root
 */
export const initDomI18n = (root = document) => {
  const elementsWithI18n = root.querySelectorAll('[data-i18n]');
  for (const elem of elementsWithI18n) {
    const key = elem.getAttribute('data-i18n');
    const msg = getMessage(key, elem.textContent);
    if (msg) elem.textContent = msg;
  }

  const elementsWithHtmlI18n = root.querySelectorAll('[data-i18n-html]');
  for (const elem of elementsWithHtmlI18n) {
    const key = elem.getAttribute('data-i18n-html');
    const msg = getMessage(key, elem.innerHTML);
    if (msg) elem.innerHTML = msg;
  }

  const elementsWithTitle = root.querySelectorAll('[data-i18n-title]');
  for (const elem of elementsWithTitle) {
    const key = elem.getAttribute('data-i18n-title');
    const msg = getMessage(key, elem.getAttribute('title') || '');
    if (msg) elem.setAttribute('title', msg);
  }

  const elementsWithAlt = root.querySelectorAll('[data-i18n-alt]');
  for (const elem of elementsWithAlt) {
    const key = elem.getAttribute('data-i18n-alt');
    const msg = getMessage(key, elem.getAttribute('alt') || '');
    if (msg) elem.setAttribute('alt', msg);
  }
};
