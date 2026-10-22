// Yayından önce çalışan basit site testleri. Bağımlılık yok, Node'un kendi test aracını kullanır.
// Yerelde çalıştırmak için: node --test tests/site.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");

const html = read("index.html");
const css = read("style.css");
const js = read("script.js");

const attrValues = (attr) => [...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, "g"))].map((m) => m[1]);

test("gerekli dosyalar mevcut", () => {
  for (const file of ["index.html", "style.css", "script.js"]) {
    assert.ok(existsSync(join(root, file)), `${file} bulunamadı`);
  }
});

test("HTML temel etiketleri içeriyor", () => {
  assert.match(html, /^<!doctype html>/i, "doctype eksik");
  assert.match(html, /<html lang="tr">/, 'lang="tr" eksik');
  assert.match(html, /<meta charset="utf-8">/i, "charset eksik");
  assert.match(html, /<meta name="viewport"/, "viewport eksik");
  assert.match(html, /<title>[^<]+<\/title>/, "title boş ya da eksik");
  assert.match(html, /<meta name="description" content="[^"]+"/, "meta description eksik");
});

test("aynı id birden fazla kullanılmıyor", () => {
  const ids = attrValues("id");
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(duplicates, [], `tekrarlanan id: ${duplicates.join(", ")}`);
});

test("sayfa içi bağlantılar var olan bölümlere gidiyor", () => {
  const ids = new Set(attrValues("id"));
  const missing = attrValues("href")
    .filter((href) => href.startsWith("#") && href.length > 1)
    .map((href) => href.slice(1))
    .filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `hedefi olmayan bağlantı: #${missing.join(", #")}`);
});

test("yerel dosya bağlantıları mevcut", () => {
  const external = /^(https?:|\/\/|#|mailto:|tel:|data:)/;
  const missing = [...attrValues("href"), ...attrValues("src")]
    .filter((ref) => ref && !external.test(ref))
    .filter((ref) => !existsSync(join(root, ref.split(/[?#]/)[0])));
  assert.deepEqual(missing, [], `bulunamayan dosya: ${missing.join(", ")}`);
});

test("tüm görsellerde alt metni var", () => {
  const withoutAlt = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/\salt="/.test(tag));
  assert.deepEqual(withoutAlt, [], "alt metni olmayan görsel var");
});

test("yayın adımının dolduracağı sürüm ve tarih alanları yerinde", () => {
  // .github/workflows/pages.yml bu iki etiketi arayıp değiştirir
  assert.equal(html.match(/<a id="site-version" href="[^"]*">[^<]*<\/a>/g)?.length, 1, "site-version bağlantısı yok ya da biçimi değişmiş");
  assert.equal(html.match(/<time id="site-updated" datetime="[^"]*">[^<]*<\/time>/g)?.length, 1, "site-updated etiketi yok ya da biçimi değişmiş");
});

test("JavaScript sözdizimi hatasız", () => {
  execFileSync(process.execPath, ["--check", join(root, "script.js")], { stdio: "pipe" });
});

test("tasarım kuralı: gradyan kullanılmıyor", () => {
  for (const [file, text] of [["style.css", css], ["index.html", html]]) {
    assert.doesNotMatch(text, /gradient\s*\(/i, `${file} içinde gradyan var`);
  }
});

test("tasarım kuralı: mor tonlar kullanılmıyor", () => {
  const isPurple = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return false;
    const saturation = delta / (1 - Math.abs(max + min - 1));
    let hue;
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
    return hue >= 250 && hue <= 320 && saturation > 0.2;
  };

  for (const [file, text] of [["style.css", css], ["index.html", html]]) {
    const hexes = [...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)]
      .map((m) => (m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]))
      .filter(isPurple);
    assert.deepEqual(hexes, [], `${file} içinde mor renk: #${hexes.join(", #")}`);
    assert.doesNotMatch(text, /\b(purple|violet|magenta|fuchsia|orchid|plum|lavender|indigo)\b/i, `${file} içinde mor renk adı var`);
  }
});

test("tasarım kuralı: emoji kullanılmıyor", () => {
  for (const [file, text] of [["index.html", html], ["style.css", css], ["script.js", js]]) {
    const emoji = text.match(/\p{Extended_Pictographic}/gu) ?? [];
    assert.deepEqual(emoji, [], `${file} içinde emoji var: ${emoji.join(" ")}`);
  }
});
