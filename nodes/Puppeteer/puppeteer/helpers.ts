import ipc from "node-ipc";
// import state from './state';

export interface INodeParameters {
	url: string;
	queryParameters: { parameter: { name: string; value: string }[] };
	output: { [key: string]: any };
	globalOptions: { [key: string]: any };
	nodeOptions: { [key: string]: any };
	interactions: {
		parameter: {
			selector: string;
			value?: string;
			waitForNavigation?: boolean;
		}[];
	};
}

// todo timeout
export const ipcRequest = (type: string, parameters: any): Promise<any> => {
	return new Promise((resolve) => {
		ipc.config.retry = 1500;
		ipc.connectTo("puppeteer", () => {
			ipc.of.puppeteer.emit(type, parameters);

			ipc.of.puppeteer.on(type, (data: any) => {
				resolve(data);
			});
		});
	});
};
