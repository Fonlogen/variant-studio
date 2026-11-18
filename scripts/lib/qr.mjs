// QR codes as SVG, with the same vendored encoder the gallery uses (ui/vendor/qrcode.js, MIT, Kazuhiko Arase).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { UI } from './config.mjs';

let lib = null;
function qrcode() {
  if (lib) return lib;
  const ctx = { module: { exports: {} } };
  ctx.exports = ctx.module.exports;
  vm.runInNewContext(fs.readFileSync(path.join(UI, 'vendor', 'qrcode.js'), 'utf8'), ctx);
  lib = ctx.module.exports;
  lib.stringToBytes = lib.stringToBytesFuncs['UTF-8'];
  return lib;
}
export function qrSvg(text, { cell = 4, margin = 4, level = 'M' } = {}) {
  const q = qrcode()(0, level);
  q.addData(String(text), 'Byte');
  q.make();
  return q.createSvgTag({ cellSize: cell, margin, scalable: true });
}
