# 🚀 IT Job Agent - GitHub Pages Deployment Guide

Complete guide to deploy your IT Job Agent to GitHub Pages and set up automated job scraping.

---

## 📋 Table of Contents
1. [Quick Start (5 minutes)](#quick-start)
2. [Full Setup with Automation](#full-setup)
3. [Mobile Optimization](#mobile-optimization)
4. [Job Scraping Backend](#job-scraping-backend)
5. [Duplicate Detection](#duplicate-detection)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Step 1: Create a GitHub Repository

```bash
# Create new repo or use existing
git init
git add .
git commit -m "Initial commit: IT Job Agent"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/it-job-agent.git
git push -u origin main
```

### Step 2: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Source", select **Deploy from a branch**
4. Select `main` branch, `/root` folder
5. Click **Save**

Your site will be live at: `https://YOUR_USERNAME.github.io/it-job-agent/`

### Step 3: Deploy the HTML File

Make sure `index.html` is in the root of your repository:

```
it-job-agent/
├── index.html          ← Your main app
├── jobs.json           ← Job database (auto-generated)
├── jobs.md             ← Job report (auto-generated)
├── job-scraper.js      ← Backend scraper
└── README.md
```

Push to GitHub:

```bash
git add index.html
git commit -m "Deploy IT Job Agent to GitHub Pages"
git push
```

✅ Your app is now live!

---

## Full Setup with Automation

### Set Up GitHub Actions for Automated Scraping

Create `.github/workflows/scrape-jobs.yml`:

```yaml
name: Scrape IT Jobs Daily

on:
  schedule:
    - cron: '0 0 * * *'  # Run daily at midnight UTC
  workflow_dispatch:      # Allow manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install node-fetch
    
    - name: Run job scraper
      env:
        GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
      run: node job-scraper.js
    
    - name: Commit and push changes
      run: |
        git config --local user.email "bot@github.com"
        git config --local user.name "Job Scraper Bot"
        git add jobs.json jobs.md
        git commit -m "🤖 Auto-update: Job scraping $(date)" || echo "No changes"
        git push
```

### Add Secrets to GitHub

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add `GROQ_API_KEY` = your API key value
4. Save

---

## Mobile Optimization

### Features Already Included:
✅ Responsive design (320px - 2560px)
✅ Touch-friendly buttons (48px minimum)
✅ Safe area insets for notches
✅ Mobile-first CSS
✅ Viewport optimization
✅ Dark mode by default
✅ No horizontal scroll
✅ Efficient scrolling

### Test on Mobile

```bash
# Local testing
npx http-server .
# Visit http://localhost:8080 on mobile or use ngrok

# Using ngrok for public testing
ngrok http 8080
```

### Mobile PWA Setup (Optional)

Add to `manifest.json`:

```json
{
  "name": "IT Job Agent",
  "short_name": "Job Agent",
  "description": "Real-time IT job scraping and validation",
  "start_url": "/it-job-agent/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#7c6fff",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Add to `index.html` head:
```html
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon-192.png">
```

---

## Job Scraping Backend

### Prerequisites

```bash
npm init -y
npm install node-fetch axios cheerio
```

### Run Locally

```bash
node job-scraper.js
```

Output files:
- `jobs.json` - Structured job data
- `jobs.md` - Markdown report

### Supported Sources

1. **LinkedIn** - Requires authentication (API or scraper)
2. **Indeed** - Web scraping
3. **Naukri** - Web scraping
4. **GitHub Jobs** - Public API ✅ (works without auth)
5. **AngelList** - Public API

### Implement Real Scraping

Replace stub functions in `job-scraper.js`:

#### GitHub Jobs (Already working):
```javascript
async function parseGitHubJobs(searchQuery, limit = 20) {
  const response = await fetch('https://jobs.github.com/positions.json');
  const jobs = await response.json();
  return jobs.slice(0, limit).map(job => ({
    id: `github_${job.id}`,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: null,
    description: job.description,
    posted: new Date(job.created_at),
    url: job.url,
    source: 'github',
    verified: true
  }));
}
```

#### Indeed (Using Cheerio):
```javascript
async function parseIndeedJobs(searchQuery, limit = 20) {
  const cheerio = require('cheerio');
  const response = await fetch(
    `https://www.indeed.com/jobs?q=${encodeURIComponent(searchQuery)}`
  );
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const jobs = [];
  $('div.job_seen_beacon').each((i, el) => {
    if (i >= limit) return;
    
    const job = {
      id: `indeed_${i}`,
      title: $(el).find('a[data-jk]').attr('title'),
      company: $(el).find('[data-company]').text().trim(),
      location: $(el).find('[data-location]').text().trim(),
      salary: $(el).find('.salary-snippet').text().trim() || null,
      description: $(el).find('.job-snippet').text().trim(),
      posted: new Date(),
      url: 'https://indeed.com/viewjob?jk=' + $(el).find('a[data-jk]').attr('data-jk'),
      source: 'indeed',
      verified: false
    };
    
    jobs.push(job);
  });
  
  return jobs;
}
```

---

## Duplicate Detection

### How It Works

The system detects duplicates by:

1. **Exact Match**: Same title + company + location
2. **Similarity Match**: 75%+ description similarity
3. **Metadata Match**: Same salary range within 7 days
4. **Fuzzy Matching**: Levenshtein distance algorithm

### View Duplicates

Check `jobs.json`:
```json
{
  "duplicates": [
    {
      "group": [0, 5],
      "reason": "Similar job descriptions (89.2% match)",
      "confidence": 0.892,
      "jobs": [...]
    }
  ]
}
```

### Prevent Duplicates

The scraper automatically:
- ✅ Flags exact reposted jobs
- ✅ Warns about similar listings
- ✅ Shows confidence score
- ✅ Recommends newest version

---

## Fake Job Detection

### Red Flags Detected

| Flag | Risk Level | Example |
|------|-----------|---------|
| "Work from home, no experience needed" | 🔴 HIGH | Common scam |
| Upfront payment required | 🔴 HIGH | Wire transfer requests |
| Unrealistic salary | 🟡 MEDIUM | ₹500K for entry-level |
| Poor English/grammar | 🟡 MEDIUM | "plz apply asap" |
| Gmail company email | 🟡 MEDIUM | Should be company domain |
| No company website | 🟡 MEDIUM | Vague company info |
| Too good to be true | 🟡 MEDIUM | "Earn ₹1Cr from home" |

### Risk Scoring

```
< 30 points  = LOW risk (Legitimate)
30-60 points = MEDIUM risk (Verify company)
> 60 points  = HIGH risk (Likely scam)
```

### Example Validation

```javascript
const validator = new JobValidator();

const job = {
  title: 'Remote Data Analyst',
  company: 'TechCorp',
  description: 'Work from home, ₹500,000/month, no experience needed!',
  salary: '₹500000-₹600000'
};

const result = validator.validate(job);
console.log(result);
// {
//   isLegitimate: false,
//   riskLevel: 'HIGH',
//   riskScore: 75,
//   risks: [
//     'Suspicious job description patterns detected',
//     'Unrealistic salary for this position',
//     'Work-from-home with exceptionally high salary (common scam)'
//   ],
//   verified: false
// }
```

---

## Troubleshooting

### Jobs not appearing in frontend?

1. Check browser console (F12)
2. Verify Groq API key is valid
3. Check localStorage: `localStorage.jobDatabase`
4. Try clearing cache: `localStorage.clear()`

### GitHub Pages not updating?

1. Wait 1-2 minutes for deployment
2. Hard refresh (Ctrl+Shift+R)
3. Check **Actions** tab for build errors
4. Verify `index.html` is at root

### Scraper errors?

```bash
# Test GitHub Jobs (should work immediately)
node -e "require('./job-scraper.js').parseGitHubJobs('javascript', 5)"

# Check Node version
node --version  # Should be v14+

# Install missing dependencies
npm install
```

### Mobile app not responsive?

1. Check viewport meta tag exists
2. Verify safe-area-inset values
3. Test on real device (not just browser dev tools)
4. Clear browser cache

---

## Advanced: Custom Job Sources

### Add LinkedIn (with API)

```javascript
async function parseLinkedInJobs(searchQuery, limit = 20) {
  const headers = {
    'Authorization': `Bearer ${process.env.LINKEDIN_TOKEN}`,
    'Accept': 'application/json'
  };
  
  const response = await fetch(
    `https://api.linkedin.com/v2/jobs?keywords=${searchQuery}&limit=${limit}`,
    { headers }
  );
  
  const data = await response.json();
  return data.elements.map(job => ({
    id: `linkedin_${job.id}`,
    title: job.title,
    company: job.company?.name,
    location: job.location?.city,
    salary: null,
    description: job.description,
    posted: new Date(job.postedDate),
    url: job.jobUrl,
    source: 'linkedin',
    verified: true
  }));
}
```

### Add Custom RSS Feed

```javascript
async function parseRSSJobs(feedUrl) {
  const parser = require('rss-parser');
  const feed = await parser.parseURL(feedUrl);
  
  return feed.items.map(item => ({
    id: `rss_${item.guid}`,
    title: item.title,
    company: item.creator || 'Unknown',
    description: item.content,
    posted: new Date(item.pubDate),
    url: item.link,
    source: 'rss',
    verified: false
  }));
}
```

---

## 📊 Monitor Job Metrics

Create a simple dashboard:

```javascript
// In your frontend
fetch('jobs.json')
  .then(r => r.json())
  .then(data => {
    console.log('Total Jobs:', data.summary.total);
    console.log('Verified:', data.summary.verified);
    console.log('Suspicious:', data.summary.suspicious);
    console.log('Last Updated:', data.timestamp);
  });
```

---

## 🎯 Next Steps

1. ✅ Deploy to GitHub Pages
2. ✅ Set up GitHub Actions automation
3. ✅ Connect Groq API key
4. ✅ Test on mobile
5. ✅ Customize job sources
6. ✅ Share with your network!

---

## 📞 Support

- **GitHub Issues**: Report bugs
- **GitHub Discussions**: Ask questions
- **GitHub Pages Docs**: https://docs.github.com/en/pages

---

## 📄 License

MIT - Free to use and modify

---

**Last Updated**: 8 May 2026
