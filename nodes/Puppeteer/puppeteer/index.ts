import { Browser } from "puppeteer";
import ipc from "node-ipc";
import { IDataObject } from "n8n-workflow";
import start from "./start";
import exec from "./exec";
import state from "./state";

export default function () {
	ipc.config.id = "puppeteer";
	ipc.config.retry = 1500;

	ipc.serve(function () {
		ipc.server.on(
			"launch",
			async (
				data: { globalOptions: IDataObject; executionId: string },
				socket: any
			) => {
				let browser: Browser | void;
				if (!state.browser[data.executionId]) {
					browser = await start(data.globalOptions);
					if (browser) state.browser[data.executionId] = browser;
				}
				ipc.server.emit(socket, "launch", !!state.browser[data.executionId]);
			}
		);

		ipc.server.on(
			"shutdown",
			async (data: { executionId: string }, socket: any) => {
				if (state.browser[data.executionId]) {
					await state.browser[data.executionId].close();
					ipc.server.emit(socket, "shutdown", true);
				}
				ipc.server.emit(socket, "shutdown", false);
			}
		);

		ipc.server.on(
			"exec",
			async (
				data: {
					globalOptions: IDataObject;
					executionId: string;
					continueOnFail: boolean;
					steps: any[];
				},
				socket: any
			) => {
				const returnData = await exec(
					data.globalOptions,
					data.executionId,
					data.continueOnFail,
					data.steps
				);

				ipc.server.emit(socket, "exec", returnData);
			}
		);
	});

	ipc.server.start();
}
