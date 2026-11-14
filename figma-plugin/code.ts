/// <reference types="@figma/plugin-typings" />
import type { NodeKind, SelectedNode, ToMain, ToUI } from './messages';

/*
 * Main thread: the only side that can touch the document. It has no DOM or WebGL,
 * so it hands pixels to the UI iframe, which renders and sends back a PNG or SVG.
 *
 * A Scanlight node keeps its own source: the pixels it was made from sit in its fills
 * as a hidden image paint, and the settings live in plugin data. Selecting it later
 * brings back the exact source and settings, so results stay editable.
 */

const K_SRC = 'src';       // image hash of the source pixels
const K_PARAMS = 'params'; // JSON of the Params used
const K_PRESET = 'preset';
const K_KIND = 'kind';     // NodeKind
const K_ORIG = 'orig';     // fill mode only: visibility of the node's own paints, as JSON booleans

const MAX_SOURCE = 2048;

figma.showUI(__html__, { width: 700, height: 600, themeColors: false, title: 'Scanlight' });

const post = (m: ToUI) => figma.ui.postMessage(m);

/** The source pixels the UI is currently working from. */
let source: { id: string; bytes: Uint8Array } | null = null;
let loadToken = 0;

function isLeaf(n: SceneNode) {
  return !('children' in n) || n.children.length === 0;
}

function canFill(n: SceneNode): n is SceneNode & MinimalFillsMixin {
  return 'fills' in n && n.type !== 'TEXT' && n.fills !== figma.mixed && isLeaf(n);
}

function savedOf(n: SceneNode): SelectedNode['saved'] {
  const kind = n.getPluginData(K_KIND) as NodeKind;
  if (!kind) return null;
  let params: unknown = null;
  try { params = JSON.parse(n.getPluginData(K_PARAMS) || 'null'); } catch { /* corrupt: UI falls back to defaults */ }
  return { kind, params, presetId: n.getPluginData(K_PRESET) || null };
}

async function sourceBytes(n: SceneNode): Promise<Uint8Array> {
  const hash = n.getPluginData(K_SRC);
  if (hash) {
    const img = figma.getImageByHash(hash);
    if (img) {
      try { return await img.getBytesAsync(); } catch { /* fall through to a fresh export */ }
    }
  }
  const scale = Math.min(2, MAX_SOURCE / Math.max(n.width, n.height, 1));
  return n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
}

async function onSelection() {
  const token = ++loadToken;
  const sel = figma.currentPage.selection;
  if (sel.length === 0) return post({ type: 'selection', state: 'none' });
  if (sel.length > 1) return post({ type: 'selection', state: 'multiple' });
  const n = sel[0];
  if (n.width < 1 || n.height < 1 || n.type === 'SLICE') return post({ type: 'selection', state: 'unsupported' });

  post({
    type: 'selection',
    state: 'one',
    node: { id: n.id, name: n.name, width: n.width, height: n.height, canFill: canFill(n), saved: savedOf(n) },
  });

  // Right after applying, the node's source is already known: never re-export the result as a source.
  if (source?.id === n.id) return post({ type: 'source', id: n.id, bytes: source.bytes });
  try {
    const bytes = await sourceBytes(n);
    if (token !== loadToken) return;
    source = { id: n.id, bytes };
    post({ type: 'source', id: n.id, bytes });
  } catch (e) {
    if (token === loadToken) post({ type: 'error', message: `Couldn't read “${n.name}”: ${(e as Error).message}` });
  }
}

/** Hidden paint that carries the source pixels with the node. */
function sourcePaint(hash: string): ImagePaint {
  return { type: 'IMAGE', imageHash: hash, scaleMode: 'FILL', visible: false };
}

function tag(n: BaseNode, kind: NodeKind, srcHash: string, params: string, presetId: string | null) {
  n.setPluginData(K_KIND, kind);
  n.setPluginData(K_SRC, srcHash);
  n.setPluginData(K_PARAMS, params);
  n.setPluginData(K_PRESET, presetId ?? '');
}

/** Puts a new node beside `ref` on the page, 40px to its right. */
function placeBeside(n: SceneNode, ref: SceneNode) {
  const box = ref.absoluteBoundingBox ?? { x: ref.x, y: ref.y, width: ref.width, height: ref.height };
  figma.currentPage.appendChild(n);
  n.x = box.x + box.width + 40;
  n.y = box.y;
}

async function apply(m: Extract<ToMain, { type: 'apply' }>) {
  const node = (await figma.getNodeByIdAsync(m.id)) as SceneNode | null;
  if (!node || node.removed) throw new Error('That layer no longer exists.');
  if (!source || source.id !== node.id) throw new Error('The source is still loading. Try again in a moment.');

  const srcHash = node.getPluginData(K_SRC) || figma.createImage(source.bytes).hash;
  const own = node.getPluginData(K_KIND) as NodeKind;
  // A Scanlight layer updates itself; it never takes a second Scanlight fill on top.
  const mode = m.mode === 'fill' && own === 'layer' ? 'layer' : m.mode;

  if (mode === 'fill') {
    if (!canFill(node)) throw new Error('Only a shape or an empty frame can take the result as its fill.');
    if (!m.png) throw new Error('Nothing to apply.');
    const effect: ImagePaint = { type: 'IMAGE', imageHash: figma.createImage(m.png).hash, scaleMode: 'FILL' };
    const fills = node.fills as readonly Paint[];

    // Already a Scanlight fill with its layout intact: keep the original paints and source, swap the effect.
    let origCount = -1;
    try { origCount = (JSON.parse(node.getPluginData(K_ORIG) || 'null') as boolean[] | null)?.length ?? -1; } catch { /* treat as fresh */ }
    const kept = fills[origCount];
    const intact = origCount >= 0 && kept?.type === 'IMAGE' && kept.imageHash === srcHash;

    if (intact) {
      node.fills = [...fills.slice(0, origCount + 1), effect];
    } else {
      // First time: hide the node's own paints (restorable) and keep the source under the result.
      node.setPluginData(K_ORIG, JSON.stringify(fills.map((p) => p.visible !== false)));
      node.fills = [...fills.map((p) => ({ ...p, visible: false })), sourcePaint(srcHash), effect];
    }
    tag(node, 'fill', srcHash, m.params, m.presetId);
    figma.commitUndo();
    figma.notify(`Applied ${m.label} to “${node.name}”`);
    return;
  }

  // Updating a Scanlight layer of the same kind happens in place; anything else gets a new layer beside it.
  const target = own === mode ? node : null;
  const name = target ? node.name : `${node.name} · ${m.label}`;

  if (mode === 'layer') {
    if (!m.png) throw new Error('Nothing to apply.');
    const effect: ImagePaint = { type: 'IMAGE', imageHash: figma.createImage(m.png).hash, scaleMode: 'FILL' };
    const rect = target && target.type === 'RECTANGLE' ? target : figma.createRectangle();
    if (rect !== target) {
      rect.resize(node.width, node.height);
      rect.name = name;
      placeBeside(rect, node);
    }
    rect.fills = [sourcePaint(srcHash), effect];
    tag(rect, 'layer', srcHash, m.params, m.presetId);
    finishNew(rect, node, m.label);
    return;
  }

  if (!m.svg) throw new Error('Nothing to apply.');
  const frame = figma.createNodeFromSvg(m.svg);
  frame.name = name;
  frame.rescale(node.width / Math.max(frame.width, 1));
  frame.fills = [sourcePaint(srcHash), ...(frame.fills as readonly Paint[])];
  frame.clipsContent = true;
  if (target) {
    // Replace the old vectors where they sit.
    const parent = target.parent!;
    parent.insertChild(parent.children.indexOf(target), frame);
    frame.x = target.x;
    frame.y = target.y;
    target.remove();
  } else {
    placeBeside(frame, node);
  }
  tag(frame, 'vector', srcHash, m.params, m.presetId);
  finishNew(frame, node, m.label);
}

/** Selects the result so further tweaks update it. Its source is the one the UI already has. */
function finishNew(result: SceneNode, from: SceneNode, label: string) {
  if (source) source = { id: result.id, bytes: source.bytes };
  figma.currentPage.selection = [result];
  figma.commitUndo();
  figma.notify(result === from ? `Updated “${result.name}”` : `Added “${result.name}” with ${label}`);
}

async function restore(id: string) {
  const node = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
  if (!node || !canFill(node) || node.getPluginData(K_KIND) !== 'fill') return;
  let vis: boolean[] = [];
  try { vis = JSON.parse(node.getPluginData(K_ORIG) || '[]'); } catch { /* none */ }
  const fills = node.fills as readonly Paint[];
  node.fills = fills.slice(0, vis.length).map((p, i) => ({ ...p, visible: vis[i] }));
  for (const k of [K_KIND, K_SRC, K_PARAMS, K_PRESET, K_ORIG]) node.setPluginData(k, '');
  figma.commitUndo();
  figma.notify(`Restored “${node.name}”`);
  source = null;
  onSelection();
}

figma.on('selectionchange', onSelection);
figma.on('currentpagechange', onSelection);

figma.ui.onmessage = async (m: ToMain) => {
  try {
    if (m.type === 'ready') { source = null; await onSelection(); }
    else if (m.type === 'apply') { await apply(m); post({ type: 'applied', id: m.id }); }
    else if (m.type === 'restore') await restore(m.id);
  } catch (e) {
    post({ type: 'error', message: (e as Error).message });
  }
};
