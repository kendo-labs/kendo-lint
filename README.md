kendoLint
=========

A static analysis (linting) tool that checks your usage of Kendo UI objects.

Usage
-----

    kendo-lint [options] [files]

If no file names are given, it will read from STDIN.  By default it
parses STDIN as JavaScript, pass `--html` to parse as HTML.

When file names are passed, the type will be determined from the
extension, but it can be forced with either `--js` or `--html`.

To output results as a JSON array, pass `--json`.

What it does
------------

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

To update the API documentation
-------------------------------

As mentioned, the linter relies on knowledge it gets from the Kendo
API documentation, so it will be as good as the docs.  The data is
stored in `lib/api.json`.  To update this file, pass `--parse-docs
/path/to/kendo-docs-repo`.
