import * as vscode from 'vscode';

// 定义协议模块接口，用于存储模块中的协议信息
interface ProtocolModule {
    [key: string]: ProtocolInfo[];
}

// 定义协议信息接口
interface ProtocolInfo {
    name: string;   // 协议名称
    number: number; // 协议编号
    line: number;   // 协议所在行号
}

// 定义字段信息接口
interface FieldInfo {
    name: string;   // 字段名称
    number: number; // 字段编号
    line: number;   // 字段所在行号
}

export class SprotoValidator {
    private diagnosticsCollection: vscode.DiagnosticCollection;

    constructor() {
        // 创建诊断集合用于存储验证结果
        this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('sproto');
    }

    /**
     * 验证文档内容
     * @param document 要验证的文档对象
     */
    public validateDocument(document: vscode.TextDocument) {
        const diagnostics: vscode.Diagnostic[] = [];  // 存储诊断信息
        const text = document.getText();              // 获取文档全文
        const lines = text.split('\n');               // 按行分割

        // 存储协议编号和对应的协议信息（全局）
        const protocolNumbers = new Map<number, ProtocolInfo>();
        // 按模块存储协议信息
        const protocolNumbersInModule: ProtocolModule = {};
        let currentModule = '';  // 当前处理的模块名

        // 逐行分析文档内容
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 检查模块标题（以4个或更多#开头）
            const moduleHeaderMatch = line.match(/^#{4,}\s+(\w+)/);
            if (moduleHeaderMatch) {
                currentModule = moduleHeaderMatch[1];
                // 初始化该模块的协议数组
                if (!protocolNumbersInModule[currentModule]) {
                    protocolNumbersInModule[currentModule] = [];
                }
                continue;
            }

            // 检查中文标点符号
            this.checkChinesePunctuation(line, i, diagnostics);

            // 检查协议定义（格式：协议名 编号 {）
            const protocolMatch = line.match(/^(\w+)\s+(\d+)\s*\{/);
            if (protocolMatch) {
                const protocolName = protocolMatch[1];
                const protocolNumber = parseInt(protocolMatch[2]);

                // 检查以点开头的协议（不应该有编号）
                if (protocolName.startsWith('.') && protocolMatch[2]) {
                    const range = new vscode.Range(
                        new vscode.Position(i, protocolMatch[1].length),
                        new vscode.Position(i, protocolMatch[0].length)
                    );
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            "以'.'开头的协议不应包含编号",
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }

                // 检查重复的协议编号
                if (protocolNumbers.has(protocolNumber)) {
                    const existingProtocol = protocolNumbers.get(protocolNumber)!;
                    const range = new vscode.Range(
                        new vscode.Position(i, protocolMatch[1].length),
                        new vscode.Position(i, protocolMatch[0].length)
                    );
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `重复的协议编号 ${protocolNumber}。已在第 ${existingProtocol.line + 1} 行被 ${existingProtocol.name} 使用`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                } else {
                    // 存储协议信息
                    protocolNumbers.set(protocolNumber, {
                        name: protocolName,
                        number: protocolNumber,
                        line: i
                    });

                    // 如果当前在模块中，也存储到模块信息中
                    if (currentModule) {
                        protocolNumbersInModule[currentModule].push({
                            name: protocolName,
                            number: protocolNumber,
                            line: i
                        });
                    }
                }
                continue;
            }

            // 检查请求/响应字段块
            if (line.match(/^\s*(request|response)\s*\{/)) {
                const blockType = line.match(/^\s*(\w+)\s*\{/)![1];  // 获取块类型（request或response）
                const fields = new Map<number, FieldInfo>();         // 存储字段编号和字段信息
                let j = i + 1;                                       // 从下一行开始检查字段

                // 遍历字段块内的所有行（直到遇到右花括号）
                while (j < lines.length && !lines[j].match(/^\s*\}\s*$/)) {
                    const fieldLine = lines[j];

                    // 检查字段定义错误
                    this.checkFieldDefinitionErrors(fieldLine, j, diagnostics);

                    // 匹配标准字段定义（字段名 编号:）
                    const fieldMatch = fieldLine.match(/^\s*(\w+)\s+(\d+)\s*:/);

                    if (fieldMatch) {
                        const fieldName = fieldMatch[1];
                        const fieldNumber = parseInt(fieldMatch[2]);

                        // 检查重复的字段编号
                        if (fields.has(fieldNumber)) {
                            const existingField = fields.get(fieldNumber)!;
                            const range = new vscode.Range(
                                new vscode.Position(j, fieldMatch.index! + fieldMatch[1].length),
                                new vscode.Position(j, fieldMatch.index! + fieldMatch[0].length)
                            );
                            diagnostics.push(
                                new vscode.Diagnostic(
                                    range,
                                    `${blockType} 块中重复的字段编号 ${fieldNumber}。已在第 ${existingField.line + 1} 行被 ${existingField.name} 使用`,
                                    vscode.DiagnosticSeverity.Error
                                )
                            );
                        } else {
                            // 存储字段信息
                            fields.set(fieldNumber, {
                                name: fieldName,
                                number: fieldNumber,
                                line: j
                            });
                        }
                    }
                    j++;
                }
                i = j;  // 跳过已处理的字段块
                continue;
            }
        }

        // 将诊断结果应用到文档
        this.diagnosticsCollection.set(document.uri, diagnostics);
    }

    /**
     * 检查字段定义中的常见错误
     * @param line 要检查的行内容
     * @param lineNumber 行号
     * @param diagnostics 诊断信息数组
     */
    private checkFieldDefinitionErrors(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
        // 跳过空行、结束花括号或空块
        if (line.trim() === '' || line.trim() === '}' || line.trim() === 'response {' || line.trim() === 'request {') {
            return;
        }

        // 跳过注释行（以#开头）
        if (line.trim().startsWith('#')) {
            return;
        }

        // 标准字段格式：字段名 数字: 类型
        const standardFormat = /^\s*\w+\s+\d+\s*:\s*(\*?\s*\w+|$$.*?$$)/;

        // 情况1：完全匹配标准格式
        if (standardFormat.test(line)) {
            return; // 格式正确，无需处理
        }

        // 情况2：有冒号但没有类型（如 "msg 2:"）
        if (line.includes(':') && !line.match(/:\s*\w/)) {
            const colonIndex = line.indexOf(':');
            const range = new vscode.Range(
                new vscode.Position(lineNumber, colonIndex),
                new vscode.Position(lineNumber, line.length)
            );
            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    "字段定义缺少类型。正确格式应为：'字段名 编号: 类型'",
                    vscode.DiagnosticSeverity.Error
                )
            );
            return;
        }

        // 情况3：有编号但没有冒号（如 "msg3 2"）
        if (line.match(/^\s*\w+\s+\d+\s*$/) || line.match(/^\s*\w+\s+\d+\s+\w/)) {
            const match = line.match(/^\s*\w+\s+\d+/);
            if (match) {
                const range = new vscode.Range(
                    new vscode.Position(lineNumber, match.index! + match[0].length),
                    new vscode.Position(lineNumber, line.length)
                );
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "字段定义缺少冒号。正确格式应为：'字段名 编号: 类型'",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            return;
        }

        // 情况4：只有字段名（如 "msg"）
        if (line.match(/^\s*\w+\s*$/)) {
            const match = line.match(/^\s*\w+/);
            if (match) {
                const range = new vscode.Range(
                    new vscode.Position(lineNumber, match.index! + match[0].length),
                    new vscode.Position(lineNumber, line.length)
                );
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "字段定义缺少编号和类型。正确格式应为：'字段名 编号: 类型'",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            return;
        }

        // 情况5：其他不符合格式的情况
        const range = new vscode.Range(
            new vscode.Position(lineNumber, 0),
            new vscode.Position(lineNumber, line.length)
        );
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                "字段定义格式不正确。正确格式应为：'字段名 编号: 类型'",
                vscode.DiagnosticSeverity.Error
            )
        );
    }

    /**
     * 检查中文标点符号
     * @param line 要检查的行内容
     * @param lineNumber 行号
     * @param diagnostics 诊断信息数组
     */
    private checkChinesePunctuation(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
        // 中文标点符号列表
        const chinesePunctuation = [
            '，', '。', '；', '：', '？', '！', '、', '「', '」', '『', '』',
            '（', '）', '【', '】', '｛', '｝', '《', '》', '…', '—', '～'
        ];

        // 检查每个中文标点符号
        for (const punct of chinesePunctuation) {
            const index = line.indexOf(punct);
            if (index !== -1) {
                const range = new vscode.Range(
                    new vscode.Position(lineNumber, index),
                    new vscode.Position(lineNumber, index + punct.length)
                );
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `检测到中文标点符号 '${punct}'。请使用英文标点符号代替`,
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }
        }
    }
}