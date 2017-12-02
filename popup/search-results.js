/* global handleEvent tryJSONparse getStylesSafe BG */
'use strict';

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Exposed methods representing the search results on userstyles.org
 */
function SearchUserstyles() {
  let totalPages, totalResults;
  let currentPage = 1;

  return {getCurrentPage, getTotalPages, getTotalResults, getCategory, search, fetchStyleJson};

  function getCurrentPage() {
    return currentPage;
  }

  function getTotalPages() {
    return totalPages;
  }

  function getTotalResults() {
    return totalResults;
  }

  function getCategory(url) {
    const hostname = new URL(url).hostname;
    return new Promise(resolve => {
      const request = new XMLHttpRequest();
      const browseURL = 'https://userstyles.org/styles/browse/all/' + encodeURIComponent(url);
      request.open('HEAD', browseURL, true);
      request.onreadystatechange = () => {
        if (request.readyState === XMLHttpRequest.DONE) {
          const responseURL = new URL(request.responseURL);
          const category = responseURL.searchParams.get('category');
          if (category !== null) {
            resolve(category);
          } else {
            resolve(hostname);
          }
        }
      };
      request.send(null);
    });
  }

  /**
   * Fetches the JSON style object from userstyles.org (containing code, sections, updateUrl, etc).
   * This is fetched from the /styles/chrome/ID.json endpoint.
   * @param {number} userstylesId The internal "ID" for a style on userstyles.org
   * @returns {Object} The response as a JSON object.
   */
  function fetchStyleJson(userstylesId) {
    return new Promise((resolve, reject) => {
      const jsonUrl = 'https://userstyles.org/styles/chrome/' + userstylesId + '.json';
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
   * @param {string} category The usrestyles.org "category" (subcategory) OR a any search string.
   * @return {Object} Response object from userstyles.org
   */
  function search(category) {
    return new Promise((resolve, reject) => {
      if (totalPages !== undefined && currentPage > totalPages) {
        resolve({'data':[]});
      }

      const TIMEOUT = 10000;
      const headers = {
        'Content-type': 'application/json',
        'Accept': '*/*'
      };

      const searchUrl = new URL('https://userstyles.org/api/v1/styles/subcategory');
      let queryParams = 'search=' + encodeURIComponent(category);
      queryParams += '&page=' + currentPage;
      queryParams += '&country=NA';
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
  const DISPLAYED_RESULTS_PER_PAGE = 3; // Number of results to display in popup.html
  const DELAY_BETWEEN_RESULTS_MS = 500; // Millisecs to wait before fetching next batch of search results.
  const DELAY_BETWEEN_FETCHING_STYLES = 0; // Millisecs to wait before fetching .JSON for next search result.
  const searchAPI = SearchUserstyles();
  const unprocessedResults = []; // Search results not yet processed.
  const processedResults = []; // Search results that are not installed and apply ot the page (includes 'json' field with full style).
  let loading = false;
  let tabURL; // The active tab's URL.
  let currentDisplayedPage = 1; // Current page number in popup.html
  let nonApplicableResults = 0; // Number of results that don't apply to the searched site (thx userstyles.org!)
  let alreadyInstalledResults = 0; // Number of results that are already installed.

  return {load, next, prev};

  function render() {
    $('#searchResults-list').innerHTML = ''; // Clear search results

    const startIndex = (currentDisplayedPage - 1) * DISPLAYED_RESULTS_PER_PAGE;
    const endIndex = currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE;
    const displayedResults = processedResults.slice(startIndex, endIndex);
    displayedResults.forEach(resultToDisplay => {
      createSearchResultNode(resultToDisplay);
    });

    if (currentDisplayedPage <= 1 || loading) {
      $('#searchResultsNav-prev').setAttribute('disabled', 'disabled');
    } else {
      $('#searchResultsNav-prev').removeAttribute('disabled');
    }
    $('#searchResultsNav-currentPage').textContent = currentDisplayedPage;

    // Hack: Add 1 page if there's results left to process.
    const totalResultsCount = processedResults.length + (unprocessedResults.length ? DISPLAYED_RESULTS_PER_PAGE : 0);
    const totalPageCount = Math.ceil(Math.max(1, totalResultsCount / DISPLAYED_RESULTS_PER_PAGE));
    if (currentDisplayedPage >= totalPageCount || loading) {
      $('#searchResultsNav-next').setAttribute('disabled', 'disabled');
    } else {
      $('#searchResultsNav-next').removeAttribute('disabled');
    }
    $('#searchResultsNav-totalPages').textContent = totalPageCount;

    const navNode = $('#searchResultsNav');
    if (loading && !navNode.classList.contains('loading')) {
      navNode.classList.add('loading');
    } else {
      navNode.classList.remove('loading');
    }
  }

  function shouldLoadMore() {
    const result = (processedResults.length < currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE)
    console.log('shouldLoadMore:',
                result ? 'YES' : 'NO',
                ' processedResults.length(' + processedResults.length + ')',
                '< currentDisplayedPage(' + currentDisplayedPage + ')',
                '* DISPLAYED_RESULTS_PER_PAGE(' + DISPLAYED_RESULTS_PER_PAGE + ')');
    return result;
  }

  function loadMoreIfNeeded() {
    if (shouldLoadMore()) {
      console.log('loadMoreIfNeeded: YES.');
      loading = true;
      render();
      setTimeout(load, 1000);
    } else {
      console.log('loadMoreIfNeeded: NO.');
      loading = false;
      render();
    }
  }

  /** Increments currentDisplayedPage and loads results. */
  function next(event) {
    if (event) {
      event.preventDefault();
    }
    currentDisplayedPage += 1;
    render();
    loadMoreIfNeeded();
  }

  /** Decrements currentPage and loads results. */
  function prev(event) {
    if (event) {
      event.preventDefault();
    }
    currentDisplayedPage = Math.max(1, currentDisplayedPage - 1);
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

    loading = true;
    render();

    if (unprocessedResults.length > 0) {
      processNextResult();
      return true;
    }

    $('#load-search-results').classList.add('hidden');
    $('#searchResults').classList.remove('hidden');
    $('#searchResults-error').classList.add('hidden');

    // Find styles for the current active tab
    getActiveTab().then(tab => {
      tabURL = tab.url;
      searchAPI.getCategory(tabURL)
        .then(category => {
          console.log('userstyles.org "category" for URL ' + tabURL + ' is ' + category);
          $('#searchResults-terms').textContent = category;

          searchAPI.search(category)
            .then(searchResults => {
              console.log('load#searchAPI.search(', category, ') => ',
                          searchResults.data.length, 'results');
              if (searchResults.data.length === 0) {
                throw 404;
              }
              unprocessedResults.push.apply(unprocessedResults, searchResults.data);
              processNextResult();
            })
            .catch(error);
        });
    });
    return true;
  }

  function processNextResult() {
    if (!shouldLoadMore()) {
      console.log('[' + unprocessedResults.length + '] search results remain to be processed: STOPPED');
      loading = false;
      render();
      return;
    } else {
      console.log('[' + unprocessedResults.length + '] search results remain to be processed: PROCESSING');
    }

    if (unprocessedResults.length === 0) {
      loadMoreIfNeeded();
      return;
    }

    // Process the next result in the queue.
    const nextResult = unprocessedResults.shift();
    const matchingStyles = getMatchingInstalledStyles(nextResult);
    if (matchingStyles.length > 0) {
      // Style already installed, skip it.
      // TODO: Include the style anyway with option to "Uninstall" (?)
      console.log('[' + unprocessedResults.length + '] style "' + nextResult.name + '" already installed: CONTINUING');
      alreadyInstalledResults += 1;
      setTimeout(processNextResult, DELAY_BETWEEN_FETCHING_STYLES); // Keep processing
    } else if (nextResult.category !== 'site') {
      // Style is not for a website, skip it.
      console.log('[' + unprocessedResults.length + '] style "' + nextResult.name + '" category is for "' + nextResult.category + '", not "site": CONTINUING');
      nonApplicableResults += 1;
      setTimeout(processNextResult, 0); // Keep processing
    } else {
      // Style not installed, fetch full style to see if it applies to this site.
      console.log('[' + unprocessedResults.length + '] fetching "' + nextResult.name + '": CONTINUING');
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
          console.log('[' + unprocessedResults.length + '] Processed "' + nextResult.name + '"',
                      'processedResults=' + processedResults.length,
                      'skipped-installed=' + alreadyInstalledResults,
                      'skipped-irrelevant=' + nonApplicableResults,
                      'CONTINUING @ sleep=' + DELAY_BETWEEN_RESULTS_MS);
          setTimeout(processNextResult, DELAY_BETWEEN_RESULTS_MS); // Keep processing
        })
        .catch(reason => {
          console.log('[' + unprocessedResults.length + '] Error while loading style ID ' + nextResult.id + ': ' + reason);
          setTimeout(processNextResult, DELAY_BETWEEN_RESULTS_MS); // Keep processing
        });
    }
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
  function createSearchResultNode(userstyleSearchResult) {
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
    console.log('createSearchResultNode(', userstyleSearchResult, ')');

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
    if (screenshotUrl === null) {
      screenshotUrl = 'data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mOcXQ8AAbsBHLLDr5MAAAAASUVORK5CYII=';
    } else if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
      screenshotUrl = 'https://userstyles.org/style_screenshot_thumbnails/' + screenshotUrl;
      screenshot.classList.remove('no-screenshot');
    } else {
      screenshot.classList.remove('no-screenshot');
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

      // TODO on Install: Promise.all([fetchJSON, fetchHTML]) -> popup if customization is present, install otheriwse.
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
          console.log('install:download(', url, ') => [ERROR]: ', reason);
          alert('Error while downloading ' + url + '\nReason: ' + reason);
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
