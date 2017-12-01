/* global handleEvent tryJSONparse getStylesSafe BG */
'use strict';

// TODO on Install: Promise.all([fetchJSON, fetchHTML]) -> popup if customization is present, install otheriwse.

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Exposed methods representing the search results on userstyles.org
 */
function SearchUserstyles() {
  const RESULTS_PER_PAGE = 20;
  let totalPages, totalResults;
  let currentPage = 1;

  return {getCurrentPage, getTotalPages, getTotalResults, search, fetchStyleJson};

  function getCurrentPage() {
    return currentPage;
  }

  function getTotalPages() {
    return totalPages;
  }

  function getTotalResults() {
    return totalResults;
  }

  /**
   * Fetches the JSON style object from userstyles.org (containing code, sections, updateUrl, etc).
   * This is fetched from the /styles/chrome/ID.json endpoint.
   * @param {number} userstylesId The internal "ID" for a style on userstyles.org
   * @returns {Object} The response as a JSON object.
   */
  function fetchStyleJson(userstylesId) {
    return new Promise((resolve, reject) => {
      let jsonUrl = 'https://userstyles.org/styles/chrome/' + userstylesId + '.json';
      download(jsonUrl)
        .then(responseText => {
          resolve(tryJSONparse(responseText));
        })
        .catch(reject);
    });
  }

  /**
   * Fetches (and JSON-parses) search results from a userstyles.org search API.
   * Automatically sets currentPage, totalPages, and totalResults.
   * @param {string} searchText Text to search for.
   * @return {Object} Response object from userstyles.org
   */
  function search(searchText) {
    return new Promise((resolve, reject) => {
      const TIMEOUT = 10000;
      const headers = {
        'Content-type': 'application/json',
        'Accept': '*/*'
      };

      const searchUrl = new URL('https://userstyles.org/api/v1/styles/search');
      let queryParams = 'search=' + encodeURIComponent(searchText);
      queryParams += '&page=' + currentPage;
      queryParams += '&per_page=' + RESULTS_PER_PAGE;
      searchUrl.search = '?' + queryParams;
      const xhr = new XMLHttpRequest();
      xhr.timeout = TIMEOUT;
      xhr.onload = () => {
        if (xhr.status === 200) {
          const responseJson = tryJSONparse(xhr.responseText);
          currentPage = responseJson.current_page + 1;
          totalPages = responseJson.total_pages;
          totalResults = responseJson.total_entries;
          resolve(responseJson);
        } else {
          reject(xhr.status);
        }
      };
      xhr.onerror = reject;
      xhr.open('GET', searchUrl, true);
      for (const key of Object.keys(headers)) {
        xhr.setRequestHeader(key, headers[key]);
      }
      xhr.send();
    });
  }
}

/**
 * Represents the search results within the Stylus popup.
 * @returns {Object} Includes load(), next(), and prev() methods to alter the search results.
 */
const SearchResults = (() => {
  const RESULTS_PER_PAGE = 3; // Number of results to display in popup.html
  const DELAY_BETWEEN_RESULTS_MS = 500;
  const searchAPI = SearchUserstyles();
  const unprocessedResults = []; // Search results not yet processed.
  const processedResults = []; // Search results that are not installed and apply ot the page (includes 'json' field with full style).
  let tabURL; // The active tab's URL.
  let currentPage = 1; // Current page number in popup.html
  let nonApplicableResults = 0; // Number of results that don't apply to the searched site (thx userstyles.org!)
  let alreadyInstalledResults = 0; // Number of results that are already installed.

  return {load, next, prev};

  function render() {
    // Clear search results
    $('#searchResults-list').innerHTML = '';

    // Show search results for current page
    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
    const endIndex = currentPage * RESULTS_PER_PAGE;
    const resultSubset = processedResults.slice(startIndex, endIndex);
    console.log('Render processedResults[' + startIndex + ':' + endIndex + '] = ', resultSubset);
    resultSubset.forEach(index => {
      createSearchResult(index);
    });
    if (resultSubset.length < RESULTS_PER_PAGE) {
      // TODO: Show "Results are still loading" message.
    } else {
      // TODO: Hide "results are still loading" message.
    }
  }

  function loadMoreIfNeeded() {
    if (processedResults.length < (currentPage + 1) * RESULTS_PER_PAGE) {
      console.log('loadMoreIfNeeded: YES. currentPage:' + currentPage, 'processedResults.length:' + processedResults.length);
      setTimeout(load, 1000);
    } else {
      console.log('loadMoreIfNeeded: NO. currentPage:' + currentPage, 'processedResults.length:' + processedResults.length);
    }
  }

  /** Increments currentPage and loads results. */
  function next(event) {
    if (event) {
      event.preventDefault();
    }
    currentPage += 1;
    render();
    loadMoreIfNeeded();
  }

  /** Decrements currentPage and loads results. */
  function prev(event) {
    if (event) {
      event.preventDefault();
    }
    currentPage = Math.max(1, currentPage - 1);
    render();
  }

  /**
   * Display error message to user.
   * @param {string} message  Message to display to user.
   */
  function error(reason) {
    let message;
    if (reason === 404) {
      // TODO: i18n message
      message = 'No results found';
    } else {
      console.log('Error loading search results: ' + reason);
      message = 'Error loading search results: ' + reason;
    }
    $('#searchResults').classList.add('hidden');
    $('#searchResults-error').innerHTML = message;
    $('#searchResults-error').classList.remove('hidden');
  }

  /**
   * Loads search result for the (page number is currentPage).
   * @param {Object} event The click event
   */
  function load(event) {
    if (event) {
      event.preventDefault();
    }
    $('#load-search-results').classList.add('hidden');
    $('#searchResults').classList.remove('hidden');
    $('#searchResults-error').classList.add('hidden');

    // Find styles for the current active tab
    getActiveTab().then(tab => {
      tabURL = tab.url;
      const hostname = new URL(tabURL).hostname.replace(/^(?:.*\.)?([^.]*\.(co\.)?[^.]*)$/i, '$1');
      $('#searchResults-terms').textContent = hostname;

      console.log('load#searchAPI.search(' + hostname + ')');
      searchAPI.search(hostname)
        .then(searchResults => {
          if (searchResults.data.length === 0) {
            throw 404;
          }
          unprocessedResults.push.apply(unprocessedResults, searchResults.data);
          processNextResult();
        })
        .catch(error);
    });
    return true;
  }

  function processNextResult() {
    if (unprocessedResults.length === 0) {
      console.log('processNextResult:unprocessedResults === 0');
      loadMoreIfNeeded();
      return;
    }

    // Process the next result in the queue.
    const nextResult = unprocessedResults.shift();
    const matchingStyles = getMatchingInstalledStyles(nextResult);
    if (matchingStyles.length > 0) {
      // Style already installed, skip it.
      // TODO: Include the style anyway with option to "Uninstall" (?)
      console.log('style "' + nextResult.name + '" already installed');
      alreadyInstalledResults += 1;
      setTimeout(processNextResult, 0); // Keep processing
    } else if (nextResult.category !== 'site') {
      // Style is not for a website, skip it.
      console.log('style "' + nextResult.name + '" category is for "' + nextResult.category + '", not "site"');
      nonApplicableResults += 1;
      setTimeout(processNextResult, 0); // Keep processing
    } else {
      // Style not installed, fetch full style to see if it applies to this site.
      searchAPI.fetchStyleJson(nextResult.id)
        .then(userstyleJson => {
          // Extract applicable sections (i.e. styles that apply to the current site)
          const applicableSections = BG.getApplicableSections({
            style: userstyleJson,
            matchUrl: tabURL,
            stopOnFirst: true
          });
          if (applicableSections.length === 0) {
            // Style is invalid (does not apply to this site).
            nonApplicableResults += 1;
          } else {
            // Style is valid (can apply to this site).
            nextResult.json = userstyleJson; // Store Style JSON for easy installing later.
            processedResults.push(nextResult);
            render();
          }
          console.log('processNextResult:sleep(' + DELAY_BETWEEN_RESULTS_MS + ')');
          setTimeout(processNextResult, DELAY_BETWEEN_RESULTS_MS); // Keep processing
        })
        .catch(reason => {
          console.log('Error while loading style ID ' + nextResult.id + ': ' + reason);
          alert('Error while loading style ID ' + nextResult.id + ': ' + reason);
          console.log('processNextResult:sleep(' + DELAY_BETWEEN_RESULTS_MS + ')');
          setTimeout(processNextResult, DELAY_BETWEEN_RESULTS_MS); // Keep processing
        });
    }
    console.log('processNextResult:alreadyInstalled:' + alreadyInstalledResults,
      'nonApplicable:' + nonApplicableResults);
  }

  /** Updates prev/next buttons and currentPage/totalPage labels. */
  function updateSearchResultsNav(currentPage, totalPages) {
    // Update 'next' button
    if (currentPage >= totalPages) {
      currentPage = totalPages;
      $('#searchResultsNav-next').setAttribute('disabled', 'disabled');
    } else {
      $('#searchResultsNav-next').removeAttribute('disabled');
    }

    // Update 'prev' button
    if (currentPage <= 1) {
      currentPage = 1;
      $('#searchResultsNav-prev').setAttribute('disabled', 'disabled');
    } else {
      $('#searchResultsNav-prev').removeAttribute('disabled');
    }

    // Update current/total counts
    $('#searchResultsNav-currentPage').textContent = currentPage;
    $('#searchResultsNav-totalPages').textContent = totalPages;
  }
  /**
   * Promises a list of installed styles that match the provided search result.
   * @param {Object} userstyleSearchResult Search result object from userstyles.org
   */
  function getMatchingInstalledStyles(userstyleSearchResult) {
    return new Promise(function (resolve, reject) {
      getStylesSafe()
        .then(installedStyles => {
          const matchingStyles = installedStyles.filter(installedStyle => {
            // Compare installed name to search result name.
            let isMatch = installedStyle.name === userstyleSearchResult.name;
            // Also compare if search result ID (userstyles ID) is mentioned in the installed updateUrl.
            if (installedStyle.updateUrl) {
              isMatch &= installedStyle.updateUrl.indexOf('/' + userstyleSearchResult.id + '.json') >= 0;
            }
            return isMatch;
          });
          resolve(matchingStyles);
        })
        .catch(reject);
    });
  }

  /**
   * Constructs and adds the given search result to the popup's Search Results container.
   * @param {Object} userstyleSearchResult The SearchResult object from userstyles.org
   */
  function createSearchResult(userstyleSearchResult) {
    /*
      userstyleSearchResult format: {
        id: 100835,
        name: "Reddit Flat Dark",
        screenshot_url: "19339_after.png",
        description: "...",
        user: {
          id: 48470,
          name: "holloh"
        }
      }
    */

    const entry = template.searchResult.cloneNode(true);
    Object.assign(entry, {
      id: 'searchResult-' + userstyleSearchResult.id
    });
    $('#searchResults-list').appendChild(entry);

    const searchResultName = userstyleSearchResult.name;
    const title = $('.searchResult-title', entry);
    Object.assign(title, {
      textContent: searchResultName,
      title: searchResultName,
      href: 'https://userstyles.org' + userstyleSearchResult.url,
      onclick: handleEvent.openURLandHide
    });

    const screenshot = $('.searchResult-screenshot', entry);
    let screenshotUrl = userstyleSearchResult.screenshot_url;
    if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
      screenshotUrl = 'https://userstyles.org/style_screenshot_thumbnails/' + screenshotUrl;
    }
    Object.assign(screenshot, {
      src: screenshotUrl,
      title: searchResultName
    });

    // TODO: Expand/collapse description
    const description = $('.searchResult-description', entry);
    Object.assign(description, {
      textContent: userstyleSearchResult.description.replace(/<.*?>/g, ''),
      title: userstyleSearchResult.description.replace(/<.*?>/g, '')
    });

    const authorLink = $('.searchResult-authorLink', entry);
    Object.assign(authorLink, {
      textContent: userstyleSearchResult.user.name,
      title: userstyleSearchResult.user.name,
      href: 'https://userstyles.org/users/' + userstyleSearchResult.user.id,
      onclick: handleEvent.openURLandHide
    });

    // TODO: Total & Weekly Install Counts
    // TODO: Rating

    const installButton = $('.searchResult-install', entry);
    installButton.onclick = install;

    /** Installs the current userstyleSearchResult into stylus. */
    function install() {
      entry.classList.add('loading');
      // TODO: Detect if style has customizations, point to style page if so.
      const styleId = userstyleSearchResult.id;
      const url = 'https://userstyles.org/styles/chrome/' + styleId + '.json';
      download(url)
        .then(responseText => {
          saveStyleSafe(tryJSONparse(responseText))
            .then(() => {
              // Hide search result after installing
              entry.parentNode.removeChild(entry);
            });
        })
        .catch(reason => {
          console.log('Error while installing from ' + url + ': ' + reason);
          alert('Error while installing from ' + url + ': ' + reason);
        });
      return true;
    }
  }
})();

onDOMready().then(() => {
  $('#load-search-results-link').onclick = SearchResults.load;
  $('#searchResultsNav-prev').onclick = SearchResults.prev;
  $('#searchResultsNav-next').onclick = SearchResults.next;
});
