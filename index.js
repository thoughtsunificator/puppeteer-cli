#!/usr/bin/env node

const puppeteer = require('puppeteer');
const parseUrl = require('url-parse');
const fileUrl = require('file-url');
const isUrl = require('is-url');
const fs = require('fs');

// common options for both print and screenshot commands
const commonOptions = {
		'sandbox': {
				boolean: true,
				default: true
		},
		'timeout': {
				default: 30 * 1000,
				number: true,
		},
		'wait-until': {
				string: true,
				default: 'load'
		},
		'cookie': {
				describe: 'Set a cookie in the form "key:value". May be repeated for multiple cookies.',
				type: 'string'
		}
};

const argv = require('yargs')
		.command({
				command: 'print <url> [output]',
				desc: 'Print an HTML file or URL to PDF',
				builder: {
						...commonOptions,
						'emulate-media': {
								string: true,
								default: '',
								description: 'Set "screen" to get screen design of website'
						},
						'inject-js': {
								string: true,
								default: ''
						},
						'scale': {
								number: true,
								default: 1
						},
						'background': {
								boolean: true,
								default: true
						},
						'margin-top': {
								default: '6.25mm'
						},
						'margin-right': {
								default: '6.25mm'
						},
						'margin-bottom': {
								default: '14.11mm'
						},
						'margin-left': {
								default: '6.25mm'
						},
						'format': {
								default: 'Letter',
								description: 'Set "auto", to create custom format based on website height.'
						},
						'landscape': {
								boolean: true,
								default: false
						},
						'display-header-footer': {
								boolean: true,
								default: false
						},
						'header-template': {
								string: true,
								default: ''
						},
						'footer-template': {
								string: true,
								default: ''
						}
				},
				handler: async argv => {
						try {
								await print(argv);
						} catch (err) {
								console.error('Failed to generate pdf:', err);
								process.exit(1);
						}
				}
		}).command({
				command: 'screenshot <url> [output]',
				desc: 'Take screenshot of an HTML file or URL to PNG',
				builder: {
						...commonOptions,
						'full-page': {
								boolean: true,
								default: true
						},
						'omit-background': {
								boolean: true,
								default: false
						},
						'viewport': {
								describe: 'Set viewport to a given size, e.g. 800x600',
								type: 'string'
						}
				},
				handler: async argv => {
						try {
								await screenshot(argv);
						} catch (err) {
								console.error('Failed to take screenshot:', err);
								process.exit(1);
						}
				}
		})
		.demandCommand()
		.help()
		.argv;

async function print(argv) {
		const browser = await puppeteer.launch(buildLaunchOptions(argv));
		const page = await browser.newPage();
		page.setJavaScriptEnabled(false)
		const url = isUrl(argv.url) ? parseUrl(argv.url).toString() : fileUrl(argv.url);

		if (argv.cookie) {
				console.error(`Setting cookies`);
				await page.setCookie(...buildCookies(argv));
		}

		console.error(`Loading ${url}`);
		await page.goto(url, buildNavigationOptions(argv));

		console.error(`Writing ${argv.output || 'STDOUT'}`);

		let height, width;
		if (argv.format == 'auto') {
				height = (await page.evaluate(
						'Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.clientHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight)'));
				width = '1366';
		}

		if (argv.injectJs) {
			const { scriptBefore, scriptAfter } = await page.evaluate(() => {
				return {
					scriptBefore:  document.querySelector("script#before") ? document.querySelector("script#before").textContent : "",
					scriptAfter:  document.querySelector("script#after") ? document.querySelector("script#after").textContent : ""
				}
			});
			await page.evaluate(`${scriptBefore};${argv.injectJs};${scriptAfter}`);
		}

		if (argv.emulateMedia) {
				await page.emulateMedia(argv.emulateMedia);
		}
		const buffer = await page.pdf({
				path: argv.output || null,
				format: argv.format == 'auto' ? undefined : argv.format,
				width, height,
				scale: argv.scale,
				landscape: argv.landscape,
				printBackground: argv.background,
				margin: {
						top: argv.marginTop,
						right: argv.marginRight,
						bottom: argv.marginBottom,
						left: argv.marginLeft
				},
				displayHeaderFooter: argv.displayHeaderFooter,
				headerTemplate: argv.headerTemplate,
				footerTemplate: argv.footerTemplate
		});

		if (!argv.output) {
				await process.stdout.write(buffer);
		}

		console.error('Done');
		await browser.close();
}

async function screenshot(argv) {
		const browser = await puppeteer.launch(buildLaunchOptions(argv));
		const page = await browser.newPage();
		const url = isUrl(argv.url) ? parseUrl(argv.url).toString() : fileUrl(argv.url);

		if (argv.viewport) {
				const formatMatch = argv.viewport.match(/^(?<width>\d+)[xX](?<height>\d+)$/);

				if (!formatMatch) {
						console.error('Option --viewport must be in the format ###x### e.g. 800x600');
						process.exit(1);
				}

				const { width, height } = formatMatch.groups;
				console.error(`Setting viewport to ${width}x${height}`);
				await page.setViewport({
						width: parseInt(width),
						height: parseInt(height)
				});
		}

		if (argv.cookie) {
				console.error(`Setting cookies`);
				await page.setCookie(...buildCookies(argv));
		}

		console.error(`Loading ${url}`);
		await page.goto(url, buildNavigationOptions(argv));

		console.error(`Writing ${argv.output || 'STDOUT'}`);
		const buffer = await page.screenshot({
				path: argv.output || null,
				fullPage: argv.fullPage,
				omitBackground: argv.omitBackground
		});

		if (!argv.output) {
				await process.stdout.write(buffer);
		}

		console.error('Done');
		await browser.close();
}

function buildLaunchOptions({ sandbox }) {
		const args = [];

		if (sandbox === false) {
				args.push('--no-sandbox', '--disable-setuid-sandbox');
		}

		return {
				args
		};
}

function buildNavigationOptions({ timeout, waitUntil }) {
		return {
				timeout,
				waitUntil
		};
}

function buildCookies({ url, cookie }) {
		return [...cookie].map(cookieString => {
				const delimiterOffset = cookieString.indexOf(':');
				if (delimiterOffset == -1) {
						throw new Error('cookie must contain : delimiter');
				}

				const name = cookieString.substr(0, delimiterOffset);
				const value = cookieString.substr(delimiterOffset + 1);

				return { name, value, url };
		});
}
