import * as vscode from 'vscode';
import { TextEdit } from 'vscode';

/**
 * Sproto 协议格式化器
 * 用于格式化 sproto 协议文件，包括：
 * 1. 标准化模块注释格式
 * 2. 格式化协议定义
 * 3. 对齐字段和注释
 * 4. 处理空块和嵌套结构
 */
export class SprotoFormatter {
    // 缩进大小（空格数）
    private indentSize: number = 4;
    // 注释最小对齐位置
    private minCommentPos: number = 60;

    /**
     * 提供文档格式化编辑
     * @param document 要格式化的文档
     * @param options 格式化选项
     * @param token 取消令牌
     * @returns 格式化编辑数组
     */
    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const edits = this.formatDocument(document);
        return edits;
    }

    /**
     * 标准化模块注释格式
     * 将模块注释格式化为统一的 ####... content ####... 格式
     * @param line 原始注释行
     * @returns 标准化后的注释行
     */
    private normalizeModuleComment(line: string): string {
        const MIN_HASHES = 40; // 单边最少40个#
        const content = line.replace(/^#+|#+$/g, '').trim();

        // 计算需要的#数量（至少40个，或根据内容长度调整）
        const sideHashes = Math.max(MIN_HASHES, 50 - content.length);

        // 生成格式：####... content ####...
        return `${'#'.repeat(sideHashes)} ${content} ${'#'.repeat(sideHashes)}`;
    }

    /**
     * 格式化整个文档
     * @param document 要格式化的文档
     * @returns 格式化编辑数组
     */
    public formatDocument(document: vscode.TextDocument): TextEdit[] {
        const edits: TextEdit[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        let formattedLines: string[] = [];

        // 当前正在处理的协议内容
        let currentProtocol: string[] = [];
        // 是否在协议块内
        let inProtocol = false;
        // 大括号嵌套计数
        let braceCount = 0;
        // 上一行是否是注释（用于空行处理）
        let lastWasComment = false;

        // 检测模块注释
        let hasModuleComment = false;
        let moduleRange = '';

        // 1. 扫描整个文件检测模块注释
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
            // 尝试从第一个协议获取协议号范围
            let firstProtocolId = '2500-2599'; // 默认值
            for (const line of lines) {
                const protocolMatch = line.match(/^\w+_\w+_\w+\s+(\d+)\s*\{/);
                if (protocolMatch) {
                    const id = parseInt(protocolMatch[1]);
                    firstProtocolId = `${Math.floor(id / 100) * 100}-${Math.floor(id / 100) * 100 + 99}`;
                    break;
                }
            }

            // 添加标准化后的模块注释
            formattedLines.push(
                this.normalizeModuleComment(`Protocol Module ${firstProtocolId}`)
            );
            formattedLines.push(''); // 注释后加空行
        }

        // 逐行处理文档内容
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trimEnd();

            // 跳过空行（会在最后统一处理）
            if (line.trim() === '') continue;

            // 处理request/response空块
            const blockMatch = line.match(/^\s*(request|response)\s*\{/);
            if (blockMatch && currentProtocol.length > 0) {
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
                currentProtocol = []; // 确保清空当前协议内容
                formattedLines.push(line);
                formattedLines.push(''); // 模块注释后强制换行
                lastWasComment = true;
                continue;
            }

            // 处理普通注释
            if (line.startsWith('#')) {
                this.finalizeProtocol(currentProtocol, formattedLines);
                currentProtocol = []; // 确保清空当前协议内容
                // 移除注释前的多余空行
                while (formattedLines.length > 0 &&
                    formattedLines[formattedLines.length - 1].trim() === '') {
                    formattedLines.pop();
                }
                formattedLines.push(''); // 注释后强制换行
                formattedLines.push(line.replace(/^#\s*/, '# '));
                continue;
            }
            lastWasComment = false;

            // 协议开始检测
            const protocolStart = line.match(/^(\.|\w+)\s+(\w+)\s*(\d*)\s*\{/);
            if (protocolStart) {
                this.finalizeProtocol(currentProtocol, formattedLines);
                // 标准化协议开始行（确保 { 前有空格）
                currentProtocol = [line.replace(/\s*\{$/, ' {')];
                inProtocol = true;
                braceCount = 1;
                continue;
            }

            // 协议内容处理
            if (inProtocol) {
                // 更新大括号计数
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

                // 协议结束判断
                if (braceCount === 0) {
                    inProtocol = false;
                    this.finalizeProtocol(currentProtocol, formattedLines);
                    currentProtocol = [];
                }
            } else {
                // 非协议内容直接添加
                formattedLines.push(line);
            }
        }

        // 只在当前协议未结束时才处理
        if (inProtocol && currentProtocol.length > 0) {
            this.finalizeProtocol(currentProtocol, formattedLines);
        }

        // 创建完整文本编辑
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );
        edits.push(TextEdit.replace(fullRange, formattedLines.join('\n')));
        return edits;
    }

    /**
     * 完成协议格式化并将其添加到结果中
     * @param protocol 当前协议内容数组
     * @param formattedLines 已格式化的行数组
     */
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
        // 清空当前协议
        protocol.length = 0;
    }

    /**
     * 格式化字段行
     * @param line 原始字段行
     * @returns 格式化后的字段行
     */
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
        // 8空格缩进（2级缩进）
        const baseIndent = ' '.repeat(this.indentSize * 2);

        // 计算需要填充的空格数（使注释对齐）
        const totalLength = baseIndent.length + fieldStr.length;
        const padding = Math.max(1, this.minCommentPos - totalLength);

        // 构建最终行
        return baseIndent + fieldStr + ' '.repeat(padding) + comment;
    }
}