/**
 * IT Job Agent - Multi-Source Scraper v3
 *
 * FREE SOURCES (no key needed):
 *   RemoteOK     — Remote tech jobs
 *   Arbeitnow    — Global tech jobs
 *   The Muse     — Company culture + jobs
 *   Remotive     — Remote dev jobs
 *   Jobicy       — Remote jobs
 *   Indeed India — Indian IT jobs via RSS  ← KEY for Indian relevance
 *   Employment News — PSU/Govt notifications ← PSU
 *   TimesJobs    — Indian IT jobs via RSS
 *
 * FREE WITH SIGNUP (recommended):
 *   Adzuna India — Aggregates Naukri + LinkedIn + Indeed India
 *                  Register free: developer.adzuna.com
 *                  Set ADZUNA_APP_ID + ADZUNA_APP_KEY in GitHub Secrets
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
  adzuna: {
    app_id:  process.env.ADZUNA_APP_ID  || '',
    app_key: process.env.ADZUNA_APP_KEY || '',
    country: 'in',
    enabled: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)
  },
  limit: 20,
  userAgent: 'Mozilla/5.0 (compatible; ITJobAgent/3.0)'
};

const HEADERS = { 'User-Agent': CONFIG.userAgent, 'Accept': 'application/json, text/xml, */*' };

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function stripHtml(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\s{2,}/g, ' ')
    .trim();
}

// Parse RSS/Atom XML without external library
function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const item of itemMatches) {
    const get = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
               || item.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    items.push({
      title:       get('title'),
      link:        get('link') || get('guid'),
      description: get('description'),
      pubDate:     get('pubDate'),
      author:      get('author') || get('dc:creator') || '',
      category:    get('category'),
    });
  }
  return items;
}

function safeDate(str) {
  try { return new Date(str).toISOString(); } catch { return new Date().toISOString(); }
}

// ─────────────────────────────────────────────
// SOURCE 1 — Indeed India (RSS)
// Best source for Indian IT + PSU-linked jobs
// ─────────────────────────────────────────────
async function fetchIndeedIndia(query = 'software engineer') {
  const url = `https://in.indeed.com/rss?q=${encodeURIComponent(query)}&l=India&limit=25&fromage=14`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const xml = await res.text();
    const items = parseRSS(xml);
    return items.slice(0, CONFIG.limit).map((item, i) => {
      // Extract company from title — Indeed formats as "Job Title - Company"
      const parts = (item.title || '').split(' - ');
      const title = parts[0]?.trim() || 'Unknown';
      const company = parts[1]?.trim() || 'Unknown';
      return {
        id: `indeed_in_${i}_${Date.now()}`,
        title,
        company,
        location: 'India',
        salary: null,
        description: stripHtml(item.description || '').slice(0, 500),
        tags: [],
        posted: safeDate(item.pubDate),
        url: item.link || 'https://in.indeed.com',
        source: 'Indeed India'
      };
    });
  } catch (e) {
    console.error('[Indeed India]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 2 — Employment News (PSU / Govt India)
// Official Govt of India employment newspaper
// ─────────────────────────────────────────────
async function fetchEmploymentNews() {
  const url = 'https://employmentnews.gov.in/NewFeed/FeedHandler.ashx';
  try {
    const res = await fetch(url, { headers: { ...HEADERS, 'Accept': 'text/xml, application/xml' } });
    const xml = await res.text();
    const items = parseRSS(xml);
    return items.slice(0, CONFIG.limit).map((item, i) => ({
      id: `psu_${i}_${Date.now()}`,
      title: stripHtml(item.title) || 'PSU Notification',
      company: 'Government / PSU',
      location: 'India',
      salary: null,
      description: stripHtml(item.description || '').slice(0, 500),
      tags: ['PSU', 'Government', 'India'],
      posted: safeDate(item.pubDate),
      url: item.link || 'https://employmentnews.gov.in',
      source: 'Employment News (PSU)'
    }));
  } catch (e) {
    console.error('[Employment News]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 3 — TimesJobs India (RSS)
// Popular Indian IT job portal
// ─────────────────────────────────────────────
async function fetchTimesJobs(query = 'software engineer') {
  const url = `https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords=${encodeURIComponent(query)}&txtLocation=India&rs=20&pDate=I&sequence=1&startPage=1`;
  // TimesJobs also has an RSS-style feed
  const rssUrl = `https://www.timesjobs.com/jobfeed/rss-jobs.xml?sequence=1&startPage=1&txtKeywords=${encodeURIComponent(query)}&txtLocation=India`;
  try {
    const res = await fetch(rssUrl, { headers: HEADERS });
    const xml = await res.text();
    const items = parseRSS(xml);
    return items.slice(0, CONFIG.limit).map((item, i) => {
      const parts = (item.title || '').split(' - ');
      return {
        id: `timesjobs_${i}_${Date.now()}`,
        title: parts[0]?.trim() || 'Unknown',
        company: parts[1]?.trim() || 'Unknown',
        location: 'India',
        salary: null,
        description: stripHtml(item.description || '').slice(0, 500),
        tags: ['India', 'IT'],
        posted: safeDate(item.pubDate),
        url: item.link || 'https://www.timesjobs.com',
        source: 'TimesJobs'
      };
    });
  } catch (e) {
    console.error('[TimesJobs]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 4 — Remotive (Remote IT jobs)
// Well-known remote job board, real API
// ─────────────────────────────────────────────
async function fetchRemotive(query = 'software') {
  const url = `https://remotive.com/api/remote-jobs?category=software-dev&search=${encodeURIComponent(query)}&limit=20`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    return (data.jobs || []).slice(0, CONFIG.limit).map(j => ({
      id: `remotive_${j.id}`,
      title: j.title || 'Unknown',
      company: j.company_name || 'Unknown',
      location: j.candidate_required_location || 'Remote 🌍',
      salary: j.salary || null,
      description: stripHtml(j.description || '').slice(0, 500),
      tags: (j.tags || []).slice(0, 5),
      posted: safeDate(j.publication_date),
      url: j.url || 'https://remotive.com',
      source: 'Remotive'
    }));
  } catch (e) {
    console.error('[Remotive]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 5 — Jobicy (Remote jobs)
// Clean free API, good IT coverage
// ─────────────────────────────────────────────
async function fetchJobicy(query = 'developer') {
  const tag = encodeURIComponent(query.split(' ')[0]);
  const url = `https://jobicy.com/api/v2/remote-jobs?count=20&tag=${tag}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    return (data.jobs || []).slice(0, CONFIG.limit).map(j => ({
      id: `jobicy_${j.id}`,
      title: j.jobTitle || 'Unknown',
      company: j.companyName || 'Unknown',
      location: j.jobGeo || 'Remote 🌍',
      salary: j.annualSalaryMin
        ? `$${j.annualSalaryMin.toLocaleString()} – $${j.annualSalaryMax?.toLocaleString() || j.annualSalaryMin.toLocaleString()}`
        : null,
      description: stripHtml(j.jobDescription || '').slice(0, 500),
      tags: (j.jobIndustry || []).concat(j.jobType || []).slice(0, 5),
      posted: safeDate(j.pubDate),
      url: j.url || 'https://jobicy.com',
      source: 'Jobicy'
    }));
  } catch (e) {
    console.error('[Jobicy]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 6 — RemoteOK
// ─────────────────────────────────────────────
async function fetchRemoteOK(query = 'javascript') {
  const tag = encodeURIComponent(query.toLowerCase().split(' ')[0]);
  const url = `https://remoteok.com/api?tags=${tag}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    return data.filter(j => j.id).slice(0, CONFIG.limit).map(j => ({
      id: `remoteok_${j.id}`,
      title: j.position || 'Unknown',
      company: j.company || 'Unknown',
      location: j.location || 'Remote 🌍',
      salary: j.salary || null,
      description: stripHtml(j.description || '').slice(0, 400),
      tags: (j.tags || []).slice(0, 5),
      posted: j.date ? new Date(j.date * 1000).toISOString() : new Date().toISOString(),
      url: j.url || `https://remoteok.com/jobs/${j.id}`,
      source: 'RemoteOK'
    }));
  } catch (e) {
    console.error('[RemoteOK]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 7 — Arbeitnow
// ─────────────────────────────────────────────
async function fetchArbeitnow(query = '') {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api?page=1', { headers: HEADERS });
    const data = await res.json();
    const q = query.toLowerCase();
    const jobs = data.data || [];
    const filtered = q
      ? jobs.filter(j => (j.title || '').toLowerCase().includes(q) || (j.tags || []).some(t => t.toLowerCase().includes(q)))
      : jobs;
    return filtered.slice(0, CONFIG.limit).map(j => ({
      id: `arbeitnow_${j.slug}`,
      title: j.title || 'Unknown',
      company: j.company_name || 'Unknown',
      location: j.location || (j.remote ? 'Remote 🌍' : 'Unknown'),
      salary: null,
      description: stripHtml(j.description || '').slice(0, 400),
      tags: (j.tags || []).slice(0, 5),
      posted: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
      url: j.url || 'https://www.arbeitnow.com',
      source: 'Arbeitnow'
    }));
  } catch (e) {
    console.error('[Arbeitnow]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 8 — Adzuna India
// Best for authentic Indian jobs (needs free signup)
// Register: developer.adzuna.com → free
// Set ADZUNA_APP_ID + ADZUNA_APP_KEY as GitHub Secrets
// ─────────────────────────────────────────────
async function fetchAdzuna(query = 'software engineer') {
  if (!CONFIG.adzuna.enabled) {
    console.log('[Adzuna] Skipped — set ADZUNA_APP_ID + ADZUNA_APP_KEY in GitHub Secrets for Indian jobs from Naukri/LinkedIn');
    return [];
  }
  const url = `https://api.adzuna.com/v1/api/jobs/in/search/1`
    + `?app_id=${CONFIG.adzuna.app_id}`
    + `&app_key=${CONFIG.adzuna.app_key}`
    + `&results_per_page=${CONFIG.limit}`
    + `&what=${encodeURIComponent(query)}`
    + `&content-type=application/json`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    return (data.results || []).map(j => ({
      id: `adzuna_${j.id}`,
      title: j.title || 'Unknown',
      company: j.company?.display_name || 'Unknown',
      location: j.location?.display_name || 'India',
      salary: j.salary_min
        ? `₹${Math.round(j.salary_min).toLocaleString()} – ₹${Math.round(j.salary_max || j.salary_min).toLocaleString()}`
        : null,
      description: stripHtml(j.description || '').slice(0, 500),
      tags: j.category ? [j.category.label] : [],
      posted: safeDate(j.created),
      url: j.redirect_url || 'https://www.adzuna.in',
      source: 'Adzuna India (Naukri/LinkedIn)'
    }));
  } catch (e) {
    console.error('[Adzuna]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// DUPLICATE DETECTION
// ─────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const a = s1.toLowerCase().slice(0, 150);
  const b = s2.toLowerCase().slice(0, 150);
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  return (longer - levenshtein(a, b)) / longer;
}

function findDuplicates(jobs, threshold = 0.75) {
  const dupes = [], seen = new Set();
  for (let i = 0; i < jobs.length; i++) {
    if (seen.has(i)) continue;
    for (let j = i + 1; j < jobs.length; j++) {
      if (seen.has(j)) continue;
      const a = jobs[i], b = jobs[j];
      if (a.company === b.company && a.title === b.title) {
        dupes.push({ indices: [i, j], reason: 'Exact title + company', confidence: 1.0 });
        seen.add(j);
      } else if (similarity(a.description, b.description) > threshold) {
        dupes.push({ indices: [i, j], reason: 'Similar description', confidence: 0.8 });
        seen.add(j);
      }
    }
  }
  return dupes;
}

// ─────────────────────────────────────────────
// FAKE JOB VALIDATOR
// ─────────────────────────────────────────────
const SCAM_PATTERNS = [
  /upfront.{0,20}(fee|payment|deposit)/i,
  /wire.{0,10}transfer/i,
  /processing.{0,10}fee/i,
  /guaranteed.{0,15}(job|hire|income)/i,
  /earn.{0,20}(easily|₹\d+).{0,20}(home|week)/i,
  /no.{0,10}experience.{0,15}required.{0,30}(earn|salary)/i,
  /work.{0,10}from.{0,10}home.{0,20}no.{0,10}experience/i,
  /whatsapp.{0,20}(apply|contact|join)/i,
  /data.{0,10}entry.{0,20}₹\s*[3-9]\d{4,}/i,
];

function validateJob(job) {
  let score = 0;
  const risks = [];
  const text = (job.description || '') + ' ' + (job.title || '');
  SCAM_PATTERNS.forEach(p => { if (p.test(text)) { score += 25; risks.push('Scam pattern detected'); } });
  if (/@(gmail|yahoo|hotmail|outlook)\.com/i.test(text)) { score += 30; risks.push('Personal email as contact'); }
  if (!job.url || job.url.length < 10) { score += 15; risks.push('No valid URL'); }
  const vague = ['work from home', 'earn money', 'part time work', 'home based'];
  if (vague.some(v => (job.title || '').toLowerCase().includes(v))) { score += 20; risks.push('Vague job title'); }
  const riskScore = Math.min(100, score);
  return {
    riskScore,
    riskLevel: riskScore < 30 ? 'LOW' : riskScore < 60 ? 'MEDIUM' : 'HIGH',
    isLegitimate: riskScore < 50,
    risks
  };
}

// ─────────────────────────────────────────────
// MAIN SCRAPER
// ─────────────────────────────────────────────
async function scrapeAll(query = 'software engineer') {
  console.log(`\n🔍 Scraping: "${query}"\n`);

  const [
    indeedIndia,
    psu,
    timesJobs,
    remotive,
    jobicy,
    remoteok,
    arbeitnow,
    adzuna
  ] = await Promise.allSettled([
    fetchIndeedIndia(query),
    fetchEmploymentNews(),
    fetchTimesJobs(query),
    fetchRemotive(query),
    fetchJobicy(query),
    fetchRemoteOK(query),
    fetchArbeitnow(query),
    fetchAdzuna(query)
  ]);

  const get = r => r.status === 'fulfilled' ? r.value : [];

  const counts = {
    'Indeed India':   get(indeedIndia).length,
    'Employment News (PSU)': get(psu).length,
    'TimesJobs':      get(timesJobs).length,
    'Remotive':       get(remotive).length,
    'Jobicy':         get(jobicy).length,
    'RemoteOK':       get(remoteok).length,
    'Arbeitnow':      get(arbeitnow).length,
    'Adzuna India':   get(adzuna).length,
  };

  Object.entries(counts).forEach(([s, n]) => console.log(`  ${s}: ${n} jobs`));

  const allJobs = [
    ...get(indeedIndia),
    ...get(psu),
    ...get(timesJobs),
    ...get(adzuna),      // Adzuna first — best Indian data
    ...get(remotive),
    ...get(jobicy),
    ...get(remoteok),
    ...get(arbeitnow),
  ].map(job => ({ ...job, validation: validateJob(job) }));

  const duplicates = findDuplicates(allJobs);
  const dupeIndices = new Set(duplicates.flatMap(d => [d.indices[1]]));

  const jobs = allJobs.map((j, i) => ({ ...j, isDuplicate: dupeIndices.has(i) }));

  const summary = {
    total:      jobs.length,
    verified:   jobs.filter(j => j.validation.isLegitimate).length,
    suspicious: jobs.filter(j => !j.validation.isLegitimate).length,
    duplicates: duplicates.length,
    bySource:   counts,
    scrapedAt:  new Date().toISOString(),
    query
  };

  const output = { scrapedAt: summary.scrapedAt, query, summary, jobs, duplicates };

  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));

  console.log(`\n✅ Saved ${jobs.length} jobs to jobs.json`);
  console.log(`   Verified: ${summary.verified} | Suspicious: ${summary.suspicious} | Dupes: ${summary.duplicates}`);
  if (!CONFIG.adzuna.enabled) {
    console.log('\n💡 TIP: Set ADZUNA_APP_ID + ADZUNA_APP_KEY in GitHub Secrets for Indian jobs from Naukri/LinkedIn.');
    console.log('   Register free at: https://developer.adzuna.com\n');
  }

  return output;
}

// CLI
if (require.main === module) {
  const query = process.argv[2] || 'software engineer';
  scrapeAll(query).catch(console.error);
}

module.exports = { scrapeAll, validateJob, findDuplicates };
