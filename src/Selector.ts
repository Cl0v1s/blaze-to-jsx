import * as Babel from '@babel/types';
import traverse, { NodePath } from "@babel/traverse";

import { createParser } from 'scalpel';

export default class Selector {

  selector: any;
  ast: Babel.File;

  constructor(selector: string, ast: Babel.File) {
    const parser = createParser();
    this.selector = parser.parse(selector);
    this.ast = ast;
  }

  search() {
    let results: Babel.JSXElement[] = [];
    traverse(this.ast, {
      JSXElement: (path) => {
        const result = this.explore(path, 0);
        if(result != null) results.push(result);
      }
    });
    return results;
  }

  explore(path: NodePath<Babel.JSXElement>, level: number): Babel.JSXElement | null {
    if(level >= this.selector.length) return null;
    const element: Babel.JSXElement = path.node;
    const levelSelector: any = this.selector[level];

    switch(levelSelector.type) {
      case "selector": {
        const valids: boolean[] = levelSelector.body.map((selector: any) => {
          switch(selector.type) {
            case 'typeSelector': {
              return Babel.isJSXIdentifier(element.openingElement.name) 
              && (<Babel.JSXIdentifier>element.openingElement.name).name === selector.name;
            }
            case 'classSelector': {
              const clss: Babel.JSXAttribute = <any>element.openingElement.attributes.find((c: Babel.JSXAttribute | Babel.JSXSpreadAttribute) => {
                return Babel.isJSXAttribute(c)
                && Babel.isJSXIdentifier(c.name) 
                && (<Babel.JSXIdentifier>c.name).name === "className";
              });
              if(clss == null || clss.value == null) return false;
              let literals: Babel.StringLiteral[] = [];
              traverse(<Babel.Node>clss.value, {
                StringLiteral: (p) => {
                  if(Babel.isNullLiteral(p.node)) return;
                  literals.push(p.node)
                },
              }, path.scope, path.state);
              literals = literals.filter(l => l.value.indexOf(selector.name) !== -1);
              return literals.length > 0;
            }
            default: {
              throw new Error(`Unknow selector `+JSON.stringify(selector));
            }
          }
        });

        if(valids.filter(e => e == false).length > 0) return null;
        break;
      }
      case "childCombinator":
      case "descendantCombinator": {
        return this.explore(path, level+1);
      }
      default: {
        throw new Error(`Unknow selector type `+JSON.stringify(levelSelector));
      }
    }

    if(level < this.selector.length - 1) return this.explore(path, level+1);
    else return element;

  }
}