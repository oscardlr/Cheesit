-- Captions belong to a publication, never to the private workout notes.
-- Keep the original feed rollout immutable and extend its installed functions
-- without replacing unrelated account/training rules.
alter table public.cheesit_social_workouts add column caption text
  check(caption is null or length(caption)<=1000);

do $migration$
declare
  definition text;
  anchors text[] := array[
    $old$metadata-array['published','photoPath']$old$,
    $old$      if metadata ? 'photoPath' and$old$,
    $old$published,published_at,photo_path)$old$,
    $old$else null end,path)$old$,
    $old$published=excluded.published,photo_path=excluded.photo_path,$old$,
    $old$or cheesit_social_workouts.photo_path is distinct from excluded.photo_path;$old$
  ];
  replacements text[] := array[
    $new$metadata-array['published','photoPath','caption']$new$,
    $new$      if metadata ? 'caption' and (jsonb_typeof(metadata->'caption') is distinct from 'string' or
        length(metadata->>'caption')>1000) then
        raise exception 'invalid publication caption' using errcode='22023';
      end if;
      if metadata ? 'photoPath' and$new$,
    $new$published,published_at,photo_path,caption)$new$,
    $new$else null end,path,nullif(btrim(w->'publication'->>'caption'),''))$new$,
    $new$published=excluded.published,photo_path=excluded.photo_path,caption=excluded.caption,$new$,
    $new$or cheesit_social_workouts.photo_path is distinct from excluded.photo_path
        or cheesit_social_workouts.caption is distinct from excluded.caption;$new$
  ];
  i integer;
begin
  definition:=pg_get_functiondef('cheesit_private.sync_social_activity()'::regprocedure);
  for i in 1..array_length(anchors,1) loop
    if length(definition)-length(replace(definition,anchors[i],'')) <> length(anchors[i]) then
      raise exception 'Unexpected activity projection definition at caption patch %',i;
    end if;
    definition:=replace(definition,anchors[i],replacements[i]);
  end loop;
  execute definition;

  definition:=pg_get_functiondef('public.cheesit_read_feed(uuid,text,timestamp with time zone,uuid)'::regprocedure);
  if length(definition)-length(replace(definition,$old$'photo_path',w.photo_path,$old$,'')) <> length($old$'photo_path',w.photo_path,$old$) then
    raise exception 'Unexpected feed definition for caption patch';
  end if;
  execute replace(definition,$old$'photo_path',w.photo_path,$old$,$new$'photo_path',w.photo_path,'caption',w.caption,$new$);
end;
$migration$;

-- CREATE OR REPLACE preserves privileges. Repeat the original boundary to
-- document that only the read RPC is API-callable; projection is trigger-only.
revoke all on function cheesit_private.sync_social_activity() from public,anon,authenticated;
revoke all on function public.cheesit_read_feed(uuid,text,timestamptz,uuid) from public,anon;
grant execute on function public.cheesit_read_feed(uuid,text,timestamptz,uuid) to authenticated;
