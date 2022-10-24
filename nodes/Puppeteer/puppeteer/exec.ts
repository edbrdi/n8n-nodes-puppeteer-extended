import {
	Page,
	PuppeteerLifeCycleEvent,
	devices,
	HTTPResponse,
	ScreenshotOptions,
	PDFOptions,
} from "puppeteer";
import { IDataObject, IBinaryData } from "n8n-workflow";
import state from "./state";
import { INodeParameters } from "./helpers";

async function pageContent(
	getPageContent: {
		dataPropertyName: string;
		cssSelector: string;
		htmlToJson: boolean;
		innerHtml: boolean;
		selectAll: boolean;
		noAttributes: boolean;
	},
	page: Page
) {
	const {
		dataPropertyName,
		cssSelector,
		htmlToJson: hasHtmlToJson,
		innerHtml: hasInnerHtml,
		selectAll: hasSelectAll,
		noAttributes: hasNoAttributes,
	} = getPageContent;

	return await new Promise(async (resolve, reject) => {
		let content;

		if (hasHtmlToJson) {
			content = await page
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
			content = cssSelector
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

		resolve({ content, dataPropertyName });
	});
}

async function pageScreenshot(options: any, page: Page) {
	const type = options.imageType;
	const fullPage = options.fullPage;
	const cssSelector = options.cssSelector;
	const screenshotOptions: ScreenshotOptions = {
		type,
		fullPage,
	};

	if (type !== "png") {
		const quality = options.quality;
		screenshotOptions.quality = quality;
	}

	let screenshot;
	if (cssSelector) {
		await page.waitForSelector(cssSelector);
		const element = await page.$(cssSelector);
		if (element) {
			screenshot = (await element.screenshot({
				...screenshotOptions,
				fullPage: false,
			})) as Buffer;
		}
	} else {
		screenshot = (await page.screenshot(screenshotOptions)) as Buffer;
	}

	if (screenshot)
		return { [options.dataPropertyName]: { type, data: screenshot } };
	return {};
}

async function pagePDF(options: any, page: Page) {
	const dataPropertyName = options.dataPropertyName;
	const pageRanges = options.pageRanges;
	const displayHeaderFooter = options.displayHeaderFooter;
	const omitBackground = options.omitBackground;
	const printBackground = options.printBackground;
	const landscape = options.landscape;
	const preferCSSPageSize = options.preferCSSPageSize;
	const scale = options.scale;
	const margin = options.margin;

	let headerTemplate;
	let footerTemplate;
	let height;
	let width;
	let format;

	if (displayHeaderFooter === true) {
		headerTemplate = options.headerTemplate;
		footerTemplate = options.footerTemplate;
	}

	if (preferCSSPageSize !== true) {
		height = options.height;
		width = options.width;

		if (!height || !width) {
			format = options.format;
		}
	}

	const pdfOptions: PDFOptions = {
		format,
		displayHeaderFooter,
		omitBackground,
		printBackground,
		landscape,
		headerTemplate,
		footerTemplate,
		preferCSSPageSize,
		scale,
		height,
		width,
		pageRanges,
		margin,
	};

	const pdf = (await page.pdf(pdfOptions)) as Buffer;

	if (pdf) return { [dataPropertyName]: { type: "pdf", data: pdf } };
	return {};
}

const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36";

export default async function (
	nodeParameters: INodeParameters,
	executionId: string,
	continueOnFail: boolean
) {
	const browser = state.executions[executionId].browser;
	if (!browser) return;

	const pageCaching = nodeParameters.globalOptions.pageCaching !== false;

	const run = async (nodeParameters: INodeParameters) => {
		const urlString = nodeParameters.url;

		let page: Page, response;

		if (urlString) {
			const { parameter: someHeaders = [] } = (nodeParameters.globalOptions
				.headers || {}) as any;
			const queryParameters = nodeParameters.queryParameters?.parameter ?? [];
			const requestHeaders = someHeaders.reduce((acc: any, cur: any) => {
				acc[cur.name] = cur.value;
				return acc;
			}, {});
			const device = nodeParameters.globalOptions.device as string;

			const url = new URL(urlString);
			page = await browser.newPage();

			if (nodeParameters.globalOptions.viewport) {
				const viewport = nodeParameters.globalOptions.viewport as {
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

			const waitUntil = (nodeParameters.nodeOptions.waitUntil ||
				nodeParameters.globalOptions.waitUntil) as PuppeteerLifeCycleEvent;
			const timeout = nodeParameters.globalOptions.timeout as number;
			response = await page.goto(url.toString(), { waitUntil, timeout });

			state.executions[executionId].previousPage = page;
			state.executions[executionId].previousResponse = response;
		} else if (
			state.executions[executionId].previousPage &&
			state.executions[executionId].previousResponse
		) {
			page = state.executions[executionId].previousPage as Page;
			response = state.executions[executionId].previousResponse;

			if (nodeParameters.nodeOptions.waitUntil)
				await page.waitForNavigation({
					waitUntil: nodeParameters.nodeOptions.waitUntil,
				});
		} else {
			throw new Error("No previous page or response found");
		}

		// time to wait
		if (
			nodeParameters.nodeOptions.timeToWait ||
			nodeParameters.globalOptions.timeToWait
		)
			await page.waitForTimeout(
				nodeParameters.nodeOptions.timeToWait ??
					nodeParameters.globalOptions.timeToWait
			);

		// wait for selector
		if (
			nodeParameters.nodeOptions.waitForSelector ||
			nodeParameters.globalOptions.waitForSelector
		)
			await page.waitForSelector(
				nodeParameters.nodeOptions.waitForSelector ??
					nodeParameters.globalOptions.waitForSelector,
				{ timeout: 10000 }
			);

		// inject html
		if (
			nodeParameters.nodeOptions.injectHtml ||
			nodeParameters.globalOptions.injectHtml
		) {
			await page.evaluate(
				async (nodeParameters: INodeParameters, globalOptions: IDataObject) => {
					const img = document.createElement("img");
					img.style.display = "none";
					const div = document.createElement("div");
					const content =
						nodeParameters.nodeOptions.injectHtml ??
						nodeParameters.globalOptions.injectHtml;
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
				nodeParameters as any,
				nodeParameters.globalOptions as any
			);
		}

		// inject css
		if (
			nodeParameters.nodeOptions.injectCss ||
			nodeParameters.globalOptions.injectCss
		) {
			await page.evaluate(
				async (nodeParameters: INodeParameters, globalOptions: IDataObject) => {
					const style = document.createElement("style");
					const content =
						nodeParameters.nodeOptions.injectCss ??
						nodeParameters.globalOptions.injectCss;
					style.appendChild(document.createTextNode(content));
					const promise = new Promise((resolve, reject) => {
						style.onload = resolve;
						style.onerror = reject;
					});
					document.head.appendChild(style);
					await promise;
				},
				nodeParameters as any,
				nodeParameters.globalOptions as any
			);
		}

		// inject js
		if (
			nodeParameters.nodeOptions.injectJs ||
			nodeParameters.globalOptions.injectJs
		) {
			await page.evaluate(
				async (nodeParameters: INodeParameters, globalOptions: IDataObject) => {
					const script = document.createElement("script");
					const content =
						nodeParameters.nodeOptions.injectJs ??
						nodeParameters.globalOptions.injectJs;
					script.appendChild(document.createTextNode(content));
					const promise = new Promise((resolve, reject) => {
						script.onload = resolve;
						script.onerror = reject;
					});
					document.head.appendChild(script);
					await promise;
				},
				nodeParameters as any,
				nodeParameters.globalOptions as any
			);
		}

		// interact
		if (nodeParameters.interactions.parameter) {
			for (const p of nodeParameters.interactions.parameter) {
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

		let data: {
			binary?: { [key: string]: IBinaryData };
			json: {
				[key: string]: any;
			};
		} = {
			json: {
				headers,
				statusCode,
			},
		};

		const getAllPageContent = async () => {
			const allPageContent: any[] = [];

			nodeParameters.output.getPageContent.forEach((options: any) => {
				allPageContent.push(pageContent(options, page));
			});

			const resolvedAllPageContent = await Promise.all(allPageContent).catch(
				(e: any) => console.log(e)
			);

			(resolvedAllPageContent ?? []).forEach((pageContent) => {
				data.json[pageContent.dataPropertyName] = pageContent.content;
			});
		};

		if (statusCode !== 200) {
			if (continueOnFail !== true) {
				if (nodeParameters.output.getPageContent) await getAllPageContent();
			} else {
				throw new Error(`Request failed with status code ${statusCode}`);
			}
		} else {
			if (nodeParameters.output.getPageContent) await getAllPageContent();
			if (nodeParameters.output.getScreenshot) {
				const allScreenshot: any[] = [];

				nodeParameters.output.getScreenshot.forEach(async (options: any) => {
					allScreenshot.push(pageScreenshot(options, page));
				});

				const resolvedAllPageScreenshot = await Promise.all(
					allScreenshot
				).catch((e: any) => console.log(e));

				(resolvedAllPageScreenshot ?? []).forEach((pageScreenshot) => {
					if (pageScreenshot) {
						data.binary = {
							...(data.binary ?? {}),
							...pageScreenshot,
						};
					}
				});
			}
			if (nodeParameters.output.getPDF) {
				// puppeteer can't handle multiple pdfs generation at the same time
				for await (const options of nodeParameters.output.getPDF) {
					const pdfBinary = await pagePDF(options, page);
					if (pdfBinary) {
						data.binary = {
							...(data.binary ?? {}),
							...pdfBinary,
						};
					}
				}
			}
		}

		return data;
	};

	return await run(nodeParameters);
}
