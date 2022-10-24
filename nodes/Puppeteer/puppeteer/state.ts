import { Browser } from "puppeteer";

const state: {
	webhookHost: string;
	executions: {
		[key: string]: {
			browser: Browser;
			previousPage?: any;
			previousResponse?: any;
			checked?: boolean;
		};
	};
} = {
	webhookHost:
		process.env?.WEBHOOK_URL?.replace(/\/$/, "") || "http://localhost:5678",
	executions: {},
};

export default state;
