import * as vscode from 'vscode';
import { TextEdit } from 'vscode';

export class SprotoFormatter {
    private indentSize: number = 4;
    private minCommentPos: number = 60;

    private decorationType: vscode.TextEditorDecorationType;

    constructor() {
        // 初始化高亮装饰器
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 250, 100, 0.2)',
            border: '1px solid rgba(100, 250, 100, 0.7)',
            borderRadius: '2px'
        });
    }

    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const edits = this.formatDocument(document);
        this.highlightProtocols(document); // 添加高亮
        return edits;
    }

    private highlightProtocols(document: vscode.TextDocument) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const ranges: vscode.DecorationOptions[] = [];
        const text = document.getText();
        const protocolRegex = /^(\.|\w+)\s+\w+\s*\d*\s*\{[\s\S]*?\}^\s*$/gm;
        
        let match;
        while ((match = protocolRegex.exec(text))) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            ranges.push({
                range: new vscode.Range(startPos, endPos),
                hoverMessage: 'Sproto Protocol'
            });
        }

        editor.setDecorations(this.decorationType, ranges);
    }


    private normalizeModuleComment(line: string): string {
        const MIN_HASHES = 40; // 单边最少40个#
        const content = line.replace(/^#+|#+$/g, '').trim();

        // 计算需要的#数量（至少40个）
        const sideHashes = Math.max(MIN_HASHES, 50 - content.length);

        // 生成格式：####... content ####...
        return `${'#'.repeat(sideHashes)} ${content} ${'#'.repeat(sideHashes)}`;
    }

    public formatDocument(document: vscode.TextDocument): TextEdit[] {
        const edits: TextEdit[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        let formattedLines: string[] = [];

        let currentProtocol: string[] = [];
        let inProtocol = false;
        let braceCount = 0;
        let lastWasComment = false;

        // 新增：检测模块注释
        let hasModuleComment = false;
        let moduleRange = '';

        // 1. 首先扫描整个文件检测模块注释
        for (const line of lines) {
            const moduleMatch = line.match(/^#{4,}\s*(.*?)\s*Module\s*(\d+)\s*-\s*(\d+)\s*#{4,}/);
            if (moduleMatch) {
                hasModuleComment = true;
                moduleRange = `${moduleMatch[2]}-${moduleMatch[3]}`;
                break;
            }
        }

        // 2. 如果没有模块注释，生成一个默认的
        if (!hasModuleComment) {
            // 尝试从第一个协议获取协议号
            let firstProtocolId = '2500-2599'; // 默认值
            for (const line of lines) {
                const protocolMatch = line.match(/^\w+_\w+_\w+\s+(\d+)\s*\{/);
                if (protocolMatch) {
                    const id = parseInt(protocolMatch[1]);
                    firstProtocolId = `${Math.floor(id / 100) * 100}-${Math.floor(id / 100) * 100 + 99}`;
                    break;
                }
            }

            formattedLines.push(
                this.normalizeModuleComment(`Protocol Module ${firstProtocolId}`)
            );
            formattedLines.push(''); // 注释后加空行
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trimEnd();

            // 跳过空行（会在最后统一处理）
            if (line.trim() === '') continue;

            // 处理request/response空块
            const blockMatch = line.match(/^\s*(request|response)\s*\{/);
            if (blockMatch && currentProtocol.length > 0) {
                const isResponse = blockMatch[1] === 'response';
                const nextLine = lines[i + 1]?.trim();
                
                // 空块处理（单行或多行）
                if (line.includes('{}') || nextLine === '}') {
                    line = ' '.repeat(this.indentSize) + `${blockMatch[1]} {}`;
                    if (nextLine === '}') i++; // 跳过下一行的闭合括号
                    currentProtocol.push(line);
                    continue;
                }
            }

            // 处理模块注释
            if (line.match(/^#{4,}.*#{4,}$/)) {
                this.finalizeProtocol(currentProtocol, formattedLines);
                formattedLines.push(line);
                formattedLines.push(''); // 模块注释后强制换行
                lastWasComment = true;
                continue;
            }

            // 处理普通注释
            if (line.startsWith('#')) {
                this.finalizeProtocol(currentProtocol, formattedLines);
                // 移除注释前的多余空行
                while (formattedLines.length > 0 &&
                    formattedLines[formattedLines.length - 1].trim() === '') {
                    formattedLines.pop();
                }
                formattedLines.push(''); // 模块注释后强制换行
                formattedLines.push(line.replace(/^#\s*/, '# '));
                continue;
            }
            lastWasComment = false;

            // 协议开始
            const protocolStart = line.match(/^(\.|\w+)\s+(\w+)\s*(\d*)\s*\{/);
            if (protocolStart) {
                this.finalizeProtocol(currentProtocol, formattedLines);
                currentProtocol = [line.replace(/\s*\{$/, ' {')];
                inProtocol = true;
                braceCount = 1;
                continue;
            }

            // 统计大括号
            if (inProtocol) {
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;

                // 格式化request/response块
                const blockMatch = line.match(/^\s*(request|response)\s*\{/);
                if (blockMatch) {
                    line = ' '.repeat(this.indentSize) +
                        line.trim().replace(/\s+/g, ' ');
                }

                // 格式化字段
                const fieldMatch = line.match(/^\s*(\w+)\s+(\d+)\s*:\s*(.*)/);
                if (fieldMatch) {
                    line = this.formatField(line);
                }

                currentProtocol.push(line);

                // 协议结束
                if (braceCount === 0) {
                    inProtocol = false;
                    this.finalizeProtocol(currentProtocol, formattedLines);
                    currentProtocol = [];
                }
            } else {
                formattedLines.push(line);
            }
        }

        // 处理最后一个协议
        this.finalizeProtocol(currentProtocol, formattedLines);

        // 创建完整文本编辑
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );
        edits.push(TextEdit.replace(fullRange, formattedLines.join('\n')));
        return edits;
    }

    private finalizeProtocol(protocol: string[], formattedLines: string[]) {
        if (protocol.length === 0) return;

        // 确保协议正确闭合
        if (protocol[protocol.length - 1].trim() !== '}') {
            protocol.push('}');
        }

        // 添加协议内容
        formattedLines.push(...protocol);

        // 添加协议前检查是否需要空行
        if (formattedLines.length > 0 &&
            formattedLines[formattedLines.length - 1].trim() !== '') {
            formattedLines.push('');
        }
    }

    private formatField(line: string): string {
        const match = line.match(/^\s*(\w+)\s+(\d+)\s*:\s*(.*)/);
        if (!match) return line;

        const [_, name, num, content] = match;
        let comment = '';
        let fieldContent = content.trim();

        // 处理注释
        const commentIndex = fieldContent.indexOf('#');
        if (commentIndex >= 0) {
            comment = fieldContent.substring(commentIndex);
            fieldContent = fieldContent.substring(0, commentIndex).trim();
            comment = ' ' + comment.trim();
        }

        // 固定字段部分格式（名称+数字+类型）
        const fieldStr = `${name} ${num}: ${fieldContent}`;
        const baseIndent = ' '.repeat(this.indentSize * 2); // 8空格缩进

        // 计算需要填充的空格数
        const totalLength = baseIndent.length + fieldStr.length;
        const padding = Math.max(1, this.minCommentPos - totalLength);

        // 构建最终行
        return baseIndent + fieldStr + ' '.repeat(padding) + comment;
    }
}