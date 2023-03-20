# replace-external-link

替换静态文件工具

## 安装依赖

```
pnpm install
```

## 开发

```
pnpm run start
```

## 构建

```
pnpm build
```

## 发布

```
pnpm pub
```

## 使用

### 安装包

```
pnpm install replace-external-link -g
```

### 初始化配置文件

```
replace-external-link init
```

> 如果不生成配置文件，则使用内置配置文件

内置配置文件

```
module.exports = {
    /** 源替换后协议 \*/
    protocol: "http",
    /** 源替换后域名 _/
    hostname: "127.0.0.1",
    /\*\* 源替换后端口 _/
    port: "8087",
    /** 下载文件夹 \*/
    downloadDir: "download",
    /** 需要替换源的文件夹 _/
    sourceDir: "build",
    /\*\* 源替换后输出的文件夹 _/
    replacedDir: "replacedDir",
    /\*_ 支持替换源的后缀 _/
    extensions: [".js", ".css", ".json", ".jpeg", ".jpg", ".png", ".gif"],
};

```

### 替换

```
replace-external-link replace
```
