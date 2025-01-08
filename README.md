# OpenGrok for VSCode

Search your OpenGrok server within VSCode!

## Features

- Adds an `OpenGrok: Search` command in the command pallete that will perform a
  search on an OpenGrok server.
- Search query language lets you filter or expand the search by file path or
  project.
- Search for text selected in the editor.
- Browse search results from within VSCode.
- Select search results to open the matching file and line in VSCode.

## Extension Settings

This extension contributes the following settings:

* `openGrok.serverURL`: Full path to the OpenGrok server.
* `openGrok.defaultProjects`: List of projects to search by default.

## How to Use

### Configuration
After installing the extension, configure the following settings for your
workspace:
- Open Grok: Server URL
- Open Grok: Default Projects

### Searching

From the command palette, run the command `OpenGrok: Search`. Alternatively,
in the OpenGrok view, click the search icon.

Enter a query into the input box. The following patterns are recognized and
treated as additional search filters:
- `symbol:foo` Search for symbol `foo`.
- `full:foo` Full search for `foo`.
- `def:foo` Search definitions for `foo`.
- `project:foo` Also search project `foo`.
- `path:foo` Search for files whose path contains `foo`.
- `type:foo` Search for files whose type is `foo`.

All other search terms are implicitly prepended with `symbol:`. A search term
may contain whitespace if the term is enclosed in double-quotes (e.g.
`full:"with space"`).

Alternatively, with text selected in the editor, right click the selected text
and choose `OpenGrok: Search for Selection` in the context menu.

### Viewing Results

Search results appear in the OpenGrok view. Selecting a result from this view
will open the corresponding file and line in the editor. The file must exist
in the current workspace at the same relative path.

Each search result includes buttons to view the result on the OpenGrok web
interface, copy a link to the web interface, and dismiss the result.