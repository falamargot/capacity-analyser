import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET_FILE = path.join(__dirname, '../public/celestrak.txt');

// Function to filter TLE data for EUTELSAT and ONEWEB satellites
function filterTLEs(content) {
  const lines = content.split('\n');
  const filteredLines = [];
  
  for (let i = 0; i < lines.length; i += 3) {
    const nameLine = lines[i]?.trim();
    const line1 = lines[i + 1]?.trim();
    const line2 = lines[i + 2]?.trim();
    
    // Check if we have a complete TLE set and if it's a EUTELSAT or ONEWEB satellite
    if (nameLine && line1 && line2 && 
        (nameLine.toUpperCase().includes('EUTELSAT') || 
         nameLine.toUpperCase().includes('ONEWEB'))) {
      filteredLines.push(nameLine, line1, line2);
    }
  }
  
  return filteredLines.join('\n');
}

// Main function to fetch and process the TLE data
async function updateTLE() {
  try {
    console.log('Fetching latest TLE data from Celestrak...');
    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.text();
    console.log(`Fetched ${data.length} bytes of TLE data`);
    
    // Filter the data
    const filteredData = filterTLEs(data);
    
    // Write to file
    fs.writeFileSync(TARGET_FILE, filteredData);
    console.log(`Successfully wrote filtered TLE data to ${TARGET_FILE}`);
    console.log(`Filtered data contains ${filteredData.split('\n').length / 3} satellites`);
    
  } catch (error) {
    console.error('Error updating TLE data:', error);
    process.exit(1);
  }
}

// Run the update
updateTLE();
