import { EventBind, Component } from './Component';
import * as Babel from '@babel/types';
import * as Parser from '@babel/parser';
import traverse from "@babel/traverse";
import { NodePath } from '@babel/traverse';
import generate from '@babel/generator';

import { compile } from './../../spacebars-to-jsx'

export default class Converter {

  baseTree: Babel.File;
  component: Component;
  classDec: Babel.ClassDeclaration | null = null;

  constructor(baseContent: string, component: Component, template: string) {
    this.baseTree = Parser.parse(baseContent, {
      sourceType: 'module',
    });
    this.component = component;

    this.findClassDeclaration();

    this.createConstructor();
    this.createDidMount();
    this.createWillUnmount();

    this.createHelpers();
    this.createEvents();
    this.createFunctions();

    this.clean();

    //this.createRender(template);

    this.generate();
  }

  generate() {
    console.log(generate(this.baseTree, {}, undefined).code);
  }

  private findClassDeclaration() {
    traverse(this.baseTree, {
      ClassDeclaration: (p) => {
        if(this.classDec !== null) return;
        this.classDec = p.node;
      }
    })
  }

  createRender(template: string) {
    if(this.classDec == null) return;
    const jsx: Babel.Program = <any>compile(template, {isJSX: true});
    const mt = Babel.classMethod(
      "method",
      Babel.identifier("render"),
      [],
      Babel.blockStatement([
        Babel.returnStatement((<Babel.ExpressionStatement>jsx.body[0]).expression)
      ])
    );
    this.classDec.body.body.push(mt);
  }

  clean() {
    traverse(this.baseTree, {
      ClassMethod: (p) => {
        this.sanitizeFunction(p, p.node);
      }
    })
  }

  createHelpers() {
    this.component.helpers.forEach((helper) => {
      if(helper.id == null || this.classDec == null) return;
      let ctr = Babel.classMethod(
        "method",
        helper.id,
        helper.params,
        helper.body,
        false,
        false,
        helper.generator,
        helper.async
      );
      this.classDec.body.body.push(ctr);
    });
  }

  createEvents() {
    this.component.events.forEach((event) => {
      if(event.fun.id == null || this.classDec == null) return;
      let ctr = Babel.classMethod(
        "method",
        event.fun.id,
        event.fun.params,
        event.fun.body,
        false,
        false,
        event.fun.generator,
        event.fun.async
      );
      Babel.addComment(ctr, "leading", `event: ${event.event} ${event.selector}`);
      this.classDec.body.body.push(ctr);
    });
  }

  createFunctions() {
    this.component.funcs.forEach((fun) => {
      if(fun.id == null || this.classDec == null) return;
      let ctr = Babel.classMethod(
        "method",
        fun.id,
        fun.params,
        fun.body,
        false,
        false,
        fun.generator,
        fun.async
      );
      this.classDec.body.body.push(ctr);
    });
  }

  createConstructor() {
    if(this.classDec == null) return;
    let ctr: Babel.ClassMethod | null = null;
    if(this.component.constructr !== null) {
      // Création de la méthode
      ctr = Babel.classMethod(
        "constructor",
        Babel.identifier("constructor"),
        [Babel.identifier("props")],
        this.component.constructr.body,
      );
    } else {
      ctr = Babel.classMethod(
        "constructor",
        Babel.identifier("constructor"),
        [Babel.identifier("props")],
        Babel.blockStatement([]),
      );
    }

    // Ajout super
    let sup = Babel.expressionStatement(Babel.callExpression(Babel.identifier('super'), [Babel.identifier('props')]));
    ctr.body.body.splice(0, 0, sup);

    // Définition du state
    if(this.component.state.length > 0) {
      const expr = Babel.expressionStatement(
        Babel.assignmentExpression(
          "=", 
          Babel.memberExpression(Babel.thisExpression(), Babel.identifier('state')),
          Babel.objectExpression(
            this.component.state.map(state => Babel.objectProperty(Babel.identifier(state.name), state.defaultValue || Babel.nullLiteral()))
          )
        )
      );
      ctr.body.body.push(expr);
    }

    // bind des helpers 
    if(this.component.helpers.length > 0) {
      this.component.helpers.forEach((helper) => {
        if(helper.id == null) return;
        let expr: any = null;
        expr = (`this.${helper.id.name} = this.${helper.id.name}.bind(this)`);
        expr = Babel.expressionStatement(Parser.parseExpression(expr));
        if(ctr != null) ctr.body.body.push(expr);
      });
    }

    // bind des events 
    if(this.component.events.length > 0) {
      this.component.events.forEach((event) => {
        if(event.fun.id == null) return;
        let expr: any = null;
        expr = (`this.${event.fun.id.name} = this.${event.fun.id.name}.bind(this)`);
        expr = Babel.expressionStatement(Parser.parseExpression(expr));
        if(ctr != null) ctr.body.body.push(expr);
      });
    }

    // bind des funcs 
    if(this.component.funcs.length > 0) {
      this.component.funcs.forEach((fun) => {
        if(fun.id == null) return;
        let expr: any = null;
        expr = (`this.${fun.id.name} = this.${fun.id.name}.bind(this)`);
        expr = Babel.expressionStatement(Parser.parseExpression(expr));
        if(ctr != null) ctr.body.body.push(expr);
      });
    }
    this.classDec.body.body.push(ctr);
  }

  createDidMount() {
    if(this.component.didMount == null || this.classDec == null) return;
    const mt = Babel.classMethod(
      "method",
      Babel.identifier("componentDidMount"),
      this.component.didMount.params,
      this.component.didMount.body
    );
    this.classDec.body.body.push(mt);
  }

  createWillUnmount() {
    if(this.component.willUnmount == null || this.classDec == null) return;
    const mt = Babel.classMethod(
      "method",
      Babel.identifier("componentWillUnmount"),
      this.component.willUnmount.params,
      this.component.willUnmount.body
    );
    this.classDec.body.body.push(mt);
  }

  private sanitizeFunction(path: NodePath<any>, fun: Babel.Function) {
    // Suppression de templateInstance dans la déclaration
    fun.params = fun.params.filter((e: Babel.Node) => (Babel.isIdentifier(e) == false || (<Babel.Identifier>e).name !== "templateInstance"));

    // Passage à this
    traverse(fun, {
      // Remplacement de templateInstance par this dans le corps
      Identifier: (p) => {
        const path: NodePath<Babel.Identifier> = p;
        const id: Babel.Identifier = path.node;
        if(id.name === "templateInstance") {
          path.replaceWith(<any>Babel.thisExpression());
        }
      },
      // Remplacement de Template.instance() par this dans le corps
      CallExpression: (p) => {
        const path: NodePath<Babel.CallExpression> = p;
        const cll: Babel.CallExpression = path.node;
        if(Babel.isMemberExpression(cll.callee)) {
          const member = <Babel.MemberExpression>cll.callee;
          if(Babel.isIdentifier(member.object) && (<Babel.Identifier>member.object).name == "Template") {
            if(Babel.isIdentifier(member.property) && (<Babel.Identifier>member.property).name == "instance") {
              path.replaceWith(Babel.thisExpression());
            }
          }
        }
      }
    }, path.scope, path.state, path.parentPath);

    // Passage à props
    traverse(this.baseTree, {
      MemberExpression: (p) => {
        const path: NodePath<Babel.MemberExpression> = p;
        const member: Babel.MemberExpression = path.node;
        let subject = null;
        if(Babel.isMemberExpression(member.object)) {
          subject = <any>member.object;

          // Template.instance(), templateInstance ou this
          if(Babel.isThisExpression(subject.object) == false) return;       
        } else if (Babel.isThisExpression(member.object)) {
          subject = member;
        } else {
          return;
        }
        // .data
        if((Babel.isIdentifier(subject.property) && (<Babel.Identifier>subject.property).name === "data") == false) return;
        if(Babel.isIdentifier(member.property) == false) return;
        (<Babel.Identifier>subject.property).name = "props";
      }
    });

    // Passage à setState 
    traverse(this.baseTree, {
      Identifier: (p) => {
        const path: NodePath<Babel.Identifier> = p;
        const id: Babel.Identifier = path.node;
        if(this.component.state.findIndex(s => s.name === id.name) === -1) return;
        const cll = path.findParent(path => path.node.type == "CallExpression");
        if(cll == null) return;
        const nd: Babel.CallExpression = <any>cll.node;
        if(Babel.isMemberExpression(nd.callee) == false) return;
        if(Babel.isIdentifier((<Babel.MemberExpression>nd.callee).property) == false) return;
        if((<Babel.Identifier>(<any>nd.callee).property).name === "set") {
          const sta = Babel.expressionStatement(
            Babel.callExpression(
              Babel.memberExpression(Babel.thisExpression(), Babel.identifier('setState')),
              [
                Babel.objectExpression(
                  [
                    Babel.objectProperty(
                      id,
                      nd.arguments.length > 0 ? <any>nd.arguments[0] : Babel.nullLiteral()
                    )
                  ]
                )
              ]
            )
          );
          cll.replaceWith(sta);
        } else if((<Babel.Identifier>(<any>nd.callee).property).name === "get") {
          const sta = Parser.parseExpression(`this.state.${id.name}`);
          cll.replaceWith(sta);
        }
      }
    });

    // Suppression des assignements ReactiveVar
    traverse(this.baseTree, {
      Identifier: (p) => {
        const path: NodePath<Babel.Identifier> = p;
        const id: Babel.Identifier = path.node;
        if(id.name !== "ReactiveVar" && id.name !== "ReactiveDict") return;
        const cll = path.findParent(path => path.node.type == "AssignmentExpression");
        if(cll == null) return;
        cll.remove();
      }
    })
  }
}