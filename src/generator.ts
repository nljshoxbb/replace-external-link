import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { globSync } from "glob";
import { downloadFile, readFile, writeFile } from "./utils";
import * as chalk from "chalk";
import { CONFIG_FILE_NAME } from "./constant";
import type { AxiosInstance } from "axios";
import * as puppeteer from "puppeteer";
import * as child_process from "child_process";
import * as cliProgress from "cli-progress";

const config = require("./config");
const pLimit = require("p-limit");

const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);

type TLinkType = "relative" | "absolute";

type TDownloadResult = {
  success: number;
  fail: number;
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
  downloadLog: boolean;
  constructor(downloadLog) {
    this.downloadLog = downloadLog;
    this.getConfigFile();
    this.replacedDirPath = path.resolve(this.replacedDir);
    this.downloadDirPath =
      path.join(this.replacedDirPath, this.downloadDir) || path.join(process.cwd(), this.downloadDir);
    this.downloadUrls = [];
    this.dynamicallyLoadUrls = [];
    this.downloadResult = {
      success: 0,
      fail: 0,
    };
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
    const files = this.scanDir();
    console.log(chalk.blue("开始处理文件..."));
    await this.processFiles(files);
    await this.fetchStaticResources(this.downloadUrls);
    await this.checkHttpMissingLinks();
    this.displayStatistics();
  }

  /** 检查http替换遗漏链接,主要为js中动态加载js链接 */
  checkHttpMissingLinks = async () => {
    console.log(chalk.blue("检查链接是否下载完毕..."));
    const port = 5730;
    const serverHostname = "127.0.0.1";
    /** 启动http服务提供给puppeteer打开； pupperter 通过 file:// 打开时无法访问localstorge导致工程没启动 */
    const childP = child_process.spawn("http-server", [this.sourceDir, `-p ${port}`], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });
    const browser = await puppeteer.launch({
      headless: false,
      devtools: true,
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true); //开启请求拦截
    page.on("request", (interceptedRequest) => {
      const url = interceptedRequest.url();
      if (!this.downloadUrls.includes(url)) {
        const urlIns = new URL(url);
        if (urlIns.hostname !== serverHostname) {
          this.dynamicallyLoadUrls.push(url);
        }
      }
      if (interceptedRequest.isInterceptResolutionHandled()) return;
      if (interceptedRequest.url().endsWith(".png") || interceptedRequest.url().endsWith(".jpg"))
        interceptedRequest.abort();
      else interceptedRequest.continue();
    });
    await page.goto(`http://${serverHostname}:${port}`);
    await browser.close();

    /** windows kill childprocess */
    // @ts-ignore
    try {
      if (os.platform() === "win32") {
        child_process.exec("taskkill /pid " + childP.pid + " /T /F");
      } else {
        childP.kill();
      }
    } catch (error) {
      console.log(error);
    }

    if (this.dynamicallyLoadUrls.length > 0) {
      await this.fetchStaticResources(this.dynamicallyLoadUrls);
    }
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
    console.log(chalk.blue("开始扫描文件..."));
    /** 扫描当前文件 */
    const results = globSync(`${this.sourceDir}/**`, {
      stat: true,
      withFileTypes: true,
      ignore: ["node_modules/**", ".lock"],
    });

    const files = results.map((path) => path.fullpath());
    return files;
  };

  fetchStaticResources = async (urls: string[]) => {
    console.log(chalk.blue("开始下载文件..."));
    try {
      const limit = pLimit(6);
      const input: Promise<AxiosInstance>[] = [];
      bar1.start(urls.length, 0);
      for (const url of urls) {
        const parsed = new URL(url);
        const index = parsed.pathname.lastIndexOf("/");
        const pathstr = index === 0 ? "" : parsed.pathname.substring(0, index + 1);
        const downloadPath = path.join(this.downloadDirPath, pathstr);
        fs.ensureDirSync(downloadPath);
        const destPath = path.join(downloadPath, path.basename(parsed.pathname));
        input.push(
          limit(() => {
            return new Promise(async (resolve, reject) => {
              try {
                await downloadFile(url, destPath, this.downloadLog);
                resolve(true);
                bar1.increment();
              } catch (error) {
                reject(error);
                bar1.increment();
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
            fs.unlink(i.reason.outputPath, (err) => {
              if (err) {
                console.log(err);
              }
            });
          }
          this.downloadResult.fail += 1;
        }
      });
      bar1.stop();
      return Promise.resolve();
    } catch (error) {
      console.log(error);
      return Promise.reject();
    }
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
    const HTTP_REGEX_CSS_URL = /(\(\/\/[^\s"]+?\.?\))|(\(https?:\/\/[^\s"]+?\.?\))/gi;

    if (!content || content.length === 0) {
      return newContent;
    }

    const fileType = path.extname(filePath);
    // console.log(chalk.blue("匹配替换链接路径..."));
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
        return this.replaceOrigin(this.removeQuotes(match), true);
      });
    } else if (fileType === ".css") {
      newContent = content.replace(HTTP_REGEX_CSS_URL, (match) => {
        const str = match.match(/\(([^)]+)\)/);
        const url = str[1].includes("http") ? str[1] : `http:${str[1]}`;
        this.addDownloadUrls(url);
        return `(${this.replaceOrigin(url)})`;
      });
    } else {
      newContent = content.replace(HTTP_REGEX_EXT, (match) => {
        this.addDownloadUrls(match);
        return this.replaceOrigin(this.removeQuotes(match), true);
      });
    }
    return newContent;
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
  replaceOrigin = (oldUrl: string, dynamic: boolean = false) => {
    const url = new URL(oldUrl);
    const downloadDirName = path.basename(path.resolve(this.downloadDir));
    if (this.linkType === "absolute") {
      url.hostname = this.hostname;
      url.port = this.port;
      url.pathname = `/${downloadDirName}${url.pathname}`;
      url.protocol = this.protocol;
      if (dynamic) {
        return `"${url.href}"`;
      }
      return url.href;
    } else if (this.linkType === "relative") {
      const href = `./${downloadDirName}${url.pathname}`;
      return href;
    }
  };

  displayStatistics = () => {
    const { success, fail } = this.downloadResult;
    const structDatas = [
      { request: "all", total: this.downloadResult.fail + this.downloadResult.success },
      { request: "success", total: success },
      { request: "fail", total: fail },
    ];
    console.log(`${chalk.blue("链接替换完成!")}`);
    console.log(`${chalk.yellow("replacedDirPath")}: ${chalk.blue(this.replacedDirPath)}`);
    console.log(`${chalk.yellow("downloadDirPath")}: ${chalk.blue(this.downloadDirPath)}`);
    console.log(`${chalk.yellow("replaceOrigin")}: ${chalk.blue(`${this.protocol}://${this.hostname}:${this.port}`)}`);
    console.table(structDatas);
  };
}

export default Generator;
