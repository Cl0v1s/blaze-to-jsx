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
              let literals: Babel.Literal[] = [];
              if(Babel.isLiteral(clss.value) && Babel.isNullLiteral(clss.value) == false) {
                literals.push(clss.value);
              } else {
                traverse(<Babel.Node>clss.value, {
                  Literal: (p) => {
                    if(Babel.isNullLiteral(p.node)) return;
                    literals.push(p.node)
                  },
                }, path.scope, path.state);
              }
              literals = literals.filter(l => (<any>l).value.toString().indexOf(selector.name) !== -1);
              return literals.length > 0;
            }
            case 'idSelector': {
              const clss: Babel.JSXAttribute = <any>element.openingElement.attributes.find((c: Babel.JSXAttribute | Babel.JSXSpreadAttribute) => {
                return Babel.isJSXAttribute(c)
                && Babel.isJSXIdentifier(c.name) 
                && (<Babel.JSXIdentifier>c.name).name === "id";
              });
              if(clss == null || clss.value == null) return false;
              let literals: Babel.Literal[] = [];
              if(Babel.isLiteral(clss.value) && Babel.isNullLiteral(clss.value) == false) {
                literals.push(clss.value);
              } else {
                traverse(<Babel.Node>clss.value, {
                  Literal: (p) => {
                    if(Babel.isNullLiteral(p.node)) return;
                    literals.push(p.node)
                  },
                }, path.scope, path.state);
              }
              literals = literals.filter(l => (<any>l).value.toString().indexOf(selector.name) !== -1);
              return literals.length > 0;
            }
            case "attributePresenceSelector": {
              const attr: Babel.JSXAttribute = <any>element.openingElement.attributes.find((c: Babel.JSXAttribute | Babel.JSXSpreadAttribute) => {
                  return Babel.isJSXAttribute(c)
                      && Babel.isJSXIdentifier(c.name)
                      && (<Babel.JSXIdentifier>c.name).name === selector.name;
              });
              if (attr == null) return false;
              return true;
            }
            case "attributeValueSelector": {
              //console.warn("Usage of attributeValueSelector: this selector is usually useful at runtime. Please check the Event Binders are correctly created on "+JSON.stringify(this.selector));
              const attr: Babel.JSXAttribute = <any>element.openingElement.attributes.find((c: Babel.JSXAttribute | Babel.JSXSpreadAttribute) => {
                return Babel.isJSXAttribute(c)
                && Babel.isJSXIdentifier(c.name) 
                && (<Babel.JSXIdentifier>c.name).name === selector.name;
              });
              if(attr == null) return false;
              let literals: Babel.Literal[] = [];
              if(Babel.isLiteral(attr.value) && Babel.isNullLiteral(attr.value) == false) {
                literals.push(attr.value);
              } else {
                traverse(<Babel.Node>attr.value, {
                  Literal: (p) => {
                    if(Babel.isNullLiteral(p.node)) return;
                    literals.push(p.node)
                  },
                }, path.scope, path.state);
              }
              const value = literals.map(l => (<any>l).value.toString()).join(' ').trim();
              switch(selector.operator) {
                case "=": {
                  return value === selector.value;
                }
                case "~=": // Pas exactement ça mais ça devrait suffire dans notre cas
                case "*=": {
                  return value.indexOf(selector.value) !== -1;
                }
                case "$=": {
                  return value.endsWith(selector.value);
                }
                case "^=": {
                  return value.startsWith(selector.value);
                }
                case "|=": {
                  return value === selector.value || value.startsWith(selector.value+'-');
                }
                default: {
                  throw new Error(`Unknow attributeValueSelector operator `+JSON.stringify(selector));
                }
              }
              break;
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