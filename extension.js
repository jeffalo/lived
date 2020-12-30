// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs')
const path = require('path')
const express = require('express')
const serveStatic = require('./lib/serve-static')
const detect = require('detect-port');

/**
 * @param {vscode.ExtensionContext} context
 */

async function activate(context) {
	//console.log('Congratulations, your extension "live" is now active!');

	var servers = []

	let startCommand = vscode.commands.registerCommand('lived.start', async function () {
		if (!vscode.workspace.workspaceFolders) {
			return vscode.window.showErrorMessage('could not start live server, requires a workspace')
		}
		var folder = vscode.workspace.workspaceFolders[0]

		if (vscode.workspace.workspaceFolders.length > 1) {
			var folders = vscode.workspace.workspaceFolders.map(f => f.uri.fsPath)
			folderFsPath = await vscode.window.showQuickPick(folders, {
				canPickMany: false,
				ignoreFocusOut: true,
				placeHolder: 'Choose a workspace path to host'
			})
			folder = vscode.workspace.workspaceFolders.find(f => f.uri.fsPath == folderFsPath)
		}

		var thePath = folder.uri.path

		const name = await vscode.window.showInputBox({
			value: thePath.substring(thePath.lastIndexOf('/') + 1),
			prompt: 'Server name',
			validateInput: function (input) {
				if (servers.some(e => e.name === input)) {
					return 'server with name exists'
				} else {
					return ''
				}
			}
		})
		if (!name) return
		const requestedPort = await vscode.window.showInputBox({
			value: '5500',
			prompt: 'Port',
			validateInput: function (input) {
				var portCheck = /^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/
				if (portCheck.test(input)) {
					return ''
				} else {
					return 'invalid port'
				}
			}
		})

		const app = express()
		var expressWs = require('express-ws')(app);

		app.ws('/jeffalo.lived/reload', function (ws, req) {
			ws.on('message', function (msg) {
				ws.send(msg);
			});
		});

		var port = await detect(requestedPort)

		app.use(serveStatic(folder.uri.fsPath, {
			extensions: ['html', 'htm']
		}))

		app.use(function (req, res, next) {
			res.status(404);

			if (fs.existsSync(folder.uri.fsPath + '/404.html')) {
				res.sendFile(folder.uri.fsPath + '/404.html');
			} else {
				next()
			}
		});

		const server = app.listen(port, async () => {
			let url = `http://localhost:${server.address().port}`
			let copy = 'Copy'

			function reload() {
				console.log(expressWs.getWss().clients)
				expressWs.getWss().clients.forEach(ws => {
					ws.send('reload')
				})
			}

			servers.push({
				name, port, server, url, folder, reload
			})
			provider.refresh()
			vscode.env.openExternal(url)

			var choice = await vscode.window.showInformationMessage(`Server listening at ${url}`, copy)
			if (choice == copy) {
				vscode.env.clipboard.writeText(url)
			}
		})
	});

	let stopCommand = vscode.commands.registerCommand('lived.stop', async function () {
		const serverNames = servers.map(s => s.name)
		//console.log(serverNames)
		const stopServer = await vscode.window.showQuickPick(serverNames, {
			canPickMany: false,
			ignoreFocusOut: true,
			placeHolder: 'Choose a server to stop'
		})
		if (stopServer) {
			var serverToStop = servers.find(s => s.name == stopServer).server
			serverToStop.close()
			servers = servers.filter(s => s.name !== stopServer)
			provider.refresh()
		}
	})

	vscode.commands.registerCommand('lived.deleteEntry', (node) => {
		var serverToStop = servers.find(s => s.name == node.label).server
		serverToStop.close()
		servers = servers.filter(s => s.name !== node.label)
		provider.refresh()
	});

	class serverProvider {
		constructor() {
			this._onDidChangeTreeData = new vscode.EventEmitter();
			this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		}
		refresh() {
			this._onDidChangeTreeData.fire();
		}
		getTreeItem(element) {
			return element;
		}
		getChildren(element) {
			if (element) {
				return Promise.res([]) //theres no children ever
			} else {
				var sendArray = []
				servers.forEach(s => {
					var item = new vscode.TreeItem(s.name)
					item.command = {
						command: 'vscode.open',
						arguments: [vscode.Uri.parse(s.url)]
					}
					item.description = s.url
					//console.log(s.port)
					item.tooltip = s.folder.uri.fsPath
					sendArray.push(item)
				})
				return Promise.resolve(sendArray)
			}
		}
	}
	const provider = new serverProvider();

	vscode.window.registerTreeDataProvider('serverList', provider);
	let refreshCommand = vscode.commands.registerCommand('lived.refreshList', () => {
		provider.refresh()
	});

	vscode.workspace.onDidSaveTextDocument(file => {
		var fileFolderPath = path.dirname(file.uri.fsPath)
		//console.log(fileFolderPath)
		var server = servers.find(s => s.folder.uri.fsPath == fileFolderPath)
		if (server) {
			server.reload()
		} else {
			// console.log('file saved, but no server is running for it')
		}
	})

	context.subscriptions.push(startCommand);
	context.subscriptions.push(stopCommand);
	context.subscriptions.push(refreshCommand);

	let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
	myStatusBarItem.command = 'lived.start'
	myStatusBarItem.text = '$(radio-tower) Start Live'
	myStatusBarItem.show()

	context.subscriptions.push(myStatusBarItem);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
