'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { WorkoutPublication } from '@/lib/model';
import { keepCaptionMentions, mentionAtCaret } from '@/lib/post-mentions';
import { suggestMentions, type MentionSuggestion } from '@/lib/remote/social';
import { PersonalAvatar } from './PersonalAvatar';

const CAPTION_LIMIT = 1000;
export default function PublicationCaption({ value, disabled, onChange }: {
  value: WorkoutPublication; disabled: boolean; onChange: (value: WorkoutPublication) => void;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState<ReturnType<typeof mentionAtCaret>>(null);
  const [results, setResults] = useState<{ query: string; people: MentionSuggestion[] } | null>(null);
  const [active, setActive] = useState(-1);
  const query = disabled ? '' : editing?.query ?? '';
  const people = query && results?.query === query ? results.people : [];
  const caption = value.caption ?? '';

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void suggestMentions(query, controller.signal).then(people => {
        if (controller.signal.aborted) return;
        setResults({ query, people });
        setActive(-1);
      }).catch(() => { if (!controller.signal.aborted) setResults({ query, people: [] }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  function trackCaret(input: HTMLTextAreaElement) {
    setEditing(input.selectionStart === input.selectionEnd ? mentionAtCaret(input.value, input.selectionStart) : null);
  }

  function select(person: MentionSuggestion) {
    if (!editing || !textarea.current) return;
    const tail = caption.slice(editing.end);
    const text = `@${person.username}${/^[\s,;:!?)]/.test(tail) ? '' : ' '}`;
    const next = caption.slice(0, editing.start) + text + tail;
    if (next.length > CAPTION_LIMIT) return;
    const caret = editing.start + text.length + (/^\s/.test(tail) ? 1 : 0);
    const mentions = keepCaptionMentions(next, { ...value.mentions, [person.username]: person.owner_id });
    onChange({ ...value, caption: next, mentions });
    setEditing(null);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(caret, caret);
      setEditing(null);
    });
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!people.length || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setEditing(null);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(previous => event.key === 'ArrowDown'
        ? (previous + 1) % people.length : previous <= 0 ? people.length - 1 : previous - 1);
    } else if (event.key === 'Enter' && active >= 0 && active < people.length) {
      event.preventDefault();
      select(people[active]);
    }
  }

  return <div className="workout-caption-setting" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setEditing(null);
  }}>
    <label htmlFor={id}>Descripción de la publicación <small>Opcional</small></label>
    <textarea ref={textarea} id={id} rows={3} maxLength={CAPTION_LIMIT} placeholder="Escribe una descripción"
      value={caption} disabled={disabled} aria-describedby={`${id}-hint`}
      aria-autocomplete="list" aria-controls={people.length ? `${id}-mentions` : undefined}
      aria-activedescendant={people[active] ? `${id}-mention-${active}` : undefined}
      onKeyDown={keyDown} onSelect={event => trackCaret(event.currentTarget)} onChange={event => {
        const next = event.currentTarget.value;
        trackCaret(event.currentTarget);
        onChange({ ...value, caption: next, mentions: keepCaptionMentions(next, value.mentions) });
      }}/>
    {people.length > 0 && <ul id={`${id}-mentions`} className="caption-mentions" role="listbox" aria-label="Cuentas para mencionar">
      {people.map((person, index) => <li key={person.owner_id} role="presentation">
        <button type="button" role="option" id={`${id}-mention-${index}`} aria-selected={index === active}
          onMouseDown={event => event.preventDefault()} onClick={() => select(person)}>
          <PersonalAvatar photo={person.photo} name={person.display_name || person.username}/>
          <span><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span>
        </button>
      </li>)}
    </ul>}
    <div><p id={`${id}-hint`}>Escribe @ y un nombre para mencionar a alguien.</p><small>{caption.length}/{CAPTION_LIMIT}</small></div>
  </div>;
}
