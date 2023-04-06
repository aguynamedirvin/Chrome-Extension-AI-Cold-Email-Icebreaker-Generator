// Handle OAuth2 token retrieval
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ 'interactive': true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// Save settings event listener
document.getElementById('save-settings').addEventListener('click', () => {
  const openaiApiKey = document.getElementById('openai-api-key').value;
  const spreadsheetId = document.getElementById('spreadsheet-id').value;
  const linkedinURLColumn = document.getElementById('linkedin-profile-url-column').value;
  const icebreakerColumn = document.getElementById('icebreaker-column').value;
  const reviewCountColumn = document.getElementById('review-count-column').value;
  const reviewRatingColumn = document.getElementById('rating-column').value;

  if (!openaiApiKey || !spreadsheetId) {
    alert('Please fill in all the required fields.');
    return;
  }

  // Store the API keys and spreadsheetId for future use
  chrome.storage.local.set({
    openaiApiKey,
    spreadsheetId,
    linkedinURLColumn,
    icebreakerColumn,
    reviewCountColumn,
    reviewRatingColumn
  });

  alert('Settings saved.');
});


function columnNameToIndex(columnName) {
  let columnIndex = 0;
  for (let i = 0; i < columnName.length; i++) {
    columnIndex = columnIndex * 26 + columnName.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
  }
  console.log('Column name:', columnName, 'Column index:', columnIndex - 1);
  return columnIndex - 1;
}



// Main event listener for generating icebreakers
document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('generate-icebreakers').addEventListener('click', async () => {
    console.log('Generate Icebreakers button clicked');

    try {
      const { openaiApiKey, spreadsheetId, linkedinURLColumn, icebreakerColumn, reviewCountColumn, reviewRatingColumn } = await getStoredSettings();

      // Authenticate with Google using the chrome identity API
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          alert(chrome.runtime.lastError.message);
          return;
        }
      
        const sheetData = await fetchSheetData(token, spreadsheetId);
        console.log('Fetched sheet data:', sheetData);


        console.log('linkedinURLColumn:', linkedinURLColumn);
        console.log('icebreakerColumn:', icebreakerColumn);

        // Get the column indexes
        const linkedinURLColumnIndex = columnNameToIndex(linkedinURLColumn);
        const icebreakerColumnIndex = columnNameToIndex(icebreakerColumn);
        const reviewCountColumnIndex = columnNameToIndex(reviewCountColumn);
        const reviewRatingColumnIndex = columnNameToIndex(reviewRatingColumn);

        const leads = parseSheetData(sheetData, linkedinURLColumnIndex, reviewCountColumnIndex, reviewRatingColumnIndex);
        console.log('Parsed leads:', leads);

        for (const lead of leads) {
          console.log('Processing lead...');

          try {
            console.log('Processing lead with LinkedIn URL:', lead.linkedInUrl);
            const { profileData, createdTab } = await createTab(lead.linkedInUrl);

            if (!profileData || !profileData.fullName) {
              console.log('Profile data not found, skipping...');
              chrome.tabs.remove(createdTab.id);
              continue;
            }

            console.log('Profile data:', profileData);

            // Extract relevant data from the page content and generate the icebreaker here.
            console.log('Sending to OpenAI...');
            const icebreaker = await generateIcebreaker(openaiApiKey, profileData, lead.reviewCount, lead.reviewRating);

            // Update the Google Sheet with the generated icebreaker
            await updateSheetData(token, spreadsheetId, lead.row, icebreaker, icebreakerColumn);

            // Close the tab
            console.log('Closing tab with ID:', createdTab.id);
            chrome.tabs.remove(createdTab.id);
          } catch (error) {
            console.error('Error processing lead:', error);
          }
        }


        alert('Successfully generated icebreakers!');
      });
    } catch (error) {
      alert(error);
      status.textContent = 'An error occurred. Please check the console for details.';
    }
  });
});



// Format the positions for the OpenAI prompt
function formatPositions(positions) {
  return positions.map((position, index) => {
    let positionStr = `Position ${index + 1}:\n`;

    if (position.position) {
      positionStr += `Title: ${position.position}\n`;
    }
    if (position.company) {
      positionStr += `Company: ${position.company}\n`;
    }
    if (position.duration) {
      positionStr += `Duration: ${position.duration}\n`;
    }
    if (position.location) {
      positionStr += `Location: ${position.location}\n`;
    }
    positionStr += '\n';

    return positionStr;
  }).join('');
}


// Clean and format response from OpenAI
function extractIcebreaker(text) {
  const regex = /(?:Icebreaker:\s*)?"([^"]+)"?/i;
  const match = text.match(regex);
  
  if (match && match[1]) {
    return match[1];
  } else {
    return text;
  }
}

// Generate icebreaker using the OpenAI API
async function generateIcebreaker(openaiApiKey, profileData, reviewCount, reviewRating) {
  const formattedPositions = formatPositions(profileData.positions);

  let reviewCountLine = '';
  let reviewRatingLine = '';

  if (reviewCount => 100) {
    reviewCountLine = `Google My Business Review Count: ${reviewCount}`;
  }

  if (reviewRating >= 4.7) {
    reviewRatingLine = `Google My Bussiness Review Rating: ${reviewRating}`;
  }

const prompt = `Generate one personalized icebreaker based on the LinkedIn profile of ${profileData.fullName}.
Don't ask questions. The lines should be no longer than a sentence and no longer than 90 characters max. Don't mention their name in the icebreaker. 
If you mention the company name, write it without LLC or Inc. in it.

Examples of good icebreakers:
1. "Congratulations on running Active Plumbing and Air for over 25 years. I was impressed with the amount of positive reviews you have!"
2. "Congrats on successfully running Active Plumbing and Air for over 25 years!"
3. "Kudos on 50 years in business and that eye-catching logo! 🎉"
4. "Impressive that you have been in the plumbing industry for 3 generations - that's quite the legacy!"

LinkedIn Profile:
${profileData.fullName.trim()}
${profileData.tagLine.trim()}
${profileData.contactLocation.trim()}

${profileData.contactAbout.trim()}

${formattedPositions}


${reviewCountLine}
${reviewRatingLine}`;

  console.log(prompt);

  const response = await fetch('https://api.openai.com/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt,
      temperature: 0.5,
      max_tokens: 600,
      n: 1,
      model: "text-davinci-003",
      stop: null
    }),
  });


  const data = await response.json();
  const icebreaker = extractIcebreaker(data.choices[0].text.trim());

  return icebreaker;
}



// Get stored settings from the local storage
async function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openaiApiKey', 'spreadsheetId', 'linkedinURLColumn', 'icebreakerColumn', 'reviewCountColumn', 'reviewRatingColumn'], (result) => {
      resolve(result);
    });
  });
}

// Load settings on script execution
async function loadSettings() {
  const { openaiApiKey, spreadsheetId, linkedinURLColumn, icebreakerColumn, reviewCountColumn, reviewRatingColumn } = await getStoredSettings();

  if (openaiApiKey) {
    document.getElementById('openai-api-key').value = openaiApiKey;
  }

  if (spreadsheetId) {
    document.getElementById('spreadsheet-id').value = spreadsheetId;
  }

  if (linkedinURLColumn) {
    document.getElementById('linkedin-profile-url-column').value = linkedinURLColumn;
  }

  if (icebreakerColumn) {
    document.getElementById('icebreaker-column').value = icebreakerColumn;
  }

  if (reviewCountColumn) {
    document.getElementById('review-count-column').value = reviewCountColumn;
  }

  if (reviewRatingColumn) {
    document.getElementById('rating-column').value = reviewRatingColumn;
  }
}

loadSettings();