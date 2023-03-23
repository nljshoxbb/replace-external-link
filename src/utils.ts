import * as chalk from "chalk";
import axios from "axios";
import * as fs from "fs-extra";
import * as glob from "glob";

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
export async function downloadFile(fileUrl: string, outputPath: string, printLog: boolean) {
  // urls.push(outputPath);
  return new Promise(async (resolve, reject) => {
    try {
      // if (outputPath.includes("standalone-worker.min.js")) {
      //   resolve(true);
      //   return;
      // }
      const fileStream = fs.createWriteStream(outputPath, { highWaterMark: 32000 });
      const repsonse = await axios({ method: "get", url: fileUrl, responseType: "stream", timeout: 3000 });
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
    // "**" means you search on the whole folder
    cwd: folder, // folder path
    ignore: array, // array of glob pattern strings
    absolute: true, // you have to set glob to return absolute path not only file names
  });
  let totalSize = 0;
  filePaths.forEach((file) => {
    // console.log("file", file);
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
