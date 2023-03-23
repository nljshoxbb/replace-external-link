import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { globSync } from "glob";
import { downloadFile, formatBytes, getFolderSizeByGlob, readFile, writeFile } from "./utils";
import * as chalk from "chalk";
import { CONFIG_FILE_NAME, MAP_FILE_NAME } from "./constant";
import * as puppeteer from "puppeteer";
import * as cliProgress from "cli-progress";
import startServer from "./server";

const config = require("./config");
const pLimit = require("p-limit");

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);

type TLinkType = "relative" | "absolute";

type TDownloadResult = {
  success: number;
  fail: number;
};

type TServer = {
  host: string;
  port: number;
};

type TFileInfo = {
  origin: string;
  replace: string;
};

class Generator {
  hostname: string;
  port: string;
  protocol: string;
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
  /** 动态加载的url，无法通过扫描的代码中匹配到http请求地址 */
  dynamicallyLoadUrls: string[];
  /** 替换路径 */
  linkType: TLinkType;
  downloadResult: TDownloadResult;
  /** 已下载url */
  downloadedList: string[];
  /** 已替换的文件路径 */
  replacedFileList: string[];
  /** 打印log */
  printLog: boolean;
  /** puppeteer访问服务 */
  server: TServer;
  /** 是否生成映射文件 */
  mappingFile: boolean;
  dev: boolean;
  detail: Record<string, TFileInfo[]>;
  constructor(printLog, dev) {
    console.time("time");
    this.printLog = printLog;
    this.dev = dev;
    this.getConfigFile();

    this.replacedDirPath = path.resolve(this.replacedDir);
    this.downloadDirPath = path.join(process.cwd(), this.downloadDir);
    this.downloadUrls = [];
    this.dynamicallyLoadUrls = [];
    this.downloadResult = {
      success: 0,
      fail: 0,
    };
    this.downloadedList = [];
    this.replacedFileList = [];
    this.server = {
      host: "127.0.0.1",
      port: 8120,
    };
    this.linkType = "absolute";
    this.detail = {};
    this.init();
  }

  setDefaultConfig = (params) => {
    this.hostname = params.hostname;
    this.port = params.port;
    this.protocol = params.protocol;
    this.downloadDir = params.downloadDir;
    this.sourceDir = params.sourceDir;
    this.replacedDir = params.replacedDir;
    this.linkType = params.linkType;
    this.mappingFile = params.mappingFile;
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
    this.removeDir();
    await this.getData(this.sourceDir);
    await this.checkHttpMissingLinks();
    this.mappingFile && this.generateMap();
    this.displayStatistics();
  }

  removeDir = () => {
    fs.removeSync(this.downloadDirPath);
    if (this.sourceDir !== this.replacedDir) {
      fs.removeSync(this.replacedDirPath);
    }
  };

  async getData(dir) {
    try {
      const newFiles = this.scanDir(dir);
      await this.replaceFiles(newFiles, dir === this.downloadDir ? false : true);
      const links = this.downloadUrls.filter((x) => !this.downloadedList.includes(x));

      if (links.length === 0) {
        return;
      }
      await this.fetchStaticResources(links);
      await this.getData(this.downloadDir);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject();
    }
  }

  scanDir = (dirPath): string[] => {
    console.log(chalk.cyan(`开始扫描${path.resolve(dirPath)}`));
    /** 扫描当前文件 */
    const results = globSync(`${dirPath}/**`, {
      stat: true,
      withFileTypes: true,
      ignore: ["node_modules/**", ".lock"],
    });

    const files = results.map((path) => path.fullpath());
    return files;
  };

  replaceFiles = async (files, replace: boolean = true) => {
    console.log(chalk.cyan(`匹配替换链接路径 `));
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
      this.replacedFileList.push(filePath);
      if (!extname) {
        fs.ensureDirSync(replacedPath);
      } else {
        if (replace) {
          await writeFile(replacedPath, replacedContent);
        }
      }
    }
    return Promise.resolve();
  };

  replaceContent = (content: string, filePath: string) => {
    let newContent = "";
    const ALL_SCRIPT_REGEX = /(<script[\s\S]*?>)[\s\S]*?<\/script>/gi;
    const SCRIPT_TAG_REGEX = /<(script)\s+((?!type=('|")text\/ng-template\3).)*?>.*?<\/\1>/is;
    const SCRIPT_SRC_REGEX = /.*\ssrc=('|")?([^>'"\s]+)/;
    /**
     *  'url:"http://123.com"'
     */
    const HTTP_REGEX_EXT = /"(https?:\/\/[^\s"]+?\.(?:css|js|png|json))"|'(https?:\/\/[^\s']+\.(?:css|js|png|json))'/gi;
    /**
     * url(// ... .woff2?t=1638951976966)
     * url(http:// ....)
     */
    const HTTP_REGEX_CSS_URL = /url(\(\/\/[^\s"]+?\.?\))|url(\(https?:\/\/[^\s"]+?\.?\))/gi;

    if (!content || content.length === 0) {
      return newContent;
    }

    const fileType = path.extname(filePath);

    if (fileType === ".html" || fileType === ".ejs") {
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
                  this.addDownloadUrls(scriptSrc);
                }
                // 拆为多个script标签进行加载
                return `\n    <script src="${scriptSrc}"></script>`;
              });
              return newScriptTag;
            } else if (HTTP_REGEX_EXT.test(matchedScriptSrc)) {
              this.addDownloadUrls(matchedScriptSrc);
            }
          }
        }
        return match;
      });

      newContent = newContent.replace(HTTP_REGEX_EXT, (match) => {
        this.addDownloadUrls(match);
        const replaceUrl = this.replaceOrigin(this.removeQuotes(match), filePath, true);
        return replaceUrl;
      });
    } else if (fileType === ".css") {
      newContent = content.replace(HTTP_REGEX_CSS_URL, (match) => {
        const str = match.match(/\(([^)]+)\)/);
        const url = str[1].includes("http") ? str[1] : `http:${str[1]}`;
        this.addDownloadUrls(url);
        const replaceUrl = this.replaceOrigin(url, filePath);
        return `(${replaceUrl})`;
      });
    } else {
      newContent = content.replace(HTTP_REGEX_EXT, (match) => {
        this.addDownloadUrls(match);
        return this.replaceOrigin(this.removeQuotes(match), filePath, true);
      });
    }
    return newContent;
  };

  fetchStaticResources = async (urls: string[]) => {
    console.log(chalk.cyan(`开始下载文件到${this.downloadDirPath}`));

    try {
      const limit = pLimit(10);
      const input: Promise<any>[] = [];
      progressBar.start(urls.length, 0);
      const currentRequests: string[] = [];

      for (const [idx, url] of urls.entries()) {
        const parsed = new URL(url);
        const index = parsed.pathname.lastIndexOf("/");
        const pathstr = index === 0 ? "" : parsed.pathname.substring(0, index + 1);
        const downloadPath = path.join(this.downloadDirPath, pathstr);
        fs.ensureDirSync(downloadPath);
        const destPath = path.join(downloadPath, path.basename(parsed.pathname));
        input.push(
          limit(() => {
            return new Promise(async (resolve, reject) => {
              this.downloadedList.push(url);
              try {
                currentRequests.push(url);
                await downloadFile(url, destPath, this.printLog);
                resolve(true);
                progressBar.increment();
                currentRequests.splice(currentRequests.indexOf(url), 1);
              } catch (error) {
                reject(error);
                progressBar.increment();
                currentRequests.splice(currentRequests.indexOf(url), 1);
              }
            });
          })
        );
      }
      const result = await Promise.allSettled(input);

      result.forEach((i) => {
        if (i.status === "fulfilled") {
          this.downloadResult.success += 1;
        } else {
          /** 失败时删除文件 */
          // @ts-ignore
          if (i.reason.outputPath) {
            // @ts-ignore
            // fs.unlink(i.reason.outputPath, (err) => {
            //   if (err) {
            //     console.log(err);
            //   }
            // });
          }
          this.downloadResult.fail += 1;
        }
      });
      progressBar.stop();
      return Promise.resolve();
    } catch (error) {
      console.log(error);
      return Promise.reject();
    }
  };

  addDownloadUrls = (url: string) => {
    const item = this.removeQuotes(url);
    if (!this.downloadUrls.includes(item)) {
      this.downloadUrls.push(item);
    }
  };

  removeDownloadUrls = (url: string) => {
    const idx = this.downloadUrls.indexOf(url);
    this.downloadUrls = this.downloadUrls.slice(idx, 1);
  };

  removeQuotes = (url) => {
    return url.replace(/['"]/g, "");
  };

  /** 替换源 */
  replaceOrigin = (originUrl: string, filePath, dynamic: boolean = false) => {
    const url = new URL(originUrl);
    const downloadDirName = path.basename(path.resolve(this.downloadDir));
    let replaceUrl = "";
    if (this.linkType === "absolute") {
      url.hostname = this.hostname;
      url.port = this.port;
      url.pathname = `/${downloadDirName}${url.pathname}`;
      url.protocol = this.protocol;
      if (dynamic) {
        replaceUrl = `"${url.href}"`;
      } else {
        replaceUrl = url.href;
      }
    } else if (this.linkType === "relative") {
      replaceUrl = `./${downloadDirName}${url.pathname}`;
    }
    const relativePath = filePath.split(process.cwd())[1];
    if (this.detail[relativePath]) {
      this.detail[relativePath].push({ origin: originUrl, replace: this.removeQuotes(replaceUrl) });
    } else {
      this.detail[relativePath] = [{ origin: originUrl, replace: this.removeQuotes(replaceUrl) }];
    }
    return replaceUrl;
  };

  /** 检查http替换遗漏链接,主要为js中动态加载js链接 */
  checkHttpMissingLinks = async () => {
    console.log(chalk.cyan("检查链接是否下载完毕..."));
    /** 启动http服务提供给puppeteer打开； pupperter 通过 file:// 打开时无法访问localstorge导致工程没启动 */
    const server = startServer(this.sourceDir, this.server.port);
    const browser = await puppeteer.launch({
      headless: !this.dev,
      devtools: true,
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true); //开启请求拦截
    page.on("request", (interceptedRequest) => {
      const url = interceptedRequest.url();
      if (!this.downloadUrls.includes(url)) {
        this.printLog && console.log(chalk.cyan(`puppeteer intercepted request ${url}`));
        const urlIns = new URL(url);
        if (urlIns.hostname !== this.server.host) {
          this.dynamicallyLoadUrls.push(url);
        }
      }
      if (interceptedRequest.isInterceptResolutionHandled()) return;
      if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg"))
        interceptedRequest.abort();
      else interceptedRequest.continue();
    });
    const href = `http://${this.server.host}:${this.server.port}`;
    console.log(chalk.cyan(`puppeteer goto ${href}`));
    await page.goto(href);
    await browser.close();
    server.close();

    if (this.dynamicallyLoadUrls.length > 0) {
      await this.fetchStaticResources(this.dynamicallyLoadUrls);
    }
  };

  generateMap = () => {
    const mapPath = path.resolve(MAP_FILE_NAME);
    fs.writeFileSync(path.resolve(MAP_FILE_NAME), JSON.stringify(this.detail, null, 2), "utf-8");
    console.log(chalk.cyan(`生成映射文件成功 ${mapPath}`));
  };

  displayStatistics = () => {
    const { success, fail } = this.downloadResult;
    const structDatas = [
      { request: "all", total: this.downloadResult.fail + this.downloadResult.success },
      { request: "success", total: success },
      { request: "fail", total: fail },
    ];
    const size = getFolderSizeByGlob(this.downloadDirPath, { ignorePattern: [] });

    console.log(`${chalk.cyan("链接替换完成!")}`);
    console.log(`${chalk.yellow("replacedDirPath")}: ${chalk.green(this.replacedDirPath)}`);
    console.log(`${chalk.yellow("downloadDirPath")}: ${chalk.green(`${this.downloadDirPath}`)}`);
    console.log(`${chalk.yellow("downloadSize")}: ${chalk.green(`${formatBytes(size)}`)}`);
    console.log(`${chalk.yellow("replaceOrigin")}: ${chalk.green(`${this.protocol}://${this.hostname}:${this.port}`)}`);
    console.timeEnd("time");
    console.table(structDatas);
  };
}

export default Generator;
