export const waitForDomElement = (check, container) =>
  new Promise((resolve) => {
    const elem = check();
    if (elem) {
      resolve(elem);
      return;
    }

    const observer = new MutationObserver(() => {
      const elem = check();
      if (!elem) return;

      observer.disconnect();
      resolve(elem);
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
    });
  });

(async function setup() {
  const ytLiveChatAppElem = await waitForDomElement(
    () => document.querySelector('yt-live-chat-app'),
    document.documentElement
  );

  const documentObserver = new MutationObserver(() => {
    const isDark = document.documentElement.getAttribute('dark') !== null;
    ytLiveChatAppElem.toggleAttribute('dark', isDark);
  });
  documentObserver.observe(document.documentElement, {
    attributes: true,
  });
})();
