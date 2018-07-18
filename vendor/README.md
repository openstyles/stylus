# Vendor files are populated by the build script:

## What the build script does

Using this repo, run `npm install`... the latest versions of:

* `CodeMirror` (https://github.com/codemirror/CodeMirror) is installed.
* `jsonlint` (https://github.com/zaach/jsonlint) is installed.
* `less` (https://github.com/less/less.js) is installed.
* `lz-string-unsafe` (https://github.com/openstyles/lz-string-unsafe) is installed.<br><br>
* **TODO**: `node-semver` (https://github.com/eight04/node-semver-bundle) is installed.
* **TODO**: `stylus-lang` (https://github.com/eight04/stylus-lang-bundle) is installed.<br><br>
* The necessary build tools are installed; see `devDependencies` in the `package.json`.

## Running the build script

Use `npm run build` to first update the packages in the `node_modules` folder & then update the vendor folder.

The following changes are made:

* `CodeMirror`: Only the essential files are copied directly from the `node_modules` folder to `vendor/codemirror`; see the `vendor/codemirror/README` for specifics.
* `jsonlint`: The uncompressed `lib/jsonlint.js` is copied directly to `vendor/jsonlint`.
* `less`: The compressed `dist/less.min.js` file is copied directly into `vendor/less`.
* `lz-string-unsafe`: The compressed `lz-string-unsafe.min.js` file is copied directly into `vendor/lz-string-unsafe`.
