module.exports = {
  /** 源替换后协议 */
  protocol: "http",
  /** 源替换后域名 */
  hostname: "127.0.0.1",
  /** 源替换后端口 */
  port: "8087",
  /** 下载文件夹 */
  downloadDir: "download",
  /** 需要替换源的文件夹 */
  sourceDir: "build",
  /** 源替换后输出的文件夹 */
  replacedDir: "replacedDir",
  /** 支持替换源的后缀 */
  extensions: ["js", "css", "json", "jpeg", "jpg", "png", "gif"],
  /** 下载静态文件夹生成地址，如未配置则生成在根目录 */
  downloadDirPath: "",
};
