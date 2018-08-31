/* global linter */
'use strict';

linter.onChange((...args) => {
  console.log(args);
  // update report
});
