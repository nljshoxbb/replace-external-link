import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { globSync } from "glob";
import { downloadFile, readFile, writeFile } from "./utils";
import * as chalk from "chalk";
import { CONFIG_FILE_NAME } from "./constant";
import type { AxiosInstance } from "axios";

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

    await this.processFiles(files);
    await this.fetchStaticResources(this.downloadUrls);
  }

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

  fetchStaticResources = async (urls) => {
    let success = 0;
    let fail = 0;
    const limit = pLimit(10);
    const input: Promise<AxiosInstance>[] = [];
    const urlSet = new Set<string>(urls);

    for (const url of urlSet) {
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

  replaceContent = (content, filePath) => {
    let newContent = "";
    const ALL_SCRIPT_REGEX = /(<script[\s\S]*?>)[\s\S]*?<\/script>/gi;
    const SCRIPT_TAG_REGEX = /<(script)\s+((?!type=('|")text\/ng-template\3).)*?>.*?<\/\1>/is;
    const SCRIPT_SRC_REGEX = /.*\ssrc=('|")?([^>'"\s]+)/;
    // 取出静态文件
    const HTTP_REGEX = /(http(s?):)\/\/(\S+?)\/(\S+?\.(?:jpe?g|png|gif|js|css|json))/g;

    const HTTP_REGEX_EXT =
      this.extensions.length > 0
        ? new RegExp(`(http(s?):)\/\/(\\S+?)\/(\\S+?\\.(?:${this.extensions.map((i) => i).join("|")}))`, "g")
        : HTTP_REGEX;

    if (!content || content.length === 0) {
      return newContent;
    }

    if (path.extname(filePath) === ".html") {
      // 处理html资源中的外链
      newContent = content
        .replace(ALL_SCRIPT_REGEX, (match, scriptTag) => {
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
              } else {
                if (HTTP_REGEX_EXT.test(matchedScriptSrc)) {
                  this.downloadUrls.push(matchedScriptSrc);
                }
              }
            }
          }
          return match;
        })
        .replace(HTTP_REGEX_EXT, (match) => {
          this.downloadUrls.push(match);
          return this.replaceSource(match);
        });
    } else {
      newContent = content.replace(HTTP_REGEX_EXT, (match) => {
        this.downloadUrls.push(match);
        return this.replaceSource(match);
      });
    }
    return newContent;
  };

  /** 替换源 */
  replaceSource = (oldUrl) => {
    const url = new URL(oldUrl);
    const downloadDirName = path.basename(path.resolve(this.downloadDir));
    if (this.linkType === "absolute") {
      url.hostname = this.hostname;
      url.port = this.port;
      url.pathname = `/${downloadDirName}${url.pathname}`;
      url.protocol = this.protocol;
      return url.href;
    } else if (this.linkType === "relative") {
      const href = `./${downloadDirName}${url.pathname}`;
      return href;
    }
  };
}

export default Generator;
