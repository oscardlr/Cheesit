/**
 * Offline visual verification; never loads or writes application saves.
 * Run: node --import tsx scripts/verify-character-combinations.ts
 * All 32,256 outfits are rasterized at thumbnail resolution; individual items and
 * a pairwise covering set are also rendered larger into local contact sheets.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { CHARACTER_ART, CHARACTER_ATLAS, CHARACTER_MASTER, CHARACTER_MASKS, CHARACTER_SLOT_ORDER, CHARACTER_VIEWBOX, COMPANION_ART } from '../src/lib/character-art';
import { CHARACTER_GEAR_SLOTS, CHARACTER_EQUIPMENT_COMBINATIONS, enumerateCharacterEquipment, type CharacterEquipment } from '../src/lib/character-catalog';

type Rect = readonly [number, number, number, number];
type Pixels = { rgba: Uint8Array; words: Uint32Array; visible: Uint32Array };
type RenderSet = { width: number; height: number; master: Pixels; masterWithoutHand: Pixels; gear: Map<string, Pixels>; fronts: Map<string, Pixels> };
const root = process.cwd(), output = path.join(root, 'docs/block-two');
await mkdir(output, { recursive: true });
const atlas = await readFile(path.join(root, 'public', CHARACTER_ATLAS.src));
const master = await readFile(path.join(root, 'public', CHARACTER_MASTER.src));
const frame = CHARACTER_VIEWBOX.split(/\s+/).map(Number);
const failures: string[] = [];
const maskPath = (value: string) => (CHARACTER_MASKS as Record<string, string>)[value] ?? value;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
const slots = CHARACTER_GEAR_SLOTS;
const cropped = new Map<string, Buffer>();
for (const gear of GEAR) {
  const art = CHARACTER_ART[gear.id];
  if (!art) { failures.push(`Missing artwork: ${gear.id}`); continue; }
  const [x, y, width, height] = art.source;
  if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > CHARACTER_ATLAS.width || y + height > CHARACTER_ATLAS.height) failures.push(`Invalid source: ${gear.id}`);
  const [tx, ty, tw, th] = art.target;
  if (tx < frame[0] || ty < frame[1] || tx + tw > frame[0] + frame[2] || ty + th > frame[1] + frame[3]) failures.push(`Target outside frame: ${gear.id}`);
  if (Math.abs(tw / width - th / height) > .001) failures.push(`Nonuniform scale: ${gear.id}`);
  cropped.set(gear.id, await sharp(atlas).extract({ left: x, top: y, width, height }).png().toBuffer());
}
if (failures.length) throw new Error(failures.join('\n'));

function sparse(data: Uint8Array): Pixels {
  const rgba = new Uint8Array(data), words = new Uint32Array(rgba.buffer);
  const visible: number[] = [];
  for (let index = 0; index < words.length; index++) if (rgba[index * 4 + 3]) visible.push(index);
  return { rgba, words, visible: Uint32Array.from(visible) };
}
function composite(target: Uint8Array, layer: Pixels) {
  const targetWords = new Uint32Array(target.buffer, target.byteOffset, target.length / 4);
  const source = layer.rgba;
  for (const index of layer.visible) {
    const offset = index * 4, alpha = source[offset + 3];
    if (alpha === 255 || target[offset + 3] === 0) { targetWords[index] = layer.words[index]; continue; }
    const sa = alpha / 255, da = target[offset + 3] / 255, remaining = da * (1 - sa), combined = sa + remaining;
    target[offset] = Math.round((source[offset] * sa + target[offset] * remaining) / combined);
    target[offset + 1] = Math.round((source[offset + 1] * sa + target[offset + 1] * remaining) / combined);
    target[offset + 2] = Math.round((source[offset + 2] * sa + target[offset + 2] * remaining) / combined);
    target[offset + 3] = Math.round(combined * 255);
  }
}
async function renderSet(width: number): Promise<RenderSet> {
  const height = Math.round(width * frame[3] / frame[2]);
  async function image(buffer: Buffer, target: readonly number[], mask?: string, eraseHand = false) {
    const definitions = `${mask ? `<clipPath id="clip"><path d="${maskPath(mask)}"/></clipPath>` : ''}${eraseHand ? `<mask id="erase-hand" maskUnits="userSpaceOnUse" x="${frame[0]}" y="${frame[1]}" width="${frame[2]}" height="${frame[3]}"><rect x="${frame[0]}" y="${frame[1]}" width="${frame[2]}" height="${frame[3]}" fill="white"/><path d="${CHARACTER_MASKS.handReplacement}" fill="black"/></mask>` : ''}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${CHARACTER_VIEWBOX}"><defs>${definitions}</defs><image x="${target[0]}" y="${target[1]}" width="${target[2]}" height="${target[3]}" href="data:image/png;base64,${buffer.toString('base64')}" preserveAspectRatio="xMidYMid meet"${mask ? ' clip-path="url(#clip)"' : ''}${eraseHand ? ' mask="url(#erase-hand)"' : ''}/></svg>`;
    const { data } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return sparse(data);
  }
  const gear = new Map<string, Pixels>(), fronts = new Map<string, Pixels>();
  for (const definition of GEAR) {
    const art = CHARACTER_ART[definition.id];
    gear.set(definition.id, await image(cropped.get(definition.id)!, art.target));
    if (art.foregroundMask) fronts.set(definition.id, await image(cropped.get(definition.id)!, art.target, art.foregroundMask));
  }
  const masterRect = [0, 0, CHARACTER_MASTER.width, CHARACTER_MASTER.height];
  return { width, height, master: await image(master, masterRect), masterWithoutHand: await image(master, masterRect, undefined, true), gear, fronts };
}
function render(equipment: CharacterEquipment, set: RenderSet) {
  const result = new Uint8Array(set.width * set.height * 4);
  const layers: { order: number; pixels: Pixels }[] = [{ order: 1, pixels: equipment.hand && CHARACTER_ART[equipment.hand].replacesHand ? set.masterWithoutHand : set.master }];
  for (const slot of slots) {
    const id = equipment[slot];
    if (!id) continue;
    layers.push({ order: CHARACTER_SLOT_ORDER[slot], pixels: set.gear.get(id)! });
    if (set.fronts.has(id)) layers.push({ order: 4, pixels: set.fronts.get(id)! });
  }
  for (const layer of layers.sort((left, right) => left.order - right.order)) composite(result, layer.pixels);
  return result;
}

const small = await renderSet(96), large = await renderSet(192);
const pixelResults = new Map<string, number>();
const aggregateHash = createHash('sha256');
const options = slots.map(slot => [undefined, ...GEAR.filter(gear => gear.slot === slot).map(gear => gear.id)]);
const pairOffsets = new Map<string, number>();
let pairCount = 0;
for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) {
  pairOffsets.set(`${a}:${b}`, pairCount);
  pairCount += options[a].length * options[b].length;
}
const candidates: { equipment: CharacterEquipment; pairs: Uint16Array; index: number }[] = [];
let count = 0, minPixels = Infinity, maxPixels = 0;
const started = Date.now();
for (const equipment of enumerateCharacterEquipment()) {
  const rgba = render(equipment, small);
  let pixels = 0;
  for (let offset = 3; offset < rgba.length; offset += 4) if (rgba[offset]) pixels++;
  minPixels = Math.min(minPixels, pixels); maxPixels = Math.max(maxPixels, pixels);
  if (!pixels) failures.push(`Empty outfit at index ${count}`);
  const hash = createHash('sha256').update(rgba).digest('hex');
  pixelResults.set(hash, (pixelResults.get(hash) ?? 0) + 1);
  aggregateHash.update(`${JSON.stringify(equipment)}:${hash}\n`);
  const selected = slots.map((slot, index) => options[index].indexOf(equipment[slot]));
  const pairs: number[] = [];
  for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) pairs.push(pairOffsets.get(`${a}:${b}`)! + selected[a] * options[b].length + selected[b]);
  candidates.push({ equipment, pairs: Uint16Array.from(pairs), index: count });
  count++;
  if (count % 8192 === 0) console.log(`Rasterized ${count}/${CHARACTER_EQUIPMENT_COMBINATIONS} outfits`);
}
if (count !== CHARACTER_EQUIPMENT_COMBINATIONS) failures.push(`Incorrect cardinality: ${count}`);
const baseHash = createHash('sha256').update(render({}, small)).digest('hex');
const individual = [{ label: 'Equipamiento inicial', equipment: {} as CharacterEquipment }, ...GEAR.map(gear => ({ label: gear.id, equipment: { [gear.slot]: gear.id } as CharacterEquipment }))];
for (const entry of individual.slice(1)) if (createHash('sha256').update(render(entry.equipment, small)).digest('hex') === baseHash) failures.push(`Fully hidden individual item: ${entry.label}`);

const remaining = new Set(Array.from({ length: pairCount }, (_, index) => index));
const pairwise: typeof candidates = [];
while (remaining.size) {
  let best: (typeof candidates)[number] | undefined, bestGain = 0;
  for (const candidate of candidates) {
    let gain = 0;
    for (const pair of candidate.pairs) if (remaining.has(pair)) gain++;
    if (gain > bestGain) { best = candidate; bestGain = gain; if (gain === 10) break; }
  }
  if (!best) { failures.push(`Uncovered slot pairs: ${remaining.size}`); break; }
  pairwise.push(best);
  for (const pair of best.pairs) remaining.delete(pair);
}
const contactFiles: string[] = [];
async function contact(entries: { label: string; equipment: CharacterEquipment }[], name: string, heading: string) {
  const columns = 7, cardWidth = 216, cardHeight = 328, pageSize = 42;
  for (let start = 0; start < entries.length; start += pageSize) {
    const page = entries.slice(start, start + pageSize), rows = Math.ceil(page.length / columns);
    const width = columns * cardWidth, height = rows * cardHeight + 70;
    const overlays: OverlayOptions[] = [];
    const header = `<svg width="${width}" height="70"><rect width="100%" height="100%" fill="#15111c"/><text x="18" y="28" font-family="Arial" font-size="22" fill="#f1e9fa">${escape(heading)}</text><text x="18" y="52" font-family="Arial" font-size="13" fill="#bba8c9">Maestro y prendas a escala uniforme · ${start + 1}–${start + page.length} de ${entries.length}</text></svg>`;
    overlays.push({ input: Buffer.from(header), left: 0, top: 0 });
    for (const [index, entry] of page.entries()) {
      const png = await sharp(Buffer.from(render(entry.equipment, large)), { raw: { width: large.width, height: large.height, channels: 4 } }).png().toBuffer();
      const text = slots.filter(slot => entry.equipment[slot]).map((slot, line) => `<text x="12" y="${273 + line * 11}" font-family="Arial" font-size="9" fill="#bba8c9">${slot}: ${escape(entry.equipment[slot]!)}</text>`).join('');
      const svg = `<svg width="${cardWidth}" height="${cardHeight}"><defs><pattern id="checks" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 0H16V16H0Z" fill="#292430"/><path d="M0 0H8V8H0ZM8 8H16V16H8Z" fill="#38313f"/></pattern></defs><rect width="100%" height="100%" fill="#211a2b"/><text x="12" y="22" font-family="Arial" font-size="12" fill="#f1e9fa">${escape(entry.label)}</text><rect x="8" y="31" width="200" height="233" fill="url(#checks)"/><image x="12" y="33" width="192" height="${large.height}" href="data:image/png;base64,${png.toString('base64')}"/>${text}</svg>`;
      overlays.push({ input: Buffer.from(svg), left: index % columns * cardWidth, top: 70 + Math.floor(index / columns) * cardHeight });
    }
    const suffix = entries.length > pageSize ? `-${Math.floor(start / pageSize) + 1}` : '';
    const file = `${name}${suffix}.png`;
    await sharp({ create: { width, height, channels: 4, background: '#15111c' } }).composite(overlays).png().toFile(path.join(output, file));
    contactFiles.push(file);
  }
}
await contact(individual, 'catalog-after', 'CHEESIT · Cada cosmético sobre el personaje maestro');
await contact(pairwise.map(entry => ({ label: `Combinación ${entry.index}`, equipment: entry.equipment })), 'slot-interactions', 'CHEESIT · Todas las interacciones entre pares de ranuras');
const heads = [undefined, ...GEAR.filter(gear => gear.slot === 'head').map(gear => gear.id)];
const hands = [undefined, ...GEAR.filter(gear => gear.slot === 'hand').map(gear => gear.id)];
const headHandPairs = heads.flatMap(head => hands.map(hand => ({ label: `${head ?? 'Sin cabeza'} / ${hand ?? 'Sin mano'}`, equipment: { ...(head ? { head } : {}), ...(hand ? { hand } : {}) } as CharacterEquipment })));
await contact(headHandPairs, 'head-hand-interactions', 'CHEESIT · Los 64 cruces de cabeza y mano, incluidos ambos vacíos');
const companionSources: Record<string, readonly number[]> = {};
const companionCards: OverlayOptions[] = [];
// Only independent companion crops present in the wardrobe atlas are inspected here.
const atlasCompanions = COMPANIONS.filter(companion => COMPANION_ART[companion.id]);
for (const companion of atlasCompanions) {
  const art = COMPANION_ART[companion.id];
  const source = Array.isArray(art) ? art : art.source;
  companionSources[companion.id] = source;
  const [x, y, width, height] = source;
  const png = await sharp(atlas).extract({ left: x, top: y, width, height }).png().toBuffer();
  const card = `<svg width="288" height="520"><defs><pattern id="checks" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 0H16V16H0Z" fill="#292430"/><path d="M0 0H8V8H0ZM8 8H16V16H8Z" fill="#38313f"/></pattern></defs><rect width="100%" height="100%" fill="#211a2b"/><text x="14" y="24" font-family="Arial" font-size="16" fill="#f1e9fa">${escape(companion.id)}</text><rect x="8" y="36" width="272" height="440" fill="url(#checks)"/><image x="16" y="42" width="256" height="428" href="data:image/png;base64,${png.toString('base64')}" preserveAspectRatio="xMidYMid meet"/><text x="14" y="501" font-family="Arial" font-size="11" fill="#bba8c9">${escape(companion.name)}</text></svg>`;
  companionCards.push({ input: Buffer.from(card), left: companionCards.length * 288, top: 0 });
}
await sharp({ create: { width: atlasCompanions.length * 288, height: 520, channels: 4, background: '#15111c' } }).composite(companionCards).png().toFile(path.join(output, 'companions-after.png'));
contactFiles.push('companions-after.png');
const report = {
  atlas: CHARACTER_ATLAS, master: CHARACTER_MASTER, viewBox: CHARACTER_VIEWBOX,
  equipmentCombinations: count, renderedCombinations: count, rasterSize: [small.width, small.height],
  renderElapsedMs: Date.now() - started, uniformScale: true, missingResources: 0,
  targetOverflows: 0, minVisiblePixels: minPixels, maxVisiblePixels: maxPixels,
  uniquePixelResults: pixelResults.size, aggregateRasterSha256: aggregateHash.digest('hex'),
  slotPairCombinations: pairCount, coveredSlotPairCombinations: pairCount - remaining.size,
  pairwiseOutfits: pairwise.map(entry => ({ index: entry.index, equipment: entry.equipment })),
  newIllustrations: Object.values(CHARACTER_ART).filter(art => art.origin === 'tailored').length,
  newHeadAndHandIllustrations: GEAR.filter(gear => (gear.slot === 'head' || gear.slot === 'hand') && CHARACTER_ART[gear.id].origin === 'tailored').length,
  reusedGearIllustrations: Object.values(CHARACTER_ART).filter(art => art.origin === 'reused').length,
  authoredHandReplacements: Object.values(CHARACTER_ART).filter(art => art.replacesHand).length,
  headHandCombinations: headHandPairs.length,
  reusedCompanionIllustrations: atlasCompanions.length, jointVariants: 0, companionSources, contactFiles,
  failures, scope: 'Mechanical transparent-layer rasterization of the shared manifest; browser animation and responsive verification are separate checks.',
};
await writeFile(path.join(output, 'composition-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ renderedCombinations: count, uniquePixelResults: pixelResults.size, pairwiseOutfits: pairwise.length, pairCount, contactFiles, failures }, null, 2));
if (failures.length) process.exitCode = 1;
