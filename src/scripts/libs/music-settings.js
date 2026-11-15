import { setTimeout } from './generic';
import { storage } from './storage';
import {
  getDefaultMusicSettings,
  musicSettingNames,
} from './music-ambientlight';

const SAVE_DELAY = 300;

const SYNC_STORAGE_NAME = 'music-syncWithYouTube';
// The settings of the YouTube player
const getSharedStorageName = (name) => `setting-${name}`;
// The settings that are only used on YouTube Music when it is not synced
const getMusicStorageName = (name) => `music-setting-${name}`;

const storageNames = [
  SYNC_STORAGE_NAME,
  ...musicSettingNames.flatMap((name) => [
    getSharedStorageName(name),
    getMusicStorageName(name),
  ]),
];

// The ambient light settings of YouTube Music. By default they are synced
// with the settings of the YouTube player, but they can also be unsynced to
// use separate settings on YouTube Music.
export default class MusicSettings {
  stored = {};
  saveTimeouts = {};

  constructor(onChange) {
    this.onChange = onChange;
  }

  async load() {
    this.stored = (await storage.get(storageNames)) || {};

    storage.addListener(
      function musicSettingsListener(changes) {
        // Ignore the changes of settings that are still being changed in
        // this tab, to prevent sliders from jumping back to an older value
        const changedNames = storageNames.filter(
          (name) => name in changes && !(name in this.saveTimeouts)
        );
        if (!changedNames.length) return;

        for (const name of changedNames) {
          this.setStored(name, changes[name].newValue);
        }
        this.onChange(this.values);
      }.bind(this)
    );
  }

  get syncWithYouTube() {
    return this.stored[SYNC_STORAGE_NAME] ?? true;
  }

  get values() {
    const defaults = getDefaultMusicSettings();
    return Object.fromEntries(
      musicSettingNames.map((name) => [
        name,
        this.stored[this.getStorageName(name)] ?? defaults[name],
      ])
    );
  }

  getStorageName(name) {
    return this.syncWithYouTube
      ? getSharedStorageName(name)
      : getMusicStorageName(name);
  }

  setStored(storageName, value) {
    if (value === undefined || value === null) {
      delete this.stored[storageName];
    } else {
      this.stored[storageName] = value;
    }
  }

  set(name, value) {
    // Store the default value as undefined, just like the YouTube player
    // settings do, so that a future change of the default is applied
    const isDefault = getDefaultMusicSettings()[name] === value;
    const storageName = this.getStorageName(name);
    this.setStored(storageName, isDefault ? undefined : value);
    this.scheduleSave(storageName);
  }

  scheduleSave(storageName) {
    clearTimeout(this.saveTimeouts[storageName]);
    this.saveTimeouts[storageName] = setTimeout(async () => {
      try {
        await storage.set(storageName, this.stored[storageName]);
      } finally {
        delete this.saveTimeouts[storageName];
      }
    }, SAVE_DELAY);
  }

  setSyncWithYouTube(sync) {
    if (sync === this.syncWithYouTube) return;

    if (!sync) {
      // Continue with the current settings, so that nothing changes until a
      // setting is changed on YouTube Music
      const values = this.values;
      this.setStored(SYNC_STORAGE_NAME, false);
      for (const name of musicSettingNames) {
        this.set(name, values[name]);
      }
    } else {
      this.setStored(SYNC_STORAGE_NAME, undefined);
    }
    this.scheduleSave(SYNC_STORAGE_NAME);
  }
}
