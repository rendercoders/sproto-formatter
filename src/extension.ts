import * as vscode from 'vscode';
import { SprotoFormatter } from './formatter';
import { SprotoValidator } from './validator';

export function activate(context: vscode.ExtensionContext) {
    const formatter = new SprotoFormatter();
    const validator = new SprotoValidator();
    
    // Register document formatter
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('sproto', {
            provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
                return formatter.formatDocument(document);
            }
        })
    );
    
    // Register document validator
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'sproto') {
                validator.validateDocument(document);
            }
        })
    );
    
    // Register command for manual validation
    context.subscriptions.push(
        vscode.commands.registerCommand('sproto.validate', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'sproto') {
                validator.validateDocument(editor.document);
            }
        })
    );
}

export function deactivate() {}