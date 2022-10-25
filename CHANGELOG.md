# Changelog

## Released (2022-10-25 0.1.0)

/!\ Breaking change with the previous version - Futur versions will be more stable

This version is a partial rewrite of the node, it brings a new architecture (inspired by my community node Discord) in which you can keep a Puppeteer session between your nodes during the same workflow execution. So I removed the "steps" paradigm because it is no longer needed.

An API access to n8n is required to check when the workflow execution stops in order to stop Puppeteer too.

### New Features

* Ability to keep a session between nodes
* You can combine as much output as you want on a single node
* You can now specify the property name for the page content output (useful if you output multiple page content on a single node)

### Bug Fixes

### Refactors

* HTML to JSON improvements
* Due to the new architecture, the UI has been siplified

## Released (2022-09-29 0.0.2)

### New Features

* Loop selector "selectAll" in getPageContent
* "No attribute" option: Ignore HTML attributes while converting to JSON

### Bug Fixes

### Refactors

* HTML to JSON imrpovements (apply some filtering to remove useless spaces, line breaks, empty objects...)