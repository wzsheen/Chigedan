-- 成品食物库：表结构扩展 + 查询函数
-- 配套脚本 supabase/sync-food-library.mjs 负责把 CSV 写进来，本文件只管结构与读取。
-- 数值口径与客户端一致：一律按每 100 克存，份量（一份多少克）单独存，不参与换算。

-- 1) 结构：原来只有 name/unit/nutrients_per100，装不下「一份 620 克」这类成品信息。
alter table chigedan_private.shared_foods
  add column if not exists external_id text,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists serving_g numeric,
  add column if not exists serving_label text,
  add column if not exists category text,
  add column if not exists confidence text,
  add column if not exists note text;

alter table chigedan_private.shared_foods
  drop constraint if exists shared_foods_serving_g_check,
  add constraint shared_foods_serving_g_check check (serving_g is null or (serving_g > 0 and serving_g <= 10000)),
  drop constraint if exists shared_foods_confidence_check,
  add constraint shared_foods_confidence_check check (confidence is null or confidence in ('高','中','低'));

-- 2) 去重：同一个名称+单位只允许一条可用记录，重复导入走 upsert 而不是插新行。
create unique index if not exists shared_foods_name_unit_available
  on chigedan_private.shared_foods(name, unit) where review_status = 'available';

comment on column chigedan_private.shared_foods.external_id is '来源库编号，例如 C001；用于和原始 CSV 对账。';
comment on column chigedan_private.shared_foods.aliases is '别名，搜索用；不含主名称。';
comment on column chigedan_private.shared_foods.serving_g is '一份的克重；空表示只有每 100 克口径。';
comment on column chigedan_private.shared_foods.serving_label is '一份的说法，例如 一盘/一碗/一个。';
comment on column chigedan_private.shared_foods.category is '食物类别，例如 面食/肉类/饮品。';
comment on column chigedan_private.shared_foods.confidence is '数据置信度：高/中/低。';

-- 3) 精确查询：补上钠、份量、别名、类别；字段只增不改，老客户端照旧能读。
create or replace function public.chigedan_food_lookup(p_name text, p_unit text)
returns jsonb language sql security invoker set search_path = ''
as $$
select coalesce(jsonb_agg(payload),'[]'::jsonb)
from (
  select jsonb_build_object(
    'name',name,'unit',unit,'per100',nutrients_per100,'source',source_ref,
    'estimated',source_type='model_estimate',
    'serving_g',serving_g,'serving_label',serving_label,
    'category',category,'confidence',confidence,'aliases',aliases
  ) as payload
  from chigedan_private.shared_foods
  where name=p_name and unit=p_unit and review_status='available'
  order by (source_type='reference') desc, id
  limit 1
) f
$$;

-- 4) 模糊搜索：名称或别名命中，精确 > 前缀 > 包含，短名称优先。
create or replace function public.chigedan_food_search(p_name text)
returns jsonb language sql security invoker set search_path = ''
as $$
select coalesce(jsonb_agg(payload order by rank, length(name), name),'[]'::jsonb)
from (
  select jsonb_build_object(
    'name',name,'unit',unit,'per100',nutrients_per100,'source',source_ref,
    'estimated',source_type='model_estimate',
    'serving_g',serving_g,'serving_label',serving_label,
    'category',category,'confidence',confidence,'aliases',aliases
  ) as payload,
  case when name=p_name then 0 when name like p_name||'%' then 1 else 2 end as rank,
  length(name) as len, name
  from chigedan_private.shared_foods
  where review_status='available' and length(p_name) between 2 and 60
    and (position(p_name in name)>0 or exists (select 1 from unnest(aliases) a where position(p_name in a)>0))
  order by case when name=p_name then 0 when name like p_name||'%' then 1 else 2 end, length(name), name
  limit 20
) f
$$;
