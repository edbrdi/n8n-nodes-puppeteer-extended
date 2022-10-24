import { Browser } from "puppeteer";
import ipc from "node-ipc";
import { IDataObject } from "n8n-workflow";
import start from "./start";
import exec from "./exec";
import state from "./state";
import { INodeParameters } from "./helpers";

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
				if (!state[data.executionId]?.browser) {
					browser = await start(data.globalOptions);
					if (browser) state[data.executionId] = { browser };
				}
				ipc.server.emit(socket, "launch", !!state[data.executionId]?.browser);
			}
		);

		ipc.server.on("shutdown", async (executionId, socket: any) => {
			if (state[executionId]?.browser) {
				await state[executionId]?.browser.close();
				ipc.server.emit(socket, "shutdown", true);
			}
			ipc.server.emit(socket, "shutdown", false);
		});

		ipc.server.on(
			"exec",
			async (
				data: {
					nodeParameters: INodeParameters;
					executionId: string;
					continueOnFail: boolean;
				},
				socket: any
			) => {
				const returnData = await exec(
					data.nodeParameters,
					data.executionId,
					data.continueOnFail
				);

				ipc.server.emit(socket, "exec", returnData);
			}
		);
	});

	ipc.server.start();
}
