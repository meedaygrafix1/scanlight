/** Messages between the plugin's main thread (code.ts) and its UI iframe (ui/). */

/** How a result lands in the file. */
export type ApplyMode = 'fill' | 'layer' | 'vector';

/** What kind of Scanlight node is selected, if any. */
export type NodeKind = 'fill' | 'layer' | 'vector';

export interface SelectedNode {
  id: string;
  name: string;
  width: number;
  height: number;
  /** The node is a leaf shape whose fill can be swapped in place. */
  canFill: boolean;
  /** Set when this node was made or edited by Scanlight, so its settings come back. */
  saved: { kind: NodeKind; params: unknown; presetId: string | null } | null;
}

export type ToUI =
  | { type: 'selection'; state: 'none' | 'multiple' | 'unsupported'; node?: undefined }
  | { type: 'selection'; state: 'one'; node: SelectedNode }
  | { type: 'source'; id: string; bytes: Uint8Array }
  | { type: 'applied'; id: string }
  | { type: 'error'; message: string };

export type ToMain =
  | { type: 'ready' }
  | {
      type: 'apply';
      mode: ApplyMode;
      id: string;
      params: string;
      presetId: string | null;
      label: string;
      png?: Uint8Array;
      svg?: string;
    }
  | { type: 'restore'; id: string };
