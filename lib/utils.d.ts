export declare const readFile: (file: any) => Promise<unknown>;
export declare const writeFile: (file: any, content: any) => Promise<unknown>;
export declare const logTask: (fileUrl: any, outputPath: any, status: "success" | "fail") => void;
export declare function downloadFile(fileUrl: string, outputPath: string): Promise<unknown>;
