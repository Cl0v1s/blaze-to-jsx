"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Babel = require("@babel/types");
var Parser = require("@babel/parser");
var traverse_1 = require("@babel/traverse");
var generator_1 = require("@babel/generator");
var Converter = /** @class */ (function () {
    function Converter(baseContent, component) {
        this.classDec = null;
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
        this.generate();
    }
    Converter.prototype.generate = function () {
        console.log(generator_1.default(this.baseTree, {}, undefined));
    };
    Converter.prototype.findClassDeclaration = function () {
        var _this = this;
        traverse_1.default(this.baseTree, {
            ClassDeclaration: function (p) {
                if (_this.classDec !== null)
                    return;
                _this.classDec = p.node;
            }
        });
    };
    Converter.prototype.clean = function () {
        var _this = this;
        traverse_1.default(this.baseTree, {
            ClassMethod: function (p) {
                _this.sanitizeFunction(p, p.node);
            }
        });
    };
    Converter.prototype.createHelpers = function () {
        var _this = this;
        this.component.helpers.forEach(function (helper) {
            if (helper.id == null || _this.classDec == null)
                return;
            var ctr = Babel.classMethod("method", helper.id, helper.params, helper.body, false, false, helper.generator, helper.async);
            _this.classDec.body.body.push(ctr);
        });
    };
    Converter.prototype.createEvents = function () {
        var _this = this;
        this.component.events.forEach(function (event) {
            if (event.fun.id == null || _this.classDec == null)
                return;
            var ctr = Babel.classMethod("method", event.fun.id, event.fun.params, event.fun.body, false, false, event.fun.generator, event.fun.async);
            Babel.addComment(ctr, "leading", "event: " + event.event + " " + event.selector);
            _this.classDec.body.body.push(ctr);
        });
    };
    Converter.prototype.createFunctions = function () {
        var _this = this;
        this.component.funcs.forEach(function (fun) {
            if (fun.id == null || _this.classDec == null)
                return;
            var ctr = Babel.classMethod("method", fun.id, fun.params, fun.body, false, false, fun.generator, fun.async);
            _this.classDec.body.body.push(ctr);
        });
    };
    Converter.prototype.createConstructor = function () {
        if (this.classDec == null)
            return;
        var ctr = null;
        if (this.component.constructr !== null) {
            // Création de la méthode
            ctr = Babel.classMethod("constructor", Babel.identifier("constructor"), [Babel.identifier("props")], this.component.constructr.body);
        }
        else {
            ctr = Babel.classMethod("constructor", Babel.identifier("constructor"), [Babel.identifier("props")], Babel.blockStatement([]));
        }
        // Ajout super() on doit tricher 
        var sup = Babel.expressionStatement(Babel.callExpression(Babel.identifier('super'), [Babel.identifier('props')]));
        ctr.body.body.splice(0, 0, sup);
        // Définition du state
        if (this.component.state.length > 0) {
            var state_1 = {};
            this.component.state.forEach(function (s) {
                state_1[s.name] = s.defaultValue === undefined ? null : s.defaultValue;
            });
            state_1 = Babel.expressionStatement(Parser.parseExpression("this.state = " + JSON.stringify(state_1)));
            ctr.body.body.push(state_1);
        }
        // bind des helpers 
        if (this.component.helpers.length > 0) {
            this.component.helpers.forEach(function (helper) {
                if (helper.id == null)
                    return;
                var expr = null;
                expr = ("this." + helper.id.name + " = this." + helper.id.name + ".bind(this)");
                expr = Babel.expressionStatement(Parser.parseExpression(expr));
                if (ctr != null)
                    ctr.body.body.push(expr);
            });
        }
        // bind des events 
        if (this.component.events.length > 0) {
            this.component.events.forEach(function (event) {
                if (event.fun.id == null)
                    return;
                var expr = null;
                expr = ("this." + event.fun.id.name + " = this." + event.fun.id.name + ".bind(this)");
                expr = Babel.expressionStatement(Parser.parseExpression(expr));
                if (ctr != null)
                    ctr.body.body.push(expr);
            });
        }
        // bind des funcs 
        if (this.component.funcs.length > 0) {
            this.component.funcs.forEach(function (fun) {
                if (fun.id == null)
                    return;
                var expr = null;
                expr = ("this." + fun.id.name + " = this." + fun.id.name + ".bind(this)");
                expr = Babel.expressionStatement(Parser.parseExpression(expr));
                if (ctr != null)
                    ctr.body.body.push(expr);
            });
        }
        this.classDec.body.body.push(ctr);
    };
    Converter.prototype.createDidMount = function () {
        if (this.component.didMount == null || this.classDec == null)
            return;
        var mt = Babel.classMethod("method", Babel.identifier("componentDidMount"), this.component.didMount.params, this.component.didMount.body);
        this.classDec.body.body.push(mt);
    };
    Converter.prototype.createWillUnmount = function () {
        if (this.component.willUnmount == null || this.classDec == null)
            return;
        var mt = Babel.classMethod("method", Babel.identifier("componentWillUnmount"), this.component.willUnmount.params, this.component.willUnmount.body);
        this.classDec.body.body.push(mt);
    };
    Converter.prototype.sanitizeFunction = function (path, fun) {
        var _this = this;
        // Suppression de templateInstance dans la déclaration
        fun.params = fun.params.filter(function (e) { return (Babel.isIdentifier(e) == false || e.name !== "templateInstance"); });
        // Passage à this
        traverse_1.default(fun, {
            // Remplacement de templateInstance par this dans le corps
            Identifier: function (p) {
                var path = p;
                var id = path.node;
                if (id.name === "templateInstance") {
                    path.replaceWith(Babel.thisExpression());
                }
            },
            // Remplacement de Template.instance() par this dans le corps
            CallExpression: function (p) {
                var path = p;
                var cll = path.node;
                if (Babel.isMemberExpression(cll.callee)) {
                    var member = cll.callee;
                    if (Babel.isIdentifier(member.object) && member.object.name == "Template") {
                        if (Babel.isIdentifier(member.property) && member.property.name == "instance") {
                            path.replaceWith(Babel.thisExpression());
                        }
                    }
                }
            }
        }, path.scope, path.state, path.parentPath);
        // Passage à props
        traverse_1.default(this.baseTree, {
            MemberExpression: function (p) {
                var path = p;
                var member = path.node;
                if (Babel.isMemberExpression(member.object) == false)
                    return;
                var subject = member.object;
                // Template.instance(), templateInstance ou this
                if (Babel.isThisExpression(subject.object) == false)
                    return;
                // .data
                if ((Babel.isIdentifier(subject.property) && subject.property.name === "data") == false)
                    return;
                if (Babel.isIdentifier(member.property) == false)
                    return;
                subject.property.name = "props";
            }
        });
        // Passage à setState 
        traverse_1.default(this.baseTree, {
            Identifier: function (p) {
                var path = p;
                var id = path.node;
                if (_this.component.state.findIndex(function (s) { return s.name === id.name; }) === -1)
                    return;
                var cll = path.findParent(function (path) { return path.node.type == "CallExpression"; });
                if (cll == null)
                    return;
                var nd = cll.node;
                if (Babel.isMemberExpression(nd.callee) == false)
                    return;
                if (Babel.isIdentifier(nd.callee.property) == false)
                    return;
                if (nd.callee.property.name === "set") {
                    var sta = Babel.expressionStatement(Babel.callExpression(Babel.memberExpression(Babel.thisExpression(), Babel.identifier('setState')), [
                        Babel.objectExpression([
                            Babel.objectProperty(id, nd.arguments.length > 0 ? nd.arguments[0] : Babel.nullLiteral())
                        ])
                    ]));
                    cll.replaceWith(sta);
                }
                else if (nd.callee.property.name === "get") {
                    var sta = Parser.parseExpression("this.state." + id.name);
                    cll.replaceWith(sta);
                }
            }
        });
    };
    return Converter;
}());
exports.default = Converter;
