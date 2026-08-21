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

module.exports = { calculateDistanceMiles, classifyWorkType };
