import { Browser } from "puppeteer";
import ipc from "node-ipc";
import { IDataObject } from "n8n-workflow";
import axios from "axios";
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
				if (!state.executions[data.executionId]?.browser) {
					browser = await start(data.globalOptions);
					if (browser) state.executions[data.executionId] = { browser };
				}
				ipc.server.emit(
					socket,
					"launch",
					!!state.executions[data.executionId]?.browser
				);
			}
		);

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

		ipc.server.on(
			"check",
			async (
				data: { executionId: string; apiKey: string; baseUrl: string },
				socket: any
			) => {
				ipc.server.emit(socket, "check", true);
				if (
					data.executionId &&
					data.apiKey &&
					state.executions[data.executionId] &&
					!state.executions[data.executionId].checked
				) {
					state.executions[data.executionId].checked = true;
					const checkExecution = async (
						executionId: string,
						apiKey: string,
						baseUrl: string
					) => {
						const headers = {
							accept: "application/json",
							"X-N8N-API-KEY": apiKey,
						};
						const res = await axios
							.get(`${baseUrl}/executions/${executionId}`, {
								headers,
							})
							.catch((e) => e);
						if (
							res &&
							res.data &&
							res.data.finished === false &&
							res.data.stoppedAt === null
						) {
							setTimeout(() => {
								checkExecution(executionId, apiKey, baseUrl);
							}, 3000);
						} else if (state.executions[executionId]?.browser) {
							// stop puppeteer
							await state.executions[executionId]?.browser.close();
							delete state.executions[executionId];
						}
					};
					checkExecution(data.executionId, data.apiKey, data.baseUrl);
				}
			}
		);
	});

	ipc.server.start();
}
