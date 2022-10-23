import { IExecuteFunctions } from "n8n-core";
import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from "n8n-workflow";
import { devices } from "puppeteer";
import { nodeDescription } from "./Puppeteer.node.options";
import { ipcRequest, Step } from "./puppeteer/helpers";
import server from "./puppeteer";

// we start the server if we are in the main process
if (!process.send) server();

export class Puppeteer implements INodeType {
	description: INodeTypeDescription = nodeDescription;

	methods = {
		loadOptions: {
			async getDevices(
				this: ILoadOptionsFunctions
			): Promise<INodePropertyOptions[]> {
				const deviceNames = Object.keys(devices);
				const returnData: INodePropertyOptions[] = [];

				for (const name of deviceNames) {
					const device = devices[name];
					returnData.push({
						name,
						value: name,
						description: `${device.viewport.width} x ${device.viewport.height} @ ${device.viewport.deviceScaleFactor}x`,
					});
				}

				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		console.log("node execution");
		// const credentials = (await this.getCredentials("discordApi").catch(
		// 	(e) => e
		// )) as any; // as any as ...
		// @ts-ignore
		const executionId = this.getExecutionId();

		let returnData: INodeExecutionData[] = [];

		const globalOptions = this.getNodeParameter(
			"globalOptions",
			0,
			{}
		) as IDataObject;

		const { step: steps = [] } = this.getNodeParameter("steps", 0, {}) as {
			step: Step[];
		};

		const isStarted = await ipcRequest("launch", {
			globalOptions,
			executionId,
		}).catch((e: any) => {
			throw new Error(e);
		});

		if (isStarted) {
			console.log("exec");
			const res = await ipcRequest("exec", {
				globalOptions,
				executionId,
				continueOnFail: this.continueOnFail(),
				steps,
			}).catch((e: any) => {
				throw new Error(e);
			});

			if (res) {
				console.log(res);
				returnData = res;
			}
		}

		await ipcRequest("shutdown", executionId);

		return this.prepareOutputData(returnData);
	}
}
