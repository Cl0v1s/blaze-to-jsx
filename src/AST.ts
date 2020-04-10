import * as Parser from '@babel/parser';
import * as Babel from '@babel/types';
import traverse from "@babel/traverse";
import { NodePath } from '@babel/traverse';


import {EventBind, Component, StateDefinition } from './Component';

export default class AST {
  
  tree: Babel.File;

  component: Component;

  static NODE_COUNTER = 0;

  constructor(code: string) {
    this.component = {
      name: null,
      imports: [],
      funcs: [],
      constructr: null,
      willUnmount: null,
      didMount: null,
      state: [],
      props: [],
      helpers: [],
      events: [],
    };

    this.tree = Parser.parse(code, {
      sourceType: 'module',
    });

    this.processImports();
    this.processFunctions();
    this.processLifeCycle();
    this.processHelpers();
    this.processEvents();
    this.processProps();
    this.processState();
  }

  public getComponent() {
    return this.component;
  }

  private getNodeName() {
    AST.NODE_COUNTER++;
    return AST.NODE_COUNTER.toString();
  }

  processState() {
    traverse(this.tree, {
      AssignmentExpression: (p) => {
        const path: NodePath<Babel.AssignmentExpression> = p;
        const expr: Babel.AssignmentExpression = path.node;
        if(Babel.isMemberExpression(expr.left) == false) return;
        const subject: Babel.MemberExpression = <any>expr.left;
        // Template.instance(), templateInstance ou this
        if(
          (
            Babel.isThisExpression(subject.object)
            || (Babel.isIdentifier(subject.object) && (<Babel.Identifier>subject.object).name === 'templateInstance')
            || (
              Babel.isCallExpression(subject.object) 
              && Babel.isMemberExpression(subject.object.callee)
              && (<Babel.Identifier>(<Babel.MemberExpression>(<Babel.CallExpression>subject.object).callee).object).name === 'Template'
              && (<Babel.Identifier>(<Babel.MemberExpression>(<Babel.CallExpression>subject.object).callee).property).name === 'instance'
            )
          ) ==  false
        ) return;
        // = new ReactiveTruc
        if(
          (
            Babel.isNewExpression(expr.right)
            && Babel.isIdentifier((<Babel.NewExpression>expr.right).callee) 
            && (
              (<Babel.Identifier>(<Babel.NewExpression>expr.right).callee).name === "ReactiveVar"
              || (<Babel.Identifier>(<Babel.NewExpression>expr.right).callee).name === "ReactiveDict"
            )
          ) == false
        ) return;
        // nom du state
        if(Babel.isIdentifier(subject.property) == false) return;
        const state = (<Babel.Identifier>subject.property).name;
        const args = (<Babel.NewExpression>expr.right).arguments;
        const def = args.length > 0 ? args[0] : undefined;
        if(this.component.state.findIndex(s => s.name === state) !== -1) return;
        this.component.state.push({
          name: state, 
          defaultValue: <any>def,
        });
      }
    });
    //console.log(JSON.stringify(this.component.state, null, 2));
  }

  processProps() {
    traverse(this.tree, {
      MemberExpression: (p) => {
        const path: NodePath<Babel.MemberExpression> = p;
        const member: Babel.MemberExpression = path.node;
        if(Babel.isMemberExpression(member.object) == false) return;
        const subject : Babel.MemberExpression = <any>member.object;

        // Template.instance(), templateInstance ou this
        if(
            (
              Babel.isThisExpression(subject.object)
              || (Babel.isIdentifier(subject.object) && (<Babel.Identifier>subject.object).name === 'templateInstance')
              || (
                Babel.isCallExpression(subject.object) 
                && Babel.isMemberExpression(subject.object.callee)
                && (<Babel.Identifier>(<Babel.MemberExpression>(<Babel.CallExpression>subject.object).callee).object).name === 'Template'
                && (<Babel.Identifier>(<Babel.MemberExpression>(<Babel.CallExpression>subject.object).callee).property).name === 'instance'
              )
            ) ==  false
        ) return;
        // .data
        if((Babel.isIdentifier(subject.property) && (<Babel.Identifier>subject.property).name === "data") == false) return;
        if(Babel.isIdentifier(member.property) == false) return;
        const prop = (<Babel.Identifier>member.property).name;
        this.component.props.push(prop);
      }
    });
    this.component.props = Array.from(new Set(this.component.props));
    //console.log(JSON.stringify(this.props, null, 2));
  }

  processImports() {
    traverse(this.tree, {
      ImportDeclaration: (p) => {
        const path: NodePath<Babel.ImportDeclaration> = p;
        const imp: Babel.ImportDeclaration = path.node;
        this.component.imports.push(imp);
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

        if (
          (cycle.name == "onCreated" || cycle.name == "onRendered" || cycle.name == "onDestroyed")
          && Babel.isIdentifier(expr.expression.arguments[0])
        )
        throw new Error('LifeCycle functions can not be Identifier. Aborting.');

        if(cycle.name == "onCreated") this.component.constructr = expr.expression.arguments[0];
        else if(cycle.name == "onRendered") this.component.didMount = expr.expression.arguments[0];
        else if(cycle.name == "onDestroyed") this.component.willUnmount = expr.expression.arguments[0];
      }
    });
    //console.log(JSON.stringify(this.constructr, null, 2));
  }

  processHelpers() {
    this.processTemplateProperty('helpers', this.component.helpers);
    //console.log(JSON.stringify(array[0], null, 2));

  }

  processEvents() {
    const fns: Babel.FunctionDeclaration[] = [];
    const selectors: string[] = [];
    this.processTemplateProperty('events', fns, selectors);
    for(let i = 0; i < selectors.length; i++) {
      const data = selectors[i].split(' ');
      let event = data[0];
      event = 'on' + event.replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
      data.splice(0, 1);
      let selector = data.join(' ');
      this.component.events.push({
        event,
        selector,
        fun: fns[i],
      })
    }
    //console.log(JSON.stringify(this.events[0], null, 2));
  }

  processTemplateProperty(prop: string, array: Babel.FunctionDeclaration[], opts: string[] | null = null) {
    traverse(this.tree, {
      ExpressionStatement: (p) => {
        const path: NodePath<Babel.ExpressionStatement> = p;
        let expr: any = path.node;
        if(Babel.isCallExpression(expr.expression) == false) return;
        if(Babel.isMemberExpression(expr.expression.callee) == false) return;
        if(Babel.isMemberExpression(expr.expression.callee.object) == false) return;
        if(Babel.isIdentifier(expr.expression.callee.property) == false) return;
        const cycle: Babel.Identifier = expr.expression.callee.property;
        if(cycle.name !== prop) return;
        const object: Babel.ObjectExpression = expr.expression.arguments[0];
        traverse(object, {
          ObjectProperty: (p) => {
            const path: NodePath<Babel.ObjectProperty> = p;
            const property: Babel.ObjectProperty = path.node;
            if(Babel.isFunction(property.value) == false) return;
            const value: Babel.Function = <any>property.value;

            let key: Babel.Identifier | null = null;
            if(Babel.isIdentifier(property.key)) key = <any>property.key;
            else if(Babel.isStringLiteral(property.key)) {
              if(opts != null) opts.push(property.key.value);
              key = Babel.identifier(`fun_${this.getNodeName()}`);
            }

            let body: Babel.BlockStatement;
            if(Babel.isBlockStatement(value.body)) body = value.body; 
            else {
              body = Babel.blockStatement([
                Babel.returnStatement(value.body)
              ]);
            }

            const fun: Babel.FunctionDeclaration = Babel.functionDeclaration(
              key,
              value.params,
              body,
              value.generator,
              value.async
            );
            array.push(fun);
          }
        }, path.scope, path.state, path.parentPath);
      }
    });
  }

  processFunctions() {
    traverse(this.tree, {
      FunctionDeclaration: (p) => {
        const path: NodePath<Babel.FunctionDeclaration> = p;
        const fun: Babel.FunctionDeclaration = path.node;

        // Si c'est une fonction utilitaire
        if(Babel.isProgram(path.parent)) {
          this.component.funcs.push(fun);     
        }
      }
    });
    //console.log(JSON.stringify(this.funcs[0], null, 2));
  }

};