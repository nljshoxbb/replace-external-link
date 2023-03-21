import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { globSync } from "glob";
import { downloadFile, readFile, writeFile } from "./utils";
import * as chalk from "chalk";
import { CONFIG_FILE_NAME } from "./constant";
import type { AxiosInstance } from "axios";
import * as puppeteer from "puppeteer";

const config = require("./config");
const pLimit = require("p-limit");

type TLinkType = "relative" | "absolute";

class Generator {
  hostname: string;
  port: string;
  protocol: string;
  extensions: string[];
  downloadDir: string;
  /** 下载后的文件路径 */
  downloadDirPath: string;
  /** 替换后的文件路径 */
  replacedDirPath: string;
  /** 替换后输出的文件夹 */
  replacedDir: string;
  /** 需要替换源的文件夹 */
  sourceDir: string;
  /** 下载资源地址集合 */
  downloadUrls: string[];
  /** 替换路径 */
  linkType: TLinkType;
  indexHtml: string;
  constructor() {
    this.getConfigFile();
    this.replacedDirPath = path.resolve(this.replacedDir);
    this.downloadDirPath =
      path.join(this.replacedDirPath, this.downloadDir) || path.join(process.cwd(), this.downloadDir);
    this.downloadUrls = [];
    this.init();
  }

  setDefaultConfig = (params) => {
    this.hostname = params.hostname;
    this.port = params.port;
    this.protocol = params.protocol;
    this.downloadDir = params.downloadDir;
    this.sourceDir = params.sourceDir;
    this.replacedDir = params.replacedDir;
    this.extensions = params.extensions;
    this.linkType = params.linkType;
    this.indexHtml = params.indexHtml;
  };

  getConfigFile = async () => {
    const configFilePath = path.join(process.cwd(), CONFIG_FILE_NAME);
    if (fs.existsSync(configFilePath)) {
      const data = require(configFilePath);
      this.setDefaultConfig(data);
    } else {
      this.setDefaultConfig(config);
    }
  };

  async init() {
    fs.removeSync(this.downloadDirPath);
    if (this.sourceDir !== this.replacedDir) {
      fs.removeSync(this.replacedDirPath);
    }

    await this.startBrowser();
    const files = this.scanDir();

    await this.processFiles(files);
    await this.fetchStaticResources(this.downloadUrls);
  }

  waitTillHTMLRendered = async (page, timeout = 30000) => {
    const checkDurationMsecs = 5000;
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;

    while (checkCounts++ <= maxChecks) {
      let html = await page.content();
      let currentHTMLSize = html.length;

      let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length);

      console.log("last: ", lastHTMLSize, " <> curr: ", currentHTMLSize, " body html size: ", bodyHTMLSize);

      if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize) countStableSizeIterations++;
      else countStableSizeIterations = 0; //reset the counter

      if (countStableSizeIterations >= minStableSizeIterations) {
        console.log("Page rendered fully..");
        break;
      }

      lastHTMLSize = currentHTMLSize;
      await page.waitForTimeout(checkDurationMsecs);
    }
  };

  startBrowser = async () => {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1600, height: 800 },
      devtools: true,
    });
    const page = await browser.newPage();
    // await page.goto("file://C:/Users/compoundeye/test.html");
    // D:\lowcode-demo-main\demo-general\build\index.html
    // console.log(path.resolve(this.indexHtml));

    var contentHtml = fs.readFileSync(path.resolve(this.indexHtml), "utf8");
    // await page.goto(`file://${path.normalize(path.resolve(this.indexHtml))}`);
    // page.on("response", (response) => {
    //   response.text().then(function (textBody) {
    //     //this returns promise that ajax request body was received
    //     console.log(response.url());
    //     // console.log(textBody);
    //   });
    // });
    // await page.setRequestInterception(true);
    // page.on("request", (interceptedRequest) => {
    //   console.log(interceptedRequest.url());
    //   // if (interceptedRequest.isInterceptResolutionHandled()) return;
    //   // if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg"))
    //   //   interceptedRequest.abort();
    //   interceptedRequest.continue();
    // });
    await page.setRequestInterception(true); //开启请求拦截
    var totalRequests = 0;
    page.on("request", (request) => {
      const type = request.resourceType();
      totalRequests += 1;
      request.continue();
    });
    await page.setContent(contentHtml, {
      // waitUntil: "networkidle0",
      // timeout: 5000,
      // waitUntil: "networkidle2",
    });
    await page.evaluateOnNewDocument((token) => {
      localStorage.clear();
      localStorage.setItem("token", token);
    }, "eyJh...9_8cw");
    await page.setContent(contentHtml, {
      // waitUntil: "networkidle0",
      // timeout: 5000,
      // waitUntil: "networkidle2",
    });
    console.log(totalRequests);
    // await page.setRequestInterception(true);
    // let monitorRequests = new PuppeteerNetworkMonitor(page);

    // await this.waitTillHTMLRendered(page);
    // // await page.goto("http://www.baidu.com/");
    // await page.screenshot({ path: "index.png" });
    // await page.pdf({ path: "index.pdf" });
    // await browser.close();

    // await page.pdf({
    //   path: "test.pdf",
    //   format: "A4",
    //   margin: {
    //     top: "20px",
    //     left: "20px",
    //     right: "20px",
    //     bottom: "20px",
    //   },
    // });
    // await browser.close();
  };

  processFiles = async (files) => {
    const sourceDir = path.basename(path.resolve(this.sourceDir));
    const replacedDir = path.basename(path.resolve(this.replacedDir));

    for (const filePath of [...files]) {
      const content = await readFile(filePath);
      const replacedContent = this.replaceContent(content, filePath);
      let REGEX,
        REPLACE = "";
      // 需兼容 win linux 路径问题
      const platform = os.platform();
      if (platform === "darwin") {
        REGEX = new RegExp(`/${sourceDir}`, "g");
        REPLACE = `/${replacedDir}`;
      } else if (platform === "win32") {
        REGEX = new RegExp(`\\\\${sourceDir}`, "g");
        REPLACE = `\\${replacedDir}`;
      }
      const replacedPath = filePath.replace(REGEX, REPLACE);
      const extname = path.extname(replacedPath);

      if (!extname) {
        fs.ensureDirSync(replacedPath);
      } else {
        await writeFile(replacedPath, replacedContent);
      }
    }
    return Promise.resolve();
  };

  scanDir = (): string[] => {
    /** 扫描当前文件 */
    const results = globSync(`${this.sourceDir}/**`, {
      stat: true,
      withFileTypes: true,
      ignore: ["node_modules/**", ".lock"],
    });
    const periodResults = globSync("**/.**/**", {
      stat: true,
      withFileTypes: true,
      ignore: ["node_modules/**", ".lock"],
    });
    const files = results.map((path) => path.fullpath());
    const periodFiles = periodResults.map((path) => path.fullpath());
    return [...files];
  };

  fetchStaticResources = async (urls: string[]) => {
    let success = 0;
    let fail = 0;
    const limit = pLimit(10);
    const input: Promise<AxiosInstance>[] = [];
    const urlSet = new Set<string>(urls);

    for (const oldUrl of urlSet) {
      const url = this.removeQuotes(oldUrl);
      const parsed = new URL(url);
      const index = parsed.pathname.lastIndexOf("/");
      const pathstr = index === 0 ? "" : parsed.pathname.substring(0, index + 1);
      const downloadPath = path.join(this.downloadDirPath, pathstr);
      fs.ensureDirSync(downloadPath);
      const destPath = path.join(downloadPath, path.basename(parsed.pathname));
      input.push(limit(() => downloadFile(url, destPath)));
    }
    try {
      const result = await Promise.allSettled(input);
      result.forEach((i) => {
        if (i.status === "fulfilled") {
          success += 1;
        } else {
          /** 失败时删除文件 */
          // @ts-ignore
          if (i.reason.outputPath) {
            // @ts-ignore
            fs.unlinkSync(i.reason.outputPath);
          }
          fail += 1;
        }
      });
    } catch (error) {
      console.log(error, "error");
    }
    const structDatas = [
      { request: "total", sum: urlSet.size },
      { request: "success", sum: success },
      { request: "fail", sum: fail },
    ];
    const msgs = [
      "链接替换完毕!",
      `replacedDirPath: ${this.replacedDirPath}`,
      `downloadDirPath: ${this.downloadDirPath}`,
    ];
    msgs.forEach((i) => {
      console.log(`\n${chalk.blue(i)}`);
    });
    console.table(structDatas);
    return Promise.resolve();
  };

  replaceContent = (content: string, filePath: string) => {
    let newContent = "";
    const ALL_SCRIPT_REGEX = /(<script[\s\S]*?>)[\s\S]*?<\/script>/gi;
    const SCRIPT_TAG_REGEX = /<(script)\s+((?!type=('|")text\/ng-template\3).)*?>.*?<\/\1>/is;
    const SCRIPT_SRC_REGEX = /.*\ssrc=('|")?([^>'"\s]+)/;
    // 取出静态文件
    const HTTP_REGEX = /(http(s?):)\/\/(\S+?)\/(\S+?\.(?:jpe?g|png|gif|js|css|json))/g;

    // const HTTP_REGEX_EXT =
    //   this.extensions.length > 0
    //     ? new RegExp(`(http(s?):)\/\/(\\S+?)\/(\\S+?\\.(?:${this.extensions.map((i) => i).join("|")}))`, "g")
    //     : HTTP_REGEX;
    // const HTTP_REGEX_EXT = /^(http|https):\/\/[^\s$.?#].[^\s]*\.(jpe?g|png|gif|js|css|json)$/g;
    const HTTP_REGEX_EXT = /"(https?:\/\/[^\s"]+?\.(?:css|js|png))"|'(https?:\/\/[^\s']+\.(?:css|js|png))'/gi;

    if (!content || content.length === 0) {
      return newContent;
    }

    if (path.extname(filePath) === ".html") {
      // 处理html资源中的外链
      newContent = content.replace(ALL_SCRIPT_REGEX, (match, scriptTag) => {
        if (SCRIPT_TAG_REGEX.test(match) && scriptTag.match(SCRIPT_SRC_REGEX)) {
          const matchedScriptSrcMatch = scriptTag.match(SCRIPT_SRC_REGEX);
          let matchedScriptSrc = matchedScriptSrcMatch && matchedScriptSrcMatch[2];
          if (matchedScriptSrc.includes("http")) {
            if (matchedScriptSrc.includes("??")) {
              const [requestPrefix, collectionStr] = matchedScriptSrc.split("??");
              /** 阿里静态资源聚合请求拆分
               *  例如 https://g.alicdn.com/platform/c/??react15-polyfill/0.0.1/dist/index.js,lodash/4.6.1/lodash.min.js
               */
              let sources = collectionStr.split(",");
              let newScriptTag = sources.map((k) => {
                const scriptSrc = `${requestPrefix}${k}`;

                if (HTTP_REGEX_EXT.test(scriptSrc)) {
                  this.downloadUrls.push(scriptSrc);
                }
                // 拆为多个script标签进行加载
                return `\n    <script src="${scriptSrc}"></script>`;
              });
              return newScriptTag;
            } else if (HTTP_REGEX_EXT.test(matchedScriptSrc)) {
              this.downloadUrls.push(matchedScriptSrc);
            }
          }
        }
        return match;
      });
      // console.log(newContent);

      newContent = newContent.replace(HTTP_REGEX_EXT, (match) => {
        this.downloadUrls.push(match);
        return this.replaceSource(match);
      });
    } else {
      newContent = content.replace(HTTP_REGEX_EXT, (match) => {
        this.downloadUrls.push(match);
        return this.replaceSource(match, true);
      });
    }
    return newContent;
  };

  // 清除单双引号
  removeQuotes = (url) => {
    return url.replace(/['"]/g, "");
  };

  /** 替换源 */
  replaceSource = (oldUrl: string, isJSFile: boolean = false) => {
    const url = new URL(this.removeQuotes(oldUrl));
    const downloadDirName = path.basename(path.resolve(this.downloadDir));
    if (this.linkType === "absolute") {
      url.hostname = this.hostname;
      url.port = this.port;
      url.pathname = `/${downloadDirName}${url.pathname}`;
      url.protocol = this.protocol;
      if (isJSFile) {
        return `"${url.href}"`;
      }
      return url.href;
    } else if (this.linkType === "relative") {
      const href = `./${downloadDirName}${url.pathname}`;
      return href;
    }
  };
}

export default Generator;
