import { Browser } from "puppeteer";

const state: {
	[key: string]: {
		browser: Browser;
		previousPage?: any;
		previousResponse?: any;
	};
} = {};

export default state;
