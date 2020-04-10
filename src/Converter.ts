import { EventBind, Component } from './Component';
import * as Babel from '@babel/types';
import * as Parser from '@babel/parser';
import traverse from "@babel/traverse";
import { NodePath } from '@babel/traverse';
import generate from '@babel/generator';

import { compile } from '@synapse-medicine/spacebars-to-jsx'
import Selector from './Selector';

export default class Converter {

  baseTree: Babel.File;
  component: Component;
  classDec: Babel.ClassDeclaration | null = null;
  globalIdentifiers: string[] = []
  disambiguiationDict: string[] = []

  constructor(baseContent: string, component: Component, template: Babel.Program, globalIdentifiers = [], disambiguiationDict = []) {
    this.globalIdentifiers = globalIdentifiers;
    this.disambiguiationDict = disambiguiationDict;
    this.baseTree = Parser.parse(baseContent, {
      sourceType: 'module',
    });
    this.component = component;

    this.createImports();
    this.findClassDeclaration();
    this.createConstructor();
    this.createDidMount();
    this.createWillUnmount();

    this.createHelpers();
    this.createEvents();
    this.createFunctions();

    this.clean();

    this.createRender(template);
  }

  generate() {
    this.baseTree.program.body.push(
      Babel.exportDefaultDeclaration((<Babel.ClassDeclaration>this.classDec).id)
    );
    return generate(this.baseTree, {}, undefined).code;
  }

  private findClassDeclaration() {
    traverse(this.baseTree, {
      ClassDeclaration: (p) => {
        if(this.classDec !== null) return;
        this.classDec = p.node;
      }
    })
  }

  private isAFunction(id: Babel.Identifier): boolean {
    const name = id.name;
    if(this.component.helpers.findIndex(f => f.id != null && f.id.name === name ) !== -1) return true;
    if(this.component.events.findIndex(e => e.fun.id != null && e.fun.id.name === name ) !== -1) return true;
    if(this.component.funcs.findIndex(fun => fun.id != null && fun.id.name === name ) !== -1) return true;
    return false;
  }

  private isAProp(id: Babel.Identifier): boolean {
    const name = id.name;
    if(this.component.props.findIndex(p => p === name) !== -1) return true;
    // Si n'est pas connu comme prop on cherche dans le dico de désambiguation
    if(this.disambiguiationDict.findIndex(p => p == name) !== -1) return true;
    return false;
  }

  private replaceIdentifiers(_jsx: Babel.Program) {
    const jsx: Babel.File = Babel.file(_jsx, [], []);
    const functions: NodePath<Babel.Identifier>[] = [];
    const props: NodePath<Babel.Identifier>[] = [];
    traverse(jsx, {
      Identifier: (p) => {
        const path: NodePath<Babel.Identifier> = p;
        const id: Babel.Identifier = path.node;
        if(this.isAFunction(id) == false) {
          if(this.globalIdentifiers.indexOf(id.name) !== -1) return;
          if(this.isAProp(id)) props.push(path); 
          else {
            Babel.addComment(this.baseTree.program, "leading", " Ambiguous identifier in JSX: "+id.name+" ");
            console.warn("Ambiguous identifier in JSX: "+id.name);
          }
        } else {
          const parent = path.parent;
          if(parent.type === "MemberExpression" && parent.property == path.node) return;
          functions.push(path);
        }
      }
    });
    // Gestion des props
    props.forEach(path => {
      // Gestion des cas ou on aurait une fonction d'un objet (array par ex) qui porterait le même nom qu'une prop
      if(Babel.isMemberExpression(path.parent) && (<Babel.MemberExpression>path.parent).property == path.node) return;
      path.replaceWith(
        Babel.memberExpression(
          Babel.memberExpression(
            Babel.thisExpression(),
            Babel.identifier("props"),
          ),
          path.node
        )
      )
    });

    // Gestion des fonctions
    functions.forEach(path => {
      const parent: Babel.CallExpression = <any>path.parent;
      if(parent.callee !== path.node) {
        path.replaceWith(
          Babel.callExpression(
            Babel.memberExpression(
              Babel.thisExpression(),
              path.node
            ),
            []
          )
        )
      } else {
        path.parentPath.replaceWith(
          Babel.callExpression(
            Babel.memberExpression(
              Babel.thisExpression(),
              path.node,
            ),
            parent.arguments
          )
        )
      }
    })
  }

  createImports() {
    this.component.imports.forEach((imp: Babel.ImportDeclaration) => {
      // import local
      if(imp.source.value.indexOf('.') !== -1)
      {
        Babel.addComment(this.baseTree.program, "leading", ` originally imports ${imp.source.value} `);
      } else {
        this.baseTree.program.body.splice(0, 0, imp);
      }
    });
  }

  bindEvents(jsx: Babel.Program) {
    this.component.events.forEach((event) => {
      const selector = new Selector(event.selector, Babel.file(jsx, [], []));
      const results: Babel.JSXElement[] = selector.search();
      if(results.length <= 0) {
        console.warn("Event Target not found: "+event.selector);
        Babel.addComment(this.baseTree.program, "leading", " Event Target not found: "+event.event+":"+event.selector+" ");
      }
      results.forEach((result) => {
        result.openingElement.attributes.push(
          Babel.jsxAttribute(
            Babel.jsxIdentifier(event.event),
            Babel.jsxExpressionContainer(
              Babel.memberExpression(
                Babel.thisExpression(),
                Babel.identifier((<Babel.Identifier>event.fun.id).name)
              )
            )
          )
        );
      });
    });
  }

  createName(_jsx: Babel.Program) {
    const jsx: Babel.File = Babel.file(_jsx, [], []);
    traverse(jsx, {
      JSXOpeningElement: (p) => {
        if(this.classDec == null) return;
        const element = p.node;
        if(Babel.isJSXIdentifier(element.name) == false || (<Babel.JSXIdentifier>element.name).name !== "template") return;
        let attr: any = <any>element.attributes.filter((_at) => {
          if(Babel.isJSXAttribute(_at) == false) return false;
          const at: Babel.JSXAttribute = <any>_at;
          if(Babel.isJSXIdentifier(at.name) == false || (<Babel.JSXIdentifier>at.name).name !== "name") return false;
          return true;
        });
        if(attr.length <= 0) return;
        attr = attr[0];
        let name = attr.value.value;
        name = name.replace(/(?:^|\s)\S/g, function(a: string) { return a.toUpperCase(); });
        if((<Babel.Identifier>this.classDec.id).name !== "__MyComponent") throw new Error('Trying to convert file with multiple components. Aborting.');
        this.classDec.id = Babel.identifier(
          name
        )
        element.name = Babel.jsxIdentifier('div');
        (<Babel.JSXClosingElement>(<Babel.JSXElement>p.parentPath.node).closingElement).name = Babel.jsxIdentifier('div');
      }
    });
  }

  createRender(jsx: Babel.Program) {
    if(this.classDec == null) return;
    this.replaceIdentifiers(jsx);
    this.bindEvents(jsx);
    this.createName(jsx);
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
        if(path.parent.type == "VariableDeclarator") return;
        if(id.name === "templateInstance") {
          // Dans le cas on a une fonction qui se nomme templateInstance
          // On se retrouve avec this.templateInstance = this.templateInstance.bind(this)
          // On ne modifie pas ce templateInstance dans ce cas
          if(path.parent.type === "MemberExpression" && path.parent.object.type === "ThisExpression") return;
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