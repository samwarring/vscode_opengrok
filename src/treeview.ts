import * as vscode from 'vscode'
import * as opengrok from './opengrok'
import * as path from 'path'
import * as he from 'he'

export enum TreeItemKind {
    Result,
    Directory,
    File,
    Line
}

export class TreeItem extends vscode.TreeItem {
    private _children: TreeItem[] = [];
    public parentItem: TreeItem | null = null;
    public lineNumber: number | null = null;
    public firstMatchRange: {start: number, end: number} | null = null;

    constructor(
        public readonly searchQuery: opengrok.SearchQuery,
        public readonly searchResponseBody: opengrok.SearchResponseBody,
        public readonly kind: TreeItemKind,
        public readonly directoryPath: string | null,
        public readonly filePath: string | null,
        public readonly lineIndex: number | null,
    ) {
        super('<invalid>', vscode.TreeItemCollapsibleState.Expanded);
        switch (this.kind) {
            case TreeItemKind.Result:
                this.constructResultItem();
                break;
            case TreeItemKind.Directory:
                this.constructDirectoryItem();
                break;
            case TreeItemKind.File:
                this.constructFileItem();
                break;
            case TreeItemKind.Line:
                this.constructLineItem();
                break;
            default:
                console.error(`Invalid tree item kind: ${this.kind}`);
        }
    }

    addChild(childItem: TreeItem) {
        childItem.parentItem = this;
        this._children.push(childItem);
    }

    getChildren(): TreeItem[] {
        return this._children;
    }

    removeChild(childItem: TreeItem) {
        for (let i = 0; i < this._children.length; i++) {
            if (this._children[i] === childItem) {
                this._children.splice(i, 1);
                break;
            }
        }
    }

    getBrowserURL(): URL {
        switch (this.kind) {
            case TreeItemKind.Result:
                return opengrok.getResultsBrowserURL(this.searchQuery);
            case TreeItemKind.Directory:
                return opengrok.getDirectoryBrowserURL(
                    this.searchQuery.server, this.directoryPath!);
            case TreeItemKind.File:
                return opengrok.getFileBrowserURL(
                    this.searchQuery.server, this.filePath!);
            case TreeItemKind.Line:
                return opengrok.getLineBrowserURL(
                    this.searchQuery.server, this.filePath!, this.lineNumber!);
            default:
                console.error(`Invalid tree item kind: ${this.kind}`);
                return new URL(this.searchQuery.server);
        }
    }

    private constructResultItem() {
        const canonQuery = opengrok.getCanonicalQuery(this.searchQuery)
        let numMatches = 0;
        let filePaths = Object.keys(this.searchResponseBody.results);
        filePaths.forEach((filePath) => {
            numMatches += this.searchResponseBody.results[filePath].length;
        });
        this.label = `${canonQuery} (${numMatches} matches)`;
    }

    private constructDirectoryItem() {
        this.label = this.directoryPath!;
    }

    private constructFileItem() {
        this.label = path.basename(this.filePath!);
        this.iconPath = vscode.ThemeIcon.File;
        this.resourceUri = vscode.Uri.parse(this.filePath!);
    }

    private constructLineItem() {
        const fileResults = this.searchResponseBody.results[this.filePath!];
        const lineResult = fileResults[this.lineIndex!];

        // Initialize the line number.
        this.lineNumber = parseInt(lineResult.lineNumber);

        // Unescape HTML entities (e.g. replace '&gt;' with '>').
        let labelText = lineResult.line;
        labelText = he.unescape(labelText);

        // Initialize the firstMatchRange. This must occur before trimming
        // whitespace, but after unescaping HTML entities. This ensrues that
        // selecting the match in the treeview highlights the correct characters
        // in the file.
        this.firstMatchRange = {
            start: labelText.indexOf('<b>'),
            end: labelText.indexOf('</b>') - '<b>'.length
        };

        // Trim whitespace.
        labelText = labelText.trim();

        // Locate highlights for the label (there may be more than one).
        const highlights = this.getHighlights(labelText);

        // Finally, remove <b> and </b> tags from the line.
        labelText = labelText.replaceAll('<b>', '').replaceAll('</b>', '');

        // Initialize the label shown in the treeview.
        this.label = {
            label: labelText,
            highlights: highlights
        };

        // Add the description.
        if (lineResult.tag) {
            this.description = `${lineResult.tag}, line ${this.lineNumber}`;
        }
        else {
            this.description = `line ${this.lineNumber}`;
        }

        // Line items don't have children.
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;

        // When selected, open the matching line in the editor. The argument
        // to the command is a shallow copy of this tree item. The shallow copy
        // is needed to prevent construction of a circular-reference object.
        const shallowClone = {...this};
        this.command = {
            title: 'Open in Editor',
            command: 'openGrok.openInEditor',
            arguments: [shallowClone]
        };
    }

    // Return a list of [startPos, endPos] where each pair indicates a range
    // to be highlighted. The ranges are selected by the locating matching
    // <b> and </b> pairs in the input string.
    //
    // The positions of each range are adjusted with the assumption that the
    // <b> and </b> tags will be removed from the line, but this function does
    // NOT remove those tags.
    private getHighlights(line: string): [number, number][] {
        let result: [number, number][] = [];
        let offset = 0;
        let pos = 0
        while (true) {
            const startPos = line.indexOf('<b>', pos);
            if (startPos == -1) {
                break;
            }
            pos = line.indexOf('</b>', startPos);
            if (pos == -1) {
                break;
            }
            result.push([startPos - offset, pos - (offset + '<b>'.length)]);
            offset += '<b></b>'.length;
        }
        return result;
    }
}

export function buildTreeItems(
    searchQuery: opengrok.SearchQuery,
    searchResponseBody: opengrok.SearchResponseBody) : TreeItem {

    let resultItem = new TreeItem(
        searchQuery, searchResponseBody, TreeItemKind.Result,
        null, null, null);

    // Fast-access to a particular directory item. Will be discarded after
    // building the tree.
    let directoryItems = new Map<string, TreeItem>();

    // Visit results in sorted order.
    let filePaths = Object.keys(searchResponseBody.results).sort();
    filePaths.forEach((filePath) => {
        // Add the directory item if not already added.
        const directoryPath = path.dirname(filePath);
        let directoryItem = directoryItems.get(directoryPath);
        if (!directoryItem) {
            directoryItem = new TreeItem(
                searchQuery, searchResponseBody, TreeItemKind.Directory,
                directoryPath, null, null);
            resultItem.addChild(directoryItem);
            directoryItems.set(directoryPath, directoryItem);
        }

        // Add the file item.
        const fileItem = new TreeItem(
            searchQuery, searchResponseBody, TreeItemKind.File,
            directoryPath, filePath, null);
        directoryItem.addChild(fileItem);

        // Add the line items.
        const numLineItems = searchResponseBody.results[filePath].length;
        for (const lineIndex of Array(numLineItems).keys()) {
            const lineItem = new TreeItem(
                searchQuery, searchResponseBody, TreeItemKind.Line,
                directoryPath, filePath, lineIndex);
            fileItem.addChild(lineItem);
        }
    });

    return resultItem;
}

// Stores the state of the TreeDataProvider that will be restored when a
// workspace is re-opened. The state must be JSON serializable, so this only
// contains the original query and its response. We cannot persist TreeItem
// objects themselves.
export interface WorkspaceState {
    queries: {
        searchQuery: opengrok.SearchQuery,
        searchResponseBody: opengrok.SearchResponseBody
    }[]
};

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

    constructor(public readonly keepRecentSearches: number) {}

    // Hold a root item for each query.
    private _resultItems: TreeItem[] = [];

    // Used to signal the event that data has changed.
	private _onDidChangeTreeData:
    vscode.EventEmitter<TreeItem | undefined | null | void> =
        new vscode.EventEmitter<TreeItem | undefined | null | void>;

    // VSCode internally subscribes to this event and updates the GUI when this
    // treeview's data has changed.
    readonly onDidChangeTreeData:
        vscode.Event<TreeItem | undefined | null | void> =
            this._onDidChangeTreeData.event;

    addResult(resultItem: TreeItem) {
        this._resultItems.unshift(resultItem);
        if (this.keepRecentSearches > 0) {
            while (this._resultItems.length > this.keepRecentSearches) {
                this._resultItems.pop();
            }
        }
        this._onDidChangeTreeData.fire();
    }

    clearResults() {
        this._resultItems = [];
        this._onDidChangeTreeData.fire();
    }

    removeItem(item: TreeItem) {
        const parentItem = item.parentItem;
        if (parentItem) {
            parentItem.removeChild(item);
        }
        else {
            for (let i = 0; i < this._resultItems.length; i++) {
                if (this._resultItems[i] === item) {
                    this._resultItems.splice(i, 1);
                }
            }
        }
        this._onDidChangeTreeData.fire();
    }

    getWorkspaceState(): WorkspaceState {
        let workspaceState: WorkspaceState = {
            queries: []
        };
        this._resultItems.forEach((item) => {
            workspaceState.queries.push({
                searchQuery: item.searchQuery,
                searchResponseBody: item.searchResponseBody
            });
        });
        return workspaceState;
    }

    setWorkspaceState(workspaceState: WorkspaceState) {
        let resultItems: TreeItem[] = [];
        workspaceState.queries.forEach((query) => {
            const item = buildTreeItems(
                query.searchQuery, query.searchResponseBody);
            resultItems.push(item);
        });
        this._resultItems = resultItems;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem | undefined): vscode.ProviderResult<TreeItem[]> {
        if (!element) {
            return this._resultItems;
        }
        else {
            return element.getChildren();
        }
    }

    getParent(element: TreeItem): vscode.ProviderResult<TreeItem> {
        return element.parentItem;
    }
}