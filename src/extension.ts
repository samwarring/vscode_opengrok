// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as opengrok from './opengrok';
import * as treeview from './treeview';
import * as path from 'path';

const TREEVIEW_STATE_KEY = 'openGrok.treeViewState';

interface SearchRequest {
	selection?: string
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "openGrok" is now active!');

	// Register the treeview.
	const keepRecentSearches = vscode.workspace.getConfiguration()
		.get<number>('openGrok.keepRecentSearches', 0);
	let treeDataProvider = new treeview.TreeDataProvider(keepRecentSearches);
	let treeViewOptions: vscode.TreeViewOptions<treeview.TreeItem> = {
		treeDataProvider: treeDataProvider,
		canSelectMany: false,
		showCollapseAll: true
	};
	let treeView = vscode.window.createTreeView('openGrokResults', treeViewOptions);

	// Restore state of the treeview.
	try {
		const treeViewState = context.workspaceState.get<treeview.WorkspaceState>(
			TREEVIEW_STATE_KEY);
		if (treeViewState) {
			treeDataProvider.setWorkspaceState(treeViewState);
		}
	} catch (error) {
		vscode.window.showErrorMessage(
			`Error restoring OpenGrok results: ${error}`);
	}

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const commandSearch = vscode.commands.registerCommand(
		'openGrok.search',
		async (searchRequest?: SearchRequest) => {
			// If user has not configured the extension, prompt them to do so.
			const config = vscode.workspace.getConfiguration();
			const serverURL = config.get('openGrok.serverURL', '');
			const defaultProjects = config.get<string[]>(
				'openGrok.defaultProjectNames', []);
			if (serverURL.trim() == '' || defaultProjects.length == 0) {
				vscode.window.showInformationMessage(
					'The server and default projects have not been configured.',
					'Open Settings').then((item) => {
						if (item == 'Open Settings') {
							vscode.commands.executeCommand(
								'workbench.action.openSettings',
								'openGrok');
						}
					});
				return;
			}

			let searchQuery: opengrok.SearchQuery | null = null;
			if (searchRequest?.selection) {
				// Get query from selected text.
				let searchString = opengrok.escapeSearchString(searchRequest.selection);
				searchQuery = {
					server: serverURL,
					projects: defaultProjects,
				};
				// HACK: If the search string contains special characters
				// (indicated by presence of a backslash), then do a full search
				// instead of a symbol search.
				// See: https://github.com/oracle/opengrok/issues/4701
				if (searchString.indexOf('\\') == -1) {
					// No special characters.
					searchQuery.symbol = [searchString];
				}
				else {
					searchQuery.full = [searchString];
				}
			}
			else {
				// Prompt query from user.
				const rawQuery = await vscode.window.showInputBox({
					title: "OpenGrok: Search",
					prompt: "Enter an OpenGrok query"
				});
				if (!rawQuery) {
					// User cancelled the operation.
					return;
				}

				// Parse query.
				searchQuery = opengrok.parseQuery(rawQuery);
				if (!searchQuery) {
					vscode.window.showErrorMessage('Invalid search query');
					return;
				}
				searchQuery.server = serverURL;
				searchQuery.projects.push(...defaultProjects);
			}

			// Focus on the results
			// await vscode.commands.executeCommand('openGrokResults.focus');

			// Show a progress bar for these operations
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Window,
				title: "OpenGrok: Searching...",
				cancellable: false
			}, async (progress, token): Promise<void> => {
				// Perform query.
				console.log(searchQuery);
				let searchResponseBody: opengrok.SearchResponseBody | null = null;
				try {
					searchResponseBody = await opengrok.search(searchQuery);
				}
				catch (error) {
					vscode.window.showErrorMessage(
						`Failed to query the server.\n${error}`)
					return;
				}
	
				// Display the results
				const resultTreeItem = treeview.buildTreeItems(
					searchQuery,
					searchResponseBody);
				treeDataProvider.addResult(resultTreeItem);
	
				// Focus on the new item in the updated treeview.
				await treeView.reveal(resultTreeItem, { focus: true });
			});

			// Save treeview state to be restored if workspace is closed.
			await context.workspaceState.update(
				TREEVIEW_STATE_KEY, treeDataProvider.getWorkspaceState());
		}
	);

	const commandSearchSelection = vscode.commands.registerCommand(
		'openGrok.searchSelection',
		() => {
			// Get selected text in the active editor.
			// https://stackoverflow.com/a/73044114/1123681
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			const selection = editor.selection;
			if (!selection || selection.isEmpty) {
				return;
			}
			const selectionRange = new vscode.Range(
				selection.start.line, selection.start.character,
				selection.end.line, selection.end.character);
			const selectionText = editor.document.getText(selectionRange);

			// Initiate search for the selected text.
			vscode.commands.executeCommand('openGrok.search', {
				selection: selectionText
			});
		}
	);

	const commandopenInBrowser = vscode.commands.registerCommand(
		'openGrok.openInBrowser',
		(treeItem: treeview.TreeItem) => {
			const browserURL = treeItem.getBrowserURL().toString();
			console.log(`Open in browser: ${browserURL}`);
			vscode.env.openExternal(vscode.Uri.parse(browserURL)); 
		}
	);

	const commandOpenInEditor = vscode.commands.registerCommand(
		'openGrok.openInEditor',
		(treeItem: treeview.TreeItem) => {
			// Get workspace folder.
			const workspaceFolder = 
				vscode.workspace.workspaceFolders ?
				vscode.workspace.workspaceFolders[0].uri.path : '/';
			
			// Remove first /directory from the file path. This directory would
			// be the name of the grok-project.
			const filePathWithoutProject =
				treeItem.filePath!.split('/').slice(2).join('/');

			// Make a new path relative to the workspace.
			const localPath = path.join(workspaceFolder, filePathWithoutProject);
			const uri = vscode.Uri.file(localPath);
			console.log(`Open in editor: ${uri.toString()}`);
			const textDocumentShowOptions: vscode.TextDocumentShowOptions = {
				preserveFocus: true,
				preview: true,
				selection: new vscode.Range(
					// vscode.Range begins line numbers at 0.
					treeItem.lineNumber! - 1, treeItem.firstMatchRange!.start,
					treeItem.lineNumber! - 1, treeItem.firstMatchRange!.end)
			};
			vscode.commands.executeCommand(
				'vscode.open',
				uri,
				textDocumentShowOptions);
		}
	);

	const commandClearResults = vscode.commands.registerCommand(
		'openGrok.clearResults',
		async () => {
			treeDataProvider.clearResults();
			await context.workspaceState.update(
				TREEVIEW_STATE_KEY, treeDataProvider.getWorkspaceState());
		}
	);

	const commandRemoveResultItem = vscode.commands.registerCommand(
		'openGrok.removeResultItem',
		async (item: treeview.TreeItem) => {
			treeDataProvider.removeItem(item);
			await context.workspaceState.update(
				TREEVIEW_STATE_KEY, treeDataProvider.getWorkspaceState());
		}
	);

	const commandCopyBrowserLink = vscode.commands.registerCommand(
		'openGrok.copyBrowserLink',
		(item: treeview.TreeItem) => {
			vscode.env.clipboard.writeText(item.getBrowserURL().toString());
			vscode.window.showInformationMessage("URL copied to clipboard");
		}
	);

	context.subscriptions.push(
		commandSearch,
		commandSearchSelection,
		commandopenInBrowser,
		commandOpenInEditor,
		commandClearResults,
		commandRemoveResultItem,
		commandCopyBrowserLink);
}

// This method is called when your extension is deactivated
export function deactivate() {}
