"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Parser = require("@babel/parser");
var Babel = require("@babel/types");
var traverse_1 = require("@babel/traverse");
var AST = /** @class */ (function () {
    function AST(code) {
        this.imports = [];
        this.funcs = [];
        this.constructr = null;
        this.didMount = null;
        this.willUnmount = null;
        this.tree = Parser.parse(code, {
            sourceType: 'module',
        });
        this.processImports();
        this.processFunctions();
        this.processLifeCycle();
    }
    AST.prototype.processImports = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            ImportDeclaration: function (p) {
                var path = p;
                var imp = path.node;
                _this.imports.push(imp);
            },
        });
    };
    AST.prototype.processLifeCycle = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            ExpressionStatement: function (p) {
                var path = p;
                var expr = path.node;
                if (Babel.isCallExpression(expr.expression) == false)
                    return;
                if (Babel.isMemberExpression(expr.expression.callee) == false)
                    return;
                if (Babel.isMemberExpression(expr.expression.callee.object) == false)
                    return;
                if (Babel.isIdentifier(expr.expression.callee.property) == false)
                    return;
                var cycle = expr.expression.callee.property;
                if (cycle.name == "onCreated")
                    _this.constructr = expr.expression.arguments[0];
                else if (cycle.name == "onRendered")
                    _this.didMount = expr.expression.arguments[0];
                else if (cycle.name == "onDestroyed")
                    _this.willUnmount = expr.expression.arguments[0];
            }
        });
        console.log(JSON.stringify(this.constructr, null, 2));
    };
    AST.prototype.processFunctions = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            FunctionDeclaration: function (p) {
                var path = p;
                var fun = path.node;
                // Si c'est une fonction utilitaire
                if (Babel.isProgram(path.parent)) {
                    _this.funcs.push(fun);
                    var parent_1 = p.parent;
                    parent_1.body = parent_1.body.filter(function (e) { return e != p.node; });
                }
                // Suppression de templateInstance dans la déclaration
                fun.params = fun.params.filter(function (e) { return (Babel.isIdentifier(e) == false || e.name !== "templateInstance"); });
                traverse_1.default(fun, {
                    // Remplacement de templateInstance par this dans le corps
                    Identifier: function (p) {
                        var path = p;
                        var id = path.node;
                        if (id.name === "templateInstance")
                            id.name = "this";
                    },
                    // Remplacement de Template.instance() par this dans le corps
                    CallExpression: function (p) {
                        var path = p;
                        var cll = path.node;
                        if (Babel.isMemberExpression(cll.callee)) {
                            var member = cll.callee;
                            if (Babel.isIdentifier(member.object) && member.object.name == "Template") {
                                if (Babel.isIdentifier(member.property) && member.property.name == "instance") {
                                    path.node = Babel.identifier("this");
                                }
                            }
                        }
                    }
                }, path.scope, path.state, path.parentPath);
            }
        });
        //console.log(JSON.stringify(this.funcs[0], null, 2));
    };
    return AST;
}());
exports.default = AST;
;
