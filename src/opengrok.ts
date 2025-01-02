import fetch from 'node-fetch';

// SearchQuery objects describe the input to OpenGrok's /search API.
interface SearchQuery {
    server: string;
    projects: string[];
    path?: string;
    full?: string;
    def?: string;
    symbol?: string;
}

interface SearchResponseBody {
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

// Invokes the /search API on the OpenGrok server.
export async function search(searchQuery: SearchQuery): Promise<SearchResponseBody> {
    let queryURL = new URL(`${searchQuery.server}/api/v1/search`);
    searchQuery.projects.forEach((project) => {
        queryURL.searchParams.append('projects', project);
    })
    queryURL.searchParams.append('path', searchQuery.path ?? '');
    queryURL.searchParams.append('full', searchQuery.full ?? '');
    queryURL.searchParams.append('def', searchQuery.def ?? '');
    queryURL.searchParams.append('symbol', searchQuery.symbol ?? '');
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