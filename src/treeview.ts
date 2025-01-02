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
        this._children.push(childItem);
    }

    getChildren(): TreeItem[] {
        return this._children;
    }

    private constructResultItem() {
        const canonQuery = opengrok.getCanonicalQuery(this.searchQuery)
        const numResults = this.searchResponseBody.resultCount;
        this.label = `${canonQuery} (${numResults} matches)`;
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
        
        // Format the label:
        // - Trim whitespace.
        // - Unescape HTML entities (e.g. replace '&gt;' with '>').
        // - Locate and remove <b> and </b> tags (there may be more than one).
        let labelText = lineResult.line.trim();
        labelText = he.unescape(labelText);
        const highlights = this.getHighlights(labelText);
        labelText = labelText.replaceAll('<b>', '').replaceAll('</b>', '');
        this.label = {
            label: labelText,
            highlights: highlights
        };

        // Add the description.
        if (lineResult.tag) {
            this.description =
                `${lineResult.tag}, ` + `line ${lineResult.lineNumber}`;
        }
        else {
            this.description = `line ${lineResult.lineNumber}`;
        }

        // Line items don't have children.
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
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

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

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
}