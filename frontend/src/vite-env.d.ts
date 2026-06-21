/// <reference types="vite/client" />

declare module '*.mjs' {
  export interface SearchableAsset {
    symbol: string;
    name: string;
    type: string;
  }

  export function scoreAssetSearch(asset: SearchableAsset, rawQuery: string): number;
  export function filterAndRankAssets<T extends SearchableAsset>(assets: T[], rawQuery: string): T[];
}
