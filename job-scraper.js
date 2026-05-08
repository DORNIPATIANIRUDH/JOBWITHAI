/**
 * IT Job Agent - Real API Scraper
 * Uses 100% free, no-credit-card APIs:
 *   - RemoteOK    (no key needed)
 *   - Arbeitnow   (no key needed)
 *   - The Muse    (no key needed)
 *   - Adzuna      (free tier: register at developer.adzuna.com → get app_id + app_key)
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');

// ─────────────────────────────────────────────
// CONFIG  ← only Adzuna needs keys (free signup)
// ─────────────────────────────────────────────
const CONFIG = {
  adzuna: {
    app_id:  process.env.ADZUNA_APP_ID  || '',   // set in GitHub Secrets
    app_key: process.env.ADZUNA_APP_KEY || '',   // set in GitHub Secrets
    country: 'in',                               // India
    enabled: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)
  },
  resultsPerSource: 20
};

// ─────────────────────────────────────────────
// SOURCE 1 — RemoteOK  (free, no key, CORS ok)
// ─────────────────────────────────────────────
async function fetchRemoteOK(query = 'javascript') {
  const tag = encodeURIComponent(query.toLowerCase().split(' ')[0]);
  const url = `https://remoteok.com/api?tags=${tag}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IT-Job-Agent/1.0' }
    });
    const data = await res.json();
    // First element is a metadata object, skip it
    return data
      .filter(j => j.id)
      .slice(0, CONFIG.resultsPerSource)
      .map(j => ({
        id:          `remoteok_${j.id}`,
        title:       j.position || 'Unknown',
        company:     j.company || 'Unknown',
        location:    j.location || 'Remote',
        salary:      j.salary || null,
        description: stripHtml(j.description || ''),
        tags:        j.tags || [],
        posted:      j.date ? new Date(j.date * 1000).toISOString() : new Date().toISOString(),
        url:         j.url || `https://remoteok.com/jobs/${j.id}`,
        source:      'RemoteOK',
        logo:        j.company_logo || null
      }));
  } catch (e) {
    console.error('[RemoteOK] Error:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 2 — Arbeitnow  (free, no key, CORS ok)
// ─────────────────────────────────────────────
async function fetchArbeitnow(query = '') {
  const url = `https://www.arbeitnow.com/api/job-board-api?page=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IT-Job-Agent/1.0' }
    });
    const data = await res.json();
    const jobs = data.data || [];
    const q = query.toLowerCase();
    const filtered = q
      ? jobs.filter(j =>
          (j.title || '').toLowerCase().includes(q) ||
          (j.description || '').toLowerCase().includes(q))
      : jobs;
    return filtered.slice(0, CONFIG.resultsPerSource).map(j => ({
      id:          `arbeitnow_${j.slug}`,
      title:       j.title || 'Unknown',
      company:     j.company_name || 'Unknown',
      location:    j.location || 'Remote',
      salary:      null,
      description: stripHtml(j.description || '').slice(0, 500),
      tags:        j.tags || [],
      posted:      j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
      url:         j.url || 'https://www.arbeitnow.com',
      source:      'Arbeitnow',
      remote:      j.remote || false
    }));
  } catch (e) {
    console.error('[Arbeitnow] Error:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 3 — The Muse  (free, no key needed)
// ─────────────────────────────────────────────
async function fetchTheMuse(query = 'software engineer') {
  const category = encodeURIComponent(query);
  const url = `https://www.themuse.com/api/public/jobs?category=${category}&page=0&descending=true`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IT-Job-Agent/1.0' }
    });
    const data = await res.json();
    const jobs = data.results || [];
    return jobs.slice(0, CONFIG.resultsPerSource).map(j => ({
      id:          `muse_${j.id}`,
      title:       j.name || 'Unknown',
      company:     j.company?.name || 'Unknown',
      location:    j.locations?.[0]?.name || 'Unknown',
      salary:      null,
      description: stripHtml(j.contents || '').slice(0, 500),
      tags:        j.categories?.map(c => c.name) || [],
      posted:      j.publication_date || new Date().toISOString(),
      url:         j.refs?.landing_page || 'https://www.themuse.com',
      source:      'The Muse',
      levels:      j.levels?.map(l => l.name) || []
    }));
  } catch (e) {
    console.error('[The Muse] Error:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// SOURCE 4 — Adzuna  (free tier, needs signup)
//   Register free at: https://developer.adzuna.com
//   Set ADZUNA_APP_ID + ADZUNA_APP_KEY in GitHub Secrets
// ─────────────────────────────────────────────
async function fetchAdzuna(query = 'software engineer') {
  if (!CONFIG.adzuna.enabled) {
    console.log('[Adzuna] Skipped — no API keys set. Register free at developer.adzuna.com');
    return [];
  }
  const url = `https://api.adzuna.com/v1/api/jobs/${CONFIG.adzuna.country}/search/1` +
    `?app_id=${CONFIG.adzuna.app_id}` +
    `&app_key=${CONFIG.adzuna.app_key}` +
    `&results_per_page=${CONFIG.resultsPerSource}` +
    `&what=${encodeURIComponent(query)}` +
    `&content-type=application/json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IT-Job-Agent/1.0' }
    });
    const data = await res.json();
    const jobs = data.results || [];
    return jobs.map(j => ({
      id:          `adzuna_${j.id}`,
      title:       j.title || 'Unknown',
      company:     j.company?.display_name || 'Unknown',
      location:    j.location?.display_name || 'India',
      salary:      j.salary_min
                    ? `₹${Math.round(j.salary_min).toLocaleString()} – ₹${Math.round(j.salary_max || j.salary_min).toLocaleString()}`
                    : null,
      description: stripHtml(j.description || '').slice(0, 500),
      tags:        j.category ? [j.category.label] : [],
      posted:      j.created || new Date().toISOString(),
      url:         j.redirect_url || 'https://www.adzuna.in',
      source:      'Adzuna India'
    }));
  } catch (e) {
    console.error('[Adzuna] Error:', e.message);
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
  const a = s1.toLowerCase().slice(0, 200);
  const b = s2.toLowerCase().slice(0, 200);
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  return (longer - levenshtein(a, b)) / longer;
}

function findDuplicates(jobs, threshold = 0.75) {
  const dupes = [];
  const seen = new Set();
  for (let i = 0; i < jobs.length; i++) {
    if (seen.has(i)) continue;
    for (let j = i + 1; j < jobs.length; j++) {
      if (seen.has(j)) continue;
      const a = jobs[i], b = jobs[j];
      if (a.company === b.company && a.title === b.title) {
        dupes.push({ indices: [i, j], reason: 'Exact title + company match', confidence: 1.0 });
        seen.add(j);
        continue;
      }
      const sim = similarity(a.description, b.description);
      if (sim > threshold) {
        dupes.push({ indices: [i, j], reason: `${(sim * 100).toFixed(0)}% description similarity`, confidence: sim });
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
  /no.{0,10}experience.{0,15}required.{0,30}(earn|salary|₹)/i,
  /work.{0,10}from.{0,10}home.{0,20}no.{0,10}experience/i,
  /part.?time.{0,20}₹\s*[5-9]\d{4,}/i,
  /whatsapp.{0,20}(apply|contact|join)/i,
  /data.{0,10}entry.{0,20}₹\s*[3-9]\d{4,}/i,
];

function validateJob(job) {
  let score = 0;
  const risks = [];

  SCAM_PATTERNS.forEach(p => {
    if (p.test(job.description) || p.test(job.title)) {
      score += 25;
      risks.push('Scam pattern in description');
    }
  });

  // Gmail/Yahoo/Hotmail as company contact = suspicious
  if (/@(gmail|yahoo|hotmail|outlook)\.com/i.test(job.description)) {
    score += 30;
    risks.push('Personal email domain as contact (not corporate)');
  }

  // No URL
  if (!job.url || job.url.length < 10) {
    score += 15;
    risks.push('No valid application URL');
  }

  // Salary sanity check
  if (job.salary) {
    const nums = job.salary.match(/\d+/g)?.map(Number) || [];
    if (nums.length && nums[0] > 5000000) {
      score += 20;
      risks.push(`Salary ₹${nums[0].toLocaleString()} seems unrealistic`);
    }
  }

  // Title too vague
  const vague = ['work from home', 'earn money', 'part time work', 'home based'];
  if (vague.some(v => job.title.toLowerCase().includes(v))) {
    score += 20;
    risks.push('Vague or generic job title');
  }

  const riskScore = Math.min(100, score);
  return {
    riskScore,
    riskLevel: riskScore < 30 ? 'LOW' : riskScore < 60 ? 'MEDIUM' : 'HIGH',
    isLegitimate: riskScore < 50,
    risks
  };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function scrapeAll(query = 'software engineer') {
  console.log(`\n🔍 Scraping: "${query}"\n`);

  const [remoteok, arbeitnow, muse, adzuna] = await Promise.all([
    fetchRemoteOK(query),
    fetchArbeitnow(query),
    fetchTheMuse(query),
    fetchAdzuna(query)
  ]);

  console.log(`RemoteOK: ${remoteok.length} | Arbeitnow: ${arbeitnow.length} | The Muse: ${muse.length} | Adzuna: ${adzuna.length}`);

  const allJobs = [...remoteok, ...arbeitnow, ...muse, ...adzuna].map(job => ({
    ...job,
    validation: validateJob(job)
  }));

  const duplicates = findDuplicates(allJobs);
  const duplicateIndices = new Set(duplicates.flatMap(d => [d.indices[1]]));

  const summary = {
    total:      allJobs.length,
    verified:   allJobs.filter(j => j.validation.isLegitimate).length,
    suspicious: allJobs.filter(j => !j.validation.isLegitimate).length,
    duplicates: duplicates.length,
    bySource: {
      remoteok:   remoteok.length,
      arbeitnow:  arbeitnow.length,
      muse:       muse.length,
      adzuna:     adzuna.length
    }
  };

  const output = {
    scrapedAt: new Date().toISOString(),
    query,
    summary,
    jobs: allJobs.map((j, i) => ({ ...j, isDuplicate: duplicateIndices.has(i) })),
    duplicates
  };

  // Write to jobs.json (picked up by GitHub Pages / index.html)
  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved ${allJobs.length} jobs to jobs.json`);
  console.log(`   Verified: ${summary.verified} | Suspicious: ${summary.suspicious} | Dupes: ${summary.duplicates}`);

  return output;
}

// CLI entry
if (require.main === module) {
  const query = process.argv[2] || 'software engineer';
  scrapeAll(query).catch(console.error);
}

module.exports = { scrapeAll, fetchRemoteOK, fetchArbeitnow, fetchTheMuse, fetchAdzuna, validateJob, findDuplicates };
