// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const vsls = require('vsls')
const fs = require('fs')
const path = require('path')
const express = require('express')
const detect = require('detect-port');
const jsdom = require("jsdom");
const { couldStartTrivia } = require('typescript');
const { JSDOM } = jsdom;

const inject = fs.readFileSync(__dirname + '/inject.html', 'utf-8')

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
			ws.send('welcome')
		});

		var port = await detect(requestedPort)
		/* 
		app.use(serveStatic(folder.uri.fsPath, {
			extensions: ['html', 'htm']
		}))
		 */

		app.get('*', async (req, res, next) => {
			var filePath = safeJoin(folder.uri.fsPath, req.url)
			filePath = filePath.split('?')[0] // remove query
			console.log(filePath)

			// 1. check if the path doesn't end with .html
			// 2. check if the file path+html exists
			// 3. if it does, then make that into the path
			if (!filePath.endsWith('.html')) { // step 1
				try { // step 2
					await fs.promises.access(filePath + '.html')
					filePath = filePath + '.html' // step 3
				}
				catch {
					// console.log(filePath + '.html' + ' doesnt exist')
				}
			}

			fs.promises.access(filePath)
				.then(async () => {
					if (is_dir(filePath)) {
						filePath = safeJoin(filePath, '/index.html')
					}
					if (!filePath.endsWith('.html')) {
						res.sendFile(filePath)
					} else {
						//its html so we need to inject the reload script
						var html = await fs.promises.readFile(filePath, 'utf-8')
						const dom = new JSDOM(html)

						dom.window.document.body.innerHTML += inject

						res.send(dom.serialize())
					}
				})
				.catch(() => {
					next()
				})
		})

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

			function reload(fileType) {
				console.log(expressWs.getWss().clients)
				expressWs.getWss().clients.forEach(ws => {
					if (fileType == 'html') ws.send('reload')
					if (fileType == 'js') ws.send('reload')

					if (fileType == 'css') ws.send('reload-css')
				})
			}

			servers.push({
				name, port, server, url, folder, reload
			})
			provider.refresh()
			share({
				name, port, server, url, folder, reload
			})
			vscode.env.openExternal(url)

			var choice = await vscode.window.showInformationMessage(`Server listening at ${url}`, copy)
			if (choice == copy) {
				vscode.env.clipboard.writeText(url)
			}
		})
	});

	function is_dir(path) {
		try {
			var stat = fs.lstatSync(path);
			return stat.isDirectory();
		} catch (e) {
			// lstatSync throws an error if path doesn't exist
			return false;
		}
	}

	const isChildOf = (child, parent) => {
		const relative = path.relative(parent, child);
		return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
	}

	const safeJoin = (root, file) => {
		const newPath = path.join(root, file)
		// check for path traversal
		if (newPath.indexOf(root) != 0) {
			return null;
		}
		return newPath;
	}

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
			unshare(stopServer)
		}
	})

	vscode.commands.registerCommand('lived.deleteEntry', (node) => {
		var serverToStop = servers.find(s => s.name == node.label).server
		serverToStop.close()
		servers = servers.filter(s => s.name !== node.label)
		provider.refresh()
		unshare(node.label)
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
		var savedServers = servers.filter(s => isChildOf(file.uri.fsPath, s.folder.uri.fsPath))
		savedServers.forEach(server => {
			switch (path.extname(file.uri.fsPath)) {
				case '.html':
					server.reload('html')
					break;
				case '.js':
					server.reload('js')
					break;
				case '.css':
					server.reload('css')
					break;
				default:
					// file was updated, but its not html,css or js. in the future this should be handled in an options menu
					break;
			}
		})
	})

	var share = function () { } // share function used outside of the thing below
	var unshare = function () { }

	vsls.getApi().then(api => {
		if (api) { // if Live Share is available (installed)
			api.onDidChangeSession(event => {
				var session = event.session

				var disposables = []

				function shareServer(server, session, api) {
					if (server && session && api) {
						if (session.role == vsls.Role.Host)
							console.log('im going to share')
						api.shareServer({
							port: server.port,
							displayName: server.name,
							browseUrl: server.url
						}).then(shared => {
							disposables.push({
								name: server.name,
								disposable: shared
							})
						})
					}
				}

				function unshareServer(name) {
					var disposable = disposables.find(d => d.name == name)
					disposable.disposable.dispose()
				}

				share = function (server) { // expose share function
					shareServer(server, session, api)
				}

				unshare = function (name) { // expose share function
					unshareServer(name)
				}


				servers.forEach(s => {
					shareServer(s, session, api)
				})
			})
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
