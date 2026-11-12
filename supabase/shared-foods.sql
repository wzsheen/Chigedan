create table chigedan_private.shared_foods (
id bigint generated always as identity primary key,
name text not null check(length(name) between 1 and 60),
unit text not null check(unit in ('g','ml')),
method text not null default 'unknown',
ingredients jsonb not null default '[]'::jsonb,
nutrients_per100 jsonb not null,
source_type text not null check(source_type in ('reference','model_estimate')),
source_ref text,
model text,
review_status text not null default 'pending' check(review_status in ('pending','available','rejected')),
created_at timestamptz not null default now(),
check(jsonb_typeof(ingredients)='array'),
check(jsonb_typeof(nutrients_per100)='object')
);
create index shared_foods_lookup on chigedan_private.shared_foods(name,unit,method) where review_status='available';
alter table chigedan_private.shared_foods enable row level security;
revoke all on chigedan_private.shared_foods from public,anon,authenticated;
grant select,insert,update on chigedan_private.shared_foods to service_role;
grant usage,select on sequence chigedan_private.shared_foods_id_seq to service_role;
comment on table chigedan_private.shared_foods is '共享食物参考，不包含用户标识、媒体、备注或整餐记录。g与ml分别按每100g和每100ml计量。模型估算需经确认和校验后可用。';
