create function public.chigedan_reserve(p_user uuid,p_kind text,p_platform text)
returns text language sql security invoker set search_path='' as $$
select case when p_kind is null or p_platform is null then 'invalid'
else chigedan_private.reserve_ai_call(p_user,p_kind,p_platform) end
$$;
revoke all on function public.chigedan_reserve(uuid,text,text) from public,anon,authenticated;
grant execute on function public.chigedan_reserve(uuid,text,text) to service_role;
create view chigedan_private.ai_dashboard with (security_invoker=true) as
select count(*) as total_accounts,
count(*) filter(where (last_used_at at time zone 'Asia/Shanghai')::date=(now() at time zone 'Asia/Shanghai')::date) as active_today,
count(*) filter(where (last_used_at at time zone 'Asia/Shanghai')::date >= (now() at time zone 'Asia/Shanghai')::date-6) as active_7_days
from chigedan_private.ai_users;
