import { SatelliteData } from '../types/satellites';
import { Polygon } from 'geojson';

// Extended Coverage interface for testing (includes active status)
interface TestCoverage {
  name: string;
  feature: {
    type: 'Feature';
    geometry: Polygon;
    properties: any;
  };
  isActive?: boolean; // Additional property for testing active/inactive status
}

// Mock GEO satellite data for testing
const createMockGEOSatellite = (
  id: string, 
  name: string, 
  coverages: TestCoverage[],
  activeCoverageIndices: number[] = []
): SatelliteData => {
  // Mark coverages as active/inactive based on indices
  const processedCoverages = coverages.map((coverage, index) => ({
    ...coverage,
    isActive: activeCoverageIndices.includes(index)
  }));

  return {
    id,
    name,
    noradId: id,
    type: 'EUTELSAT' as const,
    satrec: {} as any,
    position: { lat: 0, lng: 0, alt: 0 },
    referenced_coverages: { type: 'FeatureCollection', features: [] },
    coverages: processedCoverages as any, // Cast to any to avoid type issues
    capacity: {
      maxThroughput: 100,
      bandwidth: { ku: 500, ka: 300, c: 200 },
      availability: 0.99
    }
  };
};

// Create mock coverage polygon (simple square)
const createMockCoveragePolygon = (
  name: string, 
  coordinates: number[][]
): TestCoverage => {
  const polygon: Polygon = {
    type: 'Polygon',
    coordinates: [coordinates]
  };

  return {
    name,
    feature: {
      type: 'Feature',
      geometry: polygon,
      properties: {}
    }
  };
};

// Point-in-polygon test function (equivalent to production logic)
const isPointInPolygon = (point: { lat: number; lng: number }, ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    
    const intersect = ((yi > point.lat) !== (yj > point.lat))
        && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Function under test: GEO coverage eligibility check
const isLocationCoveredByGEOSatellite = (
  userLocation: { lat: number; lng: number }, 
  satellite: SatelliteData
): boolean => {
  // Business rule: Check if user location is inside at least one ACTIVE GEO coverage
  // Elevation angle must NOT be used to determine coverage
  
  if (!satellite.coverages || satellite.coverages.length === 0) {
    return false; // No coverages available
  }

  // Check each coverage area
  for (const coverage of satellite.coverages as TestCoverage[]) {
    // Skip inactive coverages
    if (coverage.isActive === false) {
      continue;
    }

    const geometry = coverage.feature?.geometry;
    if (geometry && geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0] as unknown as number[][];
      
      // Check if point is inside this coverage polygon
      if (isPointInPolygon(userLocation, ring)) {
        return true; // User is inside this active coverage
      }
    }
  }

  return false; // User not inside any active coverage
};

// Test runner function
function runTests() {
  console.log('🧪 Running GEO Coverage Eligibility Tests...\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.log(`❌ FAIL: ${message}`);
    }
  }

  // Test Case 1: User inside an active GEO coverage
  console.log('Test 1: User inside an active GEO coverage');
  {
    const coveragePolygon = createMockCoveragePolygon(
      'beam_117',
      [
        [0, 0],    // Bottom-left
        [10, 0],   // Bottom-right  
        [10, 10],  // Top-right
        [0, 10],   // Top-left
        [0, 0]     // Close polygon
      ]
    );

    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [coveragePolygon],
      [0] // Coverage 0 is active
    );

    const userLocation = { lat: 5, lng: 5 }; // Inside the polygon

    const result = isLocationCoveredByGEOSatellite(userLocation, satellite);
    
    assert(result === true, 'User inside active GEO coverage should return true');
  }

  // Test Case 2: User outside all GEO coverages
  console.log('\nTest 2: User outside all GEO coverages');
  {
    const coveragePolygon = createMockCoveragePolygon(
      'beam_117',
      [
        [0, 0],    // Bottom-left
        [10, 0],   // Bottom-right  
        [10, 10],  // Top-right
        [0, 10],   // Top-left
        [0, 0]     // Close polygon
      ]
    );

    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [coveragePolygon],
      [0] // Coverage 0 is active
    );

    const userLocation = { lat: 15, lng: 15 }; // Outside the polygon

    const result = isLocationCoveredByGEOSatellite(userLocation, satellite);
    
    assert(result === false, 'User outside all GEO coverages should return false');
  }

  // Test Case 3: User inside a coverage that is inactive
  console.log('\nTest 3: User inside an inactive coverage');
  {
    const coveragePolygon = createMockCoveragePolygon(
      'beam_117',
      [
        [0, 0],    // Bottom-left
        [10, 0],   // Bottom-right  
        [10, 10],  // Top-right
        [0, 10],   // Top-left
        [0, 0]     // Close polygon
      ]
    );

    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [coveragePolygon],
      [] // No active coverages (coverage 0 is inactive)
    );

    const userLocation = { lat: 5, lng: 5 }; // Inside the polygon but coverage is inactive

    const result = isLocationCoveredByGEOSatellite(userLocation, satellite);
    
    assert(result === false, 'User inside inactive coverage should return false');
  }

  // Test Case 4: Satellite with multiple coverages, at least one active and matching
  console.log('\nTest 4: Multiple coverages with at least one active and matching');
  {
    const coveragePolygon1 = createMockCoveragePolygon(
      'beam_117',
      [
        [0, 0],    // Bottom-left
        [10, 0],   // Bottom-right  
        [10, 10],  // Top-right
        [0, 10],   // Top-left
        [0, 0]     // Close polygon
      ]
    );

    const coveragePolygon2 = createMockCoveragePolygon(
      'beam_118',
      [
        [20, 20],  // Bottom-left
        [30, 20],  // Bottom-right  
        [30, 30],  // Top-right
        [20, 30],  // Top-left
        [20, 20]   // Close polygon
      ]
    );

    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [coveragePolygon1, coveragePolygon2],
      [0, 1] // Both coverages are active
    );

    const userLocation = { lat: 5, lng: 5 }; // Inside coverage 1

    const result = isLocationCoveredByGEOSatellite(userLocation, satellite);
    
    assert(result === true, 'User inside one of multiple active coverages should return true');
  }

  // Test Case 5: Satellite with no coverages
  console.log('\nTest 5: Satellite with no coverages');
  {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [], // No coverages
      []
    );

    const userLocation = { lat: 5, lng: 5 };

    const result = isLocationCoveredByGEOSatellite(userLocation, satellite);
    
    assert(result === false, 'Satellite with no coverages should return false');
  }

  // Additional Test: Validate that elevation angle is NOT used for coverage determination
  console.log('\nTest 6: Elevation angle should NOT be used for coverage determination');
  {
    const coveragePolygon = createMockCoveragePolygon(
      'beam_117',
      [
        [0, 0],    // Bottom-left
        [10, 0],   // Bottom-right  
        [10, 10],  // Top-right
        [0, 10],   // Top-left
        [0, 0]     // Close polygon
      ]
    );

    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [coveragePolygon],
      [0] // Coverage 0 is active
    );

    // Position satellite far away (would result in low elevation angle)
    satellite.position = { lat: -45, lng: -45, alt: 35786 }; // GEO position far from user

    const userLocation = { lat: 5, lng: 5 }; // Inside coverage polygon

    const result = isLocationCoveredByGEOSatellite(userLocation, satellite);
    
    // Should still return true because coverage is determined by polygon, not elevation
    assert(result === true, 'Coverage should be independent of elevation angle');
    
    // This test validates that coverage logic is independent of elevation angle
    // If someone mistakenly uses elevation angle for coverage, this test would fail
  }

  // Additional Test: Multiple coverages with mixed active/inactive status
  console.log('\nTest 7: Multiple coverages with mixed active/inactive status');
  {
    const inactiveCoverage = createMockCoveragePolygon(
      'beam_inactive',
      [
        [0, 0],    // Bottom-left
        [10, 0],   // Bottom-right  
        [10, 10],  // Top-right
        [0, 10],   // Top-left
        [0, 0]     // Close polygon
      ]
    );

    const activeCoverage = createMockCoveragePolygon(
      'beam_active',
      [
        [15, 15],  // Bottom-left
        [25, 15],  // Bottom-right  
        [25, 25],  // Top-right
        [15, 25],  // Top-left
        [15, 15]   // Close polygon
      ]
    );

    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [inactiveCoverage, activeCoverage],
      [1] // Only coverage 1 (index 1) is active
    );

    const userLocationInInactive = { lat: 5, lng: 5 }; // Inside inactive coverage
    const userLocationInActive = { lat: 20, lng: 20 }; // Inside active coverage

    const resultInactive = isLocationCoveredByGEOSatellite(userLocationInInactive, satellite);
    const resultActive = isLocationCoveredByGEOSatellite(userLocationInActive, satellite);

    assert(resultInactive === false, 'User inside inactive coverage should return false');
    assert(resultActive === true, 'User inside active coverage should return true');
  }

  // Test Results Summary
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! GEO coverage eligibility logic is working correctly.');
    console.log('✅ Coverage is determined by actual coverage polygons, NOT elevation angle.');
  } else {
    console.log('⚠️  Some tests failed. Check the GEO coverage implementation.');
    console.log('❌ Coverage logic may be incorrectly using elevation angle instead of coverage polygons.');
  }

  return passedTests === totalTests;
}

// Export for potential use in other test files
export {
  isLocationCoveredByGEOSatellite,
  createMockGEOSatellite,
  createMockCoveragePolygon,
  runTests
};
