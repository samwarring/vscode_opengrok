# OpenGrok for VSCode

Search your OpenGrok server within VSCode!

## Features

- Adds an `OpenGrok: Search` command in the command pallete that will perform a search on an OpenGrok server.
- Search query language lets you filter or expand the search by file path or project.
- Browse search results from within VSCode.
- Select search results to open the matching file and line in VSCode. (The file
  must be found in the current workspace at the same relative path.)

## Extension Settings

This extension contributes the following settings:

* `openGrok.serverURL`: Full path to the OpenGrok server.
* `openGrok.defaultProjects`: List of projects to search by default.
