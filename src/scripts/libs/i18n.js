import { settings as zhTWSettings, ui as zhTWUI } from './locales/zh-TW';

const browserLanguage =
  globalThis.chrome?.i18n?.getUILanguage?.() ||
  globalThis.navigator?.language ||
  '';

const translations = {
  en: null, // English strings are the fallback in the source files.
  'zh-TW': zhTWUI,
};

const languageNames = { en: 'English', 'zh-TW': '繁體中文' };
export const availableLanguages = Object.keys(translations).map((code) => ({
  code,
  name: languageNames[code],
}));

let languagePreference = 'auto';
let localePromise;
const originalSettingsText = new WeakMap();
export let isTraditionalChinese = /^zh-(?:TW|HK|MO|Hant(?:-|$))/i.test(
  browserLanguage
);

export const getLanguagePreference = () => languagePreference;

export const setLanguagePreference = (value) => {
  languagePreference =
    value === 'auto' || Object.hasOwn(translations, value) ? value : 'auto';
  isTraditionalChinese =
    languagePreference === 'zh-TW' ||
    (languagePreference === 'auto' &&
      /^zh-(?:TW|HK|MO|Hant(?:-|$))/i.test(browserLanguage));
};

export const loadLocale = (storage) => {
  if (!localePromise) {
    localePromise = (async () => {
      try {
        const saved = await storage.get('uiLanguage');
        setLanguagePreference(saved);
      } catch (ex) {
        console.warn('Unable to load the language setting', ex);
      }
    })();
  }
  return localePromise;
};

export const translate = (key, english, values = {}) => {
  const template = (isTraditionalChinese && zhTWUI[key]) || english;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match
  );
};

export const translateWebGLWarning = (action, tips) => {
  const actionKeys = {
    create: 'webglActionCreate',
    restore: 'webglActionRestore',
    change: 'webglActionChange',
    '3 times restore': 'webglActionRepeatedRestore',
  };
  return translate(
    'webglCrash',
    `Failed to ${action} the WebGL renderer from a GPU crash.${tips}`,
    { action: translate(actionKeys[action], action), tips }
  );
};

export const localizeSettingsConfig = (config) => {
  for (const setting of config) {
    const translation = zhTWSettings[setting.name];
    if (!translation) continue;

    if (!originalSettingsText.has(setting)) {
      originalSettingsText.set(setting, {
        label: setting.label,
        description: setting.description,
        title: setting.questionMark?.title,
        snapPoints: setting.snapPoints?.map((point) => ({
          label: point.label,
          hiddenLabel: point.hiddenLabel,
        })),
      });
    }
    const original = originalSettingsText.get(setting);
    setting.label = original.label;
    setting.description = original.description;
    if (setting.questionMark) setting.questionMark.title = original.title;
    setting.snapPoints?.forEach((point, index) => {
      point.label = original.snapPoints[index].label;
      point.hiddenLabel = original.snapPoints[index].hiddenLabel;
    });

    if (!isTraditionalChinese) continue;

    if (translation.label) setting.label = translation.label;
    if (translation.description) setting.description = translation.description;
    if (translation.title && setting.questionMark) {
      setting.questionMark.title = translation.title;
    }
    if (translation.snapPoints && setting.snapPoints) {
      for (const point of setting.snapPoints) {
        const label = translation.snapPoints[point.value];
        if (!label) continue;
        if (point.hiddenLabel) point.hiddenLabel = label;
        else point.label = label;
      }
    }
  }
};
