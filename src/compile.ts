import { GetZIndex, Rules } from './types';

type Result<T, E> = { isOk: true; value: T } | { isOk: false; error: E };

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
    private readonly layerZIndex: ReadonlyMap<T, number>,
    private readonly layerSizes: ReadonlyMap<T, number>
  ) {}

  getSafe<T2 extends T>(
    layerId: T2,
    index: number | undefined
  ): Result<number, AbsentLayerError<T2> | LayerIndexOutOfBoundsError<T2>> {
    const zIndex = this.layerZIndex.get(layerId);
    if (zIndex == null) {
      return { isOk: false, error: new AbsentLayerError(layerId) };
    }
    const actualIndex = index || 0;
    const layerSize = this.layerSizes.get(layerId) || 1;
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
    const res = Object.create(null);
    for (const [k, v] of this.layerZIndex.entries()) {
      res[k] = v;
    }
    return res;
  }
}

export class RuleConflictError<T extends string> extends Error {
  constructor(public readonly loop: T[]) {
    super('There is a loop in rules: ' + loop.join('->'));
  }
}

function rememberLayer<T extends string>(
  layer: T,
  upperIndexes: number[][],
  layers: string[],
  indexes: Map<T, number>
) {
  const ind = indexes.get(layer);
  if (ind !== undefined) return ind;
  const newInd = layers.length;
  indexes.set(layer, newInd);
  layers.push(layer);
  upperIndexes.push([]);
  return newInd;
}

function findLoop(adj: number[][], start: number): number[] {
  const currentPath = [start];
  const go = (): boolean => {
    const current = currentPath.at(-1)!;
    for (const a of adj[current]) {
      if (a === currentPath[0]) {
        // Found the loop
        return true;
      }
      currentPath.push(a);
      const foundLoop = go();
      if (foundLoop) return true;
      currentPath.pop();
    }
    return false;
  };
  go();
  return currentPath;
}

function topoSort(adj: number[][]): Result<number[], number[]> {
  const n = adj.length;
  const indegree = adj.map(() => 0);
  const queue: number[] = [];
  const res: number[] = [];

  // Compute indegrees
  for (let i = 0; i < n; i++) {
    for (let next of adj[i]) indegree[next]++;
  }

  // Add all nodes with indegree 0
  // into the queue
  for (let i = 0; i < n; i++) {
    if (indegree[i] === 0) queue.push(i);
  }

  // Kahn’s Algorithm
  while (queue.length > 0) {
    let top = queue.shift()!;
    res.push(top);
    for (let next of adj[top]) {
      indegree[next]--;
      if (indegree[next] === 0) queue.push(next);
    }
  }

  for (let i = 0; i < n; i++) {
    if (indegree[i] > 0) {
      // There is a loop with `i` vertex
      return {
        isOk: false,
        error: findLoop(adj, i),
      };
    }
  }

  return { isOk: true, value: res };
}

export function safeCompile<T extends string>(
  rules: Rules<T>,
  inputLayerSizeDict?: Partial<Record<NoInfer<T>, number>> | null | undefined,
  inputPredefinedZIndices?:
    | Partial<Record<NoInfer<T>, number>>
    | null
    | undefined
): Result<ZIndexProvider<T>, RuleConflictError<T>> {
  const indexes = new Map<T, number>();
  const layers = [] as T[];
  const upperIndexes = [] as number[][];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const lower = rule[0];
    const upper = rule[1];
    const lowerInd = rememberLayer(lower, upperIndexes, layers, indexes);
    const upperInd = rememberLayer(upper, upperIndexes, layers, indexes);
    upperIndexes[lowerInd]!.push(upperInd);
  }

  const layerSizeDict = new Map<T, number>(
    layers.map((layer) => [layer, inputLayerSizeDict?.[layer] || 1])
  );

  const topoRes = topoSort(upperIndexes);
  if (!topoRes.isOk) {
    return {
      isOk: false,
      error: new RuleConflictError(topoRes.error.map((ind) => layers[ind])),
    };
  }

  const topo = topoRes.value;

  const res = new Map<T, number>();
  const nextLayersZIndexes = upperIndexes.map(() => 0);
  for (const ind of topo) {
    const layer = layers[ind];
    const nextLayersZIndex = nextLayersZIndexes[ind];
    const layerZIndex = Math.max(
      nextLayersZIndex,
      inputPredefinedZIndices?.[layer] || 0
    );
    const layerSize = (inputLayerSizeDict?.[layer] as number) || 1;
    res.set(layer, layerZIndex);
    for (const a of upperIndexes[ind]) {
      nextLayersZIndexes[a] = Math.max(
        nextLayersZIndexes[a],
        layerZIndex + layerSize
      );
    }
  }

  return {
    isOk: true,
    value: new ZIndexProvider(res, layerSizeDict),
  };
}

export function compile<T extends string>(
  rules: Rules<T>,
  inputLayerSizeDict?: Partial<Record<NoInfer<T>, number>> | null | undefined,
  inputPredefinedZIndices?:
    | Partial<Record<NoInfer<T>, number>>
    | null
    | undefined
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
