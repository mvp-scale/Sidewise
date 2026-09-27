#!/usr/bin/env node
import { createRequire as __sidewiseCreateRequire } from 'node:module';
const require = __sidewiseCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key2, node, visitor, path19) {
      const ctrl = callVisitor(key2, node, visitor, path19);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path19, ctrl);
        return visit_(key2, ctrl, visitor, path19);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path19 = Object.freeze(path19.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path19);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path19 = Object.freeze(path19.concat(node));
          const ck = visit_("key", node.key, visitor, path19);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path19);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key2, node, visitor, path19) {
      const ctrl = await callVisitor(key2, node, visitor, path19);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path19, ctrl);
        return visitAsync_(key2, ctrl, visitor, path19);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path19 = Object.freeze(path19.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path19);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path19 = Object.freeze(path19.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path19);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path19);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key2, node, visitor, path19) {
      if (typeof visitor === "function")
        return visitor(key2, node, path19);
      if (identity.isMap(node))
        return visitor.Map?.(key2, node, path19);
      if (identity.isSeq(node))
        return visitor.Seq?.(key2, node, path19);
      if (identity.isPair(node))
        return visitor.Pair?.(key2, node, path19);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key2, node, path19);
      if (identity.isAlias(node))
        return visitor.Alias?.(key2, node, path19);
      return void 0;
    }
    function replaceNode(key2, path19, node) {
      const parent = path19[path19.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key2] = node;
      } else if (identity.isPair(parent)) {
        if (key2 === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line3, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line3.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key2, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len2 = val.length; i < len2; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key2, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path19, value) {
      let v = value;
      for (let i = path19.length - 1; i >= 0; --i) {
        const k = path19[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path19) => path19 == null || typeof path19 === "object" && !!path19[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path19, value) {
        if (isEmptyPath(path19))
          this.add(value);
        else {
          const [key2, ...rest] = path19;
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path19) {
        const [key2, ...rest] = path19;
        if (rest.length === 0)
          return this.delete(key2);
        const node = this.get(key2, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path19, keepScalar) {
        const [key2, ...rest] = path19;
        const node = this.get(key2, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path19) {
        const [key2, ...rest] = path19;
        if (rest.length === 0)
          return this.has(key2);
        const node = this.get(key2, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path19, value) {
        const [key2, ...rest] = path19;
        if (rest.length === 0) {
          this.set(key2, value);
        } else {
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify2(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key: key2, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key2) && key2.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key2) || !identity.isNode(key2) && typeof key2 === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key2 || keyComment && value == null && !ctx.inFlow || identity.isCollection(key2) || (identity.isScalar(key2) ? key2.type === Scalar.Scalar.BLOCK_FOLDED || key2.type === Scalar.Scalar.BLOCK_LITERAL : typeof key2 === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify2.stringify(key2, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow2 = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow2) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key2) => (merge.identify(key2) || identity.isScalar(key2) && (!key2.type || key2.type === Scalar.Scalar.PLAIN) && merge.identify(key2.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key2, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key2))
            map.set(key2, value2);
        } else if (map instanceof Set) {
          map.add(key2);
        } else if (!Object.prototype.hasOwnProperty.call(map, key2)) {
          Object.defineProperty(map, key2, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify2 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key: key2, value }) {
      if (identity.isNode(key2) && key2.addToJSMap)
        key2.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key2))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key2, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key2, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key2, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key2) && ctx?.doc) {
        const strCtx = stringify2.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key2.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key2, value, ctx) {
      const k = createNode.createNode(key2, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key2, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key2;
        this.value = value;
      }
      clone(schema) {
        let { key: key2, value } = this;
        if (identity.isNode(key2))
          key2 = key2.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key2, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow2 = ctx.inFlow ?? collection.flow;
      const stringify3 = flow2 ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify3(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line3 = lines[i];
          str += line3 ? `
${indent}${line3}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify2.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line3) => sum + line3.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len2 = lines.reduce((sum, line3) => sum + line3.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len2 > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line3 of lines)
            str += line3 ? `
${indentStep}${indent}${line3}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key2) {
      const k = identity.isScalar(key2) ? key2.value : key2;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key2 || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key2, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key2, value);
          else if (Array.isArray(replacer) && !replacer.includes(key2))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key2, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key2, value] of obj)
            add(key2, value);
        } else if (obj && typeof obj === "object") {
          for (const key2 of Object.keys(obj))
            add(key2, obj[key2]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key2) {
        const it = findPair(this.items, key2);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const it = findPair(this.items, key2);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key2) {
        return !!findPair(this.items, key2);
      }
      set(key2, value) {
        this.add(new Pair.Pair(key2, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key2) {
        const idx = asItemIndex(key2);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key2, value) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key2}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key2 = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key2, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key2) {
      let idx = identity.isScalar(key2) ? key2.value : key2;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num3 = typeof value === "number" ? value : Number(value);
      if (!isFinite(num3))
        return isNaN(num3) ? ".nan" : num3 < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num3 = Number(node.value);
        return isFinite(num3) ? num3.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key2, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key2 = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key2 = keys[0];
              value = it[key2];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key2 = it;
          }
          pairs2.items.push(Pair.createPair(key2, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key2, value;
          if (identity.isPair(pair)) {
            key2 = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key2, ctx);
          } else {
            key2 = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key2))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key2, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key: key2 } of pairs$1.items) {
          if (identity.isScalar(key2)) {
            if (seenKeys.includes(key2.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key2.value}`);
            } else {
              seenKeys.push(key2.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num3 = Number(node.value);
        return isFinite(num3) ? num3.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key2) {
        let pair;
        if (identity.isPair(key2))
          pair = key2;
        else if (key2 && typeof key2 === "object" && "key" in key2 && "value" in key2 && key2.value === null)
          pair = new Pair.Pair(key2.key, null);
        else
          pair = new Pair.Pair(key2, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key2, keepPair) {
        const pair = YAMLMap.findPair(this.items, key2);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key2, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key2);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key2));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num3 = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num3(60) + num3(p), num3(0));
      return sign === "-" ? num3(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num3 = (n) => n;
      if (typeof value === "bigint")
        num3 = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num3(-1);
      }
      const _60 = num3(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key2) => key2 !== "yaml11").map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify2.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify2.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path19, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path19, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow: flow2, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow2 && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key2, value, options = {}) {
        const k = this.createNode(key2, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        return assertCollection(this.contents) ? this.contents.delete(key2) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path19) {
        if (Collection.isEmptyPath(path19)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path19) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key2, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key2, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path19, keepScalar) {
        if (Collection.isEmptyPath(path19))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path19, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key2) {
        return identity.isCollection(this.contents) ? this.contents.has(key2) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path19) {
        if (Collection.isEmptyPath(path19))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path19) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key2, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key2], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key2, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path19, value) {
        if (Collection.isEmptyPath(path19)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path19), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path19, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line: line3, col } = error.linePos[0];
      error.message += ` at line ${line3}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line3 - 1], lc.lineStarts[line3]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line3 > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line3 - 2], lc.lineStarts[line3 - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line3 && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow: flow2, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow2 && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow2 ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow2) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow2}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key2) {
      if (!key2)
        return null;
      switch (key2.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key2.source.includes("\n"))
            return true;
          if (key2.end) {
            for (const st of key2.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key2.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key: key2, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key2 ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key2) {
            if (key2.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key2 && key2.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key2)) {
            onError(key2 ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key2 ? composeNode(ctx, key2, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key2, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key2 || key2.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key: key2, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key2 ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key2))
            onError(
              key2,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key2 ? composeNode(ctx, key2, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key2))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar2, onError) {
      const start = scalar2.offset;
      const header = parseBlockScalarHeader(scalar2, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar2.source ? splitLines(scalar2.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar2.source)
          end2 += scalar2.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar2.indent + header.indent;
      let offset = scalar2.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar2.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m2 = first.match(/^( *)/);
      const line0 = m2?.[1] ? [m2[1], first.slice(m2[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar2, strict, onError) {
      const { offset, type, source, end } = scalar2;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar2, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line3 = /(.*?)\r?\n/sy;
      let match = line3.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line3.lastIndex;
      while (match = line3.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line3.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok2 = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok2 ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar2;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar2 = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar2 = new Scalar.Scalar(value);
      }
      scalar2.range = range;
      scalar2.source = value;
      if (type)
        scalar2.type = type;
      if (tagName)
        scalar2.tag = tagName;
      if (tag.format)
        scalar2.format = tag.format;
      if (comment)
        scalar2.comment = comment;
      return scalar2;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key2 of Object.keys(token))
          if (key2 !== "type" && key2 !== "offset")
            delete token[key2];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key2 of Object.keys(token))
            if (key2 !== "type" && key2 !== "offset")
              delete token[key2];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify2 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key: key2, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key2)
        res += stringifyToken(key2);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path19) => {
      let item = cst;
      for (const [field, index] of path19) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path19) => {
      const parent = visit.itemAtPath(cst, path19.slice(0, -1));
      const field = path19[path19.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path19, item, visitor) {
      let ctrl = visitor(item, path19);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path19.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path19);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path19) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line3 = this.getLine();
        if (line3 === null)
          return this.setNext("stream");
        if (line3[0] === cst.BOM) {
          yield* this.pushCount(1);
          line3 = line3.substring(1);
        }
        if (line3[0] === "%") {
          let dirEnd = line3.length;
          let cs = line3.indexOf("#");
          while (cs !== -1) {
            const ch = line3[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line3.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line3[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line3.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line3.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line3 = this.getLine();
        if (line3 === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line3[n]) {
          case "#":
            yield* this.pushCount(line3.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line3.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line3 = this.getLine();
        if (line3 === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line3[0] !== "#" || indent === 0 && (line3.startsWith("---") || line3.startsWith("...")) && isEmpty(line3[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line3[0] === "]" || line3[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line3[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line3[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line3.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list3, type) {
      for (let i = 0; i < list3.length; ++i)
        if (list3[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list3) {
      for (let i = 0; i < list3.length; ++i) {
        switch (list3[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar2) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar2.end) {
            sep = scalar2.end;
            sep.push(this.sourceToken);
            delete scalar2.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar2.offset,
            indent: scalar2.indent,
            items: [{ start, key: scalar2, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar2);
      }
      *blockScalar(scalar2) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar2.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar2.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key2 = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: key2, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument3(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument3(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify2(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument3;
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli.ts
var import_yaml3 = __toESM(require_dist(), 1);
import { readFileSync as readFileSync14, statSync as statSync8 } from "node:fs";
import os3 from "node:os";
import path18 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { parseArgs } from "node:util";

// package.json
var package_default = {
  name: "@mvpscale/sidewise",
  version: "0.0.0",
  description: "Side answers for coding agents: compact yes/no checklists, a calibrated consensus, and a log that learns where agents go wrong.",
  license: "Apache-2.0",
  type: "module",
  repository: {
    type: "git",
    url: "git+https://github.com/mvp-scale/Sidewise.git"
  },
  homepage: "https://github.com/mvp-scale/Sidewise#readme",
  keywords: [
    "agents",
    "claude-code",
    "codex",
    "gemini-cli",
    "mcp",
    "agent-skills",
    "decision-support"
  ],
  engines: {
    node: ">=22.13"
  },
  bin: {
    sidewise: "dist/cli.js"
  },
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  files: [
    "dist",
    "skills",
    ".claude-plugin",
    "README.md",
    "LICENSE"
  ],
  publishConfig: {
    access: "public",
    provenance: true
  },
  scripts: {
    build: "tsc -p tsconfig.build.json",
    "build:plugin": "tsx scripts/build-plugin.ts",
    typecheck: "tsc -p tsconfig.json --noEmit",
    test: "vitest run --project unit --project contract --project golden",
    "test:cli": "npm run build && vitest run --project cli",
    "test:install": "npm run build && vitest run --project install",
    "test:chaos": "npm run build && tsx test/chaos/run.ts",
    "test:container": "sh docker/test.sh",
    "test:flows": "sh scripts/flows.sh",
    "bench:ledger": "tsx scripts/bench-ledger.ts",
    "bench:tokens": "tsx scripts/bench-tokens.ts",
    sidewise: "tsx src/cli.ts",
    "check:clean": "sh scripts/check-clean.sh",
    "check:trace": "tsx scripts/trace.ts",
    "check:pack": "tsx scripts/check-pack.ts",
    "check:plugin": "tsx scripts/check-plugin.ts",
    "check:hygiene": "tsx scripts/check-hygiene.ts",
    "gen:evidence-index": "tsx scripts/evidence-index.ts",
    prepare: "git config core.hooksPath .githooks 2>/dev/null || true",
    "dev:install": 'npm run build && tgz="$(pwd)/$(npm pack --silent | tail -1)" && cd "${INIT_CWD:-.}" && npx --yes --package "$tgz" sidewise init'
  },
  devDependencies: {
    "@types/node": "22.19.18",
    ajv: "8.20.0",
    esbuild: "0.28.2",
    "js-tiktoken": "1.0.21",
    tsx: "4.23.15",
    typescript: "5.9.3",
    vitest: "4.1.11"
  },
  dependencies: {
    yaml: "2.9.1"
  }
};

// src/budget/budget.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, renameSync, rmSync, writeFileSync as writeFileSync2 } from "node:fs";

// src/ledger/lock.ts
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
var LockError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LockError";
  }
};
var StoreError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "StoreError";
  }
};
var shownStore = (file) => `${path.basename(path.dirname(file))}/${path.basename(file)}`;
function storeError(e, file, action) {
  const code = e?.code;
  if (typeof code !== "string") return e;
  return new StoreError(`\u2716 files: cannot ${action} ${shownStore(file)} (${code}) \u2192 make .sidewise/ a writable folder, with log.jsonl and budget.json as files`);
}
function onStore(file, action, fn) {
  try {
    return fn();
  } catch (e) {
    throw storeError(e, file, action);
  }
}
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
}
var DEAD_PID_GRACE_MS = 2e3;
var ORPHAN_BREAK_MS = 2e3;
var errno = (e) => e?.code;
var notALock = (lockPath) => new StoreError(`\u2716 files: ${shownStore(lockPath)} is not a lock file \u2192 remove it`);
function readLock(lockPath) {
  try {
    const st = statSync(lockPath);
    if (!st.isFile()) throw notALock(lockPath);
    return { body: readFileSync(lockPath, "utf8"), ageMs: Date.now() - st.mtimeMs };
  } catch (e) {
    if (e instanceof StoreError) throw e;
    if (errno(e) === "ENOENT") return void 0;
    throw notALock(lockPath);
  }
}
function isStale(lock, staleMs) {
  const pid = Number.parseInt(lock.body.trim(), 10);
  if (Number.isInteger(pid) && pid > 0) return lock.ageMs >= DEAD_PID_GRACE_MS && !isAlive(pid);
  return lock.ageMs > staleMs;
}
function tryBreak(lockPath, staleMs) {
  const breakPath = `${lockPath}.break`;
  const first = readLock(lockPath);
  if (!first) return true;
  if (!isStale(first, staleMs)) return false;
  try {
    closeSync(openSync(breakPath, "wx"));
  } catch (e) {
    if (errno(e) !== "EEXIST") throw storeError(e, breakPath, "write");
    try {
      if (Date.now() - statSync(breakPath).mtimeMs > ORPHAN_BREAK_MS) unlinkSync(breakPath);
    } catch {
    }
    return false;
  }
  try {
    const now = readLock(lockPath);
    if (!now) return true;
    if (!isStale(now, staleMs)) return false;
    try {
      unlinkSync(lockPath);
    } catch (e) {
      if (errno(e) !== "ENOENT") throw storeError(e, lockPath, "write");
    }
    return true;
  } finally {
    try {
      unlinkSync(breakPath);
    } catch {
    }
  }
}
function withLock(lockPath, fn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5e3;
  const staleMs = opts.staleMs ?? 3e4;
  onStore(lockPath, "write", () => mkdirSync(path.dirname(lockPath), { recursive: true }));
  const start = Date.now();
  for (; ; ) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeSync(fd, `${process.pid}
`);
        closeSync(fd);
      } catch (e) {
        try {
          closeSync(fd);
        } catch {
        }
        unlinkSync(lockPath);
        throw storeError(e, lockPath, "write");
      }
      break;
    } catch (e) {
      if (e instanceof StoreError) throw e;
      if (e.code !== "EEXIST") throw storeError(e, lockPath, "write");
      if (tryBreak(lockPath, staleMs)) continue;
      if (Date.now() - start > timeoutMs) {
        throw new LockError(`\u2716 lock: ${shownStore(lockPath)} is locked \u2192 wait for the other run, or delete the lock file if no run is active`);
      }
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
    }
  }
}

// src/ledger/paths.ts
import { existsSync, mkdirSync as mkdirSync2, writeFileSync } from "node:fs";
import path2 from "node:path";
function pathsFor(root) {
  const dir = path2.join(root, ".sidewise");
  return { root, dir, log: path2.join(dir, "log.jsonl"), lock: path2.join(dir, "lock"), budget: path2.join(dir, "budget.json"), index: path2.join(dir, "index.db") };
}
function ensureDir(paths) {
  mkdirSync2(paths.dir, { recursive: true });
  const gitignore = path2.join(paths.dir, ".gitignore");
  if (!existsSync(gitignore)) writeFileSync(gitignore, "*\n");
}
function findRoot(cwd) {
  let dir = path2.resolve(cwd);
  for (; ; ) {
    if (existsSync(path2.join(dir, ".sidewise")) || existsSync(path2.join(dir, ".git"))) return dir;
    const up = path2.dirname(dir);
    if (up === dir) return void 0;
    dir = up;
  }
}
function resolvePaths(cwd = process.cwd(), env = process.env) {
  const home = env.SIDEWISE_HOME?.trim();
  const root = home ? path2.resolve(home) : findRoot(cwd);
  return root === void 0 ? void 0 : pathsFor(root);
}

// src/budget/budget.ts
var DEFAULT_BUDGET = { capUsd: 5, capRuns: 500 };
var BudgetError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetError";
  }
};
var iso = (now) => new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
var money = (n) => `$${n.toFixed(2)}`;
var fresh = (now, caps = DEFAULT_BUDGET) => ({ capUsd: caps.capUsd, capRuns: caps.capRuns, spentUsd: 0, runs: 0, resetAt: iso(now) });
var corrupt = (code) => new BudgetError(`\u2716 budget: .sidewise/budget.json is unreadable${code ? ` (${code})` : ""} \u2192 the owner runs "sidewise budget reset" to start a fresh budget`);
function isState(v) {
  if (!v || typeof v !== "object") return false;
  const s = v;
  const numeric = ["capUsd", "capRuns", "spentUsd", "runs"].every((k) => typeof s[k] === "number" && Number.isFinite(s[k]) && s[k] >= 0);
  return numeric && typeof s.resetAt === "string";
}
function read(paths) {
  if (!existsSync2(paths.budget)) return void 0;
  let value;
  try {
    value = JSON.parse(readFileSync2(paths.budget, "utf8"));
  } catch (e) {
    const code = e.code;
    throw corrupt(typeof code === "string" ? code : void 0);
  }
  if (!isState(value)) throw corrupt();
  return value;
}
function write(paths, state) {
  const tmp = `${paths.budget}.tmp`;
  onStore(paths.budget, "write", () => {
    ensureDir(paths);
    writeFileSync2(tmp, `${JSON.stringify(state, null, 2)}
`);
    renameSync(tmp, paths.budget);
  });
}
function peekBudget(paths) {
  try {
    return read(paths);
  } catch {
    return void 0;
  }
}
function loadBudget(paths, now = Date.now()) {
  const existing = read(paths);
  if (existing) return { state: existing, created: false };
  return withLock(paths.lock, () => {
    const again = read(paths);
    if (again) return { state: again, created: false };
    const state = fresh(now);
    write(paths, state);
    return { state, created: true };
  });
}
function usedFraction(s) {
  return Math.max(s.capUsd > 0 ? s.spentUsd / s.capUsd : 1, s.capRuns > 0 ? s.runs / s.capRuns : 1);
}
function checkBudget(s) {
  const runsCapped = s.runs >= s.capRuns;
  const usdCapped = s.spentUsd >= s.capUsd;
  if (runsCapped || usdCapped) {
    const hint = runsCapped && !usdCapped ? 'the owner runs "sidewise budget set --runs <n>"' : 'the owner runs "sidewise budget reset"';
    return { ok: false, message: `\u2716 budget: cap reached (${money(s.spentUsd)} of ${money(s.capUsd)} \xB7 ${s.runs} of ${s.capRuns} runs) \u2192 ${hint}` };
  }
  return { ok: true };
}
function spendLocked(paths, costUsd, now = Date.now()) {
  const before = read(paths);
  const s = before ?? fresh(now);
  const after = { ...s, spentUsd: s.spentUsd + (Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0), runs: s.runs + 1 };
  write(paths, after);
  return { before, after };
}
function restoreLocked(paths, before) {
  if (before) write(paths, before);
  else onStore(paths.budget, "write", () => rmSync(paths.budget, { force: true }));
}
function resetBudget(paths, now = Date.now()) {
  return withLock(paths.lock, () => {
    let caps = DEFAULT_BUDGET;
    try {
      caps = read(paths) ?? DEFAULT_BUDGET;
    } catch {
    }
    const next = fresh(now, caps);
    write(paths, next);
    return next;
  });
}
function setBudget(paths, caps, now = Date.now()) {
  for (const [name, v] of Object.entries(caps)) {
    if (v !== void 0 && !(Number.isFinite(v) && v > 0)) throw new BudgetError(`\u2716 budget: ${name} must be a positive number, got ${v} \u2192 e.g. --usd 5 --runs 500`);
  }
  return withLock(paths.lock, () => {
    const s = read(paths) ?? fresh(now);
    const next = { ...s, ...caps.capUsd !== void 0 ? { capUsd: caps.capUsd } : {}, ...caps.capRuns !== void 0 ? { capRuns: caps.capRuns } : {} };
    write(paths, next);
    return next;
  });
}
function budgetLine(s) {
  const pct = Math.round(usedFraction(s) * 100);
  return `${pct >= 50 ? "\u26A0 " : ""}budget ${pct}% used (${money(s.spentUsd)} of ${money(s.capUsd)} \xB7 ${s.runs} of ${s.capRuns} runs)`;
}

// src/classifier/chaos.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync3, renameSync as renameSync2, writeFileSync as writeFileSync3 } from "node:fs";
import path3 from "node:path";

// src/util/text.ts
var clip = (s, n) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
var CONTROL = /[\u0000-\u001f\u007f]/;
var hasControlChars = (s) => CONTROL.test(s);

// src/util/prng.ts
function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededRandom(seed) {
  let a = fnv1a(seed) || 1;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/classifier/fake.ts
var FAKE_MODEL = "sidewise-fake-1";
function pinned(state, id) {
  const table = state.__fake;
  return table && typeof table === "object" ? table[id] : void 0;
}
function answerNoul(question, state) {
  const override = pinned(state, question.id);
  const probability = typeof override === "number" ? override : seededRandom(`noul:${question.id}:${question.ask}`)();
  return { type: "noul", probability };
}
function answerScore(question, state) {
  const n = question.levels.length;
  const override = pinned(state, question.id);
  const idx = typeof override === "number" ? Math.min(n - 1, Math.max(0, Math.round(override))) : Math.floor(seededRandom(`score:${question.id}:${question.ask}`)() * n);
  const peak = typeof override === "number" ? 1 : 0.7;
  const distribution = Array.from({ length: n }, (_, i) => i === idx ? peak : (1 - peak) / Math.max(1, n - 1));
  const score = distribution.reduce((sum, p, i) => sum + p * i, 0);
  const confidence = (n * Math.max(...distribution) - 1) / (n - 1);
  return { type: "score", score, distribution, confidence };
}
function answerChoice(question, state) {
  const options = Object.keys(question.options);
  const override = pinned(state, question.id);
  const chosen = typeof override === "string" && options.includes(override) ? override : options[Math.floor(seededRandom(`choice:${question.id}:${question.ask}`)() * options.length)];
  const probabilities = {};
  for (const o of options) probabilities[o] = o === chosen ? 0.7 : 0.3 / Math.max(1, options.length - 1);
  const k = options.length;
  return { type: "choice", choice: chosen, probabilities, confidence: (k * 0.7 - 1) / (k - 1) };
}
function createFakeAdapter() {
  return {
    adapter: "fake",
    model: FAKE_MODEL,
    async ask(questions, state) {
      const answers = {};
      for (const q of questions) {
        answers[q.id] = q.type === "noul" ? answerNoul(q, state) : q.type === "score" ? answerScore(q, state) : answerChoice(q, state);
      }
      return { answers, costUsd: 0 };
    }
  };
}

// src/classifier/typesafe/config.ts
var JevConfigError = class extends Error {
  /** 1 (default): a provider problem (no key) — bucketed with other provider errors. 2: a config value the
   *  caller must fix before anything runs (a bad SIDEWISE_BASE_URL) — the owner ruling for P3 treats this like
   *  a usage mistake, not a runtime provider failure. */
  exit;
  constructor(message, exit = 1) {
    super(message);
    this.name = "JevConfigError";
    this.exit = exit;
  }
};
var JevApiError = class extends Error {
  status;
  retryable;
  retryAfterMs;
  body;
  constructor(message, opts) {
    super(message, opts.cause === void 0 ? void 0 : { cause: opts.cause });
    this.name = "JevApiError";
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs;
    this.body = opts.body;
  }
};
var DIRECT_BASE_URL = "https://api.typesafe.ai";
var GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/typesafe";
var DEFAULT_PINNED_MODEL = "jev-1.13.0";
var DEFAULT_GATEWAY_MODEL = "typesafe-ai/jev";
var DEFAULT_TIMEOUT_MS = 2e4;
var clean = (v) => {
  const t = v?.trim();
  return t ? t : void 0;
};
function isFloatingModel(model) {
  return /(^|[-/])(latest|preview)$/i.test(model.trim());
}
function resolveRoute(env, deps) {
  const directKey = clean(env.TYPESAFE_API_KEY);
  const gatewayKey = clean(env.AI_GATEWAY_API_KEY);
  if (directKey) return { route: "direct", apiKey: directKey, keySource: "env" };
  if (gatewayKey) return { route: "gateway", apiKey: gatewayKey, keySource: "env" };
  const stored = deps.resolveStored?.();
  if (stored) return { route: stored.provider === "gateway" ? "gateway" : "direct", apiKey: stored.apiKey, keySource: stored.source };
  return { route: "direct", apiKey: void 0 };
}
function resolveTimeoutMs(env) {
  const raw = Number(clean(env.JEV_TIMEOUT_MS));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function resolveBaseURL(env, baseDefault) {
  const raw = clean(env.SIDEWISE_BASE_URL);
  if (raw === void 0) return baseDefault;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new JevConfigError(`\u2716 SIDEWISE_BASE_URL: "${raw}" is not a valid URL \u2192 use an https URL, e.g. https://api.example.com`, 2);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol === "https:" || url.protocol === "http:" && local) return raw.replace(/\/+$/, "");
  throw new JevConfigError(
    `\u2716 SIDEWISE_BASE_URL: "${raw}" is ${url.protocol.replace(":", "")}, not https \u2192 use https, or http only for localhost/127.0.0.1/[::1]`,
    2
  );
}
function resolveJevConfig(env = process.env, deps = {}) {
  const model = clean(env.JEV_MODEL) ?? DEFAULT_PINNED_MODEL;
  if (isFloatingModel(model)) {
    throw new JevConfigError(
      `JEV_MODEL="${model}" floats. Pin an exact version (e.g. ${DEFAULT_PINNED_MODEL}) so scores are reproducible.`
    );
  }
  const { route, apiKey, keySource } = resolveRoute(env, deps);
  const baseDefault = route === "gateway" ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return {
    route,
    apiKey,
    ...keySource ? { keySource } : {},
    baseURL: resolveBaseURL(env, baseDefault),
    model,
    wireModel: route === "gateway" ? clean(env.JEV_GATEWAY_MODEL) ?? DEFAULT_GATEWAY_MODEL : model,
    timeoutMs: resolveTimeoutMs(env)
  };
}
function hasKey(config) {
  return config.apiKey !== void 0;
}
function routeLabel(config) {
  const baseDefault = config.route === "gateway" ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return config.baseURL === baseDefault ? config.route : "custom";
}

// src/classifier/chaos.ts
var CHAOS_STEPS = ["ok", "401", "429", "503", "529", "timeout", "malformed", "missing"];
var CHAOS_MODEL = "sidewise-chaos-1";
var HTTP = {
  "401": { status: 401, text: "invalid API key", retryable: false },
  "429": { status: 429, text: "rate limited", retryable: true },
  "503": { status: 503, text: "service unavailable", retryable: true },
  "529": { status: 529, text: "overloaded", retryable: true }
};
function parseSchedule(raw) {
  const text = (raw ?? "").trim();
  if (!text) return { steps: [] };
  const steps = text.split(",").map((s) => s.trim());
  const bad = steps.find((s) => !CHAOS_STEPS.includes(s));
  if (bad !== void 0) return { stop: `\u2716 provider: SIDEWISE_CHAOS has "${clip(bad, 20)}" \u2192 use a comma list of ${CHAOS_STEPS.join(", ")}` };
  return { steps };
}
function stepper(steps, stateFile) {
  let next = 0;
  const schedule = steps.join(",");
  return () => {
    if (!stateFile) return steps[next++] ?? "ok";
    return withLock(`${stateFile}.lock`, () => {
      let at = 0;
      try {
        const s = JSON.parse(readFileSync3(stateFile, "utf8"));
        if (s.schedule === schedule && Number.isInteger(s.next)) at = s.next;
      } catch {
      }
      mkdirSync3(path3.dirname(stateFile), { recursive: true });
      writeFileSync3(`${stateFile}.tmp`, JSON.stringify({ schedule, next: at + 1 }));
      renameSync2(`${stateFile}.tmp`, stateFile);
      return steps[at] ?? "ok";
    });
  };
}
function broken(q) {
  if (q.type === "noul") return { type: "noul", probability: 1.4 };
  if (q.type === "score") return { type: "score", score: 0, distribution: q.levels.map(() => 1.4), confidence: 1 };
  const options = Object.keys(q.options);
  return { type: "choice", choice: options[0], probabilities: Object.fromEntries(options.map((o) => [o, 1.4])), confidence: 1 };
}
function createChaosAdapter(steps, stateFile) {
  const fake = createFakeAdapter();
  const nextStep = stepper(steps, stateFile);
  return {
    adapter: "chaos",
    model: CHAOS_MODEL,
    async ask(questions, state) {
      const step = nextStep();
      const http = HTTP[step];
      if (http) throw new JevApiError(`HTTP ${http.status}: ${http.text}`, { status: http.status, retryable: http.retryable });
      if (step === "timeout") throw new JevApiError("request timed out after 20000ms", { retryable: true });
      const result = await fake.ask(questions, state);
      const first = questions[0];
      if (step === "ok" || !first) return result;
      const answers = { ...result.answers };
      if (step === "missing") delete answers[first.id];
      else answers[first.id] = broken(first);
      return { answers, costUsd: 0 };
    }
  };
}

// src/ledger/redact.ts
var MIN_SECRET_LEN = 8;
var registeredSecrets = [];
function registerSecret(value) {
  const v = value?.trim();
  if (v && v.length >= MIN_SECRET_LEN && !registeredSecrets.includes(v)) registeredSecrets = [...registeredSecrets, v];
}
var PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  // A key with no END line (cut off by a line range, or pasted in part) is redacted to the end: fail closed.
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]{0,40}PRIVATE KEY-----|[\s\S]*)/g
];
var EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var KEY_VALUE = /(?<![A-Za-z0-9])([A-Za-z0-9_]{0,64}(?:api[_-]?key|token|secret|password|passwd)[A-Za-z0-9_]{0,64})(['"]?)(\s*[:=]\s*)(['"]?)[^\s'"]{8,}\4/gi;
var BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
function redactSecrets(text) {
  let out = text.replace(KEY_VALUE, (_m, key2, quote, sep) => `${key2}${quote}${sep}[redacted]`);
  out = out.replace(BEARER, (_m, word) => `${word} [redacted]`);
  for (const p of PATTERNS) out = out.replace(p, "[redacted]");
  for (const s of registeredSecrets) if (out.includes(s)) out = out.split(s).join("[redacted]");
  return out;
}
function redact(text) {
  return redactSecrets(text).replace(EMAIL, "[redacted]");
}
function redactDeep(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k), redactDeep(v)]));
  }
  return value;
}

// src/classifier/typesafe/wire.ts
var isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function num(v, what) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new JevApiError(`malformed response: ${what} is not a finite number`, { retryable: false, body: v });
  }
  return v;
}
function buildPayload(request, wireModel) {
  return { model: wireModel, state: request.state, questions: request.questions };
}
function readUsageAndCost(raw) {
  const usage = isRecord(raw.usage) ? raw.usage : {};
  const gateway = isRecord(raw.provider_metadata) && isRecord(raw.provider_metadata.gateway) ? raw.provider_metadata.gateway : {};
  const cost = Number(gateway.cost);
  return {
    usage: {
      inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
      outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0
    },
    ...gateway.cost !== void 0 && Number.isFinite(cost) ? { costUsd: cost } : {}
  };
}
function parseRetryAfterMs(headers, now = Date.now()) {
  const ms = headers.get("retry-after-ms");
  if (ms !== null && Number.isFinite(Number(ms)) && Number(ms) >= 0) return Number(ms);
  const raw = headers.get("retry-after");
  if (raw === null) return void 0;
  if (Number.isFinite(Number(raw))) return Number(raw) >= 0 ? Number(raw) * 1e3 : void 0;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - now);
}
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500 && status <= 599;
}
async function fetchWithTimeout(config, doFetch, url, key2, payload, opts) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  if (opts.signal?.aborted) controller.abort();
  try {
    return await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key2}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (cause) {
    if (opts.signal?.aborted) throw new JevApiError("request aborted by caller", { retryable: false, cause });
    throw new JevApiError(
      timedOut ? `request timed out after ${config.timeoutMs}ms` : `connection error: ${cause.message}`,
      { retryable: true, cause }
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}
function detailOf(body) {
  if (!isRecord(body)) return String(body).slice(0, 200);
  const err2 = body.error;
  if (isRecord(err2) && typeof err2.message === "string") return err2.message;
  if (typeof body.message === "string") return body.message;
  if (typeof err2 === "string") return err2;
  return JSON.stringify(body);
}
async function postSystemOne(config, doFetch, key2, payload, opts) {
  const res = await fetchWithTimeout(config, doFetch, `${config.baseURL}/v1/systemone`, key2, payload, opts);
  const text = await res.text().catch(() => "");
  let body = text;
  try {
    body = text ? JSON.parse(text) : void 0;
  } catch {
  }
  if (!res.ok) {
    const retryAfterMs = parseRetryAfterMs(res.headers);
    throw new JevApiError(`HTTP ${res.status}: ${detailOf(body)}`, {
      status: res.status,
      retryable: isRetryableStatus(res.status),
      ...retryAfterMs !== void 0 ? { retryAfterMs } : {},
      body
    });
  }
  return { body, requestId: res.headers.get("x-typesafe-request-id") };
}

// src/classifier/typesafe/answers.ts
function noulQuestion(instructions) {
  return { type: "noul", instructions };
}
function choiceQuestion(instructions, options) {
  if (options.length < 2 || options.length > 255 || new Set(options).size !== options.length) {
    throw new RangeError(`a choice question needs 2-255 distinct options, got ${options.length}`);
  }
  return { type: "choice", instructions, criteria: Object.fromEntries(options.map((o) => [o, o])) };
}
function scoreQuestion(instructions, levels) {
  if (levels.length < 2 || levels.length > 10) throw new RangeError(`a score question needs 2-10 levels, got ${levels.length}`);
  return { type: "score", instructions, criteria: [...levels] };
}
var RATE_PER_INPUT_TOKEN = {
  "jev-1.13.0": 42 / 1e9
  // $42 per Btok = $0.042 per Mtok
};
function costOf(model, usage, reported) {
  if (reported !== void 0) return { costUsd: reported };
  const rate = RATE_PER_INPUT_TOKEN[model];
  return rate === void 0 ? {} : { costUsd: usage.inputTokens * rate, costEstimated: true };
}
var malformed = (message, body) => new JevApiError(`malformed response: ${message}`, { retryable: false, body });
var confidenceOr = (raw, fallback) => typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : fallback;
function normalized(values, id, body) {
  const sum = values.reduce((s, v) => s + v, 0);
  if (sum <= 0) throw malformed(`${id}.probabilities sum to zero`, body);
  return values.map((v) => v / sum);
}
function probabilityAt(raw, key2, id) {
  const probs = raw.probabilities;
  if (probs[key2] === void 0) return 0;
  const v = num(probs[key2], `${id}.probabilities.${key2}`);
  if (v < 0) throw malformed(`${id}.probabilities.${key2} is negative`, raw);
  return v;
}
function readNoul(raw, id) {
  const probability = num(raw.noul, `${id}.noul`);
  if (probability < 0 || probability > 1) throw malformed(`${id}.noul must be in [0, 1], got ${probability}`, raw);
  return { type: "noul", probability, confidence: confidenceOr(raw, Math.abs(2 * probability - 1)) };
}
function readChoice(raw, id, options) {
  if (!isRecord(raw.probabilities)) throw malformed(`${id}.probabilities must be an object`, raw);
  for (const o of Object.keys(raw.probabilities)) {
    if (!options.includes(o)) throw malformed(`${id}.probabilities has option "${o}", not in the request's options`, raw);
  }
  const dist = normalized(options.map((o) => probabilityAt(raw, o, id)), id, raw);
  const probabilities = Object.fromEntries(options.map((o, i) => [o, dist[i]]));
  const choice = typeof raw.choice === "string" && options.includes(raw.choice) ? raw.choice : options.reduce((best, o) => probabilities[o] > probabilities[best] ? o : best, options[0]);
  const k = options.length;
  return { type: "choice", choice, probabilities, confidence: confidenceOr(raw, (k * Math.max(...dist) - 1) / (k - 1)) };
}
function readScore(raw, id, n) {
  if (!isRecord(raw.probabilities)) throw malformed(`${id}.probabilities must be an object`, raw);
  for (const key2 of Object.keys(raw.probabilities)) {
    if (!/^\d+$/u.test(key2) || Number(key2) >= n) throw malformed(`${id}.probabilities has level "${key2}", but the question has ${n} levels`, raw);
  }
  const distribution = normalized(Array.from({ length: n }, (_, i) => probabilityAt(raw, String(i), id)), id, raw);
  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : distribution.reduce((s, p, i) => s + p * i, 0);
  return { type: "score", score, distribution, confidence: confidenceOr(raw, (n * Math.max(...distribution) - 1) / (n - 1)) };
}
function parseAnswers(raw, questions) {
  if (!isRecord(raw) || !isRecord(raw.answers)) throw malformed("missing `answers`", raw);
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw.answers[id];
    if (!isRecord(a)) throw malformed(`no answer for question "${id}"`, a);
    if (a.type !== void 0 && a.type !== q.type) throw malformed(`answer "${id}" has type "${String(a.type)}", expected "${q.type}"`, a);
    answers[id] = q.type === "noul" ? readNoul(a, id) : q.type === "choice" ? readChoice(a, id, Object.keys(q.criteria)) : readScore(a, id, q.criteria.length);
  }
  const model = typeof raw.model === "string" ? raw.model : "";
  const { usage, costUsd } = readUsageAndCost(raw);
  return { model, answers, usage, ...costOf(model, usage, costUsd) };
}

// src/classifier/typesafe/client.ts
var NO_KEY_MESSAGE = "\u2716 provider: no TypeSafe key \u2192 set TYPESAFE_API_KEY (direct) or AI_GATEWAY_API_KEY (gateway), or SIDEWISE_PROVIDER=fake to try requests";
var MAX_RETRIES = 2;
var BASE_BACKOFF_MS = 1e3;
var MAX_BACKOFF_MS = 1e4;
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function backoffMs(attempt) {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.min(base + Math.random() * base * 0.2, MAX_BACKOFF_MS);
}
function createJevClient(config, deps = {}) {
  const key2 = config.apiKey;
  if (key2 === void 0) throw new JevConfigError(NO_KEY_MESSAGE);
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  return {
    config,
    async ask(request, opts = {}) {
      const payload = buildPayload(request, config.wireModel);
      for (let attempt = 1; ; attempt++) {
        try {
          const { body, requestId } = await postSystemOne(config, doFetch, key2, payload, opts);
          const parsed = parseAnswers(body, request.questions);
          return requestId ? { ...parsed, requestId } : parsed;
        } catch (e) {
          if (!(e instanceof JevApiError) || !e.retryable || attempt > MAX_RETRIES) throw e;
          const waitMs = e.retryAfterMs !== void 0 ? Math.min(e.retryAfterMs, MAX_BACKOFF_MS) : backoffMs(attempt);
          await sleep(waitMs);
        }
      }
    }
  };
}

// src/classifier/typesafe/adapter.ts
var NO_TYPESAFE_KEY_MESSAGE = "\u2716 provider: no TypeSafe key \u2192 set TYPESAFE_API_KEY or AI_GATEWAY_API_KEY, or SIDEWISE_PROVIDER=fake to try requests";
function createTypesafeAdapter(env = process.env, deps = {}) {
  const config = resolveJevConfig(env, { resolveStored: deps.resolveStored });
  if (!hasKey(config)) throw new JevConfigError(NO_TYPESAFE_KEY_MESSAGE);
  registerSecret(config.apiKey);
  const client = createJevClient(config, deps);
  return {
    adapter: "typesafe",
    model: config.model,
    async ask(questions, state) {
      if (!questions.length) return { answers: {}, costUsd: 0 };
      const wire = {};
      for (const q of questions) {
        const instructions = q.item === void 0 ? q.ask : { item: q.item, question: q.ask };
        wire[q.id] = q.type === "noul" ? noulQuestion(instructions) : q.type === "score" ? scoreQuestion(instructions, q.levels) : choiceQuestion(instructions, Object.keys(q.options));
      }
      const res = await client.ask({ state, questions: wire });
      const answers = {};
      for (const q of questions) {
        const a = res.answers[q.id];
        if (a.type === "noul") answers[q.id] = { type: "noul", probability: a.probability };
        else if (a.type === "score") answers[q.id] = { type: "score", score: a.score, distribution: a.distribution, confidence: a.confidence };
        else answers[q.id] = { type: "choice", choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
      }
      return { answers, costUsd: res.costUsd, costEstimated: res.costEstimated };
    }
  };
}

// src/classifier/select.ts
function selectProvider(env = process.env, deps = {}) {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === "fake") return createFakeAdapter();
  if (wanted === "chaos") {
    const s = parseSchedule(env.SIDEWISE_CHAOS);
    if ("stop" in s) throw new Error(s.stop);
    return createChaosAdapter(s.steps, deps.chaosState);
  }
  if (wanted === "typesafe") return createTypesafeAdapter(env, deps);
  if (wanted) throw new Error(`\u2716 provider: "${wanted}" is not a provider \u2192 use fake, chaos or typesafe`);
  return hasKey(resolveJevConfig(env, deps)) ? createTypesafeAdapter(env, deps) : createFakeAdapter();
}
function providerIdentity(env = process.env) {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === "fake") return { adapter: "fake", model: FAKE_MODEL, route: "fake", baseURL: null };
  if (wanted === "chaos") return { adapter: "chaos", model: CHAOS_MODEL, route: "chaos", baseURL: null };
  try {
    const config = resolveJevConfig(env);
    if (wanted === "typesafe" || hasKey(config)) return { adapter: "typesafe", model: config.model, route: routeLabel(config), baseURL: config.baseURL };
  } catch {
    return { adapter: "typesafe", model: "unknown", route: "custom", baseURL: null };
  }
  return { adapter: "fake", model: FAKE_MODEL, route: "fake", baseURL: null };
}

// src/ledger/ids.ts
import { randomBytes } from "node:crypto";
var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var RUN_ID = /^SW-(\d{4,})$/;
function ulid(now = Date.now(), random = (n) => randomBytes(n)) {
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
  return time + rand;
}
function formatRunId(n) {
  return `SW-${String(n).padStart(4, "0")}`;
}

// src/ledger/log.ts
import { accessSync, appendFileSync, closeSync as closeSync3, constants, existsSync as existsSync4, openSync as openSync3, readFileSync as readFileSync5, readSync as readSync2, statSync as statSync3 } from "node:fs";
import path4 from "node:path";

// src/ledger/index.ts
import { createHash, randomBytes as randomBytes2 } from "node:crypto";
import { closeSync as closeSync2, existsSync as existsSync3, openSync as openSync2, readFileSync as readFileSync4, readSync, renameSync as renameSync3, rmSync as rmSync2, statSync as statSync2 } from "node:fs";

// src/util/node-version.ts
var MIN_NODE_MAJOR = 22;
var MIN_NODE_MINOR = 13;
var MIN_NODE_LABEL = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;
function parseNodeVersion(v) {
  const m2 = /^v?(\d+)\.(\d+)/u.exec(v.trim());
  if (!m2) return void 0;
  return { major: Number(m2[1]), minor: Number(m2[2]) };
}
function nodeVersionOk(v) {
  const parsed = parseNodeVersion(v);
  if (!parsed) return false;
  if (parsed.major !== MIN_NODE_MAJOR) return parsed.major > MIN_NODE_MAJOR;
  return parsed.minor >= MIN_NODE_MINOR;
}
function nodeVersionStop(v) {
  if (nodeVersionOk(v)) return void 0;
  return `\u2716 node: ${v} is too old \u2192 install Node 22.13 or newer (it powers the ledger index); https://nodejs.org`;
}
function doctorNodeValue(v) {
  return nodeVersionOk(v) ? v : `${v} \u2716 too old \u2192 install Node ${MIN_NODE_LABEL}+`;
}
var DOCTOR_INDEX_TOO_OLD = `none (needs Node ${MIN_NODE_LABEL}+)`;

// src/ledger/index.ts
var whoKey = (who) => `${who.adapter}|${who.model}`;
var stripLines = (entry) => entry.replace(/:(\d+(?:-\d+)?)$/u, "");
function sweepPlaces(rec) {
  if (!rec.items) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (kind, val) => {
    const k = `${kind}\0${val}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ kind, val });
  };
  for (const item of Object.values(rec.items)) if (item.unit) add("where", item.unit.path);
  for (const layer of rec.ask.layers) for (const cat of layer.categories) for (const tag of cat.tags) add("tag", tag);
  return out;
}
var CHUNK_BYTES = 1 << 20;
function parseLedgerLine(raw, lineNo, shown2) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not valid JSON \u2192 fix or remove that line`);
  }
  if (!isRecord2(value)) {
    throw new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not a ledger record \u2192 fix or remove that line`);
  }
  return value;
}
function applyLine(sink, raw, startByte, lineNo, shown2) {
  const value = parseLedgerLine(raw, lineNo, shown2);
  if (value.kind === "outcome") {
    sink.outcome(value);
    return false;
  }
  if (value.kind !== "run") return false;
  sink.run(value, startByte);
  return true;
}
function scanRange(fd, from, to, sink, shown2, startUpto, startLineCount) {
  let at = startUpto;
  let line3 = startLineCount;
  let runsSeen = 0;
  let lastLineStart = startUpto;
  let lastLineRaw = "";
  let pos = from;
  let carry = Buffer.alloc(0);
  const buf = Buffer.alloc(Math.min(CHUNK_BYTES, Math.max(1, to - from)));
  while (pos < to) {
    const want = Math.min(buf.length, to - pos);
    const got = readSync(fd, buf, 0, want, pos);
    if (got <= 0) break;
    pos += got;
    const chunk = carry.length ? Buffer.concat([carry, buf.subarray(0, got)]) : Buffer.from(buf.subarray(0, got));
    let lineStart = 0;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== 10) continue;
      const raw = chunk.toString("utf8", lineStart, i);
      const startByte = at;
      at += i - lineStart + 1;
      line3 += 1;
      lastLineStart = startByte;
      lastLineRaw = raw;
      if (raw.trim() && applyLine(sink, raw, startByte, line3, shown2)) runsSeen += 1;
      lineStart = i + 1;
    }
    carry = Buffer.from(chunk.subarray(lineStart));
  }
  return { upto: at, lineCount: line3, runsSeen, lastLineStart, lastLineRaw };
}
var sha256hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");
function hashLogRange(logPath, from, to) {
  if (to <= from) return sha256hex("");
  const fd = openSync2(logPath, "r");
  try {
    const buf = Buffer.alloc(to - from);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, from + got);
      if (n <= 0) break;
      got += n;
    }
    return sha256hex(buf.subarray(0, got).toString("utf8"));
  } finally {
    closeSync2(fd);
  }
}
function readRecordAt(logPath, offset) {
  if (offset < 0) return void 0;
  let fd;
  try {
    fd = openSync2(logPath, "r");
  } catch {
    return void 0;
  }
  try {
    const size = statSync2(logPath).size;
    if (offset >= size) return void 0;
    let chunkSize = Math.min(4096, size - offset);
    for (; ; ) {
      const buf = Buffer.alloc(chunkSize);
      const got = readSync(fd, buf, 0, chunkSize, offset);
      if (got <= 0) return void 0;
      const nl = buf.subarray(0, got).indexOf(10);
      const complete = nl !== -1 ? buf.toString("utf8", 0, nl) : offset + got >= size ? buf.toString("utf8", 0, got) : null;
      if (complete !== null) {
        try {
          return JSON.parse(complete);
        } catch {
          return void 0;
        }
      }
      chunkSize = Math.min(chunkSize * 2, size - offset);
    }
  } catch {
    return void 0;
  } finally {
    closeSync2(fd);
  }
}
function emptyMemoryState() {
  return { runOffset: /* @__PURE__ */ new Map(), blocked: /* @__PURE__ */ new Set(), reuseKey: /* @__PURE__ */ new Map(), candidatesByWho: /* @__PURE__ */ new Map(), places: [], childrenByParent: /* @__PURE__ */ new Map(), outcomes: /* @__PURE__ */ new Map(), runCount: 0, upto: 0, lineCount: 0 };
}
function memorySink(state) {
  return {
    run(rec, offset) {
      state.runCount += 1;
      state.runOffset.set(rec.id, offset);
      const parent = rec.parent ?? null;
      if (parent) {
        if (!state.childrenByParent.has(parent)) state.childrenByParent.set(parent, []);
        state.childrenByParent.get(parent).push({ id: rec.id, offset });
      }
      if (isContractRun(rec)) {
        const wk = whoKey({ adapter: rec.adapter, model: rec.model });
        if (!state.candidatesByWho.has(wk)) state.candidatesByWho.set(wk, []);
        state.candidatesByWho.get(wk).unshift({ id: rec.id, offset });
        if (!state.reuseKey.has(wk)) state.reuseKey.set(wk, /* @__PURE__ */ new Map());
        const table = state.reuseKey.get(wk);
        for (const [qid, key2] of Object.entries(rec.keys)) table.set(key2, { runId: rec.reusedFrom[qid] ?? rec.id, qid });
        for (const w of rec.where) state.places.push({ kind: "where", val: stripLines(w), runId: rec.id });
        for (const p of sweepPlaces(rec)) state.places.push({ ...p, runId: rec.id });
      } else {
        for (const w of rec.where) state.places.push({ kind: "where", val: w.path, runId: rec.id });
        for (const t of rec.tags) state.places.push({ kind: "tag", val: t, runId: rec.id });
      }
    },
    outcome(rec) {
      if (rec.outcome === "held") state.blocked.delete(rec.of);
      else state.blocked.add(rec.of);
      state.outcomes.set(rec.of, { outcome: rec.outcome, uid: rec.uid, ts: rec.ts, by: rec.by });
    }
  };
}
function handleFromMemory(state) {
  return {
    findOffset: (id) => state.runOffset.get(id),
    runCount: () => state.runCount,
    upto: () => state.upto,
    lineCount: () => state.lineCount,
    isBlocked: (id) => state.blocked.has(id),
    reuseKeyHit: (adapter, model, key2) => {
      const hit = state.reuseKey.get(whoKey({ adapter, model }))?.get(key2);
      if (!hit) return void 0;
      const offset = state.runOffset.get(hit.runId);
      return offset === void 0 ? void 0 : { ...hit, offset, blocked: state.blocked.has(hit.runId) };
    },
    candidates: (adapter, model) => (state.candidatesByWho.get(whoKey({ adapter, model })) ?? []).filter((c) => !state.blocked.has(c.id)),
    placeCandidates: (place) => {
      const prefix = `${place}/`;
      const ids = /* @__PURE__ */ new Set();
      for (const p of state.places) {
        const hit = p.kind === "tag" ? p.val === place : p.val === place || p.val.startsWith(prefix);
        if (hit) ids.add(p.runId);
      }
      return [...ids].map((id) => ({ id, offset: state.runOffset.get(id) })).filter((c) => c.offset !== void 0).sort((a, b) => a.offset - b.offset);
    },
    childrenOf: (parentId) => state.childrenByParent.get(parentId) ?? [],
    outcomesFor: (ids) => {
      const want = new Set(ids);
      const out = /* @__PURE__ */ new Map();
      for (const [id, rec] of state.outcomes) if (want.has(id)) out.set(id, rec.outcome);
      return out;
    },
    everHeld: (adapter, model, key2) => state.reuseKey.get(whoKey({ adapter, model }))?.has(key2) ?? false,
    latestOutcomeOf: (id) => state.outcomes.get(id)
  };
}
var memoryCache;
function buildMemoryHandle(paths) {
  const st = existsSync3(paths.log) ? statSync2(paths.log) : void 0;
  const size = st?.size ?? 0;
  const mtimeMs = st ? Math.round(st.mtimeMs) : 0;
  if (memoryCache && memoryCache.logPath === paths.log && memoryCache.size === size && memoryCache.mtimeMs === mtimeMs) {
    return handleFromMemory(memoryCache.state);
  }
  const state = emptyMemoryState();
  if (size > 0) {
    const fd = openSync2(paths.log, "r");
    try {
      const result = scanRange(fd, 0, size, memorySink(state), shownLog(paths), 0, 0);
      state.upto = result.upto;
      state.lineCount = result.lineCount;
    } finally {
      closeSync2(fd);
    }
  }
  memoryCache = { logPath: paths.log, size, mtimeMs, state };
  return handleFromMemory(state);
}
var SCHEMA_VERSION = 3;
var SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  offset INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  verb TEXT NOT NULL,
  ts TEXT NOT NULL,
  gate TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  wise TEXT,
  parent TEXT
);
CREATE INDEX idx_runs_adapter_model ON runs(adapter, model, blocked);
CREATE INDEX idx_runs_parent ON runs(parent);
CREATE TABLE answer_keys (
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  PRIMARY KEY (adapter, model, key)
);
CREATE TABLE outcomes (
  run_id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,
  uid TEXT NOT NULL,
  ts TEXT NOT NULL,
  by TEXT NOT NULL
);
CREATE TABLE places (
  kind TEXT NOT NULL,
  val TEXT NOT NULL,
  run_id TEXT NOT NULL,
  PRIMARY KEY (kind, val, run_id)
);
CREATE INDEX idx_places_val ON places(kind, val);
`;
var __testOnly = { forceFallback: false, throwOnCandidates: false, forceSqliteMissing: false };
function isSqliteExperimentalWarning(w) {
  return w.name === "ExperimentalWarning" && /sqlite/iu.test(w.message ?? "");
}
var warningFilterInstalled = false;
function installSqliteWarningFilter() {
  if (warningFilterInstalled) return;
  warningFilterInstalled = true;
  const originalEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning, ...rest) => {
    const message = typeof warning === "string" ? warning : warning.message;
    const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type ?? "";
    if (isSqliteExperimentalWarning({ name: type, message })) return;
    return originalEmitWarning(warning, ...rest);
  });
}
var sqliteCtor;
function getSqliteCtor() {
  if (__testOnly.forceSqliteMissing) return null;
  if (sqliteCtor !== void 0) return sqliteCtor;
  const getBuiltin = process.getBuiltinModule;
  if (typeof getBuiltin !== "function") {
    sqliteCtor = null;
    return null;
  }
  installSqliteWarningFilter();
  try {
    const mod = getBuiltin("node:sqlite");
    sqliteCtor = typeof mod?.DatabaseSync === "function" ? mod.DatabaseSync : null;
  } catch {
    sqliteCtor = null;
  }
  return sqliteCtor;
}
function sqliteAvailable() {
  return getSqliteCtor() !== null;
}
function getMeta(db, key2) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key2);
  return row ? String(row.value) : void 0;
}
function setMeta(db, key2, value) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key2, value);
}
function prepStatements(db) {
  return {
    insertRun: db.prepare("INSERT OR REPLACE INTO runs (id, offset, adapter, model, verb, ts, gate, blocked, wise, parent) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)"),
    insertKey: db.prepare("INSERT OR REPLACE INTO answer_keys (adapter, model, key, run_id, qid) VALUES (?, ?, ?, ?, ?)"),
    insertOutcome: db.prepare("INSERT OR REPLACE INTO outcomes (run_id, outcome, uid, ts, by) VALUES (?, ?, ?, ?, ?)"),
    insertPlace: db.prepare("INSERT OR IGNORE INTO places (kind, val, run_id) VALUES (?, ?, ?)"),
    updateBlocked: db.prepare("UPDATE runs SET blocked = ? WHERE id = ?")
  };
}
function wiseJson(rec) {
  if (!isContractRun(rec)) return null;
  const categories = Object.keys(rec.categories ?? {});
  if (rec.wise === null && categories.length === 0) return null;
  return JSON.stringify({ wise: rec.wise, categories });
}
function sqlSink(stmts) {
  return {
    run(rec, offset) {
      const gate = "gate" in rec ? rec.gate ?? null : null;
      stmts.insertRun.run(rec.id, offset, rec.adapter, rec.model, rec.verb, rec.ts, gate, wiseJson(rec), rec.parent ?? null);
      if (isContractRun(rec)) {
        for (const [qid, key2] of Object.entries(rec.keys)) stmts.insertKey.run(rec.adapter, rec.model, key2, rec.reusedFrom[qid] ?? rec.id, qid);
        for (const w of rec.where) stmts.insertPlace.run("where", stripLines(w), rec.id);
        for (const p of sweepPlaces(rec)) stmts.insertPlace.run(p.kind, p.val, rec.id);
      } else {
        for (const w of rec.where) stmts.insertPlace.run("where", w.path, rec.id);
        for (const t of rec.tags) stmts.insertPlace.run("tag", t, rec.id);
      }
    },
    outcome(rec) {
      stmts.insertOutcome.run(rec.of, rec.outcome, rec.uid, rec.ts, rec.by);
      stmts.updateBlocked.run(rec.outcome === "held" ? 0 : 1, rec.of);
    }
  };
}
function readMetaState(db) {
  return { upto: Number(getMeta(db, "upto") ?? "0"), lineCount: Number(getMeta(db, "line_count") ?? "0"), runCount: Number(getMeta(db, "run_count") ?? "0") };
}
function fingerprintNow(logPath, from, to) {
  return hashLogRange(logPath, from, to);
}
function writeMetaStateFull(db, logPath, result) {
  setMeta(db, "upto", String(result.upto));
  setMeta(db, "line_count", String(result.lineCount));
  setMeta(db, "run_count", String(result.runsSeen));
  setMeta(db, "fp_start", String(result.lastLineStart));
  setMeta(db, "fingerprint", fingerprintNow(logPath, result.lastLineStart, result.upto));
}
function writeMetaStateCatchUp(db, logPath, before, result) {
  if (result.upto === before.upto) return;
  setMeta(db, "upto", String(result.upto));
  setMeta(db, "line_count", String(result.lineCount));
  setMeta(db, "run_count", String(before.runCount + result.runsSeen));
  setMeta(db, "fp_start", String(result.lastLineStart));
  setMeta(db, "fingerprint", fingerprintNow(logPath, result.lastLineStart, result.upto));
}
function escapeLike(s) {
  return s.replace(/[\\%_]/gu, (c) => `\\${c}`);
}
function handleFromSql(db) {
  const stFindOffset = db.prepare("SELECT offset FROM runs WHERE id = ?");
  const stIsBlocked = db.prepare("SELECT blocked FROM runs WHERE id = ?");
  const stReuseHit = db.prepare(
    "SELECT ak.run_id AS runId, ak.qid AS qid, r.offset AS offset, r.blocked AS blocked FROM answer_keys ak JOIN runs r ON r.id = ak.run_id WHERE ak.adapter = ? AND ak.model = ? AND ak.key = ?"
  );
  const stCandidates = db.prepare("SELECT id, offset FROM runs WHERE adapter = ? AND model = ? AND blocked = 0 ORDER BY rowid DESC");
  const stPlaces = db.prepare(
    `SELECT DISTINCT r.id AS id, r.offset AS offset FROM places p JOIN runs r ON r.id = p.run_id WHERE (p.kind = 'where' AND (p.val = ? OR p.val LIKE ? ESCAPE '\\')) OR (p.kind = 'tag' AND p.val = ?) ORDER BY r.offset ASC`
  );
  const stEverHeld = db.prepare("SELECT 1 FROM answer_keys WHERE adapter = ? AND model = ? AND key = ?");
  const stLatestOutcome = db.prepare("SELECT outcome, uid, ts, by FROM outcomes WHERE run_id = ?");
  const stChildren = db.prepare("SELECT id, offset FROM runs WHERE parent = ? ORDER BY offset ASC");
  return {
    findOffset: (id) => {
      const row = stFindOffset.get(id);
      return row ? Number(row.offset) : void 0;
    },
    // A line count (run_count in meta), not SELECT COUNT(*) FROM runs — see applyLine's comment: `runs.id` is a
    // PK (INSERT OR REPLACE), which a real ledger's id-assignment invariant never collides, but nextRunNumber
    // must still count LINES the way readLedger's own linear scan always has, matching the fallback exactly.
    runCount: () => Number(getMeta(db, "run_count") ?? "0"),
    upto: () => Number(getMeta(db, "upto") ?? "0"),
    lineCount: () => Number(getMeta(db, "line_count") ?? "0"),
    isBlocked: (id) => {
      const row = stIsBlocked.get(id);
      return !!row && Number(row.blocked) !== 0;
    },
    reuseKeyHit: (adapter, model, key2) => {
      const row = stReuseHit.get(adapter, model, key2);
      return row ? { runId: String(row.runId), qid: String(row.qid), offset: Number(row.offset), blocked: Number(row.blocked) !== 0 } : void 0;
    },
    candidates: (adapter, model) => {
      if (__testOnly.throwOnCandidates) {
        __testOnly.throwOnCandidates = false;
        throw new Error("injected SQLite fault (test only)");
      }
      return stCandidates.all(adapter, model).map((r) => ({ id: String(r.id), offset: Number(r.offset) }));
    },
    placeCandidates: (place) => stPlaces.all(place, `${escapeLike(place)}/%`, place).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    childrenOf: (parentId) => stChildren.all(parentId).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    outcomesFor: (ids) => {
      const out = /* @__PURE__ */ new Map();
      if (!ids.length) return out;
      const stmt = db.prepare(`SELECT run_id AS runId, outcome FROM outcomes WHERE run_id IN (${ids.map(() => "?").join(",")})`);
      for (const row of stmt.all(...ids)) out.set(String(row.runId), row.outcome);
      return out;
    },
    everHeld: (adapter, model, key2) => !!stEverHeld.get(adapter, model, key2),
    latestOutcomeOf: (id) => {
      const row = stLatestOutcome.get(id);
      return row ? { outcome: row.outcome, uid: String(row.uid), ts: String(row.ts), by: String(row.by) } : void 0;
    }
  };
}
function withLockIfNeeded(lockPath, fn) {
  let heldByUs = false;
  try {
    heldByUs = Number.parseInt(readFileSync4(lockPath, "utf8").trim(), 10) === process.pid;
  } catch {
  }
  return heldByUs ? fn() : withLock(lockPath, fn);
}
function tmpDbPath(dbPath) {
  return `${dbPath}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`;
}
function rmDbFiles(dbPath) {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync3(f)) rmSync2(f, { force: true });
  }
}
function rmSiblingWalShm(dbPath) {
  for (const f of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync3(f)) rmSync2(f, { force: true });
  }
}
function rebuildToDisk(paths, Db) {
  ensureDir(paths);
  const tmp = tmpDbPath(paths.index);
  rmDbFiles(tmp);
  const db = new Db(tmp);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(SCHEMA_SQL);
    const stmts = prepStatements(db);
    const size = existsSync3(paths.log) ? statSync2(paths.log).size : 0;
    db.exec("BEGIN");
    let result;
    if (size > 0) {
      const fd = openSync2(paths.log, "r");
      try {
        result = scanRange(fd, 0, size, sqlSink(stmts), shownLog(paths), 0, 0);
      } finally {
        closeSync2(fd);
      }
    } else {
      result = { upto: 0, lineCount: 0, runsSeen: 0, lastLineStart: 0, lastLineRaw: "" };
    }
    setMeta(db, "schema_version", String(SCHEMA_VERSION));
    writeMetaStateFull(db, paths.log, result);
    db.exec("COMMIT");
  } catch (e) {
    db.close();
    rmDbFiles(tmp);
    throw e;
  }
  db.close();
  if (existsSync3(paths.index)) {
    try {
      if (statSync2(paths.index).isDirectory()) rmSync2(paths.index, { recursive: true, force: true });
    } catch {
    }
  }
  rmSiblingWalShm(paths.index);
  renameSync3(tmp, paths.index);
  return new Db(paths.index);
}
function catchUpInPlace(db, paths) {
  const stmts = prepStatements(db);
  const before = readMetaState(db);
  const size = existsSync3(paths.log) ? statSync2(paths.log).size : 0;
  if (size <= before.upto) return;
  db.exec("BEGIN");
  try {
    const fd = openSync2(paths.log, "r");
    let result;
    try {
      result = scanRange(fd, before.upto, size, sqlSink(stmts), shownLog(paths), before.upto, before.lineCount);
    } finally {
      closeSync2(fd);
    }
    writeMetaStateCatchUp(db, paths.log, before, result);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function sizeLooksSane(db, dbPath) {
  try {
    const pageCount = Number(db.prepare("PRAGMA page_count").get()?.page_count ?? -1);
    const pageSize = Number(db.prepare("PRAGMA page_size").get()?.page_size ?? -1);
    if (!(pageCount >= 0) || !(pageSize > 0)) return false;
    return pageCount * pageSize === statSync2(dbPath).size;
  } catch {
    return false;
  }
}
function quickCheckOk(db) {
  try {
    const quick = db.prepare("PRAGMA quick_check").get();
    return !!quick && quick.quick_check === "ok";
  } catch {
    return false;
  }
}
function tryOpenAndCheck(paths, Db) {
  if (!existsSync3(paths.index)) return { ok: false };
  let db;
  try {
    db = new Db(paths.index);
  } catch {
    return { ok: false };
  }
  try {
    if (!sizeLooksSane(db, paths.index) && !quickCheckOk(db)) return { ok: false, db };
    if (getMeta(db, "schema_version") !== String(SCHEMA_VERSION)) return { ok: false, db };
    const { upto } = readMetaState(db);
    const size = existsSync3(paths.log) ? statSync2(paths.log).size : 0;
    if (size < upto) return { ok: false, db };
    const fpStart = Number(getMeta(db, "fp_start") ?? "0");
    const storedFp = getMeta(db, "fingerprint") ?? "";
    if (hashLogRange(paths.log, fpStart, upto) !== storedFp) return { ok: false, db };
    return { ok: true, db, fresh: size === upto };
  } catch {
    return { ok: false, db };
  }
}
function safeClose(db) {
  try {
    db.close();
  } catch {
  }
}
function refreshUnderLock(paths, Db) {
  const check = tryOpenAndCheck(paths, Db);
  if (check.ok) {
    if (!check.fresh) catchUpInPlace(check.db, paths);
    return check.db;
  }
  if (check.db) safeClose(check.db);
  return rebuildToDisk(paths, Db);
}
function ensureFreshDb(paths, Db, opts) {
  if (!opts.forceRebuild) {
    const check = tryOpenAndCheck(paths, Db);
    if (check.ok && check.fresh) return check.db;
    if (check.ok) {
      if (opts.readOnly) {
        safeClose(check.db);
        return void 0;
      }
      safeClose(check.db);
      return withLockIfNeeded(paths.lock, () => refreshUnderLock(paths, Db));
    }
    if (check.db) safeClose(check.db);
  }
  if (opts.readOnly) return void 0;
  return withLockIfNeeded(paths.lock, () => refreshUnderLock(paths, Db));
}
function withIndex(paths, fn, opts = {}) {
  const logStat = existsSync3(paths.log) ? statSync2(paths.log) : void 0;
  if (!logStat || logStat.size === 0) return fn(handleFromMemory(emptyMemoryState()));
  return runSqlite(paths, fn, { forceRebuild: opts.forceRebuild ?? false, readOnly: opts.readOnly ?? false });
}
var NODE_TOO_OLD_LEDGER_MESSAGE = `\u2716 ledger: node:sqlite is unavailable \u2192 install Node ${MIN_NODE_LABEL} or newer (it powers the ledger index); https://nodejs.org`;
function runSqlite(paths, fn, opts) {
  if (__testOnly.forceFallback) return fn(buildMemoryHandle(paths));
  try {
    const Db = getSqliteCtor();
    if (!Db) throw new LedgerError(NODE_TOO_OLD_LEDGER_MESSAGE);
    const db = ensureFreshDb(paths, Db, opts);
    if (!db) return fn(buildMemoryHandle(paths));
    try {
      return fn(handleFromSql(db));
    } finally {
      safeClose(db);
    }
  } catch (e) {
    if (e instanceof LedgerError) throw e;
    return fn(buildMemoryHandle(paths));
  }
}

// src/ledger/log.ts
var LedgerError = class extends Error {
  /** 1: the ledger itself is the problem · 2: the caller asked for something the ledger doesn't hold. */
  exit;
  constructor(message, exit = 1) {
    super(message);
    this.name = "LedgerError";
    this.exit = exit;
  }
};
var isRun = (r) => r.kind === "run" && !("v" in r);
var isContractRun = (r) => r.kind === "run" && r.v === 2;
var iso2 = (now) => new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
var isText = (v) => typeof v === "string";
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function isRecord2(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v;
  if (r.kind === "outcome") return [r.id, r.of, r.outcome, r.by, r.ts].every(isText);
  if (r.kind === "failed") return [r.id, r.ts, r.verb, r.actor, r.adapter, r.model, r.reason].every(isText);
  if (r.kind !== "run") return false;
  if (r.v === 2) {
    return [r.id, r.uid, r.ts, r.verb, r.goal, r.gate, r.adapter, r.model, r.actor, r.response].every(isText) && Array.isArray(r.where) && r.where.every(isText) && isObj(r.answers) && isObj(r.keys) && isObj(r.categories);
  }
  return [r.id, r.ts, r.verb, r.focus, r.consensus, r.verdict, r.adapter].every(isText) && typeof r.level === "number" && Array.isArray(r.tags) && r.tags.every(isText) && Array.isArray(r.where) && r.where.every((w) => !!w && typeof w === "object" && isText(w.path));
}
var shownLog = (paths) => path4.relative(paths.root, paths.log).split(path4.sep).join("/");
function readLedger(paths, opts = {}) {
  const text = onStore(paths.log, "read", () => existsSync4(paths.log) ? readFileSync5(paths.log, "utf8") : "");
  const shown2 = shownLog(paths);
  const records = [];
  const lines = text.split("\n");
  lines.forEach((line3, i) => {
    if (!line3.trim()) return;
    const inProgress = opts.partialTail === true && i === lines.length - 1;
    let value;
    try {
      value = JSON.parse(line3);
    } catch {
      if (inProgress) return;
      throw new LedgerError(`\u2716 ledger: line ${i + 1} of ${shown2} is not valid JSON \u2192 fix or remove that line`);
    }
    if (!isRecord2(value)) {
      if (inProgress) return;
      throw new LedgerError(`\u2716 ledger: line ${i + 1} of ${shown2} is not a ledger record \u2192 fix or remove that line`);
    }
    records.push(value);
  });
  return records;
}
function checkTail(paths, upto, lineCount) {
  if (!existsSync4(paths.log)) return;
  const size = statSync3(paths.log).size;
  if (size <= upto) return;
  const fd = openSync3(paths.log, "r");
  let raw;
  try {
    const buf = Buffer.alloc(size - upto);
    let got = 0;
    while (got < buf.length) {
      const n = readSync2(fd, buf, got, buf.length - got, upto + got);
      if (n <= 0) break;
      got += n;
    }
    raw = buf.subarray(0, got).toString("utf8");
  } finally {
    closeSync3(fd);
  }
  if (!raw.trim()) return;
  const shown2 = shownLog(paths);
  const lineNo = lineCount + 1;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not valid JSON \u2192 fix or remove that line`);
  }
  if (!isRecord2(value)) throw new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not a ledger record \u2192 fix or remove that line`);
}
function checkLedger(paths) {
  withLock(paths.lock, () => {
    onStore(paths.log, "read", () => {
      const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
      checkTail(paths, at.upto, at.lineCount);
    });
    if (existsSync4(paths.log)) onStore(paths.log, "write", () => accessSync(paths.log, constants.W_OK));
  });
}
function logEndsCleanly(logPath) {
  let size;
  try {
    size = statSync3(logPath).size;
  } catch {
    return true;
  }
  if (size === 0) return true;
  const fd = openSync3(logPath, "r");
  try {
    const buf = Buffer.alloc(1);
    const got = readSync2(fd, buf, 0, 1, size - 1);
    return got === 1 && buf[0] === 10;
  } finally {
    closeSync3(fd);
  }
}
function appendLine(paths, record2) {
  onStore(paths.log, "write", () => {
    ensureDir(paths);
    const needsBreak = !logEndsCleanly(paths.log);
    appendFileSync(paths.log, `${needsBreak ? "\n" : ""}${JSON.stringify(record2)}
`);
  });
}
function nextRunNumber(paths) {
  return withIndex(paths, (h) => h.runCount()) + 1;
}
function matchingRun(at, logPath, id) {
  const record2 = readRecordAt(logPath, at);
  return record2 && record2.kind === "run" && record2.id === id ? record2 : void 0;
}
function findRun(paths, id) {
  const at = withIndex(paths, (h) => h.findOffset(id), { readOnly: true });
  if (at === void 0) return void 0;
  const first = matchingRun(at, paths.log, id);
  if (first) return first;
  const at2 = withIndex(paths, (h) => h.findOffset(id), { forceRebuild: true, readOnly: true });
  return at2 === void 0 ? void 0 : matchingRun(at2, paths.log, id);
}
function appendRunLocked(paths, run, now = Date.now()) {
  const record2 = { kind: "run", id: formatRunId(nextRunNumber(paths)), uid: ulid(now), ts: iso2(now), ...redactDeep(run), actor: redactSecrets(run.actor) };
  appendLine(paths, record2);
  return record2;
}
function appendContractRunLocked(paths, run, now, budget) {
  const id = formatRunId(nextRunNumber(paths));
  const { response, ...rest } = run;
  const record2 = {
    kind: "run",
    v: 2,
    id,
    uid: ulid(now),
    ts: iso2(now),
    ...redactDeep(rest),
    actor: redactSecrets(run.actor),
    response: redact(response(id, budget))
  };
  appendLine(paths, record2);
  return record2;
}
function appendContractRun(paths, run, now, budget) {
  return withLock(paths.lock, () => appendContractRunLocked(paths, run, now, budget));
}
function appendFailedLocked(paths, failed, now = Date.now()) {
  onStore(paths.log, "read", () => {
    const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
    checkTail(paths, at.upto, at.lineCount);
  });
  const uid = ulid(now);
  const record2 = { kind: "failed", id: uid, uid, ts: iso2(now), ...redactDeep(failed), actor: redactSecrets(failed.actor) };
  appendLine(paths, record2);
  return record2;
}
function appendOutcome(paths, of, outcome, by, now = Date.now()) {
  return withLock(paths.lock, () => {
    const run = findRun(paths, of);
    if (!run) throw new LedgerError(`\u2716 outcome: ${of} is not in the ledger \u2192 check the id with "sidewise view ${of}"`, 2);
    const who = redactSecrets(by);
    if (outcome === "held" && who === run.actor) {
      throw new LedgerError(`\u2716 outcome: ${who} asked ${of}, so it can't mark it held \u2192 another agent or the owner records "held"`);
    }
    onStore(paths.log, "read", () => {
      const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
      checkTail(paths, at.upto, at.lineCount);
    });
    const latest = withIndex(paths, (h) => h.latestOutcomeOf(of));
    if (latest && latest.outcome === outcome && latest.by === who) {
      return { record: { kind: "outcome", id: `${of}-outcome`, uid: latest.uid, ts: latest.ts, of, outcome, by: who }, repeat: true };
    }
    const record2 = { kind: "outcome", id: `${of}-outcome`, uid: ulid(now), ts: iso2(now), of, outcome, by: who };
    appendLine(paths, record2);
    return { record: record2, repeat: false };
  });
}
function latestOutcome(records, id) {
  let found = null;
  for (const r of records) if (r.kind === "outcome" && r.of === id) found = r.outcome;
  return found;
}

// src/mcp/stdio.ts
import readline from "node:readline";

// src/mcp/protocol.ts
var SUPPORTED_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
var DEFAULT_VERSION = "2025-06-18";
var TOOL_NAME = "sidewise";
function toolDefinition() {
  return {
    name: TOOL_NAME,
    description: 'Run a sidewise CLI command in this project \u2014 the same arguments and stdin the sidewise CLI takes (e.g. args: ["class","-"], stdin: <request YAML>, or args: ["doctor"]). Returns the same text output sidewise would print, and marks the result an error when the exit code is not 0.',
    inputSchema: {
      type: "object",
      properties: {
        args: { type: "array", items: { type: "string" }, description: 'sidewise CLI arguments, e.g. ["doctor"] or ["class","-"]' },
        stdin: { type: "string", description: 'Text to feed as stdin, for a "-" argument (e.g. the request YAML).' },
        project: { type: "string", description: "The project directory to use (SIDEWISE_HOME), when it is not the current working directory." }
      },
      required: ["args"]
    }
  };
}
var err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
var ok = (id, result) => ({ jsonrpc: "2.0", id, result });
async function handleMessage(msg, deps) {
  const hasId = Object.hasOwn(msg, "id") && msg.id !== void 0;
  if (!hasId) return void 0;
  const id = msg.id;
  const method = typeof msg.method === "string" ? msg.method : void 0;
  if (!method || msg.jsonrpc !== "2.0") return err(id, -32600, "Invalid Request");
  if (method === "initialize") {
    const params = msg.params ?? {};
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : void 0;
    const protocolVersion = requested && SUPPORTED_VERSIONS.includes(requested) ? requested : DEFAULT_VERSION;
    return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "sidewise", version: deps.serverVersion } });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: [toolDefinition()] });
  if (method === "tools/call") {
    const params = msg.params ?? {};
    if (params.name !== TOOL_NAME) return err(id, -32602, `Unknown tool: ${String(params.name)}`);
    const rawArgs = params.arguments?.args;
    const args2 = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
    const stdin = typeof params.arguments?.stdin === "string" ? params.arguments.stdin : void 0;
    const project = typeof params.arguments?.project === "string" ? params.arguments.project : void 0;
    try {
      const { exit, text } = await deps.runOne(args2, stdin, project);
      return ok(id, { content: [{ type: "text", text }], isError: exit !== 0 });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return ok(id, { content: [{ type: "text", text: `\u2716 sidewise: ${message}` }], isError: true });
    }
  }
  return err(id, -32601, `Method not found: ${method}`);
}

// src/mcp/stdio.ts
function runMcpServer(io, runOne, serverVersion) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: io.input, terminal: false });
    rl.on("line", (line3) => {
      const trimmed = line3.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        io.output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}
`);
        return;
      }
      handleMessage(msg, { runOne, serverVersion }).then((response) => {
        if (response) io.output.write(`${JSON.stringify(response)}
`);
      }).catch(() => {
        const id = msg.id ?? null;
        io.output.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } })}
`);
      });
    });
    rl.on("close", () => resolve());
  });
}

// src/setup/env-file.ts
import { chmodSync, existsSync as existsSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync6, rmSync as rmSync3, statSync as statSync4, writeFileSync as writeFileSync4 } from "node:fs";
import os from "node:os";
import path5 from "node:path";
var ALLOWED_NAMES = ["TYPESAFE_API_KEY", "AI_GATEWAY_API_KEY", "SIDEWISE_BASE_URL", "JEV_MODEL", "JEV_GATEWAY_MODEL", "SIDEWISE_PROVIDER"];
var isAllowedName = (s) => ALLOWED_NAMES.includes(s);
var EXPORT_LINE = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)='([^']*)'\s*$/u;
function sidewiseConfigDir(env = process.env) {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return xdg ? path5.join(xdg, "sidewise") : path5.join(os.homedir(), ".config", "sidewise");
}
function envFilePath(env = process.env) {
  return path5.join(sidewiseConfigDir(env), "env");
}
function readEnvFile(file) {
  if (!existsSync5(file)) return void 0;
  let mode;
  let raw;
  try {
    mode = statSync4(file).mode & 511;
    raw = readFileSync6(file, "utf8");
  } catch {
    return void 0;
  }
  const values = {};
  let ignoredLines = 0;
  for (const line3 of raw.split("\n")) {
    const trimmed = line3.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const m2 = EXPORT_LINE.exec(line3);
    if (m2 && isAllowedName(m2[1])) {
      values[m2[1]] = m2[2];
    } else {
      ignoredLines++;
    }
  }
  return { values, mode, ignoredLines };
}
var canQuote = (value) => !value.includes("'");
function setEnvFileValue(file, name, value) {
  if (!canQuote(value)) throw new Error(`env-file: "${name}"'s value contains a single quote, which this file format can't represent`);
  const dir = path5.dirname(file);
  mkdirSync4(dir, { recursive: true });
  chmodSync(dir, 448);
  const existing = existsSync5(file) ? readFileSync6(file, "utf8").split("\n") : [];
  const newLine = `export ${name}='${value}'`;
  let replaced = false;
  const next = existing.map((line3) => {
    const m2 = EXPORT_LINE.exec(line3);
    if (m2 && m2[1] === name) {
      replaced = true;
      return newLine;
    }
    return line3;
  });
  if (!replaced) next.push(newLine);
  writeFileSync4(file, `${next.join("\n").replace(/\n+$/u, "")}
`);
  chmodSync(file, 384);
}
function removeEnvFileValue(file, name) {
  if (!existsSync5(file)) return "absent";
  const lines = readFileSync6(file, "utf8").split("\n");
  let found = false;
  const next = lines.filter((line3) => {
    const m2 = EXPORT_LINE.exec(line3);
    if (m2 && m2[1] === name) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found) return "absent";
  if (next.join("\n").trim() === "") {
    rmSync3(file, { force: true });
    return "file-removed";
  }
  writeFileSync4(file, `${next.join("\n").replace(/\n+$/u, "")}
`);
  chmodSync(file, 384);
  return "removed";
}
function looseFileModeWarning(file, mode) {
  if ((mode & 63) === 0) return void 0;
  return `\u2716 credentials: ${file} is mode ${mode.toString(8)}, looser than 0600 \u2192 chmod 600 ${file}`;
}

// src/setup/keychain.ts
var TIMEOUT_MS = 3e3;
var cleanLine = (s) => s.replace(/\r?\n+$/u, "");
function keychainLookup(runner, platform) {
  if (platform === "darwin") {
    const r = runner("security", ["find-generic-password", "-s", "sidewise", "-a", "typesafe", "-w"], { timeoutMs: TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : void 0;
  }
  if (platform === "linux") {
    const r = runner("secret-tool", ["lookup", "service", "sidewise", "account", "typesafe"], { timeoutMs: TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : void 0;
  }
  return void 0;
}
function keychainStore(runner, platform, secret) {
  if (platform === "linux") {
    const r = runner("secret-tool", ["store", "--label=Sidewise", "service", "sidewise", "account", "typesafe"], { input: secret, timeoutMs: TIMEOUT_MS });
    return r.status === 0 ? "stored" : "unavailable";
  }
  return "unavailable";
}
function keychainRemove(runner, platform) {
  if (platform === "darwin") {
    return runner("security", ["delete-generic-password", "-s", "sidewise", "-a", "typesafe"], { timeoutMs: TIMEOUT_MS }).status === 0;
  }
  if (platform === "linux") {
    return runner("secret-tool", ["clear", "service", "sidewise", "account", "typesafe"], { timeoutMs: TIMEOUT_MS }).status === 0;
  }
  return false;
}

// src/setup/keystore.ts
function resolveStoredKey(runner, platform, env = process.env) {
  const fromKeychain = keychainLookup(runner, platform);
  if (fromKeychain) return { apiKey: fromKeychain, source: "keychain", provider: "typesafe" };
  const file = readEnvFile(envFilePath(env));
  if (file?.values.TYPESAFE_API_KEY) return { apiKey: file.values.TYPESAFE_API_KEY, source: "file", provider: "typesafe" };
  if (file?.values.AI_GATEWAY_API_KEY) return { apiKey: file.values.AI_GATEWAY_API_KEY, source: "file", provider: "gateway" };
  return void 0;
}
function storeKey(runner, platform, env, provider, secret) {
  if (provider === "typesafe" && keychainStore(runner, platform, secret) === "stored") {
    return { stored: "keychain", detail: "OS keychain" };
  }
  const file = envFilePath(env);
  setEnvFileValue(file, provider === "typesafe" ? "TYPESAFE_API_KEY" : "AI_GATEWAY_API_KEY", secret);
  return { stored: "file", detail: file };
}
function removeStoredKey(runner, platform, env) {
  const removed = [];
  if (keychainRemove(runner, platform)) removed.push("keychain");
  const file = envFilePath(env);
  const a = removeEnvFileValue(file, "TYPESAFE_API_KEY");
  const b = removeEnvFileValue(file, "AI_GATEWAY_API_KEY");
  if (a !== "absent" || b !== "absent") removed.push("file");
  return { removed };
}

// src/setup/init.ts
import { existsSync as existsSync8, readFileSync as readFileSync9, realpathSync } from "node:fs";
import path10 from "node:path";

// src/verbs/doctor.ts
import path9 from "node:path";

// src/contract/emit.ts
var m = (...entries) => new Map(entries);
var RESERVED = /^(?:true|false|null|~|yes|no|on|off|y|n)$/iu;
var NUMBER_LIKE = /^(?:[-+]?(?:\d+|\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/u;
var INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/u;
var BLOCK_TOP = /* @__PURE__ */ new Set(["side", "plan", "doctor"]);
function scalar(s, flow2) {
  const plain = s !== "" && s === s.trim() && !RESERVED.test(s) && !NUMBER_LIKE.test(s) && !INDICATOR.test(s) && !/: |:$| #|[\n\r\t]/u.test(s) && !(flow2 && /[,[\]{}]/u.test(s));
  return plain ? s : JSON.stringify(s);
}
var num2 = (n) => Number.isInteger(n) ? String(n) : n.toFixed(2);
var key = (k, flow2) => /^[1-9]\d*$/u.test(k) ? k : scalar(k, flow2);
function flow(v) {
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${key(k, true)}: ${flow(x)}`).join(", ")}}`;
  if (Array.isArray(v)) return `[${v.map(flow).join(", ")}]`;
  if (typeof v === "number") return num2(v);
  if (typeof v === "boolean") return String(v);
  if (v === null) return "null";
  return scalar(v, true);
}
function inline(v) {
  return typeof v === "string" ? scalar(v, false) : flow(v);
}
var isMapOfMaps = (v) => v instanceof Map && v.size > 0 && [...v.values()].every((x) => x instanceof Map);
function emit(doc) {
  const lines = [];
  for (const [k, v] of doc) {
    if (!(BLOCK_TOP.has(k) && v instanceof Map)) {
      lines.push(`${key(k, false)}: ${inline(v)}`);
      continue;
    }
    lines.push(`${key(k, false)}:`);
    for (const [k2, v2] of v) {
      if (isMapOfMaps(v2)) {
        lines.push(`  ${key(k2, false)}:`);
        for (const [k3, v3] of v2) lines.push(`    ${key(k3, false)}: ${flow(v3)}`);
      } else {
        lines.push(`  ${key(k2, false)}: ${inline(v2)}`);
      }
    }
  }
  return `${lines.join("\n")}
`;
}

// src/setup/install-record.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync7, rmSync as rmSync4, writeFileSync as writeFileSync5 } from "node:fs";
import path6 from "node:path";
function installRecordPath(env = process.env) {
  return path6.join(sidewiseConfigDir(env), "install.json");
}
function isInstallRecord(v) {
  if (!v || typeof v !== "object") return false;
  const r = v;
  return (r.mode === "global" || r.mode === "user" || r.mode === "local") && typeof r.installedAt === "string";
}
function readInstallRecord(env = process.env) {
  const file = installRecordPath(env);
  if (!existsSync6(file)) return void 0;
  try {
    const parsed = JSON.parse(readFileSync7(file, "utf8"));
    return isInstallRecord(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function writeInstallRecord(env, record2) {
  const file = installRecordPath(env);
  mkdirSync5(path6.dirname(file), { recursive: true });
  writeFileSync5(file, `${JSON.stringify(record2, null, 2)}
`);
}
function clearInstallRecord(env = process.env) {
  const file = installRecordPath(env);
  if (existsSync6(file)) rmSync4(file, { force: true });
}

// src/setup/npm-info.ts
import { accessSync as accessSync2, constants as constants2, readFileSync as readFileSync8, statSync as statSync5 } from "node:fs";
import path7 from "node:path";
function findOnPath(name, env = process.env, platform = process.platform) {
  const pathVar = env.PATH ?? env.Path ?? "";
  const dirs = pathVar.split(path7.delimiter).filter(Boolean);
  const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path7.join(dir, name + ext);
      try {
        if (statSync5(candidate).isFile()) return candidate;
      } catch {
      }
    }
  }
  return void 0;
}
function lockDirAbove(packageDir, sep) {
  const segments = packageDir.split(sep);
  const idx = segments.lastIndexOf("node_modules");
  if (idx <= 0) return void 0;
  return segments.slice(0, idx).join(sep);
}
function detectSelfSpec(packageDir, pkg, readFile = (f) => readFileSync8(f, "utf8")) {
  const registry = { spec: `${pkg.name}@${pkg.version}`, kind: "registry" };
  try {
    const lockDir = lockDirAbove(packageDir, path7.sep);
    if (!lockDir) return registry;
    const lock = JSON.parse(readFile(path7.join(lockDir, "package-lock.json")));
    const resolved = lock.packages?.[`node_modules/${pkg.name}`]?.resolved;
    if (typeof resolved === "string" && resolved.startsWith("file:")) {
      const rel = decodeURIComponent(resolved.slice("file:".length));
      return { spec: path7.resolve(lockDir, rel), kind: "tarball" };
    }
  } catch {
  }
  return registry;
}
function isWritableDir(dir) {
  try {
    accessSync2(dir, constants2.W_OK);
    return true;
  } catch (e) {
    if (e.code !== "ENOENT") return false;
    const parent = path7.dirname(dir);
    return parent === dir ? false : isWritableDir(parent);
  }
}
function npmGlobalPrefix(runner) {
  const r = runner("npm", ["config", "get", "prefix"]);
  return r.status === 0 ? r.stdout.trim() || void 0 : void 0;
}

// src/setup/plugin.ts
import { existsSync as existsSync7, rmSync as rmSync5 } from "node:fs";
import os2 from "node:os";
import path8 from "node:path";
var SCOPES = ["user", "project", "local"];
var isScope = (v) => typeof v === "string" && SCOPES.includes(v);
function walk(value, scopes, found) {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, scopes, found);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value;
  const name = typeof obj.name === "string" ? obj.name : typeof obj.id === "string" ? obj.id : "";
  if (name === "sidewise" || name.startsWith("sidewise@")) {
    found.any = true;
    if (isScope(obj.scope)) scopes.add(obj.scope);
  }
  for (const v of Object.values(obj)) walk(v, scopes, found);
}
function pluginStatus(runner) {
  const r = runner("claude", ["plugin", "list", "--json"]);
  if (r.status !== 0) return { installed: false, scopes: [] };
  try {
    const scopes = /* @__PURE__ */ new Set();
    const found = { any: false };
    walk(JSON.parse(r.stdout), scopes, found);
    return { installed: found.any, scopes: [...scopes] };
  } catch {
    return { installed: false, scopes: [] };
  }
}
function marketplaceExists(runner) {
  const r = runner("claude", ["plugin", "marketplace", "list"]);
  return r.status === 0 && /\bmvp-scale\b/u.test(r.stdout);
}
var addMarketplace = (runner, packageDir) => runner("claude", ["plugin", "marketplace", "add", packageDir]);
var installPlugin = (runner, scope) => runner("claude", ["plugin", "install", "sidewise@mvp-scale", "--scope", scope]);
var uninstallPlugin = (runner, scope) => runner("claude", ["plugin", "uninstall", "sidewise@mvp-scale", ...scope ? ["--scope", scope] : []]);
var removeMarketplace = (runner) => runner("claude", ["plugin", "marketplace", "remove", "mvp-scale"]);
function pluginCacheDir(homeDir = os2.homedir()) {
  return path8.join(homeDir, ".claude", "plugins", "cache", "mvp-scale");
}
function removePluginCacheDir(homeDir = os2.homedir()) {
  const dir = pluginCacheDir(homeDir);
  if (!existsSync7(dir)) return false;
  rmSync5(dir, { recursive: true, force: true });
  return true;
}

// src/verbs/doctor.ts
function identityFor(env, config) {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === "chaos") return { adapter: "chaos", route: "chaos", model: CHAOS_MODEL, baseURL: null };
  const usingTypesafe = wanted === "typesafe" || wanted !== "fake" && hasKey(config);
  if (!usingTypesafe) return { adapter: "fake", route: "fake", model: FAKE_MODEL, baseURL: null };
  const route = routeLabel(config);
  return {
    adapter: "typesafe",
    route,
    model: config.model,
    baseURL: config.baseURL,
    ...config.route === "gateway" ? { wireModel: config.wireModel } : {}
  };
}
var octal4 = (mode) => mode.toString(8).padStart(4, "0");
function actorLine(env) {
  const set = env.SIDEWISE_ACTOR?.trim();
  return set || "agent (default) \u2192 set SIDEWISE_ACTOR to change";
}
function keyLine(env, config, deps) {
  if (!config.apiKey) return { value: 'no  \u2192 run "sidewise init" to add one' };
  if (config.keySource === "keychain") {
    return { value: "yes \xB7 from OS keychain (encrypted, per user)" };
  }
  if (config.keySource === "file") {
    const file = envFilePath(env);
    const read2 = readEnvFile(file);
    const mode = read2?.mode ?? 384;
    const note = read2 ? looseFileModeWarning(file, mode) ?? (read2.ignoredLines > 0 ? `\u2716 credentials: ${file} has ${read2.ignoredLines} line(s) sidewise ignored (not "export NAME='value'" for an allowed name)` : void 0) : void 0;
    return { value: `yes \xB7 from user file ${file} (${octal4(mode)}, not encrypted)`, note };
  }
  const envVar = config.route === "gateway" ? "AI_GATEWAY_API_KEY" : "TYPESAFE_API_KEY";
  const stored = deps.resolveStored?.();
  return { value: `yes \xB7 from env ${envVar}${stored ? " (overrides stored)" : ""}` };
}
function cliLine(env, platform) {
  const resolved = findOnPath("sidewise", env, platform);
  const record2 = readInstallRecord(env);
  if (!resolved && !record2) return 'not on PATH \u2192 run "sidewise init" to install it';
  const shown2 = resolved ?? "(not currently on PATH)";
  if (!record2) return `${shown2} \xB7 on PATH`;
  const flag = record2.mode === "global" ? "--global" : record2.mode === "user" ? "--user" : "--local";
  const detail = record2.mode === "local" ? `project ${record2.projectDir ?? "?"}` : `npm prefix ${record2.npmPrefix ?? "?"}`;
  return `${shown2} \xB7 installed ${flag} (${detail})`;
}
function pluginLine(deps) {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  if (!status.installed) return 'not installed \u2192 "sidewise init --claude"';
  return `sidewise@mvp-scale \xB7 ${status.scopes[0] ?? "user"} scope`;
}
function projectLine(root, deps) {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  const scopes = status.scopes;
  const enabled = scopes.includes("project") || scopes.includes("user") || scopes.includes("local");
  return `${root} \xB7 plugin enabled here: ${enabled ? "yes" : "no"}`;
}
function runDoctor(env, paths, nodeVersion = process.version, deps = {}) {
  let config;
  try {
    config = resolveJevConfig(env, { resolveStored: deps.resolveStored });
  } catch (e) {
    if (e instanceof JevConfigError) return { exit: 2, text: `${e.message}
` };
    throw e;
  }
  const who = identityFor(env, config);
  const project = paths ? projectLine(path9.relative(process.cwd(), paths.root) || ".", deps) : "none";
  const { value: key2, note: keyNote } = keyLine(env, config, deps);
  const notes = [
    "free: no call, no spend",
    ...paths ? [] : ["no project found here or above \u2192 run inside one, or set SIDEWISE_HOME"],
    ...keyNote ? [keyNote] : []
  ];
  const doc = m(
    [
      "doctor",
      m(
        ["provider", who.adapter],
        ["route", who.route],
        ...who.baseURL ? [["baseURL", who.baseURL]] : [],
        ["model", who.model],
        ...who.wireModel ? [["wireModel", who.wireModel]] : [],
        ["key", key2],
        ["project", project],
        ["actor", actorLine(env)],
        ["node", doctorNodeValue(nodeVersion)],
        ["index", nodeVersionOk(nodeVersion) ? sqliteAvailable() ? "node:sqlite" : "unavailable (unexpected on Node 22.13+)" : DOCTOR_INDEX_TOO_OLD],
        ["cli", cliLine(env, deps.platform ?? process.platform)],
        ["plugin", pluginLine(deps)]
      )
    ],
    ["notes", notes]
  );
  return { exit: nodeVersionOk(nodeVersion) ? 0 : 2, text: emit(doc) };
}

// src/setup/prompt.ts
import readline2 from "node:readline";
function readHidden(promptText, io) {
  return new Promise((resolve) => {
    const rl = readline2.createInterface({ input: io.input, output: io.output, terminal: io.output.isTTY === true });
    rl._writeToOutput = (s) => {
      if (s === promptText) io.output.write(s);
    };
    rl.question(promptText, (answer) => {
      rl.close();
      io.output.write("\n");
      resolve(answer);
    });
  });
}
function readLine(promptText, io) {
  return new Promise((resolve) => {
    const rl = readline2.createInterface({ input: io.input, output: io.output, terminal: io.output.isTTY === true });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
function readOneLine(input) {
  return new Promise((resolve, reject) => {
    const rl = readline2.createInterface({ input, terminal: false });
    let resolved = false;
    rl.once("line", (line3) => {
      resolved = true;
      rl.close();
      resolve(line3);
    });
    rl.once("close", () => {
      if (!resolved) resolve("");
    });
    rl.once("error", reject);
  });
}
async function confirm(promptText, defaultYes, io) {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await readLine(`${promptText} ${suffix} `, io)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

// src/setup/init.ts
var GLYPH = { done: "\u2714", already: "\xB7", skipped: "\u2013", problem: "\u2716" };
var line = (status, label, text) => `${GLYPH[status]} ${label}: ${text}`;
var nowIso = (ctx) => (ctx.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();
var firstLine = (s) => s.trim().split("\n")[0] ?? "";
var insideGitProject = (cwd) => existsSync8(path10.join(cwd, ".git"));
function isPackageBin(binPath, pkgName) {
  try {
    let dir = path10.dirname(realpathSync(binPath));
    for (let i = 0; i < 6; i++) {
      const pj = path10.join(dir, "package.json");
      if (existsSync8(pj)) {
        const meta = JSON.parse(readFileSync9(pj, "utf8"));
        return meta.name === pkgName;
      }
      const up = path10.dirname(dir);
      if (up === dir) return false;
      dir = up;
    }
  } catch {
    return false;
  }
  return false;
}
function defaultMode(cwd, prefixWritable) {
  if (existsSync8(path10.join(cwd, "package.json"))) return "local";
  return prefixWritable ? "global" : "user";
}
function isNpxCache(binPath) {
  return binPath.split(path10.sep).includes("_npx");
}
async function stepCli(flags, ctx) {
  const onPath = findOnPath("sidewise", ctx.env, ctx.platform);
  if (onPath && !isNpxCache(onPath) && isPackageBin(onPath, ctx.pkg.name) && !flags.mode) {
    return [line("already", "cli", `already reachable as ${onPath}`)];
  }
  const prefix = npmGlobalPrefix(ctx.runner);
  const globalWritable = prefix ? isWritableDir(prefix) : false;
  const mode = flags.mode ?? defaultMode(ctx.cwd, globalWritable);
  const self = detectSelfSpec(ctx.packageDir, ctx.pkg);
  if (mode === "global") {
    if (!globalWritable) {
      return [line("problem", "cli", 'the global npm prefix needs sudo \u2192 re-run "sidewise init --user" instead (never runs sudo for you)')];
    }
    const r2 = ctx.runner("npm", ["install", "-g", self.spec]);
    if (r2.status !== 0) return [line("problem", "cli", `npm install -g ${self.spec} failed \u2192 ${firstLine(r2.stderr) || "see npm's own output"}`)];
    writeInstallRecord(ctx.env, { mode: "global", npmPrefix: prefix, installedAt: nowIso(ctx) });
    return [line("done", "cli", `installed --global (npm prefix ${prefix})`)];
  }
  if (mode === "user") {
    const userPrefix = path10.join(ctx.homeDir, ".local");
    const r2 = ctx.runner("npm", ["install", "-g", "--prefix", userPrefix, self.spec]);
    if (r2.status !== 0) return [line("problem", "cli", `npm install -g --prefix ${userPrefix} ${self.spec} failed \u2192 ${firstLine(r2.stderr) || "see npm's own output"}`)];
    writeInstallRecord(ctx.env, { mode: "user", npmPrefix: userPrefix, installedAt: nowIso(ctx) });
    const bin = path10.join(userPrefix, "bin");
    const onPathNow = (ctx.env.PATH ?? "").split(path10.delimiter).includes(bin);
    const lines = [line("done", "cli", `installed --user (npm prefix ${userPrefix})`)];
    if (!onPathNow) lines.push(line("problem", "cli", `${bin} is not on PATH \u2192 add this to your shell profile: export PATH="${bin}:$PATH"`));
    return lines;
  }
  const r = ctx.runner("npm", ["install", "-D", self.spec]);
  if (r.status !== 0) return [line("problem", "cli", `npm install -D ${self.spec} failed \u2192 ${firstLine(r.stderr) || "see npm's own output"}`)];
  writeInstallRecord(ctx.env, { mode: "local", projectDir: ctx.cwd, installedAt: nowIso(ctx) });
  return [line("done", "cli", `installed --local (run it as npx sidewise, in ${ctx.cwd})`)];
}
async function stepKey(flags, ctx) {
  if (flags.key === "no") return [line("skipped", "key", "skipped (--no-key)")];
  if (flags.key === "ask") {
    const existing = resolveJevConfig(ctx.env, { resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env) });
    if (hasKey(existing)) {
      const replace = flags.yes ? false : await confirm(`A key already resolves (from ${existing.keySource}). Replace it?`, false, ctx.io);
      if (!replace) return [line("already", "key", `already set (from ${existing.keySource})`)];
    }
  }
  let secret;
  if (flags.key === "stdin") {
    if (!ctx.keyStdin) return [line("skipped", "key", "skipped (--key-stdin given but nothing to read from)")];
    secret = (await readOneLine(ctx.keyStdin)).trim();
  } else if (flags.yes) {
    secret = "";
  } else {
    secret = (await readHidden("Paste your TypeSafe API key (input hidden; Enter to skip and use the free fake provider): ", ctx.io)).trim();
  }
  if (!secret) return [line("skipped", "key", "skipped (no key entered \u2014 the free fake provider will be used)")];
  if (/\s/u.test(secret)) return [line("problem", "key", "the pasted value has whitespace in it \u2192 paste just the key, with nothing else")];
  if (secret.includes("'")) return [line("problem", "key", "the pasted value contains a single quote, which the user file can't represent \u2192 use a key without one")];
  let provider = "typesafe";
  if (flags.key === "ask" && !flags.yes) {
    const answer = (await readLine("Which provider is this key for? [typesafe/gateway] (default: typesafe): ", ctx.io)).trim().toLowerCase();
    if (answer === "gateway") provider = "gateway";
  }
  const stored = storeKey(ctx.runner, ctx.platform, ctx.env, provider, secret);
  return [line("done", "key", `stored in ${stored.detail} \u2014 checked on first real call`)];
}
async function stepPlugin(flags, ctx) {
  if (flags.claude === false) return [line("skipped", "plugin", "skipped (--no-claude)")];
  const claudeOnPath = findOnPath("claude", ctx.env, ctx.platform) !== void 0;
  if (flags.claude !== true && !claudeOnPath) return [line("skipped", "plugin", "skipped (claude not found on PATH)")];
  const lines = [];
  if (!marketplaceExists(ctx.runner)) {
    const r2 = addMarketplace(ctx.runner, ctx.packageDir);
    lines.push(r2.status === 0 ? line("done", "plugin", "added the mvp-scale marketplace") : line("problem", "plugin", `could not add the mvp-scale marketplace \u2192 ${firstLine(r2.stderr)}`));
  } else {
    lines.push(line("already", "plugin", "mvp-scale marketplace already added"));
  }
  const scope = flags.scope ?? "project";
  const status = pluginStatus(ctx.runner);
  if (status.installed && status.scopes.includes(scope)) {
    lines.push(line("already", "plugin", `sidewise@mvp-scale already installed (${scope} scope)`));
    return lines;
  }
  const r = installPlugin(ctx.runner, scope);
  lines.push(r.status === 0 ? line("done", "plugin", `installed sidewise@mvp-scale (${scope} scope)`) : line("problem", "plugin", `could not install the plugin \u2192 ${firstLine(r.stderr)}`));
  return lines;
}
function stepProject(ctx) {
  const paths = pathsFor(ctx.cwd);
  const already = existsSync8(paths.dir);
  ensureDir(paths);
  return [line(already ? "already" : "done", "project", `${already ? "already has" : "created"} .sidewise/ (self-ignoring: .sidewise/.gitignore)`)];
}
var NOT_A_PROJECT = line("skipped", "project", 'not in a git project \u2192 cd into one and run "sidewise init" there to enable Sidewise for it');
async function runInit(flags, ctx) {
  const lines = [];
  lines.push(...await stepCli(flags, ctx));
  lines.push(...await stepKey(flags, ctx));
  const inProject = insideGitProject(ctx.cwd);
  if (inProject) {
    lines.push(...await stepPlugin(flags, ctx));
    lines.push(...stepProject(ctx));
  } else {
    lines.push(NOT_A_PROJECT);
  }
  const doctorOut = runDoctor(ctx.env, inProject ? pathsFor(ctx.cwd) : void 0, process.version, {
    resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
    runner: ctx.runner,
    platform: ctx.platform
  });
  const next = 'next: ask Claude to use Sidewise, or run "sidewise template class" to start by hand';
  return { exit: 0, text: `${lines.join("\n")}

${doctorOut.text}
${next}
` };
}

// src/setup/runner.ts
import { execFileSync } from "node:child_process";
var DEFAULT_TIMEOUT_MS2 = 5e3;
var realRunner = (cmd, args2, opts = {}) => {
  try {
    const stdout = execFileSync(cmd, [...args2], {
      input: opts.input ?? "",
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS2,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err2 = e;
    return { status: typeof err2.status === "number" ? err2.status : 1, stdout: err2.stdout ?? "", stderr: err2.stderr ?? err2.message ?? "" };
  }
};

// src/setup/uninstall.ts
import { existsSync as existsSync9, realpathSync as realpathSync2, rmSync as rmSync6 } from "node:fs";
import path11 from "node:path";
var GLYPH2 = { done: "\u2714", already: "\xB7", skipped: "\u2013", problem: "\u2716" };
var line2 = (status, label, text) => `${GLYPH2[status]} ${label}: ${text}`;
async function ask(promptText, defaultAnswer, flags, io) {
  return flags.yes ? defaultAnswer : confirm(promptText, defaultAnswer, io);
}
function detectInstallMode(ctx) {
  const onPath = findOnPath("sidewise", ctx.env, ctx.platform);
  if (!onPath) return void 0;
  let real;
  try {
    real = realpathSync2(onPath);
  } catch {
    real = onPath;
  }
  const under = (dir) => real === dir || real.startsWith(dir.endsWith(path11.sep) ? dir : `${dir}${path11.sep}`);
  if (under(path11.join(ctx.cwd, "node_modules"))) return { mode: "local", projectDir: ctx.cwd };
  const globalPrefix = npmGlobalPrefix(ctx.runner);
  if (globalPrefix && under(globalPrefix)) return { mode: "global", npmPrefix: globalPrefix };
  const userPrefix = path11.join(ctx.homeDir, ".local");
  if (under(userPrefix)) return { mode: "user", npmPrefix: userPrefix };
  return void 0;
}
async function stepPlugin2(flags, ctx, manual) {
  const status = pluginStatus(ctx.runner);
  const scopesToRemove = flags.all ? status.scopes : status.scopes.filter((s) => s === "project");
  const marketplace = flags.all && marketplaceExists(ctx.runner);
  const cacheDirExists = flags.all && existsSync9(pluginCacheDir(ctx.homeDir));
  if (!scopesToRemove.length && !marketplace && !cacheDirExists) return [line2("already", "plugin", "nothing to remove here")];
  const manualCmds = [
    ...scopesToRemove.map((s) => `claude plugin uninstall sidewise@mvp-scale --scope ${s}`),
    ...marketplace ? ["claude plugin marketplace remove mvp-scale"] : [],
    ...cacheDirExists ? [`rm -rf ${pluginCacheDir(ctx.homeDir)}`] : []
  ];
  const found = [
    scopesToRemove.length ? `sidewise@mvp-scale at ${scopesToRemove.join(", ")} scope` : "",
    marketplace ? "the mvp-scale marketplace" : "",
    cacheDirExists ? "a leftover plugin cache dir" : ""
  ].filter(Boolean).join(", ");
  const remove = await ask(`Found ${found}. Remove ${flags.all ? "all of it" : "it"}?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`plugin: ${manualCmds.join(" \xB7 ")}`);
    return [line2("skipped", "plugin", "skipped (kept)")];
  }
  const lines = [];
  for (const scope of scopesToRemove) {
    const r = uninstallPlugin(ctx.runner, scope);
    if (r.status === 0) {
      lines.push(line2("done", "plugin", `uninstalled sidewise@mvp-scale (${scope} scope)`));
    } else {
      lines.push(line2("problem", "plugin", `could not uninstall (${scope} scope)`));
      manual.push(`plugin (${scope} scope): claude plugin uninstall sidewise@mvp-scale --scope ${scope}`);
    }
  }
  if (marketplace) {
    const r = removeMarketplace(ctx.runner);
    if (r.status === 0) {
      lines.push(line2("done", "plugin", "removed the mvp-scale marketplace"));
    } else {
      lines.push(line2("problem", "plugin", "could not remove the mvp-scale marketplace"));
      manual.push("marketplace: claude plugin marketplace remove mvp-scale");
    }
  }
  if (flags.all) {
    if (removePluginCacheDir(ctx.homeDir)) lines.push(line2("done", "plugin", "removed the plugin cache dir"));
    else lines.push(line2("already", "plugin", "no plugin cache dir left behind"));
  }
  return lines;
}
async function stepKey2(flags, ctx, manual) {
  if (!flags.all) return [line2("skipped", "key", "skipped (per-user; use --all to remove it)")];
  if (flags.keepKey) return [line2("skipped", "key", "skipped (--keep-key)")];
  const found = resolveStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (!found) return [line2("already", "key", "nothing stored")];
  const remove = await ask(`Found a stored key (${found.source === "keychain" ? "OS keychain" : "the env file"}). Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push("key: remove it by hand \u2014 the OS keychain entry, and/or TYPESAFE_API_KEY/AI_GATEWAY_API_KEY in the env file sidewise init wrote");
    return [line2("skipped", "key", "skipped (kept)")];
  }
  const { removed } = removeStoredKey(ctx.runner, ctx.platform, ctx.env);
  const lines = [line2("done", "key", `removed from ${removed.length ? removed.join(" and ") : "nowhere (already gone)"}`)];
  const stillThere = resolveStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (stillThere) {
    lines.push(line2("problem", "key", `still resolves from ${stillThere.source} \u2192 could not remove it automatically`));
    manual.push(`key: still in the ${stillThere.source === "keychain" ? "OS keychain" : "env file"} \u2014 remove it by hand`);
  }
  return lines;
}
async function stepData(flags, ctx, manual) {
  if (flags.keepData) return [line2("skipped", "project", "skipped (--keep-data)")];
  const dir = `${ctx.cwd}/.sidewise`;
  if (!existsSync9(dir)) return [line2("already", "project", "no .sidewise/ here")];
  const remove = flags.yes ? false : await confirm("Remove this project's .sidewise/ (your run history)? This cannot be undone.", false, ctx.io);
  if (!remove) {
    manual.push(`project data: rm -rf ${dir}`);
    return [line2("skipped", "project", "kept .sidewise/ (default: no)")];
  }
  try {
    rmSync6(dir, { recursive: true, force: true });
  } catch {
  }
  if (existsSync9(dir)) {
    manual.push(`project data: rm -rf ${dir}`);
    return [line2("problem", "project", `could not remove ${dir} \u2192 remove it by hand: rm -rf ${dir}`)];
  }
  return [line2("done", "project", "removed .sidewise/")];
}
async function stepCli2(flags, ctx, manual) {
  if (!flags.all) return [line2("skipped", "cli", "skipped (per-user; use --all to remove it)")];
  const record2 = readInstallRecord(ctx.env);
  const detected = record2 ? void 0 : detectInstallMode(ctx);
  const loc = record2 ?? detected;
  if (!loc) {
    const cmds = `npm uninstall -g ${ctx.pkgName} \xB7 npm uninstall -g --prefix ~/.local ${ctx.pkgName} \xB7 npm uninstall -D ${ctx.pkgName} (in your project)`;
    manual.push(`cli: don't know how this was installed \u2014 try: ${cmds}`);
    return [line2("problem", "cli", `don't know how this was installed \u2192 run one of: ${cmds}`)];
  }
  const guessedNote = record2 ? "" : " (guessed from its own path on PATH \u2014 no install record found)";
  const remove = await ask(`Found the CLI installed --${loc.mode}${guessedNote}. Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`cli: was installed --${loc.mode} \u2014 remove it yourself when ready`);
    return [line2("skipped", "cli", "skipped (kept)")];
  }
  const args2 = loc.mode === "global" ? ["uninstall", "-g", ctx.pkgName] : loc.mode === "user" ? ["uninstall", "-g", "--prefix", loc.npmPrefix ?? "", ctx.pkgName] : ["uninstall", ctx.pkgName];
  const r = ctx.runner("npm", args2);
  if (r.status !== 0) {
    manual.push(`cli: npm ${args2.join(" ")}`);
    return [line2("problem", "cli", `npm ${args2.join(" ")} failed \u2192 ${r.stderr.trim().split("\n")[0] ?? "see npm's own output"}`)];
  }
  clearInstallRecord(ctx.env);
  const lines = [line2("done", "cli", `uninstalled (was --${loc.mode}${guessedNote})`)];
  const stillOnPath = findOnPath("sidewise", ctx.env, ctx.platform);
  if (stillOnPath) {
    lines.push(line2("problem", "cli", `still resolves on PATH at ${stillOnPath} \u2192 a stale PATH entry or a second copy elsewhere; remove it by hand if a shell still finds it`));
    manual.push(`cli: still on PATH at ${stillOnPath} \u2014 check for a second install or a stale shell hash`);
  }
  return lines;
}
async function runUninstall(flags, ctx) {
  const manual = [];
  const lines = [];
  lines.push(...await stepPlugin2(flags, ctx, manual));
  lines.push(...await stepData(flags, ctx, manual));
  lines.push(...await stepKey2(flags, ctx, manual));
  lines.push(...await stepCli2(flags, ctx, manual));
  if (manual.length) {
    lines.push("", "manual backup \u2014 finish these by hand if you want to:", ...manual.map((m2) => `  - ${m2}`));
  }
  return { exit: 0, text: `${lines.join("\n")}
` };
}

// src/contract/grade.ts
var BAR = 0.7;
var EPS = 1e-9;
function passingProbability(cat, a) {
  if (a.kind === "yesno") return cat.pass === "no" ? 1 - a.p : a.p;
  const passing = Array.isArray(cat.pass) ? cat.pass : [];
  return passing.reduce((sum, o) => sum + (a.dist[o] ?? 0), 0);
}
function markOf(pp) {
  if (pp >= BAR - EPS) return "pass";
  if (pp <= 1 - BAR + EPS) return "miss";
  return "mid";
}
function gateOf(need, marks) {
  const n = marks.length;
  const pass = marks.filter((x) => x === "pass").length;
  const miss = marks.filter((x) => x === "miss").length;
  if (n === 0) return "unsure";
  if (need === "any") return pass > 0 ? "pass" : miss === n ? "fail" : "unsure";
  if (miss > 0) return "fail";
  if (need === "most") return pass * 3 >= 2 * n ? "pass" : "unsure";
  return pass === n ? "pass" : "unsure";
}
function combine(gates) {
  if (gates.includes("fail")) return "fail";
  return gates.every((g) => g === "pass") ? "pass" : "unsure";
}
function goalGate(p) {
  const mark = markOf(p);
  return mark === "pass" ? "pass" : mark === "miss" ? "fail" : "unsure";
}
function shown(a) {
  if (a.kind === "yesno") return a.p;
  const [top, p] = Object.entries(a.dist).reduce((best, e) => e[1] > best[1] ? e : best);
  return { top, p };
}
function severityOf(q, a) {
  if (q.kind !== "scale" || a.kind !== "scale") return 0;
  const [top, p] = Object.entries(a.dist).reduce((best, e) => e[1] > best[1] ? e : best);
  const level = q.levels.indexOf(top);
  return level < 0 ? 0 : level * p;
}
function gradeCategory(cat, answerOf) {
  const marks = /* @__PURE__ */ new Map();
  const values = /* @__PURE__ */ new Map();
  let severity = 0;
  for (const q of cat.questions) {
    const a = answerOf(q.n);
    if (!a) continue;
    marks.set(q.n, markOf(passingProbability(cat, a)));
    values.set(q.n, shown(a));
    severity = Math.max(severity, severityOf(q, a));
  }
  return { name: cat.name, gate: gateOf(cat.need, [...marks.values()]), marks, values, severity };
}
function gradeSubject(categories, answers, prefix = "") {
  const grades = categories.map((c) => gradeCategory(c, (n) => answers[`${prefix}${n}`]));
  const g = answers[`${prefix}goal`];
  const goal = g && g.kind === "yesno" ? { gate: goalGate(g.p), p: g.p } : void 0;
  return { gate: combine([...goal ? [goal.gate] : [], ...grades.map((c) => c.gate)]), ...goal ? { goal } : {}, categories: grades };
}
function gradeItems(items, categoriesOf, statusOf, answers) {
  const kids = /* @__PURE__ */ new Map();
  for (const it of items) if (it.parent !== null) kids.set(it.parent, [...kids.get(it.parent) ?? [], it.id]);
  const out = /* @__PURE__ */ new Map();
  for (const it of [...items].reverse()) {
    const status = statusOf(it.id);
    const graded = status === "asked" || status === "reused";
    const own = graded ? categoriesOf(it.layer).map((c) => gradeCategory(c, (n) => answers[`${it.id}#${n}`])) : [];
    const ownGate = status === "skipped" ? "unsure" : combine(own.map((c) => c.gate));
    const severity = own.reduce((worst, c) => Math.max(worst, c.severity), 0);
    const children = (kids.get(it.id) ?? []).map((k) => out.get(k).gate);
    out.set(it.id, { id: it.id, layer: it.layer, parent: it.parent, status, own, ownGate, gate: combine([ownGate, ...children]), severity });
  }
  return new Map([...out].reverse());
}
function sweepGate(goal, grades) {
  const tops = [...grades.values()].filter((g) => g.parent === null || !grades.has(g.parent));
  return combine([goal, ...tops.map((g) => g.gate)]);
}
function worstFirst(grades) {
  const count = (g, gate) => g.own.filter((c) => c.gate === gate).length;
  return [...grades].filter((g) => (g.status === "asked" || g.status === "reused") && g.ownGate !== "pass").map((g, i) => ({ g, i })).sort((a, b) => (b.g.severity ?? 0) - (a.g.severity ?? 0) || count(b.g, "fail") - count(a.g, "fail") || count(b.g, "unsure") - count(a.g, "unsure") || a.i - b.i).map(({ g }) => g);
}

// src/contract/translate.ts
import { createHash as createHash2 } from "node:crypto";

// src/contract/types.ts
var VERBS = ["view", "class", "change", "scan", "drill", "loop"];
var DEPTHS = ["quick", "standard", "thorough"];
var DEPTH_COUNT = { quick: 10, standard: 20, thorough: 30 };
var WHYS = ["validate", "find", "debug"];
var AREAS = ["data", "api", "ui", "auth", "hosting", "build", "tests"];
var STAGES = ["design", "build", "review", "pre-merge", "post-fix", "release"];
var CHANGES = ["feature", "fix", "refactor", "dependency", "config"];
var RISKS = ["low", "medium", "high"];
var MAX_EXTRAS = 5;

// src/contract/schema-check.ts
var TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
var RUN_ID2 = /^SW-\d{4,}$/u;
var PATH = /^[^\s:]+(:\d+(-\d+)?)?$/u;
var QNUM = /^[1-9][0-9]*$/u;
var SIDE_KEYS = ["goal", "depth", "where", "parent", "ask", "over", "from", "compare", "verb"];
var CATEGORY_KEYS = ["pass", "need", "tags"];
var NOT_QUESTIONS = /^(yes|no|true|false|on|off|y|n)$/iu;
var isObj2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var len = (s) => [...s].length;
var show = (v) => clip(typeof v === "string" ? `"${v}"` : JSON.stringify(v) ?? String(v), 40);
var list = (xs) => `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`;
var isTag = (k) => TAG.test(k) && len(k) <= 20;
var Out = class {
  stops = [];
  add(field, problem, fix) {
    this.stops.push({ cls: "schema", text: `\u2716 ${field}: ${problem} \u2192 ${fix}` });
  }
};
function lineProblem(v) {
  if (typeof v !== "string") return `${show(v)} is not text`;
  if (v.includes("\n")) return "has a line break";
  if (len(v) < 3) return "is too short";
  if (len(v) > 160) return "is longer than 160 characters";
  return void 0;
}
function checkTagKeys(o, field, what, out) {
  for (const k of Object.keys(o)) {
    if (!isTag(k)) out.add(`${field}.${k}`, `"${clip(k, 30)}" is not a ${what} name`, "use lowercase letters and digits, one word or kebab-case, \u2264 20 characters");
  }
}
function checkStringList(v, field, noun, min, max, out) {
  if (!Array.isArray(v)) return out.add(field, `${noun} must be a list`, `write [a, b]`);
  if (v.length < min || v.length > max) out.add(field, `${v.length} ${noun}`, `give ${min}\u2013${max}`);
  const bad = v.find((x) => typeof x !== "string");
  if (bad !== void 0) out.add(field, `${show(bad)} is not text`, `quote it: "${String(bad)}"`);
  if (new Set(v.map((x) => JSON.stringify(x))).size !== v.length) out.add(field, `repeated ${noun}`, "make each one different");
}
function checkQuestion(v, n, out) {
  const field = `question ${n}`;
  if (typeof v === "string") {
    if (NOT_QUESTIONS.test(v.trim())) return out.add(field, "is not a question", "write it as text");
    const bad2 = lineProblem(v);
    if (bad2) return out.add(field, bad2, "ask one short thing on one line");
    if (!v.endsWith("?")) return out.add(field, `doesn't end in "?"`, "put it in quotes");
    return;
  }
  if (!isObj2(v)) return out.add(field, "is not a question", "write it as text");
  const kind = "scale" in v ? "scale" : "choice" in v ? "choice" : void 0;
  if (!kind || "scale" in v && "choice" in v) {
    return out.add(field, "is not a question", 'write "N: <question>?", or scale: + levels:, or choice: + options:');
  }
  const listKey = kind === "scale" ? "levels" : "options";
  for (const k of Object.keys(v)) {
    if (k !== kind && k !== listKey) out.add(field, `unknown key "${clip(k, 20)}"`, `a ${kind} has only ${kind}: and ${listKey}:`);
  }
  const bad = lineProblem(v[kind]);
  if (bad) out.add(field, `the ${kind} ${bad}`, "ask one short thing on one line");
  if (!(listKey in v)) return out.add(field, `a ${kind} needs ${listKey}:`, `add ${listKey}: [a, b]`);
  checkStringList(v[listKey], field, listKey, 2, kind === "scale" ? 10 : 8, out);
}
function checkCategory(v, field, out) {
  const pass = v.pass;
  const passOk = typeof pass === "boolean" || pass === "yes" || pass === "no" || Array.isArray(pass) && pass.length >= 1 && pass.every((x) => typeof x === "string");
  if (!passOk) out.add(`${field}.pass`, `${show(pass)}`, "use yes, no, or a list of the passing levels or options");
  if ("need" in v && !["all", "most", "any"].includes(v.need)) out.add(`${field}.need`, `${show(v.need)}`, "use all, most or any");
  if ("tags" in v) {
    const t = v.tags;
    if (!Array.isArray(t) || t.length > 3 || !t.every((x) => typeof x === "string" && isTag(x))) {
      out.add(`${field}.tags`, `${show(t)}`, "give up to 3 tags, lowercase kebab-case, \u2264 20 characters");
    }
  }
  for (const [k, q] of Object.entries(v)) {
    if (CATEGORY_KEYS.includes(k)) continue;
    if (!QNUM.test(k)) {
      out.add(`${field}.${clip(k, 20)}`, "not a question number or category key", /^0+$/u.test(k) ? "number questions from 1" : "a category holds pass, need, tags and numbered questions");
      continue;
    }
    checkQuestion(q, k, out);
  }
}
function checkAsk(ask2, out) {
  if (!isObj2(ask2)) return out.add("side.ask", "is not a mapping", "write categories under ask:, each with pass: and numbered questions");
  if (Object.keys(ask2).length === 0) return out.add("side.ask", "is empty", "add a category with pass: and numbered questions");
  checkTagKeys(ask2, "side.ask", "category or layer", out);
  for (const [name, v] of Object.entries(ask2)) {
    const field = `side.ask.${clip(name, 20)}`;
    if (!isObj2(v)) {
      out.add(field, "is not a category", "give it pass: and numbered questions");
      continue;
    }
    if ("pass" in v) {
      checkCategory(v, field, out);
      continue;
    }
    if (Object.entries(v).some(([k, x]) => QNUM.test(k) && !isObj2(x))) {
      out.add(field, "has questions but no pass", 'add "pass: yes" or "pass: no"');
      continue;
    }
    if (Object.keys(v).length === 0) {
      out.add(field, "is empty", "give it pass: and numbered questions");
      continue;
    }
    checkTagKeys(v, field, "category", out);
    for (const [cname, c] of Object.entries(v)) {
      const cfield = `${field}.${clip(cname, 20)}`;
      if (!isObj2(c) || !("pass" in c)) out.add(cfield, "is not a category", "give it pass: and numbered questions");
      else checkCategory(c, cfield, out);
    }
  }
}
function checkOverShape(over, out) {
  if (!isObj2(over) || Object.keys(over).length === 0) return out.add("side.over", "is not a mapping of layers", "write over: with a layer name and its items, e.g. part: [a, b]");
  checkTagKeys(over, "side.over", "layer", out);
  for (const [layer, v] of Object.entries(over)) {
    if (typeof v === "string") continue;
    if (!Array.isArray(v)) out.add(`side.over.${clip(layer, 20)}`, "is not a list or a pattern", "write a list of items, a file pattern, or each");
    else if (v.length < 1 || v.length > 30) out.add(`side.over.${clip(layer, 20)}`, `${v.length} items`, "give 1\u201330 items");
  }
}
function checkSide(side, out) {
  if (!isObj2(side)) return out.add("side", "is not a mapping", "put goal: and the other fields under side:");
  for (const k of Object.keys(side)) {
    if (!SIDE_KEYS.includes(k)) out.add(`side.${clip(k, 20)}`, "not a field", `use ${list(SIDE_KEYS)}`);
  }
  if (!("goal" in side)) out.add("side.goal", "missing", "add one line: what you want to be true");
  else {
    const bad = lineProblem(side.goal);
    if (bad) out.add("side.goal", bad, "write one line of 3\u2013160 characters: what you want to be true");
  }
  if ("depth" in side && !DEPTHS.includes(side.depth)) out.add("side.depth", show(side.depth), `use ${list(DEPTHS)}`);
  if ("where" in side) {
    const w = side.where;
    if (!Array.isArray(w) || w.length < 1 || w.length > 5) out.add("side.where", "needs 1\u20135 paths", "write where: [path/to/file.ts]");
    else for (const p of w) if (typeof p !== "string" || !PATH.test(p)) out.add("side.where", `${show(p)} is not a path`, "use a project path, optionally :start-end, with no spaces");
  }
  if ("parent" in side && !(typeof side.parent === "string" && RUN_ID2.test(side.parent))) out.add("side.parent", `${show(side.parent)} is not a run id`, "use SW-####");
  if ("from" in side && !(typeof side.from === "string" && len(side.from) >= 1 && len(side.from) <= 200)) out.add("side.from", show(side.from), "name an item id or a category of the parent run");
  if ("compare" in side) {
    const c = side.compare;
    const ok2 = isObj2(c) && typeof c.before === "string" && typeof c.after === "string" && Object.keys(c).every((k) => k === "before" || k === "after");
    if (!ok2) out.add("side.compare", show(c), "write compare: {before: main, after: HEAD}");
  }
  if ("verb" in side && !VERBS.includes(side.verb)) out.add("side.verb", show(side.verb), `use ${list(VERBS)}, or leave it out`);
  if ("ask" in side) checkAsk(side.ask, out);
  if ("over" in side) checkOverShape(side.over, out);
}
var WISE_KEYS = ["why", "area", "stage", "change", "risk", "parent"];
function checkWise(wise2, out) {
  if (!isObj2(wise2)) return out.add("wise", "is not a mapping", "write why:, area: or parent: under wise:, or leave wise out");
  for (const k of Object.keys(wise2)) if (!WISE_KEYS.includes(k)) out.add(`wise.${clip(k, 20)}`, "not a field", `use ${list(WISE_KEYS)}`);
  if ("why" in wise2 && !WHYS.includes(wise2.why)) out.add("wise.why", show(wise2.why), `use ${list(WHYS)}`);
  if ("area" in wise2 && !AREAS.includes(wise2.area)) out.add("wise.area", show(wise2.area), `use ${list(AREAS)}`);
  if ("stage" in wise2 && !STAGES.includes(wise2.stage)) out.add("wise.stage", show(wise2.stage), `use ${list(STAGES)}`);
  if ("change" in wise2 && !CHANGES.includes(wise2.change)) out.add("wise.change", show(wise2.change), `use ${list(CHANGES)}`);
  if ("risk" in wise2 && !RISKS.includes(wise2.risk)) out.add("wise.risk", show(wise2.risk), `use ${list(RISKS)}`);
  if ("parent" in wise2 && !(typeof wise2.parent === "string" && RUN_ID2.test(wise2.parent))) out.add("wise.parent", `${show(wise2.parent)} is not a run id`, "use SW-####");
}
function checkSchema(value) {
  const out = new Out();
  if (!isObj2(value)) {
    out.add("request", "is not a mapping", "start with side:");
    return out.stops;
  }
  for (const k of Object.keys(value)) {
    if (k !== "side" && k !== "wise") out.add(clip(k, 20), "not a block", "the request holds only side: and wise:; put fields under side:");
  }
  if (!("side" in value)) out.add("side", "missing", "start with side: and a goal");
  else checkSide(value.side, out);
  if ("wise" in value) checkWise(value.wise, out);
  return out.stops;
}

// src/contract/layers.ts
var MAX_LAYERS = 4;
var NAME = /^[^/#\n]{1,80}$/u;
var TAG2 = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
var BLANK = /\{([a-z0-9]+(?:-[a-z0-9]+)*)\}/gu;
function parseItem(raw) {
  if (typeof raw === "string") return { name: raw.trim(), children: {} };
  if (typeof raw === "number") return { name: String(raw), children: {} };
  if (isObj2(raw)) {
    if ("name" in raw) {
      const { name, ...children } = raw;
      if (typeof name !== "string" && typeof name !== "number") return { problem: "an item has a name: that is not text \u2192 write its name as text" };
      return { name: String(name).trim(), children };
    }
    const keys = Object.keys(raw);
    if (keys.length === 1) {
      const name = keys[0];
      const v = raw[name];
      if (v === null) return { name: name.trim(), children: {} };
      if (isObj2(v)) return { name: name.trim(), children: v };
      return { problem: `"${clip(name, 30)}" has a value but no layer name \u2192 write "- name: ${clip(name, 30)}" and "<layer>: [...]"` };
    }
    return { problem: 'an item with several keys needs name: \u2192 write "- name: <item>" plus its child layers' };
  }
  return { problem: "an item is empty or not text \u2192 write its name" };
}
function mapLayers(over) {
  const chain = Object.keys(over);
  const layers = [...chain];
  const ancestors = /* @__PURE__ */ new Map();
  const problems = [];
  const link = (child, parent) => {
    const set = ancestors.get(child) ?? /* @__PURE__ */ new Set();
    ancestors.set(child, set);
    if (parent === null) return;
    set.add(parent);
    for (const a of ancestors.get(parent) ?? []) set.add(a);
  };
  chain.forEach((l, i) => link(l, i ? chain[i - 1] : null));
  const walk2 = (layer, value) => {
    if (!Array.isArray(value)) return;
    for (const raw of value) {
      const it = parseItem(raw);
      if ("problem" in it) continue;
      for (const [child, v] of Object.entries(it.children)) {
        if (chain.includes(child)) {
          problems.push(`\u2716 side.over.${clip(child, 20)}: used at the top and inside "${clip(it.name, 30)}" \u2192 pick one`);
          continue;
        }
        if (!layers.includes(child)) layers.push(child);
        link(child, layer);
        walk2(child, v);
      }
    }
  };
  for (const l of chain) walk2(l, over[l]);
  if (layers.length > MAX_LAYERS) problems.push(`\u2716 side.over: ${layers.length} layers \u2192 at most ${MAX_LAYERS}; split the request`);
  return { layers, chain, ancestors, problems: [...new Set(problems)] };
}
function firstStringLayer(over) {
  for (const [layer, v] of Object.entries(over)) {
    if (typeof v === "string") return layer;
    if (!Array.isArray(v)) continue;
    for (const raw of v) {
      const it = parseItem(raw);
      if ("problem" in it) continue;
      const found = firstStringLayer(it.children);
      if (found) return found;
    }
  }
  return null;
}
function checkOver(over, rule, cap2) {
  const { chain, problems } = mapLayers(over);
  const out = [...problems];
  const counts = /* @__PURE__ */ new Map();
  chain.forEach((layer, i) => {
    const v = over[layer];
    if (typeof v !== "string") {
      if (i > 0) out.push(`\u2716 side.over.${layer}: a list at the top applies to nothing \u2192 nest it under its parent items (- name: x, ${layer}: [...]), or use each`);
      return;
    }
    if (rule === "none") out.push(`\u2716 side.over.${layer}: loop sweeps ideas you list \u2192 write the items as a list; use scan for files`);
    else if (rule === "scan" && i === 0 && v === "each") out.push(`\u2716 side.over.${layer}: scan needs a file pattern first \u2192 e.g. ${layer}: src/**/*.ts`);
    else if ((rule === "each-only" || i > 0) && v !== "each") out.push(`\u2716 side.over.${layer}: "${clip(v, 30)}" \u2192 use each (we split the layer above)`);
    else if (rule === "scan" && i === 0 && (v.startsWith("/") || v.split("/").includes(".."))) out.push(`\u2716 side.over.${layer}: "${clip(v, 40)}" is outside the project \u2192 use a pattern inside it`);
  });
  if (rule === "scan" && typeof over[chain[0]] !== "string") out.push(`\u2716 side.over.${chain[0]}: scan needs a file pattern first \u2192 e.g. ${chain[0]}: src/**/*.ts`);
  const walk2 = (layer, value, under) => {
    if (typeof value === "string") return;
    if (!Array.isArray(value)) {
      out.push(`\u2716 side.over.${layer}: under ${under}, ${layer} must be a list \u2192 ${layer}: [a, b]`);
      return;
    }
    counts.set(layer, (counts.get(layer) ?? 0) + value.length);
    const seen = /* @__PURE__ */ new Set();
    for (const raw of value) {
      const it = parseItem(raw);
      if ("problem" in it) {
        out.push(`\u2716 side.over.${layer}: ${it.problem}`);
        continue;
      }
      if (!NAME.test(it.name)) out.push(`\u2716 side.over.${layer}: item "${clip(it.name, 30)}" \u2192 names are 1\u201380 characters, without "/" or "#"`);
      if (seen.has(it.name)) out.push(`\u2716 side.over.${layer}: "${clip(it.name, 30)}" twice under ${under} \u2192 give each item its own name`);
      seen.add(it.name);
      for (const [child, v] of Object.entries(it.children)) {
        if (!TAG2.test(child) || child.length > 20) {
          out.push(`\u2716 side.over.${layer}: under "${clip(it.name, 30)}", "${clip(child, 20)}" is not a layer name \u2192 lowercase, one word or kebab-case`);
          continue;
        }
        walk2(child, v, `"${clip(it.name, 30)}"`);
      }
    }
  };
  for (const l of chain) walk2(l, over[l], "the top");
  for (const [layer, n] of counts) {
    if (n > cap2) out.push(`\u2716 side.over.${layer}: ${n} items \u2192 at most ${cap2} per layer at this depth; raise depth or split the request`);
  }
  return [...new Set(out)];
}
function expand(over, opts = {}) {
  const { layers, chain } = mapLayers(over);
  const items = [];
  const add = (layer, value, parent) => {
    const entries = [];
    if (typeof value === "string") {
      if (!opts.resolve) throw new Error(`layer ${layer}: "${value}" needs a resolver`);
      for (const r of opts.resolve(layer, value, parent)) entries.push({ ...r, children: {} });
    } else if (Array.isArray(value)) {
      for (const raw of value) {
        const it = parseItem(raw);
        if (!("problem" in it)) entries.push({ name: it.name, text: it.name, children: it.children });
      }
    }
    const next = chain[chain.indexOf(layer) + 1];
    for (const e of entries) {
      const item = {
        id: parent ? `${parent.id}/${e.name}` : e.name,
        layer,
        name: e.name,
        parent: parent?.id ?? null,
        fill: { ...parent?.fill ?? {}, [layer]: e.name },
        text: e.text,
        ...e.unit ? { unit: e.unit } : {}
      };
      items.push(item);
      for (const [child, v] of Object.entries(e.children)) add(child, v, item);
      if (chain.includes(layer) && next !== void 0) add(next, over[next], item);
    }
  };
  add(chain[0], over[chain[0]], opts.root ?? null);
  return { layers, items };
}
function blanksIn(text) {
  return [...text.matchAll(BLANK)].map((m2) => m2[1]);
}
function fillBlanks(text, fill) {
  return text.replace(BLANK, (m2, name) => fill[name] ?? m2);
}

// src/contract/translate.ts
function asked(q, id, text, item) {
  return {
    id,
    n: q.n,
    kind: q.kind,
    text,
    ...item !== void 0 ? { item } : {},
    ...q.kind === "scale" ? { levels: q.levels } : {},
    ...q.kind === "choice" ? { options: q.options } : {}
  };
}
var byNumber = (categories) => categories.flatMap((c) => c.questions).sort((a, b) => a.n - b.n);
var goalQuestion = (goal) => ({ id: "goal", n: null, kind: "yesno", text: goal });
function subjectQuestions(categories, prefix = "") {
  return byNumber(categories).map((q) => asked(q, `${prefix}${q.n}`, q.text));
}
function itemQuestions(item, categories) {
  return byNumber(categories).map((q) => asked(q, `${item.id}#${q.n}`, fillBlanks(q.text, item.fill), item.id));
}
function toClassifierQuestion(q) {
  const ask2 = redact(q.text);
  const item = q.item === void 0 ? {} : { item: redact(q.item) };
  if (q.kind === "yesno") return { type: "noul", id: q.id, ask: ask2, ...item };
  if (q.kind === "scale") return { type: "score", id: q.id, ask: ask2, levels: q.levels ?? [], ...item };
  return { type: "choice", id: q.id, ask: ask2, options: Object.fromEntries((q.options ?? []).map((o) => [o, o])), ...item };
}
function answerKey(evidence, q) {
  return createHash2("sha256").update(JSON.stringify([evidence, q.kind, q.text, q.levels ?? q.options ?? null])).digest("hex").slice(0, 32);
}
function subjectEvidence(files) {
  return JSON.stringify(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
var ITEM_LIMITS = { perItemChars: 2e4, totalChars: 6e4 };
function itemsState(items, notes) {
  const out = {};
  let total = 0;
  for (const it of items) {
    const id = redact(it.id);
    let text = redact(it.text);
    if (text.length > ITEM_LIMITS.perItemChars) {
      text = text.slice(0, ITEM_LIMITS.perItemChars);
      notes.push(`${id} truncated to ${ITEM_LIMITS.perItemChars} chars`);
    }
    const room = ITEM_LIMITS.totalChars - total;
    if (room <= 0) {
      out[id] = "";
      notes.push(`${id} not shown: evidence limit reached`);
      continue;
    }
    if (text.length > room) {
      text = text.slice(0, room);
      notes.push(`${id} truncated: evidence limit reached`);
    }
    total += text.length;
    out[id] = text;
  }
  return out;
}

// src/evidence/git.ts
import { spawnSync } from "node:child_process";
import { readFileSync as readFileSync11, realpathSync as realpathSync4, statSync as statSync7 } from "node:fs";
import path13 from "node:path";

// src/evidence/code.ts
import { readFileSync as readFileSync10, realpathSync as realpathSync3, statSync as statSync6 } from "node:fs";
import path12 from "node:path";
var EVIDENCE_LIMITS = { perFileChars: 2e4, totalChars: 6e4 };
var LINES = /^(\d+)(?:-(\d+))?$/;
var TAIL = /:(\d+(?:-\d+)?)$/u;
function lineRange(lines) {
  const m2 = LINES.exec(lines);
  if (!m2) return void 0;
  const start = Number(m2[1]);
  const end = m2[2] === void 0 ? start : Number(m2[2]);
  return start >= 1 && start <= end ? { start, end } : void 0;
}
function splitWhere(entry) {
  const m2 = TAIL.exec(entry);
  return m2 ? { path: entry.slice(0, m2.index), lines: m2[1] } : { path: entry };
}
var isOutside = (rel) => rel.startsWith("..") || path12.isAbsolute(rel);
function readCodeEvidence(root, where) {
  const errors = [];
  const notes = [];
  const files = {};
  let total = 0;
  for (const entry of where) {
    const { path: rawPath, lines } = splitWhere(entry);
    const full = path12.resolve(root, rawPath);
    const rel = path12.relative(root, full);
    const outside = `\u2716 side.where: "${rawPath}" is outside the project \u2192 use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const range = lines ? lineRange(lines) : void 0;
    if (lines && !range) {
      errors.push(`\u2716 side.where: "${entry}" has a bad line range \u2192 use start-end with 1 \u2264 start \u2264 end`);
      continue;
    }
    let text;
    try {
      if (isOutside(path12.relative(realpathSync3(root), realpathSync3(full)))) {
        errors.push(outside);
        continue;
      }
      if (statSync6(full).isDirectory()) {
        errors.push(`\u2716 side.where: "${rawPath}" is a folder \u2192 name a file (scan covers folders)`);
        continue;
      }
      text = readFileSync10(full, "utf8");
    } catch {
      errors.push(`\u2716 side.where: cannot read "${rawPath}" \u2192 check the path`);
      continue;
    }
    const shown2 = `${rel.split(path12.sep).join("/")}${lines ? `:${lines}` : ""}`;
    let body = redact(range ? text.split("\n").slice(range.start - 1, range.end).join("\n") : text);
    if (body.length > EVIDENCE_LIMITS.perFileChars) {
      body = body.slice(0, EVIDENCE_LIMITS.perFileChars);
      notes.push(`${shown2} truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
    }
    const room = EVIDENCE_LIMITS.totalChars - total;
    if (room <= 0) {
      notes.push(`${shown2} skipped: evidence limit reached`);
      continue;
    }
    if (body.length > room) {
      body = body.slice(0, room);
      notes.push(`${shown2} truncated: evidence limit reached`);
    }
    total += body.length;
    files[shown2] = body;
  }
  return errors.length ? { ok: false, errors } : { ok: true, evidence: { files, notes } };
}

// src/evidence/git.ts
var FATAL = /fatal: (invalid object name|Path .* does not exist)/u;
var WHOLE_FILE_NOTE = "reading whole files: line ranges may not match the parent run";
var isGitOption = (ref) => ref.startsWith("-");
function gitRootOf(dir, spawn) {
  const result = spawn("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" });
  const out = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return result.status === 0 && out ? out : void 0;
}
var isOutside2 = (rel) => rel.startsWith("..") || path13.isAbsolute(rel);
function keep(shown2, text, total, notes) {
  let body = redact(text);
  if (body.length > EVIDENCE_LIMITS.perFileChars) {
    body = body.slice(0, EVIDENCE_LIMITS.perFileChars);
    notes.push(`${shown2} truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
  }
  const room = EVIDENCE_LIMITS.totalChars - total;
  if (room <= 0) {
    notes.push(`${shown2} skipped: evidence limit reached`);
    return void 0;
  }
  if (body.length > room) {
    body = body.slice(0, room);
    notes.push(`${shown2} truncated: evidence limit reached`);
  }
  return { body, total: total + body.length };
}
function readGitEvidence(root, ref, field, paths, deps) {
  if (ref !== "worktree" && isGitOption(ref)) {
    return { ok: false, errors: [`\u2716 side.compare.${field}: "${ref}" looks like an option, not a ref \u2192 use a branch, tag or commit`] };
  }
  const spawn = deps?.spawn ?? spawnSync;
  const errors = [];
  const notes = [];
  const files = {};
  let total = 0;
  let read2 = false;
  for (const rawPath of paths) {
    const full = path13.resolve(root, rawPath);
    const rel = path13.relative(root, full);
    const outside = `\u2716 side.compare.${field}: "${rawPath}" is outside the project \u2192 use a path inside the project`;
    if (isOutside2(rel)) {
      errors.push(outside);
      continue;
    }
    const shown2 = rel.split(path13.sep).join("/");
    if (ref === "worktree") {
      let text;
      try {
        if (isOutside2(path13.relative(realpathSync4(root), realpathSync4(full)))) {
          errors.push(outside);
          continue;
        }
        if (statSync7(full).isDirectory()) {
          errors.push(`\u2716 side.compare.${field}: "${rawPath}" is a folder \u2192 name a file`);
          continue;
        }
        text = readFileSync11(full, "utf8");
      } catch {
        errors.push(`\u2716 side.compare.${field}: cannot read "${rawPath}" \u2192 check the path`);
        continue;
      }
      read2 = true;
      const kept2 = keep(shown2, text, total, notes);
      if (kept2) {
        files[shown2] = kept2.body;
        total = kept2.total;
      }
      continue;
    }
    const gitRoot = gitRootOf(path13.dirname(full), spawn) ?? root;
    const gitRel = path13.relative(gitRoot, full).split(path13.sep).join("/");
    const result = spawn("git", ["show", `${ref}:${gitRel}`], { cwd: gitRoot, encoding: "utf8" });
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    if (result.status !== 0 || FATAL.test(stderr)) {
      errors.push(`\u2716 side.compare.${field}: "${ref}" not found by git (or the path doesn't exist there) \u2192 check the ref and the path`);
      continue;
    }
    read2 = true;
    const kept = keep(shown2, typeof result.stdout === "string" ? result.stdout : "", total, notes);
    if (kept) {
      files[shown2] = kept.body;
      total = kept.total;
    }
  }
  if (errors.length) return { ok: false, errors };
  if (read2) notes.push(WHOLE_FILE_NOTE);
  return { ok: true, files, notes };
}

// src/ledger/reuse.ts
function readCandidate(paths, offset, who) {
  const run = readRecordAt(paths.log, offset);
  return run && isContractRun(run) && run.adapter === who.adapter && run.model === who.model ? run : void 0;
}
function fastReuse(paths, handle, who, key2) {
  const hit = handle.reuseKeyHit(who.adapter, who.model, key2);
  if (!hit || hit.blocked) return void 0;
  const origin = readCandidate(paths, hit.offset, who);
  if (!origin) return void 0;
  const originQid = Object.entries(origin.keys).find(([, k]) => k === key2)?.[0];
  if (originQid === void 0) return void 0;
  const answer = origin.answers[originQid];
  return answer ? { id: origin.id, answer } : void 0;
}
function lookupAnswers(paths, who, keys, opts = {}) {
  const want = new Set(keys);
  if (!want.size) return /* @__PURE__ */ new Map();
  return onStore(
    paths.log,
    "read",
    () => withIndex(
      paths,
      (handle) => {
        const out = /* @__PURE__ */ new Map();
        const remaining = /* @__PURE__ */ new Set();
        for (const key2 of want) {
          const hit = fastReuse(paths, handle, who, key2);
          if (hit) {
            out.set(key2, hit);
            continue;
          }
          if (handle.everHeld(who.adapter, who.model, key2)) remaining.add(key2);
        }
        if (remaining.size) {
          for (const { offset } of handle.candidates(who.adapter, who.model)) {
            if (!remaining.size) break;
            const run = readCandidate(paths, offset, who);
            if (!run) continue;
            for (const [qid, key2] of Object.entries(run.keys)) {
              if (!remaining.has(key2)) continue;
              const answer = run.answers[qid];
              const origin = run.reusedFrom[qid] ?? run.id;
              if (answer && !handle.isBlocked(origin)) {
                out.set(key2, { id: origin, answer });
                remaining.delete(key2);
              }
            }
          }
        }
        return out;
      },
      { readOnly: opts.readOnly ?? false }
    )
  );
}
function exactReuse(paths, who, keys) {
  if (!keys.length) return void 0;
  return onStore(
    paths.log,
    "read",
    () => withIndex(
      paths,
      (handle) => {
        if (keys.some((k) => !handle.everHeld(who.adapter, who.model, k))) return void 0;
        for (const { offset } of handle.candidates(who.adapter, who.model)) {
          const run = readCandidate(paths, offset, who);
          if (!run) continue;
          const qidOf = new Map(Object.entries(run.keys).map(([qid, key2]) => [key2, qid]));
          const holds = keys.every((k) => {
            const qid = qidOf.get(k);
            if (qid === void 0) return false;
            const origin = run.reusedFrom[qid] ?? run.id;
            return !handle.isBlocked(origin);
          });
          if (holds) return run.id;
        }
        return void 0;
      },
      { readOnly: true }
    )
  );
}

// src/ledger/record.ts
function recordCall(paths, costUsd, entry, now = Date.now()) {
  return withLock(paths.lock, () => {
    const { before, after } = spendLocked(paths, costUsd, now);
    try {
      const record2 = "run" in entry ? appendRunLocked(paths, entry.run, now) : "contract" in entry ? appendContractRunLocked(paths, entry.contract, now, budgetLine(after)) : appendFailedLocked(paths, entry.failed, now);
      return { budget: after, record: record2 };
    } catch (e) {
      try {
        restoreLocked(paths, before);
      } catch {
      }
      throw e;
    }
  });
}

// src/verbs/pay.ts
var NOT_COUNTED = "(the call was NOT counted against the budget)";
var fail = (exit, text) => ({ ok: false, result: { exit, text } });
var isStoreFailure = (e) => e instanceof LedgerError || e instanceof LockError || e instanceof StoreError;
var isProbability = (p) => typeof p === "number" && p >= 0 && p <= 1;
var usableCost = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0;
function oneLine(e) {
  const text = redact((e instanceof Error ? e.message : String(e)).split("\n")[0].trim());
  return text.length > 200 ? `${text.slice(0, 199)}\u2026` : text;
}
var actorOf = (ctx) => ctx.env.SIDEWISE_ACTOR?.trim() || "agent";
function notCounted(e) {
  if (e instanceof BudgetError) return fail(3, `${e.message} ${NOT_COUNTED}`);
  if (isStoreFailure(e)) return fail(1, `${e.message} ${NOT_COUNTED}`);
  throw e;
}
function createdNote(state) {
  return `budget file created with defaults ($${state.capUsd.toFixed(2)} \xB7 ${state.capRuns} runs)`;
}
function preflight(ctx, opts = {}) {
  const now = ctx.now ?? Date.now;
  let budget;
  try {
    budget = loadBudget(ctx.paths, now());
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  if (opts.needsBudget ?? true) {
    const gate = checkBudget(budget.state);
    if (!gate.ok) return fail(3, gate.message);
  }
  try {
    checkLedger(ctx.paths);
  } catch (e) {
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  return { ok: true, value: budget };
}
function toAnswer(q, a) {
  const what = q.n === null ? "the goal" : q.item !== void 0 ? `question ${q.n} for ${q.item}` : `question ${q.n}`;
  if (q.kind === "yesno") {
    if (!a || a.type !== "noul") throw new Error(`no yes/no answer for ${what}`);
    if (!isProbability(a.probability)) throw new Error(`${what} probability ${a.probability} is not between 0 and 1`);
    return { kind: "yesno", p: a.probability };
  }
  let dist;
  if (q.kind === "scale") {
    if (!a || a.type !== "score" || !Array.isArray(a.distribution)) throw new Error(`no scale answer for ${what}`);
    dist = Object.fromEntries((q.levels ?? []).map((l, i) => [l, a.distribution[i] ?? 0]));
  } else {
    if (!a || a.type !== "choice" || !a.probabilities || typeof a.probabilities !== "object") throw new Error(`no choice answer for ${what}`);
    dist = Object.fromEntries((q.options ?? []).map((o) => [o, a.probabilities[o] ?? 0]));
  }
  const bad = Object.values(dist).find((v) => !isProbability(v));
  if (bad !== void 0) throw new Error(`${what} has a probability ${bad} that is not between 0 and 1`);
  return { kind: q.kind, dist };
}
function readAnswers(questions, result) {
  const raw = result?.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("the provider returned no answers");
  return Object.fromEntries(questions.map((q) => [q.id, toAnswer(q, raw[q.id])]));
}
function logFailed(ctx, verb, costUsd, reason) {
  const now = ctx.now ?? Date.now;
  try {
    recordCall(ctx.paths, costUsd ?? 0, { failed: { verb, actor: actorOf(ctx), adapter: ctx.provider.adapter, model: ctx.provider.model, costUsd: costUsd ?? null, reason } }, now());
  } catch (e) {
    return notCounted(e);
  }
  return fail(1, `\u2716 classifier: ${reason} \u2192 retry; the call was counted against the budget`);
}
async function askAll(ctx, verb, calls) {
  const answers = {};
  let costUsd = 0;
  let costEstimated = false;
  let paid = 0;
  for (const [i, call] of calls.entries()) {
    let result;
    try {
      result = await ctx.provider.ask(call.questions.map(toClassifierQuestion), call.state);
    } catch (e) {
      if (paid === 0) return fail(1, `\u2716 classifier: ${oneLine(e)} \u2192 retry later, or set SIDEWISE_PROVIDER=fake to check the request`);
      return logFailed(ctx, verb, costUsd, `call ${i + 1} of ${calls.length}: ${oneLine(e)}`);
    }
    paid += 1;
    const c = usableCost(result?.costUsd);
    costUsd = costUsd === void 0 || c === void 0 ? void 0 : costUsd + c;
    if (c !== void 0 && result?.costEstimated) costEstimated = true;
    try {
      Object.assign(answers, readAnswers(call.questions, result));
    } catch (e) {
      return logFailed(ctx, verb, costUsd, e.message);
    }
  }
  return { ok: true, value: { answers, costUsd, costEstimated } };
}
function record(ctx, costUsd, run) {
  const now = ctx.now ?? Date.now;
  try {
    const { record: saved, budget } = recordCall(ctx.paths, costUsd ?? 0, { contract: run }, now());
    return { ok: true, value: { run: saved, budget } };
  } catch (e) {
    return notCounted(e);
  }
}
function recordFree(ctx, run) {
  const now = ctx.now ?? Date.now;
  try {
    const budget = loadBudget(ctx.paths, now()).state;
    return { ok: true, value: { run: appendContractRun(ctx.paths, run, now(), budgetLine(budget)) } };
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
}

// src/contract/read.ts
var import_yaml = __toESM(require_dist(), 1);
var SKELETON = "(sidewise template class prints a skeleton)";
var QUESTION_LINE = /^\s*(\d+)\s*:\s?(.*)$/u;
function sourceLine(lines, line3) {
  for (let no = Math.min(line3, lines.length); no >= 1; no--) {
    const text = lines[no - 1] ?? "";
    if (text.trim()) return { no, text };
  }
  return { no: line3, text: "" };
}
function describeParseError(lines, code, line3) {
  if (code === "MULTIPLE_DOCS") return "\u2716 yaml: more than one document (---) \u2192 send one request per run";
  const at = sourceLine(lines, line3);
  if (code === "TAB_AS_INDENT") return `\u2716 yaml: line ${at.no} is indented with a tab \u2192 indent with spaces`;
  if (code === "DUPLICATE_KEY") {
    const key2 = /^\s*(?:-\s+)?([^:#]+?)\s*:/u.exec(at.text)?.[1] ?? "";
    return /^\d+$/u.test(key2) ? `\u2716 question ${key2}: numbered twice (line ${at.no}) \u2192 give each question its own number` : `\u2716 yaml: line ${at.no} repeats the key "${clip(key2, 30)}" \u2192 give each key once`;
  }
  if (/[{}]/u.test(at.text)) return `\u2716 yaml: line ${at.no} puts a category or question in { } \u2192 use the indented form`;
  const q = QUESTION_LINE.exec(at.text);
  if (q && /:(\s|$)/u.test(q[2] ?? "")) return `\u2716 question ${q[1]} has ": " \u2192 put it in quotes`;
  return `\u2716 yaml: line ${at.no} does not parse \u2192 use the indented form, and put any question with ": " or " #" in quotes`;
}
function readRequestText(text) {
  const src = text.replace(/^﻿/u, "");
  if (!src.trim()) return { ok: false, stops: [`\u2716 request: empty \u2192 start with "side:" ${SKELETON}`] };
  if (/^\s*sidewise\s+\w+\s+L\d/u.test(src)) return { ok: false, stops: [`\u2716 request: this is the old text format \u2192 send YAML ${SKELETON}`] };
  const doc = (0, import_yaml.parseDocument)(src, { version: "1.2", schema: "core", uniqueKeys: true });
  const first = doc.errors[0];
  if (first) return { ok: false, stops: [describeParseError(src.split(/\r?\n/u), first.code, first.linePos?.[0]?.line ?? 1)] };
  let value;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { ok: false, stops: ["\u2716 yaml: too many aliases (*) \u2192 write the request out in full"] };
  }
  if (value === null || value === void 0) return { ok: false, stops: [`\u2716 request: empty \u2192 start with "side:" ${SKELETON}`] };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, stops: [`\u2716 request: not a YAML mapping \u2192 start with "side:" ${SKELETON}`] };
  return { ok: true, value };
}

// src/contract/validate.ts
var NEEDS = {
  class: ["depth", "where", "ask"],
  view: ["where"],
  change: ["parent", "compare"],
  scan: ["depth", "over", "ask"],
  loop: ["depth", "over", "ask"],
  drill: ["parent", "from", "ask"]
};
var NEVER = {
  class: ["over", "from", "compare", "parent"],
  view: ["over", "from", "compare", "parent"],
  change: ["ask", "over", "from", "where", "depth"],
  scan: ["where", "from", "compare", "parent"],
  loop: ["from", "compare", "parent"],
  drill: ["compare", "where"]
};
var STRINGS = { scan: "scan", drill: "each-only", loop: "none", class: "none", view: "none", change: "none" };
var RESERVED2 = ["id", "gate", "goal", "consensus", "escalate", "regressed", "failing", "passing", "scanned", "reused", "view", "reuse", "runs", "categories"];
var IRREVERSIBLE = /\b(delete|deploy|drop|pay|payment|migrat\w*|secret|credential)s?\b/iu;
var IRREVERSIBLE_NOTE = "looks irreversible; don't act on this alone";
function how(field, verb) {
  const sweep = verb === "scan" || verb === "loop" || verb === "drill";
  switch (field) {
    case "depth":
      return sweep ? 'add "depth: quick" (at most 10 items asked per layer; standard 20, thorough 30)' : 'add "depth: quick" (10 yes/no questions; standard 20, thorough 30)';
    case "where":
      return 'add "where: [path/to/file.ts]"';
    case "ask":
      return `add ask: with a category, its pass: and numbered questions (sidewise template ${verb})`;
    case "parent":
      return 'add "parent: SW-####" (the run this builds on)';
    case "compare":
      return 'add "compare: {before: main, after: HEAD}"';
    case "over":
      return `add over: with the layers to sweep (sidewise template ${verb})`;
    case "from":
      return 'add "from: <an item id or a category of the parent run>"';
  }
}
function never(field, verb) {
  if (verb === "change" && field === "ask") return "\u2716 side.ask: change replays the parent's questions \u2192 remove ask; for new questions, use class";
  if (field === "parent") return "\u2716 side.parent: only drill and change build on a parent \u2192 move it to wise.parent (lineage)";
  if (field === "over") return `\u2716 side.over: ${verb} asks about one subject \u2192 remove over, or use loop or scan to sweep`;
  if (field === "where" && verb === "scan") return "\u2716 side.where: scan reads the files in over \u2192 remove where";
  if (field === "where") return `\u2716 side.where: ${verb} reads the parent run's code \u2192 remove where`;
  return `\u2716 side.${field}: ${verb} doesn't take it \u2192 remove it`;
}
var cross = (text) => ({ cls: "cross", text });
function findBlanks(v, path19, out) {
  const label = (p) => {
    const q = /^side\.ask\..*\.(\d+)$/u.exec(p);
    return q ? `question ${q[1]}` : p;
  };
  if (typeof v === "string") {
    if (v.includes("____")) out.push(cross(`\u2716 ${label(path19)}: still a ____ blank \u2192 fill it in`));
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => findBlanks(x, `${path19}[${i}]`, out));
    return;
  }
  if (isObj2(v)) {
    for (const [k, x] of Object.entries(v)) {
      const p = path19 ? `${path19}.${k}` : k;
      if (k.includes("____")) out.push(cross(`\u2716 ${label(p)}: still a ____ blank \u2192 fill it in`));
      else findBlanks(x, p, out);
    }
  }
}
function toQuestion(n, raw) {
  if (typeof raw === "string") return { n, kind: "yesno", text: raw };
  const o = raw;
  if ("scale" in o) return { n, kind: "scale", text: o.scale, levels: o.levels };
  return { n, kind: "choice", text: o.choice, options: o.options };
}
function toCategory(name, raw) {
  const pass = raw.pass === true ? "yes" : raw.pass === false ? "no" : raw.pass;
  const questions = Object.entries(raw).filter(([k]) => /^[1-9][0-9]*$/u.test(k)).map(([k, q]) => toQuestion(Number(k), q)).sort((a, b) => a.n - b.n);
  return { name, pass, need: raw.need ?? "all", tags: raw.tags ?? [], questions };
}
function checkCategory2(c, field, out) {
  const kinds = new Set(c.questions.map((q) => q.kind));
  if (c.questions.length === 0) out.push(cross(`\u2716 ${field}: no questions \u2192 add at least one numbered question`));
  if (RESERVED2.includes(c.name)) out.push(cross(`\u2716 ${field}: "${c.name}" is a word the answer uses \u2192 rename the category`));
  if (kinds.size > 1) {
    out.push(cross(`\u2716 ${field}: mixes ${[...kinds].map((k) => k === "yesno" ? "yes/no" : k).join(" and ")} questions \u2192 one kind per category`));
    return;
  }
  const kind = [...kinds][0];
  if (kind === "yesno" && Array.isArray(c.pass)) out.push(cross(`\u2716 ${field}.pass: a list is for scale or choice questions \u2192 use yes or no`));
  if (kind && kind !== "yesno") {
    if (!Array.isArray(c.pass)) {
      out.push(cross(`\u2716 ${field}.pass: ${kind} questions need the passing ${kind === "scale" ? "levels" : "options"} \u2192 e.g. pass: [none, low]`));
      return;
    }
    for (const q of c.questions) {
      const allowed = q.kind === "scale" ? q.levels : q.kind === "choice" ? q.options : [];
      const unknown = c.pass.find((p) => !allowed.includes(p));
      if (unknown !== void 0) {
        out.push(cross(`\u2716 ${field}.pass: "${clip(unknown, 20)}" is not ${q.kind === "scale" ? "a level" : "an option"} of question ${q.n} \u2192 use some of ${allowed.join(", ")}`));
      }
    }
  }
}
function checkNumbers(categories, out) {
  const seen = /* @__PURE__ */ new Set();
  for (const n of categories.flatMap((c) => c.questions.map((q) => q.n))) {
    if (seen.has(n)) out.push(cross(`\u2716 question ${n}: numbered twice \u2192 give each question its own number`));
    seen.add(n);
  }
  const sorted = [...seen].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== i + 1)) out.push(cross(`\u2716 question numbers: ${clip(sorted.join(" "), 60)} \u2192 number them 1\u2026${sorted.length} with no gaps`));
  const extras = categories.flatMap((c) => c.questions).filter((q) => q.kind !== "yesno").length;
  if (extras > MAX_EXTRAS) out.push(cross(`\u2716 side.ask: ${extras} scale/choice questions \u2192 at most ${MAX_EXTRAS}`));
}
function checkCross(raw, verb) {
  const out = [];
  const side = raw.side;
  if (side.verb !== void 0 && side.verb !== verb) out.push(cross(`\u2716 side.verb: says "${side.verb}" but you ran ${verb} \u2192 remove side.verb, or run sidewise ${side.verb}`));
  for (const f of NEEDS[verb]) if (!(f in side)) out.push(cross(`\u2716 side.${f}: ${verb} needs it \u2192 ${how(f, verb)}`));
  for (const f of NEVER[verb]) if (f in side) out.push(cross(never(f, verb)));
  const over = side.over;
  const ask2 = side.ask ?? {};
  const depth = side.depth;
  const categories = [];
  const layers = [];
  if (over === void 0) {
    for (const [name, v] of Object.entries(ask2)) {
      if (!("pass" in v)) {
        out.push(cross(`\u2716 side.ask.${name}: categories go straight under ask for one subject \u2192 give ${name} a pass:, or add over: to sweep`));
        continue;
      }
      const c = toCategory(name, v);
      checkCategory2(c, `side.ask.${name}`, out);
      categories.push(c);
      for (const q of c.questions) {
        const b = blanksIn(q.text)[0];
        if (b !== void 0 && verb !== "drill") out.push(cross(`\u2716 question ${q.n}: {${b}} has nothing to fill it \u2192 blanks are for sweeps (over:); write the name out`));
      }
    }
    checkNumbers(categories, out);
    const yesno = categories.flatMap((c) => c.questions).filter((q) => q.kind === "yesno").length;
    if (verb === "class" && depth) {
      const want = DEPTH_COUNT[depth];
      if (yesno < want) out.push(cross(`\u2716 side.depth: ${depth} needs ${want} yes/no questions, got ${yesno} \u2192 add ${want - yesno}`));
      if (yesno > want) out.push(cross(`\u2716 side.depth: ${depth} needs ${want} yes/no questions, got ${yesno} \u2192 remove ${yesno - want}, or raise the depth`));
    }
  } else {
    for (const p of checkOver(over, STRINGS[verb], DEPTH_COUNT[depth ?? "quick"])) out.push(cross(p));
    const map = mapLayers(over);
    for (const [name, v] of Object.entries(ask2)) {
      if ("pass" in v) {
        out.push(cross(`\u2716 side.ask.${name}: a sweep keys categories by layer \u2192 ask: {<layer>: {${name}: ...}}`));
        continue;
      }
      if (!map.layers.includes(name)) {
        out.push(cross(`\u2716 side.ask.${name}: not a layer in over \u2192 use one of ${map.layers.join(", ")}`));
        continue;
      }
      const cats = Object.entries(v).map(([cname, c]) => toCategory(cname, c));
      const allowed = [name, ...map.ancestors.get(name) ?? []];
      for (const c of cats) {
        checkCategory2(c, `side.ask.${name}.${c.name}`, out);
        for (const q of c.questions) {
          for (const b of blanksIn(q.text)) {
            if (!allowed.includes(b) && !(verb === "drill" && !map.layers.includes(b))) {
              out.push(cross(`\u2716 question ${q.n}: {${b}} is not ${name}'s layer or above it \u2192 use ${allowed.map((a) => `{${a}}`).join(" or ")}`));
            }
          }
        }
      }
      layers.push({ name, categories: cats });
      categories.push(...cats);
    }
    checkNumbers(categories, out);
    layers.sort((a, b) => map.layers.indexOf(a.name) - map.layers.indexOf(b.name));
  }
  if (out.length) return { stops: out };
  return {
    stops: [],
    side: {
      ...side.verb !== void 0 ? { verb: side.verb } : {},
      goal: side.goal,
      ...depth ? { depth } : {},
      where: side.where ?? [],
      ...side.parent !== void 0 ? { parent: side.parent } : {},
      ...side.from !== void 0 ? { from: side.from } : {},
      ...side.compare !== void 0 ? { compare: side.compare } : {},
      categories: over === void 0 ? categories : [],
      layers,
      ...over !== void 0 ? { over } : {}
    }
  };
}
function validateRequest(value, verb) {
  const blanks = [];
  findBlanks(value, "", blanks);
  if (blanks.length) return { ok: false, stops: blanks };
  const schema = checkSchema(value);
  if (schema.length) return { ok: false, stops: schema };
  const raw = value;
  const { stops, side } = checkCross(raw, verb);
  if (!side) return { ok: false, stops };
  const notes = [];
  const risky = IRREVERSIBLE.exec(side.goal);
  if (risky) notes.push(`${IRREVERSIBLE_NOTE} ("${risky[0].toLowerCase()}")`);
  if (verb === "view" && side.depth) {
    const yesno = side.categories.flatMap((c) => c.questions).filter((q) => q.kind === "yesno").length;
    const want = DEPTH_COUNT[side.depth];
    if (yesno !== want) notes.push(`${side.depth} expects ${want} yes/no questions, got ${yesno}; class will stop on this`);
  }
  const w = raw.wise;
  return { ok: true, request: { side, wise: w && Object.keys(w).length ? w : null }, notes };
}

// src/verbs/request.ts
var MAX_STOPS = 5;
function stopText(stops, verb) {
  if (!stops.length) return "";
  const lines = stops.length <= MAX_STOPS ? [...stops] : [...stops.slice(0, MAX_STOPS), `\u2716 request: ${stops.length - MAX_STOPS} more problems \u2192 fix the ones above, then run again`];
  return [...lines, `\u2192 see: sidewise help ${verb}`].join("\n");
}
function loadRequest(text, verb) {
  const read2 = readRequestText(text);
  if (!read2.ok) return { ok: false, result: { exit: 2, text: stopText(read2.stops, verb) } };
  const v = validateRequest(read2.value, verb);
  if (!v.ok) return { ok: false, result: { exit: 2, text: stopText(v.stops.map((s) => s.text), verb) } };
  return { ok: true, request: v.request, notes: v.notes };
}

// src/classifier/port.ts
var REHEARSAL_ADAPTERS = ["fake", "chaos"];
var isRehearsal = (adapter) => REHEARSAL_ADAPTERS.includes(adapter);

// src/verbs/respond.ts
function shownValue(s) {
  return typeof s === "number" ? s : m(["top", s.top], ["p", s.p]);
}
function categoryEntry(g) {
  return [g.name, m(["gate", g.gate], ...[...g.values].map(([n, v]) => [String(n), shownValue(v)]))];
}
function subjectSide(id, gate, subject, extra) {
  return m(
    ["id", id],
    ["gate", gate],
    ...subject.goal ? [["goal", m(["gate", subject.goal.gate], ["p", subject.goal.p])]] : [],
    ...subject.categories.map(categoryEntry),
    ...extra ?? []
  );
}
function reusedIds(reusedFrom) {
  return [...new Set(Object.values(reusedFrom))].sort();
}
function wiseRecorded(wise2, extra) {
  const fields = [...wise2?.why ? ["why"] : [], ...wise2?.area ? ["area"] : [], ...extra ?? []];
  return fields.length ? fields : "none";
}
function respondText(side, wise2, next, notes) {
  return emit(m(["side", side], ["wise", m(["recorded", wise2])], ["next", next], ["notes", [...notes]]));
}
function commonNotes(notes, budgetNote, adapter) {
  return [...notes, ...adapter && isRehearsal(adapter) ? [`adapter ${adapter} \xB7 not evidence`] : [], budgetNote];
}
var GOAL_ONLY_NEXT = "the goal missed though every part passed \xB7 fix what is missing, then run it again";
var ALL_SKIPPED_NEXT = "every item was skipped \xB7 raise depth or narrow over, then run it again";
function outcomeNext(id, gate, graded, categories, onPass) {
  if (gate === "pass") return onPass;
  const gateOf2 = new Map(graded.map((g) => [g.name, g.gate]));
  const target = categories.find((c) => gateOf2.get(c.name) === gate)?.name;
  if (target) return drillNext(id, target);
  return categories.every((c) => gateOf2.get(c.name) === "pass") ? GOAL_ONLY_NEXT : drillNext(id, categories[0].name);
}
function drillNext(id, target) {
  return `sidewise template drill --parent ${id} --from ${target}`;
}
function regressionNext(id, regressed, categories) {
  const first = regressed[0];
  const target = categories.find((c) => c.questions.some((q) => q.n === first))?.name ?? categories[0].name;
  return drillNext(id, target);
}
function sweepNext(id, gate, worst, graded, onPass) {
  if (gate === "pass") return onPass;
  if (worst.length) return drillNext(id, worst[0].id);
  return graded.length ? GOAL_ONLY_NEXT : ALL_SKIPPED_NEXT;
}
function dryRunText(plan, extraNotes = []) {
  return emit(
    m(
      [
        "plan",
        m(
          ["calls", plan.calls],
          ["questions", plan.questions],
          ...plan.items !== void 0 ? [["items", plan.items]] : [],
          ...plan.reused !== void 0 ? [["reused", plan.reused]] : [],
          ["route", plan.route],
          ...plan.baseURL ? [["baseURL", plan.baseURL]] : []
        )
      ],
      ["notes", ["dry run: no call, no spend", ...extraNotes]]
    )
  );
}
var COST_ESTIMATED_NOTE = "cost estimated from tokens (no live pricing reported)";
function sweepEntry(g) {
  const catEntries = [];
  const qEntries = [];
  for (const c of g.own) if (c.gate !== "pass") catEntries.push([c.name, c.gate]);
  for (const c of g.own) for (const [n, mark] of c.marks) if (mark !== "pass") qEntries.push([n, shownValue(c.values.get(n))]);
  qEntries.sort((a, b) => a[0] - b[0]);
  return [g.id, m(...catEntries, ...qEntries.map(([n, v]) => [String(n), v]))];
}

// src/verbs/change.ts
function planCall(keyed, reused, state, answers, reusedFrom) {
  const toAsk = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push(q);
    }
  }
  return toAsk.length ? { state, questions: toAsk } : null;
}
async function runChange(text, ctx) {
  const loaded = loadRequest(text, "change");
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const parent = findRun(ctx.paths, request.side.parent);
  if (!parent) return { exit: 2, text: `\u2716 side.parent: ${request.side.parent} is not in the ledger \u2192 check the id` };
  if (!isContractRun(parent)) return { exit: 2, text: `\u2716 side.parent: ${parent.id} predates the YAML contract \u2192 run class again on this code` };
  if (parent.items !== null) return { exit: 2, text: `\u2716 side.parent: ${parent.id} was a sweep \u2192 run the sweep again (unchanged items are reused for free)` };
  const categories = parent.ask.categories;
  const paths = [...new Set(parent.where.map((w) => w.split(":")[0]))];
  const identity = providerIdentity(ctx.env);
  const compare = request.side.compare;
  const before = readGitEvidence(ctx.paths.root, compare.before, "before", paths);
  const after = readGitEvidence(ctx.paths.root, compare.after, "after", paths);
  if (!before.ok || !after.ok) {
    const errors = [...before.ok ? [] : before.errors, ...after.ok ? [] : after.errors];
    return { exit: 2, text: stopText(errors, "change") };
  }
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const beforeEvidenceStr = subjectEvidence(before.files);
  const afterEvidenceStr = subjectEvidence(after.files);
  const beforeQuestions = subjectQuestions(categories, "before:");
  const afterQuestions = [goalQuestion(request.side.goal), ...subjectQuestions(categories, "after:")];
  const beforeKeyed = beforeQuestions.map((q) => [q, answerKey(beforeEvidenceStr, q)]);
  const afterKeyed = afterQuestions.map((q) => [q, answerKey(afterEvidenceStr, q)]);
  const beforeReused = lookupAnswers(ctx.paths, who, beforeKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });
  const afterReused = lookupAnswers(ctx.paths, who, afterKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });
  const answers = {};
  const reusedFrom = {};
  const beforeCall = planCall(beforeKeyed, beforeReused, { code: before.files }, answers, reusedFrom);
  const afterCall = planCall(afterKeyed, afterReused, { goal: redact(request.side.goal), code: after.files }, answers, reusedFrom);
  const calls = [...beforeCall ? [beforeCall] : [], ...afterCall ? [afterCall] : []];
  if (ctx.dryRun) {
    const total = beforeKeyed.length + afterKeyed.length;
    const askedQuestions = calls.reduce((n, c) => n + c.questions.length, 0);
    return { exit: 0, text: dryRunText({ calls: calls.length, questions: askedQuestions, reused: total - askedQuestions, route: identity.route, baseURL: identity.baseURL }) };
  }
  const pre = preflight(ctx, { needsBudget: calls.length > 0 });
  if (!pre.ok) return pre.result;
  let costUsd = 0;
  let costEstimated = false;
  if (calls.length > 0) {
    const asked2 = await askAll(ctx, "change", calls);
    if (!asked2.ok) return asked2.result;
    Object.assign(answers, asked2.value.answers);
    costUsd = asked2.value.costUsd;
    costEstimated = asked2.value.costEstimated;
  }
  const keys = {};
  for (const [q, k] of [...beforeKeyed, ...afterKeyed]) keys[q.id] = k;
  const beforeGrade = gradeSubject(categories, answers, "before:");
  const afterCatsGrade = gradeSubject(categories, answers, "after:");
  const g = answers["goal"];
  const goal = { gate: goalGate(g.p), p: g.p };
  const beforeMarks = /* @__PURE__ */ new Map();
  for (const c of beforeGrade.categories) for (const [n, mk] of c.marks) beforeMarks.set(n, mk);
  const afterMarks = /* @__PURE__ */ new Map();
  for (const c of afterCatsGrade.categories) for (const [n, mk] of c.marks) afterMarks.set(n, mk);
  const catEntries = categories.map((c, i) => {
    const beforeCat = beforeGrade.categories[i];
    const afterCat = afterCatsGrade.categories[i];
    const fixed = [...beforeCat.marks].filter(([n, mk]) => mk !== "pass" && afterCat.marks.get(n) === "pass").map(([n]) => n);
    const still = [...beforeCat.marks].filter(([n, mk]) => mk !== "pass" && afterCat.marks.get(n) !== "pass").map(([n]) => n);
    return [
      c.name,
      m(
        ["before", beforeCat.gate],
        ["after", afterCat.gate],
        ...fixed.length ? [["fixed", fixed]] : [],
        ...still.length ? [["still", still]] : []
      )
    ];
  });
  const regressed = categories.flatMap((c) => c.questions).map((q) => q.n).filter((n) => beforeMarks.get(n) === "pass" && afterMarks.get(n) !== "pass").sort((a, b) => a - b);
  const gate = regressed.length > 0 ? "fail" : combine([goal.gate, ...afterCatsGrade.categories.map((c) => c.gate)]);
  let sawWholeFileNote = false;
  const evidenceNotes = [...before.notes, ...after.notes].filter((n) => {
    if (n !== WHOLE_FILE_NOTE) return true;
    if (sawWholeFileNote) return false;
    sawWholeFileNote = true;
    return true;
  });
  const reusedRunIds = reusedIds(reusedFrom);
  const response = (id, budget) => respondText(
    m(
      ["id", id],
      ["gate", gate],
      ["goal", m(["gate", goal.gate], ["p", goal.p])],
      ...catEntries,
      ["regressed", regressed],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ),
    wiseRecorded(request.wise, ["parent"]),
    // A regression alone can fail the gate even when every "after" category passes on its own (C-064) —
    // outcomeNext's gate-matching search would then find nothing and wrongly blame the goal (GOAL_ONLY_NEXT).
    // regressed takes priority: name it, per C-065 (revert or drill into it). [C-091]
    regressed.length ? regressionNext(id, regressed, categories) : outcomeNext(id, gate, afterCatsGrade.categories, categories, `sidewise outcome ${request.side.parent} held --by <you>`),
    commonNotes(
      [...loaded.notes, ...evidenceNotes, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      `2 states \xB7 ${budget}`,
      ctx.provider.adapter
    )
  );
  const run = {
    verb: "change",
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: null,
    where: parent.where,
    parent: request.side.parent,
    from: null,
    compare,
    wise: request.wise,
    ask: { categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(afterCatsGrade.categories.map((c) => [c.name, c.gate])),
    gate,
    goalGate: goal.gate,
    goalP: goal.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls: calls.length,
    route: identity.route,
    baseURL: identity.baseURL
  };
  const rec = calls.length === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

// src/lens/consensus.ts
var THRESHOLDS = { concernAt: 0.5, weakBelow: 0.35, strongAt: 0.8 };
var majority = (flags) => flags.filter(Boolean).length * 2 >= flags.length;
function computeConsensus(slots) {
  if (!slots.length) throw new RangeError("consensus needs at least one slot");
  const concern = slots.map((s) => s.reverse ? 1 - s.p : s.p);
  const flags = concern.map((c) => c >= THRESHOLDS.concernAt);
  const frac = flags.filter(Boolean).length / slots.length;
  const agreement = Math.max(frac, 1 - frac);
  const decisiveness = concern.reduce((sum, c) => sum + Math.abs(2 * c - 1), 0) / slots.length;
  const forward = flags.filter((_, i) => !slots[i].reverse);
  const reverse = flags.filter((_, i) => slots[i].reverse);
  const reverseConsistent = !forward.length || !reverse.length || majority(forward) === majority(reverse);
  const consensus = decisiveness < THRESHOLDS.weakBelow ? "WEAK" : agreement >= THRESHOLDS.strongAt && reverseConsistent ? "STRONG" : "SPLIT";
  return {
    consensus,
    verdict: frac >= 0.5 ? "concern" : "clear",
    agreement,
    decisiveness,
    concernSlots: slots.filter((_, i) => flags[i]).map((s) => s.pos),
    clearSlots: slots.filter((_, i) => !flags[i]).map((s) => s.pos),
    reversed: slots.filter((s) => s.reverse).map((s) => s.pos),
    reverseConsistent
  };
}

// src/verbs/class.ts
var CAP_NOTE = "would be blocked: the budget cap is already reached";
async function runClass(text, ctx) {
  const loaded = loadRequest(text, "class");
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const evidence = readCodeEvidence(ctx.paths.root, request.side.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, "class") };
  const identity = providerIdentity(ctx.env);
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)]);
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });
  const answers = {};
  const reusedFrom = {};
  const toAsk = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push([q, k]);
    }
  }
  if (ctx.dryRun) {
    let capNote = [];
    if (toAsk.length > 0) {
      const state = peekBudget(ctx.paths);
      if (state && !checkBudget(state).ok) capNote = [CAP_NOTE];
    }
    return {
      exit: 0,
      text: dryRunText({ calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL }, capNote)
    };
  }
  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;
  let costUsd;
  let costEstimated = false;
  let calls;
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call = { state: { goal: redact(request.side.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked2 = await askAll(ctx, "class", [call]);
    if (!asked2.ok) return asked2.result;
    Object.assign(answers, asked2.value.answers);
    costUsd = asked2.value.costUsd;
    costEstimated = asked2.value.costEstimated;
    calls = 1;
  }
  const keys = {};
  for (const [q, k] of keyed) keys[q.id] = k;
  const slots = request.side.categories.filter((c) => c.questions[0]?.kind === "yesno").flatMap((c) => c.questions.map((q) => ({ pos: q.n, reverse: c.pass === "yes", p: answers[String(q.n)].p })));
  const consensus = computeConsensus(slots).consensus;
  const subject = gradeSubject(request.side.categories, answers);
  const escalate = consensus !== "STRONG" || request.side.depth === "thorough" || loaded.notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE));
  const reusedRunIds = reusedIds(reusedFrom);
  const response = (id, budget) => respondText(
    subjectSide(id, subject.gate, subject, [
      ["consensus", consensus],
      ["escalate", escalate],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ]),
    wiseRecorded(request.wise),
    outcomeNext(id, subject.gate, subject.categories, request.side.categories, "act on it"),
    commonNotes(
      [...loaded.notes, ...evidence.evidence.notes, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      budget,
      ctx.provider.adapter
    )
  );
  const run = {
    verb: "class",
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: request.side.where,
    parent: null,
    from: null,
    compare: null,
    wise: request.wise,
    ask: { categories: request.side.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL
  };
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

// src/evidence/units.ts
import { readFileSync as readFileSync12, realpathSync as realpathSync5 } from "node:fs";
import path15 from "node:path";

// src/evidence/glob.ts
import { readdirSync } from "node:fs";
import path14 from "node:path";
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".sidewise", "dist"]);
var MAX_FILES = 500;
var escape = (s) => s.replace(/[.+^$()|[\]\\]/gu, "\\$&");
function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        const slash = pattern[i + 2] === "/";
        re += slash ? "(?:[^/]*/)*" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end > i) {
        re += `(?:${pattern.slice(i + 1, end).split(",").map(escape).join("|")})`;
        i = end;
      } else re += "\\{";
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`, "u");
}
function staticPrefix(pattern) {
  const parts = pattern.split("/");
  const fixed = [];
  for (const p of parts.slice(0, -1)) {
    if (/[*?{]/u.test(p)) break;
    fixed.push(p);
  }
  return fixed.join("/");
}
function expandGlob(root, pattern) {
  const clean2 = pattern.replace(/^\.\//u, "");
  if (path14.isAbsolute(clean2) || clean2.split("/").includes("..")) return { files: [], truncated: false };
  const re = globToRegExp(clean2);
  const files = [];
  let truncated = false;
  const rootResolved = path14.resolve(root);
  const walk2 = (rel) => {
    const dir = path14.resolve(root, rel);
    if (dir !== rootResolved && !dir.startsWith(rootResolved + path14.sep)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk2(child);
      } else if (e.isFile() && re.test(child)) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        files.push(child);
      }
    }
  };
  walk2(staticPrefix(clean2));
  return { files, truncated };
}

// src/evidence/split.ts
var KEYWORDS_BEFORE_REGEX = /(?:^|[^\w$])(?:return|typeof|instanceof|case|do|else|in|of|new|delete|void|throw|yield|await)$/u;
function maskCode(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const templates = [];
  let depth = 0;
  const regexAllowed = (i2) => {
    let j = i2 - 1;
    while (j >= 0 && /\s/u.test(out[j])) j--;
    if (j < 0) return true;
    const c = out[j];
    if (/[\w$]/u.test(c)) return KEYWORDS_BEFORE_REGEX.test(out.slice(Math.max(0, j - 12), j + 1).join(""));
    return !/[)\]]/u.test(c);
  };
  const template = (start) => {
    let j = start;
    while (j < n) {
      if (src[j] === "\\") {
        j += 2;
        continue;
      }
      if (src[j] === "`") {
        blank(start, j);
        return j + 1;
      }
      if (src[j] === "$" && src[j + 1] === "{") {
        blank(start, j);
        depth += 1;
        templates.push(depth);
        return j + 2;
      }
      j += 1;
    }
    blank(start, n);
    return n;
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
    } else if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else if (c === "`") {
      i = template(i + 1);
    } else if (c === "/" && regexAllowed(i)) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === "{") {
      depth += 1;
      i += 1;
    } else if (c === "}") {
      if (templates.length && templates[templates.length - 1] === depth) {
        templates.pop();
        depth -= 1;
        i = template(i + 1);
      } else {
        depth -= 1;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return out.join("");
}
function matching(masked, open) {
  const pairs = { "{": "}", "(": ")", "[": "]" };
  const close = pairs[masked[open]];
  let depth = 0;
  for (let k = open; k < masked.length; k++) {
    if (masked[k] === masked[open]) depth += 1;
    else if (masked[k] === close) {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}
function depths(masked) {
  const d = new Int32Array(masked.length + 1);
  let depth = 0;
  for (let k = 0; k < masked.length; k++) {
    d[k] = depth;
    if (masked[k] === "{") depth += 1;
    else if (masked[k] === "}") depth -= 1;
  }
  d[masked.length] = depth;
  return d;
}
var lineAt = (src, index) => {
  let line3 = 1;
  for (let k = 0; k < index && k < src.length; k++) if (src[k] === "\n") line3 += 1;
  return line3;
};
function bodyEnd(masked, paramsOpen) {
  const paramsClose = matching(masked, paramsOpen);
  if (paramsClose < 0) return -1;
  let k = paramsClose + 1;
  while (k < masked.length && masked[k] !== "{" && masked[k] !== ";" && !masked.startsWith("=>", k)) k += 1;
  if (masked.startsWith("=>", k)) {
    k += 2;
    while (k < masked.length && /\s/u.test(masked[k])) k += 1;
    if (masked[k] !== "{") return expressionEnd(masked, k);
  }
  if (masked[k] !== "{") return -1;
  return matching(masked, k);
}
function expressionEnd(masked, from) {
  let depth = 0;
  for (let k = from; k < masked.length; k++) {
    const c = masked[k];
    if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) {
      if (depth === 0) return k - 1;
      depth -= 1;
    } else if (depth === 0 && (c === ";" || c === "," || c === "\n")) return k - 1;
  }
  return masked.length - 1;
}
var DECLARATIONS = [
  // function name(  · export function · export default async function* name(
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/gu,
  // const name = async (…) =>  · const name = function(  · const name: T = x =>
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:async\s+)?(?:function\b[^(]*\(|(?:<[^>]*>)?\s*\(|[A-Za-z_$][\w$]*\s*=>)/gu,
  // export default function (  (anonymous)
  /export\s+default\s+(?:async\s+)?function\s*\*?\s*()\(/gu
];
var METHOD = /^[ \t]*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/gmu;
var NOT_METHODS = /* @__PURE__ */ new Set(["if", "for", "while", "switch", "catch", "function", "return", "with"]);
function dedupe(units) {
  const seen = /* @__PURE__ */ new Map();
  return units.map((u) => {
    const k = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, k);
    return k === 1 ? u : { ...u, name: `${u.name}~${k}` };
  });
}
function splitFunctions(src) {
  const masked = maskCode(src);
  const depth = depths(masked);
  const found = [];
  const add = (name, at, end) => {
    if (end > at && !found.some((f) => f.at === at)) found.push({ name, at, end });
  };
  for (const re of DECLARATIONS) {
    for (const hit of masked.matchAll(re)) {
      const at = hit.index;
      const params = hit[0].trimEnd().endsWith("(") ? at + hit[0].lastIndexOf("(") : at + hit[0].length;
      const end = hit[0].trimEnd().endsWith("=>") ? expressionOrBlock(masked, at + hit[0].length) : bodyEnd(masked, params);
      add(hit[1] || "default", at, end);
    }
  }
  for (const cls of masked.matchAll(/(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/gu)) {
    if (depth[cls.index] !== 0) continue;
    const open = cls.index + cls[0].length - 1;
    const close = matching(masked, open);
    if (close < 0) continue;
    const body = masked.slice(open + 1, close);
    for (const meth of body.matchAll(METHOD)) {
      const at = open + 1 + meth.index;
      const name = meth[1];
      if (NOT_METHODS.has(name) || depth[at + meth[0].length - 1] !== depth[open] + 1) continue;
      const end = bodyEnd(masked, at + meth[0].length - 1);
      if (end > 0) found.push({ name: `${cls[1]}.${name}`, at: at + (meth[0].length - meth[0].trimStart().length), end });
    }
  }
  found.sort((a, b) => a.at - b.at);
  if (!found.length) return [{ name: "(module)", start: 1, end: lineAt(src, src.length), text: src }];
  return dedupe(
    found.map((f) => {
      const lineStart = src.lastIndexOf("\n", f.at) + 1;
      return { name: f.name, start: lineAt(src, f.at), end: lineAt(src, f.end), text: src.slice(lineStart, f.end + 1) };
    })
  );
}
function expressionOrBlock(masked, from) {
  let k = from;
  while (k < masked.length && /\s/u.test(masked[k])) k += 1;
  return masked[k] === "{" ? matching(masked, k) : expressionEnd(masked, k);
}
var NOT_CALLS = /* @__PURE__ */ new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "super", "import", "await", "new", "yield", "void", "delete", "in", "of", "with"]);
var isIdentStart = (c) => c !== void 0 && /[A-Za-z_$]/u.test(c);
var isIdentPart = (c) => c !== void 0 && /[\w$]/u.test(c);
var isSpace = (c) => c !== void 0 && /\s/u.test(c);
function identEnd(masked, at) {
  let k = at + 1;
  while (isIdentPart(masked[k])) k += 1;
  return k;
}
function skipSpace(masked, at) {
  let k = at;
  while (isSpace(masked[k])) k += 1;
  return k;
}
function genericsEnd(masked, at) {
  if (masked[at] !== "<") return -1;
  let k = at + 1;
  while (k < masked.length && !"<>()".includes(masked[k])) k += 1;
  return masked[k] === ">" ? k + 1 : -1;
}
function chainCall(masked, start) {
  const ends = [identEnd(masked, start)];
  let k = ends[0];
  for (; ; ) {
    const j = skipSpace(masked, k);
    let dot = -1;
    if (masked[j] === "?" && masked[j + 1] === ".") dot = j + 2;
    else if (masked[j] === ".") dot = j + 1;
    if (dot < 0) break;
    const afterDot = skipSpace(masked, dot);
    if (!isIdentStart(masked[afterDot])) break;
    k = identEnd(masked, afterDot);
    ends.push(k);
  }
  for (let idx = ends.length - 1; idx >= 0; idx--) {
    const end = ends[idx];
    let j = skipSpace(masked, end);
    const afterGenerics = genericsEnd(masked, j);
    if (afterGenerics >= 0) j = skipSpace(masked, afterGenerics);
    if (masked[j] === "(") return { nameEnd: end, openParen: j };
  }
  return null;
}
function splitCalls(fnSrc) {
  const masked = maskCode(fnSrc);
  const bodyOpen = masked.indexOf("{");
  const units = [];
  const n = masked.length;
  let i = 0;
  while (i < n) {
    if (!isIdentStart(masked[i])) {
      i += 1;
      continue;
    }
    const prev = i > 0 ? masked[i - 1] : void 0;
    if (prev !== void 0 && /[\w$.]/u.test(prev)) {
      i = identEnd(masked, i);
      continue;
    }
    const hit = chainCall(masked, i);
    if (!hit) {
      i = identEnd(masked, i);
      continue;
    }
    if (i > bodyOpen) {
      const name = masked.slice(i, hit.nameEnd).replace(/\s+/gu, "");
      if (!NOT_CALLS.has(name.split(/\??\./u)[0])) {
        const close = matching(masked, hit.openParen);
        const end = close < 0 ? hit.openParen : close;
        const lineStart = fnSrc.lastIndexOf("\n", i) + 1;
        const lineEnd = fnSrc.indexOf("\n", end);
        units.push({ name, start: lineAt(fnSrc, i), end: lineAt(fnSrc, end), text: fnSrc.slice(lineStart, lineEnd < 0 ? fnSrc.length : lineEnd) });
      }
    }
    i = hit.openParen + 1;
  }
  return dedupe(units);
}

// src/evidence/units.ts
var isOutside3 = (rel) => rel.startsWith("..") || path15.isAbsolute(rel);
var LINES2 = /^(\d+)-(\d+)$/;
function lineRange2(lines) {
  const m2 = LINES2.exec(lines);
  if (!m2) return void 0;
  const start = Number(m2[1]);
  const end = Number(m2[2]);
  return start >= 1 && start <= end ? { start, end } : void 0;
}
function readFiles(root, spec, notes) {
  const { files, truncated } = expandGlob(root, spec);
  if (truncated) notes.push(`${spec}: matched more than ${MAX_FILES} files, using the first ${MAX_FILES}`);
  const out = [];
  for (const rel of files) {
    const full = path15.join(root, rel);
    let text;
    try {
      if (isOutside3(path15.relative(realpathSync5(root), realpathSync5(full)))) throw new Error("outside");
      text = readFileSync12(full, "utf8");
    } catch {
      notes.push(`${rel}: could not read, skipped`);
      continue;
    }
    const lineCount = text ? text.split("\n").length : 1;
    out.push({ name: rel, text, unit: { path: rel, kind: "file", name: rel, lines: `1-${lineCount}` } });
  }
  return out;
}
function readFunctions(parent) {
  const unit = parent.unit;
  return splitFunctions(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: "function", name: u.name, lines: `${u.start}-${u.end}` }
  }));
}
function readCalls(parent) {
  const unit = parent.unit;
  const base = Number(unit.lines.split("-")[0]) - 1;
  return splitCalls(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: "call", name: u.name, lines: `${u.start + base}-${u.end + base}` }
  }));
}
function createCodeResolver(root, notes) {
  return (_layer, spec, parent) => {
    if (parent === null) return readFiles(root, spec, notes);
    if (parent.unit.kind === "file") return readFunctions(parent);
    return readCalls(parent);
  };
}
function readUnit(root, unit) {
  const full = path15.resolve(root, unit.path);
  const rel = path15.relative(root, full);
  const outside = { ok: false, error: `"${unit.path}" is outside the project` };
  if (isOutside3(rel)) return outside;
  let text;
  try {
    if (isOutside3(path15.relative(realpathSync5(root), realpathSync5(full)))) return outside;
    text = readFileSync12(full, "utf8");
  } catch {
    return { ok: false, error: `cannot read "${unit.path}"` };
  }
  if (unit.kind === "file") return { ok: true, text };
  const range = lineRange2(unit.lines);
  if (!range) return { ok: false, error: `"${unit.path}:${unit.lines}" has a bad line range` };
  const lines = text.split("\n");
  if (range.end > lines.length) return { ok: false, error: `"${unit.path}:${unit.lines}" is past the end of the file now` };
  return { ok: true, text: lines.slice(range.start - 1, range.end).join("\n") };
}

// src/verbs/sweep.ts
function groupByLayer(items) {
  const out = /* @__PURE__ */ new Map();
  for (const it of items) {
    const arr = out.get(it.layer);
    if (arr) arr.push(it);
    else out.set(it.layer, [it]);
  }
  return out;
}
function planSweep(request, who, paths, dryRun, opts = {}) {
  const { layers, items } = expand(request.side.over, opts);
  const itemsByLayer = groupByLayer(items);
  const asksByItem = /* @__PURE__ */ new Map();
  const allKeys = [];
  for (const layer of request.side.layers) {
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const asks = itemQuestions(item, layer.categories).map((q) => ({ q, key: answerKey(item.text, q) }));
      asksByItem.set(item.id, asks);
      for (const a of asks) allKeys.push(a.key);
    }
  }
  const goalQ = goalQuestion(request.side.goal);
  const goalKey = answerKey("", goalQ);
  allKeys.push(goalKey);
  const reused = lookupAnswers(paths, who, allKeys, { readOnly: dryRun });
  const cap2 = DEPTH_COUNT[request.side.depth ?? "quick"];
  const keys = /* @__PURE__ */ new Map();
  const reusedFrom = /* @__PURE__ */ new Map();
  const answers = {};
  let askedQuestions = 0;
  const work = request.side.layers.map((layer) => {
    let askedCount = 0;
    const callItems = [];
    const callQuestions = [];
    const itemIds = [];
    const skipped = [];
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const itemAsks = asksByItem.get(item.id) ?? [];
      if (!itemAsks.length) continue;
      const missing = itemAsks.filter((a) => !reused.has(a.key));
      if (missing.length === 0) {
        for (const a of itemAsks) {
          const hit = reused.get(a.key);
          reusedFrom.set(a.q.id, hit.id);
          keys.set(a.q.id, a.key);
          answers[a.q.id] = hit.answer;
        }
      } else if (askedCount >= cap2) {
        skipped.push(item.id);
      } else {
        askedCount += 1;
        callItems.push(item);
        itemIds.push(item.id);
        for (const a of itemAsks) {
          keys.set(a.q.id, a.key);
          const hit = reused.get(a.key);
          if (hit) {
            reusedFrom.set(a.q.id, hit.id);
            answers[a.q.id] = hit.answer;
          } else {
            callQuestions.push(a.q);
            askedQuestions += 1;
          }
        }
      }
    }
    return { layer: layer.name, callItems, callQuestions, itemIds, skipped };
  });
  const goalHit = reused.get(goalKey);
  if (goalHit) {
    reusedFrom.set(goalQ.id, goalHit.id);
    keys.set(goalQ.id, goalKey);
    answers[goalQ.id] = goalHit.answer;
  } else {
    const first = work[0];
    if (first) {
      first.callQuestions = [goalQ, ...first.callQuestions];
      keys.set(goalQ.id, goalKey);
    }
  }
  const planned = work.map(({ layer, callItems, callQuestions, itemIds, skipped }) => {
    if (!callQuestions.length) return { layer, call: null, itemIds, skipped };
    const notes = [];
    const hasGoal = callQuestions[0] === goalQ;
    const state = { ...hasGoal ? { goal: redact(request.side.goal) } : {}, items: itemsState(callItems, notes) };
    return { layer, call: { state, questions: callQuestions }, itemIds, skipped };
  });
  return { layers, items, planned, keys, reusedFrom, answers, askedQuestions };
}
function planNeedsBudget(plan) {
  return plan.planned.some((p) => p.call !== null);
}
async function runSweep(ctx, verb, plan) {
  const skippedIds = new Set(plan.planned.flatMap((p) => p.skipped));
  const askedIds = new Set(plan.planned.flatMap((p) => p.itemIds));
  const reusedItemIds = /* @__PURE__ */ new Set();
  for (const qid of plan.reusedFrom.keys()) {
    const at = qid.lastIndexOf("#");
    if (at > 0) reusedItemIds.add(qid.slice(0, at));
  }
  const statusOf = (id) => {
    if (skippedIds.has(id)) return "skipped";
    if (askedIds.has(id)) return "asked";
    if (reusedItemIds.has(id)) return "reused";
    return "none";
  };
  const calls = plan.planned.map((p) => p.call).filter((c) => c !== null);
  if (calls.length === 0) return { ok: true, value: { answers: plan.answers, costUsd: 0, costEstimated: false, statusOf } };
  const asked2 = await askAll(ctx, verb, calls);
  if (!asked2.ok) return asked2;
  return { ok: true, value: { answers: { ...plan.answers, ...asked2.value.answers }, costUsd: asked2.value.costUsd, costEstimated: asked2.value.costEstimated, statusOf } };
}
function sweepDryRun(plan, identity) {
  const calls = plan.planned.filter((p) => p.call !== null).length;
  const askedItems = plan.planned.reduce((n, p) => n + p.itemIds.length, 0);
  const skippedItems = plan.planned.reduce((n, p) => n + p.skipped.length, 0);
  return {
    exit: 0,
    text: dryRunText({
      calls,
      questions: plan.askedQuestions,
      items: plan.items.length,
      reused: plan.items.length - askedItems - skippedItems,
      route: identity.route,
      baseURL: identity.baseURL
    })
  };
}
function recordSweep(ctx, calls, costUsd, run) {
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

// src/verbs/drill.ts
var REDRILL_NEXT = "fix it, then run this drill again (unchanged items are reused, so it is nearly free)";
async function runOneSubjectProof(ctx, loaded, request, where, changeParent) {
  const evidence = readCodeEvidence(ctx.paths.root, where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, "drill") };
  const identity = providerIdentity(ctx.env);
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)]);
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });
  const answers = {};
  const reusedFrom = {};
  const toAsk = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push([q, k]);
    }
  }
  if (ctx.dryRun) {
    return { exit: 0, text: dryRunText({ calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL }) };
  }
  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;
  let costUsd;
  let costEstimated = false;
  let calls;
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call = { state: { goal: redact(request.side.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked2 = await askAll(ctx, "drill", [call]);
    if (!asked2.ok) return asked2.result;
    Object.assign(answers, asked2.value.answers);
    costUsd = asked2.value.costUsd;
    costEstimated = asked2.value.costEstimated;
    calls = 1;
  }
  const keys = {};
  for (const [q, k] of keyed) keys[q.id] = k;
  const slots = request.side.categories.filter((c) => c.questions[0]?.kind === "yesno").flatMap((c) => c.questions.map((q) => ({ pos: q.n, reverse: c.pass === "yes", p: answers[String(q.n)].p })));
  const consensus = computeConsensus(slots).consensus;
  const subject = gradeSubject(request.side.categories, answers);
  const escalate = consensus !== "STRONG" || request.side.depth === "thorough" || loaded.notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE));
  const oneSubjectNext = (gate, id) => gate === "pass" ? "act on it" : `fix it, then sidewise change --parent ${changeParent(id)} --compare <before>..<after>`;
  const reusedRunIds = reusedIds(reusedFrom);
  const response = (id, budget) => respondText(
    subjectSide(id, subject.gate, subject, [
      ["consensus", consensus],
      ["escalate", escalate],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ]),
    wiseRecorded(request.wise),
    oneSubjectNext(subject.gate, id),
    commonNotes(
      [...loaded.notes, ...evidence.evidence.notes, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      budget,
      ctx.provider.adapter
    )
  );
  const run = {
    verb: "drill",
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: [...where],
    parent: request.side.parent,
    from: request.side.from,
    compare: null,
    wise: request.wise,
    ask: { categories: request.side.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL
  };
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
async function runDrill(text, ctx) {
  const loaded = loadRequest(text, "drill");
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const parent = findRun(ctx.paths, request.side.parent);
  if (!parent) return { exit: 2, text: `\u2716 side.parent: ${request.side.parent} is not in the ledger \u2192 check the id` };
  if (!isContractRun(parent)) return { exit: 2, text: `\u2716 side.parent: ${parent.id} predates the YAML contract \u2192 run class or scan again` };
  if (parent.items !== null) {
    const itemRec = parent.items[request.side.from];
    if (!itemRec) {
      return {
        exit: 2,
        text: `\u2716 side.from: "${clip(request.side.from, 40)}" is not an item ${parent.id} listed \u2192 use one of: ${clip(Object.keys(parent.items).join(", "), 80)}`
      };
    }
    if (!request.side.over) {
      if (!itemRec.unit) {
        return {
          exit: 2,
          text: `\u2716 side.from: "${clip(request.side.from, 40)}" has no code \u2192 add over: with the next layer down, or drill an item scan found (sidewise template drill --parent ${parent.id} --from ${request.side.from})`
        };
      }
      return runOneSubjectProof(ctx, loaded, request, [`${itemRec.unit.path}:${itemRec.unit.lines}`], (id) => id);
    }
    const from = request.side.from;
    const name = from.includes("/") ? from.slice(from.lastIndexOf("/") + 1) : from;
    const parentId = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : null;
    let itemText = name;
    if (itemRec.unit) {
      const read2 = readUnit(ctx.paths.root, itemRec.unit);
      if (!read2.ok) return { exit: 2, text: `\u2716 side.from: the code has changed since ${parent.id} (${read2.error}) \u2192 run scan again` };
      itemText = read2.text;
    }
    const root = { id: from, layer: itemRec.layer, name, parent: parentId, fill: itemRec.fill, text: itemText, ...itemRec.unit ? { unit: itemRec.unit } : {} };
    if (!itemRec.unit) {
      const badLayer = firstStringLayer(request.side.over);
      if (badLayer) {
        return {
          exit: 2,
          text: `\u2716 side.over.${badLayer}: "${clip(from, 40)}" is an idea, not code \u2192 give ${badLayer} as a list of items (there is nothing to split with each)`
        };
      }
    }
    const notes = [];
    const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
    const identity = providerIdentity(ctx.env);
    const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, itemRec.unit ? { resolve: createCodeResolver(ctx.paths.root, notes), root } : { root });
    if (ctx.dryRun) return sweepDryRun(plan, identity);
    const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
    if (!pre.ok) return pre.result;
    const swept = await runSweep(ctx, "drill", plan);
    if (!swept.ok) return swept.result;
    const { answers, costUsd, costEstimated, statusOf } = swept.value;
    const categoriesOf = (layer) => request.side.layers.find((l) => l.name === layer)?.categories ?? [];
    const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);
    const goalAnswer = answers["goal"];
    const goalGrade = goalGate(goalAnswer.p);
    const gate = sweepGate(goalGrade, grades);
    const graded = [...grades.values()].filter((g) => g.status === "asked" || g.status === "reused");
    const worst = worstFirst(grades.values());
    const failing = m(...worst.map((g) => sweepEntry(g)));
    const passing = graded.filter((g) => g.ownGate === "pass").length;
    const calls = plan.planned.filter((p) => p.call !== null).length;
    const items = {};
    for (const it of plan.items) {
      const g = grades.get(it.id);
      items[it.id] = {
        layer: it.layer,
        fill: it.fill,
        ...it.unit ? { unit: it.unit } : {},
        status: statusOf(it.id),
        gate: g.gate,
        categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate]))
      };
    }
    const response = (id, budget) => respondText(
      m(["id", id], ["gate", gate], ["goal", m(["gate", goalGrade], ["p", goalAnswer.p])], ["failing", failing], ["passing", passing]),
      wiseRecorded(request.wise),
      worst.length ? REDRILL_NEXT : sweepNext(id, gate, worst, graded, "act on it"),
      commonNotes(
        [...loaded.notes, ...notes, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
        `${calls} call${calls === 1 ? "" : "s"} \xB7 ${plan.askedQuestions} question${plan.askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
        ctx.provider.adapter
      )
    );
    const run = {
      verb: "drill",
      actor: actorOf(ctx),
      task: ctx.env.SIDEWISE_TASK?.trim() || null,
      goal: request.side.goal,
      depth: request.side.depth ?? null,
      where: [],
      parent: request.side.parent,
      from: request.side.from,
      compare: null,
      wise: request.wise,
      ask: { categories: [], layers: request.side.layers },
      over: request.side.over,
      items,
      answers,
      keys: Object.fromEntries(plan.keys),
      reusedFrom: Object.fromEntries(plan.reusedFrom),
      categories: {},
      gate,
      goalGate: goalGrade,
      goalP: goalAnswer.p,
      consensus: null,
      response,
      notes: [],
      adapter: ctx.provider.adapter,
      model: ctx.provider.model,
      costUsd: costUsd ?? null,
      calls,
      route: identity.route,
      baseURL: identity.baseURL
    };
    return recordSweep(ctx, calls, costUsd, run);
  }
  if (request.side.over) return { exit: 2, text: `\u2716 side.over: ${parent.id} wasn't a sweep \u2192 remove over` };
  if (!parent.ask.categories.some((c) => c.name === request.side.from)) {
    return {
      exit: 2,
      text: `\u2716 side.from: "${clip(request.side.from, 40)}" is not a category of ${parent.id} \u2192 use one of: ${parent.ask.categories.map((c) => c.name).join(", ")}`
    };
  }
  return runOneSubjectProof(ctx, loaded, request, parent.where, () => request.side.parent);
}

// src/verbs/loop.ts
async function runLoop(text, ctx) {
  const loaded = loadRequest(text, "loop");
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env);
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false);
  if (ctx.dryRun) return sweepDryRun(plan, identity);
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;
  const ran = await runSweep(ctx, "loop", plan);
  if (!ran.ok) return ran.result;
  const { answers, costUsd, costEstimated, statusOf } = ran.value;
  const categoriesOf = (layer) => request.side.layers.find((l) => l.name === layer).categories;
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);
  const goalAnswer = answers["goal"];
  const goal = goalAnswer ? goalGate(goalAnswer.p) : "pass";
  const gate = sweepGate(goal, grades);
  const failingIds = plan.items.filter((i) => grades.get(i.id).ownGate !== "pass").map((i) => i.id);
  const failing = m(...failingIds.map((id) => sweepEntry(grades.get(id))));
  const passing = plan.items.filter((i) => grades.get(i.id).gate === "pass").map((i) => i.id);
  const graded = [...grades.values()].filter((g) => g.status === "asked" || g.status === "reused");
  const worst = worstFirst(graded);
  const calls = plan.planned.filter((p) => p.call).length;
  const items = {};
  for (const it of plan.items) {
    const g = grades.get(it.id);
    items[it.id] = {
      layer: it.layer,
      fill: it.fill,
      ...it.unit ? { unit: it.unit } : {},
      status: g.status,
      gate: g.gate,
      categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate]))
    };
  }
  const response = (id, budget) => respondText(
    m(["id", id], ["gate", gate], ["goal", m(["gate", goal], ["p", goalAnswer?.p ?? 0])], ["failing", failing], ["passing", passing]),
    wiseRecorded(request.wise),
    sweepNext(id, gate, worst, graded, "act on it"),
    commonNotes(
      [...loaded.notes, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      `${calls} call${calls === 1 ? "" : "s"} \xB7 ${plan.askedQuestions} question${plan.askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
      ctx.provider.adapter
    )
  );
  const run = {
    verb: "loop",
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: request.side.where,
    parent: null,
    from: null,
    compare: null,
    wise: request.wise,
    ask: { categories: [], layers: request.side.layers },
    over: request.side.over,
    items,
    answers,
    keys: Object.fromEntries(plan.keys),
    reusedFrom: Object.fromEntries(plan.reusedFrom),
    categories: {},
    gate,
    goalGate: goal,
    goalP: goalAnswer?.p ?? null,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL
  };
  return recordSweep(ctx, calls, costUsd, run);
}

// src/verbs/scan.ts
var ENTRYPOINT_GLOBS = ["server.js", "app.js", "index.js", "main.js", "config/**", ".env*"];
function unlookedEntrypoints(root, items) {
  const touched = new Set(items.flatMap((i) => i.unit ? [i.unit.path] : []));
  const missed = [...new Set(ENTRYPOINT_GLOBS.flatMap((pattern) => expandGlob(root, pattern).files))].filter((f) => !touched.has(f));
  if (!missed.length) return void 0;
  return `entrypoints/config outside over: ${missed.join(", ")} \u2014 add them to over: file if they matter here`;
}
async function runScan(text, ctx) {
  const loaded = loadRequest(text, "scan");
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const notes = [];
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env);
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, { resolve: createCodeResolver(ctx.paths.root, notes) });
  if (ctx.dryRun) return sweepDryRun(plan, identity);
  const entrypointNote = unlookedEntrypoints(ctx.paths.root, plan.items);
  if (entrypointNote) notes.push(entrypointNote);
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;
  const swept = await runSweep(ctx, "scan", plan);
  if (!swept.ok) return swept.result;
  const { answers, costUsd, costEstimated, statusOf } = swept.value;
  const categoriesOf = (layer) => request.side.layers.find((l) => l.name === layer)?.categories ?? [];
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);
  const goalAnswer = answers["goal"];
  const goalGrade = goalGate(goalAnswer.p);
  const gate = sweepGate(goalGrade, grades);
  const graded = [...grades.values()].filter((g) => g.status === "asked" || g.status === "reused");
  const worst = worstFirst(grades.values());
  const failing = m(...worst.map((g) => sweepEntry(g)));
  const passing = graded.filter((g) => g.ownGate === "pass").length;
  const reused = graded.filter((g) => g.status === "reused").length;
  const scanned = m(...plan.layers.map((l) => [l, plan.items.filter((i) => i.layer === l).length]));
  const calls = plan.planned.filter((p) => p.call !== null).length;
  const items = {};
  for (const it of plan.items) {
    const g = grades.get(it.id);
    items[it.id] = {
      layer: it.layer,
      fill: it.fill,
      ...it.unit ? { unit: it.unit } : {},
      status: statusOf(it.id),
      gate: g.gate,
      categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate]))
    };
  }
  const response = (id, budget) => respondText(
    m(
      ["id", id],
      ["gate", gate],
      ["goal", m(["gate", goalGrade], ["p", goalAnswer.p])],
      ["scanned", scanned],
      ["failing", failing],
      ["passing", passing],
      ["reused", reused]
    ),
    wiseRecorded(request.wise),
    sweepNext(id, gate, worst, graded, "act on it"),
    commonNotes(
      [...loaded.notes, ...notes, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      `${calls} call${calls === 1 ? "" : "s"} \xB7 ${plan.askedQuestions} question${plan.askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
      ctx.provider.adapter
    )
  );
  const run = {
    verb: "scan",
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: [],
    parent: null,
    from: null,
    compare: null,
    wise: request.wise,
    ask: { categories: [], layers: request.side.layers },
    over: request.side.over,
    items,
    answers,
    keys: Object.fromEntries(plan.keys),
    reusedFrom: Object.fromEntries(plan.reusedFrom),
    categories: {},
    gate,
    goalGate: goalGrade,
    goalP: goalAnswer.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL
  };
  return recordSweep(ctx, calls, costUsd, run);
}

// src/verbs/template.ts
var import_yaml2 = __toESM(require_dist(), 1);
import { readFileSync as readFileSync13 } from "node:fs";
import path16 from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_PACKAGE_DIR = path16.join(path16.dirname(fileURLToPath(import.meta.url)), "..", "..");
function drillSampleFile(parent, paths) {
  const run = paths && findRun(paths, parent);
  if (run && isContractRun(run) && run.items === null) return "drill-subject.yaml";
  return "drill.yaml";
}
function fromFile(from, flags) {
  let raw;
  try {
    raw = readFileSync13(from, "utf8");
  } catch (e) {
    const code = e.code;
    const shown2 = clip(from, 60);
    return { exit: 2, text: `\u2716 template: --from "${shown2}" ${code === "ENOENT" ? "not found" : "cannot be read"} \u2192 check the path` };
  }
  let doc;
  try {
    doc = (0, import_yaml2.parseDocument)(raw);
  } catch {
    return { exit: 2, text: `\u2716 template: --from "${clip(from, 60)}" is not valid YAML \u2192 point at a Sidewise request file` };
  }
  if (!doc.has("side")) return { exit: 2, text: `\u2716 template: --from "${clip(from, 60)}" has no side: block \u2192 point at a Sidewise request file` };
  if (flags.goal !== void 0) doc.setIn(["side", "goal"], flags.goal);
  if (flags.where !== void 0) doc.setIn(["side", "where"], flags.where);
  return { exit: 0, text: doc.toString() };
}
function runTemplate(target, flags = {}, paths, packageDir = DEFAULT_PACKAGE_DIR) {
  if (!VERBS.includes(target)) return { exit: 2, text: `\u2716 template: "${clip(target, 30)}" is not a verb \u2192 one of ${VERBS.join(", ")}` };
  if (flags.parent !== void 0) {
    if (target !== "drill") return { exit: 2, text: `\u2716 template: --parent only applies to drill \u2192 sidewise template ${target}` };
    if (flags.from === void 0) {
      return { exit: 2, text: "\u2716 template drill: needs both --parent and --from, or neither \u2192 sidewise template drill --parent SW-#### --from <item or category>" };
    }
    if (flags.where !== void 0 || flags.goal !== void 0) {
      return { exit: 2, text: "\u2716 template: --where/--goal don't apply with --parent \u2192 they overlay a checklist read from --from <request.yaml> instead" };
    }
    const file = drillSampleFile(flags.parent, paths);
    const raw = readFileSync13(path16.join(packageDir, "skills", "sidewise", "templates", file), "utf8");
    const doc = (0, import_yaml2.parseDocument)(raw);
    doc.setIn(["side", "parent"], flags.parent);
    doc.setIn(["side", "from"], flags.from);
    return { exit: 0, text: doc.toString() };
  }
  if (flags.from !== void 0) return fromFile(flags.from, flags);
  if (flags.where !== void 0 || flags.goal !== void 0) {
    return { exit: 2, text: `\u2716 template: --where/--goal need --from \u2192 sidewise template ${target} --from <request.yaml>` };
  }
  return { exit: 0, text: readFileSync13(path16.join(packageDir, "skills", "sidewise", "templates", `${target}.yaml`), "utf8") };
}

// src/verbs/view.ts
import path17 from "node:path";
var REQUEST_MODE = /^side\s*:/mu;
function runLine(r, outcome) {
  const rehearsal = isRehearsal(r.adapter) ? " \xB7 rehearsal" : "";
  const line3 = isRun(r) ? `${r.id} ${r.ts.slice(0, 10)} ${r.verb} L${r.level} ${r.consensus} ${r.verdict} "${clip(r.focus, 48)}" \xB7 ${outcome}` : `${r.id} ${r.ts.slice(0, 10)} ${r.verb} ${r.depth ?? "-"} ${r.gate} "${clip(r.goal, 48)}" \xB7 ${outcome}`;
  return `${clip(line3, 120 - rehearsal.length)}${rehearsal}`;
}
var tagsMatch = (r, place) => {
  if (isRun(r)) return r.tags.includes(place);
  return isContractRun(r) && r.ask.layers.some((l) => l.categories.some((c) => c.tags.includes(place)));
};
var pathMatches = (p, place) => p === place || p.startsWith(`${place}/`);
function whereMatches(r, place) {
  if (isRun(r)) return r.where.some((w) => pathMatches(w.path, place));
  if (r.where.some((w) => pathMatches(stripLines(w), place))) return true;
  return isContractRun(r) && !!r.items && Object.values(r.items).some((it) => !!it.unit && pathMatches(it.unit.path, place));
}
function toPlace(target, root) {
  if (hasControlChars(target)) return { stop: "\u2716 view: the target has control characters \u2192 use a folder, a tag, or SW-####" };
  if (!path17.isAbsolute(target) && !target.split(/[\\/]/).includes("..")) return { place: target.replace(/^\.\//, "").replace(/\/+$/, "") || "." };
  const rel = path17.relative(root, path17.resolve(root, target));
  if (rel.startsWith("..") || path17.isAbsolute(rel)) return { stop: `\u2716 view: "${clip(target, 60)}" is outside the project \u2192 use a folder inside it, a tag, or SW-####` };
  return { place: rel.split(path17.sep).join("/") || "." };
}
function renderPlace(place, hits, outcomeOf, limit) {
  if (!hits.length) return { exit: 0, text: `sidewise view ${clip(place, 60)} \xB7 no runs yet \u2192 "sidewise class <request>" starts one` };
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  let rehearsal = 0;
  for (const r of hits) {
    if (isRehearsal(r.adapter)) rehearsal += 1;
    else counts[outcomeOf(r.id) ?? "open"] += 1;
  }
  const head = `sidewise view ${clip(place, 60)} \xB7 ${hits.length} run${hits.length === 1 ? "" : "s"} \xB7 held ${counts.held} \xB7 overruled ${counts.overruled} \xB7 failed ${counts.failed} \xB7 open ${counts.open}${rehearsal ? ` \xB7 rehearsal ${rehearsal}` : ""}`;
  const shown2 = hits.slice(-limit).reverse();
  const older = hits.length - shown2.length;
  return {
    exit: 0,
    text: [head, ...shown2.map((r) => runLine(r, outcomeOf(r.id) ?? "open")), ...older ? [`\u2026 ${older} older \u2192 raise the level to see more`] : []].join("\n")
  };
}
var GATE_RANK = { fail: 0, unsure: 1, pass: 2 };
function renderSummary(scope, hits) {
  const latest = /* @__PURE__ */ new Map();
  for (const r of hits) {
    if (!isContractRun(r)) continue;
    for (const w of r.where.map(stripLines)) latest.set(w, r);
    for (const p of sweepPlaces(r)) if (p.kind === "where") latest.set(p.val, r);
  }
  if (!latest.size) return { exit: 0, text: `sidewise view ${clip(scope, 60)} --summary \xB7 no runs yet \u2192 "sidewise class <request>" starts one` };
  const rows = [...latest.entries()].sort(([pa, ra], [pb, rb]) => GATE_RANK[ra.gate] - GATE_RANK[rb.gate] || pa.localeCompare(pb));
  return {
    exit: 0,
    text: [
      `sidewise view ${clip(scope, 60)} --summary \xB7 ${rows.length} place${rows.length === 1 ? "" : "s"}`,
      ...rows.map(([place, r]) => `${clip(place, 60)} \xB7 ${r.verb} ${r.gate} \xB7 ${r.id} "${clip(r.goal, 48)}"`)
    ].join("\n")
  };
}
function byPlaceFullScan(place, paths, limit, summary) {
  const records = readLedger(paths, { partialTail: true });
  const runs = records.filter((r) => isRun(r) || isContractRun(r));
  const hits = runs.filter((r) => place === "." || tagsMatch(r, place) || whereMatches(r, place));
  if (summary) return renderSummary(place, hits);
  return renderPlace(place, hits, (id) => latestOutcome(records, id) ?? void 0, limit);
}
function byPlaceIndexed(place, paths, limit, summary) {
  return withIndex(
    paths,
    (handle) => {
      const hits = [];
      for (const { offset } of handle.placeCandidates(place)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && (isRun(rec) || isContractRun(rec)) && (tagsMatch(rec, place) || whereMatches(rec, place))) hits.push(rec);
      }
      if (summary) return renderSummary(place, hits);
      const outcomes = handle.outcomesFor(hits.map((r) => r.id));
      return renderPlace(place, hits, (id) => outcomes.get(id), limit);
    },
    { readOnly: true }
  );
}
function byPlace(place, paths, limit, summary) {
  return place === "." ? byPlaceFullScan(place, paths, limit, summary) : byPlaceIndexed(place, paths, limit, summary);
}
function runAt(paths, handle, id) {
  const offset = handle.findOffset(id);
  if (offset === void 0) return void 0;
  const rec = readRecordAt(paths.log, offset);
  return rec && (isRun(rec) || isContractRun(rec)) && rec.id === id ? rec : void 0;
}
function childrenAt(paths, handle, parentId) {
  const out = [];
  for (const { offset } of handle.childrenOf(parentId)) {
    const rec = readRecordAt(paths.log, offset);
    if (rec && (isRun(rec) || isContractRun(rec)) && rec.parent === parentId) out.push(rec);
  }
  return out;
}
function detailLines(self, level) {
  if (level < 2 || !isContractRun(self)) return [];
  const lines = [];
  const cats = Object.entries(self.categories);
  if (cats.length) lines.push(`  categories: ${cats.map(([n, g]) => `${n}=${g}`).join(", ")}`);
  else if (self.items) {
    const items = Object.values(self.items);
    const failing = items.filter((it) => it.gate !== "pass").length;
    lines.push(`  items: ${items.length} (${failing} failing)`);
  }
  if (level >= 3) {
    if (self.notes.length) lines.push(`  notes: ${self.notes.join("; ")}`);
    lines.push(`  adapter: ${self.adapter} \xB7 model: ${self.model}`);
  }
  return lines;
}
function byId(id, paths, level, limit) {
  return withIndex(
    paths,
    (handle) => {
      const self = runAt(paths, handle, id);
      if (!self) return { exit: 2, text: `\u2716 view: ${id} is not in the ledger \u2192 "sidewise view <folder>" lists recent runs` };
      const up = [];
      let cursor = self.parent ? runAt(paths, handle, self.parent) : void 0;
      while (cursor && up.length < limit) {
        up.unshift(cursor);
        cursor = cursor.parent ? runAt(paths, handle, cursor.parent) : void 0;
      }
      const down = [];
      const queue = [id];
      while (queue.length && down.length < limit) {
        const parent = queue.shift();
        for (const r of childrenAt(paths, handle, parent)) {
          if (down.length >= limit) break;
          down.push(r);
          queue.push(r.id);
        }
      }
      const outcomes = handle.outcomesFor([...up, self, ...down].map((r) => r.id));
      const outcomeOf = (r) => outcomes.get(r.id) ?? "open";
      return {
        exit: 0,
        text: [
          `sidewise view ${id} \xB7 lineage ${up.length} up \xB7 ${down.length} down`,
          ...up.map((r) => `\u2191 ${runLine(r, outcomeOf(r))}`),
          `\u25B6 ${runLine(self, outcomeOf(self))}`,
          ...detailLines(self, level),
          ...down.map((r) => `\u2193 ${runLine(r, outcomeOf(r))}`)
        ].join("\n")
      };
    },
    { readOnly: true }
  );
}
function categoryEntry2(name, runsHere) {
  let runs = 0;
  let pass = 0;
  let fail2 = 0;
  let last;
  for (const r of runsHere) {
    const gate = r.categories[name];
    if (gate === void 0) continue;
    runs += 1;
    if (gate === "pass") pass += 1;
    else if (gate === "fail") fail2 += 1;
    last = r.id;
  }
  return [name, runs ? m(["runs", runs], ["pass", pass], ["fail", fail2], ["last", last]) : m(["runs", 0])];
}
function runsForPlaces(paths, places) {
  return withIndex(
    paths,
    (handle) => {
      const offsets = /* @__PURE__ */ new Set();
      for (const place of places) for (const c of handle.placeCandidates(place)) offsets.add(c.offset);
      const hits = [];
      for (const offset of [...offsets].sort((a, b) => a - b)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && isContractRun(rec) && places.some((place) => whereMatches(rec, place))) hits.push(rec);
      }
      return hits;
    },
    { readOnly: true }
  );
}
function runRequestMode(text, ctx) {
  const loaded = loadRequest(text, "view");
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const evidence = readCodeEvidence(ctx.paths.root, request.side.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, "view") };
  const places = request.side.where.map(stripLines);
  const runsHere = runsForPlaces(ctx.paths, places);
  const categoryNames = request.side.categories.length ? request.side.categories.map((c) => c.name) : [...new Set(runsHere.flatMap((r) => Object.keys(r.categories)))];
  let reuse2;
  if (request.side.categories.length > 0) {
    const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
    const evidenceStr = subjectEvidence(evidence.evidence.files);
    const keys = questions.map((q) => answerKey(evidenceStr, q));
    const who = providerIdentity(ctx.env);
    reuse2 = exactReuse(ctx.paths, who, keys);
  }
  const next = reuse2 ? `sidewise view ${reuse2}` : "sidewise class";
  const side = m(
    ["view", request.side.where.join(", ")],
    ...reuse2 ? [["reuse", reuse2]] : [],
    ["runs", runsHere.length],
    ["categories", m(...categoryNames.map((name) => categoryEntry2(name, runsHere)))]
  );
  return { exit: 0, text: respondText(side, wiseRecorded(null), next, ["free"]) };
}
function runView(arg, level, ctx, content, summary = false) {
  const probe = (content ?? arg).trim();
  if (REQUEST_MODE.test(probe) || probe.startsWith("{")) return runRequestMode(content ?? arg, ctx);
  const at = RUN_ID.test(arg) ? void 0 : toPlace(arg, ctx.paths.root);
  if (at && "stop" in at) return { exit: 2, text: at.stop };
  const limit = level * 10;
  return at ? byPlace(at.place, ctx.paths, limit, summary) : byId(arg, ctx.paths, level, limit);
}

// src/help/rules.ts
var list2 = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}` : xs[0];
var RULES = [
  {
    text: `depth: quick|standard|thorough = exactly ${DEPTH_COUNT.quick}, ${DEPTH_COUNT.standard} or ${DEPTH_COUNT.thorough} yes/no questions (a sweep: at most that many items per layer)`,
    in: ["card", "authoring", "class", "scan", "loop"]
  },
  { text: `where: at most 5 path entries \u2014 this is all the code a run sees`, in: ["card", "authoring", "class", "view"] },
  { text: `pass: yes clears at P(yes) >= 0.70; pass: no clears at P(yes) <= 0.30; in between is unsure`, in: ["card", "verdict"] },
  { text: `every question in a category must point the same way as its pass:`, in: ["authoring"] },
  { text: `wise.why is one of ${list2(WHYS)}`, in: ["wise"] },
  { text: `wise.area is one of ${list2(AREAS)}`, in: ["wise"] },
  { text: `wise.stage is one of ${list2(STAGES)}`, in: ["wise"] },
  { text: `wise.change is one of ${list2(CHANGES)}`, in: ["wise"] },
  { text: `wise.risk is one of ${list2(RISKS)}`, in: ["wise"] },
  { text: `at most ${MAX_EXTRAS} scale or choice questions per request`, in: ["authoring"] }
];
function ruleLines(tag) {
  return RULES.filter((r) => r.in.includes(tag)).map((r) => `- ${r.text}.`);
}

// src/help/card.ts
function card() {
  return [
    "Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict \u2014 evidence,",
    "never a command. Think of it as a citable second opinion (SW-0017), not a linter.",
    "",
    "## Invoke it",
    'In Claude Code: call the `sidewise` MCP tool directly \u2014 same args as the CLI (e.g. args: ["class", "-"]),',
    "the request YAML as stdin. There is no CLI on PATH; don't look for one. Elsewhere: use `sidewise` if it's",
    "on PATH, else `npx --no-install sidewise`; if neither works, tell the user to run",
    '"npx @mvpscale/sidewise init" and stop.',
    "",
    "## Pick your verb",
    "| Grid | Know | Judge | Prove |",
    "|---|---|---|---|",
    "| Side \u2014 solve it with what's proven   | view (free) | class (1 call) | change (~1 call) |",
    "| Wise \u2014 find what's new, and learn it | scan (1 call) | drill (1 call) | loop (1 call/layer) |",
    "",
    "## The contract (memorize \u2014 these cause most first-try rejects)",
    ...ruleLines("card"),
    "- every question in a category must point the same way as its pass: (one reversed question fails the whole gate).",
    "",
    "## Read the verdict",
    "Read `goal` (+ any `choice`) first, then the failing category, then follow the `next:` line. A stop always",
    "reads `\u2716 field: problem \u2192 fix` \u2014 the error text names exactly what to change.",
    "",
    "Go deeper: `sidewise help <verb>` (view, class, change, scan, drill, loop) or `sidewise help <topic>`",
    "(authoring, verdict, wise, reuse). `sidewise template <verb>` prints a commented, filled-in sample."
  ].join("\n");
}

// src/help/topics.ts
var TOPICS = ["authoring", "verdict", "wise", "reuse"];
function authoring() {
  return [
    "## authoring",
    "How to write a request that survives its first try. Under the hood a yes/no question asks the classifier's",
    "Noul primitive, a `scale:` asks Score, and a `choice:` asks Choice \u2014 one narrow, coherent judgment per",
    "question, so keep each one to a single thing.",
    ...ruleLines("authoring"),
    "- `where:` is ALL the code a run sees \u2014 nothing outside it exists, however obvious the wiring seems.",
    '- phrase the goal as the exact claim you need proven ("this handler is safe to merge", not "review this handler") \u2014 wording changes the verdict, on purpose.',
    "- a `{blank}` in a sweep question is filled in per item; it must name that layer or one above it.",
    "- a question's number is a label for the response only \u2014 the model never sees it, so the question text itself has to carry its full meaning on its own.",
    '- a `scale:` level should name a concrete situation that stands on its own ("crashes in production"), not a bare relative point ("high").',
    "- give a `choice:` a genuine no-match option (e.g. `none`) whenever the code might fit none of the others.",
    "- ask everything you need about this evidence in one request \u2014 a second call (`drill`) is for when you need to look at something new, not more angles on what you already sent."
  ].join("\n");
}
function verdict() {
  return [
    "## verdict",
    "How to read what comes back:",
    ...ruleLines("verdict"),
    "- `need:` on a category: `all` (default, every answer clears the bar) \xB7 `most` (>= 2/3 clear, none a clear miss) \xB7 `any` (at least one clears).",
    "- the gate passes only when the goal and every category pass; in a sweep, an item passes only when its own categories and every child does too.",
    "- `consensus` (STRONG \xB7 SPLIT \xB7 WEAK): whether the yes/no answers agree with each other \u2014 shown on `class`, and `drill` on a one-subject parent; a sweep or `change` response never computes it.",
    "- `escalate: true` on non-STRONG consensus, `depth: thorough`, or a goal that reads as irreversible (delete, deploy, drop, pay, migrate, secret, credential) \u2014 don't act on this alone.",
    "- a probability near 0.50 means the evidence points both ways about equally, not a medium-strength yes \u2014 that's exactly why it lands in `unsure` rather than a weak pass.",
    "- the answer's shape is guaranteed (a number in range, a level that's really one of yours) \u2014 whether it's the RIGHT number is what consensus, escalate and your own reading are for, not the schema.",
    "- a run can fail to answer for different reasons, and the exit code says which: a bad request never reaches the classifier (exit 2); a provider or ledger problem does (exit 1); a blocked budget never spends at all (exit 3) \u2014 read which one you got before treating a stop as `unsure`.",
    "- a stop always reads `\u2716 field: problem \u2192 fix`; run `sidewise help <verb>` when one doesn't make sense."
  ].join("\n");
}
function wise() {
  return [
    "## wise",
    "wise: is optional context that never reaches the classifier \u2014 it only shapes what the ledger learns:",
    "",
    "| field | closed values | what you get back |",
    "|---|---|---|",
    `| why    | ${WHYS.join(", ")} | why this run happened, for later pattern-mining |`,
    `| area   | ${AREAS.join(", ")} | which slice of the system it touched |`,
    `| stage  | ${STAGES.join(", ")} | where in the workflow it landed |`,
    `| change | ${CHANGES.join(", ")} | what kind of change was under review |`,
    `| risk   | ${RISKS.join(", ")} | how risky the change looked going in |`,
    "",
    ...ruleLines("wise"),
    "- every field is optional; the response always echoes back which ones were recorded as `wise: {recorded: [...]}`, or `{recorded: none}`."
  ].join("\n");
}
function reuse() {
  return [
    "## reuse",
    "The exact same question, asked of the exact same code, is answered for free from the ledger \u2014 no call, no",
    "spend, and the response says so. This is exact-match reuse: same evidence, same question text, same",
    "provider and model; nothing here is a semantic or fuzzy match.",
    "- `view <request-file>` checks this before you spend anything: it shows `reuse: SW-####` when the exact",
    "  question set was already asked on unchanged code.",
    "- a sweep (scan, loop, drill on a sweep parent) reuses per item: unchanged items cost nothing, and the",
    "  response counts how many were reused.",
    "- a fully-reused run should never be blocked by the spend cap, since it spends nothing \u2014 if you see that,",
    "  it's a bug, not a feature.",
    "- reuse keys on the evidence and the question's own text, not on how the answer is graded: moving a",
    "  category's `pass:` or `need:` re-grades the same free answer instead of re-asking the question."
  ].join("\n");
}
var BUILDERS = { authoring, verdict, wise, reuse };
function topicHelp(topic) {
  return BUILDERS[topic]();
}

// src/help/verbs.ts
var EXAMPLES = {
  view: "sidewise view src/handlers          # what does the ledger already know about this folder?\nsidewise view SW-0042               # this run's own lineage, up and down",
  class: [
    "side:",
    "  goal: This login handler is safe to merge   # phrase as the exact claim to prove",
    "  depth: quick                                # => exactly 10 yes/no below",
    "  where: [src/user.ts:1-3]                     # include the wiring, not just the handler",
    "  ask:",
    "    injection: {pass: no, 1: Is request text put into a query unvalidated?, ...}",
    "wise: {why: validate, area: auth}"
  ].join("\n"),
  change: "side:\n  goal: The injection fix works\n  parent: SW-0042\n  compare: {before: main, after: HEAD}",
  scan: [
    "side:",
    "  goal: Handlers don't trust request input",
    "  depth: quick",
    "  over: {file: src/handlers/*.ts, function: each}     # scan by file when the file itself is the unit",
    "  ask:",
    "    function:",
    "      injection: {pass: no, 1: Does {function} put request text straight into a query?}"
  ].join("\n"),
  drill: "sidewise template drill --parent SW-0060 --from src/handlers/user.ts/findUser   # follow next:, don't hand-author the ids",
  loop: [
    "side:",
    "  goal: The checkout redesign is sound",
    "  depth: quick",
    "  over:",
    "    part:                              # part and story are SIBLINGS, both under over:",
    "      - name: gateway",
    "        story: [guest checkout, saved cards]",
    "  ask:",
    "    story:",
    '      done: {pass: yes, 1: Is "{story}" testable against {part} as written?}   # asked of EVERY story'
  ].join("\n")
};
var SHARP = {
  view: ['a code file (not a request) is a place, not a request \u2014 view <folder>, ".", a tag, or SW-#### all work'],
  class: ["goal wording changes the verdict (that's a feature, not a bug) \u2014 phrase it as the claim you need proven"],
  change: [
    'the files must be committed at the ref you name (or use "worktree" for the working tree) \u2014 change runs git in the repo that actually holds them',
    "change replays the parent's own questions; it never takes ask: (use class for new questions)"
  ],
  scan: ["add a scale question to a layer to rank findings by severity, worst first, instead of an unordered map", "scan by file when the file itself is the unit that matters, not a function inside it"],
  drill: ["follow the `next:` line rather than hand-authoring parent/from \u2014 it already names the id and the category or item"],
  loop: [
    "a sub-layer (like story under part) is a SIBLING key under over:, never nested inside its parent item",
    'a story/part name is one word or kebab-case, at most 20 characters, and never contains "/"',
    "every question under a layer is asked of every item at that layer \u2014 phrase it so that holds for all of them"
  ]
};
var PURPOSE = {
  view: "Side x Know: what do we already know here? Free \u2014 it reads the ledger and never calls out.",
  class: "Side x Judge: does the evidence support this one goal? One call, one subject.",
  change: "Side x Prove: did the change work? It replays a parent run's questions on two states.",
  scan: "Wise x Know: where in this code should we look? A sweep across code, read by us.",
  drill: "Wise x Judge: why did this one thing fail? It goes down from one item in a parent run.",
  loop: "Wise x Prove: does this idea hold up? A sweep across layers of ideas the agent writes."
};
var WHEN = {
  view: "before any paid call, when entering unfamiliar code, or to find proven questions.",
  class: "a decision on one subject: merge, choose, triage, check a fix.",
  change: "after a fix, a refactor, a dependency bump, or to compare fix A with fix B.",
  scan: "a new codebase, a release check, a PR's changed files, or a vague bug with no location yet.",
  drill: "after a fail or unsure from class, scan, loop or change.",
  loop: "a design, a plan or a feature request before any code exists."
};
function verbHelp(verb) {
  return [
    `## ${verb}`,
    PURPOSE[verb],
    `When: ${WHEN[verb]}`,
    "",
    "Example:",
    EXAMPLES[verb],
    "",
    "Sharp rules:",
    ...SHARP[verb].map((s) => `- ${s}.`),
    ...ruleLines(verb)
  ].join("\n");
}

// src/help/index.ts
var HELP_TOPICS = TOPICS;
var isVerb = (s) => VERBS.includes(s);
var isTopic = (s) => TOPICS.includes(s);
function runHelp(target) {
  if (target === void 0 || target === "") return { exit: 0, text: card() };
  if (hasControlChars(target)) return { exit: 2, text: "\u2716 help: the target has control characters \u2192 use a verb or a topic name" };
  if (isVerb(target)) return { exit: 0, text: verbHelp(target) };
  if (isTopic(target)) return { exit: 0, text: topicHelp(target) };
  return {
    exit: 2,
    text: `\u2716 help: "${clip(target, 40)}" is not a verb or topic \u2192 one of ${VERBS.join(", ")}, or a topic: ${TOPICS.join(", ")}`
  };
}

// src/mcp/actor.ts
import { spawnSync as spawnSync2 } from "node:child_process";
function resolveMcpActor(cwd, spawn = spawnSync2) {
  const result = spawn("git", ["config", "user.name"], { cwd, encoding: "utf8" });
  const name = result.status === 0 && typeof result.stdout === "string" ? result.stdout.trim() : "";
  return name || "claude";
}

// src/cli.ts
var PACKAGE_DIR = path18.join(path18.dirname(fileURLToPath2(import.meta.url)), "..");
var LINES3 = {
  view: "sidewise view <folder | tag | SW-#### | request-file | -> [--level 1|2|3] [--summary]",
  class: "sidewise class <request-file | -> [--dry-run]",
  change: "sidewise change <request-file | -> [--dry-run]  \xB7  or: sidewise change --parent SW-#### --compare <before>..<after> [--dry-run]",
  scan: "sidewise scan <request-file | -> [--dry-run]",
  drill: "sidewise drill <request-file | -> [--dry-run]",
  loop: "sidewise loop <request-file | -> [--dry-run]",
  template: "sidewise template <view|class|change|scan|drill|loop> [--parent SW-#### --from <item-or-category>]  \xB7  or: --from <request.yaml> [--where <path>]... [--goal <text>]",
  help: `sidewise help [${VERBS.join("|")}|${HELP_TOPICS.join("|")}]`,
  outcome: "sidewise outcome <SW-####> held|overruled|failed --by <actor>",
  budget: "sidewise budget [show | reset | set --usd <n> --runs <n>]",
  doctor: "sidewise doctor",
  init: "sidewise init [--global | --user | --local] [--claude | --no-claude] [--scope user|project] [--key-stdin | --no-key] [--yes]",
  uninstall: "sidewise uninstall [--all] [--keep-key] [--keep-data] [--yes]",
  mcp: "sidewise mcp"
};
var USAGE = `new here? \u2192 sidewise init
usage:
${Object.values(LINES3).map((l) => `  ${l}`).join("\n")}`;
var isCommand = (c) => Object.hasOwn(LINES3, c);
var UsageStop = class extends Error {
  constructor(command, problem) {
    super(`\u2716 args: ${problem} \u2192 ${LINES3[command]}`);
    this.name = "UsageStop";
  }
};
var OUTCOMES = ["held", "overruled", "failed"];
var NO_PROJECT = '\u2716 project: no .sidewise or .git folder here or above \u2192 run inside a project, or "mkdir .sidewise" to start one here';
var MAX_REQUEST_BYTES = 1048576;
var TOO_BIG = '\u2716 request: larger than 1 MB \u2192 a request is a short text file; point "where:" at the code instead';
function finish(code, text) {
  return { exit: code, text: text.endsWith("\n") ? text : `${text}
` };
}
function args(command, config) {
  try {
    return parseArgs(config);
  } catch (e) {
    const code = e.code;
    const quoted = /'([^']*)'/.exec(e.message)?.[1] ?? "";
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") throw new UsageStop(command, `unknown flag ${clip(quoted, 40)}`);
    if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw new UsageStop(command, `${quoted.split(" ")[0]} needs a value`);
    if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") throw new UsageStop(command, `extra argument "${clip(quoted, 40)}"`);
    throw new UsageStop(command, "bad arguments");
  }
}
function positionalCount(command, positionals, min, max) {
  if (positionals.length < min) throw new UsageStop(command, "missing arguments");
  if (positionals.length > max) throw new UsageStop(command, `extra argument "${clip(positionals[max], 40)}"`);
}
function givenTwice(argv, names) {
  const name = names.find((n) => argv.filter((a) => a === `--${n}` || a.startsWith(`--${n}=`)).length > 1);
  return name === void 0 ? void 0 : `\u2716 --${name}: given twice \u2192 give it once`;
}
function readRequest(file, stdinSource) {
  if (hasControlChars(file)) return { stop: "\u2716 request: the file name has control characters \u2192 pass a plain path, or - to read stdin" };
  const shown2 = clip(file, 60);
  let bytes;
  try {
    if (file !== "-") {
      const st = statSync8(file);
      if (st.isDirectory()) return { stop: `\u2716 request: ${shown2} is a folder \u2192 pass a request file, or - to read stdin` };
      if (st.size > MAX_REQUEST_BYTES) return { stop: TOO_BIG };
    }
    bytes = file === "-" ? stdinSource() : readFileSync14(file);
  } catch (e) {
    const code = e.code;
    if (code === "ENOENT") return { stop: `\u2716 request: ${shown2} not found \u2192 check the path, or pass - to read stdin` };
    return { stop: `\u2716 request: cannot read ${shown2} (${code ?? "error"}) \u2192 check the path and its permissions` };
  }
  if (bytes.length > MAX_REQUEST_BYTES) return { stop: TOO_BIG };
  if (bytes.includes(0)) return { stop: `\u2716 request: ${file === "-" ? "stdin" : shown2} is binary, not text \u2192 write the request as YAML, starting "side:"` };
  return { text: bytes.toString("utf8") };
}
var BUDGET_EXAMPLE = "e.g. sidewise budget set --usd 5 --runs 500";
function cap(flag, raw) {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : `\u2716 budget: --${flag} must be a positive number, got "${raw}" \u2192 ${BUDGET_EXAMPLE}`;
}
var RUNNERS = { class: runClass, scan: runScan, drill: runDrill, loop: runLoop };
var providerExit = (e) => e instanceof JevConfigError ? e.exit : 1;
async function runSweptVerb(command, rest, paths, ctx) {
  const twice = givenTwice(rest, ["dry-run"]);
  if (twice) return finish(2, twice);
  const { values, positionals } = args(command, { args: rest, allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
  positionalCount(command, positionals, 1, 1);
  const read2 = readRequest(positionals[0], ctx.stdin);
  if ("stop" in read2) return finish(2, read2.stop);
  let provider;
  try {
    provider = selectProvider(ctx.env, { chaosState: path18.join(paths.dir, "chaos.json") });
  } catch (e) {
    return finish(providerExit(e), e.message);
  }
  const r = await RUNNERS[command](read2.text, { paths, provider, env: ctx.env, dryRun: values["dry-run"] });
  return finish(r.exit, r.text);
}
async function dispatch(argv, ctx) {
  const [command = "", ...rest] = argv;
  if (command === "") return finish(2, USAGE);
  if (command === "--help" || command === "-h") return finish(0, USAGE);
  if (!isCommand(command)) {
    const later = argv.find(isCommand);
    if (command.startsWith("-") && later) throw new UsageStop(later, `"${clip(command, 40)}" comes before the command`);
    return finish(2, `\u2716 args: "${clip(command, 40)}" is not a command \u2192 use view, class, change, scan, drill, loop, template, help, outcome, budget, doctor, init, uninstall or mcp (sidewise --help)`);
  }
  if (command !== "doctor" && command !== "mcp") {
    const nodeStop = nodeVersionStop(ctx.nodeVersion);
    if (nodeStop) return finish(2, nodeStop);
  }
  if (command === "template") {
    const twice = givenTwice(rest, ["parent", "from", "goal"]);
    if (twice) return finish(2, twice);
    const { values, positionals } = args("template", {
      args: rest,
      allowPositionals: true,
      options: { parent: { type: "string" }, from: { type: "string" }, where: { type: "string", multiple: true }, goal: { type: "string" } }
    });
    positionalCount("template", positionals, 1, 1);
    const r = runTemplate(
      positionals[0],
      { parent: values.parent, from: values.from, where: values.where, goal: values.goal },
      resolvePaths(ctx.cwd, ctx.env),
      ctx.packageDir
    );
    return finish(r.exit, r.text);
  }
  if (command === "help") {
    const { positionals } = args("help", { args: rest, allowPositionals: true, options: {} });
    positionalCount("help", positionals, 0, 1);
    const r = runHelp(positionals[0]);
    return finish(r.exit, r.text);
  }
  if (command === "doctor") {
    const { positionals } = args("doctor", { args: rest, allowPositionals: true, options: {} });
    positionalCount("doctor", positionals, 0, 0);
    const r = runDoctor(ctx.env, resolvePaths(ctx.cwd, ctx.env), ctx.nodeVersion, {
      resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
      runner: ctx.runner,
      platform: ctx.platform
    });
    return finish(r.exit, r.text);
  }
  if (command === "mcp") {
    const { positionals } = args("mcp", { args: rest, allowPositionals: true, options: {} });
    positionalCount("mcp", positionals, 0, 0);
    await runMcpServer(
      ctx.io,
      (a, stdinText, project) => {
        const nodeStop = nodeVersionStop(ctx.nodeVersion);
        if (nodeStop) return Promise.resolve(finish(2, nodeStop));
        const env = { ...ctx.env };
        if (project) env.SIDEWISE_HOME = project;
        if (!env.SIDEWISE_ACTOR?.trim()) env.SIDEWISE_ACTOR = resolveMcpActor(project ?? ctx.cwd);
        return runCli(a, { ...ctx, env, stdin: () => Buffer.from(stdinText ?? "", "utf8") });
      },
      ctx.pkg.version
    );
    return { exit: 0, text: "" };
  }
  if (command === "init") {
    const twice = givenTwice(rest, ["scope"]);
    if (twice) return finish(2, twice);
    const { values, positionals } = args("init", {
      args: rest,
      allowPositionals: true,
      options: {
        global: { type: "boolean", default: false },
        user: { type: "boolean", default: false },
        local: { type: "boolean", default: false },
        claude: { type: "boolean", default: false },
        "no-claude": { type: "boolean", default: false },
        scope: { type: "string" },
        "key-stdin": { type: "boolean", default: false },
        "no-key": { type: "boolean", default: false },
        yes: { type: "boolean", default: false }
      }
    });
    positionalCount("init", positionals, 0, 0);
    if ([values.global, values.user, values.local].filter(Boolean).length > 1) {
      return finish(2, "\u2716 init: give at most one of --global, --user or --local");
    }
    if (values.claude && values["no-claude"]) return finish(2, "\u2716 init: give at most one of --claude or --no-claude");
    if (values["key-stdin"] && values["no-key"]) return finish(2, "\u2716 init: give at most one of --key-stdin or --no-key");
    if (values.scope !== void 0 && values.scope !== "user" && values.scope !== "project") {
      return finish(2, `\u2716 --scope: "${clip(values.scope, 20)}" is not user or project \u2192 use --scope user or --scope project`);
    }
    const flags = {
      mode: values.global ? "global" : values.user ? "user" : values.local ? "local" : void 0,
      claude: values.claude ? true : values["no-claude"] ? false : void 0,
      scope: values.scope,
      key: values["key-stdin"] ? "stdin" : values["no-key"] ? "no" : "ask",
      yes: values.yes
    };
    const r = await runInit(flags, {
      env: ctx.env,
      cwd: ctx.cwd,
      platform: ctx.platform,
      runner: ctx.runner,
      io: ctx.io,
      keyStdin: flags.key === "stdin" ? ctx.io.input : void 0,
      packageDir: ctx.packageDir,
      pkg: ctx.pkg,
      homeDir: ctx.homeDir
    });
    return finish(r.exit, r.text);
  }
  if (command === "uninstall") {
    const { values, positionals } = args("uninstall", {
      args: rest,
      allowPositionals: true,
      options: {
        all: { type: "boolean", default: false },
        "keep-key": { type: "boolean", default: false },
        "keep-data": { type: "boolean", default: false },
        yes: { type: "boolean", default: false }
      }
    });
    positionalCount("uninstall", positionals, 0, 0);
    const flags = { all: values.all, keepKey: values["keep-key"], keepData: values["keep-data"], yes: values.yes };
    const r = await runUninstall(flags, {
      env: ctx.env,
      cwd: ctx.cwd,
      platform: ctx.platform,
      runner: ctx.runner,
      io: ctx.io,
      homeDir: ctx.homeDir,
      pkgName: ctx.pkg.name
    });
    return finish(r.exit, r.text);
  }
  const paths = resolvePaths(ctx.cwd, ctx.env);
  if (!paths) return finish(2, NO_PROJECT);
  switch (command) {
    case "view": {
      const twice = givenTwice(rest, ["level"]);
      if (twice) return finish(2, twice);
      const { values, positionals } = args("view", {
        args: rest,
        allowPositionals: true,
        options: { level: { type: "string", default: "1" }, summary: { type: "boolean", default: false } }
      });
      positionalCount("view", positionals, 1, 1);
      if (!["1", "2", "3"].includes(values.level)) return finish(2, `\u2716 --level: "${clip(values.level, 20)}" is not a level \u2192 use --level 1, 2 or 3`);
      const arg = positionals[0];
      let content;
      if (arg === "-") {
        content = ctx.stdin().toString("utf8");
      } else {
        try {
          if (statSync8(arg).isFile()) content = readFileSync14(arg, "utf8");
        } catch {
        }
      }
      const r = runView(arg, Number(values.level), { paths, env: ctx.env }, content, values.summary);
      return finish(r.exit, r.text);
    }
    case "class":
    case "scan":
    case "drill":
    case "loop":
      return runSweptVerb(command, rest, paths, ctx);
    case "change": {
      const twice = givenTwice(rest, ["dry-run", "parent", "compare"]);
      if (twice) return finish(2, twice);
      const { values, positionals } = args("change", {
        args: rest,
        allowPositionals: true,
        options: { "dry-run": { type: "boolean", default: false }, parent: { type: "string" }, compare: { type: "string" } }
      });
      const usingFlags = values.parent !== void 0 || values.compare !== void 0;
      let text;
      if (usingFlags) {
        if (values.parent === void 0 || values.compare === void 0) {
          return finish(2, "\u2716 --parent/--compare: give both, or neither \u2192 sidewise change --parent SW-#### --compare <before>..<after>");
        }
        positionalCount("change", positionals, 0, 0);
        const sep = values.compare.indexOf("..");
        if (sep <= 0 || sep >= values.compare.length - 2) {
          return finish(2, `\u2716 --compare: "${clip(values.compare, 60)}" is not <before>..<after> \u2192 e.g. --compare main..HEAD`);
        }
        const parentRun = findRun(paths, values.parent);
        const goal = parentRun && isContractRun(parentRun) ? parentRun.goal : "The change works";
        text = (0, import_yaml3.stringify)({ side: { goal, parent: values.parent, compare: { before: values.compare.slice(0, sep), after: values.compare.slice(sep + 2) } } });
      } else {
        positionalCount("change", positionals, 1, 1);
        const read2 = readRequest(positionals[0], ctx.stdin);
        if ("stop" in read2) return finish(2, read2.stop);
        text = read2.text;
      }
      let provider;
      try {
        provider = selectProvider(ctx.env, { chaosState: path18.join(paths.dir, "chaos.json") });
      } catch (e) {
        return finish(providerExit(e), e.message);
      }
      const r = await runChange(text, { paths, provider, env: ctx.env, dryRun: values["dry-run"] });
      return finish(r.exit, r.text);
    }
    case "outcome": {
      const twice = givenTwice(rest, ["by"]);
      if (twice) return finish(2, twice);
      const { values, positionals } = args("outcome", { args: rest, allowPositionals: true, options: { by: { type: "string" } } });
      positionalCount("outcome", positionals, 2, 2);
      const [id = "", outcome = ""] = positionals;
      if (!RUN_ID.test(id)) return finish(2, `\u2716 outcome: "${clip(id, 40)}" is not a run id \u2192 use the SW-#### that class printed, e.g. SW-0001`);
      if (!OUTCOMES.includes(outcome)) return finish(2, `\u2716 outcome: "${clip(outcome, 40)}" is not an outcome \u2192 use held, overruled or failed`);
      const by = values.by?.trim();
      if (!by) return finish(2, "\u2716 --by: missing \u2192 add --by <who judged the run>");
      const { record: record2, repeat } = appendOutcome(paths, id, outcome, by);
      return finish(0, `sidewise outcome ${record2.of} ${record2.outcome} \xB7 ${repeat ? "already recorded " : ""}by ${record2.by}`);
    }
    case "budget": {
      const [sub = "show", ...more] = rest;
      if (sub === "show" || sub === "reset") {
        positionalCount("budget", more, 0, 0);
        if (sub === "show") return finish(0, budgetLine(loadBudget(paths).state));
        return finish(0, `reset \xB7 ${budgetLine(resetBudget(paths))}`);
      }
      if (sub !== "set") throw new UsageStop("budget", `"${clip(sub, 40)}" is not show, reset or set`);
      const twice = givenTwice(more, ["usd", "runs"]);
      if (twice) return finish(2, twice);
      const { usd, runs } = args("budget", { args: more, options: { usd: { type: "string" }, runs: { type: "string" } } }).values;
      if (usd === void 0 && runs === void 0) return finish(2, `\u2716 budget: set needs --usd or --runs \u2192 ${BUDGET_EXAMPLE}`);
      const capUsd = usd === void 0 ? void 0 : cap("usd", usd);
      const capRuns = runs === void 0 ? void 0 : cap("runs", runs);
      const stops = [capUsd, capRuns].filter((v) => typeof v === "string");
      if (stops.length) return finish(2, stops.join("\n"));
      const caps = {
        ...typeof capUsd === "number" ? { capUsd } : {},
        ...typeof capRuns === "number" ? { capRuns } : {}
      };
      return finish(0, `set \xB7 ${budgetLine(setBudget(paths, caps))}`);
    }
  }
  return finish(1, `\u2716 sidewise: internal: unhandled command "${command}"`);
}
async function runCli(argv, ctx) {
  try {
    return await dispatch(argv, ctx);
  } catch (e) {
    if (e instanceof UsageStop) return finish(2, e.message);
    if (e instanceof BudgetError) return finish(3, e.message);
    if (e instanceof LedgerError) return finish(e.exit, e.message);
    if (e instanceof JevConfigError) return finish(e.exit, e.message);
    if (e instanceof LockError || e instanceof StoreError) return finish(1, e.message);
    const text = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200);
    return finish(1, `\u2716 sidewise: ${text} \u2192 retry; if it repeats, report it with the command you ran`);
  }
}
function realCtx() {
  return {
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
    runner: realRunner,
    packageDir: PACKAGE_DIR,
    pkg: { name: package_default.name, version: package_default.version },
    homeDir: os3.homedir(),
    nodeVersion: process.version,
    stdin: () => readFileSync14(0),
    get io() {
      return { input: process.stdin, output: process.stdout };
    }
  };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2), realCtx()).then((r) => {
    if (r.text) (r.exit === 0 ? process.stdout : process.stderr).write(r.text);
    process.exitCode = r.exit;
  }).catch((e) => {
    process.stderr.write(`\u2716 sidewise: ${e instanceof Error ? e.message : String(e)} \u2192 retry; if it repeats, report it with the command you ran
`);
    process.exitCode = 1;
  });
}
export {
  runCli
};
