import * as vscode from 'vscode';

interface ProtocolModule {
    [key: string]: ProtocolInfo[];
}

interface ProtocolInfo {
    name: string;
    number: number;
    line: number;
}

interface FieldInfo {
    name: string;
    number: number;
    line: number;
}

export class SprotoValidator {
    private diagnosticsCollection: vscode.DiagnosticCollection;
    
    constructor() {
        this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('sproto');
    }
    
    public validateDocument(document: vscode.TextDocument) {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        
        const protocolNumbers = new Map<number, ProtocolInfo>();
        const protocolNumbersInModule: ProtocolModule = {};
        let currentModule = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for module header
            const moduleHeaderMatch = line.match(/^#{4,}\s+(\w+)/);
            if (moduleHeaderMatch) {
                currentModule = moduleHeaderMatch[1];
                if (!protocolNumbersInModule[currentModule]) {
                    protocolNumbersInModule[currentModule] = [];
                }
                continue;
            }
            
            // Check for Chinese punctuation
            this.checkChinesePunctuation(line, i, diagnostics);
            
            // Check protocol definitions
            const protocolMatch = line.match(/^(\w+)\s+(\d+)\s*\{/);
            if (protocolMatch) {
                const protocolName = protocolMatch[1];
                const protocolNumber = parseInt(protocolMatch[2]);
                
                // Check if protocol starts with dot (shouldn't have number)
                if (protocolName.startsWith('.') && protocolMatch[2]) {
                    const range = new vscode.Range(
                        new vscode.Position(i, protocolMatch[1].length),
                        new vscode.Position(i, protocolMatch[0].length)
                    );
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            "Protocols starting with '.' should not have numbers",
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
                
                // Check for duplicate protocol numbers
                if (protocolNumbers.has(protocolNumber)) {
                    const existingProtocol = protocolNumbers.get(protocolNumber)!;
                    const range = new vscode.Range(
                        new vscode.Position(i, protocolMatch[1].length),
                        new vscode.Position(i, protocolMatch[0].length)
                    );
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Duplicate protocol number ${protocolNumber}. Already used by ${existingProtocol.name} at line ${existingProtocol.line + 1}`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                } else {
                    protocolNumbers.set(protocolNumber, {
                        name: protocolName,
                        number: protocolNumber,
                        line: i
                    });
                    
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
            
            // Check request/response fields
            if (line.match(/^\s*(request|response)\s*\{/)) {
                const blockType = line.match(/^\s*(\w+)\s*\{/)![1];
                const fields = new Map<number, FieldInfo>();
                let j = i + 1;
                
                while (j < lines.length && !lines[j].match(/^\s*\}\s*$/)) {
                    const fieldLine = lines[j];
                    const fieldMatch = fieldLine.match(/^\s*(\w+)\s+(\d+)\s*:/);
                    
                    if (fieldMatch) {
                        const fieldName = fieldMatch[1];
                        const fieldNumber = parseInt(fieldMatch[2]);
                        
                        if (fields.has(fieldNumber)) {
                            const existingField = fields.get(fieldNumber)!;
                            const range = new vscode.Range(
                                new vscode.Position(j, fieldMatch.index! + fieldMatch[1].length),
                                new vscode.Position(j, fieldMatch.index! + fieldMatch[0].length)
                            );
                            diagnostics.push(
                                new vscode.Diagnostic(
                                    range,
                                    `Duplicate field number ${fieldNumber} in ${blockType}. Already used by ${existingField.name} at line ${existingField.line + 1}`,
                                    vscode.DiagnosticSeverity.Error
                                )
                            );
                        } else {
                            fields.set(fieldNumber, {
                                name: fieldName,
                                number: fieldNumber,
                                line: j
                            });
                        }
                    }
                    j++;
                }
                i = j;
                continue;
            }
        }
        
        // Set diagnostics for the document
        this.diagnosticsCollection.set(document.uri, diagnostics);
    }
    
    private checkChinesePunctuation(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
        const chinesePunctuation = [
            '，', '。', '；', '：', '？', '！', '、', '「', '」', '『', '』',
            '（', '）', '【', '】', '｛', '｝', '《', '》', '…', '—', '～'
        ];
        
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
                        `Chinese punctuation '${punct}' detected. Use English punctuation instead.`,
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }
        }
    }
}