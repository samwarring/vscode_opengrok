import * as vscode from 'vscode'
import * as opengrok from './opengrok'
import * as path from 'path'

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
        this.iconPath = new vscode.ThemeIcon('folder');
    }

    private constructFileItem() {
        this.label = path.basename(this.filePath!);
        // TODO: Get filetype specific icon.
        this.iconPath = new vscode.ThemeIcon('file');
    }

    private constructLineItem() {
        const fileResults = this.searchResponseBody.results[this.filePath!];
        const lineResult = fileResults[this.lineIndex!];
        this.label = lineResult.line;
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
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

    for (const filePath in searchResponseBody.results) {
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
    }

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