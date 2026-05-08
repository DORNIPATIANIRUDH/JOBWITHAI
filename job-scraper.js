/**
 * IT Job Agent - Backend Scraper & Validator
 * Scrapes jobs from multiple sources and validates them
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================
// JOB SOURCES CONFIGURATION
// ============================================

const JOB_SOURCES = {
  linkedin: {
    name: 'LinkedIn',
    url: 'https://api.linkedin.com/v2/jobs',
    parser: parseLinkedInJobs,
    rateLimit: 100 // requests per hour
  },
  indeed: {
    name: 'Indeed',
    url: 'https://www.indeed.com/jobs',
    parser: parseIndeedJobs,
    rateLimit: 200
  },
  naukri: {
    name: 'Naukri',
    url: 'https://www.naukri.com/search?k=',
    parser: parseNaukriJobs,
    rateLimit: 150
  },
  github: {
    name: 'GitHub Jobs',
    url: 'https://jobs.github.com/positions.json',
    parser: parseGitHubJobs,
    rateLimit: 50
  },
  angellist: {
    name: 'AngelList',
    url: 'https://angel.co/jobs',
    parser: parseAngelListJobs,
    rateLimit: 100
  }
};

// ============================================
// JOB SCRAPING FUNCTIONS
// ============================================

async function parseLinkedInJobs(searchQuery, limit = 20) {
  // LinkedIn requires authentication, this is a mock structure
  console.log(`[LinkedIn] Searching: ${searchQuery}`);
  return [{
    id: 'linkedin_1',
    title: 'Senior Software Engineer',
    company: 'Google',
    location: 'Bangalore, India',
    salary: '₹1500000-₹2000000',
    description: 'We are looking for a senior engineer with 5+ years experience',
    posted: new Date(),
    url: 'https://linkedin.com/jobs/view/123456',
    source: 'linkedin',
    verified: true
  }];
}

async function parseIndeedJobs(searchQuery, limit = 20) {
  console.log(`[Indeed] Searching: ${searchQuery}`);
  // Indeed scraping would go here
  return [];
}

async function parseNaukriJobs(searchQuery, limit = 20) {
  console.log(`[Naukri] Searching: ${searchQuery}`);
  // Naukri scraping would go here
  return [];
}

async function parseGitHubJobs(searchQuery, limit = 20) {
  try {
    const response = await fetch(JOB_SOURCES.github.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
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
  } catch (err) {
    console.error('[GitHub] Error:', err.message);
    return [];
  }
}

async function parseAngelListJobs(searchQuery, limit = 20) {
  console.log(`[AngelList] Searching: ${searchQuery}`);
  // AngelList scraping would go here
  return [];
}

// ============================================
// DUPLICATE DETECTION
// ============================================

function calculateStringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function findDuplicates(jobs, similarityThreshold = 0.75) {
  const duplicates = [];
  const checked = new Set();
  
  for (let i = 0; i < jobs.length; i++) {
    if (checked.has(i)) continue;
    
    for (let j = i + 1; j < jobs.length; j++) {
      if (checked.has(j)) continue;
      
      const job1 = jobs[i];
      const job2 = jobs[j];
      
      // Exact company + title match
      if (job1.company === job2.company && job1.title === job2.title) {
        duplicates.push({
          group: [i, j],
          reason: 'Exact title and company match',
          confidence: 1.0,
          jobs: [job1, job2]
        });
        checked.add(j);
        continue;
      }
      
      // Similar descriptions
      const descSimilarity = calculateStringSimilarity(
        job1.description || '',
        job2.description || ''
      );
      
      if (descSimilarity > similarityThreshold) {
        duplicates.push({
          group: [i, j],
          reason: `Similar job descriptions (${(descSimilarity * 100).toFixed(1)}% match)`,
          confidence: descSimilarity,
          jobs: [job1, job2]
        });
        checked.add(j);
      }
    }
  }
  
  return duplicates;
}

// ============================================
// FAKE JOB DETECTION
// ============================================

class JobValidator {
  constructor() {
    this.suspiciousPatterns = [
      /work from home.*no experience/i,
      /earn.*easily.*home/i,
      /no degree.*required/i,
      /guaranteed.*hiring/i,
      /upfront.*payment/i,
      /processing fee/i,
      /wire transfer/i,
      /untraceable.*payment/i,
    ];
    
    this.badEnglishIndicators = [
      /their is /i,
      /your company/i,
      /plz /i,
      /asap.*need/i,
      /kindly.*urgent/i,
    ];
    
    this.validCompanyDomains = {
      'google.com': true,
      'microsoft.com': true,
      'amazon.com': true,
      'apple.com': true,
      'meta.com': true,
      'nvidia.com': true,
      'ibm.com': true,
      'intel.com': true,
      'oracle.com': true,
      'salesforce.com': true,
    };
  }

  validate(job) {
    const risks = [];
    let riskScore = 0;

    // 1. Check for suspicious patterns
    const suspiciousMatches = this.suspiciousPatterns.filter(p => p.test(job.description));
    if (suspiciousMatches.length > 0) {
      riskScore += 30;
      risks.push('Suspicious job description patterns detected');
    }

    // 2. Grammar check
    const grammarIssues = this.badEnglishIndicators.filter(p => p.test(job.description));
    if (grammarIssues.length > 2) {
      riskScore += 20;
      risks.push('Poor English quality detected');
    }

    // 3. Vague company name
    if (!job.company || job.company.length < 3 || /^[A-Za-z0-9 ]+$/.test(job.company) === false) {
      riskScore += 15;
      risks.push('Vague or suspicious company name');
    }

    // 4. Company verification
    const emailDomain = this.extractEmailDomain(job.description);
    if (emailDomain && !this.validateDomain(emailDomain)) {
      riskScore += 25;
      risks.push(`Suspicious email domain: ${emailDomain}`);
    }

    // 5. Salary validation
    if (job.salary) {
      const isUnrealistic = this.isSalaryUnrealistic(job.title, job.salary);
      if (isUnrealistic) {
        riskScore += 25;
        risks.push('Unrealistic salary for this position');
      }
    }

    // 6. No clear contact info
    if (!job.url || !job.company || !job.location) {
      riskScore += 15;
      risks.push('Missing critical job information');
    }

    // 7. Too good to be true (work from home + high salary)
    if (job.location?.toLowerCase().includes('remote') || job.location?.toLowerCase().includes('work from home')) {
      if (job.salary && this.isSalaryHigh(job.salary)) {
        riskScore += 20;
        risks.push('Work-from-home with exceptionally high salary (common scam)');
      }
    }

    return {
      isLegitimate: riskScore < 40,
      riskLevel: this.getRiskLevel(riskScore),
      riskScore: Math.min(100, riskScore),
      risks: risks,
      verified: riskScore < 30
    };
  }

  extractEmailDomain(text) {
    const emailRegex = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = text.match(emailRegex);
    return match ? match[1] : null;
  }

  validateDomain(domain) {
    // Simple domain validation - would connect to WHOIS/DNS in production
    const knownBad = ['gmail.com', 'yahoo.com', 'outlook.com'];
    if (knownBad.includes(domain.toLowerCase())) return false;
    return true;
  }

  isSalaryUnrealistic(title, salary) {
    // Parse salary range
    const salaryMatch = salary.match(/₹?(\d+)[-–]?₹?(\d+)?/);
    if (!salaryMatch) return false;

    const minSalary = parseInt(salaryMatch[1]);
    const maxSalary = salaryMatch[2] ? parseInt(salaryMatch[2]) : minSalary;
    const avgSalary = (minSalary + maxSalary) / 2;

    // Industry benchmarks
    const benchmarks = {
      'intern': { min: 50000, max: 300000 },
      'junior': { min: 300000, max: 800000 },
      'senior': { min: 1000000, max: 3000000 },
      'lead': { min: 1500000, max: 4000000 },
      'manager': { min: 1200000, max: 3500000 },
    };

    for (const [level, range] of Object.entries(benchmarks)) {
      if (title.toLowerCase().includes(level)) {
        return avgSalary < range.min || avgSalary > range.max * 1.5;
      }
    }

    return false;
  }

  isSalaryHigh(salary) {
    const salaryMatch = salary.match(/₹?(\d+)[-–]?₹?(\d+)?/);
    if (!salaryMatch) return false;
    const avgSalary = parseInt(salaryMatch[1]);
    return avgSalary > 1500000; // Above 15 LPA
  }

  getRiskLevel(score) {
    if (score < 30) return 'LOW';
    if (score < 60) return 'MEDIUM';
    return 'HIGH';
  }
}

// ============================================
// MAIN SCRAPER CLASS
// ============================================

class JobScraper {
  constructor() {
    this.validator = new JobValidator();
    this.jobs = [];
    this.duplicates = [];
    this.lastScrape = null;
  }

  async scrapeAll(searchQuery = 'IT jobs', limit = 20) {
    console.log(`\n🔍 Scraping for: "${searchQuery}"\n`);
    
    const results = {
      total: 0,
      verified: 0,
      suspicious: 0,
      duplicates: 0,
      jobs: [],
      stats: {}
    };

    // Scrape from each source
    for (const [key, source] of Object.entries(JOB_SOURCES)) {
      try {
        console.log(`[${source.name}] Fetching jobs...`);
        const jobs = await source.parser(searchQuery, limit);
        
        // Validate each job
        const validatedJobs = jobs.map(job => ({
          ...job,
          validation: this.validator.validate(job)
        }));

        results.jobs.push(...validatedJobs);
        results.stats[key] = validatedJobs.length;
        
      } catch (err) {
        console.error(`[${source.name}] Error:`, err.message);
        results.stats[key] = `Error: ${err.message}`;
      }
    }

    // Detect duplicates
    this.duplicates = findDuplicates(results.jobs);
    results.duplicates = this.duplicates.length;

    // Count validations
    results.verified = results.jobs.filter(j => j.validation.verified).length;
    results.suspicious = results.jobs.filter(j => !j.validation.isLegitimate).length;
    results.total = results.jobs.length;

    this.jobs = results.jobs;
    this.lastScrape = new Date();

    return results;
  }

  generateReport() {
    if (this.jobs.length === 0) {
      return '❌ No jobs scraped yet. Run scrapeAll() first.';
    }

    let report = `
╔════════════════════════════════════════════════════════╗
║         IT JOB SCRAPER REPORT - ${this.lastScrape.toLocaleDateString()}            ║
╚════════════════════════════════════════════════════════╝

📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Jobs Found:     ${this.jobs.length}
Verified (Legitimate): ${this.jobs.filter(j => j.validation.verified).length}
Suspicious:           ${this.jobs.filter(j => !j.validation.isLegitimate).length}
Duplicates Found:     ${this.duplicates.length}

🟢 VERIFIED JOBS (Low Risk)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    this.jobs.filter(j => j.validation.verified).slice(0, 5).forEach((job, i) => {
      report += `
${i + 1}. ${job.title}
   Company: ${job.company}
   Location: ${job.location}
   Salary: ${job.salary || 'Not mentioned'}
   Source: ${job.source}
   URL: ${job.url}
`;
    });

    report += `

⚠️  SUSPICIOUS JOBS (Medium-High Risk)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    this.jobs.filter(j => !j.validation.isLegitimate).slice(0, 5).forEach((job, i) => {
      report += `
${i + 1}. ${job.title}
   Company: ${job.company}
   Risk Level: ${job.validation.riskLevel}
   Risk Score: ${job.validation.riskScore}/100
   Issues: ${job.validation.risks.join(', ')}
`;
    });

    if (this.duplicates.length > 0) {
      report += `

🔄 DUPLICATES DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      this.duplicates.slice(0, 3).forEach((dup, i) => {
        report += `
${i + 1}. ${dup.jobs[0].title} @ ${dup.jobs[0].company}
   Duplicate of: ${dup.jobs[1].title} @ ${dup.jobs[1].company}
   Reason: ${dup.reason}
   Confidence: ${(dup.confidence * 100).toFixed(1)}%
`;
      });
    }

    return report;
  }

  exportToJSON(filename = 'jobs.json') {
    const data = {
      timestamp: this.lastScrape,
      summary: {
        total: this.jobs.length,
        verified: this.jobs.filter(j => j.validation.verified).length,
        suspicious: this.jobs.filter(j => !j.validation.isLegitimate).length,
        duplicates: this.duplicates.length
      },
      jobs: this.jobs,
      duplicates: this.duplicates
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`✅ Exported to ${filename}`);
    return filename;
  }

  exportToMarkdown(filename = 'jobs.md') {
    let md = `# IT Jobs Report\n\nGenerated: ${new Date().toLocaleString()}\n\n`;

    md += `## 📊 Summary\n\n`;
    md += `- **Total Jobs**: ${this.jobs.length}\n`;
    md += `- **Verified**: ${this.jobs.filter(j => j.validation.verified).length}\n`;
    md += `- **Suspicious**: ${this.jobs.filter(j => !j.validation.isLegitimate).length}\n`;
    md += `- **Duplicates**: ${this.duplicates.length}\n\n`;

    md += `## ✅ Verified Jobs\n\n`;
    this.jobs.filter(j => j.validation.verified).forEach(job => {
      md += `### ${job.title}\n`;
      md += `**Company**: ${job.company}\n`;
      md += `**Location**: ${job.location}\n`;
      md += `**Salary**: ${job.salary || 'Not mentioned'}\n`;
      md += `**Source**: [${job.source}](${job.url})\n\n`;
    });

    fs.writeFileSync(filename, md);
    console.log(`✅ Exported to ${filename}`);
    return filename;
  }
}

// ============================================
// EXPORT & USAGE
// ============================================

module.exports = {
  JobScraper,
  JobValidator,
  findDuplicates,
  calculateStringSimilarity
};

// Example usage
if (require.main === module) {
  (async () => {
    const scraper = new JobScraper();
    
    const results = await scraper.scrapeAll('software engineer', 20);
    
    console.log(scraper.generateReport());
    
    scraper.exportToJSON('./jobs.json');
    scraper.exportToMarkdown('./jobs.md');
  })();
}
