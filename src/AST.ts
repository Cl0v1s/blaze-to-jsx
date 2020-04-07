import * as Parser from '@babel/parser';
import * as Babel from '@babel/types';
import traverse from "@babel/traverse";
import { NodePath } from '@babel/traverse';

export default class AST {
  
  tree: Babel.File;

  imports: Babel.ImportDeclaration[] = [];
  funcs: Babel.FunctionDeclaration[] = [];

  constructr: Babel.FunctionDeclaration | null = null;
  didMount: Babel.FunctionDeclaration | null = null;
  willUnmount: Babel.FunctionDeclaration | null = null;

  constructor(code: string) {
    this.tree = Parser.parse(code, {
      sourceType: 'module',
    });

    this.processImports();
    this.processFunctions();
    this.processLifeCycle();
  }

  processImports() {
    traverse(this.tree, {
      ImportDeclaration: (p) => {
        const path: NodePath<Babel.ImportDeclaration> = p;
        const imp: Babel.ImportDeclaration = path.node;
        this.imports.push(imp);
      },
    });
  }

  processLifeCycle() {
    traverse(this.tree, {
      ExpressionStatement: (p) => {
        const path: NodePath<Babel.ExpressionStatement> = p;
        let expr: any = path.node;
        if(Babel.isCallExpression(expr.expression) == false) return;
        if(Babel.isMemberExpression(expr.expression.callee) == false) return;
        if(Babel.isMemberExpression(expr.expression.callee.object) == false) return;
        if(Babel.isIdentifier(expr.expression.callee.property) == false) return;
        const cycle: Babel.Identifier = expr.expression.callee.property;
        if(cycle.name == "onCreated") this.constructr = expr.expression.arguments[0];
        else if(cycle.name == "onRendered") this.didMount = expr.expression.arguments[0];
        else if(cycle.name == "onDestroyed") this.willUnmount = expr.expression.arguments[0];
      }
    });
    console.log(JSON.stringify(this.constructr, null, 2));
  }

  processFunctions() {
    traverse(this.tree, {
      FunctionDeclaration: (p) => {
        const path: NodePath<Babel.FunctionDeclaration> = p;
        const fun: Babel.FunctionDeclaration = path.node;

        // Si c'est une fonction utilitaire
        if(Babel.isProgram(path.parent)) {
          this.funcs.push(fun);  
          const parent: Babel.Program = <Babel.Program>p.parent;
          parent.body = parent.body.filter(e => e != p.node);      
        }

        // Suppression de templateInstance dans la déclaration
        fun.params = fun.params.filter((e: Babel.Node) => (Babel.isIdentifier(e) == false || (<Babel.Identifier>e).name !== "templateInstance"));

        traverse(fun, {
          // Remplacement de templateInstance par this dans le corps
          Identifier: (p) => {
            const path: NodePath<Babel.Identifier> = p;
            const id: Babel.Identifier = path.node;
            if(id.name === "templateInstance") id.name = "this";
          },
          // Remplacement de Template.instance() par this dans le corps
          CallExpression: (p) => {
            const path: NodePath<Babel.CallExpression> = p;
            const cll: Babel.CallExpression = path.node;
            if(Babel.isMemberExpression(cll.callee)) {
              const member = <Babel.MemberExpression>cll.callee;
              if(Babel.isIdentifier(member.object) && (<Babel.Identifier>member.object).name == "Template") {
                if(Babel.isIdentifier(member.property) && (<Babel.Identifier>member.property).name == "instance") {
                  (<Babel.Identifier>(<any>path.node)) = Babel.identifier("this");
                }
              }
            }
          }
        }, path.scope, path.state, path.parentPath)
      }
    });
    //console.log(JSON.stringify(this.funcs[0], null, 2));
  }

};