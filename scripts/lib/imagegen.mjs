// Raster images through the OpenAI Images API (references, textures, logo explorations). The key never leaves this module.
import fs from 'node:fs';
import path from 'node:path';
import { cleanName } from './util.mjs';
import { userConfig } from './config.mjs';

export async function generateImage({ prompt, size = '1024x1024', out, dir }) {
  const cfg = userConfig().openai || {};
  const key = process.env.OPENAI_API_KEY || cfg.api_key;
  if (!key) throw Object.assign(new Error('no OpenAI key: set OPENAI_API_KEY or "openai": { "api_key": "…" } in ~/.variant-studio/config.json'), { code: 'no-key' });
  if (!/^\d{3,4}x\d{3,4}$|^auto$/.test(size)) throw new Error('--size must look like 1024x1024 (or auto)');
  const model = cfg.image_model || 'gpt-image-1';
  let r;
  try {
    r = await fetch(`${cfg.base_url || 'https://api.openai.com/v1'}/images/generations`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, n: 1 }), signal: AbortSignal.timeout(180000),
    });
  } catch (e) { throw new Error(`could not reach the OpenAI API: ${e.message}`); }
  const j = await r.json().catch(() => ({}));
  // the API echoes nothing secret, but strip anything key-shaped from its message anyway
  if (!r.ok) throw Object.assign(new Error(String(j.error?.message || `OpenAI answered ${r.status}`).replace(/sk-[\w*.-]+/g, 'sk-…')), { status: r.status, code: j.error?.code || null });
  const item = j.data?.[0] || {};
  const buf = item.b64_json ? Buffer.from(item.b64_json, 'base64') : item.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : null;
  if (!buf) throw new Error('the API returned no image');
  const file = path.resolve(out || path.join(dir, '_images', `${Date.now().toString(36)}-${cleanName(prompt, 32) || 'image'}.png`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return { file, model, size, bytes: buf.length, revised_prompt: item.revised_prompt || undefined };
}
