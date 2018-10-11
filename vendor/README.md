# Vendor files are populated by the build script:

## What the build script does

Using this repo, run `npm install`... the latest versions of:

* `CodeMirror` (https://github.com/codemirror/CodeMirror) is installed.
* `jsonlint` (https://github.com/zaach/jsonlint) is installed.
* `less` (https://github.com/less/less.js) is installed.
* `lz-string-unsafe` (https://github.com/openstyles/lz-string-unsafe) is installed.
* `semver-bundle` (https://github.com/openstyles/semver-bundle) is installed.
* `stylus-lang` (https://github.com/openstyles/stylus-lang-bundle) is installed.
* `usercss-meta` (https://github.com/StylishThemes/parse-usercss) is installed.
* The necessary build tools are installed; see `devDependencies` in the `package.json`.

## Running the build script

Use `npm run update` to first update the packages in the `node_modules` folder & then update the vendor folder.

The following changes are made:

* `CodeMirror`: Only existing files are updated directly from the `node_modules` folder; see the [CodeMirror readme](codemirror/README.md) for specifics.
* `jsonlint`: The uncompressed `lib/jsonlint.js` is copied directly to `vendor/jsonlint`.
* `less`: The compressed `dist/less.min.js` file is copied directly into `vendor/less`.
* `lz-string-unsafe`: The compressed `lz-string-unsafe.min.js` file is copied directly into `vendor/lz-string-unsafe`.
* `semver-bundle`: The `dist/semver.js` file is copied directly into `vendor/semver`.
* `stylus-lang-bundle`: The `stylus.min.js` file is copied directly into `vendor/stylus-lang-bundle`.
* `usercss-meta`: The `dist/usercss-meta.min.js` file is copied directly into `vendor/usercss-meta`.

## Creating the ZIP

Use `npm run zip`.

This command creates a zip file that includes all the files from the repository **except**:

* All dot files (e.g. `.eslintrc` & `.gitignore`).
* `node_modules` folder.
* `tools` folder.
* `package.json` file.
* `package-lock.json` and/or `yarn.lock` file(s).
* `vendor/codemirror/lib` files. This path is excluded because it contains a file modified for development purposes only. Instead, the CodeMirror files are copied directly from `node_modules/codemirror/lib`.
