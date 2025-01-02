// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as opengrok from './opengrok';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "openGrok" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand(
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

			try {
				const searchResponseBody = await opengrok.search(searchQuery);
			}
			catch (error) {
				vscode.window.showErrorMessage(
					`Failed to query the server.\n${error}`)
			}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
