"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Parser = require("@babel/parser");
var Babel = require("@babel/types");
var traverse_1 = require("@babel/traverse");
var AST = /** @class */ (function () {
    function AST(code) {
        this.component = {
            name: null,
            imports: [],
            funcs: [],
            constructr: null,
            willUnmount: null,
            didMount: null,
            state: [],
            props: [],
            helpers: [],
            events: [],
        };
        this.tree = Parser.parse(code, {
            sourceType: 'module',
        });
        this.processImports();
        this.processFunctions();
        this.processLifeCycle();
        this.processHelpers();
        this.processEvents();
        this.processProps();
        this.processState();
    }
    AST.prototype.getComponent = function () {
        return this.component;
    };
    AST.prototype.getNodeName = function () {
        AST.NODE_COUNTER++;
        return AST.NODE_COUNTER.toString();
    };
    AST.prototype.processState = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            AssignmentExpression: function (p) {
                var path = p;
                var expr = path.node;
                if (Babel.isMemberExpression(expr.left) == false)
                    return;
                var subject = expr.left;
                // Template.instance(), templateInstance ou this
                if ((Babel.isThisExpression(subject.object)
                    || (Babel.isIdentifier(subject.object) && subject.object.name === 'templateInstance')
                    || (Babel.isCallExpression(subject.object)
                        && Babel.isMemberExpression(subject.object.callee)
                        && subject.object.callee.object.name === 'Template'
                        && subject.object.callee.property.name === 'instance')) == false)
                    return;
                // = new ReactiveTruc
                if ((Babel.isNewExpression(expr.right)
                    && Babel.isIdentifier(expr.right.callee)
                    && (expr.right.callee.name === "ReactiveVar"
                        || expr.right.callee.name === "ReactiveDict")) == false)
                    return;
                // nom du state
                if (Babel.isIdentifier(subject.property) == false)
                    return;
                var state = subject.property.name;
                var args = expr.right.arguments;
                var def = args.length > 0 ? args[0] : undefined;
                if (_this.component.state.findIndex(function (s) { return s.name === state; }) !== -1)
                    return;
                _this.component.state.push({
                    name: state,
                    defaultValue: def,
                });
            }
        });
        //console.log(JSON.stringify(this.component.state, null, 2));
    };
    AST.prototype.processProps = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            MemberExpression: function (p) {
                var path = p;
                var member = path.node;
                if (Babel.isMemberExpression(member.object) == false)
                    return;
                var subject = member.object;
                // Template.instance(), templateInstance ou this
                if ((Babel.isThisExpression(subject.object)
                    || (Babel.isIdentifier(subject.object) && subject.object.name === 'templateInstance')
                    || (Babel.isCallExpression(subject.object)
                        && Babel.isMemberExpression(subject.object.callee)
                        && subject.object.callee.object.name === 'Template'
                        && subject.object.callee.property.name === 'instance')) == false)
                    return;
                // .data
                if ((Babel.isIdentifier(subject.property) && subject.property.name === "data") == false)
                    return;
                if (Babel.isIdentifier(member.property) == false)
                    return;
                var prop = member.property.name;
                _this.component.props.push(prop);
            }
        });
        this.component.props = Array.from(new Set(this.component.props));
        //console.log(JSON.stringify(this.props, null, 2));
    };
    AST.prototype.processImports = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            ImportDeclaration: function (p) {
                var path = p;
                var imp = path.node;
                _this.component.imports.push(imp);
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
                if ((cycle.name == "onCreated" || cycle.name == "onRendered" || cycle.name == "onDestroyed")
                    && Babel.isIdentifier(expr.expression.arguments[0]))
                    throw new Error('LifeCycle functions can not be Identifier. Aborting.');
                if (cycle.name == "onCreated")
                    _this.component.constructr = expr.expression.arguments[0];
                else if (cycle.name == "onRendered")
                    _this.component.didMount = expr.expression.arguments[0];
                else if (cycle.name == "onDestroyed")
                    _this.component.willUnmount = expr.expression.arguments[0];
            }
        });
        //console.log(JSON.stringify(this.constructr, null, 2));
    };
    AST.prototype.processHelpers = function () {
        this.processTemplateProperty('helpers', this.component.helpers);
        //console.log(JSON.stringify(array[0], null, 2));
    };
    AST.prototype.processEvents = function () {
        var fns = [];
        var selectors = [];
        this.processTemplateProperty('events', fns, selectors);
        for (var i = 0; i < selectors.length; i++) {
            var data = selectors[i].split(' ');
            var event_1 = data[0];
            event_1 = 'on' + event_1.replace(/(?:^|\s)\S/g, function (a) { return a.toUpperCase(); });
            data.splice(0, 1);
            var selector = data.join(' ');
            this.component.events.push({
                event: event_1,
                selector: selector,
                fun: fns[i],
            });
        }
        //console.log(JSON.stringify(this.events[0], null, 2));
    };
    AST.prototype.processTemplateProperty = function (prop, array, opts) {
        var _this = this;
        if (opts === void 0) { opts = null; }
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
                if (cycle.name !== prop)
                    return;
                var object = expr.expression.arguments[0];
                traverse_1.default(object, {
                    ObjectProperty: function (p) {
                        var path = p;
                        var property = path.node;
                        if (Babel.isFunction(property.value) == false)
                            return;
                        var value = property.value;
                        var key = null;
                        if (Babel.isIdentifier(property.key))
                            key = property.key;
                        else if (Babel.isStringLiteral(property.key)) {
                            if (opts != null)
                                opts.push(property.key.value);
                            key = Babel.identifier("fun_" + _this.getNodeName());
                        }
                        var body;
                        if (Babel.isBlockStatement(value.body))
                            body = value.body;
                        else {
                            body = Babel.blockStatement([
                                Babel.returnStatement(value.body)
                            ]);
                        }
                        var fun = Babel.functionDeclaration(key, value.params, body, value.generator, value.async);
                        array.push(fun);
                    }
                }, path.scope, path.state, path.parentPath);
            }
        });
    };
    AST.prototype.processFunctions = function () {
        var _this = this;
        traverse_1.default(this.tree, {
            FunctionDeclaration: function (p) {
                var path = p;
                var fun = path.node;
                // Si c'est une fonction utilitaire
                if (Babel.isProgram(path.parent)) {
                    _this.component.funcs.push(fun);
                }
            }
        });
        //console.log(JSON.stringify(this.funcs[0], null, 2));
    };
    AST.NODE_COUNTER = 0;
    return AST;
}());
exports.default = AST;
;
