// Create a tab and inject the content script
function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (createdTab) => {
      console.log('Opening url...');
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (info.status === 'complete' && tabId === createdTab.id) {
          chrome.tabs.onUpdated.removeListener(listener);

          console.log('Injecting script...');
          // Inject the content script
          chrome.scripting.executeScript(
            {
              target: { tabId: createdTab.id },
              files: ['content.js'],
            },
            (injectionResults) => {
              // Check if there was an error injecting the script
              if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
              }
              console.log('Script injected:', injectionResults);

              // Send the message to the content script
              chrome.tabs.sendMessage(tabId, { action: 'scrapeLinkedInProfile' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error(chrome.runtime.lastError);
                  reject(chrome.runtime.lastError);
                  return;
                }

                console.log('Full name:', response.fullName);
                console.log('Tag line:', response.tagLine);
                console.log('Location:', response.contactLocation);
                console.log('About:', response.contactAbout);
                console.log('Positions:', response.positions);

                resolve({ profileData: response, createdTab });
              });
            }
          );
        }
      });
    });
  });
}



// Fetch sheet data from the Google Sheets API
async function fetchSheetData(authToken, spreadsheetId) {
  const sheetName = 'Sheet1';
  const range = 'A:Z';

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${range}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
  });
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data;
}


// Parse sheet data to extract the LinkedIn URLs
function parseSheetData(sheetData, linkedinURLColumnIndex, reviewCountColumnIndex, reviewRatingColumnIndex) {
  const leads = [];

  if (Array.isArray(sheetData.values)) {
    // Start from index 1 to skip the column headers
    for (let index = 1; index < sheetData.values.length; index++) {
      const row = sheetData.values[index];
      const linkedInUrl = row[linkedinURLColumnIndex];

      const reviewCount = row[reviewCountColumnIndex] || '';
      const reviewRating = row[reviewRatingColumnIndex] || '';

      console.log('Row:', row);
      console.log('LinkedIn URL:', linkedInUrl);
      console.log('Review Count:', reviewCount);
      console.log('Review Rating:', reviewRating);

      leads.push({
        row: index + 2,
        linkedInUrl,
        reviewCount,
        reviewRating
      });
    }
  } else {
    throw new Error('Invalid sheet data');
  }

  return leads;
}


// Update the Google Sheet with the generated icebreaker
async function updateSheetData(authToken, spreadsheetId, rowIndex, icebreaker, icebreakerColumn) {
  const sheetName = 'Sheet1';
  const adjustedRowIndex = rowIndex - 1; // Subtract 1 from rowIndex
  const cellRange = `${sheetName}!${icebreakerColumn}${adjustedRowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${cellRange}?valueInputOption=RAW`;

  const body = {
    range: cellRange,
    values: [[icebreaker]],
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data;
}

