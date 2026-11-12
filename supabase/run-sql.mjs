// 把本地 SQL 文件丢给 Supabase Management API 执行。
// 用法：SUPABASE_ACCESS_TOKEN=... node supabase/run-sql.mjs supabase/xxx.sql [more.sql]
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || 'phbxzuvfkifawvvnzwdn';
if (!token) throw new Error('缺少 SUPABASE_ACCESS_TOKEN');
const files = process.argv.slice(2);
if (!files.length) throw new Error('用法：node supabase/run-sql.mjs <file.sql> [...]');
import { readFileSync } from 'node:fs';

async function run(sql, label) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} 失败 ${response.status}：${text.slice(0, 500)}`);
  console.log(`${label} ok：${text.slice(0, 300)}`);
}

(async () => {
  for (const file of files) {
    await run(readFileSync(file, 'utf8'), file);
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
