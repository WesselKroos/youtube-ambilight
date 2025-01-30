import { defaultCrashOptions, storage } from './libs/storage';
import { syncStorage } from './libs/sync-storage';
import { getFeedbackFormLink, getPrivacyPolicyLink } from './libs/utils';
import SettingsConfig from './libs/settings-config';
import { on } from './libs/generic';

document.querySelector('#feedbackFormLink').href = getFeedbackFormLink();
document.querySelector('#privacyPolicyLink').href = getPrivacyPolicyLink();

let crashOptions;

const updateCrashReportOptions = () => {
  document.querySelector('[name="video"]').disabled = !crashOptions.crash;
  document.querySelector('[name="technical"]').disabled = !crashOptions.crash;
  document.querySelector('[name="crash"]').checked = crashOptions.crash;
  document.querySelector('[name="technical"]').checked =
    crashOptions.crash && crashOptions.technical;
  document.querySelector('[name="video"]').checked =
    crashOptions.crash && crashOptions.video;
};

const checkboxInputs = document.querySelectorAll('[type="checkbox"]');
for (const input of checkboxInputs) {
  input.addEventListener('change', async () => {
    try {
      crashOptions[input.name] = input.checked;
      await storage.set('crashOptions', crashOptions);
    } catch (ex) {
      alert(
        'Crash reports options changed to many times. Please wait a few seconds.'
      );
      input.checked = !input.checked;
      crashOptions[input.name] = input.checked;
    }
    updateCrashReportOptions();
  });
}
(async function initCrashReportOptions() {
  crashOptions = (await storage.get('crashOptions')) || defaultCrashOptions;
  updateCrashReportOptions();
})();
const toggles = document.querySelectorAll('.expandable__toggle');
for (const elem of toggles) {
  on(elem, 'click', () => {
    elem.closest('.expandable').classList.toggle('expanded');
  });
}

if (!chrome?.storage?.local?.onChanged) {
  const synchronizationWarning = document.createElement('div');
  synchronizationWarning.textContent =
    "Unable to synchronize any crash option changes to youtube pages that are already open. Make sure to refresh any open youtube pages after you've changed an option.";
  synchronizationWarning.classList.add('warning');
  document
    .querySelector('.warnings-container')
    .appendChild(synchronizationWarning);
}

const importExportStatus = document.querySelector('#importExportStatus');
const importExportStatusDetails = document.querySelector(
  '#importExportStatusDetails'
);
let importWarnings = [];
const importSettings = async (storageName, importJson) => {
  try {
    importExportStatus.textContent = '';
    importExportStatus.classList.remove('has-error');
    importExportStatusDetails.textContent = '';
    importExportStatusDetails.scrollTo(0, 0);

    const jsonString = await importJson();
    if (!jsonString) throw new Error('No settings found to import');

    let importedObject = JSON.parse(jsonString);
    if (typeof importedObject !== 'object')
      throw new Error('No settings found to import');

    // Temporarely import the setting blur as blur2
    // https://github.com/WesselKroos/youtube-ambilight/issues/191#issuecomment-1703792823
    if ('blur' in importedObject) {
      importedObject.blur2 = importedObject.blur;
      delete importedObject.blur;
    }

    importedObject = Object.keys(importedObject)
      .sort()
      .reduce((obj, key) => ((obj[key] = importedObject[key]), obj), {});

    const settings = {};
    for (const name in importedObject) {
      let value = importedObject[name];

      const setting = SettingsConfig.find((setting) => setting.name === name);
      if (!setting) {
        importWarnings.push(
          `Skipped "${name}": ${JSON.stringify(
            value
          )}. This settings might have been removed or migrated to another name after an update.`
        );
        continue;
      }

      const { type, min = 0, step = 0.1, max } = setting;
      if (type === 'checkbox' || type === 'section') {
        if (typeof value !== 'boolean') {
          importWarnings.push(
            `Skipped "${name}": ${JSON.stringify(value)} is not a boolean.`
          );
          continue;
        }
      } else if (type === 'list') {
        if (typeof value !== 'number') {
          importWarnings.push(
            `Skipped "${name}": ${JSON.stringify(value)} is not a number.`
          );
          continue;
        }
        const valueRoundingLeft = ((value - min) * 1000) % (step * 1000);
        if (valueRoundingLeft !== 0) {
          importWarnings.push(
            `Rounded down "${name}": ${JSON.stringify(
              value
            )} is not in steps of ${step}${
              min === undefined ? '' : ` from ${min}`
            }.`
          );
          value = Math.round(value * 1000 - valueRoundingLeft) / 1000;
        }
        if (min !== undefined && value < min) {
          importWarnings.push(
            `Clipped "${name}": ${JSON.stringify(
              value
            )} is lower than the minimum of ${min}.`
          );
          value = min;
        }
        if (max !== undefined && value > max) {
          importWarnings.push(
            `Clipped "${name}": ${JSON.stringify(
              value
            )} is higher than the maximum of ${max}.`
          );
          value = max;
        }
      }

      settings[`setting-${name}`] = value;
    }

    if (!Object.keys(settings).length)
      throw new Error('No settings found to import');

    await storage.set(settings);

    importExportStatus.textContent = `Imported ${
      Object.keys(settings).length
    } settings from ${storageName}.
(Refresh any open YouTube browser tabs to use the new settings.)${
      importWarnings.length
        ? `\n\nWith ${importWarnings.length} warnings:\n- ${importWarnings.join(
            '\n- '
          )}`
        : ''
    }`;
    if (importWarnings.length) {
      importExportStatus.classList.add('has-error');
    }
    importWarnings = [];

    importExportStatusDetails.textContent = `View imported settings (Click to view)\nNote: The blur setting is internally converted to blur2\n\n${Object.keys(
      settings
    )
      .map(
        (key) =>
          `${key.substring('setting-'.length)}: ${JSON.stringify(
            settings[key]
          )}`
      )
      .join('\n')}`;
  } catch (ex) {
    console.error('Failed to import settings', ex);
    importExportStatus.classList.add('has-error');
    importExportStatus.textContent = `Failed to import settings: \n${ex?.message}`;
  }
};
const exportSettings = async (storageName, exportJson) => {
  try {
    importExportStatus.textContent = '';
    importExportStatus.classList.remove('has-error');
    importExportStatusDetails.textContent = '';
    importExportStatusDetails.scrollTo(0, 0);

    const storageData = await storage.get(null);

    let exportObject = {};
    const settings = Object.keys(storageData).filter((key) =>
      key.startsWith('setting-')
    );
    for (const key of settings) {
      const name = key.substring('setting-'.length);
      const existsInConfig = SettingsConfig.some(
        (setting) => setting.name === name
      );
      if (!existsInConfig) continue;

      exportObject[name] = storageData[key];
    }
    if (!Object.keys(exportObject).length)
      throw new Error(
        'Nothing to export. All settings still have their default values.'
      );

    // Temporarely export the setting blur2 as blur
    // https://github.com/WesselKroos/youtube-ambilight/issues/191#issuecomment-1703792823
    if ('blur2' in exportObject) {
      exportObject.blur = exportObject.blur2;
      delete exportObject.blur2;
    }

    exportObject = Object.keys(exportObject)
      .sort()
      .reduce((obj, key) => ((obj[key] = exportObject[key]), obj), {});

    const jsonString = JSON.stringify(exportObject, null, 2);
    await exportJson(jsonString);
    importExportStatus.textContent = `Exported ${
      Object.keys(exportObject).length
    } settings to ${storageName}`;
    importExportStatusDetails.textContent = `View exported settings (Click to view)\n\n${Object.keys(
      exportObject
    )
      .map((key) => `${key}: ${JSON.stringify(exportObject[key])}`)
      .join('\n')}`;
  } catch (ex) {
    console.error('Failed to export settings', ex);
    importExportStatus.classList.add('has-error');
    importExportStatus.textContent = `Failed to export settings: \n${ex?.message}`;
  }
};

const importFileButton = document.querySelector('#importFileBtn');
const importFileInput = document.querySelector('[name="import-settings-file"]');
on(importFileInput, 'change', async () => {
  if (!importFileInput.files.length) return;

  await importSettings('a file', async () => {
    return await new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        on(reader, 'load', (e) => resolve(e.target.result));
        reader.readAsText(importFileInput.files[0]);
      } catch (ex) {
        reject(ex);
      }
      importFileInput.value = '';
    });
  });
});
on(importFileButton, 'click', () => importFileInput.click());

let exportedSettingsLink;
const exportFileButton = document.querySelector('#exportFileBtn');
on(exportFileButton, 'click', async () => {
  await exportSettings('', (jsonString) => {
    const blob = new Blob([jsonString], { type: 'text/plain' });

    const link = (exportedSettingsLink =
      exportedSettingsLink ?? document.createElement('a'));
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', 'ambient-light-for-youtube-settings.json');
    link.setAttribute(
      'title',
      'If the automatic download was blocked:\n1. Right click on this link \n2. Click on "Save link as..."'
    );
    link.style.display = 'block';
    link.style.marginTop = '0';
    link.style.marginBottom = '4px';
    link.textContent = 'ambient-light-for-youtube-settings.json';
    importExportStatusDetails.parentElement.insertBefore(
      link,
      importExportStatusDetails
    );

    link.click();
  });
});

const importAccountButton = document.querySelector('#importAccountBtn');
on(importAccountButton, 'click', async () => {
  await importSettings('cloud storage', async () => {
    return await syncStorage.get('settings');
  });
});

const exportAccountButton = document.querySelector('#exportAccountBtn');
on(exportAccountButton, 'click', async () => {
  await exportSettings('cloud storage', async (jsonString) => {
    await syncStorage.set('settings', jsonString);
    await syncStorage.set('settings-date', new Date().toJSON());
  });
});

const importableAccountStatus = document.querySelector(
  '#importableAccountStatus'
);
const updateImportableAccountStatus = async () => {
  const jsonString = await syncStorage.get('settings-date');
  if (jsonString) {
    const settingsDate = new Date(jsonString);
    importableAccountStatus.textContent = `Last cloud storage export was on: ${settingsDate.toLocaleDateString()} at ${settingsDate.toLocaleTimeString()}`;
    importAccountButton.disabled = false;
  } else {
    importableAccountStatus.textContent = '';
    importAccountButton.disabled = true;
  }
};
updateImportableAccountStatus();

if (chrome?.storage?.sync?.onChanged) {
  syncStorage.addListener(updateImportableAccountStatus);
  on(window, 'beforeunload', () => {
    syncStorage.removeListener(updateImportableAccountStatus);
  });
}
