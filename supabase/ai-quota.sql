-- 内置服务默认关闭；所有访问仅供服务端。
create schema if not exists chigedan_private;
revoke all on schema chigedan_private from public, anon, authenticated;
create table chigedan_private.ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  daily_user_limit integer not null default 3 check (daily_user_limit between 0 and 1000),
  daily_global_limit integer not null default 500 check (daily_global_limit between 0 and 1000000)
);
insert into chigedan_private.ai_settings(id) values (true);
create table chigedan_private.ai_users (
  user_id uuid primary key,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  platform text not null check (platform in ('wechat', 'android', 'unknown'))
);
create table chigedan_private.ai_usage (
  day date not null,
  user_id uuid not null references chigedan_private.ai_users(user_id),
  kind text not null check (kind in ('vision','speech','nutrition')),
  count integer not null default 0 check (count >= 0),
  primary key (day,user_id,kind)
);
alter table chigedan_private.ai_settings enable row level security;
alter table chigedan_private.ai_users enable row level security;
alter table chigedan_private.ai_usage enable row level security;
revoke all on all tables in schema chigedan_private from public, anon, authenticated;
grant usage on schema chigedan_private to service_role;
grant select, insert, update on all tables in schema chigedan_private to service_role;
create function chigedan_private.reserve_ai_call(p_user uuid, p_kind text, p_platform text)
returns text language plpgsql security invoker set search_path = '' as $$
declare settings chigedan_private.ai_settings%rowtype; today date := (now() at time zone 'Asia/Shanghai')::date; used integer; total bigint;
begin
  if p_user is null or p_kind not in ('vision','speech','nutrition') or p_platform not in ('wechat','android','unknown') then return 'invalid'; end if;
  select * into settings from chigedan_private.ai_settings where id = true for update;
  if not settings.enabled then return 'disabled'; end if;
  select coalesce(sum(count),0) into total from chigedan_private.ai_usage where day=today;
  if total >= settings.daily_global_limit then return 'global_limit'; end if;
  select count into used from chigedan_private.ai_usage where day=today and user_id=p_user and kind=p_kind;
  if coalesce(used,0) >= settings.daily_user_limit then return 'user_limit'; end if;
  insert into chigedan_private.ai_users(user_id,platform) values (p_user,p_platform)
  on conflict(user_id) do update set last_used_at=now(), platform=excluded.platform;
  insert into chigedan_private.ai_usage(day,user_id,kind,count) values(today,p_user,p_kind,1)
  on conflict(day,user_id,kind) do update set count=chigedan_private.ai_usage.count+1;
  return 'ok';
end $$;
revoke all on function chigedan_private.reserve_ai_call(uuid,text,text) from public, anon, authenticated;
grant execute on function chigedan_private.reserve_ai_call(uuid,text,text) to service_role;
