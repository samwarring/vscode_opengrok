// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as opengrok from './opengrok';
import * as treeview from './treeview';
import * as path from 'path';
import * as fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "openGrok" is now active!');

	// Register the treeview.
	let treeDataProvider = new treeview.TreeDataProvider();
	let treeViewOptions: vscode.TreeViewOptions<treeview.TreeItem> = {
		treeDataProvider: treeDataProvider,
		canSelectMany: false,
		showCollapseAll: true
	};
	vscode.window.createTreeView('openGrokResults', treeViewOptions);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const commandSearch = vscode.commands.registerCommand(
		'openGrok.search',
		async () => {
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
			let searchQuery = opengrok.parseQuery(rawQuery);
			if (!searchQuery) {
				vscode.window.showErrorMessage('Invalid search query');
				return;
			}
			
			// Perform query.
			const config = vscode.workspace.getConfiguration();
			searchQuery.server = config.get('openGrok.serverURL', '');
			searchQuery.projects.push(...config.get<string[]>(
				'openGrok.defaultProjectNames', []));
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
		}
	);

	const commandViewInBrowser = vscode.commands.registerCommand(
		'openGrok.viewInBrowser',
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
			if (!fs.existsSync(localPath)) {
				vscode.window.showWarningMessage(`File not found: ${localPath}`);
				return;
			}
			
			const uri = vscode.Uri.from({
				scheme: 'vscode',
				authority: 'file',
				path: `${localPath}:${treeItem.lineNumber}`
			});
			console.log(`Open in editor: ${uri.toString()}`);
			vscode.commands.executeCommand('vscode.open', uri);
		}
	);

	const commandClearResults = vscode.commands.registerCommand(
		'openGrok.clearResults',
		() => { treeDataProvider.clearResults(); });

	context.subscriptions.push(
		commandSearch,
		commandViewInBrowser,
		commandOpenInEditor,
		commandClearResults);
}

// This method is called when your extension is deactivated
export function deactivate() {}
