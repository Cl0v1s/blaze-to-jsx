"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Babel = require("@babel/types");
var traverse_1 = require("@babel/traverse");
var scalpel_1 = require("scalpel");
var Selector = /** @class */ (function () {
    function Selector(selector, ast) {
        var parser = scalpel_1.createParser();
        this.selector = parser.parse(selector);
        this.ast = ast;
    }
    Selector.prototype.search = function () {
        var _this = this;
        var results = [];
        traverse_1.default(this.ast, {
            JSXElement: function (path) {
                var result = _this.explore(path, 0);
                if (result != null)
                    results.push(result);
            }
        });
        return results;
    };
    Selector.prototype.explore = function (path, level) {
        if (level >= this.selector.length)
            return null;
        var element = path.node;
        var levelSelector = this.selector[level];
        switch (levelSelector.type) {
            case "selector": {
                var valids = levelSelector.body.map(function (selector) {
                    switch (selector.type) {
                        case 'typeSelector': {
                            return Babel.isJSXIdentifier(element.openingElement.name)
                                && element.openingElement.name.name === selector.name;
                        }
                        case 'classSelector': {
                            var clss = element.openingElement.attributes.find(function (c) {
                                return Babel.isJSXAttribute(c)
                                    && Babel.isJSXIdentifier(c.name)
                                    && c.name.name === "className";
                            });
                            if (clss == null || clss.value == null)
                                return false;
                            var literals_1 = [];
                            traverse_1.default(clss.value, {
                                StringLiteral: function (p) {
                                    if (Babel.isNullLiteral(p.node))
                                        return;
                                    literals_1.push(p.node);
                                },
                            }, path.scope, path.state);
                            literals_1 = literals_1.filter(function (l) { return l.value.indexOf(selector.name) !== -1; });
                            return literals_1.length > 0;
                        }
                        default: {
                            throw new Error("Unknow selector " + JSON.stringify(selector));
                        }
                    }
                });
                if (valids.filter(function (e) { return e == false; }).length > 0)
                    return null;
                break;
            }
            case "childCombinator":
            case "descendantCombinator": {
                return this.explore(path, level + 1);
            }
            default: {
                throw new Error("Unknow selector type " + JSON.stringify(levelSelector));
            }
        }
        if (level < this.selector.length - 1)
            return this.explore(path, level + 1);
        else
            return element;
    };
    return Selector;
}());
exports.default = Selector;
