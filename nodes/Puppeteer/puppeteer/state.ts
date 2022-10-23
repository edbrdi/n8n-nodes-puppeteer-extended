import { Browser } from "puppeteer";

const state: {
	browser: {
		[key: string]: Browser;
	};
} = {
	browser: {},
};

export default state;
