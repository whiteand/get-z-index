export type Rules<T extends string> = readonly (readonly [T, T])[];

type ZIndex = number;

export interface GetZIndex<T extends string> {
  (componentId: T, groupIndex?: number): ZIndex;
  zIndexDict: Record<T, number>;
}
