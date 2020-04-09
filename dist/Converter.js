"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Babel = require("@babel/types");
var Parser = require("@babel/parser");
var traverse_1 = require("@babel/traverse");
var generator_1 = require("@babel/generator");
var Selector_1 = require("./Selector");
var Converter = /** @class */ (function () {
    function Converter(baseContent, component, template, globalIdentifiers, disambiguiationDict) {
        if (globalIdentifiers === void 0) { globalIdentifiers = []; }
        if (disambiguiationDict === void 0) { disambiguiationDict = []; }
        this.classDec = null;
        this.globalIdentifiers = [];
        this.disambiguiationDict = [];
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
    Converter.prototype.generate = function () {
        this.baseTree.program.body.push(Babel.exportDefaultDeclaration(this.classDec.id));
        return generator_1.default(this.baseTree, {}, undefined).code;
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
    Converter.prototype.isAFunction = function (id) {
        var name = id.name;
        if (this.component.helpers.findIndex(function (f) { return f.id != null && f.id.name === name; }) !== -1)
            return true;
        if (this.component.events.findIndex(function (e) { return e.fun.id != null && e.fun.id.name === name; }) !== -1)
            return true;
        if (this.component.funcs.findIndex(function (fun) { return fun.id != null && fun.id.name === name; }) !== -1)
            return true;
        return false;
    };
    Converter.prototype.isAProp = function (id) {
        var name = id.name;
        if (this.component.props.findIndex(function (p) { return p === name; }) !== -1)
            return true;
        // Si n'est pas connu comme prop on cherche dans le dico de désambiguation
        if (this.disambiguiationDict.findIndex(function (p) { return p == name; }) !== -1)
            return true;
        return false;
    };
    Converter.prototype.replaceIdentifiers = function (_jsx) {
        var _this = this;
        var jsx = Babel.file(_jsx, [], []);
        var functions = [];
        var props = [];
        traverse_1.default(jsx, {
            Identifier: function (p) {
                var path = p;
                var id = path.node;
                if (_this.isAFunction(id) == false) {
                    if (_this.globalIdentifiers.indexOf(id.name) !== -1)
                        return;
                    if (_this.isAProp(id))
                        props.push(path);
                    else {
                        Babel.addComment(_this.baseTree.program, "leading", " Ambiguous identifier in JSX: " + id.name + " ");
                        console.warn("Ambiguous identifier in JSX: " + id.name);
                    }
                }
                else {
                    if (path.parent.type !== "CallExpression")
                        return;
                    functions.push(path);
                }
            }
        });
        // Gestion des props
        props.forEach(function (path) {
            // Gestion des cas ou on aurait une fonction d'un objet (array par ex) qui porterait le même nom qu'une prop
            if (Babel.isMemberExpression(path.parent) && path.parent.property == path.node)
                return;
            path.replaceWith(Babel.memberExpression(Babel.memberExpression(Babel.thisExpression(), Babel.identifier("props")), path.node));
        });
        // Gestion des fonctions
        functions.forEach(function (path) {
            var parent = path.parent;
            if (parent.callee !== path.node) {
                path.replaceWith(Babel.callExpression(Babel.memberExpression(Babel.thisExpression(), path.node), []));
            }
            else {
                path.parentPath.replaceWith(Babel.callExpression(Babel.memberExpression(Babel.thisExpression(), path.node), parent.arguments));
            }
        });
    };
    Converter.prototype.createImports = function () {
        var _this = this;
        this.component.imports.forEach(function (imp) {
            // import local
            if (imp.source.value.indexOf('.') !== -1) {
                Babel.addComment(_this.baseTree.program, "leading", " originally imports " + imp.source.value + " ");
            }
            else {
                _this.baseTree.program.body.splice(0, 0, imp);
            }
        });
    };
    Converter.prototype.bindEvents = function (jsx) {
        var _this = this;
        this.component.events.forEach(function (event) {
            var selector = new Selector_1.default(event.selector, Babel.file(jsx, [], []));
            var results = selector.search();
            if (results.length <= 0) {
                console.warn("Event Target not found: " + event.selector);
                Babel.addComment(_this.baseTree.program, "leading", " Event Target not found: " + event.event + ":" + event.selector + " ");
            }
            results.forEach(function (result) {
                result.openingElement.attributes.push(Babel.jsxAttribute(Babel.jsxIdentifier(event.event), Babel.jsxExpressionContainer(Babel.memberExpression(Babel.thisExpression(), Babel.identifier(event.fun.id.name)))));
            });
        });
    };
    Converter.prototype.createName = function (_jsx) {
        var _this = this;
        var jsx = Babel.file(_jsx, [], []);
        traverse_1.default(jsx, {
            JSXOpeningElement: function (p) {
                if (_this.classDec == null)
                    return;
                var element = p.node;
                if (Babel.isJSXIdentifier(element.name) == false || element.name.name !== "template")
                    return;
                var attr = element.attributes.filter(function (_at) {
                    if (Babel.isJSXAttribute(_at) == false)
                        return false;
                    var at = _at;
                    if (Babel.isJSXIdentifier(at.name) == false || at.name.name !== "name")
                        return false;
                    return true;
                });
                if (attr.length <= 0)
                    return;
                attr = attr[0];
                var name = attr.value.value;
                name = name.replace(/(?:^|\s)\S/g, function (a) { return a.toUpperCase(); });
                _this.classDec.id = Babel.identifier(name);
                element.name = Babel.jsxIdentifier('div');
                p.parentPath.node.closingElement.name = Babel.jsxIdentifier('div');
            }
        });
    };
    Converter.prototype.createRender = function (jsx) {
        if (this.classDec == null)
            return;
        this.replaceIdentifiers(jsx);
        this.bindEvents(jsx);
        this.createName(jsx);
        var mt = Babel.classMethod("method", Babel.identifier("render"), [], Babel.blockStatement([
            Babel.returnStatement(jsx.body[0].expression)
        ]));
        this.classDec.body.body.push(mt);
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
        // Ajout super
        var sup = Babel.expressionStatement(Babel.callExpression(Babel.identifier('super'), [Babel.identifier('props')]));
        ctr.body.body.splice(0, 0, sup);
        // Définition du state
        if (this.component.state.length > 0) {
            var expr = Babel.expressionStatement(Babel.assignmentExpression("=", Babel.memberExpression(Babel.thisExpression(), Babel.identifier('state')), Babel.objectExpression(this.component.state.map(function (state) { return Babel.objectProperty(Babel.identifier(state.name), state.defaultValue || Babel.nullLiteral()); }))));
            ctr.body.body.push(expr);
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
                if (path.parent.type == "VariableDeclarator")
                    return;
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
                var subject = null;
                if (Babel.isMemberExpression(member.object)) {
                    subject = member.object;
                    // Template.instance(), templateInstance ou this
                    if (Babel.isThisExpression(subject.object) == false)
                        return;
                }
                else if (Babel.isThisExpression(member.object)) {
                    subject = member;
                }
                else {
                    return;
                }
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
        // Suppression des assignements ReactiveVar
        traverse_1.default(this.baseTree, {
            Identifier: function (p) {
                var path = p;
                var id = path.node;
                if (id.name !== "ReactiveVar" && id.name !== "ReactiveDict")
                    return;
                var cll = path.findParent(function (path) { return path.node.type == "AssignmentExpression"; });
                if (cll == null)
                    return;
                cll.remove();
            }
        });
    };
    return Converter;
}());
exports.default = Converter;
