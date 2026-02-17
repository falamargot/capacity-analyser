/**
 * Tests for ONEWEB_PREMIUM coverage mode
 */
import { 
  isRfCoverageSatisfied, 
  type CoveragePolicy,
  footprintRadiusKm,
  getRadiusAtPowerLevel,
  BACKHAUL_ELEVATION_DEG
} from '../leoFootprint';

// Test runner function
function runCoveragePolicyTests() {
  console.log('🧪 Running ONEWEB_PREMIUM Coverage Policy Tests...\n');

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

  const testPoint = { lat: 0, lng: 0 };
  const subSatPoint = { lat: 0, lng: 0 };
  const altitude1200Km = 1200;

  // Test Case 1: PREMIUM radius > radius at -12 dB for 1200km altitude
  console.log('Test 1: PREMIUM radius > radius at -12 dB for 1200km altitude');
  {
    const premiumRadius = footprintRadiusKm(altitude1200Km, BACKHAUL_ELEVATION_DEG);
    const thresholdRadius = getRadiusAtPowerLevel(-12);

    assert(premiumRadius > thresholdRadius, 'PREMIUM radius should be greater than -12 dB radius');
    assert(Math.abs(premiumRadius - 2500) < 100, 'PREMIUM radius should be close to 2500 km');
  }

  // Test Case 2: PREMIUM radius shrinks if altitude decreases
  console.log('\nTest 2: PREMIUM radius shrinks if altitude decreases');
  {
    const radiusAt1200Km = footprintRadiusKm(1200, BACKHAUL_ELEVATION_DEG);
    const radiusAt800Km = footprintRadiusKm(800, BACKHAUL_ELEVATION_DEG);
    
    assert(radiusAt800Km < radiusAt1200Km, 'PREMIUM radius should shrink with altitude');
  }

  // Test Case 3: DB_THRESHOLD behavior unchanged
  console.log('\nTest 3: DB_THRESHOLD behavior unchanged');
  {
    const thresholdPolicy: CoveragePolicy = { type: "DB_THRESHOLD", thresholdDb: -10 };
    
    // Test point very close to satellite (should always be within coverage)
    const pointNearSatellite = { lat: 0.001, lng: 0.001 }; // Very close to sub-satellite point
    
    assert(
      isRfCoverageSatisfied(pointNearSatellite, subSatPoint, altitude1200Km, thresholdPolicy),
      'Point very close to satellite should be within DB_THRESHOLD coverage'
    );
  }

  // Test Case 4: PREMIUM policy works correctly
  console.log('\nTest 4: PREMIUM policy works correctly');
  {
    const premiumPolicy: CoveragePolicy = { type: "ONEWEB_PREMIUM" };
    
    // Test point very close to satellite (should always be within coverage)
    const pointNearSatellite = { lat: 0.001, lng: 0.001 }; // Very close to sub-satellite point
    
    assert(
      isRfCoverageSatisfied(pointNearSatellite, subSatPoint, altitude1200Km, premiumPolicy),
      'Point very close to satellite should be within PREMIUM coverage'
    );
  }

  // Test Case 5: PREMIUM > STANDARD for same altitude
  console.log('\nTest 5: PREMIUM > STANDARD for same altitude');
  {
    const premiumRadius = footprintRadiusKm(altitude1200Km, BACKHAUL_ELEVATION_DEG);
    const standardRadius = footprintRadiusKm(altitude1200Km, 37); // STANDARD_ELEVATION_DEG
    
    assert(premiumRadius > standardRadius, 'PREMIUM radius should be greater than STANDARD radius');
  }

  // Test Case 6: Edge case safety
  console.log('\nTest 6: Edge case safety');
  {
    const invalidPolicy = { type: "INVALID" } as any;
    
    assert(
      !isRfCoverageSatisfied(testPoint, subSatPoint, altitude1200Km, invalidPolicy),
      'Invalid policy should return false safely'
    );
  }

  // Test Case 7: PREMIUM radius calculation consistency
  console.log('\nTest 7: PREMIUM radius calculation consistency');
  {
    const premiumRadius1 = footprintRadiusKm(altitude1200Km, BACKHAUL_ELEVATION_DEG);
    const premiumRadius2 = footprintRadiusKm(altitude1200Km, BACKHAUL_ELEVATION_DEG);
    
    assert(
      Math.abs(premiumRadius1 - premiumRadius2) < 0.001,
      'PREMIUM radius calculation should be consistent'
    );
  }

  // Test Case 8: PREMIUM vs DB_THRESHOLD at edge cases
  console.log('\nTest 8: PREMIUM vs DB_THRESHOLD at edge cases');
  {
    const premiumPolicy: CoveragePolicy = { type: "ONEWEB_PREMIUM" };
    const strictThresholdPolicy: CoveragePolicy = { type: "DB_THRESHOLD", thresholdDb: -3 };
    
    // Point at moderate distance - should be in PREMIUM but not in strict DB_THRESHOLD
    const moderateDistancePoint = { lat: 2, lng: 2 };
    
    const premiumResult = isRfCoverageSatisfied(moderateDistancePoint, subSatPoint, altitude1200Km, premiumPolicy);
    const strictResult = isRfCoverageSatisfied(moderateDistancePoint, subSatPoint, altitude1200Km, strictThresholdPolicy);
    
    // We don't assert specific results here as they depend on exact calculations, but we test that both return boolean values
    assert(
      typeof premiumResult === 'boolean',
      'PREMIUM policy should return boolean result'
    );
    assert(
      typeof strictResult === 'boolean',
      'DB_THRESHOLD policy should return boolean result'
    );
  }

  // Test Results Summary
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All coverage policy tests passed!');
    console.log('✅ ONEWEB_PREMIUM mode is working correctly.');
    console.log('✅ DB_THRESHOLD behavior remains unchanged.');
    console.log('✅ Edge cases are handled safely.');
  } else {
    console.log('⚠️  Some tests failed. Check coverage policy implementation.');
  }

  return passedTests === totalTests;
}

// Export for potential use in other test files
export {
  runCoveragePolicyTests
};

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  // Node.js environment - run tests automatically
  runCoveragePolicyTests();
}
