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
                            if (Babel.isLiteral(clss.value) && Babel.isNullLiteral(clss.value) == false) {
                                literals_1.push(clss.value);
                            }
                            else {
                                traverse_1.default(clss.value, {
                                    Literal: function (p) {
                                        if (Babel.isNullLiteral(p.node))
                                            return;
                                        literals_1.push(p.node);
                                    },
                                }, path.scope, path.state);
                            }
                            literals_1 = literals_1.filter(function (l) { return l.value.toString().indexOf(selector.name) !== -1; });
                            return literals_1.length > 0;
                        }
                        case 'idSelector': {
                            var clss = element.openingElement.attributes.find(function (c) {
                                return Babel.isJSXAttribute(c)
                                    && Babel.isJSXIdentifier(c.name)
                                    && c.name.name === "id";
                            });
                            if (clss == null || clss.value == null)
                                return false;
                            var literals_2 = [];
                            if (Babel.isLiteral(clss.value) && Babel.isNullLiteral(clss.value) == false) {
                                literals_2.push(clss.value);
                            }
                            else {
                                traverse_1.default(clss.value, {
                                    Literal: function (p) {
                                        if (Babel.isNullLiteral(p.node))
                                            return;
                                        literals_2.push(p.node);
                                    },
                                }, path.scope, path.state);
                            }
                            literals_2 = literals_2.filter(function (l) { return l.value.toString().indexOf(selector.name) !== -1; });
                            return literals_2.length > 0;
                        }
                        case "attributePresenceSelector": {
                            var attr = element.openingElement.attributes.find(function (c) {
                                return Babel.isJSXAttribute(c)
                                    && Babel.isJSXIdentifier(c.name)
                                    && c.name.name === selector.name;
                            });
                            if (attr == null)
                                return false;
                            return true;
                        }
                        case "attributeValueSelector": {
                            //console.warn("Usage of attributeValueSelector: this selector is usually useful at runtime. Please check the Event Binders are correctly created on "+JSON.stringify(this.selector));
                            var attr = element.openingElement.attributes.find(function (c) {
                                return Babel.isJSXAttribute(c)
                                    && Babel.isJSXIdentifier(c.name)
                                    && c.name.name === selector.name;
                            });
                            if (attr == null)
                                return false;
                            var literals_3 = [];
                            if (Babel.isLiteral(attr.value) && Babel.isNullLiteral(attr.value) == false) {
                                literals_3.push(attr.value);
                            }
                            else {
                                traverse_1.default(attr.value, {
                                    Literal: function (p) {
                                        if (Babel.isNullLiteral(p.node))
                                            return;
                                        literals_3.push(p.node);
                                    },
                                }, path.scope, path.state);
                            }
                            var value = literals_3.map(function (l) { return l.value.toString(); }).join(' ').trim();
                            switch (selector.operator) {
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
                                    return value === selector.value || value.startsWith(selector.value + '-');
                                }
                                default: {
                                    throw new Error("Unknow attributeValueSelector operator " + JSON.stringify(selector));
                                }
                            }
                            break;
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
