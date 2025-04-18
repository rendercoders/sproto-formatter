import * as vscode from 'vscode';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('sproto');

// 校验符号和缩进
function validateSproto(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const chineseSymbolRegex = /[：；]/g; // 检测中文符号

  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const line = document.lineAt(lineNum);
    
    // 校验中文符号
    let match;
    while ((match = chineseSymbolRegex.exec(line.text)) !== null) {
      const range = new vscode.Range(
        new vscode.Position(lineNum, match.index),
        new vscode.Position(lineNum, match.index + 1)
      );
      diagnostics.push(new vscode.Diagnostic(
        range,
        "禁止使用中文符号（需改为英文冒号/分号）",
        vscode.DiagnosticSeverity.Error
      ));
    }

    // 校验缩进对齐
    if (line.text.trim().length > 0) {
      const expectedIndent = line.firstNonWhitespaceCharacterIndex;
      const actualIndent = line.text.search(/\S/);
      if (actualIndent !== expectedIndent) {
        const range = new vscode.Range(
          new vscode.Position(lineNum, 0),
          new vscode.Position(lineNum, actualIndent)
        );
        diagnostics.push(new vscode.Diagnostic(
          range,
          "缩进不统一",
          vscode.DiagnosticSeverity.Warning
        ));
      }
    }
  }
  return diagnostics;
}

// 格式化处理器
class SprotoFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    
    // 示例格式化规则：统一缩进为2空格
    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const line = document.lineAt(lineNum);
      const indent = '  '.repeat(lineNum === 0 ? 0 : 1);
      edits.push(vscode.TextEdit.replace(
        new vscode.Range(line.range.start, line.range.start),
        indent
      ));
    }
    return edits;
  }
}

// 激活插件
export function activate(context: vscode.ExtensionContext) {
  // 注册文档变更监听
  context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(validateSprotoDoc),
      vscode.workspace.onDidChangeTextDocument(e => validateSprotoDoc(e.document)),
      diagnosticCollection
  );

  // 立即验证已打开的文件
  vscode.workspace.textDocuments.forEach(validateSprotoDoc);
}

function validateSprotoDoc(document: vscode.TextDocument) {
  if (document.languageId !== 'sproto') return;
  
  const diagnostics = validateSproto(document);
  diagnosticCollection.set(document.uri, diagnostics);
}