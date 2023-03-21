module.exports = {
  /** 源替换后协议 */
  protocol: "http",
  /** 源替换后域名 */
  hostname: "127.0.0.1",
  /** 源替换后端口 */
  port: "8087",
  /** 源文件已下载存放位置 */
  downloadDir: "../replace_build/download",
  /** 需要替换源链接的文件夹 */
  sourceDir: "./build",
  /** 源替换后输出的文件夹 */
  replacedDir: "./replace_build",
  /** 支持替换源的后缀 */
  extensions: ["js", "css", "json", "jpeg", "jpg", "png", "gif"],
  /** 替换源连接路径 relative | absolute */
  linkType: "absolute",
  indexHtml: "",
};
