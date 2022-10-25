import { Browser } from "puppeteer";

const state: {
	executions: {
		[key: string]: {
			browser: Browser;
			previousPage?: any;
			previousResponse?: any;
			checked?: boolean;
		};
	};
} = {
	executions: {},
};

export default state;
