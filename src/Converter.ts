import { EventBind, Component } from './Component';
import * as Babel from '@babel/types';
import * as Parser from '@babel/parser';
import traverse from "@babel/traverse";
import { NodePath } from '@babel/traverse';
import generate from '@babel/generator';

export default class Converter {

  baseTree: Babel.File;
  component: Component;
  classDec: Babel.ClassDeclaration | null = null;

  constructor(baseContent: string, component: Component) {
    this.baseTree = Parser.parse(baseContent, {
      sourceType: 'module',
    });
    this.component = component;

    this.findClassDeclaration();

    this.createConstructor();
    this.createDidMount();
    this.createWillUnmount();

    this.generate();
  }

  generate() {
    console.log(generate(this.baseTree, {}, undefined));
  }

  private findClassDeclaration() {
    traverse(this.baseTree, {
      ClassDeclaration: (p) => {
        if(this.classDec !== null) return;
        this.classDec = p.node;
      }
    })
  }

  createConstructor() {
    if(this.classDec == null) return;
    let ctr: Babel.ClassMethod | null = null;
    if(this.component.constructr !== null) {
      // Création de la méthode
      ctr = Babel.classMethod(
        "constructor",
        Babel.identifier("constructor"),
        this.component.constructr.params,
        this.component.constructr.body,
      );
    } else {
      ctr = Babel.classMethod(
        "constructor",
        Babel.identifier("constructor"),
        [],
        Babel.blockStatement([]),
      );
    }

    // Définition du state
    if(this.component.state.length > 0) {
      let state: any = {};
      this.component.state.forEach((s) => {
        state[s.name] = s.defaultValue === undefined ? null : s.defaultValue;
      });
      state = Parser.parseExpression(`this.state = ${JSON.stringify(state)}`);
      ctr.body.body.push(state);
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



  private sanitizeFunction(path: NodePath<any>, fun: Babel.FunctionDeclaration) {
    // Suppression de templateInstance dans la déclaration
    fun.params = fun.params.filter((e: Babel.Node) => (Babel.isIdentifier(e) == false || (<Babel.Identifier>e).name !== "templateInstance"));

    traverse(fun, {
      // Remplacement de templateInstance par this dans le corps
      Identifier: (p) => {
        const path: NodePath<Babel.Identifier> = p;
        const id: Babel.Identifier = path.node;
        if(id.name === "templateInstance") path.node = <any>Babel.thisExpression();
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
}