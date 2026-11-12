// 把「中国成品食物补充库」CSV 同步进 Supabase 的 chigedan_private.shared_foods。
//
// 口径：CSV 是按「一份」给的（一份 620g / 910.9 kcal），库里统一按每 100 克存，
// 一份克重单独存 serving_g，客户端自己换算。这样食物库、AI 估算、按克记录三条路
// 用的是同一个基准，不会出现「一份 146 kcal」和「100 克 910 kcal」并存。
//
// 去重：优先按 external_id（CSV 编号）认行，其次按 (name, unit) upsert。
// 所以改名不会留下旧行，重复导入也不会插新行。
//
// 用法：
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node supabase/sync-food-library.mjs
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node supabase/sync-food-library.mjs --dry   # 只看报告不写库
//   ... --file "D:/path/xxx.csv"      指定别的 CSV（列名需一致）
import { readFileSync } from 'node:fs';

const DEFAULT_FILE = 'C:/Users/Lee/WorkBuddy/2026-11-04-22-14-49/中国成品食物补充库（合集）.csv';
const SOURCE = '中国成品食物补充库';
const BATCH = 100;

// CSV 里少数条目过不了客户端的营养校验（utils/food-weight.js 的 sanitize：
// 热量 1–900、三大素和 ≤100 出头、4/4/9 与热量偏差 ≤max(10kcal, 20%)）。
// 这些例外写死在这里，而不是手改数据库，否则下次同步会被 CSV 覆盖回去。
const OVERRIDES = {
  C652: {
    drop: true,
    reason: '白酒热量来自酒精，无法用蛋白/脂肪/碳水表达，per-100g 校验必然拒收；本地库 P172「白酒（50 度）」同值可用',
  },
  C672: {
    drop: true,
    reason: '0 kcal 低于客户端下限（要求 kcal>0），本就是无热量饮品，单独留一行还会挤占搜索',
  },
  C741: {
    set: { protein: 2.17, fat: 2.29, carb: 14.23 },
    reason: '原碳水 19.43g/100g 让 4/4/9 算到 107 kcal，与标示 86.2 差 21%；按热量反算碳水，热量不动',
  },
  C839: {
    set: { protein: 10, fat: 31.84, carb: 58.16 },
    reason: '原三大素合计 107.6g/100g（物理上超 100），按热量守恒把多出的 7.6g 从碳水挪到脂肪，热量与合计都自洽',
  },
  C049: {
    name: '八宝粥（家常）',
    reason: '与本地库 5 条「八宝粥」罐装产品同名不同物（本地 65–82 kcal，本条按家常八宝料还原 114.5），改名避免被本地同名条目遮住',
  },
};

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const fileArg = args.indexOf('--file');
const file = fileArg >= 0 ? args[fileArg + 1] : DEFAULT_FILE;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || 'phbxzuvfkifawvvnzwdn';
if (!token) throw new Error('缺少 SUPABASE_ACCESS_TOKEN');

// ---------- CSV ----------
// 字段里有中文逗号和引号，用标准 CSV 规则解析，不能按逗号切。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(name => name.replace(/^\uFEFF/, '').trim());
  return rows.filter(line => line.some(cell => cell.trim())).map(line => {
    const record = {};
    header.forEach((key, index) => { record[key] = (line[index] || '').trim(); });
    return record;
  });
}

const num = value => {
  const clean = String(value == null ? '' : value).replace(/[,，\s]/g, '');
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};
const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const sqlText = value => (value == null ? 'null' : `'${String(value).replace(/'/g, "''")}'`);

function toRecord(row) {
  const id = row['编号'];
  const override = OVERRIDES[id] || {};
  const serving = num(row['一份g（入口）']);
  const kcalServing = num(row['一份kcal']);
  if (!serving || serving <= 0) throw new Error(`份量无效：${row['名称']}`);
  const scale = 100 / serving;
  const per = {
    kcal: round(kcalServing * scale, 1),
    protein: round(num(row['蛋白质g']) * scale, 2),
    carb: round(num(row['碳水g']) * scale, 2),
    fat: round(num(row['脂肪g']) * scale, 2),
    sodium: round(num(row['钠mg']) * scale, 1),
  };
  if (override.set) Object.assign(per, override.set);
  const aliases = [...new Set((row['别名'] || '').split(/[、，,\/／;；]/)
    .map(alias => alias.trim())
    .filter(alias => alias && alias !== row['名称']))];
  return {
    id,
    name: override.name || row['名称'],
    unit: 'g',
    method: row['数据来源'] || '配方成品',
    per,
    source_ref: `${SOURCE}:${id}`,
    external_id: id,
    aliases,
    serving_g: serving,
    serving_label: row['一份描述'] || null,
    category: row['类别'] || null,
    confidence: ['高', '中', '低'].includes(row['置信度']) ? row['置信度'] : null,
    note: [row['备注'], override.set ? '三大素按热量校正：' + override.reason : null].filter(Boolean).join('；') || null,
    drop: !!override.drop,
    overrideReason: override.reason || null,
    // 客户端 sanitize() 的硬门槛，不满足的照样入库但要报出来。
    issues: [
      per.kcal <= 0 || per.kcal > 900 ? `热量 ${per.kcal}/100g 超范围` : null,
      per.protein + per.carb + per.fat > 105 ? `三大素合计 ${round(per.protein + per.carb + per.fat, 1)}g/100g` : null,
      Math.abs(per.protein * 4 + per.carb * 4 + per.fat * 9 - per.kcal) > Math.max(10, per.kcal * 0.2)
        ? `4/4/9 算得 ${round(per.protein * 4 + per.carb * 4 + per.fat * 9, 1)} vs 标示 ${per.kcal}` : null,
    ].filter(Boolean),
  };
}

// ---------- DB ----------
async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}：${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : [];
}

const existingRows = async () => sql(
  "select id, name, external_id from chigedan_private.shared_foods where unit='g'",
);

function updateSql(records) {
  const values = records.map(r => `(${[
    sqlText(r.external_id), sqlText(r.name), sqlText(r.method), `${sqlText(JSON.stringify(r.per))}::jsonb`,
    sqlText(r.source_ref), `array[${r.aliases.map(sqlText).join(',')}]::text[]`, r.serving_g,
    sqlText(r.serving_label), sqlText(r.category), sqlText(r.confidence), sqlText(r.note),
  ].join(',')})`).join(',\n');
  return `update chigedan_private.shared_foods f set
    name=v.name, method=v.method, nutrients_per100=v.per, source_ref=v.source_ref,
    aliases=v.aliases, serving_g=v.serving_g, serving_label=v.serving_label,
    category=v.category, confidence=v.confidence, note=v.note
  from (values
${values}
  ) as v(ext,name,method,per,source_ref,aliases,serving_g,serving_label,category,confidence,note)
  where f.external_id=v.ext
  returning f.id`;
}

function insertSql(records) {
  const values = records.map(r => `(${[
    sqlText(r.name), sqlText(r.unit), sqlText(r.method), `${sqlText(JSON.stringify(r.per))}::jsonb`,
    `'reference'`, sqlText(r.source_ref), `'available'`, sqlText(r.external_id),
    `array[${r.aliases.map(sqlText).join(',')}]::text[]`, r.serving_g, sqlText(r.serving_label),
    sqlText(r.category), sqlText(r.confidence), sqlText(r.note),
  ].join(',')})`).join(',\n');
  return `insert into chigedan_private.shared_foods
  (name,unit,method,nutrients_per100,source_type,source_ref,review_status,external_id,aliases,serving_g,serving_label,category,confidence,note)
values
${values}
on conflict (name,unit) where review_status='available' do update set
  method=excluded.method, nutrients_per100=excluded.nutrients_per100, source_type=excluded.source_type,
  source_ref=excluded.source_ref, external_id=excluded.external_id, aliases=excluded.aliases,
  serving_g=excluded.serving_g, serving_label=excluded.serving_label, category=excluded.category,
  confidence=excluded.confidence, note=excluded.note
returning id`;
}

(async () => {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const seen = new Set();
  const duplicates = [];
  const all = rows.map(row => {
    const record = toRecord(row);
    if (seen.has(record.name)) duplicates.push(record.name);
    seen.add(record.name);
    return record;
  });
  const keep = all.filter(r => !r.drop);
  const drop = all.filter(r => r.drop);

  console.log(`CSV：${file}`);
  console.log(`解析 ${rows.length} 行，${all.length} 条有效，CSV 内部重名 ${duplicates.length} 条${duplicates.length ? '：' + duplicates.slice(0, 5).join('、') : ''}`);

  const overrides = all.filter(r => r.overrideReason);
  if (overrides.length) {
    console.log(`\n应用人工覆盖 ${overrides.length} 条：`);
    overrides.forEach(r => console.log(`  ${r.external_id} ${r.name}：${r.overrideReason}`));
  }

  const issues = keep.filter(r => r.issues.length);
  if (issues.length) {
    console.log(`\n仍有口径告警 ${issues.length} 条：`);
    issues.forEach(r => console.log(`  ${r.name}：${r.issues.join('；')}`));
  } else {
    console.log('\n口径检查：全部条目满足客户端 sanitize 门槛');
  }

  const before = await existingRows();
  const byExt = new Map(before.filter(row => row.external_id).map(row => [row.external_id, row]));
  const update = keep.filter(r => byExt.has(r.external_id));
  const insert = keep.filter(r => !byExt.has(r.external_id));
  console.log(`\n库内 ${before.length} 行：按编号更新 ${update.length} 条，新增 ${insert.length} 条，删除 ${drop.length} 条`);

  if (dry) {
    console.log('--dry：未写库');
    return;
  }

  if (drop.length) {
    const removed = await sql(`delete from chigedan_private.shared_foods where external_id = any(array[${drop.map(r => sqlText(r.external_id)).join(',')}]) returning name`);
    console.log(`  删除：${removed.map(r => r.name).join('、') || '无'}`);
  }
  for (let i = 0; i < update.length; i += BATCH) {
    const result = await sql(updateSql(update.slice(i, i + BATCH)));
    console.log(`  更新批次 ${i / BATCH + 1}：${result.length} 条`);
  }
  for (let i = 0; i < insert.length; i += BATCH) {
    const result = await sql(insertSql(insert.slice(i, i + BATCH)));
    console.log(`  新增批次 ${i / BATCH + 1}：${result.length} 条`);
  }

  const check = await sql(`select count(*) as total,
      count(*) filter (where serving_g is not null) as with_serving,
      count(*) filter (where nutrients_per100 ? 'sodium') as with_sodium,
      count(*) filter (where external_id is not null) as with_id,
      count(*) filter (where array_length(aliases,1) > 0) as with_alias
    from chigedan_private.shared_foods`);
  console.log('\n库内核对：', JSON.stringify(check[0]));
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
