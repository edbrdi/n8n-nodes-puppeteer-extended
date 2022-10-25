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
import { ipcRequest } from "./puppeteer/helpers";
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
		let returnData: INodeExecutionData[] = [];
		const credentials = (await this.getCredentials("n8nApi")) as {
			apiKey: string;
			baseUrl: string;
		};
		// @ts-ignore
		const executionId = this.getExecutionId();

		const globalOptions = this.getNodeParameter(
			"globalOptions",
			0,
			{}
		) as IDataObject;

		const nodeOptions = this.getNodeParameter(
			"nodeOptions",
			0,
			{}
		) as IDataObject;

		const url = this.getNodeParameter("url", 0, {}) as string;

		const queryParameters = this.getNodeParameter(
			"queryParameters",
			0,
			{}
		) as IDataObject;

		const interactions = this.getNodeParameter(
			"interactions",
			0,
			{}
		) as IDataObject;

		const output = this.getNodeParameter("output", 0, {}) as IDataObject;

		const isStarted = await ipcRequest("launch", {
			globalOptions,
			executionId,
		}).catch((e: any) => {
			throw new Error(e);
		});

		if (isStarted) {
			console.log("exec", globalOptions);
			const res = await ipcRequest("exec", {
				nodeParameters: {
					globalOptions,
					nodeOptions,
					url,
					queryParameters,
					interactions,
					output,
				},
				executionId,
				continueOnFail: this.continueOnFail(),
			}).catch((e: any) => {
				throw new Error(e);
			});

			if (res) {
				if (res.binary) {
					for await (const key of Object.keys(res.binary)) {
						const type = res.binary[key].type;
						const binaryData = await this.helpers
							.prepareBinaryData(
								Buffer.from(res.binary[key].data),
								undefined,
								type === "pdf"
									? "application/pdf"
									: `image/${res.binary[key].type}`
							)
							.catch((e) => console.log(e));
						if (binaryData) res.binary[key] = binaryData;
						else delete res.binary[key];
					}
				}

				returnData = [res];
			}
		}

		ipcRequest("check", {
			executionId,
			apiKey: credentials.apiKey,
			baseUrl: credentials.baseUrl,
		});

		return this.prepareOutputData(returnData);
	}
}
