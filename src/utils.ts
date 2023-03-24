import * as chalk from "chalk";
import axios from "axios";
import * as fs from "fs-extra";
import * as glob from "glob";
import * as cliProgress from "cli-progress";
const readline = require("readline");

export const readFile = (file): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(file, "utf-8", (err, data) => {
      resolve(data);
    });
  });
};

export const writeFile = (file, content) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(file, content, "utf-8", (err) => {
      resolve(1);
    });
  });
};

export const logTask = (fileUrl, outputPath, status: "success" | "fail") => {
  const msg = `\nsource:${fileUrl} \ndest: ${outputPath} \nstatus: ${status}`;
  console.log(status === "success" ? chalk.green(msg) : chalk.red(msg));
};

const urls = [];

export const multibar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format: " {bar} | {url} | {value}/{total}",
  },
  cliProgress.Presets.shades_classic
);

let start;
let bar;

const startBar = () => {
  if (!start) {
    bar = multibar.create(100, 0);
    start = true;
  } else {
  }
  return bar;
};

export async function downloadFile(fileUrl: string, outputPath: string, printLog: boolean) {
  return new Promise(async (resolve, reject) => {
    startBar();
    try {
      const repsonse = await axios({
        method: "get",
        url: fileUrl,
        responseType: "stream",
        timeout: 3000,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.progress && progressEvent.progress > 0) {
            // console.log(chalk.cyan(`download: ${(progressEvent.progress * 100).toFixed(2)}%\r`));
            bar.update(progressEvent.progress * 100, { url: fileUrl });
            // multibar.update(progressEvent.progress * 100, 0);
            //删除光标所在行
            // readline.clearLine(process.stdout, 0);
            //移动光标到行首
            // readline.cursorTo(process.stdout, 0, 0);
          }
        },
      });
      bar.stop();
      const fileStream = fs.createWriteStream(outputPath, { highWaterMark: 32000 });
      repsonse.data.pipe(fileStream);
      fileStream.on("finish", () => {
        printLog && logTask(fileUrl, outputPath, "success");
        fileStream.close();
        resolve(true);
      });
      fileStream.on("drain", () => {
        printLog && console.log("\nfileStream drain", outputPath);
      });
      fileStream.on("error", () => {
        console.log("fileStream error", outputPath);
      });
    } catch (error) {
      printLog && logTask(fileUrl, outputPath, "fail");
      error.outputPath = outputPath;
      reject(error);
    }
  });
}

export function getFolderSizeByGlob(folder, { ignorePattern: array }) {
  const filePaths = glob.sync("**", {
    cwd: folder,
    ignore: array,
    absolute: true,
  });
  let totalSize = 0;
  filePaths.forEach((file) => {
    const stat = fs.statSync(file);
    totalSize += stat.size;
  });
  return totalSize;
}

export function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
