import {
	Page,
	PuppeteerLifeCycleEvent,
	devices,
	HTTPResponse,
	ScreenshotOptions,
} from "puppeteer";
import { IDataObject, IBinaryData, INodePropertyOptions } from "n8n-workflow";
import state from "./state";
import { Step } from "./helpers";

async function pageContent(
	getPageContent: {
		cssSelector: string;
		htmlToJson: boolean;
		innerHtml: boolean;
		selectAll: boolean;
		noAttributes: boolean;
	},
	page: Page
) {
	const {
		cssSelector,
		htmlToJson: hasHtmlToJson,
		innerHtml: hasInnerHtml,
		selectAll: hasSelectAll,
		noAttributes: hasNoAttributes,
	} = getPageContent;

	return await new Promise(async (resolve, reject) => {
		let res;

		if (hasHtmlToJson) {
			res = await page
				.evaluate(
					(
						cssSelector: string,
						hasSelectAll: boolean,
						hasNoAttributes: boolean
					) => {
						function cleanText(text: string) {
							const replaced = text
								.replace(/\\n+/g, "\n")
								.replace(/\s+/g, " ")
								.trim();
							if (replaced === "\n") return "";
							return replaced;
						}

						function htmlToJson(element: any) {
							if (element.nodeType === 1 || element.nodeType === 9) {
								const attributes: any = {};
								if (element.attributes && !hasNoAttributes) {
									for (let j = 0; j < element.attributes.length; j++) {
										attributes["@" + element.attributes[j].nodeName] =
											element.attributes[j].nodeValue;
									}
								}

								let value: any;

								if (
									element.childNodes.length === 1 &&
									element.childNodes[0].nodeName === "#text"
								) {
									value = cleanText(element.childNodes[0].textContent);
									if (!Object.keys(attributes).length) return value;
								} else {
									value = {};
									for (let j = 0; j < element.childNodes.length; j++) {
										const childNode = element.childNodes[j];
										const nodeName = childNode.nodeName.toLowerCase();

										if (!value[nodeName]) value[nodeName] = childNode;
										else if (Array.isArray(value[nodeName]))
											value[nodeName].push(childNode);
										else value[nodeName] = [value[nodeName], childNode];
									}
								}

								return {
									...attributes,
									...(typeof value === "object"
										? { ...value }
										: { "#text": cleanText(value) }),
								};
							}

							return "";
						}

						function recursiveHtmlToJson(element: any) {
							if (typeof element === "object") {
								Object.keys(element).forEach((key) => {
									if (!/@/.test(key)) {
										if (Array.isArray(element[key])) {
											element[key].forEach((child: any, j: number) => {
												if (child.nodeType && child.nodeType === 1) {
													element[key][j] = htmlToJson(child);
													recursiveHtmlToJson(element[key][j]);
												} else if (child.nodeType && child.nodeType === 3) {
													element[key][j] = cleanText(child.textContent);
												}
											});

											element[key] = element[key].filter((e: any) => {
												if (typeof e === "string" && e) return e;
												if (Object.keys(e).length) return e;
											});
											if (element[key].length === 1)
												element[key] = element[key][0];
											else if (!element[key].length) delete element[key];
										} else {
											const nodeType = element[key].nodeType;
											if (nodeType && nodeType === 1) {
												element[key] = htmlToJson(element[key]);
												recursiveHtmlToJson(element[key]);
												if (!element[key]) delete element[key];
												if (
													typeof element[key] === "object" &&
													!Object.keys(element[key]).length
												)
													delete element[key];
											} else if (nodeType && nodeType === 3) {
												element[key] = cleanText(element[key].textContent);
												if (!element[key]) delete element[key];
											}
										}
									}
								});
							}
						}

						const selection: (Element | Document | null)[] = [];
						if (cssSelector && hasSelectAll) {
							document
								.querySelectorAll(cssSelector)
								.forEach((e) => selection.push(e));
						} else {
							selection.push(
								cssSelector ? document.querySelector(cssSelector) : document
							);
						}

						const parsed: any[] = [];
						selection.forEach((e) => {
							const current = htmlToJson(e);
							recursiveHtmlToJson(current);
							parsed.push(current);
						});

						return hasSelectAll ? parsed : parsed[0];
					},
					cssSelector,
					hasSelectAll,
					hasNoAttributes
				)
				.catch((err: any) => reject(err));
		} else {
			res = cssSelector
				? await page
						.evaluate(
							(
								cssSelector: string,
								hasInnerHtml: boolean,
								hasSelectAll: boolean
							) => {
								if (cssSelector && hasSelectAll) {
									const selection: string[] = [];
									document.querySelectorAll(cssSelector).forEach((e) => {
										selection.push(hasInnerHtml ? e.innerHTML : e.outerHTML);
									});
									return selection;
								} else
									return hasInnerHtml
										? document.querySelector(cssSelector)?.innerHTML
										: document.querySelector(cssSelector)?.outerHTML;
							},
							cssSelector,
							hasInnerHtml,
							hasSelectAll
						)
						.catch((err: any) => reject(err))
				: await page.content().catch((err: any) => reject(err));
		}

		resolve(res);
	});
}

const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36";

export default async function (
	globalOptions: IDataObject,
	executionId: string,
	continueOnFail: boolean,
	steps: any
) {
	const browser = state.browser[executionId];
	if (!browser) return;

	const returnData: INodePropertyOptions[] = [];
	let i = 0;
	const pageCaching = globalOptions.pageCaching !== false;

	const runStep = async (
		step: Step,
		previousPage?: Page,
		previousResponse?: any
	) => {
		if (i === 0 && !step.url) return; // cannot start with an empty url

		const urlString = step.url;

		let page: Page, response;

		if (urlString) {
			const { parameter: someHeaders = [] } = (globalOptions.headers ||
				{}) as any;
			const queryParameters = step.queryParameters?.parameter ?? [];
			const requestHeaders = someHeaders.reduce((acc: any, cur: any) => {
				acc[cur.name] = cur.value;
				return acc;
			}, {});
			const device = globalOptions.device as string;

			const url = new URL(urlString);
			page = await browser.newPage();

			if (globalOptions.viewport) {
				const viewport = globalOptions.viewport as {
					size: { width: number; height: number };
				};
				const { width, height } = viewport.size;
				await page.setViewport({ width, height });
			}

			await page.setCacheEnabled(pageCaching);

			if (device) {
				const emulatedDevice = devices[device];
				if (emulatedDevice) {
					await page.emulate(emulatedDevice);
				}
			} else {
				const userAgent =
					requestHeaders["User-Agent"] ||
					requestHeaders["user-agent"] ||
					DEFAULT_USER_AGENT;
				await page.setUserAgent(userAgent);
			}

			await page.setExtraHTTPHeaders(requestHeaders);

			for (const queryParameter of queryParameters) {
				url.searchParams.append(queryParameter.name, queryParameter.value);
			}

			const waitUntil = (step.stepOptions.waitUntil ||
				globalOptions.waitUntil) as PuppeteerLifeCycleEvent;
			const timeout = globalOptions.timeout as number;
			response = await page.goto(url.toString(), { waitUntil, timeout });
		} else {
			page = previousPage as Page;
			response = previousResponse;

			if (step.stepOptions.waitUntil)
				await page.waitForNavigation({
					waitUntil: step.stepOptions.waitUntil,
				});
		}

		// time to wait
		if (step.stepOptions.timeToWait || globalOptions.timeToWait)
			await page.waitForTimeout(
				step.stepOptions.timeToWait ?? globalOptions.timeToWait
			);

		// wait for selector
		if (step.stepOptions.waitForSelector || globalOptions.waitForSelector)
			await page.waitForSelector(
				step.stepOptions.waitForSelector ?? globalOptions.waitForSelector,
				{ timeout: 10000 }
			);

		// inject html
		if (step.stepOptions.injectHtml || globalOptions.injectHtml) {
			await page.evaluate(
				async (step: Step, globalOptions: IDataObject) => {
					const img = document.createElement("img");
					img.style.display = "none";
					const div = document.createElement("div");
					const content =
						step.stepOptions.injectHtml ?? globalOptions.injectHtml;
					div.innerHTML = content;
					const promise = new Promise((resolve, reject) => {
						img.onload = resolve;
						img.onerror = reject;
					});
					document.body.appendChild(div);
					document.body.appendChild(img);
					img.src =
						"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=";
					await promise;
				},
				step as any,
				globalOptions as any
			);
		}

		// inject css
		if (step.stepOptions.injectCss || globalOptions.injectCss) {
			await page.evaluate(
				async (step: Step, globalOptions: IDataObject) => {
					const style = document.createElement("style");
					const content = step.stepOptions.injectCss ?? globalOptions.injectCss;
					style.appendChild(document.createTextNode(content));
					const promise = new Promise((resolve, reject) => {
						style.onload = resolve;
						style.onerror = reject;
					});
					document.head.appendChild(style);
					await promise;
				},
				step as any,
				globalOptions as any
			);
		}

		// inject js
		if (step.stepOptions.injectJs || globalOptions.injectJs) {
			await page.evaluate(
				async (step: Step, globalOptions: IDataObject) => {
					const script = document.createElement("script");
					const content = step.stepOptions.injectJs ?? globalOptions.injectJs;
					script.appendChild(document.createTextNode(content));
					const promise = new Promise((resolve, reject) => {
						script.onload = resolve;
						script.onerror = reject;
					});
					document.head.appendChild(script);
					await promise;
				},
				step as any,
				globalOptions as any
			);
		}

		// interact
		if (step.interactions.parameter) {
			for (const p of step.interactions.parameter) {
				if (p.value) {
					// fill input
					await page.waitForSelector(p.selector, {
						timeout: 10000,
					});
					await page.focus(p.selector);
					await page.keyboard.type(p.value, { delay: 100 });
				} else {
					// click element
					await page.waitForSelector(p.selector, {
						timeout: 10000,
					});
					const promises: Promise<void | HTTPResponse | null>[] = [
						page.evaluate((selector: string) => {
							const elm: any = document.querySelector(selector);
							elm.click();
						}, p.selector),
					];
					if (p.waitForNavigation) {
						promises.push(
							page.waitForNavigation({
								waitUntil: ["load", "networkidle2"],
								timeout: 10000,
							})
						);
					}
					await Promise.all(promises);
				}
			}
		}

		const headers = await response.headers();
		const statusCode = response.status();
		let returnItem: {
			binary?: { [key: string]: IBinaryData };
			json: {
				step: number;
				headers: object;
				statusCode: number;
				pageContent?: any;
			};
		};

		if (statusCode !== 200) {
			if (continueOnFail !== true) {
				returnItem = {
					json: {
						step: i + 1,
						headers,
						statusCode,
					},
				};
				if (step.output.getPageContent) {
					const content = await pageContent(step.output.getPageContent, page);
					returnItem.json["pageContent"] = content;
				}
			} else {
				throw new Error(`Request failed with status code ${statusCode}`);
			}
		} else {
			returnItem = {
				json: {
					step: i + 1,
					headers,
					statusCode,
				},
			};
			if (step.output.getPageContent) {
				const content = await pageContent(step.output.getPageContent, page);
				returnItem.json["pageContent"] = content;
			}
			// } else if (step.output.getScreenshot) {
			// 	const dataPropertyName = step.output.getScreenshot.dataPropertyName;
			// 	const type = step.output.getScreenshot.imageType;
			// 	const fullPage = step.output.getScreenshot.fullPage;
			// 	const cssSelector = step.output.getScreenshot.cssSelector;
			// 	const screenshotOptions: ScreenshotOptions = {
			// 		type,
			// 		fullPage,
			// 	};

			// 	if (type !== "png") {
			// 		const quality = step.output.getScreenshot.quality;
			// 		screenshotOptions.quality = quality;
			// 	}

			// 	let screenshot;
			// 	if (cssSelector) {
			// 		await page.waitForSelector(cssSelector);
			// 		const element = await page.$(cssSelector);
			// 		if (element) {
			// 			screenshot = (await element.screenshot({
			// 				...screenshotOptions,
			// 				fullPage: false,
			// 			})) as Buffer;
			// 		}
			// 	} else {
			// 		screenshot = (await page.screenshot(screenshotOptions)) as Buffer;
			// 	}

			// 	if (screenshot) {
			// 		const binaryData = await this.helpers.prepareBinaryData(
			// 			screenshot,
			// 			undefined,
			// 			`image/${type}`
			// 		);
			// 		returnItem = {
			// 			binary: { [dataPropertyName]: binaryData },
			// 			json: {
			// 				step: i + 1,
			// 				headers,
			// 				statusCode,
			// 			},
			// 		};
			// 	}
			// } else if (step.output.getPDF) {
			// 	const dataPropertyName = step.output.getPDF.dataPropertyName;
			// 	const pageRanges = step.output.getPDF.pageRanges;
			// 	const displayHeaderFooter = step.output.getPDF.displayHeaderFooter;
			// 	const omitBackground = step.output.getPDF.omitBackground;
			// 	const printBackground = step.output.getPDF.printBackground;
			// 	const landscape = step.output.getPDF.landscape;
			// 	const preferCSSPageSize = step.output.getPDF.preferCSSPageSize;
			// 	const scale = step.output.getPDF.scale;
			// 	const margin = step.output.getPDF.margin;

			// 	let headerTemplate;
			// 	let footerTemplate;
			// 	let height;
			// 	let width;
			// 	let format;

			// 	if (displayHeaderFooter === true) {
			// 		headerTemplate = step.output.getPDF.headerTemplate;
			// 		footerTemplate = step.output.getPDF.footerTemplate;
			// 	}

			// 	if (preferCSSPageSize !== true) {
			// 		height = step.output.getPDF.height;
			// 		width = step.output.getPDF.width;

			// 		if (!height || !width) {
			// 			format = step.output.getPDF.format;
			// 		}
			// 	}

			// 	const pdfOptions: PDFOptions = {
			// 		format,
			// 		displayHeaderFooter,
			// 		omitBackground,
			// 		printBackground,
			// 		landscape,
			// 		headerTemplate,
			// 		footerTemplate,
			// 		preferCSSPageSize,
			// 		scale,
			// 		height,
			// 		width,
			// 		pageRanges,
			// 		margin,
			// 	};

			// 	const pdf = (await page.pdf(pdfOptions)) as Buffer;
			// 	if (pdf) {
			// 		const binaryData = await this.helpers.prepareBinaryData(
			// 			pdf,
			// 			undefined,
			// 			"application/pdf"
			// 		);
			// 		returnItem = {
			// 			binary: { [dataPropertyName]: binaryData },
			// 			json: {
			// 				step: i + 1,
			// 				headers,
			// 				statusCode,
			// 			},
			// 		};
			// 	}
			// }
		}

		if (!steps[i + 1] || steps[i + 1].url) await page.close();

		if (returnItem) {
			// @ts-ignore
			returnData.push(returnItem);
		}

		i++;
		if (steps[i]) await runStep(steps[i], page, response);
	};

	if (steps.length) await runStep(steps[0]);
	return returnData;
}
