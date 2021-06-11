import { GetZIndex, Rules } from './types';

interface IVertex {
  index: number;
  lowLink: number;
  onStack: boolean;
  visited: boolean;
  key: string;
  successors: IVertex[];
}

function getLoopKeys<T extends string>(
  layers: T[],
  lowerLayers: Partial<Record<T, T[]>>
): string[] | null {
  const vertices: IVertex[] = [];
  const verticesDict = Object.create(null);
  for (let i = 0; i < layers.length; i++) {
    const vertex = {
      index: -1,
      lowLink: -1,
      onStack: false,
      visited: false,
      successors: [],
      key: layers[i],
    };
    verticesDict[layers[i]] = vertex;
    vertices.push(vertex);
  }
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const lowers = lowerLayers[layer];
    if (!lowers) continue;
    for (let j = 0; j < lowers.length; j++) {
      const lower = lowers[j];
      if (lower === layer) {
        return [layer];
      }
      verticesDict[layer].successors.push(verticesDict[lower]);
    }
  }
  let index = 0;
  const stack: IVertex[] = [];
  const components: IVertex[][] = [];
  function stronglyConnect(vertex: IVertex) {
    vertex.index = index;
    vertex.lowLink = index;
    index++;
    stack.push(vertex);
    vertex.onStack = true;
    for (let i = 0; i < vertex.successors.length; i++) {
      const successor = vertex.successors[i];
      if (successor.index < 0) {
        stronglyConnect(successor);
        vertex.lowLink = Math.min(vertex.lowLink, successor.lowLink);
      } else if (successor.onStack) {
        vertex.lowLink = Math.min(vertex.lowLink, successor.index);
      }
    }

    if (vertex.lowLink === vertex.index) {
      const scc: IVertex[] = [];
      let w;
      do {
        w = stack.pop();
        if (!w) break;
        w.onStack = false;
        scc.push(w);
      } while (w !== vertex);

      components.push(scc);
    }
  }
  for (let i = 0; i < vertices.length; i++) {
    if (vertices[i].index < 0) {
      stronglyConnect(vertices[i]);
    }
  }
  if (components.length !== layers.length) {
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      if (component.length <= 1) continue;
      const res: string[] = [];
      for (let j = 0; j < component.length; j++) {
        res.push(component[j].key);
      }
      return res;
    }
    return [];
  }
  return null;
}

export function compile<T extends string>(
  rules: Rules<T>,
  inputLayerSizeDict?: Partial<Record<T, number>> | null | undefined,
  inputPredefinedZIndices?: Partial<Record<T, number>> | null | undefined
): GetZIndex<T> {
  const lowerLayers: Partial<Record<T, T[]>> = Object.create(null);
  const fullLayersSizeDict: Record<T, number> = Object.create(null);
  const layers: T[] = [];
  const layerSizeDict = inputLayerSizeDict || Object.create(null);
  const predefinedZIndices = inputPredefinedZIndices || Object.create(null);

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
    const loopedKeys = getLoopKeys(layers, lowerLayers);
    if (loopedKeys) {
      throw new Error('There is a loop in rules: ' + loopedKeys.join('->'));
    }
  }

  const res: Record<T, number> = Object.assign(
    Object.create(null),
    predefinedZIndices
  ) as any;

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
