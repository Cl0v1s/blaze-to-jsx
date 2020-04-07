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
    Converter.prototype.createConstructor = function () {
        if (this.classDec == null)
            return;
        var ctr = null;
        if (this.component.constructr !== null) {
            // Création de la méthode
            ctr = Babel.classMethod("constructor", Babel.identifier("constructor"), this.component.constructr.params, this.component.constructr.body);
        }
        else {
            ctr = Babel.classMethod("constructor", Babel.identifier("constructor"), [], Babel.blockStatement([]));
        }
        // Ajout super() on doit tricher 
        var sup = Babel.expressionStatement(Babel.callExpression(Babel.identifier('super'), []));
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
        // Suppression de templateInstance dans la déclaration
        fun.params = fun.params.filter(function (e) { return (Babel.isIdentifier(e) == false || e.name !== "templateInstance"); });
        traverse_1.default(fun, {
            // Remplacement de templateInstance par this dans le corps
            Identifier: function (p) {
                var path = p;
                var id = path.node;
                if (id.name === "templateInstance")
                    path.node = Babel.thisExpression();
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
    };
    return Converter;
}());
exports.default = Converter;
