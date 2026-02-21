/**
 * GPS Verification Utilities
 * - Haversine distance calculation
 * - Geofence containment check
 * - Fake GPS heuristic detection
 */

const EARTH_RADIUS_M = 6371000; // metres

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @returns distance in metres
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Check if a coordinate is inside a circular geofence
 */
function isInsideGeofence(lat, lng, geofence) {
  const distance = haversineDistance(lat, lng, geofence.lat, geofence.lng);
  return {
    inside: distance <= geofence.radius,
    distance: Math.round(distance),
  };
}

/**
 * Heuristic fake GPS detection
 *
 * Signals used:
 * 1. GPS accuracy too perfect (< 5m)  → suspicious
 * 2. Impossible speed between last two records (> 150 km/h)
 * 3. Altitude = 0 exactly (mock providers often return 0)
 * 4. Provider is 'network' while claiming high accuracy
 */
function detectFakeGps({ accuracy, altitude, provider, lastRecord, currentLat, currentLng, currentTimestamp }) {
  const signals = [];

  // Signal 1: Unrealistically high accuracy
  if (accuracy !== null && accuracy < 5) {
    signals.push('accuracy_too_perfect');
  }

  // Signal 2: Speed check against last record
  if (lastRecord) {
    const distanceM = haversineDistance(
      lastRecord.lat, lastRecord.lng,
      currentLat, currentLng
    );
    const timeDiffSeconds = (new Date(currentTimestamp) - new Date(lastRecord.timestamp)) / 1000;
    if (timeDiffSeconds > 0) {
      const speedKmh = (distanceM / timeDiffSeconds) * 3.6;
      if (speedKmh > 150) {
        signals.push('impossible_speed');
      }
    }
  }

  // Signal 3: Altitude suspiciously zero
  if (altitude !== null && altitude === 0) {
    signals.push('altitude_zero');
  }

  // Signal 4: Network provider with high accuracy claim
  if (provider === 'network' && accuracy !== null && accuracy < 15) {
    signals.push('network_high_accuracy_mismatch');
  }

  const isFake = signals.length >= 2;
  return { isFake, signals, riskScore: signals.length };
}

module.exports = { haversineDistance, isInsideGeofence, detectFakeGps };
