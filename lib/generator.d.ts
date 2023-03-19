declare class Generator {
    hostname: string;
    port: string;
    protocol: string;
    extensions: string;
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
    constructor();
    setDefaultConfig: (params: any) => void;
    getConfigFile: () => Promise<void>;
    init(): Promise<void>;
    processFiles: (files: any) => Promise<void>;
    scanDir: () => string[];
    fetchStaticResources: (urls: any) => Promise<void>;
    replaceContent: (content: any, filePath: any) => string;
    /** 替换源 */
    replaceSource: (oldUrl: any) => string;
}
export default Generator;
