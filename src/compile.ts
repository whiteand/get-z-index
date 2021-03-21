import { GetZIndex, Rules } from './types';

function traverseAndThrowErrorIfLoop<T extends string>(
  lowerLayers: Partial<Record<T, T[]>>,
  layer: T,
  parents: T[]
) {
  const indexInParents = parents.indexOf(layer);
  if (indexInParents >= 0) {
    const loop = parents.slice(indexInParents);
    loop.push(layer);
    const loopStr = loop.map(layer => JSON.stringify(layer)).join(' > ');
    const loopErrorMessage = `There is loop: ${loopStr}`;
    throw new Error(loopErrorMessage);
  }
  const lowers = lowerLayers[layer] as T[] | undefined;

  if (!lowers) return;

  parents.push(layer);

  for (let j = 0; j < lowers.length; j++) {
    traverseAndThrowErrorIfLoop(lowerLayers, lowers[j], parents);
  }

  parents.pop();
}

function invariantHasNoLoops<T extends string>(
  layers: T[],
  lowerLayers: Partial<Record<T, T[]>>
) {
  for (let i = 0; i < layers.length; i++) {
    traverseAndThrowErrorIfLoop(lowerLayers, layers[i], []);
  }
}

export function compile<T extends string>(
  rules: Rules<T>,
  layerSizeDict: Partial<Record<T, number>> = {}
): GetZIndex<T> {
  const lowerLayers: Partial<Record<T, T[]>> = Object.create(null);
  const fullLayersSizeDict: Record<T, number> = Object.create(null);
  const layers: T[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const lower = rule[0];
    const upper = rule[1];
    const lowers = (lowerLayers[upper] as T[]) || [];
    lowers.push(lower);
    lowerLayers[upper] = lowers;
    if (fullLayersSizeDict[lower] == null) {
      fullLayersSizeDict[lower] = (layerSizeDict[lower] as number) || 1;
      layers.push(lower);
    }
    if (fullLayersSizeDict[upper] == null) {
      fullLayersSizeDict[upper] = (layerSizeDict[upper] as number) || 1;
      layers.push(upper);
    }
  }

  if (__DEV__) {
    invariantHasNoLoops(layers, lowerLayers);
  }

  const res: Record<T, number> = Object.create(null) as any;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];

    res[layer] = getMinZIndex(layer);
  }

  return Object.assign(
    function getZIndex(layerId: T, index: number | undefined) {
      const zIndex = res[layerId];
      if (zIndex == null) {
        throw new Error(
          'There is no layer with id: ' + JSON.stringify(layerId)
        );
      }
      const actualIndex = index || 0;
      const layerSize = fullLayersSizeDict[layerId] || 1;
      if (actualIndex >= layerSize) {
        throw new Error(
          'Layer ' +
            JSON.stringify(layerId) +
            ' cannot contain more than ' +
            layerSize +
            ' items'
        );
      }
      return zIndex + (index || 0);
    },
    {
      zIndexDict: res,
    }
  );

  function getMinZIndex(layerId: T): number {
    const memoized = res[layerId];
    if (memoized != null) {
      return memoized;
    }
    const lowers = lowerLayers[layerId];
    if (!lowers || lowers.length <= 0) {
      return 0;
    }
    let maxRes = getMinZIndex(lowers[0]) + (fullLayersSizeDict[lowers[0]] || 1);

    for (let i = 0; i < lowers.length; i++) {
      const lower = lowers[i];
      const lowerMinZIndex = getMinZIndex(lower);
      const lowerSize = fullLayersSizeDict[lower] || 1;
      const minHigherThanLower = lowerMinZIndex + lowerSize;
      if (minHigherThanLower > maxRes) {
        maxRes = minHigherThanLower;
      }
    }

    res[layerId] = maxRes;

    return maxRes;
  }
}
