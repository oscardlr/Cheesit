-- Register the new price in the existing account validator. Preserve its
-- security mode, search path and grants, along with all historical prices.
do $migration$
declare
  definition text := pg_get_functiondef('public.cheesit_validate_data(jsonb)'::regprocedure);
  old_price_list text := 'when ''legend'' then -500 else null end';
  new_price_list text := 'when ''legend'' then -500 when ''master'' then -1000 else null end';
begin
  if position(old_price_list in definition) = 0 then
    raise exception 'Unexpected crate price validator. Review master crate migration.';
  end if;
  execute replace(definition, old_price_list, new_price_list);
end
$migration$;
