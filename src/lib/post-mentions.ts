export type PostMentions = Record<string, string>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const username = /^[a-z0-9_][a-z0-9._]{2,29}$/;

export function isPostMentions(value: unknown): value is PostMentions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 250 && entries.every(([handle, owner]) =>
    username.test(handle) && typeof owner === 'string' && uuid.test(owner));
}

export function captionMentions(caption: string, mentions: PostMentions = {}) {
  return Array.from(caption.matchAll(/(?<![\p{L}\p{N}_@])@([A-Za-z0-9_][A-Za-z0-9._]*)/gu)).flatMap(match => {
    const token = match[1].toLowerCase();
    const handle = Object.hasOwn(mentions, token) ? token : token.replace(/\.+$/, '');
    if (!Object.hasOwn(mentions, handle)) return [];
    return [{ start: match.index, end: match.index + handle.length + 1, owner: mentions[handle], handle }];
  });
}

export function mentionAtCaret(text: string, caret: number) {
  const before = text.slice(0, caret).match(/(?<![\p{L}\p{N}_@])@([\p{L}\p{M}\p{N}_.]{1,80})$/u);
  if (!before) return null;
  const after = text.slice(caret).match(/^[\p{L}\p{M}\p{N}_.]*/u)?.[0] ?? '';
  return { query: before[1].toLowerCase(), start: before.index!, end: caret + after.length };
}

export function keepCaptionMentions(caption: string, mentions?: PostMentions): PostMentions | undefined {
  const active = captionMentions(caption, mentions);
  return active.length ? Object.fromEntries(active.map(({ handle, owner }) => [handle, owner])) : undefined;
}
