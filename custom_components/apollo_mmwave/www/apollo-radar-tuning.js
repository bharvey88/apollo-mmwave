/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a;
const t$1 = globalThis, e$2 = t$1.ShadowRoot && (void 0 === t$1.ShadyCSS || t$1.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$2 = Symbol(), o$4 = /* @__PURE__ */ new WeakMap();
let n$3 = class n {
  constructor(t2, e2, o2) {
    if (this._$cssResult$ = true, o2 !== s$2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t2, this.t = e2;
  }
  get styleSheet() {
    let t2 = this.o;
    const s2 = this.t;
    if (e$2 && void 0 === t2) {
      const e2 = void 0 !== s2 && 1 === s2.length;
      e2 && (t2 = o$4.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$4.set(s2, t2));
    }
    return t2;
  }
  toString() {
    return this.cssText;
  }
};
const r$4 = (t2) => new n$3("string" == typeof t2 ? t2 : t2 + "", void 0, s$2), i$3 = (t2, ...e2) => {
  const o2 = 1 === t2.length ? t2[0] : e2.reduce((e3, s2, o3) => e3 + ((t3) => {
    if (true === t3._$cssResult$) return t3.cssText;
    if ("number" == typeof t3) return t3;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t3 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s2) + t2[o3 + 1], t2[0]);
  return new n$3(o2, t2, s$2);
}, S$2 = (s2, o2) => {
  if (e$2) s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
  else for (const e2 of o2) {
    const o3 = document.createElement("style"), n3 = t$1.litNonce;
    void 0 !== n3 && o3.setAttribute("nonce", n3), o3.textContent = e2.cssText, s2.appendChild(o3);
  }
}, c$2 = e$2 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
  let e2 = "";
  for (const s2 of t3.cssRules) e2 += s2.cssText;
  return r$4(e2);
})(t2) : t2;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: i$2, defineProperty: e$1, getOwnPropertyDescriptor: h$1, getOwnPropertyNames: r$3, getOwnPropertySymbols: o$3, getPrototypeOf: n$2 } = Object, a$1 = globalThis, c$1 = a$1.trustedTypes, l$1 = c$1 ? c$1.emptyScript : "", p$1 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
  switch (s2) {
    case Boolean:
      t2 = t2 ? l$1 : null;
      break;
    case Object:
    case Array:
      t2 = null == t2 ? t2 : JSON.stringify(t2);
  }
  return t2;
}, fromAttribute(t2, s2) {
  let i2 = t2;
  switch (s2) {
    case Boolean:
      i2 = null !== t2;
      break;
    case Number:
      i2 = null === t2 ? null : Number(t2);
      break;
    case Object:
    case Array:
      try {
        i2 = JSON.parse(t2);
      } catch (t3) {
        i2 = null;
      }
  }
  return i2;
} }, f$1 = (t2, s2) => !i$2(t2, s2), b$1 = { attribute: true, type: String, converter: u$1, reflect: false, useDefault: false, hasChanged: f$1 };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), a$1.litPropertyMetadata ?? (a$1.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
let y$1 = class y extends HTMLElement {
  static addInitializer(t2) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t2);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t2, s2 = b$1) {
    if (s2.state && (s2.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t2) && ((s2 = Object.create(s2)).wrapped = true), this.elementProperties.set(t2, s2), !s2.noAccessor) {
      const i2 = Symbol(), h2 = this.getPropertyDescriptor(t2, i2, s2);
      void 0 !== h2 && e$1(this.prototype, t2, h2);
    }
  }
  static getPropertyDescriptor(t2, s2, i2) {
    const { get: e2, set: r2 } = h$1(this.prototype, t2) ?? { get() {
      return this[s2];
    }, set(t3) {
      this[s2] = t3;
    } };
    return { get: e2, set(s3) {
      const h2 = e2 == null ? void 0 : e2.call(this);
      r2 == null ? void 0 : r2.call(this, s3), this.requestUpdate(t2, h2, i2);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t2) {
    return this.elementProperties.get(t2) ?? b$1;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d$1("elementProperties"))) return;
    const t2 = n$2(this);
    t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d$1("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
      const t3 = this.properties, s2 = [...r$3(t3), ...o$3(t3)];
      for (const i2 of s2) this.createProperty(i2, t3[i2]);
    }
    const t2 = this[Symbol.metadata];
    if (null !== t2) {
      const s2 = litPropertyMetadata.get(t2);
      if (void 0 !== s2) for (const [t3, i2] of s2) this.elementProperties.set(t3, i2);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t3, s2] of this.elementProperties) {
      const i2 = this._$Eu(t3, s2);
      void 0 !== i2 && this._$Eh.set(i2, t3);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s2) {
    const i2 = [];
    if (Array.isArray(s2)) {
      const e2 = new Set(s2.flat(1 / 0).reverse());
      for (const s3 of e2) i2.unshift(c$2(s3));
    } else void 0 !== s2 && i2.push(c$2(s2));
    return i2;
  }
  static _$Eu(t2, s2) {
    const i2 = s2.attribute;
    return false === i2 ? void 0 : "string" == typeof i2 ? i2 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    var _a2;
    this._$ES = new Promise((t2) => this.enableUpdating = t2), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (_a2 = this.constructor.l) == null ? void 0 : _a2.forEach((t2) => t2(this));
  }
  addController(t2) {
    var _a2;
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t2), void 0 !== this.renderRoot && this.isConnected && ((_a2 = t2.hostConnected) == null ? void 0 : _a2.call(t2));
  }
  removeController(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.delete(t2);
  }
  _$E_() {
    const t2 = /* @__PURE__ */ new Map(), s2 = this.constructor.elementProperties;
    for (const i2 of s2.keys()) this.hasOwnProperty(i2) && (t2.set(i2, this[i2]), delete this[i2]);
    t2.size > 0 && (this._$Ep = t2);
  }
  createRenderRoot() {
    const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S$2(t2, this.constructor.elementStyles), t2;
  }
  connectedCallback() {
    var _a2;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostConnected) == null ? void 0 : _a3.call(t2);
    });
  }
  enableUpdating(t2) {
  }
  disconnectedCallback() {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostDisconnected) == null ? void 0 : _a3.call(t2);
    });
  }
  attributeChangedCallback(t2, s2, i2) {
    this._$AK(t2, i2);
  }
  _$ET(t2, s2) {
    var _a2;
    const i2 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i2);
    if (void 0 !== e2 && true === i2.reflect) {
      const h2 = (void 0 !== ((_a2 = i2.converter) == null ? void 0 : _a2.toAttribute) ? i2.converter : u$1).toAttribute(s2, i2.type);
      this._$Em = t2, null == h2 ? this.removeAttribute(e2) : this.setAttribute(e2, h2), this._$Em = null;
    }
  }
  _$AK(t2, s2) {
    var _a2, _b;
    const i2 = this.constructor, e2 = i2._$Eh.get(t2);
    if (void 0 !== e2 && this._$Em !== e2) {
      const t3 = i2.getPropertyOptions(e2), h2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== ((_a2 = t3.converter) == null ? void 0 : _a2.fromAttribute) ? t3.converter : u$1;
      this._$Em = e2;
      const r2 = h2.fromAttribute(s2, t3.type);
      this[e2] = r2 ?? ((_b = this._$Ej) == null ? void 0 : _b.get(e2)) ?? r2, this._$Em = null;
    }
  }
  requestUpdate(t2, s2, i2, e2 = false, h2) {
    var _a2;
    if (void 0 !== t2) {
      const r2 = this.constructor;
      if (false === e2 && (h2 = this[t2]), i2 ?? (i2 = r2.getPropertyOptions(t2)), !((i2.hasChanged ?? f$1)(h2, s2) || i2.useDefault && i2.reflect && h2 === ((_a2 = this._$Ej) == null ? void 0 : _a2.get(t2)) && !this.hasAttribute(r2._$Eu(t2, i2)))) return;
      this.C(t2, s2, i2);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t2, s2, { useDefault: i2, reflect: e2, wrapped: h2 }, r2) {
    i2 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t2) && (this._$Ej.set(t2, r2 ?? s2 ?? this[t2]), true !== h2 || void 0 !== r2) || (this._$AL.has(t2) || (this.hasUpdated || i2 || (s2 = void 0), this._$AL.set(t2, s2)), true === e2 && this._$Em !== t2 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t2));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t3) {
      Promise.reject(t3);
    }
    const t2 = this.scheduleUpdate();
    return null != t2 && await t2, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    var _a2;
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t4, s3] of this._$Ep) this[t4] = s3;
        this._$Ep = void 0;
      }
      const t3 = this.constructor.elementProperties;
      if (t3.size > 0) for (const [s3, i2] of t3) {
        const { wrapped: t4 } = i2, e2 = this[s3];
        true !== t4 || this._$AL.has(s3) || void 0 === e2 || this.C(s3, void 0, i2, e2);
      }
    }
    let t2 = false;
    const s2 = this._$AL;
    try {
      t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
        var _a3;
        return (_a3 = t3.hostUpdate) == null ? void 0 : _a3.call(t3);
      }), this.update(s2)) : this._$EM();
    } catch (s3) {
      throw t2 = false, this._$EM(), s3;
    }
    t2 && this._$AE(s2);
  }
  willUpdate(t2) {
  }
  _$AE(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
      var _a3;
      return (_a3 = t3.hostUpdated) == null ? void 0 : _a3.call(t3);
    }), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t2) {
    return true;
  }
  update(t2) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t3) => this._$ET(t3, this[t3]))), this._$EM();
  }
  updated(t2) {
  }
  firstUpdated(t2) {
  }
};
y$1.elementStyles = [], y$1.shadowRootOptions = { mode: "open" }, y$1[d$1("elementProperties")] = /* @__PURE__ */ new Map(), y$1[d$1("finalized")] = /* @__PURE__ */ new Map(), p$1 == null ? void 0 : p$1({ ReactiveElement: y$1 }), (a$1.reactiveElementVersions ?? (a$1.reactiveElementVersions = [])).push("2.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t = globalThis, i$1 = (t2) => t2, s$1 = t.trustedTypes, e = s$1 ? s$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, h = "$lit$", o$2 = `lit$${Math.random().toFixed(9).slice(2)}$`, n$1 = "?" + o$2, r$2 = `<${n$1}>`, l = document, c = () => l.createComment(""), a = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, u = Array.isArray, d = (t2) => u(t2) || "function" == typeof (t2 == null ? void 0 : t2[Symbol.iterator]), f = "[ 	\n\f\r]", v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, _ = /-->/g, m = />/g, p = RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), g = /'/g, $ = /"/g, y2 = /^(?:script|style|textarea|title)$/i, x = (t2) => (i2, ...s2) => ({ _$litType$: t2, strings: i2, values: s2 }), b = x(1), w = x(2), E = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), C = /* @__PURE__ */ new WeakMap(), P = l.createTreeWalker(l, 129);
function V(t2, i2) {
  if (!u(t2) || !t2.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e ? e.createHTML(i2) : i2;
}
const N = (t2, i2) => {
  const s2 = t2.length - 1, e2 = [];
  let n3, l2 = 2 === i2 ? "<svg>" : 3 === i2 ? "<math>" : "", c2 = v;
  for (let i3 = 0; i3 < s2; i3++) {
    const s3 = t2[i3];
    let a2, u2, d2 = -1, f2 = 0;
    for (; f2 < s3.length && (c2.lastIndex = f2, u2 = c2.exec(s3), null !== u2); ) f2 = c2.lastIndex, c2 === v ? "!--" === u2[1] ? c2 = _ : void 0 !== u2[1] ? c2 = m : void 0 !== u2[2] ? (y2.test(u2[2]) && (n3 = RegExp("</" + u2[2], "g")), c2 = p) : void 0 !== u2[3] && (c2 = p) : c2 === p ? ">" === u2[0] ? (c2 = n3 ?? v, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? p : '"' === u2[3] ? $ : g) : c2 === $ || c2 === g ? c2 = p : c2 === _ || c2 === m ? c2 = v : (c2 = p, n3 = void 0);
    const x2 = c2 === p && t2[i3 + 1].startsWith("/>") ? " " : "";
    l2 += c2 === v ? s3 + r$2 : d2 >= 0 ? (e2.push(a2), s3.slice(0, d2) + h + s3.slice(d2) + o$2 + x2) : s3 + o$2 + (-2 === d2 ? i3 : x2);
  }
  return [V(t2, l2 + (t2[s2] || "<?>") + (2 === i2 ? "</svg>" : 3 === i2 ? "</math>" : "")), e2];
};
let S$1 = class S {
  constructor({ strings: t2, _$litType$: i2 }, e2) {
    let r2;
    this.parts = [];
    let l2 = 0, a2 = 0;
    const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = N(t2, i2);
    if (this.el = S.createElement(f2, e2), P.currentNode = this.el.content, 2 === i2 || 3 === i2) {
      const t3 = this.el.content.firstChild;
      t3.replaceWith(...t3.childNodes);
    }
    for (; null !== (r2 = P.nextNode()) && d2.length < u2; ) {
      if (1 === r2.nodeType) {
        if (r2.hasAttributes()) for (const t3 of r2.getAttributeNames()) if (t3.endsWith(h)) {
          const i3 = v2[a2++], s2 = r2.getAttribute(t3).split(o$2), e3 = /([.?@])?(.*)/.exec(i3);
          d2.push({ type: 1, index: l2, name: e3[2], strings: s2, ctor: "." === e3[1] ? I : "?" === e3[1] ? L : "@" === e3[1] ? z : H }), r2.removeAttribute(t3);
        } else t3.startsWith(o$2) && (d2.push({ type: 6, index: l2 }), r2.removeAttribute(t3));
        if (y2.test(r2.tagName)) {
          const t3 = r2.textContent.split(o$2), i3 = t3.length - 1;
          if (i3 > 0) {
            r2.textContent = s$1 ? s$1.emptyScript : "";
            for (let s2 = 0; s2 < i3; s2++) r2.append(t3[s2], c()), P.nextNode(), d2.push({ type: 2, index: ++l2 });
            r2.append(t3[i3], c());
          }
        }
      } else if (8 === r2.nodeType) if (r2.data === n$1) d2.push({ type: 2, index: l2 });
      else {
        let t3 = -1;
        for (; -1 !== (t3 = r2.data.indexOf(o$2, t3 + 1)); ) d2.push({ type: 7, index: l2 }), t3 += o$2.length - 1;
      }
      l2++;
    }
  }
  static createElement(t2, i2) {
    const s2 = l.createElement("template");
    return s2.innerHTML = t2, s2;
  }
};
function M(t2, i2, s2 = t2, e2) {
  var _a2, _b;
  if (i2 === E) return i2;
  let h2 = void 0 !== e2 ? (_a2 = s2._$Co) == null ? void 0 : _a2[e2] : s2._$Cl;
  const o2 = a(i2) ? void 0 : i2._$litDirective$;
  return (h2 == null ? void 0 : h2.constructor) !== o2 && ((_b = h2 == null ? void 0 : h2._$AO) == null ? void 0 : _b.call(h2, false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ?? (s2._$Co = []))[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i2 = M(t2, h2._$AS(t2, i2.values), h2, e2)), i2;
}
class R {
  constructor(t2, i2) {
    this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i2;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t2) {
    const { el: { content: i2 }, parts: s2 } = this._$AD, e2 = ((t2 == null ? void 0 : t2.creationScope) ?? l).importNode(i2, true);
    P.currentNode = e2;
    let h2 = P.nextNode(), o2 = 0, n3 = 0, r2 = s2[0];
    for (; void 0 !== r2; ) {
      if (o2 === r2.index) {
        let i3;
        2 === r2.type ? i3 = new k(h2, h2.nextSibling, this, t2) : 1 === r2.type ? i3 = new r2.ctor(h2, r2.name, r2.strings, this, t2) : 6 === r2.type && (i3 = new Z(h2, this, t2)), this._$AV.push(i3), r2 = s2[++n3];
      }
      o2 !== (r2 == null ? void 0 : r2.index) && (h2 = P.nextNode(), o2++);
    }
    return P.currentNode = l, e2;
  }
  p(t2) {
    let i2 = 0;
    for (const s2 of this._$AV) void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i2), i2 += s2.strings.length - 2) : s2._$AI(t2[i2])), i2++;
  }
}
class k {
  get _$AU() {
    var _a2;
    return ((_a2 = this._$AM) == null ? void 0 : _a2._$AU) ?? this._$Cv;
  }
  constructor(t2, i2, s2, e2) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t2, this._$AB = i2, this._$AM = s2, this.options = e2, this._$Cv = (e2 == null ? void 0 : e2.isConnected) ?? true;
  }
  get parentNode() {
    let t2 = this._$AA.parentNode;
    const i2 = this._$AM;
    return void 0 !== i2 && 11 === (t2 == null ? void 0 : t2.nodeType) && (t2 = i2.parentNode), t2;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t2, i2 = this) {
    t2 = M(this, t2, i2), a(t2) ? t2 === A || null == t2 || "" === t2 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t2 !== this._$AH && t2 !== E && this._(t2) : void 0 !== t2._$litType$ ? this.$(t2) : void 0 !== t2.nodeType ? this.T(t2) : d(t2) ? this.k(t2) : this._(t2);
  }
  O(t2) {
    return this._$AA.parentNode.insertBefore(t2, this._$AB);
  }
  T(t2) {
    this._$AH !== t2 && (this._$AR(), this._$AH = this.O(t2));
  }
  _(t2) {
    this._$AH !== A && a(this._$AH) ? this._$AA.nextSibling.data = t2 : this.T(l.createTextNode(t2)), this._$AH = t2;
  }
  $(t2) {
    var _a2;
    const { values: i2, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = S$1.createElement(V(s2.h, s2.h[0]), this.options)), s2);
    if (((_a2 = this._$AH) == null ? void 0 : _a2._$AD) === e2) this._$AH.p(i2);
    else {
      const t3 = new R(e2, this), s3 = t3.u(this.options);
      t3.p(i2), this.T(s3), this._$AH = t3;
    }
  }
  _$AC(t2) {
    let i2 = C.get(t2.strings);
    return void 0 === i2 && C.set(t2.strings, i2 = new S$1(t2)), i2;
  }
  k(t2) {
    u(this._$AH) || (this._$AH = [], this._$AR());
    const i2 = this._$AH;
    let s2, e2 = 0;
    for (const h2 of t2) e2 === i2.length ? i2.push(s2 = new k(this.O(c()), this.O(c()), this, this.options)) : s2 = i2[e2], s2._$AI(h2), e2++;
    e2 < i2.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i2.length = e2);
  }
  _$AR(t2 = this._$AA.nextSibling, s2) {
    var _a2;
    for ((_a2 = this._$AP) == null ? void 0 : _a2.call(this, false, true, s2); t2 !== this._$AB; ) {
      const s3 = i$1(t2).nextSibling;
      i$1(t2).remove(), t2 = s3;
    }
  }
  setConnected(t2) {
    var _a2;
    void 0 === this._$AM && (this._$Cv = t2, (_a2 = this._$AP) == null ? void 0 : _a2.call(this, t2));
  }
}
class H {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t2, i2, s2, e2, h2) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t2, this.name = i2, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = A;
  }
  _$AI(t2, i2 = this, s2, e2) {
    const h2 = this.strings;
    let o2 = false;
    if (void 0 === h2) t2 = M(this, t2, i2, 0), o2 = !a(t2) || t2 !== this._$AH && t2 !== E, o2 && (this._$AH = t2);
    else {
      const e3 = t2;
      let n3, r2;
      for (t2 = h2[0], n3 = 0; n3 < h2.length - 1; n3++) r2 = M(this, e3[s2 + n3], i2, n3), r2 === E && (r2 = this._$AH[n3]), o2 || (o2 = !a(r2) || r2 !== this._$AH[n3]), r2 === A ? t2 = A : t2 !== A && (t2 += (r2 ?? "") + h2[n3 + 1]), this._$AH[n3] = r2;
    }
    o2 && !e2 && this.j(t2);
  }
  j(t2) {
    t2 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
  }
}
class I extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t2) {
    this.element[this.name] = t2 === A ? void 0 : t2;
  }
}
class L extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t2) {
    this.element.toggleAttribute(this.name, !!t2 && t2 !== A);
  }
}
class z extends H {
  constructor(t2, i2, s2, e2, h2) {
    super(t2, i2, s2, e2, h2), this.type = 5;
  }
  _$AI(t2, i2 = this) {
    if ((t2 = M(this, t2, i2, 0) ?? A) === E) return;
    const s2 = this._$AH, e2 = t2 === A && s2 !== A || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== A && (s2 === A || e2);
    e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
  }
  handleEvent(t2) {
    var _a2;
    "function" == typeof this._$AH ? this._$AH.call(((_a2 = this.options) == null ? void 0 : _a2.host) ?? this.element, t2) : this._$AH.handleEvent(t2);
  }
}
class Z {
  constructor(t2, i2, s2) {
    this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i2, this.options = s2;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t2) {
    M(this, t2);
  }
}
const B = t.litHtmlPolyfillSupport;
B == null ? void 0 : B(S$1, k), (t.litHtmlVersions ?? (t.litHtmlVersions = [])).push("3.3.3");
const D = (t2, i2, s2) => {
  const e2 = (s2 == null ? void 0 : s2.renderBefore) ?? i2;
  let h2 = e2._$litPart$;
  if (void 0 === h2) {
    const t3 = (s2 == null ? void 0 : s2.renderBefore) ?? null;
    e2._$litPart$ = h2 = new k(i2.insertBefore(c(), t3), t3, void 0, s2 ?? {});
  }
  return h2._$AI(t2), h2;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const s = globalThis;
class i extends y$1 {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a2;
    const t2 = super.createRenderRoot();
    return (_a2 = this.renderOptions).renderBefore ?? (_a2.renderBefore = t2.firstChild), t2;
  }
  update(t2) {
    const r2 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = D(r2, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var _a2;
    super.connectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(true);
  }
  disconnectedCallback() {
    var _a2;
    super.disconnectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(false);
  }
  render() {
    return E;
  }
}
i._$litElement$ = true, i["finalized"] = true, (_a = s.litElementHydrateSupport) == null ? void 0 : _a.call(s, { LitElement: i });
const o$1 = s.litElementPolyfillSupport;
o$1 == null ? void 0 : o$1({ LitElement: i });
(s.litElementVersions ?? (s.litElementVersions = [])).push("4.2.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const o = { attribute: true, type: String, converter: u$1, reflect: false, hasChanged: f$1 }, r$1 = (t2 = o, e2, r2) => {
  const { kind: n3, metadata: i2 } = r2;
  let s2 = globalThis.litPropertyMetadata.get(i2);
  if (void 0 === s2 && globalThis.litPropertyMetadata.set(i2, s2 = /* @__PURE__ */ new Map()), "setter" === n3 && ((t2 = Object.create(t2)).wrapped = true), s2.set(r2.name, t2), "accessor" === n3) {
    const { name: o2 } = r2;
    return { set(r3) {
      const n4 = e2.get.call(this);
      e2.set.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    }, init(e3) {
      return void 0 !== e3 && this.C(o2, void 0, t2, e3), e3;
    } };
  }
  if ("setter" === n3) {
    const { name: o2 } = r2;
    return function(r3) {
      const n4 = this[o2];
      e2.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    };
  }
  throw Error("Unsupported decorator location: " + n3);
};
function n2(t2) {
  return (e2, o2) => "object" == typeof o2 ? r$1(t2, e2, o2) : ((t3, e3, o3) => {
    const r2 = e3.hasOwnProperty(o3);
    return e3.constructor.createProperty(o3, t3), r2 ? Object.getOwnPropertyDescriptor(e3, o3) : void 0;
  })(t2, e2, o2);
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
function r(r2) {
  return n2({ ...r2, state: true, attribute: false });
}
function emptyZones() {
  return {
    zone_1_start: void 0,
    end_zone_1: void 0,
    end_zone_2: void 0,
    end_zone_3: void 0,
    zone_1_occupancy: void 0,
    zone_2_occupancy: void 0,
    zone_3_occupancy: void 0
  };
}
const LD2410_PROFILE = {
  key: "ld2410",
  label: "LD2410",
  maxBarLabels: ["Max Move", "Max Still"],
  rangeLabels: ["Max Move Gate", "Max Still Gate"],
  gateSizeLabel: "Gate Size",
  rangeTip: "💡 **Gate Size** sets how far each gate reaches (e.g. 0.75 m). **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets — lower them to ignore distant motion.",
  gateTip: "💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values.",
  wikiUrl: "https://wiki.apolloautomation.com/products/msr2/setup/zones-ha/",
  entityMap(base) {
    const gates = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const g2 = (suffix) => gates.map((n3) => suffix(n3));
    return {
      engineering_mode: `switch.${base}_radar_engineering_mode`,
      bluetooth: `switch.${base}_ld2410_bluetooth`,
      restart_radar: `button.${base}_restart_radar`,
      factory_reset_radar: `button.${base}_factory_reset_radar`,
      esp_reboot: `button.${base}_esp_reboot`,
      radar_timeout: `number.${base}_radar_timeout`,
      zone_1_start: `number.${base}_radar_zone_1_start`,
      end_zone_1: `number.${base}_radar_end_zone_1`,
      end_zone_2: `number.${base}_radar_end_zone_2`,
      end_zone_3: `number.${base}_radar_end_zone_3`,
      max_move_distance: `number.${base}_radar_max_move_distance`,
      max_still_distance: `number.${base}_radar_max_still_distance`,
      gate_size: `select.${base}_ld2410_gate_size`,
      move_threshold: g2((n3) => `number.${base}_g${n3}_move_threshold`),
      still_threshold: g2((n3) => `number.${base}_g${n3}_still_threshold`),
      move_energy: g2((n3) => `sensor.${base}_g${n3}_move_energy`),
      still_energy: g2((n3) => `sensor.${base}_g${n3}_still_energy`),
      still_distance: `sensor.${base}_radar_still_distance`,
      moving_distance: `sensor.${base}_radar_moving_distance`,
      detection_distance: `sensor.${base}_radar_detection_distance`,
      radar_target: `binary_sensor.${base}_radar_target`,
      moving_target: `binary_sensor.${base}_radar_moving_target`,
      still_target: `binary_sensor.${base}_radar_still_target`,
      zone_1_occupancy: `binary_sensor.${base}_radar_zone_1_occupancy`,
      zone_2_occupancy: `binary_sensor.${base}_radar_zone_2_occupancy`,
      zone_3_occupancy: `binary_sensor.${base}_radar_zone_3_occupancy`
    };
  }
};
const LD2412_PROFILE = {
  key: "ld2412",
  label: "LD2412",
  maxBarLabels: ["Max Gate", "Min Gate"],
  rangeLabels: ["Max Gate", "Min Gate"],
  gateSizeLabel: "Distance Resolution",
  rangeTip: "💡 **Distance Resolution** sets gate spacing — smaller (0.5 m) gives finer tuning over a shorter range, larger (0.75 m) reaches farther. **Min / Max Gate** limit which gates are used for detection.",
  gateTip: "💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values.",
  wikiUrl: "https://wiki.apolloautomation.com/products/rpro1/setup/zones-ha/#ld2412-configuration",
  entityMap(base) {
    const gates = Array.from({ length: 14 }, (_2, i2) => i2);
    const pad = (n3) => String(n3).padStart(2, "0");
    const g2 = (suffix) => gates.map((n3) => suffix(pad(n3)));
    return {
      engineering_mode: `switch.${base}_ld2412_engineering_mode`,
      bluetooth: `switch.${base}_ld2412_bluetooth`,
      restart_radar: `button.${base}_ld2412_restart`,
      factory_reset_radar: `button.${base}_ld2412_factory_reset`,
      esp_reboot: `button.${base}_esp_reboot`,
      radar_timeout: `number.${base}_ld2412_timeout`,
      ...emptyZones(),
      max_move_distance: `number.${base}_ld2412_max_distance_gate`,
      max_still_distance: `number.${base}_ld2412_min_distance_gate`,
      gate_size: `select.${base}_ld2412_distance_resolution`,
      move_threshold: g2((p2) => `number.${base}_ld2412_g${p2}_move_threshold`),
      still_threshold: g2((p2) => `number.${base}_ld2412_g${p2}_still_threshold`),
      move_energy: g2((p2) => `sensor.${base}_ld2412_g${p2}_move_energy`),
      still_energy: g2((p2) => `sensor.${base}_ld2412_g${p2}_still_energy`),
      // LD2412 distance sensors don't report usable values, so no distance bars
      // are shown — the chart is the gate range + min/max gate only.
      still_distance: void 0,
      moving_distance: void 0,
      detection_distance: void 0,
      radar_target: `binary_sensor.${base}_ld2412_presence`,
      moving_target: `binary_sensor.${base}_ld2412_moving_target`,
      still_target: `binary_sensor.${base}_ld2412_still_target`
    };
  }
};
const PROFILES = [LD2412_PROFILE, LD2410_PROFILE];
const APOLLO_MODELS = [
  { prefix: "msr-1", profile: LD2410_PROFILE, ld2450: false },
  { prefix: "msr-2", profile: LD2410_PROFILE, ld2450: false },
  { prefix: "mtr-1", ld2450: true },
  { prefix: "r-pro-1", profile: LD2412_PROFILE, ld2450: true }
];
function apolloModelInfo(device) {
  if (!(device == null ? void 0 : device.manufacturer) || !device.model) return void 0;
  if (device.manufacturer.toLowerCase() !== "apolloautomation") return void 0;
  const model = device.model.toLowerCase();
  const hit = APOLLO_MODELS.find((m2) => model.startsWith(m2.prefix));
  return hit ? { profile: hit.profile, ld2450: hit.ld2450 } : void 0;
}
function detectProfile(hass, base) {
  for (const p2 of PROFILES) {
    const id = p2.entityMap(base).engineering_mode;
    if (id && id in hass.states) return p2;
  }
  return void 0;
}
const KNOWN_SUFFIXES = [
  // LD2412 — every entity is `{base}_ld2412_...`, so one pattern covers all.
  /_ld2412_.+$/,
  // LD2450 tracking radar — every entity is `{base}_ld2450_...`. Needed so
  // zone-only devices (e.g. MTR-1, no gate radar) still resolve to a base name.
  /_ld2450_.+$/,
  // LD2410 (MSR) — varied prefixes.
  /_radar_engineering_mode$/,
  /_ld2410_bluetooth$/,
  /_restart_radar$/,
  /_factory_reset_radar$/,
  /_esp_reboot$/,
  /_radar_timeout$/,
  /_radar_zone_\d+_start$/,
  /_radar_end_zone_\d+$/,
  /_radar_max_move_distance$/,
  /_radar_max_still_distance$/,
  /_ld2410_gate_size$/,
  /_g\d+_move_threshold$/,
  /_g\d+_still_threshold$/,
  /_g\d+_move_energy$/,
  /_g\d+_still_energy$/,
  /_radar_still_distance$/,
  /_radar_moving_distance$/,
  /_radar_detection_distance$/,
  /_radar_moving_target$/,
  /_radar_still_target$/,
  /_radar_target$/,
  /_radar_zone_\d+_occupancy$/
];
function baseFromObjectId(objectId) {
  for (const re of KNOWN_SUFFIXES) {
    if (re.test(objectId)) return objectId.replace(re, "");
  }
  return void 0;
}
function baseNameFromDevice(hass, deviceId) {
  const objectIds = Object.entries(hass.entities).filter(([, e2]) => e2.device_id === deviceId).map(([id]) => id.slice(id.indexOf(".") + 1));
  const counts = /* @__PURE__ */ new Map();
  for (const oid of objectIds) {
    const base = baseFromObjectId(oid);
    if (base) counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  let best;
  let bestCount = 0;
  for (const [base, count] of counts) {
    if (count > bestCount) {
      best = base;
      bestCount = count;
    }
  }
  return best;
}
const DEDUP = "(?:_\\d+)?$";
const S2 = (slot, domain, suffix) => ({
  slot,
  domain,
  re: new RegExp(suffix + DEDUP)
});
const SCALAR_PATTERNS = [
  // LD2410 (MSR) naming.
  S2("engineering_mode", "switch", "_radar_engineering_mode"),
  S2("bluetooth", "switch", "_ld2410_bluetooth"),
  S2("restart_radar", "button", "_restart_radar"),
  S2("factory_reset_radar", "button", "_factory_reset_radar"),
  S2("esp_reboot", "button", "_esp_reboot"),
  S2("radar_timeout", "number", "_radar_timeout"),
  S2("zone_1_start", "number", "_radar_zone_1_start"),
  S2("end_zone_1", "number", "_radar_end_zone_1"),
  S2("end_zone_2", "number", "_radar_end_zone_2"),
  S2("end_zone_3", "number", "_radar_end_zone_3"),
  S2("max_move_distance", "number", "_radar_max_move_distance"),
  S2("max_still_distance", "number", "_radar_max_still_distance"),
  S2("gate_size", "select", "_ld2410_gate_size"),
  S2("still_distance", "sensor", "_radar_still_distance"),
  S2("moving_distance", "sensor", "_radar_moving_distance"),
  S2("detection_distance", "sensor", "_radar_detection_distance"),
  S2("moving_target", "binary_sensor", "_radar_moving_target"),
  S2("still_target", "binary_sensor", "_radar_still_target"),
  S2("radar_target", "binary_sensor", "_radar_target"),
  S2("zone_1_occupancy", "binary_sensor", "_radar_zone_1_occupancy"),
  S2("zone_2_occupancy", "binary_sensor", "_radar_zone_2_occupancy"),
  S2("zone_3_occupancy", "binary_sensor", "_radar_zone_3_occupancy"),
  // LD2412 (R-PRO) naming.
  S2("engineering_mode", "switch", "_ld2412_engineering_mode"),
  S2("bluetooth", "switch", "_ld2412_bluetooth"),
  S2("restart_radar", "button", "_ld2412_restart"),
  S2("factory_reset_radar", "button", "_ld2412_factory_reset"),
  S2("radar_timeout", "number", "_ld2412_timeout"),
  S2("max_move_distance", "number", "_ld2412_max_distance_gate"),
  S2("max_still_distance", "number", "_ld2412_min_distance_gate"),
  S2("gate_size", "select", "_ld2412_distance_resolution"),
  S2("radar_target", "binary_sensor", "_ld2412_presence"),
  S2("moving_target", "binary_sensor", "_ld2412_moving_target"),
  S2("still_target", "binary_sensor", "_ld2412_still_target")
];
const GATE_PATTERNS = [
  ["move_threshold", "number"],
  ["still_threshold", "number"],
  ["move_energy", "sensor"],
  ["still_energy", "sensor"]
].map(([slot, domain]) => ({
  slot,
  domain,
  re: new RegExp(`_g(\\d+)_${slot}${DEDUP}`)
}));
function classifyObjectId(domain, objectId) {
  for (const p2 of GATE_PATTERNS) {
    const m2 = p2.re.exec(objectId);
    if (m2) return domain === p2.domain ? { slot: p2.slot, gate: parseInt(m2[1], 10) } : void 0;
  }
  for (const p2 of SCALAR_PATTERNS) {
    if (p2.re.test(objectId)) {
      return domain === p2.domain ? { slot: p2.slot } : void 0;
    }
  }
  return void 0;
}
const LD2410_MARKERS = [
  /_ld2410_/,
  new RegExp(`_radar_engineering_mode${DEDUP}`),
  new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${DEDUP}`),
  new RegExp(`_radar_max_(?:move|still)_distance${DEDUP}`)
];
function detectProfileFromEntities(hass, deviceId) {
  let sawLd2410 = false;
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId) continue;
    const oid = id.slice(id.indexOf(".") + 1);
    if (/_ld2412_/.test(oid)) return LD2412_PROFILE;
    if (!sawLd2410) sawLd2410 = LD2410_MARKERS.some((re) => re.test(oid));
  }
  return sawLd2410 ? LD2410_PROFILE : void 0;
}
function entityMapFromDevice(hass, deviceId) {
  const map = emptyMap();
  let matched = false;
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId) continue;
    const dot = id.indexOf(".");
    const c2 = classifyObjectId(id.slice(0, dot), id.slice(dot + 1));
    if (!c2) continue;
    if ("gate" in c2) {
      const arr = map[c2.slot];
      if (arr[c2.gate] === void 0) {
        arr[c2.gate] = id;
        matched = true;
      }
    } else if (map[c2.slot] === void 0) {
      map[c2.slot] = id;
      matched = true;
    }
  }
  return matched ? map : void 0;
}
function resolveBase(hass, config) {
  let base;
  if (config.device_id) base = baseNameFromDevice(hass, config.device_id);
  if (!base && config.device_base_name) base = config.device_base_name;
  return base;
}
function resolveProfile(hass, config) {
  if (config.device_id) {
    const fromEntities = detectProfileFromEntities(hass, config.device_id);
    if (fromEntities) return fromEntities;
    const reg = apolloModelInfo(hass.devices[config.device_id]);
    if (reg) return reg.profile;
  }
  const base = resolveBase(hass, config);
  if (!base) return void 0;
  return detectProfile(hass, base) ?? LD2410_PROFILE;
}
function emptyMap() {
  return {
    move_threshold: [],
    still_threshold: [],
    move_energy: [],
    still_energy: []
  };
}
function resolveEntities(hass, config) {
  let resolved;
  if (config.device_id) resolved = entityMapFromDevice(hass, config.device_id);
  if (!resolved) {
    const base = resolveBase(hass, config);
    const profile = base ? detectProfile(hass, base) ?? LD2410_PROFILE : void 0;
    resolved = base && profile ? profile.entityMap(base) : emptyMap();
  }
  if (config.entities) {
    return { ...resolved, ...config.entities };
  }
  return resolved;
}
function exists(hass, id) {
  return !!id && id in hass.states;
}
function entityIds(m2) {
  const out = [];
  for (const v2 of Object.values(m2)) {
    if (typeof v2 === "string") out.push(v2);
    else if (Array.isArray(v2)) {
      for (const id of v2) if (id) out.push(id);
    }
  }
  return out;
}
function resolveRadar(cache, hass, config) {
  if (cache && cache.config === config && cache.entities === hass.entities && cache.devices === hass.devices) {
    return cache;
  }
  const map = resolveEntities(hass, config);
  return {
    config,
    entities: hass.entities,
    devices: hass.devices,
    map,
    profile: resolveProfile(hass, config),
    ids: entityIds(map)
  };
}
function resolvedStatesChanged(oldHass, newHass, ids) {
  return ids.some((id) => oldHass.states[id] !== newHass.states[id]);
}
function anyResolved(hass, ids) {
  return ids.some((id) => id in hass.states);
}
const VALID_UOMS = ["mm", "cm", "m", "in", "ft", "yd"];
const METERS_PER = {
  mm: 1e-3,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144
};
function isValidUom(u2) {
  return !!u2 && VALID_UOMS.includes(u2);
}
function defaultDistanceUnit(hass) {
  var _a2, _b;
  return ((_b = (_a2 = hass == null ? void 0 : hass.config) == null ? void 0 : _a2.unit_system) == null ? void 0 : _b.length) === "mi" ? "in" : "m";
}
function toMeters(value, uom) {
  return value * METERS_PER[uom];
}
function convert(value, from, to) {
  if (from === to) return value;
  return toMeters(value, from) / METERS_PER[to];
}
function numState(hass, id) {
  if (!id) return void 0;
  const ent = hass.states[id];
  if (!ent) return void 0;
  const v2 = parseFloat(ent.state);
  return Number.isFinite(v2) ? v2 : void 0;
}
function uomOf(hass, id, fallback) {
  var _a2, _b;
  const uom = id ? (_b = (_a2 = hass.states[id]) == null ? void 0 : _a2.attributes) == null ? void 0 : _b.unit_of_measurement : void 0;
  return isValidUom(uom) ? uom : fallback;
}
function parseGateSizeMeters(state) {
  if (!state) return void 0;
  const match = state.replace(",", ".").match(/[0-9]*\.?[0-9]+/);
  if (!match) return void 0;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : void 0;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function scaleX(value, maxRange, width) {
  if (maxRange <= 0) return 0;
  return clamp(value / maxRange * width, 0, width);
}
const DEFAULT_GATE_SIZE_M = 0.75;
const GATE_COUNT = 8;
const STILL_COLOR$1 = "#2e7d32";
const MOVE_COLOR$1 = "#6a1b9a";
const DETECTION_COLOR = "#b71c1c";
const ZONE_COLORS = ["#d32f2f", "#1565c0", "#2e7d32"];
function gateColor(i2, count) {
  const hue = 220 - 220 * i2 / Math.max(1, count - 1);
  return `hsl(${hue}, 64%, 48%)`;
}
const TXT = "var(--primary-text-color, #e6e6e6)";
const TXT2 = "var(--secondary-text-color, #9aa0a6)";
function distInUnit(hass, id, unit) {
  const v2 = numState(hass, id);
  if (v2 === void 0) return void 0;
  return convert(v2, uomOf(hass, id, unit), unit);
}
function distanceModel(hass, m2, unit) {
  var _a2, _b;
  const gateSizeM = parseGateSizeMeters(m2.gate_size ? (_a2 = hass.states[m2.gate_size]) == null ? void 0 : _a2.state : void 0) ?? DEFAULT_GATE_SIZE_M;
  const gateSizeChart = convert(gateSizeM, "m", unit);
  const gateCount = m2.move_threshold.length > 1 ? m2.move_threshold.length - 1 : GATE_COUNT;
  const maxRange = gateSizeChart * gateCount;
  const bars = [];
  const pushBar = (id, label, color) => {
    if (!id || !(id in hass.states)) return;
    bars.push({ label, value: distInUnit(hass, id, unit) ?? 0, color });
  };
  pushBar(m2.detection_distance, "Detection", DETECTION_COLOR);
  pushBar(m2.moving_distance, "Moving", MOVE_COLOR$1);
  pushBar(m2.still_distance, "Still", STILL_COLOR$1);
  const zones = [];
  const bounds = [
    distInUnit(hass, m2.zone_1_start, unit),
    distInUnit(hass, m2.end_zone_1, unit),
    distInUnit(hass, m2.end_zone_2, unit),
    distInUnit(hass, m2.end_zone_3, unit)
  ];
  const occ = [m2.zone_1_occupancy, m2.zone_2_occupancy, m2.zone_3_occupancy];
  for (let i2 = 0; i2 < 3; i2++) {
    const start = bounds[i2];
    const end = bounds[i2 + 1];
    if (start === void 0 || end === void 0) continue;
    const occId = occ[i2];
    zones.push({
      label: `Zone ${i2 + 1}`,
      start,
      end,
      color: ZONE_COLORS[i2],
      occupied: !!occId && ((_b = hass.states[occId]) == null ? void 0 : _b.state) === "on"
    });
  }
  const maxStillGate = numState(hass, m2.max_still_distance);
  const maxMoveGate = numState(hass, m2.max_move_distance);
  return {
    unit,
    gateSizeChart,
    gateCount,
    maxRange,
    bars,
    zones,
    maxStill: maxStillGate === void 0 ? void 0 : maxStillGate * gateSizeChart,
    maxMove: maxMoveGate === void 0 ? void 0 : maxMoveGate * gateSizeChart,
    maxStillGate,
    maxMoveGate
  };
}
const WIDTH$1 = 478;
const LBL = 64;
const RPAD = 12;
const INNER = WIDTH$1 - LBL - RPAD;
const TOP = 6;
const ROW_H = 30;
const BAR_H = ROW_H - 8;
const AXIS_H = 36;
const MID = BAR_H / 2 + 4;
function rowLabel(r2) {
  if (r2.kind === "zones") return "Zones";
  if (r2.kind === "gates") return "Gates";
  if (r2.kind === "bar") return r2.bar.label;
  return r2.label;
}
function rowTip(r2) {
  if (r2.kind === "zones")
    return "Detection zones. The circle shows whether a target is currently in each zone (filled = present).";
  if (r2.kind === "gates")
    return "The radar splits its range into gates — each colored segment is one distance bin (G1, G2, ...).";
  if (r2.kind === "max")
    return `${r2.label}: the configured detection-range limit, shown as a gate number.`;
  if (r2.bar.label === "Detection")
    return "Current distance to the detected target.";
  if (r2.bar.label === "Moving")
    return "Current distance to a moving target.";
  return "Current distance to a still (stationary) target.";
}
function valueLabel(xEnd, text, y3) {
  const inside = xEnd > WIDTH$1 * 0.62;
  return inside ? w`<text x=${xEnd - 6} y=${y3 + MID} font-size="13" text-anchor="end" fill="#fff">${text}</text>` : w`<text x=${xEnd + 6} y=${y3 + MID} font-size="13" fill=${TXT}>${text}</text>`;
}
function renderDistanceChart(hass, m2, unit, maxLabels = ["Max Move", "Max Still"]) {
  if (m2.move_threshold.length === 0) return A;
  const model = distanceModel(hass, m2, unit);
  const x2 = (v2) => LBL + scaleX(v2, model.maxRange, INNER);
  const fmt = (v2) => `${v2.toFixed(1)} ${unit}`;
  const rows = [];
  if (model.zones.length) rows.push({ kind: "zones" });
  for (const bar of model.bars) rows.push({ kind: "bar", bar });
  rows.push({ kind: "gates" });
  if (model.maxMove !== void 0)
    rows.push({ kind: "max", label: maxLabels[0], value: model.maxMove, gate: model.maxMoveGate, color: MOVE_COLOR$1 });
  if (model.maxStill !== void 0)
    rows.push({ kind: "max", label: maxLabels[1], value: model.maxStill, gate: model.maxStillGate, color: STILL_COLOR$1 });
  const plotBottom = TOP + rows.length * ROW_H;
  const height = plotBottom + AXIS_H;
  const tickFmt = (v2) => model.gateSizeChart >= 10 ? v2.toFixed(0) : String(Number(v2.toFixed(2)));
  const axis = [];
  for (let i2 = 0; i2 <= model.gateCount; i2++) {
    const gx = x2(model.gateSizeChart * i2);
    const val = model.gateSizeChart * i2;
    axis.push(w`
      <line x1=${gx} y1=${TOP} x2=${gx} y2=${plotBottom}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${gx} y=${plotBottom + 13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${gx} ${plotBottom + 13})" fill=${TXT2}>${tickFmt(val)} ${unit}</text>`);
  }
  const rowEls = rows.map((r2, i2) => {
    const y3 = TOP + i2 * ROW_H;
    const label = w`<text x=${LBL - 6} y=${y3 + MID} font-size="12"
      text-anchor="end" fill=${TXT2}>${rowLabel(r2)}</text>`;
    let content;
    if (r2.kind === "zones") {
      content = model.zones.map((z2, idx) => {
        const x0 = x2(z2.start);
        const x1 = x2(z2.end);
        const w$1 = x1 - x0;
        const showLabel = w$1 >= 40;
        return w`
          <rect x=${x0} y=${y3} width=${Math.max(1, w$1)} height=${BAR_H}
            rx="4" fill=${z2.color} opacity=${z2.occupied ? 0.95 : 0.6}></rect>
          ${showLabel ? w`<text x=${x0 + 6} y=${y3 + MID} font-size="13" font-weight="600"
                fill="#fff">Z${idx + 1}</text>` : A}
          <circle cx=${x1 - 11} cy=${y3 + BAR_H / 2} r="5"
            fill=${z2.occupied ? "#fff" : "none"} stroke="#fff" stroke-width="2"></circle>`;
      });
    } else if (r2.kind === "bar") {
      const xe = x2(r2.bar.value);
      content = w`
        <rect x=${LBL} y=${y3} width=${Math.max(1, xe - LBL)} height=${BAR_H}
          rx="4" fill=${r2.bar.color}></rect>
        ${valueLabel(xe, fmt(r2.bar.value), y3)}`;
    } else if (r2.kind === "gates") {
      const segs = [];
      for (let g2 = 0; g2 < model.gateCount; g2++) {
        const x0 = x2(model.gateSizeChart * g2);
        const x1 = x2(model.gateSizeChart * (g2 + 1));
        segs.push(w`
          <rect x=${x0} y=${y3} width=${Math.max(1, x1 - x0)} height=${BAR_H}
            fill=${gateColor(g2, model.gateCount)}></rect>
          <text x=${(x0 + x1) / 2} y=${y3 + MID} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${g2 + 1}</text>`);
      }
      content = segs;
    } else {
      const xe = x2(r2.value);
      const text = r2.gate !== void 0 ? `G${r2.gate}` : fmt(r2.value);
      content = w`
        <rect x=${LBL} y=${y3} width=${Math.max(1, xe - LBL)} height=${BAR_H}
          rx="4" fill=${r2.color} opacity="0.6"></rect>
        <text x=${(LBL + xe) / 2} y=${y3 + MID} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${text}</text>`;
    }
    return w`<g>
      <title>${rowTip(r2)}</title>
      <rect x="0" y=${y3} width=${WIDTH$1} height=${BAR_H} fill="transparent"></rect>
      ${label}${content}
    </g>`;
  });
  return b`
    <svg viewBox="0 0 ${WIDTH$1} ${height}" width="100%" role="img"
      aria-label="LD2410 distances">
      ${axis} ${rowEls}
    </svg>
  `;
}
var __defProp$1 = Object.defineProperty;
var __decorateClass$1 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
      result = decorator(target, key, result) || result;
  if (result) __defProp$1(target, key, result);
  return result;
};
const _ApolloLd2410DistanceCard = class _ApolloLd2410DistanceCard extends i {
  setConfig(config) {
    this._config = config;
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: "custom:apollo-radar-distance-card" };
  }
  /** Skip the hass ticks (most of them) that touch none of our entities. */
  shouldUpdate(changed) {
    if (!changed.has("hass") || changed.has("_config")) return true;
    const oldHass = changed.get("hass");
    if (!oldHass || !this.hass || !this._config) return true;
    if (oldHass.entities !== this.hass.entities || oldHass.devices !== this.hass.devices || oldHass.config !== this.hass.config) {
      return true;
    }
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return resolvedStatesChanged(oldHass, this.hass, this._resolved.ids);
  }
  render() {
    if (!this.hass || !this._config) return A;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const { map: m2, profile, ids } = this._resolved;
    if (!anyResolved(this.hass, ids)) return this._renderNotFound();
    const unit = isValidUom(this._config.distance_unit) ? this._config.distance_unit : defaultDistanceUnit(this.hass);
    const chart = renderDistanceChart(this.hass, m2, unit, profile == null ? void 0 : profile.maxBarLabels);
    if (chart === A) return A;
    return b`
      <ha-card .header=${this._config.title ?? "LD2410 Distances"}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }
  _renderNotFound() {
    var _a2;
    return b`
      <ha-card .header=${((_a2 = this._config) == null ? void 0 : _a2.title) ?? "LD2410 Distances"}>
        <div class="not-found">
          Apollo mmWave: device not found — check the card's device
          configuration.
        </div>
      </ha-card>
    `;
  }
};
_ApolloLd2410DistanceCard.styles = i$3`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `;
let ApolloLd2410DistanceCard = _ApolloLd2410DistanceCard;
__decorateClass$1([
  n2({ attribute: false })
], ApolloLd2410DistanceCard.prototype, "hass");
__decorateClass$1([
  r()
], ApolloLd2410DistanceCard.prototype, "_config");
if (!customElements.get("apollo-radar-distance-card")) {
  customElements.define("apollo-radar-distance-card", ApolloLd2410DistanceCard);
}
const customCards$1 = window.customCards = window.customCards || [];
if (!customCards$1.some((c2) => c2.type === "apollo-radar-distance-card")) {
  customCards$1.push({
    type: "apollo-radar-distance-card",
    name: "Apollo Radar Distance Chart",
    description: "Distance / zone chart for Apollo MSR (LD2410) & R-PRO (LD2412).",
    documentationURL: "https://github.com/bharvey88/apollo-mmwave"
  });
}
const MOVE_COLOR = "#4b0082";
const MOVE_THR_COLOR = "#9467bd";
const STILL_COLOR = "#274e13";
const STILL_THR_COLOR = "#8cb640";
function gateEnergyModel(hass, m2) {
  var _a2;
  let present = false;
  const seen = (id) => {
    if (id && id in hass.states) present = true;
  };
  const count = m2.move_threshold.length;
  const gates = Array.from({ length: count }, (_2, n3) => {
    seen(m2.move_energy[n3]);
    seen(m2.still_energy[n3]);
    seen(m2.move_threshold[n3]);
    seen(m2.still_threshold[n3]);
    return {
      index: n3,
      move: numState(hass, m2.move_energy[n3]) ?? 0,
      still: numState(hass, m2.still_energy[n3]) ?? 0,
      moveThr: numState(hass, m2.move_threshold[n3]),
      stillThr: numState(hass, m2.still_threshold[n3])
    };
  });
  return {
    engineeringMode: !!m2.engineering_mode && ((_a2 = hass.states[m2.engineering_mode]) == null ? void 0 : _a2.state) === "on",
    present,
    gates
  };
}
const WIDTH = 470;
const HEIGHT = 220;
const PAD_L = 26;
const PAD_B = 24;
const PAD_T = 10;
const PLOT_H = HEIGHT - PAD_B - PAD_T;
const MAX_ENERGY = 100;
function yFor(energy) {
  const clamped = Math.max(0, Math.min(MAX_ENERGY, energy));
  return PAD_T + PLOT_H * (1 - clamped / MAX_ENERGY);
}
function renderGateEnergyChart(hass, m2) {
  const model = gateEnergyModel(hass, m2);
  if (!model.present) return A;
  const slot = (WIDTH - PAD_L) / model.gates.length;
  const barW = slot * 0.32;
  const baseY = yFor(0);
  const bars = model.gates.map((g2) => {
    const cx = PAD_L + slot * g2.index + slot / 2;
    const moveX = cx - barW - 2;
    const stillX = cx + 2;
    const els = [];
    els.push(w`
      <rect x=${moveX} y=${yFor(g2.move)} width=${barW} height=${baseY - yFor(g2.move)}
        fill=${MOVE_COLOR}></rect>
      <rect x=${stillX} y=${yFor(g2.still)} width=${barW} height=${baseY - yFor(g2.still)}
        fill=${STILL_COLOR}></rect>
      <text x=${cx} y=${HEIGHT - 7} font-size="13" text-anchor="middle"
        fill="var(--secondary-text-color)">G${g2.index}</text>`);
    if (model.engineeringMode && g2.moveThr !== void 0) {
      const ty = yFor(g2.moveThr);
      const tx = moveX + barW / 2;
      els.push(w`<path d="M ${tx - 5} ${ty - 5} L ${tx - 5} ${ty + 5} L ${tx + 5} ${ty} Z"
        fill=${MOVE_THR_COLOR}></path>`);
    }
    if (model.engineeringMode && g2.stillThr !== void 0) {
      const ty = yFor(g2.stillThr);
      const tx = stillX + barW / 2;
      els.push(w`<path d="M ${tx + 5} ${ty - 5} L ${tx + 5} ${ty + 5} L ${tx - 5} ${ty} Z"
        fill=${STILL_THR_COLOR}></path>`);
    }
    return els;
  });
  const gridlines = [0, 25, 50, 75, 100].map(
    (v2) => w`
      <line x1=${PAD_L} y1=${yFor(v2)} x2=${WIDTH} y2=${yFor(v2)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${PAD_L - 4} y=${yFor(v2) + 3} font-size="11" text-anchor="end"
        fill="var(--secondary-text-color)">${v2}</text>`
  );
  const overlay = model.engineeringMode ? A : w`
        <rect x=${PAD_L} y=${PAD_T} width=${WIDTH - PAD_L} height=${PLOT_H}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${(WIDTH + PAD_L) / 2} y=${PAD_T + PLOT_H / 2} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${(WIDTH + PAD_L) / 2} dy="-4">Turn on Radar Engineering Mode</tspan>
          <tspan x=${(WIDTH + PAD_L) / 2} dy="28">to see gate energy values</tspan>
        </text>`;
  return b`
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img"
      aria-label="LD2410 gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A gate
        detects a target when its energy rises above the threshold. Turn on
        Radar Engineering Mode to see live energy.
      </title>
      ${gridlines} ${bars} ${overlay}
    </svg>
    <div class="chart-legend">
      <span><span style="color:${MOVE_COLOR}">■</span> Move energy</span>
      <span><span style="color:${STILL_COLOR}">■</span> Still energy</span>
      <span><span style="color:${MOVE_THR_COLOR}">▶</span> Move threshold</span>
      <span><span style="color:${STILL_THR_COLOR}">◀</span> Still threshold</span>
    </div>
  `;
}
var __defProp = Object.defineProperty;
var __decorateClass = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
      result = decorator(target, key, result) || result;
  if (result) __defProp(target, key, result);
  return result;
};
const _ApolloLd2410GateEnergyCard = class _ApolloLd2410GateEnergyCard extends i {
  setConfig(config) {
    this._config = config;
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: "custom:apollo-radar-gate-energy-card" };
  }
  /** Skip the hass ticks (most of them) that touch none of our entities. */
  shouldUpdate(changed) {
    if (!changed.has("hass") || changed.has("_config")) return true;
    const oldHass = changed.get("hass");
    if (!oldHass || !this.hass || !this._config) return true;
    if (oldHass.entities !== this.hass.entities || oldHass.devices !== this.hass.devices) {
      return true;
    }
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return resolvedStatesChanged(oldHass, this.hass, this._resolved.ids);
  }
  render() {
    if (!this.hass || !this._config) return A;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const { map: m2, ids } = this._resolved;
    if (!anyResolved(this.hass, ids)) return this._renderNotFound();
    const chart = renderGateEnergyChart(this.hass, m2);
    if (chart === A) return A;
    return b`
      <ha-card .header=${this._config.title ?? "LD2410 Gate Energy"}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }
  _renderNotFound() {
    var _a2;
    return b`
      <ha-card .header=${((_a2 = this._config) == null ? void 0 : _a2.title) ?? "LD2410 Gate Energy"}>
        <div class="not-found">
          Apollo mmWave: device not found — check the card's device
          configuration.
        </div>
      </ha-card>
    `;
  }
};
_ApolloLd2410GateEnergyCard.styles = i$3`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
    .chart-legend {
      font-size: 0.8em;
      color: var(--secondary-text-color);
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      margin-top: 6px;
    }
  `;
let ApolloLd2410GateEnergyCard = _ApolloLd2410GateEnergyCard;
__decorateClass([
  n2({ attribute: false })
], ApolloLd2410GateEnergyCard.prototype, "hass");
__decorateClass([
  r()
], ApolloLd2410GateEnergyCard.prototype, "_config");
if (!customElements.get("apollo-radar-gate-energy-card")) {
  customElements.define("apollo-radar-gate-energy-card", ApolloLd2410GateEnergyCard);
}
const customCards = window.customCards = window.customCards || [];
if (!customCards.some((c2) => c2.type === "apollo-radar-gate-energy-card")) {
  customCards.push({
    type: "apollo-radar-gate-energy-card",
    name: "Apollo Radar Gate Energy Chart",
    description: "Per-gate move/still energy chart for Apollo MSR (LD2410) & R-PRO (LD2412).",
    documentationURL: "https://github.com/bharvey88/apollo-mmwave"
  });
}
function ld2450TargetPairs(base) {
  return [1, 2, 3].map((n3) => ({
    x: `sensor.${base}_ld2450_target_${n3}_x`,
    y: `sensor.${base}_ld2450_target_${n3}_y`
  }));
}
const TARGET_X = /_ld2450_target_(\d+)_x(?:_\d+)?$/;
function hasLd2450Device(hass, deviceId) {
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    if (TARGET_X.test(id.slice(id.indexOf(".") + 1))) return true;
  }
  return false;
}
function hasLd2450(hass, base) {
  return ld2450TargetPairs(base).some((p2) => p2.x in hass.states);
}
function zoneMapperCard(base, location) {
  return {
    type: "custom:zone-mapper-card",
    location: location || base,
    unit_display: true
  };
}
function row(entity, name) {
  return entity ? [{ entity, name }] : [];
}
function controlRows(m2) {
  return [
    ...row(m2.engineering_mode, "Radar Engineering Mode"),
    ...row(m2.bluetooth, "Bluetooth"),
    ...row(m2.restart_radar, "Restart Radar"),
    ...row(m2.factory_reset_radar, "Factory Reset Radar"),
    ...row(m2.esp_reboot, "ESP Reboot")
  ];
}
function rangeRows(m2, rangeLabels, gateSizeLabel) {
  return [
    ...row(m2.radar_timeout, "Radar Timeout"),
    ...row(m2.gate_size, gateSizeLabel),
    ...row(m2.max_move_distance, rangeLabels[0]),
    ...row(m2.max_still_distance, rangeLabels[1])
  ];
}
function zoneConfigRows(m2) {
  return [
    ...row(m2.zone_1_start, "Start Zone 1"),
    ...row(m2.end_zone_1, "End Zone 1"),
    ...row(m2.end_zone_2, "End Zone 2"),
    ...row(m2.end_zone_3, "End Zone 3")
  ];
}
function moveThresholdRows(m2) {
  const rows = [];
  for (let n3 = 0; n3 < m2.move_threshold.length; n3++) {
    rows.push(...row(m2.move_threshold[n3], `G${n3}`));
  }
  return rows;
}
function stillThresholdRows(m2) {
  const rows = [];
  for (let n3 = 0; n3 < m2.still_threshold.length; n3++) {
    rows.push(...row(m2.still_threshold[n3], `G${n3}`));
  }
  return rows;
}
function occupancyRows(m2) {
  return [
    ...row(m2.radar_target, "Radar Target"),
    ...row(m2.moving_target, "Radar Moving Target"),
    ...row(m2.still_target, "Radar Still Target"),
    ...row(m2.zone_1_occupancy, "Radar Zone 1 Occupancy"),
    ...row(m2.zone_2_occupancy, "Radar Zone 2 Occupancy"),
    ...row(m2.zone_3_occupancy, "Radar Zone 3 Occupancy")
  ];
}
function presentRows(hass, rows) {
  return rows.filter((r2) => exists(hass, r2.entity));
}
function historyEntities(m2) {
  const rows = [];
  const push = (entity, name) => {
    if (entity) rows.push({ entity, name });
  };
  push(m2.radar_target, "Detected");
  push(m2.zone_1_occupancy, "Zone 1");
  push(m2.zone_2_occupancy, "Zone 2");
  push(m2.zone_3_occupancy, "Zone 3");
  return rows;
}
function deviceHasEntities(hass, deviceId) {
  return Object.values(hass.entities).some((e2) => e2.device_id === deviceId);
}
function deviceFromId(hass, deviceId) {
  const d2 = hass.devices[deviceId];
  const reg = apolloModelInfo(d2);
  if (reg && !deviceHasEntities(hass, deviceId)) return void 0;
  const base = baseNameFromDevice(hass, deviceId);
  if (!reg && !base) return void 0;
  const profile = detectProfileFromEntities(hass, deviceId) ?? (reg == null ? void 0 : reg.profile);
  const ld2450 = hasLd2450Device(hass, deviceId) || (base ? hasLd2450(hass, base) : false) || ((reg == null ? void 0 : reg.ld2450) ?? false);
  if (!profile && !ld2450) return void 0;
  return {
    deviceId,
    // The base doubles as the view path, so a registry-matched device whose
    // entity names yield no base still needs a stable unique key.
    base: base ?? deviceId,
    name: (d2 == null ? void 0 : d2.name_by_user) || (d2 == null ? void 0 : d2.name) || base || deviceId,
    profile,
    ld2450
  };
}
function detectRadarDevices(hass) {
  const out = [];
  for (const deviceId of Object.keys(hass.devices)) {
    const dev = deviceFromId(hass, deviceId);
    if (dev) out.push(dev);
  }
  return out;
}
function targetDevices(hass, config) {
  if (config.device_id) {
    const d2 = deviceFromId(hass, config.device_id);
    return d2 ? [d2] : [];
  }
  return detectRadarDevices(hass);
}
function entitiesCard(title, rows) {
  if (rows.length === 0) return void 0;
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    entities: rows.map((r2) => ({ entity: r2.entity, name: r2.name }))
  };
}
function helpCard(dev) {
  if (!dev.profile) {
    return {
      type: "markdown",
      content: `**${dev.name}** — Apollo mmWave (LD2450 tracking radar).

Draw occupancy zones over the live target positions below.`
    };
  }
  return {
    type: "markdown",
    content: `**${dev.name}** — Apollo ${dev.profile.label} radar.

New to tuning? [How to configure this sensor →](${dev.profile.wikiUrl})`
  };
}
function noteCard(text) {
  return { type: "markdown", content: text };
}
function cardMap(hass, dev, distanceUnit) {
  const cards = { help: helpCard(dev) };
  if (dev.profile) {
    const profile = dev.profile;
    const m2 = entityMapFromDevice(hass, dev.deviceId) ?? profile.entityMap(dev.base);
    const label = profile.label;
    const historyRows = historyEntities(m2).filter((r2) => r2.entity in hass.states);
    const range = entitiesCard(
      `${label} Detection Range`,
      presentRows(hass, rangeRows(m2, profile.rangeLabels, profile.gateSizeLabel))
    );
    const moveThr = entitiesCard(
      `${label} Move Thresholds`,
      presentRows(hass, moveThresholdRows(m2))
    );
    const stillThr = entitiesCard(
      `${label} Still Thresholds`,
      presentRows(hass, stillThresholdRows(m2))
    );
    cards.controls = entitiesCard(
      `${label} Controls`,
      presentRows(hass, controlRows(m2))
    );
    cards.range = range;
    cards.rangeNote = range ? noteCard(profile.rangeTip) : void 0;
    cards.zone = entitiesCard(
      `${label} Zone Config`,
      presentRows(hass, zoneConfigRows(m2))
    );
    cards.distance = {
      type: "custom:apollo-radar-distance-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Distances`,
      ...distanceUnit ? { distance_unit: distanceUnit } : {}
    };
    cards.gateEnergy = {
      type: "custom:apollo-radar-gate-energy-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Gate Energy`
    };
    cards.moveThr = moveThr;
    cards.stillThr = stillThr;
    cards.gateNote = moveThr || stillThr ? noteCard(profile.gateTip) : void 0;
    cards.occupancy = entitiesCard(
      `${label} Target / Occupancy`,
      presentRows(hass, occupancyRows(m2))
    );
    cards.history = historyRows.length ? {
      type: "history-graph",
      title: `${label} Occupancy History`,
      hours_to_show: 1,
      entities: historyRows
    } : void 0;
  }
  if (dev.ld2450) {
    cards.zoneHeader = dev.profile ? { type: "heading", heading: "Zone Map" } : void 0;
    cards.zoneMap = zoneMapperCard(dev.base, dev.name);
  }
  return cards;
}
function buildDeviceCards(hass, dev, distanceUnit) {
  const c2 = cardMap(hass, dev, distanceUnit);
  return [
    c2.help,
    c2.controls,
    c2.range,
    c2.rangeNote,
    c2.zone,
    c2.distance,
    c2.gateEnergy,
    c2.moveThr,
    c2.stillThr,
    c2.gateNote,
    c2.occupancy,
    c2.history,
    c2.zoneHeader,
    c2.zoneMap
  ].filter(Boolean);
}
function buildDeviceSections(hass, dev, distanceUnit) {
  const c2 = cardMap(hass, dev, distanceUnit);
  const columns = [];
  if (dev.profile) {
    const col1 = [c2.help, c2.controls, c2.zone];
    const col2 = [
      c2.distance,
      c2.range,
      c2.rangeNote
    ];
    (c2.zone ? col2 : col1).push(c2.occupancy);
    columns.push(
      col1,
      col2,
      [c2.gateEnergy, c2.moveThr, c2.gateNote],
      [c2.history, c2.stillThr]
    );
  }
  if (c2.zoneMap) {
    columns.push([c2.zoneHeader, c2.zoneMap]);
  }
  return columns.map((col) => col.filter(Boolean)).filter((col) => col.length > 0).map((cards) => ({ type: "grid", cards }));
}
function deviceView(hass, dev, distanceUnit) {
  return {
    title: dev.name,
    path: dev.base,
    type: "sections",
    sections: buildDeviceSections(hass, dev, distanceUnit)
  };
}
function generateViews(hass, config) {
  return targetDevices(hass, config).map(
    (d2) => deviceView(hass, d2, config.distance_unit)
  );
}
function generateSections(hass, config) {
  return targetDevices(hass, config).flatMap(
    (d2) => buildDeviceSections(hass, d2, config.distance_unit)
  );
}
function generateCards(hass, config) {
  return targetDevices(hass, config).flatMap(
    (d2) => buildDeviceCards(hass, d2, config.distance_unit)
  );
}
function radarDeviceKey(hass) {
  return detectRadarDevices(hass).map((d2) => d2.deviceId).sort().join(",");
}
function shouldRegenerate(_config, oldHass, newHass) {
  if (oldHass.devices === newHass.devices && oldHass.entities === newHass.entities) {
    return false;
  }
  return radarDeviceKey(oldHass) !== radarDeviceKey(newHass);
}
const EMPTY_VIEW = {
  title: "Apollo Radar Tuning",
  cards: [
    {
      type: "markdown",
      content: "No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), R-PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant."
    }
  ]
};
const _ApolloLd2410ViewStrategy = class _ApolloLd2410ViewStrategy extends HTMLElement {
  static async generate(config, hass) {
    return { type: "sections", sections: generateSections(hass, config) };
  }
};
_ApolloLd2410ViewStrategy.shouldRegenerate = shouldRegenerate;
let ApolloLd2410ViewStrategy = _ApolloLd2410ViewStrategy;
const _ApolloLd2410DashboardStrategy = class _ApolloLd2410DashboardStrategy extends HTMLElement {
  static async generate(config, hass) {
    const views = generateViews(hass, config);
    return {
      title: "Apollo Radar Tuning",
      views: views.length ? views : [EMPTY_VIEW]
    };
  }
};
_ApolloLd2410DashboardStrategy.shouldRegenerate = shouldRegenerate;
let ApolloLd2410DashboardStrategy = _ApolloLd2410DashboardStrategy;
const _ApolloRadarSectionStrategy = class _ApolloRadarSectionStrategy extends HTMLElement {
  static async generate(config, hass) {
    return { type: "grid", cards: generateCards(hass, config) };
  }
};
_ApolloRadarSectionStrategy.shouldRegenerate = shouldRegenerate;
let ApolloRadarSectionStrategy = _ApolloRadarSectionStrategy;
if (!customElements.get("ll-strategy-view-apollo-radar-tuning")) {
  customElements.define(
    "ll-strategy-view-apollo-radar-tuning",
    ApolloLd2410ViewStrategy
  );
}
if (!customElements.get("ll-strategy-section-apollo-radar-tuning")) {
  customElements.define(
    "ll-strategy-section-apollo-radar-tuning",
    ApolloRadarSectionStrategy
  );
}
if (!customElements.get("ll-strategy-dashboard-apollo-radar-tuning")) {
  customElements.define(
    "ll-strategy-dashboard-apollo-radar-tuning",
    ApolloLd2410DashboardStrategy
  );
}
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some(
  (s2) => s2.type === "apollo-radar-tuning"
)) {
  window.customStrategies.push({
    type: "apollo-radar-tuning",
    strategyType: "dashboard",
    name: "Apollo Radar Tuning",
    description: "Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R-PRO / LD2412).",
    documentationURL: "https://github.com/bharvey88/apollo-mmwave"
  });
}
const CARD_VERSION = "1.2.1";
console.info(
  `%c APOLLO-MMWAVE %c v${CARD_VERSION} `,
  "color:#fff;background:#03a9f4;font-weight:700;",
  "color:#03a9f4;background:#fff;font-weight:700;"
);
export {
  CARD_VERSION
};
