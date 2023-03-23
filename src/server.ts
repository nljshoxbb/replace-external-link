import * as chalk from "chalk";
import * as express from "express";
const app = express();

export default function startServer(staticPath: string, port: number) {
  app.use(express.static(staticPath));
  const server = app.listen(port, function () {
    var host = server.address();
    var port = server.address();
    console.log(chalk.cyan("start server for puppeter"));
    // console.log("应用实例，访问地址为 http://%s:%s", host, port);
  });
  return server;
}
