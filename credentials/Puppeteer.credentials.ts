import { ICredentialType, INodeProperties } from "n8n-workflow";

export class Puppeteer implements ICredentialType {
	name = "puppeteer";
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-display-name-missing-api
	displayName = "Puppeteer";
	documentationUrl = "https://github.com/hckdotng/n8n-nodes-puppeteer-extended";
	properties: INodeProperties[] = [
		{
			displayName: "n8n API key",
			name: "apiKey",
			description: "The API key of the n8n server",
			type: "string",
			default: "",
		},
	];
}
