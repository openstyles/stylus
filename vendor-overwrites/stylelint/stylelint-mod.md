Stylelint bundle file created by:

1. Installing, or having stylelint installed in any repository
    (`npm install stylelint`).
2. Installing, or having browserify installed globally
    (`npm install browserify`).
3. Bundle the linter by typing this into the terminal:
    `browserify -r stylelint -o stylelint-bundle.js`.
4. Lastly, comment out the following lines around 94413 to 94419:

    ```js
    /*
    try {
      ignoreText = fs.readFileSync(absoluteIgnoreFilePath, "utf8");
    } catch (readError) {
      if (readError.code !== FILE_NOT_FOUND_ERROR_CODE) throw readError;
    }
    */
    ```

    This prevents a js error when stylelint attempts to access a local file. The
    other `fs.readFile` entries are not accessed because we're using stylelint's
    standalone method.
5. The script was then "minified" by manually running it through Google's [Closure Compiler](http://closure-compiler.appspot.com/home) set to "Whitespace only".
