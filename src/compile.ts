import { GetZIndex, Rules } from './types';

type Result<T, E> = { isOk: true; value: T } | { isOk: false; error: E };

interface IVertex<T> {
  index: number;
  lowLink: number;
  onStack: boolean;
  visited: boolean;
  key: T;
  successors: IVertex<T>[];
}

function getLoopKeys<T extends string>(
  layers: T[],
  lowerLayers: Partial<Record<T, T[]>>
): T[] | null {
  const vertices: IVertex<T>[] = [];
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
  const stack: IVertex<T>[] = [];
  const components: IVertex<T>[][] = [];
  function stronglyConnect(vertex: IVertex<T>) {
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
      const scc: IVertex<T>[] = [];
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
      const res: T[] = [];
      for (let j = 0; j < component.length; j++) {
        res.push(component[j].key);
      }
      return res;
    }
    return [];
  }
  return null;
}

export class AbsentLayerError<T> extends Error {
  constructor(layerId: T) {
    super('There is no layer with id: ' + JSON.stringify(layerId));
  }
}

export class LayerIndexOutOfBoundsError<T> extends Error {
  constructor(layerId: T, layerSize: number, index: number) {
    super(
      'Layer ' +
        JSON.stringify(layerId) +
        ' cannot contain more than ' +
        layerSize +
        ' items, but got ' +
        index
    );
  }
}

export class ZIndexProvider<T extends string> {
  constructor(
    private readonly layerZIndex: Record<T, number>,
    private readonly layerSizes: Record<T, number>
  ) {}
  getSafe<T2 extends T>(
    layerId: T2,
    index: number | undefined
  ): Result<number, AbsentLayerError<T2> | LayerIndexOutOfBoundsError<T2>> {
    const zIndex = this.layerZIndex[layerId];
    if (zIndex == null) {
      return { isOk: false, error: new AbsentLayerError(layerId) };
    }
    const actualIndex = index || 0;
    const layerSize = this.layerSizes[layerId] || 1;
    if (actualIndex >= layerSize) {
      return {
        isOk: false,
        error: new LayerIndexOutOfBoundsError(layerId, layerSize, actualIndex),
      };
    }
    return { isOk: true, value: zIndex + (index || 0) };
  }
  get(layerId: T, index: number | undefined): number {
    const res = this.getSafe(layerId, index);
    if (res.isOk) {
      return res.value;
    }
    throw res.error;
  }

  getLayersDict(): Record<T, number> {
    return Object.assign(Object.create(null), this.layerZIndex);
  }
}

export class RuleConflictError<T extends string> extends Error {
  constructor(public readonly loop: T[]) {
    super('There is a loop in rules: ' + loop.join('->'));
  }
}

export function safeCompile<T extends string>(
  rules: Rules<T>,
  inputLayerSizeDict?: Partial<Record<T, number>> | null | undefined,
  inputPredefinedZIndices?: Partial<Record<T, number>> | null | undefined
): Result<ZIndexProvider<T>, RuleConflictError<T>> {
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

  const loopedKeys = getLoopKeys(layers, lowerLayers);
  if (loopedKeys) {
    return { isOk: false, error: new RuleConflictError(loopedKeys) };
  }

  const res: Record<T, number> = Object.assign(
    Object.create(null),
    predefinedZIndices
  ) as any;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];

    res[layer] = getMinZIndex(res, fullLayersSizeDict, lowerLayers, layer);
  }

  return {
    isOk: true,
    value: new ZIndexProvider(res, fullLayersSizeDict),
  };
}

function getMinZIndex<T extends string>(
  res: Record<T, number>,
  fullLayersSizeDict: Record<T, number>,
  lowerLayers: Partial<Record<T, T[]>>,
  layerId: T
): number {
  const memoized = res[layerId];
  if (memoized != null) {
    return memoized;
  }
  const lowers = lowerLayers[layerId];
  if (!lowers || lowers.length <= 0) {
    return 0;
  }
  let maxRes =
    getMinZIndex(res, fullLayersSizeDict, lowerLayers, lowers[0]) +
    (fullLayersSizeDict[lowers[0]] || 1);

  for (let i = 0; i < lowers.length; i++) {
    const lower = lowers[i];
    const lowerMinZIndex = getMinZIndex(
      res,
      fullLayersSizeDict,
      lowerLayers,
      lower
    );
    const lowerSize = fullLayersSizeDict[lower] || 1;
    const minHigherThanLower = lowerMinZIndex + lowerSize;
    if (minHigherThanLower > maxRes) {
      maxRes = minHigherThanLower;
    }
  }

  res[layerId] = maxRes;

  return maxRes;
}

export function compile<T extends string>(
  rules: Rules<T>,
  inputLayerSizeDict?: Partial<Record<T, number>> | null | undefined,
  inputPredefinedZIndices?: Partial<Record<T, number>> | null | undefined
): GetZIndex<T> {
  const providerRes = safeCompile(
    rules,
    inputLayerSizeDict,
    inputPredefinedZIndices
  );
  if (!providerRes.isOk) {
    throw providerRes.error;
  }
  const provider = providerRes.value;
  return Object.assign(
    function getZIndex(layerId: T, index: number | undefined) {
      return provider.get(layerId, index);
    },
    {
      zIndexDict: provider.getLayersDict(),
    }
  );
}
