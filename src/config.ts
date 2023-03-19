module.exports = {
  protocol: "http",
  hostname: "127.0.0.1",
  /** 源替换后端口 */
  port: "8087",
  /** 下载文件夹 */
  downloadDir: "download",
  /** 需要替换源文件夹 */
  sourceDir: "build",
  /** 替换后输出的文件夹 */
  replacedDir: "replacedDir",
  /** 支持替换连接的后缀 */
  extensions: [".js", ".css", ".json", ".jpeg", ".jpg", ".png", ".gif"],
};
