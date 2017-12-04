/* global handleEvent tryJSONparse getStylesSafe BG */
'use strict';

(() => {
  Promise.all([getActiveTab(), onDOMready()])
    .then(([tab]) => {
      $('#find-styles-link').href = searchUserstyles().getSearchPageURL(tab.url);

      $('#find-styles-link').onclick = event => {
        // Only load search results inline if option is selected.
        if ($('#find-styles-inline').checked) {
          // Hide 'inline' checkbox.
          $('#find-styles-inline-group').classList.add('hidden');
          $('#find-styles-inline').checked = false;

          const searchResults = searchResultsController();
          $('#searchResultsNav-prev').onclick = searchResults.prev;
          $('#searchResultsNav-next').onclick = searchResults.next;
          searchResults.load();
          document.body.classList.add('search-results-shown');

          window.scrollTo(0, 0);

          // Avoid propagating click to anchor/href
          event.preventDefault();
          return false;
        } else {
          // Open anchor href in new tab.
          handleEvent.openURLandHide.call($('#find-styles-link'), event);
        }
      };
    });

  /**
   * Represents the search results within the Stylus popup.
   * @returns {Object} Includes load(), next(), and prev() methods to alter the search results.
   */
  function searchResultsController() {
    const DISPLAYED_RESULTS_PER_PAGE = 3; // Number of results to display in popup.html
    const DELAY_AFTER_FETCHING_STYLES = 0; // Millisecs to wait before fetching next batch of search results.
    const DELAY_BEFORE_SEARCHING_STYLES = 0; // Millisecs to wait before fetching .JSON for next search result.
    const searchAPI = searchUserstyles();
    const unprocessedResults = []; // Search results not yet processed.
    const processedResults = []; // Search results that are not installed and apply ot the page (includes 'json' field with full style).
    const BLANK_PIXEL_DATA = 'data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAA' +
                            'C1HAwCAAAAC0lEQVR42mOcXQ8AAbsBHLLDr5MAAAAASUVORK5CYII=';
    let loading = false;
    let tabURL; // The active tab's URL.
    let category; // Category for the active tab's URL.
    let currentDisplayedPage = 1; // Current page number in popup.html

    return {load, next, prev};

    function render() {
      $('#searchResults-list').textContent = ''; // Clear search results

      const startIndex = (currentDisplayedPage - 1) * DISPLAYED_RESULTS_PER_PAGE;
      const endIndex = currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE;
      const displayedResults = processedResults.slice(startIndex, endIndex);
      displayedResults.forEach(resultToDisplay => {
        createSearchResultNode(resultToDisplay);
      });

      if (currentDisplayedPage <= 1 || loading) {
        $('#searchResultsNav-prev').disabled = true;
      } else {
        $('#searchResultsNav-prev').disabled = false;
      }
      $('#searchResultsNav-currentPage').textContent = currentDisplayedPage;

      let totalResultsCount = processedResults.length;
      if (unprocessedResults.length > 0) {
        // Add 1 page if there's results left to process.
        totalResultsCount += DISPLAYED_RESULTS_PER_PAGE;
      }
      const totalPageCount = Math.ceil(Math.max(1, totalResultsCount / DISPLAYED_RESULTS_PER_PAGE));
      if (currentDisplayedPage >= totalPageCount || loading) {
        $('#searchResultsNav-next').disabled = true;
      } else {
        $('#searchResultsNav-next').disabled = false;
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
      return (processedResults.length < currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE);
    }

    function loadMoreIfNeeded() {
      if (shouldLoadMore()) {
        loading = true;
        render();
        setTimeout(load, DELAY_BEFORE_SEARCHING_STYLES);
      } else {
        loading = false;
        render();
      }
    }

    /** Increments currentDisplayedPage and loads results. */
    function next() {
      currentDisplayedPage += 1;
      render();
      window.scrollTo(0, 0);
      loadMoreIfNeeded();
    }

    /** Decrements currentPage and loads results. */
    function prev() {
      currentDisplayedPage = Math.max(1, currentDisplayedPage - 1);
      render();
      window.scrollTo(0, 0);
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
        message = 'Error loading search results: ' + reason;
      }
      $('#searchResults').classList.add('hidden');
      $('#searchResults-error').textContent = message;
      $('#searchResults-error').classList.remove('hidden');
    }

    /**
     * Initializes search results container, starts fetching results.
     */
    function load() {
      loading = true;
      render();

      if (unprocessedResults.length > 0) {
        processNextResult();
        return true;
      }

      if (searchAPI.isExhausted()) {
        loading = false;
        render();
        return true;
      }

      $('#searchResults').classList.remove('hidden');
      $('#searchResults-error').classList.add('hidden');

      // Discover current tab's URL & the "category" for the URL, then search.
      getActiveTab().then(tab => {
        tabURL = tab.url;
        category = searchAPI.getCategory(tabURL);
        $('#searchResults-terms').textContent = category;
        searchAPI.search(category)
          .then(searchResults => {
            if (searchResults.data.length === 0) {
              throw 404;
            }
            unprocessedResults.push.apply(unprocessedResults, searchResults.data);
            processNextResult();
          })
          .catch(error);
      });
    }

    /**
     * Processes the next search result in `unprocessedResults` and adds to `processedResults`.
     * Skips installed/non-applicable styles.
     * Fetches more search results if unprocessedResults is empty.
     * Recurses until shouldLoadMore() is false.
     */
    function processNextResult() {
      if (!shouldLoadMore()) {
        loading = false;
        render();
        return;
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
            setTimeout(processNextResult, 0); // Keep processing
          } else if (nextResult.category !== 'site') {
            // Style is not for a website, skip it.
            setTimeout(processNextResult, 0); // Keep processing
          } else {
            // Style not installed.
            // 1: Fetch full style (.JSON) to see if it applies to this site.
            // 2: Fetch full style info to see if it has customizations.
            Promise.all([
              searchAPI.fetchStyleJson(nextResult.id), // for "sections" (applicable URLs)
              searchAPI.fetchStyle(nextResult.id)      // for "style_settings" (customizations)
            ]).then(([userstyleJson, userstyleObject]) => {
              // Extract applicable sections (i.e. styles that apply to the current site)
              const applicableSections = BG.getApplicableSections({
                style: userstyleJson,
                matchUrl: tabURL,
                stopOnFirst: true
              });
              if (applicableSections.length > 0) {
                // Style is valid (can apply to this site).
                nextResult.json = userstyleJson; // Store Style JSON for easy installing later.

                // Store style settings for detecting customization later.
                nextResult.style_settings = userstyleObject.style_settings;

                processedResults.push(nextResult);
                render();
              }
              setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES); // Keep processing
            })
            .catch(reason => {
              console.log('processNextResult(', nextResult.id, ') => [ERROR]: ', reason);
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
            const matchingStyles = installedStyles.filter(installedStyle => {
              // Compare installed name to search result name.
              let isMatch = installedStyle.name === userstyleSearchResult.name;
              // Compare if search result ID (userstyles ID) is mentioned in the installed updateUrl.
              if (installedStyle.updateUrl) {
                isMatch &= installedStyle.updateUrl.includes('/' + userstyleSearchResult.id + '.json');
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
          },
          style_settings: [...]
        }
      */
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
        textContent: searchResultName,
        title: searchResultName,
        href: searchAPI.BASE_URL + userstyleSearchResult.url,
        onclick: handleEvent.openURLandHide
      });

      const screenshot = $('.searchResult-screenshot', entry);
      let screenshotUrl = userstyleSearchResult.screenshot_url;
      if (screenshotUrl === null) {
        screenshotUrl = BLANK_PIXEL_DATA;
        screenshot.classList.add('no-screenshot');
      } else if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
        screenshotUrl = searchAPI.BASE_URL + '/style_screenshot_thumbnails/' + screenshotUrl;
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
        href: searchAPI.BASE_URL + '/users/' + userstyleSearchResult.user.id,
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

      const installButton = $('.searchResult-install', entry);
      installButton.onclick = install;

      if (userstyleSearchResult.style_settings.length > 0) {
        // Style has customizations
        installButton.classList.add('customize');
        const customizeButton = $('.searchResult-customize', entry);
        customizeButton.classList.remove('hidden');
        customizeButton.href = searchAPI.BASE_URL + userstyleSearchResult.url;
        customizeButton.onclick = handleEvent.openURLandHide;
      }

      /** Installs the current userstyleSearchResult into stylus. */
      function install() {
        entry.classList.add('loading');

        const styleId = userstyleSearchResult.id;
        const url = searchAPI.BASE_URL + '/styles/chrome/' + styleId + '.json';
        saveStyleSafe(userstyleSearchResult.json)
          .then(() => {
            // Remove search result after installing
            let matchingIndex = -1;
            processedResults.forEach((processedResult, index) => {
              if (processedResult.id === userstyleSearchResult.id) {
                matchingIndex = index;
              }
            });
            if (matchingIndex >= 0) {
              processedResults.splice(matchingIndex, 1);
            }
            processNextResult();
          })
          .catch(reason => {
            console.log('install:saveStyleSafe(', url, ') => [ERROR]: ', reason);
            alert('Error while downloading ' + url + '\nReason: ' + reason);
          });
        return true;
      }
    }
  }
})();

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Exposed methods representing the search results on userstyles.org
 */
function searchUserstyles() {
  const BASE_URL = 'https://userstyles.org';
  let totalPages;
  let currentPage = 1;
  let exhausted = false;

  return {BASE_URL, getCategory, getSearchPageURL, isExhausted, search, fetchStyleJson, fetchStyle};

  /**
   * @returns {Boolean} If there are no more results to fetch from userstyles.org
   */
  function isExhausted() {
    return exhausted;
  }

  function getSearchPageURL(url) {
    const category = getCategory(url);
    if (category === 'STYLUS') {
      return BASE_URL + '/styles/browse/?search_terms=Stylus';
    } else {
      return BASE_URL + '/styles/browse/' + category;
    }
  }

  /**
   * Resolves the Userstyles.org "category" for a given URL.
   * @param {String} url The URL to a webpage.
   * @returns {Promise<String>} The category for a URL, or the hostname if category is not found.
   */
  function getCategory(url) {
    const u = tryCatch(() => new URL(url));
    if (!u) {
      return ''; // Invalid URL
    } else if (u.protocol === 'file:') {
      return 'file:'; // File page
    } else if (u.protocol === location.protocol) {
      return 'STYLUS'; // Stylus page
    } else {
      // Website address, strip TLD & subdomain
      const domainRegex = /^www\.|(\.com?)?\.\w+$/g;
      return u.hostname.replace(domainRegex, '').split('.').pop();
    }
  }

  /**
   * Fetches the JSON style object from userstyles.org (containing code, sections, updateUrl, etc).
   * This is fetched from the /styles/chrome/ID.json endpoint.
   * @param {number} userstylesId The internal "ID" for a style on userstyles.org
   * @returns {Promise<Object>} The response as a JSON object.
   */
  function fetchStyleJson(userstylesId) {
    return new Promise((resolve, reject) => {
      const jsonUrl = BASE_URL + '/styles/chrome/' + userstylesId + '.json';
      download(jsonUrl)
        .then(responseText => {
          resolve(tryJSONparse(responseText));
        })
        .catch(reject);
    });
  }

  /**
   * Fetches style information from userstyles.org's /api/v1/styles/{ID} API.
   * @param {number} userstylesId The internal "ID" for a style on userstyles.org
   * @returns {Promise<Object>} An object containing info about the style, e.g. name, author, etc.
   */
  function fetchStyle(userstylesId) {
    return new Promise((resolve, reject) => {
      download(BASE_URL + '/api/v1/styles/' + userstylesId, {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          'Accept': '*/*'
        },
        body: null
      }).then(responseText => {
        resolve(tryJSONparse(responseText));
      }).catch(reject);
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
      if (totalPages !== undefined && currentPage > totalPages) {
        resolve({'data':[]});
      }

      const searchURL = BASE_URL +
        '/api/v1/styles/subcategory' +
        '?search=' + encodeURIComponent(category) +
        '&page=' + currentPage +
        '&country=NA';

      download(searchURL, {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          'Accept': '*/*'
        },
        body: null
      }).then(responseText => {
        const responseJson = tryJSONparse(responseText);
        currentPage = responseJson.current_page + 1;
        totalPages = responseJson.total_pages;
        exhausted = (currentPage > totalPages);
        resolve(responseJson);
      }).catch(reason => {
        exhausted = true;
        reject(reason);
      });
    });
  }
}
