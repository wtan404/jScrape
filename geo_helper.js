// Geocoding & Distance Engine for Workplace Types & Zip Codes

// Haversine formula to calculate distance in miles between two (lat, lon) points
function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Classify Work Type into 'Remote', 'Hybrid', or 'Onsite'
function classifyWorkType(locationStr = '', titleStr = '') {
  const text = (locationStr + ' ' + titleStr).toLowerCase();
  
  if (text.includes('hybrid')) {
    return 'Hybrid';
  }
  if (text.includes('remote') || text.includes('telecommute') || text.includes('work from home') || text.includes('anywhere')) {
    return 'Remote';
  }
  return 'Onsite';
}

// Detect if a Remote or Hybrid role is restricted to a specific group/subset of states
// If so, normalize location to 'limited, US' with subtitle remaining Remote or Hybrid
function detectLocationAndWorkType(locationStr = '', titleStr = '', jdText = '') {
  let workType = classifyWorkType(locationStr, titleStr);
  const combined = `${locationStr} ${titleStr} ${jdText}`.toLowerCase();

  // If JD specifically notes hybrid or remote while location was ambiguous
  if (workType === 'Onsite') {
    if (combined.includes('hybrid')) workType = 'Hybrid';
    else if (combined.includes('remote') || combined.includes('telecommute') || combined.includes('work from home')) workType = 'Remote';
  }

  // If role is Onsite, return as-is
  if (workType === 'Onsite') {
    return { location: locationStr || 'Onsite', workType };
  }

  // Check for specific group of states restriction
  const isLimitedStateGroup =
    // Phrases indicating specific / eligible / select states
    /(?:eligible|participating|specific|select|selected|approved|certain|limited)\s+(?:us\s+)?states/i.test(combined) ||
    /(?:remote|telecommute|wfh)[\s\S]{0,100}(?:only\s+in|restricted\s+to|limited\s+to|eligible\s+states|following\s+states|selected\s+states|certain\s+states|specific\s+states|only\s+to\s+candidates\s+in)/i.test(combined) ||
    /(?:must\s+(?:reside|live|be\s+located)|open\s+to\s+(?:residents\s+of|candidates\s+in)|hiring\s+(?:only\s+)?in)[\s\S]{0,120}(?:following\s+states|these\s+states|selected\s+states|select\s+states|\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s*,\s*[A-Z]{2})+\b)/i.test(combined) ||
    // Location string includes list of states alongside remote / hybrid
    /(?:remote|hybrid)\s*[-–—:]\s*(?:[A-Za-z\s]+,\s*){1,10}[A-Za-z\s]+/i.test(locationStr) && /(?:california|texas|new york|washington|florida|colorado|illinois|\b(?:ca|ny|tx|wa|fl|il|ma|co|nc|ga|va|mi|oh|pa|nj|az)\b)/i.test(locationStr) ||
    /(?:remote|hybrid)\s*\((?:[A-Z]{2}[,\s/]+){1,15}[A-Z]{2}\)/i.test(locationStr) ||
    /\((?:[A-Z]{2}[,\s/]+){1,15}[A-Z]{2}\)\s*(?:remote|hybrid)/i.test(locationStr) ||
    /(?:,\s*us-[a-z\s]+){2,}/i.test(locationStr) || // e.g. US-Remote, US-San Francisco, US-Texas
    /(?:remote|hybrid)[\s\S]{0,30}(?:select|specific|certain|limited)\s+states/i.test(locationStr);

  const finalLocation = isLimitedStateGroup ? 'limited, US' : (locationStr || 'Remote');

  return {
    location: finalLocation,
    workType
  };
}

module.exports = { calculateDistanceMiles, classifyWorkType, detectLocationAndWorkType };
