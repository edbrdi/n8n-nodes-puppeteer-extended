import ipc from "node-ipc";
// import state from './state';

export interface Step {
	url: string;
	queryParameters: { parameter: any[] };
	output: { [key: string]: any };
	stepOptions: { [key: string]: any };
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

// export interface IExecutionData {
// 	executionId: string;
// 	placeholderId: string;
// 	channelId: string;
// 	apiKey: string;
// 	userId?: string;
// }

// export const execution = async (
// 	executionId: string,
// 	placeholderId: string,
// 	channelId: string,
// 	apiKey: string,
// 	userId?: string,
// ): Promise<boolean> => {
// 	return new Promise((resolve, reject) => {
// 		const timeout = setTimeout(() => reject('timeout'), 15000);
// 		ipc.connectTo('bot', () => {
// 			ipc.of.bot.emit('execution', {
// 				executionId,
// 				placeholderId,
// 				channelId,
// 				apiKey,
// 				userId,
// 			});
// 			ipc.of.bot.on('execution', () => {
// 				clearTimeout(timeout);
// 				resolve(true);
// 			});
// 		});
// 	});
// };
