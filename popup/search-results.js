/* global handleEvent tryJSONparse getStylesSafe BG */
'use strict';

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Exposed methods representing the search results on userstyles.org
 */
function SearchUserstyles() {
  let totalPages;
  let currentPage = 1;
  let exhausted = false;

  return {getCurrentPage, getTotalPages, getCategory, isExhausted, search, fetchStyleJson};

  function getCurrentPage() {
    return currentPage;
  }

  function getTotalPages() {
    return totalPages;
  }

  function isExhausted() {
    return exhausted;
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
   * Automatically sets currentPage and totalPages.
   * @param {string} category The usrestyles.org "category" (subcategory) OR a any search string.
   * @return {Object} Response object from userstyles.org
   */
  function search(category) {
    return new Promise((resolve, reject) => {
      console.log('search(' + category + ') currentPage:' + currentPage + ' totalPages:' + totalPages);
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
          exhausted = (currentPage > totalPages);
          resolve(responseJson);
        } else {
          exhausted = true;
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
  const DELAY_AFTER_FETCHING_STYLES = 0; // Millisecs to wait before fetching next batch of search results.
  const DELAY_BEFORE_SEARCHING_STYLES = 0; // Millisecs to wait before fetching .JSON for next search result.
  const searchAPI = SearchUserstyles();
  const unprocessedResults = []; // Search results not yet processed.
  const processedResults = []; // Search results that are not installed and apply ot the page (includes 'json' field with full style).
  const BLANK_PIXEL_DATA = 'data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAA' +
                           'C1HAwCAAAAC0lEQVR42mOcXQ8AAbsBHLLDr5MAAAAASUVORK5CYII=';
  let loading = false;
  let tabURL; // The active tab's URL.
  let currentDisplayedPage = 1; // Current page number in popup.html

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

    let totalResultsCount = processedResults.length;
    if (unprocessedResults.length > 0) {
      // Add 1 page if there's results left to process.
      totalResultsCount += DISPLAYED_RESULTS_PER_PAGE;
    }
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

  /**
   * @returns {Boolean} If we should process more results.
   */
  function shouldLoadMore() {
    const result = (processedResults.length < currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE);
    console.log('shouldLoadMore:',
                result === true ? 'YES' : 'NO',
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
      setTimeout(load, DELAY_BEFORE_SEARCHING_STYLES);
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
   * Initializes search results container, starts fetching results.
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

    if (searchAPI.isExhausted()) {
      console.log('searchAPI is exhausted');
      loading = false;
      render();
      return true;
    }

    $('#find-styles').classList.add('hidden');
    $('#open-search').classList.remove('hidden');
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

  /**
   * Processes the next search result in `unprocessedResults` and adds to `processedResults`.
   * Skips installed/non-applicable styles.
   * Fetches more search results if unprocessedResults is empty.
   * Recurses until shouldLoadMore() is false.
   */
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
    isStyleInstalled(nextResult)
      .then(isInstalled => {
        if (isInstalled) {
          // Style already installed, skip it.
          // TODO: Include the style anyway with option to "Uninstall" (?)
          console.log('[' + unprocessedResults.length + '] style "' + nextResult.name +
                      '" already installed: CONTINUING');
          setTimeout(processNextResult, 0); // Keep processing
        } else if (nextResult.category !== 'site') {
          // Style is not for a website, skip it.
          console.log('[' + unprocessedResults.length + '] style "' + nextResult.name +
                      '" category is for "' + nextResult.category + '", not "site": CONTINUING');
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
              if (applicableSections.length > 0) {
                // Style is valid (can apply to this site).
                nextResult.json = userstyleJson; // Store Style JSON for easy installing later.
                processedResults.push(nextResult);
                render();
              }
              console.log('[' + unprocessedResults.length + '] Processed "' + nextResult.name + '"',
                          'processedResults=' + processedResults.length,
                          'CONTINUING @ sleep=' + DELAY_AFTER_FETCHING_STYLES);
              setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES); // Keep processing
            })
            .catch(reason => {
              console.log('[' + unprocessedResults.length + '] Error while loading style ID ' +
                          nextResult.id + ': ' + reason);
              setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES); // Keep processing
            });
        }
      });
  }

  /**
   * Promises if the given searchResult matches an already-installed style.
   * @param {Object} userstyleSearchResult Search result object from userstyles.org
   * @returns {Promise<boolean>} Resolves if the style is installed.
   */
  function isStyleInstalled(userstyleSearchResult) {
    return new Promise(function (resolve, reject) {
      getStylesSafe()
        .then(installedStyles => {
          console.log('Seeing if searchResult(', userstyleSearchResult.name, ') is in matchingStyles');
          const matchingStyles = installedStyles.filter(installedStyle => {
            // Compare installed name to search result name.
            let isMatch = installedStyle.name === userstyleSearchResult.name;
            // Compare if search result ID (userstyles ID) is mentioned in the installed updateUrl.
            if (installedStyle.updateUrl) {
              isMatch &= installedStyle.updateUrl.indexOf('/' + userstyleSearchResult.id + '.json') >= 0;
            }
            return isMatch;
          });
          resolve(matchingStyles.length > 0);
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
    console.log('createSearchResultNode(', userstyleSearchResult.name, ')');

    if (userstyleSearchResult.installed) {
      return;
    }

    const entry = template.searchResult.cloneNode(true);
    Object.assign(entry, {
      id: 'searchResult-' + userstyleSearchResult.id
    });
    $('#searchResults-list').appendChild(entry);

    const searchResultName = userstyleSearchResult.name;
    const title = $('.searchResult-title', entry);
    Object.assign(title, {
      textContent: searchResultName + ' (by ' + userstyleSearchResult.user.name + ')',
      title: searchResultName + ' by: ' + userstyleSearchResult.user.name,
      href: 'https://userstyles.org' + userstyleSearchResult.url,
      onclick: handleEvent.openURLandHide
    });

    const screenshot = $('.searchResult-screenshot', entry);
    let screenshotUrl = userstyleSearchResult.screenshot_url;
    if (screenshotUrl === null) {
      screenshotUrl = BLANK_PIXEL_DATA;
    } else if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
      screenshotUrl = 'https://userstyles.org/style_screenshot_thumbnails/' + screenshotUrl;
      screenshot.classList.remove('no-screenshot');
    } else {
      screenshot.classList.remove('no-screenshot');
    }
    Object.assign(screenshot, {
      src: screenshotUrl,
      title: '"' + searchResultName + '" by ' + userstyleSearchResult.user.name
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

    const rating = $('.searchResult-rating', entry);
    let ratingClass;
    let ratingValue = userstyleSearchResult.rating;
    if (ratingValue === null) {
      ratingClass = 'none';
      ratingValue = 'n/a';
    } else if (ratingValue >= 2.5) {
      ratingClass = 'good';
      ratingValue = ratingValue.toFixed(1);
    } else if (ratingValue >= 1.5) {
      ratingClass = 'okay';
      ratingValue = ratingValue.toFixed(1);
    } else {
      ratingClass = 'bad';
      ratingValue = ratingValue.toFixed(1);
    }
    Object.assign(rating, {
      textContent: ratingValue,
      className: 'searchResult-rating ' + ratingClass
    });

    const installCount = $('.searchResult-installCount', entry);
    Object.assign(installCount, {
      textContent: userstyleSearchResult.total_install_count.toLocaleString()
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
      saveStyleSafe(userstyleSearchResult.json)
        .then(() => {
          // Remove search result after installing
          let matchingIndex = -1;
          processedResults.forEach((processedResult, index) => {
            console.log('processedResult[' + index + '].id =', processedResult.id,
                        'userstyleSearchResult.id =', userstyleSearchResult.id);
            if (processedResult.id === userstyleSearchResult.id) {
              matchingIndex = index;
            }
          });
          console.log('matchingIndex =', matchingIndex);
          if (matchingIndex >= 0) {
            console.log('processedResults.length before', processedResults.length);
            processedResults.splice(matchingIndex, 1);
            console.log('processedResults.length after', processedResults.length);
          }
          processNextResult();
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
  $('#find-styles-link').onclick = SearchResults.load;
  $('#searchResultsNav-prev').onclick = SearchResults.prev;
  $('#searchResultsNav-next').onclick = SearchResults.next;
});
