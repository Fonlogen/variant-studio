// Version, install paths and the user's configuration (~/.variant-studio/config.json).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON } from './util.mjs';

export const VERSION = '4.0';
export const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENTRY = path.join(SCRIPTS, 'studio.mjs');
export const UI = path.join(SCRIPTS, 'ui');
// VARIANT_STUDIO_HOME moves the user folder (registry, config, server log), e.g. for tests
export const USER_DIR = path.resolve(process.env.VARIANT_STUDIO_HOME || path.join(os.homedir(), '.variant-studio'));
export const REGISTRY = path.join(USER_DIR, 'server.json');
export const SERVER_LOG = path.join(USER_DIR, 'server.log');
export const DEFAULT_PORT = 8065;
export const HOSTNAME = 'variant-studio.localhost';

export const userConfig = () => ({ ...readJSON(path.join(SCRIPTS, '..', 'config.json'), {}), ...readJSON(path.join(USER_DIR, 'config.json'), {}) });
export function saveUserConfig(patch) {
  const f = path.join(USER_DIR, 'config.json');
  fs.mkdirSync(USER_DIR, { recursive: true });
  writeJSON(f, { ...readJSON(f, {}), ...patch });
}

export const LANG_NAMES = { en: 'English', it: 'Italian', es: 'Spanish', fr: 'French', ru: 'Russian' };
// the studio language: chosen in the studio (saved by the browser), otherwise guessed from the system locale
export function studioLang() {
  const l = userConfig().lang;
  if (LANG_NAMES[l]) return l;
  const sys = (process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '').slice(0, 2).toLowerCase();
  return LANG_NAMES[sys] ? sys : 'en';
}
export const langNote = () => { const l = studioLang(); return { studio_language: l, write_in: `Write the round title, question, context, variant labels and notes in ${LANG_NAMES[l]}, the language of the studio. Copy inside the designs follows the product, not the studio.` }; };
