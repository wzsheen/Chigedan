-- 内置 AI 额度：失败退还 + 额度查询
-- 依赖 ai-quota.sql 与 ai-server-access.sql 已执行。

-- 上游调用失败时，把 reserve 阶段占用的那次额度退回。
-- service_role 只有 select/insert/update 权限，没有 delete，所以这里只把 count 减到 0，
-- 不删行：quota_status 与 reserve 都按 sum(count) 计算，留 0 行不影响结果。
create or replace function chigedan_private.release_ai_call(p_user uuid, p_kind text)
returns void language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if p_user is null or p_kind not in ('vision','speech','nutrition') then return; end if;
  update chigedan_private.ai_usage
     set count = greatest(count - 1, 0)
   where day = today and user_id = p_user and kind = p_kind and count > 0;
end $$;
revoke all on function chigedan_private.release_ai_call(uuid,text) from public, anon, authenticated;
grant execute on function chigedan_private.release_ai_call(uuid,text) to service_role;

-- 查询当天各项服务的上限、已用、剩余。客户端据此显示真实额度。
create or replace function chigedan_private.quota_status(p_user uuid)
returns json language sql security invoker set search_path = '' as $$
with s as (
  select daily_user_limit as lim, enabled as on_ from chigedan_private.ai_settings where id = true
), u as (
  select coalesce(sum(count) filter (where kind = 'vision'),0) as vision,
         coalesce(sum(count) filter (where kind = 'speech'),0) as speech,
         coalesce(sum(count) filter (where kind = 'nutrition'),0) as nutrition
    from chigedan_private.ai_usage
   where day = (now() at time zone 'Asia/Shanghai')::date and user_id = p_user
)
select json_build_object(
  'enabled', s.on_,
  'day', (now() at time zone 'Asia/Shanghai')::date,
  'limit', s.lim,
  'used', json_build_object('vision',u.vision,'speech',u.speech,'nutrition',u.nutrition),
  'remaining', json_build_object(
    'vision', greatest(s.lim - u.vision, 0),
    'speech', greatest(s.lim - u.speech, 0),
    'nutrition', greatest(s.lim - u.nutrition, 0))
) from s, u
$$;
revoke all on function chigedan_private.quota_status(uuid) from public, anon, authenticated;
grant execute on function chigedan_private.quota_status(uuid) to service_role;

-- service_role 包装（与既有 chigedan_reserve 保持同一形态）
create or replace function public.chigedan_release(p_user uuid, p_kind text)
returns void language sql security invoker set search_path = '' as $$
select chigedan_private.release_ai_call(p_user, p_kind)
$$;
revoke all on function public.chigedan_release(uuid,text) from public, anon, authenticated;
grant execute on function public.chigedan_release(uuid,text) to service_role;

create or replace function public.chigedan_quota(p_user uuid)
returns json language sql security invoker set search_path = '' as $$
select chigedan_private.quota_status(p_user)
$$;
revoke all on function public.chigedan_quota(uuid) from public, anon, authenticated;
grant execute on function public.chigedan_quota(uuid) to service_role;
