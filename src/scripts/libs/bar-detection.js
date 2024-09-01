import {
  appendErrorStack,
  requestIdleCallback,
  SafeOffscreenCanvas,
  wrapErrorHandler,
} from './generic';
import SentryReporter from './sentry-reporter';
import { workerFromCode } from './worker';

const workerCode = function () {
  let catchedWorkerCreationError = false;
  let canvas;
  let canvasIsCreatedInWorker = false;
  let ctx;
  let globalRunId = 0;
  let globalXOffsetIndex = 0;
  const scanlinesAmount = 5; // 10 // 40 // 5

  const postError = (ex) => {
    if (!catchedWorkerCreationError) {
      catchedWorkerCreationError = true;
      this.postMessage({
        id: -1,
        error: ex,
      });
    }
  };

  let getLineImageDataStart;
  let getLineImageDataEnd;
  async function getLineImageData(imageLines, yAxis, xIndex) {
    const now = performance.now();
    if (
      !getLineImageDataStart ||
      (getLineImageDataEnd && now - getLineImageDataEnd > 2)
    ) {
      getLineImageDataStart = now;
    } else if (now - getLineImageDataStart > 4) {
      // Give the CPU breathing time to execute other javascript code/internal browser code in between on single core instances
      // (or GPU cores breathing time to decode the video or prepaint other elements in between)
      // Allows 4k60fps with frame blending + video overlay 80fps -> 144fps

      // const delayStart = performance.now()
      await new Promise((resolve) => setTimeout(resolve, 1)); // 0/1 = 13.5ms in Firefox & 0/1.5 ms in Chromium
      // console.log(`was busy for ${(delayStart - getLineImageDataStart).toFixed(2)}ms | delayed by ${(performance.now() - delayStart).toFixed(2)}ms`)
      getLineImageDataStart = now;
    }

    const params =
      yAxis === 'height'
        ? [xIndex, 0, 1, canvas.height]
        : [0, xIndex, canvas.width, 1];

    // const start = performance.now()
    // const duration = performance.now() - start
    imageLines.push({
      xIndex,
      data: ctx.getImageData(...params).data,
    });
    getLineImageDataEnd = performance.now();
  }

  const sortSizes = (averageSize) => (a, b) => {
    const aGap = Math.abs(averageSize - a.yIndex);
    const bGap = Math.abs(averageSize - b.yIndex);
    return aGap === bGap ? 0 : aGap > bGap ? 1 : -1;
  };

  function sortAverageColors(averageColor, a, b) {
    const aDiff =
      Math.abs(averageColor[0] - a[0]) +
      Math.abs(averageColor[1] - a[1]) +
      Math.abs(averageColor[2] - a[2]);
    const bDiff =
      Math.abs(averageColor[0] - b[0]) +
      Math.abs(averageColor[1] - b[1]) +
      Math.abs(averageColor[2] - b[2]);
    return aDiff === bDiff ? 0 : aDiff > bDiff ? 1 : -1;
  }

  function getAverageColor(_imageLines, perpendicularImageLines) {
    // const topOffsetIndex = channels * 2
    // const bottomOffsetIndex = imageLines[0].data.length - channels - topOffsetIndex

    let colors = [];
    // for(const imageLine of imageLines) {
    // // for(const xi in imageLines) {
    //   const data = imageLine.data
    //   for(let i = topOffsetIndex; i <= topOffsetIndex + 6 * channels; i += 2 * channels) {
    //     colors.push([data[i], data[i + 1], data[i + 2]]) // , xi, i])
    //   }
    //   for(let i = bottomOffsetIndex; i >= bottomOffsetIndex - 6 * channels; i -= 2 * channels) {
    //     colors.push([data[i], data[i + 1], data[i + 2]]) //, xi, i])
    //   }
    // }
    for (const imageLine of perpendicularImageLines) {
      // for(const xi in perpendicularImageLines) {
      const data = imageLine.data;
      const max = data.length / channels;
      for (let i = 0; i <= max; i += 4 * channels) {
        colors.push([data[i], data[i + 1], data[i + 2]]); // , xi, i])
      }
    }

    const averageColorLength = colors.length * 0.1;
    let averageColor;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      averageColor = [
        colors.reduce((average, color) => average + color[0], 0) /
          colors.length,
        colors.reduce((average, color) => average + color[1], 0) /
          colors.length,
        colors.reduce((average, color) => average + color[2], 0) /
          colors.length,
      ];
      if (colors.length < averageColorLength) break;

      colors.sort((a, b) => sortAverageColors(averageColor, a, b));
      colors.splice(0, 1);
      colors.splice(-1, 1);
    }

    // console.log(
    //   averageColor.map(c => c.toFixed(0).toString().padStart(3,' ')).join('|'),
    //   JSON.parse(JSON.stringify(colors.map(c => c.map(c => c.toString().padStart(3,' ')).join('|'))))
    // )
    colors.length = 0;
    return averageColor;
  }

  function getHueDeviation(a, b) {
    return (
      Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
    );
  }

  function getBrightnessDeviation(a, b) {
    return Math.abs(a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  }

  const maxBlackDeviation = {
    hue: 16,
    brightness: 8,
    sum: 20,
    score: 155 * 3 + 155 * 3,
  };
  const maxDarkDeviation = {
    hue: 22,
    brightness: 22,
    sum: 36,
    score: 155 * 3 + 155 * 3,
  };
  const maxLightDeviation = {
    hue: 32,
    brightness: 64,
    sum: 86,
    score: 255 * 3 + 255 * 3,
  };

  function getMaxDeviationLimits(color) {
    const brightness = color[0] + color[1] + color[2];
    return brightness > 500
      ? maxLightDeviation
      : brightness > 20
      ? maxDarkDeviation
      : maxBlackDeviation;
  }

  function isColorWithinMaxDeviation(currentColor, referenceColor) {
    const hueDeviation = getHueDeviation(currentColor, referenceColor);
    const brightnessDeviation = getBrightnessDeviation(
      currentColor,
      referenceColor
    );
    const maxDeviation = getMaxDeviationLimits(referenceColor);

    return (
      hueDeviation <= maxDeviation.hue &&
      brightnessDeviation <= maxDeviation.brightness &&
      hueDeviation + brightnessDeviation <= maxDeviation.sum
    );
  }

  const channels = 4;
  const enhancedCertainty = true; // Todo: create setting?
  const minDeviationScore = enhancedCertainty ? 0.25 : 0.4;
  const edgePointXRange = globalThis.BARDETECTION_EDGE_RANGE;
  const edgePointYRange = enhancedCertainty ? 8 : 16;
  const edgePointYCenter = 2 / edgePointYRange;

  const easeInOutQuad = (x) =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  // Todo: getImageData for the whole image at once to prevent 1Mb of memory trashing?
  const getCertainty = (point, yAxis, yDirection, color, imageLine) => {
    const x = point.x - (enhancedCertainty ? edgePointXRange : 1);
    const y =
      point.y -
      edgePointYRange *
        2 *
        (yDirection === 1 ? edgePointYCenter : 1 - edgePointYCenter);
    const xLength = 1 + (enhancedCertainty ? edgePointXRange * 2 : 0);
    const yLength = 1 + edgePointYRange * 2;

    let data = enhancedCertainty
      ? ctx.getImageData(
          ...(yAxis === 'height'
            ? [x, y, xLength, yLength]
            : [y, x, yLength, xLength])
        ).data
      : [];
    if (!enhancedCertainty) {
      let start = y * channels;
      let length = yLength * channels;
      if (start < 0) {
        data = new Array(-start).fill(0);
        length += start;
        start = 0;
        data = data.concat(...imageLine.data.slice(start, start + length));
      } else {
        data = imageLine.data.slice(start, start + length);
      }
    }

    // console.log(point, yAxis, yDirection, color)
    // console.log(x, y, xLength, yLength)
    // console.log(data)

    let score = 0;
    for (let dx = 0; dx < xLength; dx++) {
      const ix = dx * (yAxis === 'height' ? 1 : yLength);

      for (let dy = 0; dy < yLength; dy++) {
        const dy2 = yDirection === 1 ? dy : yLength - 1 - dy;
        const iy = dy2 * (yAxis === 'height' ? xLength : 1);
        const i = ix * channels + iy * channels;

        const iColor =
          data[i + 3] === 0
            ? color // Outside canvas bounds
            : [data[i], data[i + 1], data[i + 2]];
        const expectWithinDeviation =
          dy < Math.floor(1 + edgePointYRange * 2 * edgePointYCenter);
        // const within = isColorWithinMaxDeviation(iColor, color)
        // console.log(dx, dy2, '|', ix, iy, '|', i, JSON.stringify(iColor), within)
        // if (within === expectWithinDeviation) {

        if (!expectWithinDeviation) {
          const maxDeviation = getMaxDeviationLimits(color);

          const hueDeviation = getHueDeviation(iColor, color);
          const brightnessDeviation = getBrightnessDeviation(iColor, color);
          const deviationScore = Math.max(
            0,
            Math.min(
              1 - minDeviationScore,
              (hueDeviation + brightnessDeviation) / maxDeviation.score / 0.05
            )
          );
          // console.log(dx, dy, deviationScore, iColor, color, hueDeviation, brightnessDeviation)
          score += minDeviationScore + deviationScore;
        } else {
          const within = isColorWithinMaxDeviation(iColor, color);
          if (within) score += 1;
        }
        // }
      }
    }
    const length = xLength * yLength;
    const certainty = (score - length / 2) / (length / 2);

    return easeInOutQuad(certainty);
  };

  const largeStep = 4;
  const ignoreEdge = 2;
  const middleIndexOffset = channels * 10;

  const minCertainty = 0.65;
  const maxCertaintyChecks = enhancedCertainty ? 3 : 5;
  const sureCertainty = enhancedCertainty ? 0.65 : 0.65;

  function detectEdges(imageLines, color, yAxis) {
    const middleIndex = imageLines[0].data.length / 2;
    const topEdges = [];
    const bottomEdges = [];

    for (const imageLine of imageLines) {
      const { xIndex, data } = imageLine;
      let step = largeStep;
      let wasDeviating = false;
      let wasUncertain = false;
      // From the top down
      let mostCertainEdge;
      let detectedEdges = 0;
      // Example video of a lot of uncertain edges: https://www.youtube.com/watch?v=mTmet4jAkEA
      for (
        let i = channels * ignoreEdge;
        i < data.length;
        i += channels * step
      ) {
        if (wasUncertain) {
          wasUncertain = false;
          step = 1;
        }

        const iColor = [data[i], data[i + 1], data[i + 2]];
        const limitNotReached = i < middleIndex - middleIndexOffset - channels; // Below the top limit
        if (!limitNotReached || detectedEdges > maxCertaintyChecks) {
          // console.log(xIndex, i, mostCertainEdge, JSON.parse(JSON.stringify(topEdges)))
          if (mostCertainEdge?.certainty > minCertainty) {
            topEdges.find(
              (edge) =>
                xIndex === edge.xIndex && mostCertainEdge.yIndex === edge.yIndex
            ).deviates = false;
            // topEdges.push({
            //   xIndex,
            //   yIndex: mostCertainEdge.i / channels,
            //   certainty: mostCertainEdge.certainty,
            //   deviates: mostCertainEdge.certainty < .5 ? true : undefined
            // })
          } else {
            topEdges.push({
              xIndex,
              yIndex: 0,
              certainty: 0,
              deviates: true,
            });
          }
          break;
        }

        const isDeviating = !isColorWithinMaxDeviation(iColor, color);

        if (limitNotReached && wasDeviating && !isDeviating) {
          wasDeviating = false;
          continue;
        }

        if (limitNotReached && wasDeviating === isDeviating) continue;

        // Change the step from large to 1 pixel
        if (i !== 0 && step === largeStep) {
          i = Math.max(-channels, i - channels * step);
          step = Math.ceil(1, Math.floor(step / 2));
          continue;
        }

        const certainty = getCertainty(
          { x: xIndex, y: i / channels },
          yAxis,
          1,
          color,
          imageLine
        );
        detectedEdges++;
        if (limitNotReached && certainty < sureCertainty) {
          // console.log('uncertain top', xIndex, i / channels, certainty)
          // step = largeStep
          wasUncertain = true;
          wasDeviating = true;
          if (!(mostCertainEdge?.certainty >= certainty)) {
            mostCertainEdge = {
              // i,
              yIndex: i / channels,
              certainty,
            };
          }
          topEdges.push({
            xIndex,
            yIndex: i / channels,
            certainty: certainty,
            deviates: true,
          });
          continue;
        }

        // console.log('found', certainty)
        // Found the first video pixel, add to topEdges
        topEdges.push({
          xIndex,
          yIndex: i / channels,
          certainty,
        });
        break;
      }

      step = largeStep;
      wasDeviating = false;
      wasUncertain = false;
      mostCertainEdge = undefined;
      detectedEdges = 0;
      // From the bottom up
      for (
        let i = data.length - channels * (1 + ignoreEdge);
        i >= 0;
        i -= channels * step
      ) {
        if (wasUncertain) {
          wasUncertain = false;
          step = 1;
        }

        const iColor = [data[i], data[i + 1], data[i + 2]];
        const limitNotReached = i > middleIndex + middleIndexOffset; // Above the bottom limit
        if (!limitNotReached || detectedEdges > maxCertaintyChecks) {
          if (mostCertainEdge?.certainty > minCertainty) {
            bottomEdges.find(
              (edge) =>
                xIndex === edge.xIndex && mostCertainEdge.yIndex === edge.yIndex
            ).deviates = false;
            // bottomEdges.push({
            //   xIndex,
            //   yIndex: (data.length - mostCertainEdge.i) / channels,
            //   certainty: mostCertainEdge.certainty,
            //   deviates: mostCertainEdge.certainty < .5 ? true : undefined
            // })
          } else {
            bottomEdges.push({
              xIndex,
              yIndex: 0,
              certainty: 0,
              deviates: true,
            });
          }
          break;
        }
        const isDeviating = !isColorWithinMaxDeviation(iColor, color);

        if (limitNotReached && wasDeviating && !isDeviating) {
          wasDeviating = false;
          continue;
        }

        if (limitNotReached && wasDeviating === isDeviating) continue;

        // Change the step from large to 1 pixel
        if (i !== data.length - channels && step === largeStep) {
          i = Math.min(data.length - channels, i + channels * step);
          step = Math.ceil(1, Math.floor(step / 2));
          continue;
        }

        const certainty = getCertainty(
          { x: xIndex, y: i / channels },
          yAxis,
          -1,
          color,
          imageLine
        );
        detectedEdges++;
        if (limitNotReached && certainty < sureCertainty) {
          // console.log('uncertain bottom', xIndex, i / channels, certainty)
          // step = largeStep
          wasUncertain = true;
          wasDeviating = true;
          if (!(mostCertainEdge?.certainty >= certainty)) {
            mostCertainEdge = {
              yIndex: (data.length - i) / channels,
              // i,
              certainty,
            };
          }
          bottomEdges.push({
            xIndex,
            yIndex: (data.length - i) / channels,
            certainty: certainty,
            deviates: true,
          });
          continue;
        }

        // console.log('found', certainty)
        // Found the first video pixel, add to bottomEdges
        bottomEdges.push({
          xIndex,
          yIndex: (data.length - i) / channels,
          certainty,
        });
        break;
      }
    }

    return { topEdges, bottomEdges };
  }

  const reduceAverageSize = (edges) =>
    edges.reduce((sum, edge) => sum + edge.yIndex, 0) / edges.length;

  function getExceedsDeviationLimit(
    edges,
    topEdges,
    bottomEdges,
    imageLines,
    maxSize,
    scale,
    allowedAnomaliesPercentage,
    allowedUnevenBarsPercentage
  ) {
    if (
      !topEdges.filter((e) => !e.deviates).length ||
      !bottomEdges.filter((e) => !e.deviates).length
    ) {
      return true;
    }

    const threshold =
      imageLines.length * 2 * (1 - (allowedAnomaliesPercentage - 10) / 100);
    if (edges.filter((e) => !e.deviates).length <= threshold) {
      return true;
    }

    while (edges.filter((e) => !e.deviates).length > threshold) {
      const nonDeviatingEdges = edges.filter((e) => !e.deviates);
      const averageSize = reduceAverageSize(nonDeviatingEdges);
      nonDeviatingEdges
        .sort(sortSizes(averageSize))
        .slice(nonDeviatingEdges.length - 1)
        .forEach((e) => {
          e.deviates = true;
        });
    }

    // while(topEdges.filter(e => !e.deviates && !e.deviatesTop).length > threshold) {
    //   const nonDeviatingEdges = topEdges.filter(e => !e.deviates && !e.deviatesTop)
    //   const averageSize = reduceAverageSize(nonDeviatingEdges)
    //   nonDeviatingEdges
    //     .sort(sortSizes(averageSize))
    //     .slice(nonDeviatingEdges.length - 1)
    //     .forEach(e => {
    //       e.deviatesTop = true
    //     })
    // }

    // while(bottomEdges.filter(e => !e.deviates && !e.deviatesBottom).length > threshold) {
    //   const nonDeviatingEdges = bottomEdges.filter(e => !e.deviates && !e.deviatesBottom)
    //   const averageSize = reduceAverageSize(nonDeviatingEdges)
    //   nonDeviatingEdges
    //     .sort(sortSizes(averageSize))
    //     .slice(nonDeviatingEdges.length - 1)
    //     .forEach(e => {
    //       e.deviatesBottom = true
    //     })
    // }

    const maxAllowedSideDeviation = maxSize * (0.008 * scale);

    const nonDeviatingTopEdges = topEdges.filter(
      (e) => !e.deviates && !e.deviatesTop
    );

    const maxTopDeviation = Math.abs(
      Math.max(...nonDeviatingTopEdges.map((e) => e.yIndex)) -
        Math.min(...nonDeviatingTopEdges.map((e) => e.yIndex))
    );
    const topDeviationIsAllowed = maxTopDeviation <= maxAllowedSideDeviation;

    const nonDeviatingBottomEdges = bottomEdges.filter(
      (e) => !e.deviates && !e.deviatesBottom
    );
    const maxBottomDeviation = Math.abs(
      Math.max(...nonDeviatingBottomEdges.map((e) => e.yIndex)) -
        Math.min(...nonDeviatingBottomEdges.map((e) => e.yIndex))
    );
    const bottomDeviationIsAllowed =
      maxBottomDeviation <= maxAllowedSideDeviation;

    if (!topDeviationIsAllowed && !bottomDeviationIsAllowed) {
      // console.log(
      //   !topDeviationIsAllowed ? `top deviates ${maxTopDeviation}` : '',
      //   !topDeviationIsAllowed ? topEdges : '',
      //   !bottomDeviationIsAllowed ? `bottom deviates ${maxBottomDeviation}` : '',
      //   !bottomDeviationIsAllowed ? bottomEdges : '',
      //   maxAllowedSideDeviation
      // )
      return true;
    }

    const averageTopSize = reduceAverageSize(nonDeviatingTopEdges);
    const averageBottomSize = reduceAverageSize(nonDeviatingBottomEdges);
    const sidesDeviation = Math.abs(averageTopSize - averageBottomSize);

    const maxAllowedDeviation =
      maxSize * (0.003 + allowedUnevenBarsPercentage * 0.0008) * scale;
    const minMaxAllowedSideDeviation = maxSize * (0.016 * scale);
    // let maxAllowedSidesDeviation = maxAllowedSideDeviation
    let maxAllowedSidesDeviation = maxAllowedDeviation;
    if (
      averageTopSize < minMaxAllowedSideDeviation ||
      averageBottomSize < minMaxAllowedSideDeviation
    ) {
      // console.log(`A side a lower than the maximum side deviation\n${averageTopSize} | ${averageBottomSize} < ${minMaxAllowedSideDeviation}`, nonDeviatingTopEdges, nonDeviatingBottomEdges)
      maxAllowedSidesDeviation = 2;
    } else {
      // console.log(`${averageTopSize} | ${averageBottomSize} < ${minMaxAllowedSideDeviation}`, nonDeviatingTopEdges)
    }

    if (sidesDeviation > maxAllowedSidesDeviation) {
      // console.log('average top & bottom deviates', sidesDeviation, maxAllowedSidesDeviation)
      return true;
    }

    // Allow a higher deviation between top and bottom edges
    const nonDeviatingEdgeSizes = edges
      .filter((e) => !e.deviates)
      .map((e) => e.yIndex);
    const maxDeviation = Math.abs(
      Math.max(...nonDeviatingEdgeSizes) - Math.min(...nonDeviatingEdgeSizes)
    );
    if (maxDeviation > maxAllowedDeviation) {
      // console.log('all edges deviate', maxDeviation, maxAllowedDeviation)
      return true;
    }
  }

  function getPercentage(
    exceedsDeviationLimit,
    maxSize,
    scale,
    edges,
    imageLines,
    currentPercentage = 0,
    offsetPercentage = 0
  ) {
    const minSize = maxSize * (0.01 * scale);
    const lowerSizeThreshold = maxSize * ((currentPercentage - 2) / 100);
    const baseOffsetPercentage = 0.3 * ((1 + scale) / 2);

    let size;
    if (exceedsDeviationLimit) {
      const uncertainLowerSizes = edges
        .filter((e) => e.certainty > 0.075 && e.yIndex < lowerSizeThreshold)
        .map((e) => e.yIndex);
      if (uncertainLowerSizes.length / (imageLines.length * 2) < 0.3) return;

      const lowestSize = Math.min(...uncertainLowerSizes);
      // let lowestPercentage = Math.round((lowestSize / maxSize) * 10000) / 100
      // // console.log(lowestPercentage, lowestSize, currentPercentage)
      // if(lowestPercentage >= currentPercentage - 2) {
      //   return // deviating lowest percentage is higher than the current percentage
      // }

      // console.log('semi-certain lower percentage', lowestSize, lowerSizeThreshold, semiCertainLowerSizes, edges)
      size = lowestSize;
      if (size < minSize) {
        size = 0;
      } else {
        size += maxSize * (offsetPercentage / 100);
      }
    } else {
      // size = Math.max(...edges.filter(e => !e.deviates).map(e => e.yIndex))
      const sortedEdges = edges.filter((e) => !e.deviates).sort(sortSizes(0));
      size = reduceAverageSize(
        sortedEdges.slice(Math.floor(sortedEdges.length / 2))
      );
      // size = reduceAverageSize(edges.filter(e => !e.deviates))
      // console.log(size, currentPercentage)
      if (size < minSize) {
        size = 0;
      } else {
        size += maxSize * ((baseOffsetPercentage + offsetPercentage) / 100);
      }
    }

    // if(size > (maxSize * 0.49)) {
    //   console.log('size beyond half', size, maxSize)
    //   alert('never happens?')
    //   let lowestSize = Math.min(...edges.map(e => e.yIndex))
    //   if(lowestSize >= minSize) {
    //     lowestSize += (maxSize * (offsetPercentage/100))
    //   }
    //   let lowestPercentage = Math.round((lowestSize / maxSize) * 10000) / 100
    //   if(lowestPercentage < currentPercentage) {
    //     // console.log('lowestPercentage', lowestPercentage, edges)
    //     return lowestPercentage // Almost filled with a single color but found content outside the current detected percentage
    //   }
    //   return // Filled with a almost single color
    // }

    let percentage = Math.round((size / maxSize) * 10000) / 100;
    const maxPercentage = 38;
    percentage = Math.min(percentage, maxPercentage);
    // console.log('percentage', percentage, edges)
    return percentage;
  }

  try {
    const workerDetectBarSize = async (
      id,
      xLength,
      yAxis,
      scale,
      detectColored,
      offsetPercentage,
      currentPercentage,
      allowedAnomaliesPercentage,
      allowedUnevenBarsPercentage,
      xOffset
    ) => {
      const partSizeBorderMultiplier =
        allowedAnomaliesPercentage > 20 ? 0.6 : 0.1;
      // xOffset = partSizeBorderMultiplier ? xOffset * .5 : xOffset

      const partSize = Math.floor(
        canvas[xLength] / (scanlinesAmount + partSizeBorderMultiplier * 2)
      );
      const imageLines = [];
      for (
        let index =
          Math.ceil(partSize / 2) - 1 + partSizeBorderMultiplier * partSize;
        index < canvas[xLength] - partSizeBorderMultiplier * partSize;
        index += partSize
      ) {
        if (id < globalRunId) {
          imageLines.length = 0;
          return;
        }
        const xIndex = Math.min(
          Math.max(
            0,
            index + Math.round(xOffset * (partSize / 2) - partSize / 4)
          ),
          canvas[xLength] - 1
        );
        await getLineImageData(imageLines, yAxis, xIndex);
      }

      // console.log(imageSquare.length)

      // console.log(`scanned ${imageLines.length} lines`)
      if (id < globalRunId) {
        imageLines.length = 0;
        return;
      }

      const perpendicularImageLines = [];
      await getLineImageData(perpendicularImageLines, xLength, 3);
      await getLineImageData(perpendicularImageLines, xLength, 6);
      await getLineImageData(
        perpendicularImageLines,
        xLength,
        canvas[xLength] - 3
      );
      await getLineImageData(
        perpendicularImageLines,
        xLength,
        canvas[xLength] - 6
      );

      if (id < globalRunId) {
        imageLines.length = 0;
        return;
      }

      const color = getAverageColor(imageLines, perpendicularImageLines, yAxis);
      if (
        !detectColored &&
        (color[0] + color[1] + color[2] > 16 ||
          Math.abs(color[0] - color[1]) > 3 ||
          Math.abs(color[1] - color[2]) > 3 ||
          Math.abs(color[2] - color[0]) > 3)
      ) {
        const topEdges = imageLines.map((line) => ({
          xIndex: line.xIndex,
          yIndex: 0,
          deviates: true,
        }));
        const bottomEdges = imageLines.map((line) => ({
          xIndex: line.xIndex,
          yIndex: 0,
          deviates: true,
        }));
        imageLines.length = 0;

        // console.log('edge case', topEdges, bottomEdges, percentage)
        return {
          percentage: 0,
          topEdges,
          bottomEdges,
          color,
        };
      }

      const { topEdges, bottomEdges } = detectEdges(imageLines, color, yAxis);

      const maxSize = imageLines[0].data.length / channels;

      // // TODO:
      // // 1. Figure out if needed: Prevents small objects in bars form reducing the bar like in Zig Zag,
      // // but also prevents squares in the bars from reducing the bar like in cams/screenshots
      // // 2. Cutting off way to far:
      // //   - The first frame: https://www.youtube.com/watch?v=liuotbjjsHw
      // //   - https://www.youtube.com/watch?v=0MfHJmHjGxs&t=110
      // //   - https://youtu.be/a54V6U-Nb0I?si=upIe0WDg0SblmIxY&t=403
      // //   - Flickers back and forth to 0%: https://www.youtube.com/watch?v=TiQ7iWgY1fI&t=33s
      // //   - Cut out elements into bars: https://www.youtube.com/watch?v=W9aNGyXt294
      // //   - Vertical colored bars removed to often at the start:
      // //     https://www.youtube.com/watch?v=sDIi95CqTiM
      // //     gradients? https://www.youtube.com/watch?v=aWhro47QBm8
      // //   - Stars and 2 centered squared objects: https://www.youtube.com/watch?v=hL4IfoQzSSE&t=351s
      // //   - logo & squared: https://www.youtube.com/watch?v=UsWh21rFzh8&t=120s
      // //   - old video with vague bars: https://www.youtube.com/watch?v=YoLJ4CWSLSI
      // //   - Dismiss/reset black bars to content:
      // //       https://youtu.be/oCmNbNhppHo?t=381
      // //       https://www.youtube.com/watch?v=Xhi2FdES8yI&t=215s
      // //       https://youtu.be/K-D5wThCPRw?si=90p34xMcTAboCbNb&t=850

      // //   - Moving bars: https://www.youtube.com/watch?v=9O-yCnQKYhM

      // //   - Black bars dark content https://www.youtube.com/watch?v=_QJjk--Wyvo
      // //   - Moves a lot while seeking through video: https://www.youtube.com/watch?v=f2fzjhyCOcM
      // //   - Flickering small bars https://youtu.be/K-D5wThCPRw?si=4fa1WL3sioN02QEl&t=82
      // //   - Vertical bar constantly switching:
      // //       https://www.youtube.com/watch?v=aJWAfvS__Ts&t=200
      // //       https://www.youtube.com/watch?v=iqdhphwLWAU&t=45
      // //   - Horizontal bars constantly switching:
      // //       https://www.youtube.com/watch?v=laxrPE8qPzI
      // //   - Vertical bars detected to the 2nd column: https://www.youtube.com/watch?v=Y8p-C327wAw&t=13s
      // //   - Flickering bars:
      // //       https://www.youtube.com/watch?v=1FqAoADnId4
      // //       https://www.youtube.com/watch?v=OH4CyqUMdhU
      // //       https://www.youtube.com/watch?v=DJIQStz_rkU
      // //       https://www.youtube.com/watch?v=7r_WRY-dT9Y
      // //       https://www.youtube.com/watch?v=_raGfRmNJ4s
      // //       https://www.youtube.com/watch?v=z7XtNeDlzhw
      // //       https://www.youtube.com/watch?v=Ieq5sNEoc1E&t=752s

      // //   - Uneven bars, black line below (caused by sloping bottom bar):
      // //       https://www.youtube.com/watch?v=_jTlyYtzieE

      // //   - Black lines, not closing bars to smaller values while even detecting smaller values:
      // //       https://www.youtube.com/watch?v=UnQvpQtYxow
      // //   - Constant flickering:
      // //       https://www.youtube.com/watch?v=37-6GeQg2xY

      // console.log(JSON.stringify(topEdges), JSON.stringify(bottomEdges))

      // console.log(topEdges, bottomEdges)

      const edges = [...topEdges, ...bottomEdges];
      const exceedsDeviationLimit = getExceedsDeviationLimit(
        edges,
        topEdges,
        bottomEdges,
        imageLines,
        maxSize,
        scale,
        allowedAnomaliesPercentage,
        allowedUnevenBarsPercentage
      );

      // console.log(JSON.stringify(edges), exceedsDeviationLimit)

      const percentage = getPercentage(
        exceedsDeviationLimit,
        maxSize,
        scale,
        edges,
        imageLines,
        currentPercentage,
        offsetPercentage
      );
      // console.log('percentage', percentage, edges)

      if (
        !(percentage < currentPercentage) &&
        [...topEdges, ...bottomEdges].filter((edge) => !edge.deviates).length /
          (imageLines.length * 2) <
          (100 - allowedAnomaliesPercentage) / 100
      ) {
        // console.log(`Discarded. Found ${topEdges.length + bottomEdges.length} of ${imageLines.length * 2}. Required: ${(100 - allowedAnomaliesPercentage)}%`)
        topEdges.forEach((edge) => {
          edge.deviates = true;
        });
        bottomEdges.forEach((edge) => {
          edge.deviates = true;
        });
        imageLines.length = 0;

        return {
          topEdges,
          bottomEdges,
          color,
        };
      }

      imageLines.length = 0;
      return {
        percentage,
        topEdges,
        bottomEdges,
        color,
      };
    };

    const createContext = () => {
      ctx = canvas.getContext('2d', {
        // alpha: false, // Decreases performance on some platforms
        desynchronized: true,
        willReadFrequently: true,
      });
      ctx.imageSmoothingEnabled = false;
    };

    const createCanvas = (width, height) => {
      canvas = new OffscreenCanvas(width, height);
      canvas.addEventListener('contextlost', () => {
        try {
          // Free GPU memory
          canvas.width = 1;
          canvas.height = 1;
        } catch (ex) {
          postError(ex);
        }
      });
      canvas.addEventListener('contextrestored', () => {
        try {
          canvas.width = 1;
          canvas.height = 1;
        } catch (ex) {
          postError(ex);
        }
      });

      canvasIsCreatedInWorker = true;

      createContext();
    };

    this.onmessage = async (e) => {
      const id = e.data.id;
      globalRunId = id;

      try {
        if (e.data.type === 'cancellation') {
          globalXOffsetIndex = 0;
          return;
        }
        // contextlost/contextrestored are never fired in our worker. Keeping our context lost
        if (e.data.type === 'clear') {
          globalXOffsetIndex = 0;
          if (
            canvas &&
            canvasIsCreatedInWorker &&
            canvas.width !== 1 &&
            canvas.height !== 1
          )
            createCanvas(1, 1);
          return;
        }

        const {
          detectColored,
          detectHorizontal,
          detectVertical,
          offsetPercentage,
          currentHorizontalPercentage,
          currentVerticalPercentage,
          // ratio
          allowedAnomaliesPercentage,
          allowedUnevenBarsPercentage,
          canvasInfo,
          xOffsetSize,
        } = e.data;

        if (canvasInfo.bitmap) {
          const bitmap = canvasInfo.bitmap;
          if (!canvas) {
            createCanvas(512, 512);
          } else if (canvas.width !== 512 || canvas.height !== 512) {
            canvas.width = 512;
            canvas.height = 512;

            createContext();
          }
          ctx.drawImage(bitmap, 0, 0, 512, 512);
          bitmap.close();
        } else {
          canvas = canvasInfo.canvas;
          canvasIsCreatedInWorker = false;
          ctx = canvasInfo.ctx;
        }

        globalXOffsetIndex++;
        if (globalXOffsetIndex >= xOffsetSize) globalXOffsetIndex = 0;
        // const xOffset = xOffsetSize === 1 ? .5 : (globalXOffsetIndex / (xOffsetSize - 1))
        const xOffset =
          xOffsetSize === 1
            ? 0.5
            : xOffsetSize === 2
            ? globalXOffsetIndex
            : (Math.ceil(globalXOffsetIndex / 2) + (globalXOffsetIndex % 2)) /
              (xOffsetSize - 1);
        // console.log(xOffsetSize, globalXOffsetIndex, xOffset)

        let horizontalBarSizeInfo = detectHorizontal
          ? await workerDetectBarSize(
              id,
              'width',
              'height',
              1,
              detectColored,
              offsetPercentage,
              currentHorizontalPercentage,
              allowedAnomaliesPercentage,
              allowedUnevenBarsPercentage,
              xOffset
            )
          : undefined;
        let verticalBarSizeInfo = detectVertical
          ? await workerDetectBarSize(
              id,
              'height',
              'width',
              1,
              detectColored,
              offsetPercentage,
              currentVerticalPercentage,
              allowedAnomaliesPercentage,
              allowedUnevenBarsPercentage,
              xOffset
            )
          : undefined;

        if (id !== globalRunId) {
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.postMessage({
          id,
          horizontalBarSizeInfo,
          verticalBarSizeInfo,
        });
      } catch (ex) {
        if (id === globalRunId) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        this.postMessage({
          id,
          error: ex,
        });
      }
    };
  } catch (ex) {
    postError(ex);
  }
};

export default class BarDetection {
  worker;
  runId = 0;
  canvas;
  ctx;
  catchedDetectBarSizeError = false;
  changes = [];
  history = {
    horizontal: [],
    vertical: [],
  };

  constructor(ambientlight) {
    this.ambientlight = ambientlight;
  }

  clear = () => {
    // console.log(this.runId, 'clear')
    this.runId++; // invalidate current worker processes
    if (this.worker) {
      this.worker.postMessage({
        id: this.runId,
        type: 'clear',
      });
    }

    this.running = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    // this.continueAfterRun = false

    this.history = {
      horizontal: [],
      vertical: [],
    };
    this.changes = [];
  };

  cancel = () => {
    this.runId++; // invalidate current worker processes
    if (this.worker) {
      this.worker.postMessage({
        id: this.runId,
        type: 'cancellation',
      });
    }

    this.running = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    // this.continueAfterRun = false
    // this.history = {
    //   horizontal: [],
    //   vertical: []
    // }
  };

  detect = (
    buffer,
    detectColored,
    offsetPercentage,
    detectHorizontal,
    currentHorizontalPercentage,
    detectVertical,
    currentVerticalPercentage,
    ratio,
    allowedToTransfer,
    averageHistorySize,
    allowedAnomaliesPercentage,
    allowedUnevenBarsPercentage,
    callback
  ) => {
    if (this.running) {
      // if(!this.continueAfterRun) {
      //   console.log('    enable continueAfterRun')
      //   this.continueAfterRun = true
      // }
      return;
    }

    this.runId++;
    const runId = this.runId;
    this.running = true;

    if (!this.worker) {
      this.worker = workerFromCode(workerCode);
      this.worker.onmessage = (e) => {
        if (e.data.id !== -1) {
          // console.warn('Ignoring old bar detection message:', e.data)
          return;
        }
        if (e.data.error) {
          SentryReporter.captureException(e.data.error);
        }
      };
    }

    // Ignore previous percentages in cases: new video src, seeked or setting changed
    if (this.history.horizontal.length === 0)
      currentHorizontalPercentage = undefined;
    if (this.history.vertical.length === 0)
      currentVerticalPercentage = undefined;

    requestIdleCallback(
      async function detectIdleCallback() {
        await this.idleHandler(
          runId,
          buffer,
          detectColored,
          offsetPercentage,
          detectHorizontal,
          currentHorizontalPercentage,
          detectVertical,
          currentVerticalPercentage,
          ratio,
          allowedToTransfer,
          averageHistorySize,
          allowedAnomaliesPercentage,
          allowedUnevenBarsPercentage,
          callback
        );
      }.bind(this),
      { timeout: 1 },
      true
    );
  };

  averagePercentage(
    percentage,
    currentPercentage,
    history,
    averageHistorySize
  ) {
    if (percentage === undefined) {
      if (!history.length && !currentPercentage) history.push(0);
      return;
    }

    const detectedPercentage = percentage;

    // Detected a small adjustment in percentages but could be caused by an artifact in the video. Pick the most occuring of the last percentages
    // percentage = [...history, detectedPercentage].sort((a, b) => b - a)[Math.floor(history.length / 2)]
    const percentagesOccurrence = [...history, detectedPercentage].reduce(
      (percentages, percentage) => {
        percentages[percentage] = (percentages[percentage] ?? 0) + 1;
        return percentages;
      },
      {}
    );
    percentage = parseFloat(
      Object.keys(percentagesOccurrence).reduce((a, b) =>
        percentagesOccurrence[a] > percentagesOccurrence[b] ? a : b
      )
    );

    // Is the difference less than 2 occurences? Then prevent flickering
    if (
      percentage !== currentPercentage &&
      Math.abs(
        percentagesOccurrence[percentage] -
          percentagesOccurrence[currentPercentage]
      ) <=
        history.length / 2
    ) {
      percentage = currentPercentage;
    }
    // console.log('average', detectedPercentage, percentage, percentagesOccurrence, history)

    let adjustment = percentage - currentPercentage;
    if (percentage !== 0 && adjustment > -1 && adjustment <= 0) {
      // Ignore small adjustments
      adjustment = detectedPercentage - currentPercentage;
      if (adjustment > -1 && adjustment <= 0) {
        percentage = undefined;
      } else {
        percentage = currentPercentage; // Disable throttling
      }
    }

    // Reduce recurring flickering to one flicker
    const ignoreRecurringLowerPercentage =
      percentage < currentPercentage &&
      history.some(
        (previousPercentage) =>
          Math.abs(currentPercentage - previousPercentage) < 0.5
      ) &&
      history.some(
        (previousPercentage) =>
          Math.abs(detectedPercentage - previousPercentage) < 0.5
      );

    history.push(detectedPercentage);
    if (history.length > averageHistorySize)
      history.splice(0, history.length - averageHistorySize);

    if (ignoreRecurringLowerPercentage) {
      return;
    }
    return percentage;
  }

  idleHandler = async (
    runId,
    buffer,
    detectColored,
    offsetPercentage,
    detectHorizontal,
    currentHorizontalPercentage,
    detectVertical,
    currentVerticalPercentage,
    ratio,
    allowedToTransfer,
    averageHistorySize,
    allowedAnomaliesPercentage,
    allowedUnevenBarsPercentage,
    callback
  ) => {
    if (this.runId !== runId) return;

    let canvasInfo;
    let bufferCtx;
    try {
      const start = performance.now();

      if (
        this.worker.isFallbackWorker ||
        !allowedToTransfer ||
        !buffer.transferToImageBitmap ||
        !buffer.getContext
      ) {
        if (!this.canvas) {
          this.canvas = new SafeOffscreenCanvas(
            512,
            512
            // Math.min(buffer.videoWidth || buffer.width || 512, 512),
            // Math.min(buffer.videoHeight || buffer.height || 512, 512)
          );
          // Smallest size to prevent many garbage collections caused by transferToImageBitmap
          this.ctx = undefined;
        }

        if (
          !this.ctx ||
          (this.ctx?.isContextLost && this.ctx.isContextLost())
        ) {
          this.ctx = this.canvas.getContext('2d', {
            // alpha: false, // Decreases performance on some platforms
            desynchronized: true,
          });
          this.ctx.imageSmoothingEnabled = true;
        }

        this.ctx.drawImage(buffer, 0, 0, this.canvas.width, this.canvas.height);
        canvasInfo =
          this.worker.isFallbackWorker || !this.canvas.transferToImageBitmap
            ? {
                canvas: this.canvas,
                ctx: this.ctx,
              }
            : {
                bitmap: this.canvas.transferToImageBitmap(),
              };
      } else {
        bufferCtx = buffer.getContext('2d');
        if (bufferCtx instanceof Promise) bufferCtx = await bufferCtx;
        if (
          bufferCtx &&
          (!bufferCtx.isContextLost || !bufferCtx.isContextLost())
        ) {
          canvasInfo = {
            bitmap: buffer.transferToImageBitmap(),
          };
        }
      }

      if (this.runId !== runId) {
        if (canvasInfo?.bitmap) {
          canvasInfo.bitmap.close();
        }
        return;
      }

      if (!canvasInfo) {
        this.running = false;
        return;
      }

      this.ambientlight.stats.updateBarDetectionImage(
        canvasInfo.bitmap ?? canvasInfo.canvas
      );

      const stack = new Error().stack;
      const onMessagePromise = new Promise(
        function onMessagePromise(resolve, reject) {
          this.worker.onerror = (err) => reject(err);
          this.worker.onmessage = async (e) => {
            try {
              if (e.data.id !== this.runId) {
                // console.warn('Ignoring old bar detection percentage:',
                //   this.runId, e.data.id, e.data.horizontalPercentage,  e.data.verticalPercentage)
                // console.log(e.data.id, 'onmessage but discarded')
                resolve();
                return;
              }
              if (e.data.error) {
                const error = e.data.error;
                // Readable name for the worker script
                error.stack = error.stack.replace(
                  /blob:.+?:\/.+?:/g,
                  'extension://scripts/bar-detection-worker.js:'
                );
                appendErrorStack(stack, error);
                throw error;
              }

              const { horizontalBarSizeInfo = {}, verticalBarSizeInfo = {} } =
                e.data;

              const firstDetection =
                this.history.horizontal.length === 0 &&
                this.history.vertical.length === 0;

              let horizontalPercentage = this.averagePercentage(
                horizontalBarSizeInfo.percentage,
                currentHorizontalPercentage || 0,
                this.history.horizontal,
                averageHistorySize
              );
              let verticalPercentage = this.averagePercentage(
                verticalBarSizeInfo.percentage,
                currentVerticalPercentage || 0,
                this.history.vertical,
                averageHistorySize
              );
              let barsFound =
                horizontalPercentage !== undefined ||
                verticalPercentage !== undefined;

              // console.log(currentHorizontalPercentage, horizontalBarSizeInfo.percentage, horizontalPercentage, this.history.horizontal)
              await this.ambientlight.stats.updateBarDetectionResult(
                barsFound,
                horizontalBarSizeInfo,
                verticalBarSizeInfo,
                horizontalPercentage ?? currentHorizontalPercentage ?? 0,
                verticalPercentage ?? currentVerticalPercentage ?? 0
              );

              if (e.data.id !== this.runId) {
                // console.warn('Ignoring old bar detection percentage:',
                //   this.runId, e.data.id, e.data.horizontalPercentage,  e.data.verticalPercentage)
                // console.log(e.data.id, 'onmessage but discarded after updateBarDetectionResult')
                resolve();
                return;
              }

              if (firstDetection) {
                if (horizontalPercentage === undefined)
                  horizontalPercentage = 0;
                if (verticalPercentage === undefined) verticalPercentage = 0;
                barsFound = true;
              }

              const barsChanged =
                (barsFound &&
                  horizontalPercentage !== undefined &&
                  horizontalPercentage !== currentHorizontalPercentage) ||
                (verticalPercentage !== undefined &&
                  verticalPercentage !== currentVerticalPercentage);

              const detectedLargeChange =
                (horizontalBarSizeInfo.percentage !== undefined &&
                  Math.abs(
                    horizontalBarSizeInfo.percentage -
                      (currentHorizontalPercentage || 0)
                  ) > 0.5) ||
                (verticalBarSizeInfo.percentage !== undefined &&
                  Math.abs(
                    verticalBarSizeInfo.percentage -
                      (currentVerticalPercentage || 0)
                  ) > 0.5);

              if (barsChanged || detectedLargeChange) {
                this.changes.push(performance.now());
              }

              if (barsChanged) {
                callback(horizontalPercentage, verticalPercentage);
              }

              // console.log(e.data.id, 'onmessage received', barsChanged, horizontalPercentage, verticalPercentage)
              resolve();
            } catch (ex) {
              reject(ex);
            }
          };
        }.bind(this)
      );
      this.worker.postMessage(
        {
          id: runId,
          canvasInfo,
          detectColored,
          offsetPercentage,
          detectHorizontal,
          currentHorizontalPercentage,
          detectVertical,
          currentVerticalPercentage,
          ratio,
          allowedAnomaliesPercentage,
          allowedUnevenBarsPercentage,
          xOffsetSize: averageHistorySize,
        },
        canvasInfo.bitmap ? [canvasInfo.bitmap] : undefined
      );
      await onMessagePromise;
      if (this.runId !== runId) return;

      const now = performance.now();
      const duration = now - start;
      this.ambientlight.stats.addBarDetectionDuration(duration);

      if (this.changes.length > 1) {
        const minuteAgo = performance.now() - 60000;
        this.changes = this.changes.filter((change) => change > minuteAgo);
      } else if (!this.changes.length) {
        this.changes.push(now - 3001);
      }

      const lastChange =
        this.changes.length < 5 ? this.changes[this.changes.length - 1] : now;
      const minThrottle =
        lastChange + 15000 < now ? 1000 : lastChange + 3000 < now ? 500 : 0;
      const throttle = Math.max(
        minThrottle,
        Math.min(5000, Math.pow(duration, 1.2) - 250)
      );
      this.ambientlight.stats.updateBarDetectionInfo(
        throttle,
        this.changes[this.changes.length - 1]
      );

      this.timeout = setTimeout(
        wrapErrorHandler(() => {
          this.timeout = undefined;
          if (this.runId !== runId) return;

          this.running = false;
          //   if(!this.continueAfterRun) return

          //   console.log('    continueAfterRun, retrigger')
          //   this.continueAfterRun = false
          //   this.ambientlight.scheduleBarSizeDetection()
        }),
        throttle
      );
    } catch (ex) {
      // Happens when the video has been emptied or canvas is cleared before the idleCallback has been executed
      const isKnownError =
        ex.message?.includes('ImageBitmap construction failed') || // Chromium
        ex.name === 'DataCloneError'; // Firefox
      if (!isKnownError) {
        ex.details = {
          detectColored,
          offsetPercentage,
          detectHorizontal,
          currentHorizontalPercentage,
          detectVertical,
          currentVerticalPercentage,
          ratio,
          allowedToTransfer,
          buffer: buffer
            ? {
                width: buffer.width,
                height: buffer.height,
                ctx: buffer.ctx?.constructor?.name,
                type: buffer.constructor?.name,
              }
            : undefined,
          bufferCtx: bufferCtx?.constructor?.name,
          canvasInfo: canvasInfo
            ? {
                canvas: canvasInfo?.canvas
                  ? {
                      width: canvasInfo.canvas.width,
                      height: canvasInfo.canvas.height,
                      type: canvasInfo.canvas.constructor?.name,
                    }
                  : undefined,
                ctx: canvasInfo.ctx?.constructor?.name,
                bitmap: canvasInfo?.bitmap
                  ? {
                      width: canvasInfo.bitmap.width,
                      height: canvasInfo.bitmap.height,
                      type: canvasInfo.bitmap.constructor?.name,
                    }
                  : undefined,
              }
            : undefined,
        };
      }

      if (this.runId === runId) {
        if (canvasInfo?.bitmap) {
          canvasInfo.bitmap.close();
        }
        this.running = false;
      }

      if (this.catchedDetectBarSizeError || isKnownError) return;

      this.catchedDetectBarSizeError = true;
      throw ex;
    }
  };
}
