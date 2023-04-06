
console.log('Content script loaded.');



// Waits for the main content section to load before scrapping
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Message received:', request);

  if (request.action === 'scrapeLinkedInProfile') {
    console.log('Getting content...');
    
    waitForElement('main.scaffold-layout__main', () => {
      scrapeProfile(sendResponse);
    });
  }

  return true; // Keep the message channel open for asynchronous responses
});

function waitForElement(selector, callback) {
  const element = document.querySelector(selector);
  if (element) {
    callback();
  } else {
    const observer = new MutationObserver((mutations, observer) => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}


// Alternative, arbitrary delay, not as efficient nor great, better to use MutationObserver API
/**chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Message received:', request);

  if (request.action === 'scrapeLinkedInProfile') {
    console.log('Getting content...');
    
    setTimeout(() => {
      scrapeProfile(sendResponse);
    }, 2000); // 2-second delay
  }

  return true; // Keep the message channel open for asynchronous responses
});**/


// Implement the logic for scraping LinkedIn data
function scrapeProfile(sendResponse) {
  try {

      const fullName = document.querySelector('main.scaffold-layout__main .pv-text-details__left-panel h1').textContent;
      const tagLine = document.querySelector('main.scaffold-layout__main .pv-text-details__left-panel .text-body-medium.break-words').textContent;
      const contactLocation = document.querySelector('main.scaffold-layout__main .pv-text-details__left-panel span.text-body-small.inline.t-black--light.break-words').textContent;
      
      // Find the About section by searching for the element with the ID "about" and then finding the closest section element
      const aboutElement = document.getElementById('about');
      let contactAbout = '';

      if (aboutElement) {
        const aboutSection = aboutElement.closest('section');
        const container = aboutSection.querySelector('.pv-shared-text-with-see-more .inline-show-more-text');
        const spans = container.querySelectorAll('span');
        contactAbout = spans[0].textContent;
      }


      // Find the Experience section
      const experienceSection = document.querySelector('#experience').parentElement;

      // Extract Experience section positions
      const experienceList = experienceSection.querySelectorAll('.pvs-list__item--line-separated');

      const positions = [];

      experienceList.forEach(item => {
        const positionElement = item.querySelector('.mr1.t-bold span[aria-hidden="true"]');
        const companyElement = item.querySelector('.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]');
        const durationElement = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        const locationElement = item.querySelector('.t-14.t-normal.t-black--light:nth-child(4) span[aria-hidden="true"]');

        const position = positionElement ? positionElement.textContent : '';
        const company = companyElement ? companyElement.textContent : '';
        const duration = durationElement ? durationElement.textContent : '';
        const location = locationElement ? locationElement.textContent : '';

        positions.push({
          position: position,
          company: company,
          duration: duration,
          location: location
        });

      });

      console.log('Sending response:', { fullName, tagLine });
      sendResponse({ fullName, tagLine, contactLocation, contactAbout, positions });

    } catch (error) {
      console.error('Error while sending response:', error);
    }
}