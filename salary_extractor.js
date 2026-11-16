/**
 * salary_extractor.js
 * High-precision Job Description (JD) Salary Scanner & Compensation Extractor
 * Supports USD, GBP (£), EUR (€), CAD (C$), AUD (A$), INR (₹), CHF, and hourly conversion.
 */

function extractSalaryFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // Clean HTML tags and decode common entities
  const clean = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  // 1. Proximity matching: looks for numbers near compensation keywords
  const proximityRegex = /(?:salary|compensation|pay range|base pay|base salary|salary range|remuneration|target pay|annual salary)[\s\S]{0,120}?(?:(?:USD|CAD|EUR|GBP)\s*)?([$£€₹]|(?:CA|AU|C|A)\$)?\s*(\d{2,3}(?:,\d{3})*|\d{2,3}k)\s*(?:-|to|–|—)\s*([$£€₹]|(?:CA|AU|C|A)\$)?\s*(\d{2,3}(?:,\d{3})*|\d{2,3}k)/i;
  let match = clean.match(proximityRegex);
  if (match) {
    const cur = match[1] || match[3] || '$';
    const min = match[2];
    const max = match[4];
    const res = formatExtractedSalary(cur, min, max);
    if (res) return res;
  }

  // 2. Explicit currency symbol with 2-number range (e.g. $150,000 - $190,000 or $140k - $180k)
  const explicitRangeRegex = /([$£€₹]|(?:CA|AU|C|A)\$)\s*(\d{2,3}(?:,\d{3})*|\d{2,3}k)\s*(?:-|to|–|—)\s*(?:[$£€₹]|(?:CA|AU|C|A)\$)?\s*(\d{2,3}(?:,\d{3})*|\d{2,3}k)/i;
  match = clean.match(explicitRangeRegex);
  if (match) {
    const cur = match[1] || '$';
    const min = match[2];
    const max = match[3];
    const res = formatExtractedSalary(cur, min, max);
    if (res) return res;
  }

  // 3. Hourly contract rates (e.g. $75 - $110 / hr)
  const hourlyRegex = /([$£€₹])\s*(\d{2,3})\s*(?:-|to|–|—)\s*(?:[$£€₹])?\s*(\d{2,3})\s*(?:\/|\s*per\s*)(?:hour|hr)/i;
  match = clean.match(hourlyRegex);
  if (match) {
    const minH = parseInt(match[2], 10);
    const maxH = parseInt(match[3], 10);
    if (minH >= 25 && maxH <= 350) {
      const minAnnual = Math.round((minH * 2080) / 1000);
      const maxAnnual = Math.round((maxH * 2080) / 1000);
      return `$${minAnnual}k - $${maxAnnual}k`;
    }
  }

  return null;
}

function formatExtractedSalary(currency, minStr, maxStr) {
  let minNum = parseFloat(String(minStr).replace(/,/g, '').replace(/k/i, ''));
  if (/k$/i.test(minStr) || minNum < 1000) minNum *= 1000;

  let maxNum = parseFloat(String(maxStr).replace(/,/g, '').replace(/k/i, ''));
  if (/k$/i.test(maxStr) || maxNum < 1000) maxNum *= 1000;

  // Sanity check: valid salary range ($30k - $950k)
  if (isNaN(minNum) || isNaN(maxNum) || minNum < 30000 || maxNum > 950000 || minNum > maxNum) {
    return null;
  }

  const curSymbol = currency || '$';
  const minK = Math.round(minNum / 1000);
  const maxK = Math.round(maxNum / 1000);

  return `${curSymbol}${minK}k - ${curSymbol}${maxK}k`;
}

function parseSalaryCeiling(salaryStr) {
  if (!salaryStr || typeof salaryStr !== 'string') return 0;
  const clean = salaryStr.replace(/,/g, '');
  const matches = clean.match(/(\d+)(?:k|000)?/gi);
  if (!matches || matches.length === 0) return 0;
  let max = 0;
  for (const m of matches) {
    let num = parseInt(m, 10);
    if (num < 1000) num *= 1000;
    if (num > max) max = num;
  }
  return max;
}

module.exports = {
  extractSalaryFromText,
  formatExtractedSalary,
  parseSalaryCeiling
};
