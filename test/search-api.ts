// Test script for the search API endpoint
async function testSearchAPI() {
  const baseUrl = 'http://localhost:8787'; // Update this with your actual server URL

  // Test 1: Search by query
  console.log('\nTest 1: Search by query');
  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'project' })
    });
    console.log('Status:', response.status);
    const html = await response.text();
    console.log('Response is HTML:', html.includes('<html>') && html.includes('</html>'));
    console.log('Has search results header:', html.includes('<h1>Search Results</h1>'));
    console.log('Has styling:', html.includes('<style>'));
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 2: Search by speaker
  console.log('\nTest 2: Search by speaker');
  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakers: ['John'] })
    });
    console.log('Status:', response.status);
    const html = await response.text();
    console.log('Response is HTML:', html.includes('<html>') && html.includes('</html>'));
    console.log('Has search results header:', html.includes('<h1>Search Results</h1>'));
    console.log('Has styling:', html.includes('<style>'));
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 3: Search with default date range (24 hours)
  console.log('\nTest 3: Search with default date range');
  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' })
    });
    console.log('Status:', response.status);
    const html = await response.text();
    console.log('Response is HTML:', html.includes('<html>') && html.includes('</html>'));
    console.log('Has search results header:', html.includes('<h1>Search Results</h1>'));
    console.log('Has styling:', html.includes('<style>'));
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 4: Combined search
  console.log('\nTest 4: Combined search');
  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'project',
        speakers: ['John'],
        startDate: '2024-03-20T00:00:00Z',
        endDate: '2024-03-21T00:00:00Z'
      })
    });
    console.log('Status:', response.status);
    const html = await response.text();
    console.log('Response is HTML:', html.includes('<html>') && html.includes('</html>'));
    console.log('Has search results header:', html.includes('<h1>Search Results</h1>'));
    console.log('Has styling:', html.includes('<style>'));
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 5: Invalid method (GET)
  console.log('\nTest 5: Invalid method (GET)');
  try {
    const response = await fetch(`${baseUrl}/search`);
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text);
    console.log('Has correct error message:', text === 'Method not allowed');
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 6: Empty search results
  console.log('\nTest 6: Empty search results');
  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'nonexistent_term_that_wont_match' })
    });
    console.log('Status:', response.status);
    const html = await response.text();
    console.log('Response is HTML:', html.includes('<html>') && html.includes('</html>'));
    console.log('Has search results header:', html.includes('<h1>Search Results</h1>'));
    console.log('Has styling:', html.includes('<style>'));
    console.log('Has empty results:', !html.includes('<div class="result">'));
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the tests
testSearchAPI().catch(console.error);

 