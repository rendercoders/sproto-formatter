export function getIndentLevel(line: string, indentSize: number): number {
    const spaces = line.match(/^\s*/)?.[0].length || 0;
    return Math.floor(spaces / indentSize);
}

export function isProtocolLine(line: string): boolean {
    return /^(\.|\w+)\s+\w+\s*(\d+)?\s*\{/.test(line.trim());
}

export function isCommentLine(line: string): boolean {
    return line.trim().startsWith('#');
}

export function isRequestResponseBlock(line: string): boolean {
    return /^\s*(request|response)\s*\{/.test(line.trim());
}