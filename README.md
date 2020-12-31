# `lived` for Visual Studio Code

[![VSCode Marketplace](https://img.shields.io/vscode-marketplace/v/jeffalo.lived.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=jeffalo.lived) [![Total Installs](https://img.shields.io/vscode-marketplace/d/jeffalo.lived.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=jeffalo.lived)

![icon](images/icon.png)

Quickly start a local development server for static pages.

## Features

- Quickly start a local web-server to host static files
- Imitate a GitHub pages environment
    - html file extension is not required
    - automatically route 404s to 404.html
- Easily manage multiple servers

    ![Manage multiple servers](images/manage.png)

- Multi-root workspace support 

    ![Multiple workspace roots](images/multi.gif)

## Requirements

- Visual Studio Code

## Extension Settings

None right now

## Known Issues

N/A

## Release Notes

Versions follow semver

### 0.2.0

- Live reload!!!
    - html pages will automatically reload if a html or js file was updated
    - when a css file is updated, the page will update without reloading 😲 🤯
    - in the future, there will be many options for this

### 0.1.0

- Marketplace updates
- Internal code updates to prepare for live reload

### 0.0.1

Initial release