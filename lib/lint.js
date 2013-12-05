var FS = require("fs");
var PATH = require("path");
var U2 = require("uglify-js");
var HTML = require("./parsehtml.js");

var KAPI = require("./parsedocs.js").kendo_apidoc;

function check_widget_options(w, config, results, token) {
    var comp = typeof w == "string" ? KAPI.get_ui_comp(w) : w;
    if (!comp) results.push({
        message : "Could not find component: " + w,
        error   : true,
        line    : token.line,
        col     : token.col,
        len     : w.length,
    });
    else config.properties.forEach(function(prop){
        comp.check_option(null, prop, results);
    });
}

function _lint_js(code, args) {
    var results = args.results;
    var filename = args.filename;
    try {
        var ast = U2.parse(code, { filename: filename });
    } catch(ex) {
        if (ex instanceof U2.JS_Parse_Error) {
            results.push({
                filename : filename,
                message  : ex.message,
                line     : ex.line,
                col      : ex.col
            });
            return;
        }
        throw ex;
    }
    var m;
    var warnings = [];
    ast.walk(new U2.TreeWalker(function(node){
        if (node instanceof U2.AST_Call
            && node.expression instanceof U2.AST_Dot
            && node.args[0] instanceof U2.AST_Object) {

            // (...).kendoSomething()
            if ((m = /^kendo(.*)$/.exec(node.expression.property))) {
                var widget = m[1];
                check_widget_options(widget, node.args[0], warnings, node.expression.end);
            }
        }
    }));
    warnings.forEach(function(w){
        w.filename = filename;
        if (args.position) {
            if (args.position.line == 1) w.col += args.position.col;
            else w.line += args.position.line - 1;
        }
    });
    if (results) {
        results.push.apply(results, warnings);
    }
    return warnings;
}

function lint_javascript_file(code, filename, results) {
    return _lint_js(code, {
        filename: filename,
        results: results,
    });
}

function find(array, pred) {
    for (var i = 0; i < array.length; ++i) {
        if (pred(array[i])) return array[i];
    }
}

function _lint_html(code, args) {
    var filename = args.filename;
    var results = args.results;
    function get_attr(node, name) {
        return find(node.attr, function(att){ return att.name == name });
    }
    var tree = HTML.parse(code);
    var warnings = tree.errors.map(function(e){
        return {
            message  : e.err,
            line     : e.loc.line,
            col      : e.loc.col,
        };
    });
    function search(node) {
        if (node.type == "root") {
            node.body.forEach(search);
            return;
        }
        if (node.type == "tag") {
            if (node.name == "style") return;
            if (node.name == "script") {
                var type = get_attr(node, "type");
                if (!type || /javascript/i.test(type.value) && !get_attr(node, "src")) {
                    // attempt to validate as JavaScript
                    _lint_js(node.body.value, {
                        filename: filename,
                        results: warnings,
                        position: {
                            pos  : node.body.loc.pos,
                            line : node.body.loc.line,
                            col  : node.body.loc.col,
                        }
                    });
                    return;
                }
                if (type && /template/i.test(type.value)) {
                    // if it's some sort of template we could assume it generates HTML.
                    // let's try to parse it as HTML, though we might end up with false errors.
                    _lint_html(node.body.value, {
                        filename: filename,
                        results: warnings,
                        position: {
                            pos  : node.body.loc.pos,
                            line : node.body.loc.line,
                            col  : node.body.loc.col,
                        }
                    });
                    return;
                }
            }
            var role = get_attr(node, "data-role");
            out: if (role) {
                var comp = KAPI.get_ui_comp_ci(role.value);
                if (!comp) {
                    warnings.push({
                        message  : "Could not find component specified in data-role: " + role.value,
                        error    : true,
                        line     : role.loc.line,
                        col      : role.loc.col,
                        len      : role.value.length,
                    });
                    break out;
                }
                var options = [];
                for (var i = 0; i < node.attr.length; ++i) {
                    var att = node.attr[i];
                    var m = /^data-(.*)$/.exec(att.name);
                    if (m) {
                        var opt = m[1];
                        if (opt == "role" || opt == "bind") continue;
                        opt = opt.replace(/-[a-z]/g, function(str){
                            return str[1].toUpperCase();
                        });
                        var val = att.value;
                        try {
                            var expr = U2.parse(val, { expression: true });
                            expr.start.line = att.valoc.line;
                            expr.start.col = att.valoc.col;
                            if (/['"]/.test(code.charAt(att.valoc.pos))) {
                                expr.start.col++;
                            }
                            var prop = new U2.AST_ObjectKeyVal({
                                key   : opt,
                                value : expr,
                                start : {
                                    line: att.loc.line,
                                    col: att.loc.col
                                }
                            });
                            prop._kl_length = att.name.length;
                            options.push(prop);
                        } catch(ex) {
                            if (ex instanceof U2.JS_Parse_Error) {
                                warnings.push({
                                    message : "Cannot parse expression " + val + " (in attribute " + i + ")",
                                    line    : att.valoc.line,
                                    col     : att.valoc.col,
                                    len     : val.length,
                                });
                            } else {
                                console.log(ex);
                                console.log(ex.stack);
                            }
                        }
                    }
                }
                var obj = new U2.AST_Object({ properties: options });
                check_widget_options(comp, obj, warnings);
            }
            if (node.body) {
                node.body.forEach(search);
            }
        }
    }
    search(tree);
    warnings.forEach(function(w){
        w.filename = filename;
        if (args.position) {
            if (args.position.line == 1) w.col += args.position.col;
            else w.line += args.position.line - 1;
        }
    });
    if (results) {
        results.push.apply(results, warnings);
    }
    return warnings;
}

function lint_html_file(code, filename, results) {
    return _lint_html(code, { filename: filename, results: results });
}

exports.lint_javascript_file = lint_javascript_file;
exports.lint_html_file = lint_html_file;
exports.initialize = KAPI.initialize;
