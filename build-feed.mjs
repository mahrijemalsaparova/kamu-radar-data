// Builds feed.json for the Kamu Radar app from Resmî Gazete "Çeşitli İlânlar" (official, public notices).
// Usage: node build-feed.mjs [daysBack=21]
// Needs `pdftotext` (poppler-utils) on PATH. Uses only Node built-ins.
//
// Politeness: one request at a time, a short pause between requests, an honest User-Agent,
// and only the days that are not already in feed.json are downloaded.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UA = 'KamuRadar/1.0 (+https://github.com/mahrijemalsaparova/kamu-radar-data)';
const BASE = 'https://www.resmigazete.gov.tr/ilanlar/eskiilanlar';
const FEED = new URL('./feed.json', import.meta.url);
const DAYS_BACK = Number(process.argv[2] ?? 21);
const PAUSE_MS = 800;

const CITIES = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];

// Universities whose names do not contain their province.
const UNI_CITY = {
  'bozok': 'Yozgat', 'dumlupınar': 'Kütahya', 'ondokuz mayıs': 'Samsun', 'özyeğin': 'İstanbul', 'yaşar': 'İzmir',
  'belek': 'Antalya', 'tarsus': 'Mersin', 'hacettepe': 'Ankara', 'gazi üniversitesi': 'Ankara', 'odtü': 'Ankara',
  'orta doğu teknik': 'Ankara', 'bilkent': 'Ankara', 'marmara': 'İstanbul', 'boğaziçi': 'İstanbul', 'yıldız teknik': 'İstanbul',
  'koç üniversitesi': 'İstanbul', 'sabancı': 'İstanbul', 'ege üniversitesi': 'İzmir', 'dokuz eylül': 'İzmir', 'uludağ': 'Bursa',
  'akdeniz üniversitesi': 'Antalya', 'çukurova': 'Adana', 'atatürk üniversitesi': 'Erzurum', 'karadeniz teknik': 'Trabzon',
  'erciyes': 'Kayseri', 'selçuk': 'Konya', 'pamukkale': 'Denizli', 'fırat': 'Elazığ', 'inönü': 'Malatya', 'dicle': 'Diyarbakır',
  'harran': 'Şanlıurfa', 'cumhuriyet': 'Sivas', 'gaziosmanpaşa': 'Tokat', 'kafkas': 'Kars', 'mehmet akif ersoy': 'Burdur',
  'süleyman demirel': 'Isparta', 'adnan menderes': 'Aydın', 'celal bayar': 'Manisa', 'trakya': 'Edirne', 'namık kemal': 'Tekirdağ',
  'abant izzet baysal': 'Bolu', 'kocatepe': 'Afyonkarahisar', 'bülent ecevit': 'Zonguldak', 'recep tayyip erdoğan': 'Rize',
  'sütçü imam': 'Kahramanmaraş', 'mustafa kemal': 'Hatay', 'nevşehir hacı bektaş': 'Nevşehir', 'ahi evran': 'Kırşehir',
  'hitit': 'Çorum', 'bartın': 'Bartın', 'alparslan': 'Muş', 'yüzüncü yıl': 'Van', 'artuklu': 'Mardin', 'munzur': 'Tunceli',
  'yıldırım beyazıt': 'Ankara', 'medipol': 'İstanbul', 'bahçeşehir': 'İstanbul', 'beykent': 'İstanbul', 'istinye': 'İstanbul',
  'beykoz': 'İstanbul', 'hasan kalyoncu': 'Gaziantep', 'necmettin erbakan': 'Konya', 'abdullah gül': 'Kayseri', 'medeniyet': 'İstanbul',
  'akreditasyon': 'Ankara', 'adli tıp': 'İstanbul', 'sakarya uygulamalı': 'Sakarya', 'karamanoğlu': 'Karaman', 'zonguldak bülent': 'Zonguldak',
  'başkent üniversitesi': 'Ankara', 'atılım': 'Ankara', 'çankaya üniversitesi': 'Ankara', 'tobb': 'Ankara', 'ted üniversitesi': 'Ankara',
};

// A notice is kept when its opening mentions hiring and none of the "not a vacancy" phrases.
const HIRING = /(alım ilanı|alımı ilanı|personel alım|personeli alın|personel alın|eleman alın|öğretim üyesi|öğretim görevlisi|araştırma görevlisi|sözleşmeli personel|sürekli işçi|istihdam edilmek üzere|alınacaktır|sınav ilanı|giriş sınavı|kadro(su|larına)? için)/i;
// Checked against the heading lines only; the body of real vacancies often cites regulations.
const NOT_VACANCY = /(sonuç ilanı|sonuçları|kesin başarı listesi|düzeltme ilanı|iptal ilanı|ihale|satış ilanı|kiraya verile|kayıp ilanı)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const trLower = (s) => s.toLocaleLowerCase('tr');

async function get(url) {
  await sleep(PAUSE_MS);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function decode1254(buf) {
  return new TextDecoder('windows-1254').decode(buf);
}

function pdfText(buf, dir, name) {
  const file = join(dir, name);
  writeFileSync(file, buf);
  try {
    return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-l', '4', file, '-'], { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
  } catch {
    return '';
  } finally {
    rmSync(file, { force: true });
  }
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br[^>]*>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r]+/g, ' ');
}

/** Index page: notice links in page order. */
function parseIndex(html, day) {
  const links = [...html.matchAll(/href="([^"]*?-4-\d+\.(?:pdf|htm))"/gi)].map((m) => m[1]);
  const unique = [...new Set(links)];
  return unique.map((href, i) => ({
    url: href.startsWith('http') ? href : `${BASE}/${day.slice(0, 4)}/${day.slice(5, 7)}/${href}`,
    n: Number(href.match(/-4-(\d+)\./)?.[1] ?? i + 1),
  }));
}

function clean(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^\d+\/\d+-\d+$/.test(l)); // drop the "11968/1-1" footer codes
}

function institutionFrom(lines) {
  // First lines end with "…Rektörlüğünden:" / "…Bakanlığından:"; may be split over two lines.
  let head = '';
  for (const l of lines.slice(0, 4)) {
    head = head ? `${head} ${l}` : l;
    if (/:\s*$/.test(l) || /(ndan|nden|dan|den)\s*$/.test(l)) break;
  }
  head = head.replace(/:\s*$/, '').trim();
  return head
    .replace(/ğünden$/, 'ğü').replace(/ğundan$/, 'ğu')
    .replace(/lığından$/, 'lığı').replace(/liğinden$/, 'liği').replace(/luğundan$/, 'luğu').replace(/lüğünden$/, 'lüğü')
    .replace(/Kurumundan$/, 'Kurumu').replace(/Kurulundan$/, 'Kurulu').replace(/Müdürlüğünden$/, 'Müdürlüğü')
    .replace(/Başkanlığından$/, 'Başkanlığı').replace(/Rektörlüğünden$/, 'Rektörlüğü')
    .replace(/(ndan|nden)$/, '')
    .replace(/\s+/g, ' ');
}

const SMALL = new Set(['ve', 'ile', 'için', 'veya', 'de', 'da', 'ile']);
function titleCase(s) {
  return s
    .toLocaleLowerCase('tr')
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^([("'/-]*)(\p{L})/u, (_, a, b) => a + b.toLocaleUpperCase('tr'))))
    .join('');
}

function titleFrom(lines, institution) {
  const start = lines.findIndex((l) => /:\s*$/.test(l));
  const rest = lines.slice(start + 1, start + 5);
  const caps = [];
  for (const l of rest) {
    const letters = l.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
    if (letters.length > 3 && l === l.toLocaleUpperCase('tr')) {
      caps.push(l);
      if (/İLAN[I]?\)?\.?$|DUYURU(SU)?$/.test(l)) break;
    } else if (caps.length) break;
  }
  const raw = caps.join(' ').replace(/\s+/g, ' ').trim();
  return raw ? titleCase(raw) : `${institution} personel alım ilanı`;
}

function cityFrom(institution, text) {
  const inst = trLower(institution);
  for (const c of CITIES) if (inst.includes(trLower(c))) return c;
  for (const [k, c] of Object.entries(UNI_CITY)) if (inst.includes(k)) return c;
  if (/bakanlığı|genel müdürlüğü|başkanlığı|kurumu|kurulu|akademi/i.test(institution)) return 'Tüm Türkiye';
  // Fall back to the address line, e.g. "Bornova - İZMİR".
  const upper = text.toLocaleUpperCase('tr');
  let best = null;
  let at = -1;
  for (const c of CITIES) {
    const re = new RegExp(`(^|[^A-ZÇĞİÖŞÜ])${c.toLocaleUpperCase('tr')}($|[^A-ZÇĞİÖŞÜ])`, 'g');
    let m;
    while ((m = re.exec(upper))) if (m.index > at) { at = m.index; best = c; }
  }
  return best ?? 'Tüm Türkiye';
}

function parseDate(s) {
  const m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const TR_MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
function parseLongDate(s) {
  const m = trLower(s).match(/(\d{1,2})\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(\d{4})/);
  return m ? `${m[3]}-${pad(TR_MONTHS.indexOf(m[2]) + 1)}-${pad(Number(m[1]))}` : null;
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** Returns { deadline, estimated }. */
function deadlineFrom(text, pubDay) {
  const t = text.replace(/\s+/g, ' ');
  const lower = trLower(t);
  const DATE = String.raw`\d{1,2}[./]\d{1,2}[./]\d{4}`;
  // 1) A date range next to "başvuru" / "ilan tarihi": "23.11.2026 - 07.12.2026"
  for (const m of lower.matchAll(/(başvuru|ilan tarihi|ilan süresi)/g)) {
    const win = t.slice(m.index, m.index + 260);
    const range = win.match(new RegExp(String.raw`(${DATE})\s*[-–—]\s*(${DATE})`));
    if (range) {
      const end = parseDate(range[2]);
      if (end && end >= pubDay) return { deadline: end, estimated: false };
    }
  }
  // 2) "Son başvuru tarihi: 08.12.2026" or "… 08/12/2026 tarihine kadar"
  for (const m of lower.matchAll(/son başvuru|tarihine kadar|tarihi mesai bitimine/g)) {
    const win = t.slice(Math.max(0, m.index - 60), m.index + 200);
    const dates = [...win.matchAll(new RegExp(DATE, 'g'))].map((x) => parseDate(x[0])).filter((d) => d && d >= pubDay);
    const longD = parseLongDate(win);
    if (longD && longD >= pubDay) dates.push(longD);
    if (dates.length) return { deadline: dates.sort()[dates.length - 1], estimated: false };
  }
  // 3) "yayımlandığı / yayın tarihinden itibaren 15 (on beş) gün"
  const rel = lower.match(/(yayım|yayın)[^.]{0,70}?itibaren\s*(\d{1,2})\s*(?:\(\s*[a-zçğıöşü\s]+\)\s*)?(iş günü|gün)/);
  if (rel) {
    let n = Number(rel[2]);
    if (rel[3] === 'iş günü') {
      const d = new Date(`${pubDay}T12:00:00`);
      while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
      return { deadline: isoDay(d), estimated: false };
    }
    return { deadline: addDays(pubDay, n - 1), estimated: false };
  }
  // 4) Academic notices default to 15 days by regulation; mark as an estimate.
  return { deadline: addDays(pubDay, 14), estimated: true };
}

function positionsFrom(text) {
  const t = text.replace(/\s+/g, ' ');
  const m = t.match(/(\d{1,5})\s*\((?:[a-zçğıöşü\s]+)\)\s*(?:adet|kişi)/i) ?? t.match(/(\d{1,5})\s+(?:adet|kişi)\b/i);
  const n = m ? Number(m[1]) : null;
  return n && n < 100000 ? n : null;
}

function summaryFrom(lines) {
  const start = lines.findIndex((l) => /:\s*$/.test(l));
  const body = lines.slice(start + 1).filter((l) => l !== l.toLocaleUpperCase('tr') || l.length < 4);
  return body.join(' ').replace(/\s+/g, ' ').slice(0, 1200).trim();
}

async function buildDay(day, dir) {
  const [y, m, d] = day.split('-');
  const idx = await get(`${BASE}/${y}/${m}/${y}${m}${d}-4.htm`);
  if (!idx) return []; // no gazette notices that day
  const items = parseIndex(decode1254(idx), day);
  const ads = [];
  for (const it of items) {
    let text = '';
    try {
      const buf = await get(it.url);
      if (!buf) continue;
      text = it.url.endsWith('.pdf') ? pdfText(buf, dir, `${y}${m}${d}-${it.n}.pdf`) : htmlToText(decode1254(buf));
    } catch (e) {
      console.warn(`skip ${it.url}: ${e.message}`);
      continue;
    }
    const lines = clean(text);
    if (lines.length < 3) continue;
    const opening = lines.slice(0, 14).join(' ');
    if (!HIRING.test(opening) || NOT_VACANCY.test(lines.slice(0, 3).join(' '))) continue;
    const institution = institutionFrom(lines);
    const full = lines.join('\n');
    ads.push({
      id: `rg-${y}${m}${d}-${it.n}`,
      institution,
      title: titleFrom(lines, institution),
      city: cityFrom(institution, full),
      url: it.url,
      publishedAt: day,
      ...(({ deadline, estimated }) => ({ deadline, deadlineEstimated: estimated }))(deadlineFrom(full, day)),
      positions: positionsFrom(full),
      text: summaryFrom(lines),
      source: 'Resmî Gazete',
    });
  }
  return ads;
}

async function main() {
  const prev = existsSync(FEED) ? JSON.parse(readFileSync(FEED, 'utf8')) : { ads: [], days: [] };
  const doneDays = new Set(prev.days ?? []);
  const today = new Date();
  const todayIso = isoDay(today);
  const dir = mkdtempSync(join(tmpdir(), 'kr-'));
  const fresh = [];
  const days = [];
  try {
    for (let i = DAYS_BACK; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const day = isoDay(d);
      days.push(day);
      if (doneDays.has(day) && day !== todayIso) continue;
      const got = await buildDay(day, dir);
      console.log(`${day}: ${got.length} ilan`);
      fresh.push(...got);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const byId = new Map(prev.ads.map((a) => [a.id, a]));
  for (const a of fresh) byId.set(a.id, a);
  const oldest = days[0];
  const ads = [...byId.values()]
    .filter((a) => a.publishedAt >= oldest)
    .filter((a) => (a.deadline ? a.deadline >= todayIso : true))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const out = { updatedAt: new Date().toISOString(), source: 'Resmî Gazete – Çeşitli İlânlar', days, ads };
  writeFileSync(FEED, JSON.stringify(out, null, 1) + '\n');
  console.log(`feed.json: ${ads.length} açık ilan`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
