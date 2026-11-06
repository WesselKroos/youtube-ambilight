import { wrapErrorHandler } from './libs/generic';
import MusicSettings from './libs/music-settings';
import MusicSettingsMenu from './libs/music-settings-menu';
import MusicAmbientlight from './libs/music-ambientlight';

const findPlayerElems = () => {
  const playerPageElem = document.querySelector('ytmusic-app ytmusic-player-page');
  const playerElem = playerPageElem?.querySelector('ytmusic-player#player');
  if (!playerElem) return;

  // The player bar is not required, because it is not available in every
  // layout of YouTube Music. The settings menu waits for it by itself.
  const appElem = playerPageElem.closest('ytmusic-app');
  return { appElem, playerPageElem, playerElem };
};

const waitForPlayerElems = () =>
  new Promise((resolve) => {
    const elems = findPlayerElems();
    if (elems) {
      resolve(elems);
      return;
    }

    const observer = new MutationObserver(
      wrapErrorHandler(function onMusicAppMutation() {
        const elems = findPlayerElems();
        if (!elems) return;

        observer.disconnect();
        resolve(elems);
      }, true)
    );
    observer.observe(document, { childList: true, subtree: true });
  });

wrapErrorHandler(async function loadMusicAmbientlight() {
  if (window.musicAmbientlight !== undefined) return;
  window.musicAmbientlight = false;

  // Apply the changes made in the YouTube player settings or in other tabs
  let musicAmbientlight;
  let settingsMenu;
  const settings = new MusicSettings((values) => {
    if (!musicAmbientlight) return;

    musicAmbientlight.updateSettings(values);
    settingsMenu.update();
  });
  await settings.load();

  const { appElem, playerPageElem, playerElem } = await waitForPlayerElems();
  musicAmbientlight = new MusicAmbientlight(
    playerPageElem,
    playerElem,
    settings.values
  );
  window.musicAmbientlight = musicAmbientlight;
  settingsMenu = new MusicSettingsMenu(musicAmbientlight, settings, appElem);
})();
