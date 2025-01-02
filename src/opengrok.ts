import fetch from 'node-fetch';
import * as vscode from 'vscode';

// SearchQuery objects describe the input to OpenGrok's /search API.
export interface SearchQuery {
    server: string;
    projects: string[];
    path?: string[];
    full?: string[];
    def?: string[];
    symbol?: string[];
}

export interface SearchResponseBody {
    time: number;
    resultCount: number;
    startDocument: number;
    endDocument: number;
    results: SearchResults;
}

interface SearchResults {
    [index: string]: SearchResult[];
}

interface SearchResult {
    line: string;
    lineNumber: string;
    tag: string;
}

// Parses a query string input by the user into a SearchQuery.
//
// The raw query string consists of one or more "clauses". Each clause consists
// of a "field" (full, def, symbol, path, project), followed by a ":", followed
// by the desired value of that field.
// 
// Clauses are separated by whitespace. To construct a clause where the desired
// value contains whitespace, wrap the desired value in double-quotes.
//
// If a clause does not specify a field, then the field is assumed to be a
// "symbol" clause.
//
// This function returns a SearchQuery object if the raw query is well-formed,
// or null if it is not. Note that the 'server' property of SearchQuery will
// always be an empty string (The caller must agument this result with the
// desired server).
export function parseQuery(rawQuery: string): SearchQuery | null {
    let result: SearchQuery = {
        server: '',
        projects: [],
        path: [],
        full: [],
        def: [],
        symbol: []
    };
    enum State {
        ExpectClause,
        ExpectValue
    }
    let state: State = State.ExpectClause;
    const segments = rawQuery.trim().split(/(\s+)/);
    let field: string[] | null = null;
    let value: string | null = null;
    segments.forEach((segment) => {
        switch (state) {
            case State.ExpectClause:
                if (segment.match(/^\s+$/)) {
                    // Clause separator.
                    break;
                }
                if (segment.startsWith('project:')) {
                    field = result.projects;
                    value = segment.substring('project:'.length);
                }
                if (segment.startsWith('path:')) {
                    field = result.path!;
                    value = segment.substring('path:'.length);
                }
                else if (segment.startsWith('full:')) {
                    field = result.full!;
                    value = segment.substring('full:'.length);
                }
                else if (segment.startsWith('def:')) {
                    field = result.def!;
                    value = segment.substring('def:'.length);
                }
                else if (segment.startsWith('symbol:')) {
                    field = result.symbol!;
                    value = segment.substring('sybmol:'.length);
                }
                else {
                    // Default to symbol if no explicit 'field:'
                    field = result.symbol!;
                    value = segment;
                }
                
                if (value.length == 0) {
                    // Empty values will cause problems. Skip this clause.
                    break;
                }
                else if (value.startsWith('"')) {
                    // Need to read remaining segments to get the full value.
                    state = State.ExpectValue;
                }
                else {
                    // Add complete clause to the query.
                    field!.push(value);
                    field = null;
                    value = null;
                }
                break;

            case State.ExpectValue:
                value = value!.concat(segment);
                if (value.endsWith('"')) {
                    // Add complete clause to the query (strip quotes).
                    //field!.push(value.substring(1, value.length - 1));
                    field!.push(value);
                    field = null;
                    value = null;
                    state = State.ExpectClause;
                }
                break;
        }
    });

    // If not looking for a new clause, then something went wrong and the query
    // is invalid. This could happen if, for example, a value that opened with
    // a double-quote was never closed.
    if (state != State.ExpectClause) {
        return null;
    }

    return result;
}

// Returns a canonical string description of the given query, which can
// be displayed to the user.
export function getCanonicalQuery(searchQuery: SearchQuery): string {
    let result: string[] = []
    searchQuery.projects.forEach((project) => {
        result.push(`project:${project}`);
    });
    searchQuery.path?.forEach((path) => {
        result.push(`path:${path}`);
    })
    searchQuery.full?.forEach((full) => {
        result.push(`full:${full}`);
    });
    searchQuery.def?.forEach((def) => {
        result.push(`def:${def}`);
    });
    searchQuery.symbol?.forEach((symbol) => {
        result.push(`symbol:${symbol}`);
    });
    return result.join(' ');
}

// Invokes the /search API on the OpenGrok server.
export async function search(searchQuery: SearchQuery): Promise<SearchResponseBody> {
    let queryURL = new URL(`${searchQuery.server}/api/v1/search`);
    searchQuery.projects.forEach((project) => {
        queryURL.searchParams.append('projects', project);
    })
    searchQuery.path?.forEach((path) => {
        queryURL.searchParams.append('path', path);
    });
    searchQuery.full?.forEach((full) => {
        queryURL.searchParams.append('full', full);
    });
    searchQuery.def?.forEach((def) => {
        queryURL.searchParams.append('def', def);
    });
    searchQuery.symbol?.forEach((symbol) => {
        queryURL.searchParams.append('symbol', symbol);
    });
    const queryURLString = queryURL.toString();
    console.log(`GET ${queryURLString}`);

    const response = await fetch(queryURLString, {
        method: 'GET',
        headers: {
            'content-type': 'application/json'
        }
    });
    const responseJSON = await response.json();
    console.log(responseJSON);

    return Promise.resolve(responseJSON);
}