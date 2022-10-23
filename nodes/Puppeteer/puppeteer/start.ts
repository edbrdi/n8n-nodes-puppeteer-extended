import puppeteer from "puppeteer-extra";
import pluginStealth from "puppeteer-extra-plugin-stealth";
import { IDataObject } from "n8n-workflow";

export default async function (globalOptions: IDataObject) {
	const launchArguments = (globalOptions.launchArguments as IDataObject) || {};
	const headless = globalOptions.headless !== false;
	const executablePath = globalOptions.executablePath as string;
	const stealth = globalOptions.stealth === true;
	// const pageCaching = globalOptions.pageCaching !== false;
	const launchArgs: IDataObject[] = launchArguments.args as IDataObject[];
	const args: string[] = [];

	// More on launch arguments: https://www.chromium.org/developers/how-tos/run-chromium-with-flags/
	if (launchArgs && launchArgs.length > 0) {
		args.push(...launchArgs.map((arg: IDataObject) => arg.arg as string));
	}

	// More on proxying: https://www.chromium.org/developers/design-documents/network-settings
	if (globalOptions.proxyServer) {
		args.push(`--proxy-server=${globalOptions.proxyServer}`);
	}

	if (stealth) {
		puppeteer.use(pluginStealth());
	}

	const browser = await puppeteer
		.launch({
			headless,
			args,
			executablePath,
		})
		.catch((e) => console.log(e));

	return browser ?? undefined;
}
