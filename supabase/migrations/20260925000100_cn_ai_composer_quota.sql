create table cn_demo.ai_compose_usage (
  quota_key text not null,
  period date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (quota_key, period)
);

alter table cn_demo.ai_compose_usage enable row level security;
revoke all on cn_demo.ai_compose_usage from public, anon, authenticated;
grant select, insert, update, delete on cn_demo.ai_compose_usage to service_role;

-- Called only by the CN Edge API with its service-role client. The transaction
-- lock makes the account and shared limits one atomic decision.
create or replace function cn_demo.claim_ai_compose(p_role text, p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := (clock_timestamp() at time zone 'UTC')::date;
  v_key text;
  v_count integer;
  v_updated timestamptz;
  v_global integer;
  v_ticket timestamptz := clock_timestamp();
begin
  if p_role not in ('admin', 'teacher') or p_user_id < 1 then
    raise exception 'invalid account';
  end if;
  v_key := p_role || ':' || p_user_id::text;
  perform pg_catalog.pg_advisory_xact_lock(21654, 1);
  delete from cn_demo.ai_compose_usage where period < v_period - 2;
  select request_count, updated_at into v_count, v_updated
    from cn_demo.ai_compose_usage where quota_key = v_key and period = v_period;
  select request_count into v_global
    from cn_demo.ai_compose_usage where quota_key = 'all' and period = v_period;
  if coalesce(v_count, 0) >= 10 or coalesce(v_global, 0) >= 30 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'daily_limit',
      'used', coalesce(v_count, 0), 'global_exhausted', coalesce(v_global, 0) >= 30);
  end if;
  if v_updated > v_ticket - interval '5 seconds' then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'cooldown',
      'used', coalesce(v_count, 0));
  end if;
  insert into cn_demo.ai_compose_usage(quota_key, period, request_count, updated_at)
    values(v_key, v_period, 1, v_ticket)
    on conflict(quota_key, period) do update set
      request_count = cn_demo.ai_compose_usage.request_count + 1,
      updated_at = excluded.updated_at;
  insert into cn_demo.ai_compose_usage(quota_key, period, request_count, updated_at)
    values('all', v_period, 1, v_ticket)
    on conflict(quota_key, period) do update set
      request_count = cn_demo.ai_compose_usage.request_count + 1,
      updated_at = excluded.updated_at;
  return pg_catalog.jsonb_build_object('allowed', true, 'used', coalesce(v_count, 0) + 1);
end;
$$;

revoke all on function cn_demo.claim_ai_compose(text, bigint) from public, anon, authenticated;
grant execute on function cn_demo.claim_ai_compose(text, bigint) to service_role;
