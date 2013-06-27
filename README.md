# kendoLint

## About kendoLint

A static analysis (linting) tool that checks your usage of Kendo UI objects... automatically!

## Compatibility and Requirements

kendoLint was designed to inspect your Kendo UI configurations in a terminal environment with Node.js

kendoLint currently depends on the following libraries:

- Node
- NPM
- UglifyJS
- Cheerio
- Glob
- Markdown
- Optimist

kendoLint has not been tested against any other versions of these libraries. You may find that versions other than these are compatible with kendoLint, but we make no claims to support those version, nor can we troubleshoot issues that arise when using those versions.

## Installation

    npm install -g kendo-lint

## Usage (command-line)

    kendo-lint [options] [files]

If no file names are given, it will read from STDIN.  By default it
parses STDIN as JavaScript, pass `--html` to parse as HTML.

When file names are passed, the type will be determined from the
extension, but it can be forced with either `--js` or `--html`.

To output results as a JSON array, pass `--json`.

## API

    var kendoLint = require("kendo-lint");

### lintJS(code, filename)

    var results = kendoLint.lintJS(code, filename);

Use this if you already have the code in memory.  No file is read, the
`filename` argument is just included in the results array, which will
contain objects like this:

    { filename: filename,
      message: "Warning message",
      line: the line number,
      col: the column }

### lintJSFile(filename, callback)

Pass the full path to the file to lint.  Your callback is invoked with
two arguments, `error` and `results`.

### lintHTML(code, filename)

Use this to lint HTML code.  It's similar to `lintJS`, except that for
the time being we cannot report line/column information.

### lintHTMLFile(filename, callback)

Similar to `lintJSFile`, but for HTML code.

## What it does

The Kendo linting tool will search for code that constructs Kendo
widgets, and check the passed options against the API documentation.
Any mismatches are reported (invalid option name, or invalid type for
option).

For JavaScript it looks for code like this:

```js
(...).kendoWidgetName({ ... })
```

and check the options inside the brackets.  It checks nested options
too.

For HTML it searches MVVM constructs, like:

```html
<div data-role="widget-name" data-option="..."> ... </div>
```

and tries to validate the widget name and given options against known
API.

Currently we cannot report line/column numbers for HTML (using the
Cheerio NodeJS module which doesn't give that information).

### To update the API documentation

As mentioned, the linter relies on knowledge it gets from the Kendo
API documentation, so it will be as good as the docs.  The data is
stored in `lib/api.json`.  To update this file, pass `--parse-docs
/path/to/kendo-docs-repo`.

## How to Contribute

If you would like to contribute to kendoLint's source code, please read the [guidelines for pull requests and contributions] CONTRIBUTING.md). Following these guidelines will help make your contributions easier to bring in to the next release.

## Getting Help

Use this section to list ways that a developer can obtain help or support for this project, for instance, Stack Overflow. Make sure to also leave the following section:

As a part of Kendo UI Labs, kendoLint is intended to be a community-run project, and not an official part of any Kendo UI SKU (Web, DataViz, Mobile or Complete). As such, this project is not a supported part of Kendo UI, and is not covered under the support agreements for Kendo UI license holders. Please do not create support requests for this project, as these will be immediately closed and you'll be directed to post your question on a community forum.

## Release Notes

For change logs and release notes, see the [changelog](CHANGELOG.md) file.

## License Information

This project has been released under the [Apache License, version 2.0](http://www.apache.org/licenses/LICENSE-2.0.html), the text of which is included below. This license applies ONLY to the project-specific source of each repository and does not extend to Kendo UI itself, or any other 3rd party libraries used in a repository. For licensing information about Kendo UI, see the [License Agreements page](https://www.kendoui.com/purchase/license-agreement.aspx) at [KendoUI.com](http://www.kendoui.com).

> Copyright © 2013 Telerik

> Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

> [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

>  Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
