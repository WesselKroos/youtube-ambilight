import { appendErrorStack, isNetworkError } from './generic';
import { workerFromCode } from './worker';

const workerCode = function () {
  // This is a copy of the SafeOffscreenCanvas in generic.js because this is inside a worker
  class SafeOffscreenCanvas {
    constructor(width, height, pixelated) {
      if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        if (pixelated) {
          canvas.style.imageRendering = 'pixelated';
        }
        return canvas;
      }
    }
  }

  let canvas;
  let ctx;
  const getStoryboardPageImageDatas = async (storyboard, page) => {
    const url = storyboard.baseUrl.replace('$M', page);
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    if (!canvas) {
      canvas = new SafeOffscreenCanvas(bitmap.width, bitmap.height);
      ctx = canvas.getContext('2d');
    } else if (
      canvas.width !== bitmap.width ||
      canvas.height !== bitmap.height
    ) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    ctx.drawImage(bitmap, 0, 0);

    // const width = bitmap.width / storyboard.x
    // const height = bitmap.height / storyboard.y
    const imageDatas = [];
    for (let yi = 0; yi < storyboard.y; yi++) {
      for (let xi = 0; xi < storyboard.x; xi++) {
        const i = storyboard.x * storyboard.y * page + storyboard.x * yi + xi;
        if (i >= storyboard.images) break;

        imageDatas.push(
          ctx.getImageData(
            xi * storyboard.width,
            yi * storyboard.height,
            storyboard.width,
            storyboard.height
          )
        );
      }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return imageDatas;
  };

  // // On a scale from 0 till 1
  // const getImageDataDifference = (image1, image2) => {
  //   const diffIgnore = 8 // Exponential weighing?
  //   let diffSum = 0;
  //   for(let i = 0; i < image1.data.length; i++) {
  //     if(i % 4 === 3) continue; // skip alpha channel

  //     const diff = Math.abs(image1.data[i] - image2.data[i])
  //     diffSum += Math.max(0, (diff - diffIgnore));
  //   }
  //   return diffSum / (image1.data.length * .75) / (255 - diffIgnore);
  // };

  // // On a scale from 0 till 1, max grouped per pixel
  // const getImageDataDifference = (image1, image2) => {
  //   const diffIgnore = 8 // Exponential weighing?
  //   let diffSum = 0;
  //   for(let i = 0; i < image1.data.length; i += 4) {
  //     const diff = Math.max(
  //       Math.abs(image1.data[i] - image2.data[i]),
  //       Math.abs(image1.data[i+1] - image2.data[i+1]),
  //       Math.abs(image1.data[i+2] - image2.data[i+2])
  //     )
  //     diffSum += Math.max(0, (diff - diffIgnore));
  //   }
  //   return diffSum / (image1.data.length * .25) / (255 - diffIgnore);
  // };

  // // On a scale from 0 till 1, luminance
  // // gamma = 2.2
  // const sRGBtoLin = (colorChannel) => (colorChannel <= 0.04045)
  //   ? colorChannel / 12.92
  //   : Math.pow(((colorChannel + 0.055) / 1.055), 2.4);
  // const rgbToLuminance = (r, g, b) => (0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b));
  // const getImageDataDifference = (image1, image2) => {
  //   let diffSum = 0;
  //   for(let i = 0; i < image1.data.length; i += 4) {
  //     const diff = Math.abs(
  //       rgbToLuminance(image1.data[i] / 255, image1.data[i+1] / 255, image1.data[i+2] / 255)
  //       - rgbToLuminance(image2.data[i] / 255, image2.data[i+1] / 255, image2.data[i+2] / 255)
  //     );
  //     diffSum += diff;
  //   }
  //   return diffSum / (image1.data.length * .25);
  // };
  // // On a scale from 0 till 1, max grouped per pixel
  // // gamma = 2.2
  // const getImageDataDifference = (image1, image2) => {
  //   const diffIgnore = (20 / 255) // Exponential weighing?
  //   let diffSum = 0;
  //   for(let i = 0; i < image1.data.length; i += 4) {
  //     const diff = Math.max(
  //       Math.abs(sRGBtoLin(image1.data[i]   / 255) - sRGBtoLin(image2.data[i]   / 255)),
  //       Math.abs(sRGBtoLin(image1.data[i+1] / 255) - sRGBtoLin(image2.data[i+1] / 255)),
  //       Math.abs(sRGBtoLin(image1.data[i+2] / 255) - sRGBtoLin(image2.data[i+2] / 255))
  //     )
  //     diffSum += Math.max(0, (diff - diffIgnore));
  //   }
  //   return diffSum / (image1.data.length * .25) / (1 - diffIgnore);
  // };
  const getImageDataDifference = (image1, image2) => {
    const diffs = [];
    for (let i = 0; i < image1.data.length; i += 4) {
      // let diff = Math.max(
      //   Math.abs(sRGBtoLin(image1.data[i]   / 255) - sRGBtoLin(image2.data[i]   / 255)),
      //   Math.abs(sRGBtoLin(image1.data[i+1] / 255) - sRGBtoLin(image2.data[i+1] / 255)),
      //   Math.abs(sRGBtoLin(image1.data[i+2] / 255) - sRGBtoLin(image2.data[i+2] / 255))
      // )
      // let diff = (
      //   0.2126 * Math.abs(sRGBtoLin(image1.data[i]   / 255) - sRGBtoLin(image2.data[i]   / 255)) +
      //   0.7152 * Math.abs(sRGBtoLin(image1.data[i+1] / 255) - sRGBtoLin(image2.data[i+1] / 255)) +
      //   0.0722 * Math.abs(sRGBtoLin(image1.data[i+2] / 255) - sRGBtoLin(image2.data[i+2] / 255))
      // )
      diffs.push(
        0.2126 *
          Math.max(
            0,
            Math.abs(image1.data[i] / 255 - image2.data[i] / 255) - 0.03
          ) +
          0.7152 *
            Math.max(
              0,
              Math.abs(image1.data[i + 1] / 255 - image2.data[i + 1] / 255) -
                0.03
            ) +
          0.0722 *
            Math.max(
              0,
              Math.abs(image1.data[i + 2] / 255 - image2.data[i + 2] / 255) -
                0.03
            )
      );
      // diffs.push(
      //   0.2126 * Math.max(0, Math.abs(sRGBtoLin(image1.data[i]   / 255) - sRGBtoLin(image2.data[i]   / 255)) - .03) +
      //   0.7152 * Math.max(0, Math.abs(sRGBtoLin(image1.data[i+1] / 255) - sRGBtoLin(image2.data[i+1] / 255)) - .03) +
      //   0.0722 * Math.max(0, Math.abs(sRGBtoLin(image1.data[i+2] / 255) - sRGBtoLin(image2.data[i+2] / 255)) - .03)
      // );
    }

    // diffs = diffs
    //   .sort((a, b) => a - b)
    //   .slice(Math.floor(diffs.length / 8), Math.floor((diffs.length / 8) * 7))
    //   .reduce((i, sum) => sum + i, 0)

    let diffSum = 0;
    for (let diff of diffs) {
      diffSum += diff;
    }
    const diff = diffSum / diffs.length;
    return diff;
  };

  const getStoryboardPageDifferences = (imageDatas) => {
    const diffs = [];
    for (let i = 1; i < imageDatas.length; i++) {
      diffs.push(getImageDataDifference(imageDatas[i - 1], imageDatas[i]));
    }
    return diffs;
  };

  const getAverageVideoFramesDifference = async (storyboard) => {
    let pages = (storyboard.images - 1) / (storyboard.x * storyboard.y);
    // Only pick the last page if >= 67% is filled with images
    if (pages > 3) {
      if (pages % Math.floor(pages) >= 0.67) pages -= 1;
      pages = Math.floor(pages);
    } else {
      pages = Math.ceil(pages);
    }

    const secondPage = pages > 3 ? Math.min(1, pages) : 0;
    const middlePage = Math.floor((pages - 1) / 2);
    const secondlastPage = pages > 4 ? pages - 2 : pages - 1;

    const secondPageImageDatasPromise = getStoryboardPageImageDatas(
      storyboard,
      secondPage
    );
    const middlePageImageDatasPromise =
      middlePage > secondPage && middlePage < secondlastPage
        ? getStoryboardPageImageDatas(storyboard, middlePage)
        : [];
    const secondlastPageImageDatasPromise =
      secondlastPage >= middlePage
        ? getStoryboardPageImageDatas(storyboard, secondlastPage)
        : [];

    const secondPageImageDatas = await secondPageImageDatasPromise;
    const middlePageImageDatas = await middlePageImageDatasPromise;
    const secondlastPageImageDatas = await secondlastPageImageDatasPromise;

    const imageDatas = [
      ...secondPageImageDatas,
      ...middlePageImageDatas,
      ...secondlastPageImageDatas,
    ];
    const differences = getStoryboardPageDifferences(imageDatas);

    const averageDifference =
      differences.reduce((diffs, diff) => diffs + diff, 0) / differences.length;
    return averageDifference;
  };

  this.onmessage = async (e) => {
    const id = e.data.id;
    const baseUrl = e.data.storyboard.baseUrl;
    try {
      const difference = await getAverageVideoFramesDifference(
        e.data.storyboard
      );
      this.postMessage({
        id,
        baseUrl,
        difference,
      });
    } catch (ex) {
      if (
        isNetworkError(ex) ||
        ['InvalidStateError', 'SecurityError'].includes(ex?.name)
      ) {
        this.postMessage({
          id,
          baseUrl,
          difference: 1,
        });
        return;
      }

      this.postMessage({
        id,
        baseUrl,
        error: ex,
      });
    }
  };
};

const getStoryboard = (ytdWatchElem) => {
  const spec =
    ytdWatchElem?.playerData?.storyboards?.playerStoryboardSpecRenderer?.spec;
  if (!spec) return;

  // eslint-disable-next-line no-unused-vars
  const [baseUrl, _1, _2, sb] = spec.split('|').map((i) => i?.split('#'));
  if (!baseUrl?.length || !(sb?.length > 7)) return;

  const decodedBaseUrl = `${baseUrl[0]
    .replace('$L', '2')
    .replace('$N', sb[6])}&sigh=${decodeURIComponent(sb[7])}`;
  const width = Math.round(parseInt(sb[0], 10) / 10) * 10; // Round because it's sometimes for example 159 or 161 instead of 160
  const height = Math.round(parseInt(sb[1], 10) / 10) * 10;
  return {
    baseUrl: decodedBaseUrl,
    width,
    height,
    images: parseInt(sb[2], 10),
    x: parseInt(sb[3], 10),
    y: parseInt(sb[4], 10),
  };
};

let worker;
let workerMessageId = 0;
let lastDifference = {
  baseUrl: undefined,
  value: 1,
};
let onMessagePromise;
let nextGetIsWaiting = false;

export const getAverageVideoFramesDifference = async (ytdWatchElem) => {
  if (onMessagePromise) {
    nextGetIsWaiting = true;
    while (onMessagePromise) {
      await onMessagePromise;
    }
    nextGetIsWaiting = false;
  }

  const storyboard = getStoryboard(ytdWatchElem);
  if (!storyboard) return; // Failed to retrieve the storyboard data

  const alreadyCalculated = lastDifference.baseUrl === storyboard.baseUrl;
  if (alreadyCalculated) return lastDifference.value;

  if (!worker) {
    worker = workerFromCode(workerCode);
  }

  workerMessageId++;
  const id = workerMessageId;

  const stack = new Error().stack;
  onMessagePromise = new Promise(
    function onMessagePromise(resolve, reject) {
      worker.onerror = (err) => reject(err);
      worker.onmessage = function onMessage(e) {
        try {
          if (e.data.id !== workerMessageId) return;

          if (e.data.error) {
            // Readable name for the worker script
            if (e.data.error.stack?.replace) {
              e.data.error.stack = e.data.error.stack.replace(
                /blob:.+?:\/.+?:/g,
                'extension://scripts/static-image-detection-worker.js:'
              );
            }
            appendErrorStack(stack, e.data.error);
            throw e.data.error;
          }

          lastDifference = {
            baseUrl: e.data.baseUrl,
            value: e.data.difference,
          };
          resolve(e.data.difference);
        } catch (ex) {
          reject(ex);
        }
      }.bind(this);
    }.bind(this)
  );
  worker.postMessage({
    id,
    storyboard,
  });
  const difference = await onMessagePromise;
  onMessagePromise = undefined;
  return nextGetIsWaiting ? undefined : difference;
};

export const cancelGetAverageVideoFramesDifference = () => {
  workerMessageId++;
};
