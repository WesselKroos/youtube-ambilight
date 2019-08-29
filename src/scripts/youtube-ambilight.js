//// Sentry error reporting
let AmbilightSentry = {
  captureException: (ex) => { },
  captureExceptionWithDetails: (ex) => { }
}

try {
  /*! @sentry/browser 5.6.2 (400594db) | https://github.com/getsentry/sentry-javascript */
  AmbilightSentry = function (n) { var t = function (n, r) { return (t = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function (n, t) { n.__proto__ = t } || function (n, t) { for (var r in t) t.hasOwnProperty(r) && (n[r] = t[r]) })(n, r) }; function r(n, r) { function e() { this.constructor = n } t(n, r), n.prototype = null === r ? Object.create(r) : (e.prototype = r.prototype, new e) } var e = function () { return (e = Object.assign || function (n) { for (var t, r = 1, e = arguments.length; r < e; r++)for (var i in t = arguments[r]) Object.prototype.hasOwnProperty.call(t, i) && (n[i] = t[i]); return n }).apply(this, arguments) }; function i(n, t) { var r = "function" == typeof Symbol && n[Symbol.iterator]; if (!r) return n; var e, i, o = r.call(n), u = []; try { for (; (void 0 === t || t-- > 0) && !(e = o.next()).done;)u.push(e.value) } catch (n) { i = { error: n } } finally { try { e && !e.done && (r = o.return) && r.call(o) } finally { if (i) throw i.error } } return u } function o() { for (var n = [], t = 0; t < arguments.length; t++)n = n.concat(i(arguments[t])); return n } var u, c, s; !function (n) { n[n.None = 0] = "None", n[n.Error = 1] = "Error", n[n.Debug = 2] = "Debug", n[n.Verbose = 3] = "Verbose" }(u || (u = {})), (c = n.Severity || (n.Severity = {})).Fatal = "fatal", c.Error = "error", c.Warning = "warning", c.Log = "log", c.Info = "info", c.Debug = "debug", c.Critical = "critical", function (n) { n.fromString = function (t) { switch (t) { case "debug": return n.Debug; case "info": return n.Info; case "warn": case "warning": return n.Warning; case "error": return n.Error; case "fatal": return n.Fatal; case "critical": return n.Critical; case "log": default: return n.Log } } }(n.Severity || (n.Severity = {})), (s = n.Status || (n.Status = {})).Unknown = "unknown", s.Skipped = "skipped", s.Success = "success", s.RateLimit = "rate_limit", s.Invalid = "invalid", s.Failed = "failed", function (n) { n.fromHttpCode = function (t) { return t >= 200 && t < 300 ? n.Success : 429 === t ? n.RateLimit : t >= 400 && t < 500 ? n.Invalid : t >= 500 ? n.Failed : n.Unknown } }(n.Status || (n.Status = {})); var a = Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? function (n, t) { return n.__proto__ = t, n } : function (n, t) { for (var r in t) n.hasOwnProperty(r) || (n[r] = t[r]); return n }); var f = function (n) { function t(t) { var r = this.constructor, e = n.call(this, t) || this; return e.message = t, e.name = r.prototype.constructor.name, a(e, r.prototype), e } return r(t, n), t }(Error); function h(n) { switch (Object.prototype.toString.call(n)) { case "[object Error]": case "[object Exception]": case "[object DOMException]": return !0; default: return n instanceof Error } } function l(n) { return "[object ErrorEvent]" === Object.prototype.toString.call(n) } function v(n) { return "[object DOMError]" === Object.prototype.toString.call(n) } function d(n) { return "[object String]" === Object.prototype.toString.call(n) } function p(n) { return null === n || "object" != typeof n && "function" != typeof n } function m(n) { return "[object Object]" === Object.prototype.toString.call(n) } function y(n) { return Boolean(n && n.then && "function" == typeof n.then) } var b = {}; function w() { return "[object process]" === Object.prototype.toString.call("undefined" != typeof process ? process : 0) ? global : "undefined" != typeof window ? window : "undefined" != typeof self ? self : b } function g() { var n = w(), t = n.crypto || n.msCrypto; if (void 0 !== t && t.getRandomValues) { var r = new Uint16Array(8); t.getRandomValues(r), r[3] = 4095 & r[3] | 16384, r[4] = 16383 & r[4] | 32768; var e = function (n) { for (var t = n.toString(16); t.length < 4;)t = "0" + t; return t }; return e(r[0]) + e(r[1]) + e(r[2]) + e(r[3]) + e(r[4]) + e(r[5]) + e(r[6]) + e(r[7]) } return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function (n) { var t = 16 * Math.random() | 0; return ("x" === n ? t : 3 & t | 8).toString(16) }) } function E(n) { if (!n) return {}; var t = n.match(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/); if (!t) return {}; var r = t[6] || "", e = t[8] || ""; return { host: t[4], path: t[5], protocol: t[2], relative: t[5] + r + e } } function j(n) { if (n.message) return n.message; if (n.exception && n.exception.values && n.exception.values[0]) { var t = n.exception.values[0]; return t.type && t.value ? t.type + ": " + t.value : t.type || t.value || n.event_id || "<unknown>" } return n.event_id || "<unknown>" } function x(n) { var t = w(); if (!("console" in t)) return n(); var r = t.console, e = {};["debug", "info", "warn", "error", "log", "assert"].forEach(function (n) { n in t.console && r[n].__sentry__ && (e[n] = r[n].__sentry_wrapped__, r[n] = r[n].__sentry_original__) }); var i = n(); return Object.keys(e).forEach(function (n) { r[n] = e[n] }), i } function _(n, t, r, e) { void 0 === e && (e = { handled: !0, type: "generic" }), n.exception = n.exception || {}, n.exception.values = n.exception.values || [], n.exception.values[0] = n.exception.values[0] || {}, n.exception.values[0].value = n.exception.values[0].value || t || "", n.exception.values[0].type = n.exception.values[0].type || r || "Error", n.exception.values[0].mechanism = n.exception.values[0].mechanism || e } var S = w(), O = "Sentry Logger ", k = function () { function n() { this.t = !1 } return n.prototype.disable = function () { this.t = !1 }, n.prototype.enable = function () { this.t = !0 }, n.prototype.log = function () { for (var n = [], t = 0; t < arguments.length; t++)n[t] = arguments[t]; this.t && x(function () { S.console.log(O + "[Log]: " + n.join(" ")) }) }, n.prototype.warn = function () { for (var n = [], t = 0; t < arguments.length; t++)n[t] = arguments[t]; this.t && x(function () { S.console.warn(O + "[Warn]: " + n.join(" ")) }) }, n.prototype.error = function () { for (var n = [], t = 0; t < arguments.length; t++)n[t] = arguments[t]; this.t && x(function () { S.console.error(O + "[Error]: " + n.join(" ")) }) }, n }(); S.__SENTRY__ = S.__SENTRY__ || {}; var T = S.__SENTRY__.logger || (S.__SENTRY__.logger = new k), R = function () { function n() { this.i = "function" == typeof WeakSet, this.o = this.i ? new WeakSet : [] } return n.prototype.memoize = function (n) { if (this.i) return !!this.o.has(n) || (this.o.add(n), !1); for (var t = 0; t < this.o.length; t++) { if (this.o[t] === n) return !0 } return this.o.push(n), !1 }, n.prototype.unmemoize = function (n) { if (this.i) this.o.delete(n); else for (var t = 0; t < this.o.length; t++)if (this.o[t] === n) { this.o.splice(t, 1); break } }, n }(); function D(n, t, r) { if (t in n) { var e = n[t], i = r(e); if ("function" == typeof i) try { i.prototype = i.prototype || {}, Object.defineProperties(i, { __sentry__: { enumerable: !1, value: !0 }, __sentry_original__: { enumerable: !1, value: e }, __sentry_wrapped__: { enumerable: !1, value: i } }) } catch (n) { } n[t] = i } } function I(n) { return function (n) { return ~-encodeURI(n).split(/%..|./).length }(JSON.stringify(n)) } function N(n, t, r) { void 0 === t && (t = 3), void 0 === r && (r = 102400); var e = U(n, t); return I(e) > r ? N(n, t - 1, r) : e } function C(n, t) { return "domain" === t && "object" == typeof n && n.u ? "[Domain]" : "domainEmitter" === t ? "[DomainEmitter]" : "undefined" != typeof global && n === global ? "[Global]" : "undefined" != typeof window && n === window ? "[Window]" : "undefined" != typeof document && n === document ? "[Document]" : "undefined" != typeof Event && n instanceof Event ? Object.getPrototypeOf(n) ? n.constructor.name : "Event" : m(r = n) && "nativeEvent" in r && "preventDefault" in r && "stopPropagation" in r ? "[SyntheticEvent]" : Number.isNaN(n) ? "[NaN]" : void 0 === n ? "[undefined]" : "function" == typeof n ? "[Function: " + (n.name || "<unknown-function-name>") + "]" : n; var r } function A(n, t, r, e) { if (void 0 === r && (r = 1 / 0), void 0 === e && (e = new R), 0 === r) return function (n) { var t = Object.prototype.toString.call(n); if ("string" == typeof n) return n; if ("[object Object]" === t) return "[Object]"; if ("[object Array]" === t) return "[Array]"; var r = C(n); return p(r) ? r : t }(t); if (null != t && "function" == typeof t.toJSON) return t.toJSON(); var i = C(t, n); if (p(i)) return i; var o = h(t) ? function (n) { var t = { message: n.message, name: n.name, stack: n.stack }; for (var r in n) Object.prototype.hasOwnProperty.call(n, r) && (t[r] = n[r]); return t }(t) : t, u = Array.isArray(t) ? [] : {}; if (e.memoize(t)) return "[Circular ~]"; for (var c in o) Object.prototype.hasOwnProperty.call(o, c) && (u[c] = A(c, o[c], r - 1, e)); return e.unmemoize(t), u } function U(n, t) { try { return JSON.parse(JSON.stringify(n, function (n, r) { return A(n, r, t) })) } catch (n) { return "**non-serializable**" } } var L, M = function () { function n(n) { this.s = n, this.h = [] } return n.prototype.isReady = function () { return void 0 === this.s || this.length() < this.s }, n.prototype.add = function (n) { var t = this; return this.isReady() ? (-1 === this.h.indexOf(n) && this.h.push(n), n.then(function () { return t.remove(n) }).catch(function () { return t.remove(n).catch(function () { }) }), n) : Promise.reject(new f("Not adding Promise due to buffer limit reached.")) }, n.prototype.remove = function (n) { return this.h.splice(this.h.indexOf(n), 1)[0] }, n.prototype.length = function () { return this.h.length }, n.prototype.drain = function (n) { var t = this; return new Promise(function (r) { var e = setTimeout(function () { n && n > 0 && r(!1) }, n); Promise.all(t.h).then(function () { clearTimeout(e), r(!0) }).catch(function () { r(!0) }) }) }, n }(); function F(n, t) { return void 0 === t && (t = 0), "string" != typeof n || 0 === t ? n : n.length <= t ? n : n.substr(0, t) + "..." } function P(n, t) { if (!Array.isArray(n)) return ""; for (var r = [], e = 0; e < n.length; e++) { var i = n[e]; try { r.push(String(i)) } catch (n) { r.push("[value cannot be serialized]") } } return r.join(t) } function $(n, t) { if (void 0 === t && (t = 40), !n.length) return "[object has no keys]"; if (n[0].length >= t) return F(n[0], t); for (var r = n.length; r > 0; r--) { var e = n.slice(0, r).join(", "); if (!(e.length > t)) return r === n.length ? e : F(e, t) } return "" } function q(n, t) { return r = t, "[object RegExp]" === Object.prototype.toString.call(r) ? t.test(n) : "string" == typeof t && n.includes(t); var r } function H() { if (!("fetch" in w())) return !1; try { return new Headers, new Request(""), new Response, !0 } catch (n) { return !1 } } function W() { if (!H()) return !1; try { return new Request("_", { referrerPolicy: "origin" }), !0 } catch (n) { return !1 } } !function (n) { n.PENDING = "PENDING", n.RESOLVED = "RESOLVED", n.REJECTED = "REJECTED" }(L || (L = {})); var B = function () { function n(n) { var t = this; this.l = L.PENDING, this.v = [], this.p = function (n) { t.m(n, L.RESOLVED) }, this.g = function (n) { t.m(n, L.REJECTED) }, this.m = function (n, r) { t.l === L.PENDING && (y(n) ? n.then(t.p, t.g) : (t.j = n, t.l = r, t._())) }, this._ = function () { t.l !== L.PENDING && (t.l === L.REJECTED ? t.v.forEach(function (n) { return n.onFail && n.onFail(t.j) }) : t.v.forEach(function (n) { return n.onSuccess && n.onSuccess(t.j) }), t.v = []) }, this.S = function (n) { t.v = t.v.concat(n), t._() }; try { n(this.p, this.g) } catch (n) { this.g(n) } } return n.prototype.then = function (t, r) { var e = this; return new n(function (n, i) { e.S({ onFail: function (t) { if (r) try { return void n(r(t)) } catch (n) { return void i(n) } else i(t) }, onSuccess: function (r) { if (t) try { return void n(t(r)) } catch (n) { return void i(n) } else n(r) } }) }) }, n.prototype.catch = function (n) { return this.then(function (n) { return n }, n) }, n.prototype.toString = function () { return "[object SyncPromise]" }, n.resolve = function (t) { return new n(function (n) { n(t) }) }, n.reject = function (t) { return new n(function (n, r) { r(t) }) }, n }(), J = /^[ \t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \t]*$/, X = function () { function n(n, t, r, e) { void 0 === n && (n = g()), void 0 === t && (t = g().substring(16)), this.O = n, this.k = t, this.T = r, this.R = e } return n.prototype.setParent = function (n) { return this.R = n, this }, n.prototype.setSampled = function (n) { return this.T = n, this }, n.fromTraceparent = function (t) { var r = t.match(J); if (r) { var e = void 0; "1" === r[3] ? e = !0 : "0" === r[3] && (e = !1); var i = new n(r[1], r[2], e); return new n(r[1], void 0, e, i) } }, n.prototype.toTraceparent = function () { var n = ""; return !0 === this.T ? n = "-1" : !1 === this.T && (n = "-0"), this.O + "-" + this.k + n }, n.prototype.toJSON = function () { return { parent: this.R && this.R.toJSON() || void 0, sampled: this.T, span_id: this.k, trace_id: this.O } }, n }(), z = function () { function n() { this.D = !1, this.I = [], this.N = [], this.C = [], this.A = {}, this.U = {}, this.L = {}, this.M = {} } return n.prototype.addScopeListener = function (n) { this.I.push(n) }, n.prototype.addEventProcessor = function (n) { return this.N.push(n), this }, n.prototype.F = function () { var n = this; this.D || (this.D = !0, setTimeout(function () { n.I.forEach(function (t) { t(n) }), n.D = !1 })) }, n.prototype.P = function (n, t, r, i) { var o = this; return void 0 === i && (i = 0), new B(function (u, c) { var s = n[i]; if (null === t || "function" != typeof s) u(t); else { var a = s(e({}, t), r); y(a) ? a.then(function (t) { return o.P(n, t, r, i + 1).then(u) }).catch(c) : o.P(n, a, r, i + 1).then(u).catch(c) } }) }, n.prototype.setUser = function (n) { return this.A = U(n), this.F(), this }, n.prototype.setTags = function (n) { return this.U = e({}, this.U, U(n)), this.F(), this }, n.prototype.setTag = function (n, t) { var r; return this.U = e({}, this.U, ((r = {})[n] = U(t), r)), this.F(), this }, n.prototype.setExtras = function (n) { return this.L = e({}, this.L, U(n)), this.F(), this }, n.prototype.setExtra = function (n, t) { var r; return this.L = e({}, this.L, ((r = {})[n] = U(t), r)), this.F(), this }, n.prototype.setFingerprint = function (n) { return this.$ = U(n), this.F(), this }, n.prototype.setLevel = function (n) { return this.q = U(n), this.F(), this }, n.prototype.setTransaction = function (n) { return this.H = n, this.F(), this }, n.prototype.setContext = function (n, t) { return this.M[n] = t ? U(t) : void 0, this.F(), this }, n.prototype.setSpan = function (n) { return this.W = n, this.F(), this }, n.prototype.startSpan = function (n) { var t = new X; return t.setParent(n), this.setSpan(t), t }, n.prototype.getSpan = function () { return this.W }, n.clone = function (t) { var r = new n; return Object.assign(r, t, { I: [] }), t && (r.C = o(t.C), r.U = e({}, t.U), r.L = e({}, t.L), r.M = e({}, t.M), r.A = t.A, r.q = t.q, r.W = t.W, r.H = t.H, r.$ = t.$, r.N = o(t.N)), r }, n.prototype.clear = function () { return this.C = [], this.U = {}, this.L = {}, this.A = {}, this.M = {}, this.q = void 0, this.H = void 0, this.$ = void 0, this.W = void 0, this.F(), this }, n.prototype.addBreadcrumb = function (n, t) { var r = (new Date).getTime() / 1e3, i = e({ timestamp: r }, n); return this.C = void 0 !== t && t >= 0 ? o(this.C, [U(i)]).slice(-t) : o(this.C, [U(i)]), this.F(), this }, n.prototype.clearBreadcrumbs = function () { return this.C = [], this.F(), this }, n.prototype.B = function (n) { n.fingerprint = n.fingerprint ? Array.isArray(n.fingerprint) ? n.fingerprint : [n.fingerprint] : [], this.$ && (n.fingerprint = n.fingerprint.concat(this.$)), n.fingerprint && !n.fingerprint.length && delete n.fingerprint }, n.prototype.applyToEvent = function (n, t) { return this.L && Object.keys(this.L).length && (n.extra = e({}, this.L, n.extra)), this.U && Object.keys(this.U).length && (n.tags = e({}, this.U, n.tags)), this.A && Object.keys(this.A).length && (n.user = e({}, this.A, n.user)), this.M && Object.keys(this.M).length && (n.contexts = e({}, this.M, n.contexts)), this.q && (n.level = this.q), this.H && (n.transaction = this.H), this.W && (n.contexts = n.contexts || {}, n.contexts.trace = this.W), this.B(n), n.breadcrumbs = o(n.breadcrumbs || [], this.C), n.breadcrumbs = n.breadcrumbs.length > 0 ? n.breadcrumbs : void 0, this.P(o(G(), this.N), n, t) }, n }(); function G() { var n = w(); return n.__SENTRY__ = n.__SENTRY__ || {}, n.__SENTRY__.globalEventProcessors = n.__SENTRY__.globalEventProcessors || [], n.__SENTRY__.globalEventProcessors } function V(n) { G().push(n) } var K = 3, Z = function () { function n(n, t, r) { void 0 === t && (t = new z), void 0 === r && (r = K), this.J = r, this.X = [], this.X.push({ client: n, scope: t }) } return n.prototype.G = function (n) { for (var t, r = [], e = 1; e < arguments.length; e++)r[e - 1] = arguments[e]; var i = this.getStackTop(); i && i.client && i.client[n] && (t = i.client)[n].apply(t, o(r, [i.scope])) }, n.prototype.isOlderThan = function (n) { return this.J < n }, n.prototype.bindClient = function (n) { this.getStackTop().client = n }, n.prototype.pushScope = function () { var n = this.getStack(), t = n.length > 0 ? n[n.length - 1].scope : void 0, r = z.clone(t); return this.getStack().push({ client: this.getClient(), scope: r }), r }, n.prototype.popScope = function () { return void 0 !== this.getStack().pop() }, n.prototype.withScope = function (n) { var t = this.pushScope(); try { n(t) } finally { this.popScope() } }, n.prototype.getClient = function () { return this.getStackTop().client }, n.prototype.getScope = function () { return this.getStackTop().scope }, n.prototype.getStack = function () { return this.X }, n.prototype.getStackTop = function () { return this.X[this.X.length - 1] }, n.prototype.captureException = function (n, t) { var r = this.V = g(), i = t; if (!t) { var o = void 0; try { throw new Error("Sentry syntheticException") } catch (n) { o = n } i = { originalException: n, syntheticException: o } } return this.G("captureException", n, e({}, i, { event_id: r })), r }, n.prototype.captureMessage = function (n, t, r) { var i = this.V = g(), o = r; if (!r) { var u = void 0; try { throw new Error(n) } catch (n) { u = n } o = { originalException: n, syntheticException: u } } return this.G("captureMessage", n, t, e({}, o, { event_id: i })), i }, n.prototype.captureEvent = function (n, t) { var r = this.V = g(); return this.G("captureEvent", n, e({}, t, { event_id: r })), r }, n.prototype.lastEventId = function () { return this.V }, n.prototype.addBreadcrumb = function (n, t) { var r = this.getStackTop(); if (r.scope && r.client) { var i = r.client.getOptions && r.client.getOptions() || {}, o = i.beforeBreadcrumb, u = void 0 === o ? null : o, c = i.maxBreadcrumbs, s = void 0 === c ? 30 : c; if (!(s <= 0)) { var a = (new Date).getTime() / 1e3, f = e({ timestamp: a }, n), h = u ? x(function () { return u(f, t) }) : f; null !== h && r.scope.addBreadcrumb(h, Math.min(s, 100)) } } }, n.prototype.setUser = function (n) { var t = this.getStackTop(); t.scope && t.scope.setUser(n) }, n.prototype.setTags = function (n) { var t = this.getStackTop(); t.scope && t.scope.setTags(n) }, n.prototype.setExtras = function (n) { var t = this.getStackTop(); t.scope && t.scope.setExtras(n) }, n.prototype.setTag = function (n, t) { var r = this.getStackTop(); r.scope && r.scope.setTag(n, t) }, n.prototype.setExtra = function (n, t) { var r = this.getStackTop(); r.scope && r.scope.setExtra(n, t) }, n.prototype.setContext = function (n, t) { var r = this.getStackTop(); r.scope && r.scope.setContext(n, t) }, n.prototype.configureScope = function (n) { var t = this.getStackTop(); t.scope && t.client && n(t.scope) }, n.prototype.run = function (n) { var t = Y(this); try { n(this) } finally { Y(t) } }, n.prototype.getIntegration = function (n) { var t = this.getClient(); if (!t) return null; try { return t.getIntegration(n) } catch (t) { return T.warn("Cannot retrieve integration " + n.id + " from the current Hub"), null } }, n.prototype.traceHeaders = function () { var n = this.getStackTop(); if (n.scope && n.client) { var t = n.scope.getSpan(); if (t) return { "sentry-trace": t.toTraceparent() } } return {} }, n }(); function Q() { var n = w(); return n.__SENTRY__ = n.__SENTRY__ || { hub: void 0 }, n } function Y(n) { var t = Q(), r = rn(t); return en(t, n), r } function nn() { var n, t, r = Q(); tn(r) && !rn(r).isOlderThan(K) || en(r, new Z); try { var e = (n = module, t = "domain", n.require(t)).active; if (!e) return rn(r); if (!tn(e) || rn(e).isOlderThan(K)) { var i = rn(r).getStackTop(); en(e, new Z(i.client, z.clone(i.scope))) } return rn(e) } catch (n) { return rn(r) } } function tn(n) { return !!(n && n.__SENTRY__ && n.__SENTRY__.hub) } function rn(n) { return n && n.__SENTRY__ && n.__SENTRY__.hub ? n.__SENTRY__.hub : (n.__SENTRY__ = n.__SENTRY__ || {}, n.__SENTRY__.hub = new Z, n.__SENTRY__.hub) } function en(n, t) { return !!n && (n.__SENTRY__ = n.__SENTRY__ || {}, n.__SENTRY__.hub = t, !0) } function on(n) { for (var t = [], r = 1; r < arguments.length; r++)t[r - 1] = arguments[r]; var e = nn(); if (e && e[n]) return e[n].apply(e, o(t)); throw new Error("No hub defined or " + n + " was not found on the hub, please open a bug report.") } function captureException(n) { var t; try { throw new Error("Sentry syntheticException") } catch (n) { t = n } return on("captureException", n, { originalException: n, syntheticException: t }) } function un(n) { on("withScope", n) } var cn = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w\.-]+)(?::(\d+))?\/(.+)/, sn = function () { function n(n) { "string" == typeof n ? this.K(n) : this.Z(n), this.Y() } return n.prototype.toString = function (n) { void 0 === n && (n = !1); var t = this, r = t.host, e = t.path, i = t.pass, o = t.port, u = t.projectId; return t.protocol + "://" + t.user + (n && i ? ":" + i : "") + "@" + r + (o ? ":" + o : "") + "/" + (e ? e + "/" : e) + u }, n.prototype.K = function (n) { var t = cn.exec(n); if (!t) throw new f("Invalid Dsn"); var r = i(t.slice(1), 6), e = r[0], o = r[1], u = r[2], c = void 0 === u ? "" : u, s = r[3], a = r[4], h = void 0 === a ? "" : a, l = "", v = r[5], d = v.split("/"); d.length > 1 && (l = d.slice(0, -1).join("/"), v = d.pop()), Object.assign(this, { host: s, pass: c, path: l, projectId: v, port: h, protocol: e, user: o }) }, n.prototype.Z = function (n) { this.protocol = n.protocol, this.user = n.user, this.pass = n.pass || "", this.host = n.host, this.port = n.port || "", this.path = n.path || "", this.projectId = n.projectId }, n.prototype.Y = function () { var n = this; if (["protocol", "user", "host", "projectId"].forEach(function (t) { if (!n[t]) throw new f("Invalid Dsn") }), "http" !== this.protocol && "https" !== this.protocol) throw new f("Invalid Dsn"); if (this.port && Number.isNaN(parseInt(this.port, 10))) throw new f("Invalid Dsn") }, n }(), an = function () { function n(n) { this.dsn = n, this.nn = new sn(n) } return n.prototype.getDsn = function () { return this.nn }, n.prototype.getStoreEndpoint = function () { return "" + this.tn() + this.getStoreEndpointPath() }, n.prototype.getStoreEndpointWithUrlEncodedAuth = function () { var n, t = { sentry_key: this.nn.user, sentry_version: "7" }; return this.getStoreEndpoint() + "?" + (n = t, Object.keys(n).map(function (t) { return encodeURIComponent(t) + "=" + encodeURIComponent(n[t]) }).join("&")) }, n.prototype.tn = function () { var n = this.nn, t = n.protocol ? n.protocol + ":" : "", r = n.port ? ":" + n.port : ""; return t + "//" + n.host + r }, n.prototype.getStoreEndpointPath = function () { var n = this.nn; return (n.path ? "/" + n.path : "") + "/api/" + n.projectId + "/store/" }, n.prototype.getRequestHeaders = function (n, t) { var r = this.nn, e = ["Sentry sentry_version=7"]; return e.push("sentry_timestamp=" + (new Date).getTime()), e.push("sentry_client=" + n + "/" + t), e.push("sentry_key=" + r.user), r.pass && e.push("sentry_secret=" + r.pass), { "Content-Type": "application/json", "X-Sentry-Auth": e.join(", ") } }, n.prototype.getReportDialogEndpoint = function (n) { void 0 === n && (n = {}); var t = this.nn, r = this.tn() + (t.path ? "/" + t.path : "") + "/api/embed/error-page/", e = []; for (var i in e.push("dsn=" + t.toString()), n) if ("user" === i) { if (!n.user) continue; n.user.name && e.push("name=" + encodeURIComponent(n.user.name)), n.user.email && e.push("email=" + encodeURIComponent(n.user.email)) } else e.push(encodeURIComponent(i) + "=" + encodeURIComponent(n[i])); return e.length ? r + "?" + e.join("&") : r }, n }(), fn = []; function hn(n) { var t = {}; return function (n) { var t = n.defaultIntegrations && o(n.defaultIntegrations) || [], r = n.integrations, e = []; if (Array.isArray(r)) { var i = r.map(function (n) { return n.name }), u = []; t.forEach(function (n) { -1 === i.indexOf(n.name) && -1 === u.indexOf(n.name) && (e.push(n), u.push(n.name)) }), r.forEach(function (n) { -1 === u.indexOf(n.name) && (e.push(n), u.push(n.name)) }) } else { if ("function" != typeof r) return o(t); e = r(t), e = Array.isArray(e) ? e : [e] } return e }(n).forEach(function (n) { t[n.name] = n, function (n) { -1 === fn.indexOf(n.name) && (n.setupOnce(V, nn), fn.push(n.name), T.log("Integration installed: " + n.name)) }(n) }), t } var ln, vn = function () { function n(n, t) { this.rn = {}, this.en = !1, this.in = new n(t), this.on = t, t.dsn && (this.un = new sn(t.dsn)), this.cn() && (this.rn = hn(this.on)) } return n.prototype.captureException = function (n, t, r) { var e = this, i = t && t.event_id; return this.en = !0, this.sn().eventFromException(n, t).then(function (n) { return e.an(n, t, r) }).then(function (n) { i = n && n.event_id, e.en = !1 }).catch(function (n) { T.error(n), e.en = !1 }), i }, n.prototype.captureMessage = function (n, t, r, e) { var i = this, o = r && r.event_id; return this.en = !0, (p(n) ? this.sn().eventFromMessage("" + n, t, r) : this.sn().eventFromException(n, r)).then(function (n) { return i.an(n, r, e) }).then(function (n) { o = n && n.event_id, i.en = !1 }).catch(function (n) { T.error(n), i.en = !1 }), o }, n.prototype.captureEvent = function (n, t, r) { var e = this, i = t && t.event_id; return this.en = !0, this.an(n, t, r).then(function (n) { i = n && n.event_id, e.en = !1 }).catch(function (n) { T.error(n), e.en = !1 }), i }, n.prototype.getDsn = function () { return this.un }, n.prototype.getOptions = function () { return this.on }, n.prototype.flush = function (n) { var t = this; return this.fn(n).then(function (r) { return clearInterval(r.interval), t.sn().getTransport().close(n).then(function (n) { return r.ready && n }) }) }, n.prototype.close = function (n) { var t = this; return this.flush(n).then(function (n) { return t.getOptions().enabled = !1, n }) }, n.prototype.getIntegrations = function () { return this.rn || {} }, n.prototype.getIntegration = function (n) { try { return this.rn[n.id] || null } catch (t) { return T.warn("Cannot retrieve integration " + n.id + " from the current Client"), null } }, n.prototype.fn = function (n) { var t = this; return new Promise(function (r) { var e = 0, i = 0; clearInterval(i), i = setInterval(function () { t.en ? (e += 1, n && e >= n && r({ interval: i, ready: !1 })) : r({ interval: i, ready: !0 }) }, 1) }) }, n.prototype.sn = function () { return this.in }, n.prototype.cn = function () { return !1 !== this.getOptions().enabled && void 0 !== this.un }, n.prototype.hn = function (n, t, r) { var i = this.getOptions(), o = i.environment, u = i.release, c = i.dist, s = i.maxValueLength, a = void 0 === s ? 250 : s, f = e({}, n); void 0 === f.environment && void 0 !== o && (f.environment = o), void 0 === f.release && void 0 !== u && (f.release = u), void 0 === f.dist && void 0 !== c && (f.dist = c), f.message && (f.message = F(f.message, a)); var h = f.exception && f.exception.values && f.exception.values[0]; h && h.value && (h.value = F(h.value, a)); var l = f.request; l && l.url && (l.url = F(l.url, a)), void 0 === f.event_id && (f.event_id = g()), this.ln(f.sdk); var v = B.resolve(f); return t && (v = t.applyToEvent(f, r)), v }, n.prototype.ln = function (n) { var t = Object.keys(this.rn); n && t.length > 0 && (n.integrations = t) }, n.prototype.an = function (n, t, r) { var e = this, i = this.getOptions(), o = i.beforeSend, u = i.sampleRate; return this.cn() ? "number" == typeof u && Math.random() > u ? B.reject("This event has been sampled, will not send event.") : new B(function (i, u) { e.hn(n, r, t).then(function (n) { if (null !== n) { var r = n; try { if (t && t.data && !0 === t.data.__sentry__ || !o) return e.sn().sendEvent(r), void i(r); var c = o(n, t); if (void 0 === c) T.error("`beforeSend` method has to return `null` or a valid event."); else if (y(c)) e.vn(c, i, u); else { if (null === (r = c)) return T.log("`beforeSend` returned `null`, will not send event."), void i(null); e.sn().sendEvent(r), i(r) } } catch (n) { e.captureException(n, { data: { __sentry__: !0 }, originalException: n }), u("`beforeSend` throw an error, will not send event.") } } else u("An event processor returned null, will not send event.") }) }) : B.reject("SDK not enabled, will not send event.") }, n.prototype.vn = function (n, t, r) { var e = this; n.then(function (n) { null !== n ? (e.sn().sendEvent(n), t(n)) : r("`beforeSend` returned `null`, will not send event.") }).catch(function (n) { r("beforeSend rejected with " + n) }) }, n }(), dn = function () { function t() { } return t.prototype.sendEvent = function (t) { return Promise.resolve({ reason: "NoopTransport: Event has been skipped because no Dsn is configured.", status: n.Status.Skipped }) }, t.prototype.close = function (n) { return Promise.resolve(!0) }, t }(), pn = function () { function n(n) { this.on = n, this.on.dsn || T.warn("No DSN provided, backend will not do anything."), this.dn = this.pn() } return n.prototype.pn = function () { return new dn }, n.prototype.eventFromException = function (n, t) { throw new f("Backend has to implement `eventFromException` method") }, n.prototype.eventFromMessage = function (n, t, r) { throw new f("Backend has to implement `eventFromMessage` method") }, n.prototype.sendEvent = function (n) { this.dn.sendEvent(n).catch(function (n) { T.error("Error while sending event: " + n) }) }, n.prototype.getTransport = function () { return this.dn }, n }(); var mn = function () { function n() { this.name = n.id } return n.prototype.setupOnce = function () { ln = Function.prototype.toString, Function.prototype.toString = function () { for (var n = [], t = 0; t < arguments.length; t++)n[t] = arguments[t]; var r = this.__sentry__ ? this.__sentry_original__ : this; return ln.apply(r, n) } }, n.id = "FunctionToString", n }(), yn = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/], bn = function () { function n(t) { void 0 === t && (t = {}), this.on = t, this.name = n.id } return n.prototype.setupOnce = function () { V(function (t) { var r = nn(); if (!r) return t; var e = r.getIntegration(n); if (e) { var i = r.getClient(), o = i ? i.getOptions() : {}, u = e.mn(o); if (e.yn(t, u)) return null } return t }) }, n.prototype.yn = function (n, t) { return this.bn(n, t) ? (T.warn("Event dropped due to being internal Sentry Error.\nEvent: " + j(n)), !0) : this.wn(n, t) ? (T.warn("Event dropped due to being matched by `ignoreErrors` option.\nEvent: " + j(n)), !0) : this.gn(n, t) ? (T.warn("Event dropped due to being matched by `blacklistUrls` option.\nEvent: " + j(n) + ".\nUrl: " + this.En(n)), !0) : !this.jn(n, t) && (T.warn("Event dropped due to not being matched by `whitelistUrls` option.\nEvent: " + j(n) + ".\nUrl: " + this.En(n)), !0) }, n.prototype.bn = function (n, t) { if (void 0 === t && (t = {}), !t.ignoreInternal) return !1; try { return "SentryError" === n.exception.values[0].type } catch (n) { return !1 } }, n.prototype.wn = function (n, t) { return void 0 === t && (t = {}), !(!t.ignoreErrors || !t.ignoreErrors.length) && this.xn(n).some(function (n) { return t.ignoreErrors.some(function (t) { return q(n, t) }) }) }, n.prototype.gn = function (n, t) { if (void 0 === t && (t = {}), !t.blacklistUrls || !t.blacklistUrls.length) return !1; var r = this.En(n); return !!r && t.blacklistUrls.some(function (n) { return q(r, n) }) }, n.prototype.jn = function (n, t) { if (void 0 === t && (t = {}), !t.whitelistUrls || !t.whitelistUrls.length) return !0; var r = this.En(n); return !r || t.whitelistUrls.some(function (n) { return q(r, n) }) }, n.prototype.mn = function (n) { return void 0 === n && (n = {}), { blacklistUrls: o(this.on.blacklistUrls || [], n.blacklistUrls || []), ignoreErrors: o(this.on.ignoreErrors || [], n.ignoreErrors || [], yn), ignoreInternal: void 0 === this.on.ignoreInternal || this.on.ignoreInternal, whitelistUrls: o(this.on.whitelistUrls || [], n.whitelistUrls || []) } }, n.prototype.xn = function (n) { if (n.message) return [n.message]; if (n.exception) try { var t = n.exception.values[0], r = t.type, e = t.value; return ["" + e, r + ": " + e] } catch (t) { return T.error("Cannot extract message for event " + j(n)), [] } return [] }, n.prototype.En = function (n) { try { if (n.stacktrace) { var t = n.stacktrace.frames; return t[t.length - 1].filename } if (n.exception) { var r = n.exception.values[0].stacktrace.frames; return r[r.length - 1].filename } return null } catch (t) { return T.error("Cannot extract url for event " + j(n)), null } }, n.id = "InboundFilters", n }(), wn = Object.freeze({ FunctionToString: mn, InboundFilters: bn }), gn = w(), En = { _n: !1, Sn: !1, On: !1, kn: !1 }, jn = "?", xn = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/; function _n(n, t) { return Object.prototype.hasOwnProperty.call(n, t) } function Sn() { return "undefined" == typeof document || null == document.location ? "" : document.location.href } En._n = function () { var n, t, r = [], i = null, o = null; function u(n, t, e) { var i = null; if (!t || En.Sn) { for (var o in r) if (_n(r, o)) try { r[o](n, t, e) } catch (n) { i = n } if (i) throw i } } function c(t, r, i, c, s) { var f = null; if (s = l(s) ? s.error : s, t = l(t) ? t.message : t, o) En.On.Tn(o, r, i, t), a(); else if (s && h(s)) (f = En.On(s)).mechanism = "onerror", u(f, !0, s); else { var v, d = { url: r, line: i, column: c }, p = t; if ("[object String]" === {}.toString.call(t)) { var m = t.match(xn); m && (v = m[1], p = m[2]) } d.func = jn, d.context = null, u(f = { name: v, message: p, mode: "onerror", mechanism: "onerror", stack: [e({}, d, { url: d.url || Sn() })] }, !0, null) } return !!n && n.apply(this, arguments) } function s(n) { var t = n; try { t = n && "reason" in n ? n.reason : n } catch (n) { } var r = En.On(t); r.mechanism = "onunhandledrejection", u(r, !0, t) } function a() { var n = o, t = i; o = null, i = null, u(n, !1, t) } function f(n) { if (o) { if (i === n) return; a() } var t = En.On(n); throw o = t, i = n, setTimeout(function () { i === n && a() }, t.incomplete ? 2e3 : 0), n } return f.Rn = function (n) { r.push(n) }, f.Dn = function () { !0 !== t && (n = gn.onerror, gn.onerror = c, t = !0) }, f.In = function () { gn.onunhandledrejection = s }, f }(), En.On = function () { function n(n) { if (!n || !n.stack) return null; for (var t, r, e, i = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[-a-z]+:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, o = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i, u = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i, c = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i, s = /\((\S*)(?::(\d+))(?::(\d+))\)/, a = n.stack.split("\n"), f = [], h = /^(.*) is undefined$/.exec(n.message), l = 0, v = a.length; l < v; ++l) { if (r = i.exec(a[l])) { var d = r[2] && 0 === r[2].indexOf("native"); r[2] && 0 === r[2].indexOf("eval") && (t = s.exec(r[2])) && (r[2] = t[1], r[3] = t[2], r[4] = t[3]), e = { url: r[2], func: r[1] || jn, args: d ? [r[2]] : [], line: r[3] ? +r[3] : null, column: r[4] ? +r[4] : null } } else if (r = u.exec(a[l])) e = { url: r[2], func: r[1] || jn, args: [], line: +r[3], column: r[4] ? +r[4] : null }; else { if (!(r = o.exec(a[l]))) continue; r[3] && r[3].indexOf(" > eval") > -1 && (t = c.exec(r[3])) ? (r[1] = r[1] || "eval", r[3] = t[1], r[4] = t[2], r[5] = "") : 0 !== l || r[5] || void 0 === n.columnNumber || (f[0].column = n.columnNumber + 1), e = { url: r[3], func: r[1] || jn, args: r[2] ? r[2].split(",") : [], line: r[4] ? +r[4] : null, column: r[5] ? +r[5] : null } } !e.func && e.line && (e.func = jn), e.context = null, f.push(e) } return f.length ? (f[0] && f[0].line && !f[0].column && h && (f[0].column = null), { mode: "stack", name: n.name, message: n.message, stack: f }) : null } function t(n, t, r, e) { var i = { url: t, line: r }; if (i.url && i.line) { if (n.incomplete = !1, i.func || (i.func = jn), i.context || (i.context = null), / '([^']+)' /.exec(e) && (i.column = null), n.stack.length > 0 && n.stack[0].url === i.url) { if (n.stack[0].line === i.line) return !1; if (!n.stack[0].line && n.stack[0].func === i.func) return n.stack[0].line = i.line, n.stack[0].context = i.context, !1 } return n.stack.unshift(i), n.partial = !0, !0 } return n.incomplete = !0, !1 } function r(n, e) { for (var i, o, u = /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i, c = [], s = {}, a = !1, f = r.caller; f && !a; f = f.caller)if (f !== Rn && f !== En._n) { if (o = { url: null, func: jn, args: [], line: null, column: null }, f.name ? o.func = f.name : (i = u.exec(f.toString())) && (o.func = i[1]), void 0 === o.func) try { o.func = i.input.substring(0, i.input.indexOf("{")) } catch (n) { } s["" + f] ? a = !0 : s["" + f] = !0, c.push(o) } e && c.splice(0, e); var h = { mode: "callers", name: n.name, message: n.message, stack: c }; return t(h, n.sourceURL || n.fileName, n.line || n.lineNumber, n.message || n.description), h } function i(t, e) { var i = null, u = t && t.framesToPop; e = null == e ? 0 : +e; try { if (i = function (n) { var t = n.stacktrace; if (t) { for (var r, e = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i, i = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i, o = t.split("\n"), u = [], c = 0; c < o.length; c += 2) { var s = null; (r = e.exec(o[c])) ? s = { url: r[2], line: +r[1], column: null, func: r[3], args: [] } : (r = i.exec(o[c])) && (s = { url: r[6], line: +r[1], column: +r[2], func: r[3] || r[4], args: r[5] ? r[5].split(",") : [] }), s && (!s.func && s.line && (s.func = jn), s.line && (s.context = null), s.context || (s.context = [o[c + 1]]), u.push(s)) } return u.length ? { mode: "stacktrace", name: n.name, message: n.message, stack: u } : null } }(t)) return o(i, u) } catch (n) { } try { if (i = n(t)) return o(i, u) } catch (n) { } try { if (i = function (n) { var t = n.message.split("\n"); if (t.length < 4) return null; var r, e = /^\s*Line (\d+) of linked script ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i, i = /^\s*Line (\d+) of inline#(\d+) script in ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i, o = /^\s*Line (\d+) of function script\s*$/i, u = [], c = gn && gn.document && gn.document.getElementsByTagName("script"), s = []; for (var a in c) _n(c, a) && !c[a].src && s.push(c[a]); for (var f = 2; f < t.length; f += 2) { var h = null; (r = e.exec(t[f])) ? h = { url: r[2], func: r[3], args: [], line: +r[1], column: null } : (r = i.exec(t[f])) ? h = { url: r[3], func: r[4], args: [], line: +r[1], column: null } : (r = o.exec(t[f])) && (h = { url: Sn().replace(/#.*$/, ""), func: "", args: [], line: r[1], column: null }), h && (h.func || (h.func = jn), h.context = [t[f + 1]], u.push(h)) } return u.length ? { mode: "multiline", name: n.name, message: t[0], stack: u } : null }(t)) return o(i, u) } catch (n) { } try { if (i = r(t, e + 1)) return o(i, u) } catch (n) { } return { original: t, name: t && t.name, message: t && t.message, mode: "failed" } } function o(n, t) { if (Number.isNaN(t)) return n; try { return e({}, n, { stack: n.stack.slice(t) }) } catch (t) { return n } } return i.Tn = t, i.Nn = n, i }(), En.Sn = !0, En.kn = 11; var On = En._n.Rn, kn = En._n.Dn, Tn = En._n.In, Rn = En.On, Dn = 50; function In(n) { var t = Cn(n.stack), r = { type: n.name, value: n.message }; return t && t.length && (r.stacktrace = { frames: t }), void 0 === r.type && "" === r.value && (r.value = "Unrecoverable error caught"), r } function Nn(n) { return { exception: { values: [In(n)] } } } function Cn(n) { if (!n || !n.length) return []; var t = n, r = t[0].func || "", e = t[t.length - 1].func || ""; return (r.includes("captureMessage") || r.includes("captureException")) && (t = t.slice(1)), e.includes("sentryWrapped") && (t = t.slice(0, -1)), t.map(function (n) { return { colno: n.column, filename: n.url || t[0].url, function: n.func || "?", in_app: !0, lineno: n.line } }).slice(0, Dn).reverse() } var An, Un, Ln = function () { function n(n) { this.options = n, this.h = new M(30), this.url = new an(this.options.dsn).getStoreEndpointWithUrlEncodedAuth() } return n.prototype.sendEvent = function (n) { throw new f("Transport Class has to implement `sendEvent` method") }, n.prototype.close = function (n) { return this.h.drain(n) }, n }(), Mn = w(), Fn = function (t) { function e() { return null !== t && t.apply(this, arguments) || this } return r(e, t), e.prototype.sendEvent = function (t) { var r = { body: JSON.stringify(t), method: "POST", referrerPolicy: W() ? "origin" : "" }; return this.h.add(Mn.fetch(this.url, r).then(function (t) { return { status: n.Status.fromHttpCode(t.status) } })) }, e }(Ln), Pn = function (t) { function e() { return null !== t && t.apply(this, arguments) || this } return r(e, t), e.prototype.sendEvent = function (t) { var r = this; return this.h.add(new Promise(function (e, i) { var o = new XMLHttpRequest; o.onreadystatechange = function () { 4 === o.readyState && (200 === o.status && e({ status: n.Status.fromHttpCode(o.status) }), i(o)) }, o.open("POST", r.url), o.send(JSON.stringify(t)) })) }, e }(Ln), $n = Object.freeze({ BaseTransport: Ln, FetchTransport: Fn, XHRTransport: Pn }), qn = function (t) { function i() { return null !== t && t.apply(this, arguments) || this } return r(i, t), i.prototype.pn = function () { if (!this.on.dsn) return t.prototype.pn.call(this); var n = e({}, this.on.transportOptions, { dsn: this.on.dsn }); return this.on.transport ? new this.on.transport(n) : H() ? new Fn(n) : new Pn(n) }, i.prototype.eventFromException = function (t, r) { var e, i, o = this; if (l(t) && t.error) return t = t.error, e = Nn(Rn(t)), B.resolve(this.Cn(e, r)); if (v(t) || (i = t, "[object DOMException]" === Object.prototype.toString.call(i))) { var u = t, c = u.name || (v(u) ? "DOMError" : "DOMException"), s = u.message ? c + ": " + u.message : c; return this.eventFromMessage(s, n.Severity.Error, r).then(function (n) { return _(n, s), B.resolve(o.Cn(n, r)) }) } if (h(t)) return e = Nn(Rn(t)), B.resolve(this.Cn(e, r)); if (m(t) && r && r.syntheticException) return _(e = function (n, t) { var r = Object.keys(n).sort(), e = { extra: { __serialized__: N(n) }, message: "Non-Error exception captured with keys: " + $(r) }; if (t) { var i = Cn(Rn(t).stack); e.stacktrace = { frames: i } } return e }(t, r.syntheticException), "Custom Object", void 0, { handled: !0, synthetic: !0, type: "generic" }), e.level = n.Severity.Error, B.resolve(this.Cn(e, r)); var a = t; return this.eventFromMessage(a, void 0, r).then(function (t) { return _(t, "" + a, void 0, { handled: !0, synthetic: !0, type: "generic" }), t.level = n.Severity.Error, B.resolve(o.Cn(t, r)) }) }, i.prototype.Cn = function (n, t) { return e({}, n, { event_id: t && t.event_id }) }, i.prototype.eventFromMessage = function (t, r, e) { void 0 === r && (r = n.Severity.Info); var i = { event_id: e && e.event_id, level: r, message: t }; if (this.on.attachStacktrace && e && e.syntheticException) { var o = Cn(Rn(e.syntheticException).stack); i.stacktrace = { frames: o } } return B.resolve(i) }, i }(pn), Hn = "sentry.javascript.browser", Wn = function (n) { function t(t) { return void 0 === t && (t = {}), n.call(this, qn, t) || this } return r(t, n), t.prototype.hn = function (t, r, i) { return t.platform = t.platform || "javascript", t.sdk = e({}, t.sdk, { name: Hn, packages: o(t.sdk && t.sdk.packages || [], [{ name: "npm:@sentry/browser", version: "5.6.2" }]), version: "5.6.2" }), n.prototype.hn.call(this, t, r, i) }, t.prototype.showReportDialog = function (n) { void 0 === n && (n = {}); var t = w().document; if (t) if (this.cn()) { var r = n.dsn || this.getDsn(); if (n.eventId) if (r) { var e = t.createElement("script"); e.async = !0, e.src = new an(r).getReportDialogEndpoint(n), n.onLoad && (e.onload = n.onLoad), (t.head || t.body).appendChild(e) } else T.error("Missing `Dsn` option in showReportDialog call"); else T.error("Missing `eventId` option in showReportDialog call") } else T.error("Trying to call showReportDialog with Sentry Client is disabled") }, t }(vn), Bn = 1e3, Jn = 0; function Xn(n, t, r) { if (void 0 === t && (t = {}), "function" != typeof n) return n; try { if (n.__sentry__) return n; if (n.__sentry_wrapped__) return n.__sentry_wrapped__ } catch (t) { return n } var sentryWrapped = function () { r && "function" == typeof r && r.apply(this, arguments); var i = Array.prototype.slice.call(arguments); try { var o = i.map(function (n) { return Xn(n, t) }); return n.handleEvent ? n.handleEvent.apply(this, o) : n.apply(this, o) } catch (n) { throw Jn += 1, setTimeout(function () { Jn -= 1 }), un(function (r) { r.addEventProcessor(function (n) { var r = e({}, n); return t.mechanism && _(r, void 0, void 0, t.mechanism), r.extra = e({}, r.extra, { arguments: U(i, 3) }), r }), captureException(n) }), n } }; try { for (var i in n) Object.prototype.hasOwnProperty.call(n, i) && (sentryWrapped[i] = n[i]) } catch (n) { } n.prototype = n.prototype || {}, sentryWrapped.prototype = n.prototype, Object.defineProperty(n, "__sentry_wrapped__", { enumerable: !1, value: sentryWrapped }), Object.defineProperties(sentryWrapped, { __sentry__: { enumerable: !1, value: !0 }, __sentry_original__: { enumerable: !1, value: n } }); try { Object.getOwnPropertyDescriptor(sentryWrapped, "name").configurable && Object.defineProperty(sentryWrapped, "name", { get: function () { return n.name } }) } catch (n) { } return sentryWrapped } var zn = 0; function Gn(n, t) { return void 0 === t && (t = !1), function (r) { if (An = void 0, r && Un !== r) { Un = r; var e = function () { var t; try { t = r.target ? Kn(r.target) : Kn(r) } catch (n) { t = "<unknown>" } 0 !== t.length && nn().addBreadcrumb({ category: "ui." + n, message: t }, { event: r, name: n }) }; zn && clearTimeout(zn), t ? zn = setTimeout(e) : e() } } } function Vn() { return function (n) { var t; try { t = n.target } catch (n) { return } var r = t && t.tagName; r && ("INPUT" === r || "TEXTAREA" === r || t.isContentEditable) && (An || Gn("input")(n), clearTimeout(An), An = setTimeout(function () { An = void 0 }, Bn)) } } function Kn(n) { for (var t, r = n, e = [], i = 0, o = 0, u = " > ".length; r && i++ < 5 && !("html" === (t = Zn(r)) || i > 1 && o + e.length * u + t.length >= 80);)e.push(t), o += t.length, r = r.parentNode; return e.reverse().join(" > ") } function Zn(n) { var t, r, e, i, o, u = []; if (!n || !n.tagName) return ""; if (u.push(n.tagName.toLowerCase()), n.id && u.push("#" + n.id), (t = n.className) && d(t)) for (r = t.split(/\s+/), o = 0; o < r.length; o++)u.push("." + r[o]); var c = ["type", "name", "title", "alt"]; for (o = 0; o < c.length; o++)e = c[o], (i = n.getAttribute(e)) && u.push("[" + e + '="' + i + '"]'); return u.join("") } var Qn = function () { function t(n) { this.name = t.id, this.on = e({ onerror: !0, onunhandledrejection: !0 }, n) } return t.prototype.setupOnce = function () { Error.stackTraceLimit = 50, On(function (n, r, e) { if (!(Jn > 0)) { var i = nn().getIntegration(t); i && nn().captureEvent(i.An(n, e), { data: { stack: n }, originalException: e }) } }), this.on.onerror && (T.log("Global Handler attached: onerror"), kn()), this.on.onunhandledrejection && (T.log("Global Handler attached: onunhandledrejection"), Tn()) }, t.prototype.An = function (n, t) { if (!d(n.message) && "onunhandledrejection" !== n.mechanism) { var r = n.message; n.message = r.error && d(r.error.message) ? r.error.message : "No error message" } if ("onunhandledrejection" === n.mechanism && (n.incomplete || "failed" === n.mode)) return this.Un(n, t); var e = Nn(n), i = { mode: n.mode }; n.message && (i.message = n.message), n.name && (i.name = n.name); var o = nn().getClient(), u = o && o.getOptions().maxValueLength || 250; return _(e, n.original ? F(JSON.stringify(U(n.original)), u) : "", "onunhandledrejection" === n.mechanism ? "UnhandledRejection" : "Error", { data: i, handled: !1, type: n.mechanism }), e }, t.prototype.Un = function (t, r) { var i = { level: n.Severity.Error }; return p(r) ? i.exception = { values: [{ type: "UnhandledRejection", value: "Non-Error promise rejection captured with value: " + r }] } : (i.exception = { values: [{ type: "UnhandledRejection", value: "Non-Error promise rejection captured with keys: " + $(Object.keys(r).sort()) }] }, i.extra = { __serialized__: N(r) }), i.exception.values && i.exception.values[0] && (i.exception.values[0].mechanism = { data: e({ mode: t.mode }, t.incomplete && { incomplete: t.incomplete }, t.message && { message: t.message }, t.name && { name: t.name }), handled: !1, type: t.mechanism }), i }, t.id = "GlobalHandlers", t }(), Yn = function () { function n() { this.Ln = 0, this.name = n.id } return n.prototype.Mn = function (n) { return function () { for (var t = [], r = 0; r < arguments.length; r++)t[r] = arguments[r]; var e = t[0]; return t[0] = Xn(e, { mechanism: { data: { function: nt(n) }, handled: !0, type: "instrument" } }), n.apply(this, t) } }, n.prototype.Fn = function (n) { return function (t) { return n(Xn(t, { mechanism: { data: { function: "requestAnimationFrame", handler: nt(n) }, handled: !0, type: "instrument" } })) } }, n.prototype.Pn = function (n) { var t = w(), r = t[n] && t[n].prototype; r && r.hasOwnProperty && r.hasOwnProperty("addEventListener") && (D(r, "addEventListener", function (t) { return function (r, e, i) { try { "function" == typeof e.handleEvent && (e.handleEvent = Xn(e.handleEvent.bind(e), { mechanism: { data: { function: "handleEvent", handler: nt(e), target: n }, handled: !0, type: "instrument" } })) } catch (n) { } return t.call(this, r, Xn(e, { mechanism: { data: { function: "addEventListener", handler: nt(e), target: n }, handled: !0, type: "instrument" } }), i) } }), D(r, "removeEventListener", function (n) { return function (t, r, e) { var i = r; try { i = i && (i.__sentry_wrapped__ || i) } catch (n) { } return n.call(this, t, i, e) } })) }, n.prototype.setupOnce = function () { this.Ln = this.Ln; var n = w(); D(n, "setTimeout", this.Mn.bind(this)), D(n, "setInterval", this.Mn.bind(this)), D(n, "requestAnimationFrame", this.Fn.bind(this)), ["EventTarget", "Window", "Node", "ApplicationCache", "AudioTrackList", "ChannelMergerNode", "CryptoOperation", "EventSource", "FileReader", "HTMLUnknownElement", "IDBDatabase", "IDBRequest", "IDBTransaction", "KeyOperation", "MediaController", "MessagePort", "ModalWindow", "Notification", "SVGElementInstance", "Screen", "TextTrack", "TextTrackCue", "TextTrackList", "WebSocket", "WebSocketWorker", "Worker", "XMLHttpRequest", "XMLHttpRequestEventTarget", "XMLHttpRequestUpload"].forEach(this.Pn.bind(this)) }, n.id = "TryCatch", n }(); function nt(n) { try { return n && n.name || "<anonymous>" } catch (n) { return "<anonymous>" } } var tt, rt = w(), et = function () { function t(n) { this.name = t.id, this.on = e({ console: !0, dom: !0, fetch: !0, history: !0, sentry: !0, xhr: !0 }, n) } return t.prototype.$n = function () { "console" in rt && ["debug", "info", "warn", "error", "log", "assert"].forEach(function (r) { r in rt.console && D(rt.console, r, function (e) { return function () { for (var i = [], o = 0; o < arguments.length; o++)i[o] = arguments[o]; var u = { category: "console", data: { extra: { arguments: U(i, 3) }, logger: "console" }, level: n.Severity.fromString(r), message: P(i, " ") }; "assert" === r && !1 === i[0] && (u.message = "Assertion failed: " + (P(i.slice(1), " ") || "console.assert"), u.data.extra.arguments = U(i.slice(1), 3)), t.addBreadcrumb(u, { input: i, level: r }), e && Function.prototype.apply.call(e, rt.console, i) } }) }) }, t.prototype.qn = function () { "document" in rt && (rt.document.addEventListener("click", Gn("click"), !1), rt.document.addEventListener("keypress", Vn(), !1), ["EventTarget", "Node"].forEach(function (n) { var t = rt[n] && rt[n].prototype; t && t.hasOwnProperty && t.hasOwnProperty("addEventListener") && (D(t, "addEventListener", function (n) { return function (t, r, e) { return r && r.handleEvent ? ("click" === t && D(r, "handleEvent", function (n) { return function (t) { return Gn("click")(t), n.call(this, t) } }), "keypress" === t && D(r, "handleEvent", function (n) { return function (t) { return Vn()(t), n.call(this, t) } })) : ("click" === t && Gn("click", !0)(this), "keypress" === t && Vn()(this)), n.call(this, t, r, e) } }), D(t, "removeEventListener", function (n) { return function (t, r, e) { var i = r; try { i = i && (i.__sentry_wrapped__ || i) } catch (n) { } return n.call(this, t, i, e) } })) })) }, t.prototype.Hn = function () { (function () { if (!H()) return !1; var n = function (n) { return -1 !== n.toString().indexOf("native") }, t = w(), r = null, e = t.document; if (e) { var i = e.createElement("iframe"); i.hidden = !0; try { e.head.appendChild(i), i.contentWindow && i.contentWindow.fetch && (r = n(i.contentWindow.fetch)), e.head.removeChild(i) } catch (n) { T.warn("Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ", n) } } return null === r && (r = n(t.fetch)), r })() && D(rt, "fetch", function (r) { return function () { for (var e = [], i = 0; i < arguments.length; i++)e[i] = arguments[i]; var o, u = e[0], c = "GET"; "string" == typeof u ? o = u : "Request" in rt && u instanceof Request ? (o = u.url, u.method && (c = u.method)) : o = String(u), e[1] && e[1].method && (c = e[1].method); var s = nn().getClient(), a = s && s.getDsn(); if (a) { var f = new an(a).getStoreEndpoint(); if (f && o.includes(f)) return "POST" === c && e[1] && e[1].body && it(e[1].body), r.apply(rt, e) } var h = { method: d(c) ? c.toUpperCase() : c, url: o }; return r.apply(rt, e).then(function (n) { return h.status_code = n.status, t.addBreadcrumb({ category: "fetch", data: h, type: "http" }, { input: e, response: n }), n }).catch(function (r) { throw t.addBreadcrumb({ category: "fetch", data: h, level: n.Severity.Error, type: "http" }, { error: r, input: e }), r }) } }) }, t.prototype.Wn = function () { var n = this; if (r = w(), e = r.chrome, i = e && e.app && e.app.runtime, o = "history" in r && !!r.history.pushState && !!r.history.replaceState, !i && o) { var r, e, i, o, u = function (n, r) { var e = E(rt.location.href), i = E(r), o = E(n); o.path || (o = e), tt = r, e.protocol === i.protocol && e.host === i.host && (r = i.relative), e.protocol === o.protocol && e.host === o.host && (n = o.relative), t.addBreadcrumb({ category: "navigation", data: { from: n, to: r } }) }, c = rt.onpopstate; rt.onpopstate = function () { for (var t = [], r = 0; r < arguments.length; r++)t[r] = arguments[r]; var e = rt.location.href; if (u(tt, e), c) return c.apply(n, t) }, D(rt.history, "pushState", s), D(rt.history, "replaceState", s) } function s(n) { return function () { for (var t = [], r = 0; r < arguments.length; r++)t[r] = arguments[r]; var e = t.length > 2 ? t[2] : void 0; return e && u(tt, String(e)), n.apply(this, t) } } }, t.prototype.Bn = function () { if ("XMLHttpRequest" in rt) { var n = XMLHttpRequest.prototype; D(n, "open", function (n) { return function () { for (var t = [], r = 0; r < arguments.length; r++)t[r] = arguments[r]; var e = t[1]; this.__sentry_xhr__ = { method: d(t[0]) ? t[0].toUpperCase() : t[0], url: t[1] }; var i = nn().getClient(), o = i && i.getDsn(); if (o) { var u = new an(o).getStoreEndpoint(); d(e) && u && e.includes(u) && (this.__sentry_own_request__ = !0) } return n.apply(this, t) } }), D(n, "send", function (n) { return function () { for (var r = [], e = 0; e < arguments.length; e++)r[e] = arguments[e]; var i = this; function o() { if (4 === i.readyState) { if (i.__sentry_own_request__) return; try { i.__sentry_xhr__ && (i.__sentry_xhr__.status_code = i.status) } catch (n) { } t.addBreadcrumb({ category: "xhr", data: i.__sentry_xhr__, type: "http" }, { xhr: i }) } } return i.__sentry_own_request__ && it(r[0]), ["onload", "onerror", "onprogress"].forEach(function (n) { !function (n, t) { n in t && "function" == typeof t[n] && D(t, n, function (t) { return Xn(t, { mechanism: { data: { function: n, handler: t && t.name || "<anonymous>" }, handled: !0, type: "instrument" } }) }) }(n, i) }), "onreadystatechange" in i && "function" == typeof i.onreadystatechange ? D(i, "onreadystatechange", function (n) { return Xn(n, { mechanism: { data: { function: "onreadystatechange", handler: n && n.name || "<anonymous>" }, handled: !0, type: "instrument" } }, o) }) : i.onreadystatechange = o, n.apply(this, r) } }) } }, t.addBreadcrumb = function (n, r) { nn().getIntegration(t) && nn().addBreadcrumb(n, r) }, t.prototype.setupOnce = function () { this.on.console && this.$n(), this.on.dom && this.qn(), this.on.xhr && this.Bn(), this.on.fetch && this.Hn(), this.on.history && this.Wn() }, t.id = "Breadcrumbs", t }(); function it(t) { try { var r = JSON.parse(t); et.addBreadcrumb({ category: "sentry", event_id: r.event_id, level: r.level || n.Severity.fromString("error"), message: j(r) }, { event: r }) } catch (n) { T.error("Error while adding sentry type breadcrumb") } } var ot = "cause", ut = 5, ct = function () { function n(t) { void 0 === t && (t = {}), this.name = n.id, this.Jn = t.key || ot, this.s = t.limit || ut } return n.prototype.setupOnce = function () { V(function (t, r) { var e = nn().getIntegration(n); return e ? e.Xn(t, r) : t }) }, n.prototype.Xn = function (n, t) { if (!(n.exception && n.exception.values && t && t.originalException instanceof Error)) return n; var r = this.zn(t.originalException, this.Jn); return n.exception.values = o(r, n.exception.values), n }, n.prototype.zn = function (n, t, r) { if (void 0 === r && (r = []), !(n[t] instanceof Error) || r.length + 1 >= this.s) return r; var e = In(Rn(n[t])); return this.zn(n[t], t, o([e], r)) }, n.id = "LinkedErrors", n }(), st = w(), at = function () { function n() { this.name = n.id } return n.prototype.setupOnce = function () { V(function (t) { if (nn().getIntegration(n)) { if (!st.navigator || !st.location) return t; var r = t.request || {}; return r.url = r.url || st.location.href, r.headers = r.headers || {}, r.headers["User-Agent"] = st.navigator.userAgent, e({}, t, { request: r }) } return t }) }, n.id = "UserAgent", n }(), ft = Object.freeze({ GlobalHandlers: Qn, TryCatch: Yn, Breadcrumbs: et, LinkedErrors: ct, UserAgent: at }), ht = [new bn, new mn, new Yn, new et, new Qn, new ct, new at]; var lt = {}, vt = w(); vt.Sentry && vt.Sentry.Integrations && (lt = vt.Sentry.Integrations); var dt = e({}, lt, wn, ft); return n.BrowserClient = Wn, n.Hub = Z, n.Integrations = dt, n.SDK_NAME = Hn, n.SDK_VERSION = "5.6.2", n.Scope = z, n.Span = X, n.Transports = $n, n.addBreadcrumb = function (n) { on("addBreadcrumb", n) }, n.addGlobalEventProcessor = V, n.captureEvent = function (n) { return on("captureEvent", n) }, n.captureException = captureException, n.captureMessage = function (n, t) { var r; try { throw new Error(n) } catch (n) { r = n } return on("captureMessage", n, t, { originalException: n, syntheticException: r }) }, n.close = function (n) { var t = nn().getClient(); return t ? t.close(n) : Promise.reject(!1) }, n.configureScope = function (n) { on("configureScope", n) }, n.defaultIntegrations = ht, n.flush = function (n) { var t = nn().getClient(); return t ? t.flush(n) : Promise.reject(!1) }, n.forceLoad = function () { }, n.getCurrentHub = nn, n.getHubFromCarrier = rn, n.init = function (n) { if (void 0 === n && (n = {}), void 0 === n.defaultIntegrations && (n.defaultIntegrations = ht), void 0 === n.release) { var t = w(); t.SENTRY_RELEASE && t.SENTRY_RELEASE.id && (n.release = t.SENTRY_RELEASE.id) } !function (n, t) { !0 === t.debug && T.enable(), nn().bindClient(new n(t)) }(Wn, n) }, n.lastEventId = function () { return nn().lastEventId() }, n.onLoad = function (n) { n() }, n.setContext = function (n, t) { on("setContext", n, t) }, n.setExtra = function (n, t) { on("setExtra", n, t) }, n.setExtras = function (n) { on("setExtras", n) }, n.setTag = function (n, t) { on("setTag", n, t) }, n.setTags = function (n) { on("setTags", n) }, n.setUser = function (n) { on("setUser", n) }, n.showReportDialog = function (n) { void 0 === n && (n = {}), n.eventId || (n.eventId = nn().lastEventId()); var t = nn().getClient(); t && t.showReportDialog(n) }, n.withScope = un, n.wrap = function (n) { return Xn(n)() }, n }({});


  AmbilightSentry.init({
    dsn: 'https://a3d06857fc2d401690381d0878ce3bc3@sentry.io/1524536',
    defaultIntegrations: false,
    release: document.querySelector('html').getAttribute('data-ambilight-version') || '?',
    beforeSend: (event) => {
      try {
        if (!navigator.doNotTrack) {
          event.request = {
            url: location.href,
            headers: {
              "User-Agent": navigator.userAgent
            }
          };
        }
      } catch (ex) { }
      return event
    }
  })

  AmbilightSentry.captureExceptionWithDetails = (ex) => {
    AmbilightSentry.withScope(scope => {
      const setExtra = (name, value) => {
        try {
          scope.setExtra(name, (value === undefined) ? null : value)
        } catch (ex) { }
      }

      try {
        setExtra(`window.width`, window.innerWidth)
        setExtra(`window.height`, window.innerHeight)
        setExtra(`window.scrollY`, window.scrollY)
        setExtra(`window.devicePixelRatio`, window.devicePixelRatio)
        setExtra(`document.fullscreen`, document.fullscreen)
      } catch (ex) { }

      try {
        if (window.screen) {
          setExtra(`screen.width`, screen.width)
          setExtra(`screen.height`, screen.height)
          setExtra(`screen.availWidth`, screen.availWidth)
          setExtra(`screen.availHeight`, screen.availHeight)
          setExtra(`screen.colorDepth`, screen.colorDepth)
          setExtra(`screen.pixelDepth`, screen.pixelDepth)
        }
      } catch (ex) { }

      try {
        setExtra(`youtube.dark`, !!($.s('html').attributes.dark || {}).value)
        setExtra(`youtube.lang`, ($.s('html').attributes.lang || {}).value)
        setExtra(`player.classes`, [$.s('.html5-video-player').classList].join(' '))
      } catch (ex) { }

      try {
        setExtra(`page.isVideo`, location.pathname == '/watch')
      } catch (ex) { }
      try {
        setExtra(`page.isYtdApp`, !!$.s('ytd-app'))
      } catch (ex) { }

      try {
        if (!navigator.doNotTrack) {
          setExtra(`video.id`, $.s('ytd-watch-flexy').attributes['video-id'].value)
        }
      } catch (ex) { }

      try {
        const videos = $.sa('video')
        videos.forEach((video, i) => {
          try {
            setExtra(`videoTags[${i}].classes`, [video.classList].join(' '))
            setExtra(`videoTags[${i}].style.width`, video.style.width)
            setExtra(`videoTags[${i}].style.height`, video.style.height)
            setExtra(`videoTags[${i}].style.top`, video.style.top)
            setExtra(`videoTags[${i}].style.left`, video.style.left)
            setExtra(`videoTags[${i}].offsetParent`,
              `${video.offsetParent.tagName.toLowerCase()}.${[video.offsetParent.classList].join('.')}`)
          } catch (ex) { }
        })
      } catch (ex) { }

      try {
        setExtra('ambilight.initialized', !!window.ambilight)
        if (window.ambilight) {
          const ambilight = window.ambilight || {}

          setExtra(`ambilight.ambilightFrameCount`, ambilight.ambilightFrameCount)
          setExtra(`ambilight.videoFrameCount`, ambilight.videoFrameCount)
          setExtra(`ambilight.skippedFrames`, ambilight.skippedFrames)
          setExtra(`ambilight.videoFrameRate`, ambilight.videoFrameRate)
          setExtra(`ambilight.displayFrameRate`, ambilight.displayFrameRate);

          (ambilight.settings || []).forEach(setting => {
            if (!setting || !setting.name) return
            setExtra(`settings.${setting.name}`, setting.value)
          })

          if (ambilight.videoPlayer) {
            setExtra(`video.videoWidth`, ambilight.videoPlayer.videoWidth)
            setExtra(`video.videoHeight`, ambilight.videoPlayer.videoHeight)
            setExtra(`video.clientWidth`, ambilight.videoPlayer.clientWidth)
            setExtra(`video.clientHeight`, ambilight.videoPlayer.clientHeight)
            setExtra(`video.currentTime`, ambilight.videoPlayer.currentTime)
            setExtra(`video.duration`, ambilight.videoPlayer.duration)
            setExtra(`video.playbackRate`, ambilight.videoPlayer.playbackRate)
            setExtra(`video.remote.state`, (ambilight.videoPlayer.remote || {}).state)
            setExtra(`video.readyState`, ambilight.videoPlayer.readyState)
            setExtra(`video.loop`, ambilight.videoPlayer.loop)
            setExtra(`video.seeking`, ambilight.videoPlayer.seeking)
            setExtra(`video.paused`, ambilight.videoPlayer.paused)
            setExtra(`video.ended`, ambilight.videoPlayer.ended)
            setExtra(`video.error`, ambilight.videoPlayer.error)
            setExtra(`video.webkitDecodedFrameCount`, ambilight.videoPlayer.webkitDecodedFrameCount)
            setExtra(`video.webkitDroppedFrameCount`, ambilight.videoPlayer.webkitDroppedFrameCount)
            setExtra(`video.webkitVideoDecodedByteCount`, ambilight.videoPlayer.webkitVideoDecodedByteCount)
            setExtra(`video.webkitAudioDecodedByteCount`, ambilight.videoPlayer.webkitAudioDecodedByteCount)
          }
        }
      } catch (ex) { }

      AmbilightSentry.captureException(ex)
      scope.clear()
    })
  }
} catch (ex) {
  console.warn('YouTube Ambilight | Sentry intialization error', ex)
}

//// Generic

$ = {
  create: (tag) => { return document.createElement(tag) },
  s: (selector) => { return document.querySelector(selector) },
  sa: (selector) => { return document.querySelectorAll(selector) },
  param: (name, url) => {
    url = url ? url : window.location.href
    name = name.replace(/[\[\]]/g, "\\$&")
    const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)")
    const results = regex.exec(url)
    if (!results) return null
    if (!results[2]) return ''
    return decodeURIComponent(results[2].replace(/\+/g, " "))
  }
}

HTMLElement.prototype.attr = function (name, value) {
  if (typeof value === 'undefined') {
    return this.getAttribute(name)
  } else {
    this.setAttribute(name, value)
    return this
  }
}
HTMLElement.prototype.append = function (elem) {
  if (typeof elem === 'string')
    elem = document.createTextNode(elem)
  this.appendChild(elem)
  return this
}
HTMLElement.prototype.appendTo = function (elem) {
  elem.append(this)
  return this
}
HTMLElement.prototype.prependChild = HTMLElement.prototype.prepend
HTMLElement.prototype.prepend = function (elem) {
  this.prependChild(elem)
  return this
}
HTMLElement.prototype.prependTo = function (elem) {
  elem.prepend(this)
  return this
}
HTMLElement.prototype.class = function (className) {
  const existingClasses = this.className.split(' ')
  if (existingClasses.indexOf(className) === -1)
    this.className += ' ' + className
  return this
}
HTMLElement.prototype.removeClass = function (className) {
  const classList = this.className.split(' ')
  const pos = classList.indexOf(className)
  if (pos !== -1) {
    classList.splice(pos, 1)
    this.className = classList.join(' ')
  }
  return this
}
HTMLElement.prototype.text = function (text) {
  this.innerText = text
  return this
}
addEventListenerPrototype = function (eventNames, callback) {
  const list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.addEventListener(eventName, callback)
  })
  return this
}
HTMLElement.prototype.on = addEventListenerPrototype
Window.prototype.on = addEventListenerPrototype

removeEventListenerPrototype = function (eventNames, callback) {
  const list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.removeEventListener(eventName, callback)
  })
  return this
}
HTMLElement.prototype.off = removeEventListenerPrototype
Window.prototype.off = removeEventListenerPrototype

HTMLElement.prototype.offset = function () {
  return this.getBoundingClientRect()
}

function flatten(arrays, TypedArray) {
  const arr = new TypedArray(arrays.reduce((n, a) => n + a.length, 0))
  const i = 0
  arrays.forEach(a => { arr.set(a, i); i += a.length; })
  return arr
}

body = document.body

raf = (requestAnimationFrame || webkitRequestAnimationFrame)
ctxOptions = {
  desynchronized: false
}

const waitForDomElement = (check, containerSelector, callback) => {
  if (check()) {
    callback()
  } else {
    const observer = new MutationObserver((mutationsList, observer) => {
      if (!check()) return
      observer.disconnect()
      callback()
    })
    observer.observe($.s(containerSelector), {
      childList: true,
      subtree: true
    })
    return observer
  }
}

//// Ambilight

class Ambilight {
  static setDarkThemeBusy = false

  constructor(videoPlayer) {
    this.showDisplayFrameRate = true
    this.showVideoFrameRate = true

    this.setFeedbackLink()

    this.playerOffset = {}
    this.srcVideoOffset = {}

    this.isHidden = true
    this.isOnVideoPage = true
    this.showedHighQualityCompareWarning = false

    this.p = null
    this.a = null
    this.isFullscreen = false
    this.isFillingFullscreen = false
    this.isVR = false

    this.videoFrameCount = 0
    this.skippedFrames = 0
    this.displayFrameRate = 0
    this.videoFrameRate = 0
    this.videoFrameRateMeasureStartTime = 0
    this.videoFrameRateMeasureStartFrame = 0
    this.ambilightFrameCount = 0

    this.settings = [
      {
        type: 'section',
        label: 'Ambilight'
      },
      {
        name: 'spread',
        label: '<span style="display: inline-block; padding: 5px 0">Spread<br/><span style="line-height: 12px; font-size: 10px;">(More GPU usage)</span></span>',
        type: 'list',
        default: 20,
        min: 0,
        max: 200,
        step: .1
      },
      {
        name: 'blur',
        label: '<span style="display: inline-block; padding: 5px 0">Blur<br/><span style="line-height: 12px; font-size: 10px;">(More GPU memory)</span></span>',
        type: 'list',
        default: 50,
        min: 0,
        max: 100
      },
      {
        name: 'bloom',
        label: 'Fade out start',
        type: 'list',
        default: 15,
        min: -50,
        max: 100,
        step: .1
      },
      {
        name: 'fadeOutEasing',
        label: '<span style="display: inline-block; padding: 5px 0">Fade out curve<br/><span style="line-height: 12px; font-size: 10px;">(Tip: Turn blur all the way down)</span></span>',
        type: 'list',
        default: 60,
        min: 1,
        max: 100,
        step: 1
      },
      {
        name: 'edge',
        label: '<span style="display: inline-block; padding: 5px 0">Edge size<br/><span style="line-height: 12px; font-size: 10px;">(Lower GPU usage. Tip: Turn blur down)</span></span>',
        type: 'list',
        default: 20,
        min: 2,
        max: 50,
        step: .1
      },
      {
        new: true,
        name: 'debandingStrength',
        label: 'Debanding (dithering) <a href="https://www.lifewire.com/what-is-dithering-4686105" target="_blank" style="padding: 0 5px;"> ? </a>',
        type: 'list',
        default: 0,
        min: 0,
        max: 100
      },
      {
        name: 'highQuality',
        label: '<span style="display: inline-block; padding: 5px 0">High Precision<br/><span style="line-height: 12px; font-size: 10px;">(More CPU usage)</span></span>',
        type: 'checkbox',
        default: false
      },
      // {
      //   name: 'sepia',
      //   label: 'Sepia',
      //   type: 'list',
      //   value: this.sepia,
      //   min: 0,
      //   max: 100
      // },
      {
        type: 'section',
        label: 'Ambilight image adjustment'
      },
      {
        name: 'brightness',
        label: 'Brightness',
        type: 'list',
        default: 100,
        min: 0,
        max: 200
      },
      {
        name: 'contrast',
        label: 'Contrast',
        type: 'list',
        default: 100,
        min: 0,
        max: 200
      },
      {
        name: 'saturation',
        label: 'Saturation',
        type: 'list',
        default: 100,
        min: 0,
        max: 200
      },
      {
        type: 'section',
        label: 'Video resizing'
      },
      {
        new: true,
        name: 'horizontalBarsClipPercentage',
        label: 'Remove horizontal black bars',
        type: 'list',
        default: 0,
        min: 0,
        max: 49,
        step: 0.1,
        snapPoints: [8.7, 12.3, 13.5]
      },
      {
        name: 'horizontalBarsClipPercentageReset',
        label: 'Reset black bars next video',
        type: 'checkbox',
        default: false
      },
      {
        name: 'videoScale',
        label: 'Scale',
        type: 'list',
        default: 100,
        min: 25,
        max: 100,
        step: 0.1
      },
      {
        type: 'section',
        label: 'Other page content'
      },
      {
        new: true,
        name: 'surroundingContentShadowSize',
        label: 'Shadow size',
        type: 'list',
        default: 16,
        min: 0,
        max: 100
      },
      {
        new: true,
        name: 'surroundingContentShadowOpacity',
        label: 'Shadow opacity',
        type: 'list',
        default: 67,
        min: 0,
        max: 100
      },
      {
        name: 'immersive',
        label: 'Hide (immersive mode) [Z]',
        type: 'checkbox',
        default: false
      },
      {
        type: 'section',
        label: 'General'
      },
      {
        new: true,
        name: 'showFPS',
        label: 'Show framerate',
        type: 'checkbox',
        default: false
      },
      {
        new: true,
        name: 'resetThemeToLightOnDisable',
        label: 'Dark theme on video page only',
        type: 'checkbox',
        default: false
      },
      {
        name: 'enableInFullscreen',
        label: '<span style="display: inline-block; padding: 5px 0">Enable in fullscreen<br/><span style="line-height: 12px; font-size: 10px;">(When in fullscreen mode)</span></span>',
        type: 'checkbox',
        default: true
      },
      {
        name: 'enabled',
        label: 'Enabled [A]',
        type: 'checkbox',
        default: true
      }
    ]

    this.enabled = this.getSetting('enabled')
    $.s('html').attr('data-ambilight-enabled', this.enabled)
    this.spread = this.getSetting('spread')
    this.blur = this.getSetting('blur')
    this.bloom = this.getSetting('bloom')
    this.fadeOutEasing = this.getSetting('fadeOutEasing')
    this.edge = this.getSetting('edge')
    this.innerStrength = 2

    this.contrast = this.getSetting('contrast')
    this.brightness = this.getSetting('brightness')
    this.saturation = this.getSetting('saturation')
    // this.sepia = this.getSetting('sepia')
    // if(this.sepia === null) this.sepia = 0

    this.videoScale = this.getSetting('videoScale')
    this.horizontalBarsClipPercentage = this.getSetting('horizontalBarsClipPercentage')
    this.horizontalBarsClipPercentageReset = this.getSetting('horizontalBarsClipPercentageReset')

    this.highQuality = this.getSetting('highQuality', true)
    this.immersive = this.getSetting('immersive', true)
    this.enableInFullscreen = this.getSetting('enableInFullscreen', true)
    this.resetThemeToLightOnDisable = this.getSetting('resetThemeToLightOnDisable', true)
    this.showFPS = this.getSetting('showFPS')

    this.surroundingContentShadowSize = this.getSetting('surroundingContentShadowSize')
    this.surroundingContentShadowOpacity = this.getSetting('surroundingContentShadowOpacity')
    this.debandingStrength = this.getSetting('debandingStrength')

    this.settings.forEach(setting => {
      setting.value = this[setting.name]
    })

    this.style = document.createElement('style')
    this.style.appendChild(document.createTextNode(''))
    document.head.appendChild(this.style)
    this.updateStyles()

    this.setupVideoPlayer(videoPlayer)

    this.allContainer = document.createElement("div")
    this.allContainer.class('ambilight')
    body.prepend(this.allContainer)

    this.ambilightContainer = document.createElement("div")
    this.ambilightContainer.class('ambilight__container')
    this.allContainer.prepend(this.ambilightContainer)

    this.clipContainer = document.createElement("div")
    this.clipContainer.class('ambilight__clip-container')
    this.ambilightContainer.prepend(this.clipContainer)

    this.playerContainer = document.createElement("div")
    this.playerContainer.class('ambilight__player-container')
    this.clipContainer.prepend(this.playerContainer)

    this.canvasList = document.createElement("div")
    this.canvasList.class('ambilight__canvas-list')
    this.playerContainer.prepend(this.canvasList)

    const bufferElem = document.createElement('canvas')
    const bufferCtx = bufferElem.getContext('2d', ctxOptions)
    this.buffer = {
      elem: bufferElem,
      ctx: bufferCtx
    }

    const compareBufferElem = new OffscreenCanvas(1, 1)
    this.compareBuffer = {
      elem: compareBufferElem,
      ctx: compareBufferElem.getContext('2d', ctxOptions)
    }

    const shadowElem = document.createElement('canvas')
    shadowElem.class('ambilight__shadow')
    this.playerContainer.appendChild(shadowElem)
    const shadowCtx = shadowElem.getContext('2d', ctxOptions)
    this.shadow = {
      elem: shadowElem,
      ctx: shadowCtx
    }

    this.recreateCanvasses()

    if (this.showDisplayFrameRate || this.showVideoFrameRate) {
      this.FPSContainer = document.createElement("div")
      this.FPSContainer.class('ambilight__fps-container')

      this.videoFPSContainer = document.createElement("div")
      this.videoFPSContainer.class('ambilight__video-fps')
      this.FPSContainer.prepend(this.videoFPSContainer)

      this.displayFPSContainer = document.createElement("div")
      this.displayFPSContainer.class('ambilight__display-fps')
      this.FPSContainer.prepend(this.displayFPSContainer)

      $.s('#player-container').prepend(this.FPSContainer)
    }

    window.addEventListener('resize', () => {
      this.checkVideoSize()
      setTimeout(() =>
        raf(() =>
          setTimeout(() => this.checkVideoSize(), 200)
        ),
        200)
    })

    document.addEventListener('keydown', (e) => {
      if (document.activeElement) {
        const el = document.activeElement
        const tag = el.tagName
        const inputs = ['INPUT', 'SELECT', 'TEXTAREA']
        if (inputs.indexOf(tag) !== -1 || el.getAttribute('contenteditable') === 'true')
          return
      }
      if (e.keyCode === 70 || e.keyCode === 84)
        setTimeout(() => this.checkVideoSize(), 0)
      if (e.keyCode === 90) // z
        this.toggleImmersiveMode()
      if (e.keyCode === 65) // a
        this.toggleEnabled()
    })

    this.initSettings()
    this.initScrollPosition()
    this.initImmersiveMode()

    setTimeout(() => {
      if (this.enabled)
        this.enable(true)
    }, 0)
  }

  setupVideoPlayer(videoPlayer) {
    this.videoPlayer = videoPlayer

    $.sa('.ytp-size-button, .ytp-miniplayer-button').forEach(btn =>
      btn.on('click', () => raf(() =>
        setTimeout(() => this.checkVideoSize(), 0)
      ))
    )

    this.videoPlayer.on('playing', () => {
      this.start()
      this.resetBlackBarsIfNeeded()
    })
      .on('seeked', () => {
        this.resetVideoFrameCounter()
        this.scheduleNextFrame()
      })
      .on('ended', () => {
        this.resetBlackBarsIfNeeded()
        this.clear()
      })
      .on('emptied', () => {
        this.resetBlackBarsIfNeeded()
        this.clear()
      })
  }

  resetBlackBarsIfNeeded() {
    const videoPath = location.search
    if (!this.prevVideoPath || videoPath !== this.prevVideoPath) {
      if (this.horizontalBarsClipPercentageReset) {
        this.setSetting('horizontalBarsClipPercentage', 0)
        $.s('#setting-horizontalBarsClipPercentage').value = 0
        $.s(`#setting-horizontalBarsClipPercentage-value`).innerHTML = '0%'
        this.horizontalBarsClipPercentage = 0
        this.checkVideoSize()
      }
    }
    this.prevVideoPath = videoPath
  }

  setFeedbackLink() {
    const version = $.s('html').getAttribute('data-ambilight-version') || ''
    const os = $.s('html').getAttribute('data-ambilight-os') || ''
    this.feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}`
  }

  recreateCanvasses() {
    const spreadLevels = Math.max(2, Math.round((this.spread / this.edge)) + this.innerStrength + 1)

    if (!this.players) {
      this.players = []
    }

    this.players = this.players.filter((player, i) => {
      if (i >= spreadLevels) {
        player.elem.remove()
        return false
      }
      return true
    })

    for (let i = this.players.length; i < spreadLevels; i++) {
      const canvas = $.create('canvas')
      canvas.class('ambilight__canvas')

      const ctx = canvas.getContext('2d', ctxOptions)
      this.canvasList.prepend(canvas)

      this.players.push({
        elem: canvas,
        ctx: ctx
      })
    }
  }

  resetVideoFrameCounter() {
    this.videoFrameCount = 0
  }

  clear() {
    this.players.forEach((player) => {
      player.ctx.fillStyle = '#000'
      player.ctx.fillRect(0, 0, player.elem.width, player.elem.height)
    })
  }

  horizontalBarsClipPX = 0

  updateSizes() {
    try {
      this.isVR = !!$.s('.ytp-webgl-spherical')
      this.isFullscreen = !!$.s('.ytp-fullscreen')
      const noClipOrScale = (this.horizontalBarsClipPercentage == 0 && this.videoScale == 100)
      this.isFillingFullscreen = (
        this.isFullscreen &&
        Math.abs(this.playerOffset.width - window.innerWidth) < 10 &&
        Math.abs(this.playerOffset.height - window.innerHeight) < 10 &&
        noClipOrScale
      )

      if (this.isFullscreen) {
        if (this.enableInFullscreen) {
          body.removeClass('ambilight-disable-in-fullscreen')
        } else {
          body.class('ambilight-disable-in-fullscreen')
        }
      }

      const videoPlayerContainer = this.videoPlayer.parentNode

      //Ignore minimization after scrolling down
      const notVisible = (!this.enabled || this.isVR || $.s('.html5-video-player').classList.contains('ytp-player-minimized') || (this.isFullscreen && !this.enableInFullscreen))
      if (notVisible || noClipOrScale) {
        $.s('.html5-video-container').style.setProperty('transform', ``)
        videoPlayerContainer.style.overflow = ''
        this.videoPlayer.style.marginTop = ''
        videoPlayerContainer.style.marginTop = ''
        videoPlayerContainer.style.height = ''
      }
      if (notVisible) {
        return true
      }

      const horizontalBarsClip = this.horizontalBarsClipPercentage / 100
      if (!noClipOrScale) {
        $.s('.html5-video-container').style.setProperty('transform', `scale(${(this.videoScale / 100)})`)
        videoPlayerContainer.style.overflow = 'hidden'
        this.horizontalBarsClipPX = Math.round(horizontalBarsClip * this.videoPlayer.offsetHeight)
        const top = Math.max(0, parseInt(this.videoPlayer.style.top))
        this.videoPlayer.style.marginTop = `${-this.horizontalBarsClipPX - top}px`
        videoPlayerContainer.style.marginTop = `${this.horizontalBarsClipPX + top}px`
        videoPlayerContainer.style.height = `${this.videoPlayer.offsetHeight * (1 - (horizontalBarsClip * 2))}px`
      }

      this.playerOffset = this.videoPlayer.offset()
      if (
        this.playerOffset.top === undefined || 
        !this.playerOffset.width || 
        !this.playerOffset.height || 
        !this.videoPlayer.videoWidth ||
        !this.videoPlayer.videoHeight
      ) return false //Not ready

      this.srcVideoOffset = {
        top: this.playerOffset.top + window.scrollY,
        width: this.videoPlayer.videoWidth,
        height: this.videoPlayer.videoHeight
      }

      const minSize = 512
      const scaleX = Math.min(this.srcVideoOffset.width / minSize, 4)
      const scaleY = Math.min(this.srcVideoOffset.height / minSize, 4)
      const scale = Math.min(scaleX, scaleY)
      // A size of more than 256 is required to enable GPU acceleration in Chrome
      if (scale < 1) {
        this.p = {
          w: minSize,
          h: minSize
        }
      } else {
        this.p = {
          w: Math.round(this.srcVideoOffset.width / scale),
          h: Math.round((this.srcVideoOffset.height * (1 - (horizontalBarsClip * 2))) / scale)
        }
      }

      this.horizontalBarsScaledClipPX = Math.round(horizontalBarsClip * this.playerOffset.height)
      this.playerContainer.style.left = (this.playerOffset.left + window.scrollX) + 'px'
      this.playerContainer.style.top = (this.playerOffset.top + window.scrollY - 1 + this.horizontalBarsScaledClipPX) + 'px'
      this.playerContainer.style.width = this.playerOffset.width + 'px'
      this.playerContainer.style.height = (this.playerOffset.height - (this.horizontalBarsScaledClipPX * 2)) + 'px'

      this.ambilightContainer.style.webkitFilter = `
        blur(${this.playerOffset.height * (this.blur * .0025)}px)
        ${(this.contrast !== 100) ? `contrast(${this.contrast}%)` : ''}
        ${(this.brightness !== 100) ? `brightness(${this.brightness}%)` : ''}
        ${(this.saturation !== 100) ? `saturate(${this.saturation}%)` : ''}
      `
      // this.allContainer.style.webkitFilter = `
      //   ${(this.contrast !== 100) ? `contrast(${this.contrast}%)` : ''}
      //   ${(this.brightness !== 100) ? `brightness(${(parseInt(this.brightness) + 3)}%)` : ''}
      //   ${(this.saturation !== 100) ? `saturate(${this.saturation}%)` : ''}
      //   ${/*(this.sepia !== 0) ? `sepia(${this.sepia}%)` : ''*/ ''}
      // `

      this.players.forEach((player) => {
        if (player.elem.width !== this.p.w)
          player.elem.width = this.p.w
        if (player.elem.height !== this.p.h)
          player.elem.height = this.p.h
        player.ctx = player.elem.getContext('2d', ctxOptions)
      })

      this.buffer.elem.width = this.p.w
      this.buffer.elem.height = this.p.h
      this.buffer.ctx = this.buffer.elem.getContext('2d', ctxOptions)
      //this.buffer.ctx.globalAlpha = .5

      this.compareBuffer.elem.width = this.srcVideoOffset.width
      this.compareBuffer.elem.height = this.srcVideoOffset.height
      this.compareBuffer.ctx = this.compareBuffer.elem.getContext('2d', ctxOptions)
      this.compareBufferBarsClipPx = Math.round(this.compareBuffer.elem.height * horizontalBarsClip)

      this.resizeCanvasses()

      this.resetVideoFrameCounter()

      return true
    } catch (ex) {
      console.error('YouTube Ambilight | Resize | UpdateSizes:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
      throw ex
    }
  }

  updateStyles() {
    const shadowSize = this.surroundingContentShadowSize / 5
    const shadowOpacity = this.surroundingContentShadowOpacity / 100
    const baseurl = $.s('html').getAttribute('data-ambilight-baseurl') || ''
    const debandingStrength = parseInt(this.debandingStrength)

    this.style.childNodes[0].data = `
      html[data-ambilight-enabled="true"] ytd-app[is-watch-page] #top > #container > *,
      html[data-ambilight-enabled="true"]  ytd-app[is-watch-page] #primary-inner > *:not(#player),
      html[data-ambilight-enabled="true"]  ytd-app[is-watch-page] #secondary {
        ${shadowSize ? `filter: drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity})) drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity})) !important;` : ''}
      }

      ${debandingStrength ? `
        .ambilight::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          left: 0;
          top: 0;
          background: url('${baseurl}images/noise-${(debandingStrength > 75) ? 3 : (debandingStrength > 50) ? 2 : 1}.png');
          opacity: ${debandingStrength / ((debandingStrength > 75) ? 100 : (debandingStrength > 50) ? 75 : 50)};
        }
      ` : ''}
    `
  }

  resizeCanvasses() {
    const playerSize = {
      w: this.playerOffset.width,
      h: this.playerOffset.height - (this.horizontalBarsScaledClipPX * 2)
    }
    const ratio = (playerSize.w > playerSize.h) ?
      {
        x: 1,
        y: (playerSize.w / playerSize.h)
      } : {
        x: (playerSize.h / playerSize.w),
        y: 1
      }
    const lastScale = {
      x: 1,
      y: 1
    }

    const scaleStep = this.edge / 100

    this.players.forEach((player, i) => {
      const pos = i - this.innerStrength
      let scaleX = 1
      let scaleY = 1

      if (pos > 0) {
        scaleX = 1 + ((scaleStep * ratio.x) * pos)
        scaleY = 1 + ((scaleStep * ratio.y) * pos)
      }

      if (pos < 0) {
        scaleX = 1 - ((scaleStep * ratio.x) * -pos)
        scaleY = 1 - ((scaleStep * ratio.y) * -pos)
        if (scaleX < 0) scaleX = 0
        if (scaleY < 0) scaleY = 0
      }
      lastScale.x = scaleX
      lastScale.y = scaleY
      player.elem.style.transform = `scale(${scaleX}, ${scaleY})`
    })

    this.shadow.elem.style.transform = `scale(${lastScale.x + 0.01}, ${lastScale.y + 0.01})`
    this.shadow.ctx.clearRect(0, 0, this.shadow.elem.width, this.shadow.elem.height)

    //Shadow gradient 
    const drawGradient = (size, edge, keyframes, fadeOutFrom, darkest, horizontal) => {
      const points = [
        0,
        ...keyframes.map(e => Math.max(0, edge - (edge * e.p) - (edge * fadeOutFrom * (1 - e.p)))),
        edge - (edge * fadeOutFrom),
        edge + size + (edge * fadeOutFrom),
        ...keyframes.reverse().map(e => Math.min(edge + size + edge, edge + size + (edge * e.p) + (edge * fadeOutFrom * (1 - e.p)))),
        edge + size + edge
      ]

      const pointMax = (points[points.length - 1])
      const gradient = this.shadow.ctx.createLinearGradient(
        0,
        0,
        horizontal ? this.shadow.elem.width : 0,
        !horizontal ? this.shadow.elem.height : 0
      )

      gradient.addColorStop(Math.min(1, points[0] / pointMax), `rgba(0,0,0,${darkest})`)
      keyframes.forEach((e, i) => {
        gradient.addColorStop(Math.min(1, points[0 + keyframes.length - i] / pointMax), `rgba(0,0,0,${e.o})`)
      })
      gradient.addColorStop(Math.min(1, points[1 + keyframes.length] / pointMax), `rgba(0,0,0,0)`)
      gradient.addColorStop(Math.min(1, points[2 + keyframes.length] / pointMax), `rgba(0,0,0,0)`)
      keyframes.reverse().forEach((e, i) => {
        gradient.addColorStop(Math.min(1, points[2 + (keyframes.length * 2) - i] / pointMax), `rgba(0,0,0,${e.o})`)
      })
      gradient.addColorStop(Math.min(1, points[3 + (keyframes.length * 2)] / pointMax), `rgba(0,0,0,${darkest})`)

      this.shadow.ctx.fillStyle = gradient
      this.shadow.ctx.fillRect(0, 0, this.shadow.elem.width, this.shadow.elem.height)
    }

    const edge = {
      w: ((playerSize.w * lastScale.x) - playerSize.w) / 2 / lastScale.x,
      h: ((playerSize.h * lastScale.y) - playerSize.h) / 2 / lastScale.y
    }
    const video = {
      w: (playerSize.w / lastScale.x),
      h: (playerSize.h / lastScale.y)
    }

    const plotKeyframes = (length, powerOf, darkest) => {
      const keyframes = []
      for (let i = 1; i < length; i++) {
        keyframes.push({
          p: (i / length),
          o: Math.pow(i / length, powerOf) * darkest
        })
      }
      return keyframes
    }
    const darkest = 1
    const easing = (16 / (this.fadeOutEasing * .64))
    const keyframes = plotKeyframes(64, easing, darkest)

    const fadeOutFrom = this.bloom / 100
    drawGradient(video.h, edge.h, keyframes, fadeOutFrom, darkest, false)
    drawGradient(video.w, edge.w, keyframes, fadeOutFrom, darkest, true)
  }

  checkVideoSize() {
    //Resized
    if (this.previousWidth !== this.videoPlayer.clientWidth
      || this.previousTop !== this.videoPlayer.style.top
      || this.previousEnabled !== this.enabled
    ) {
      this.previousEnabled = this.enabled
      this.previousWidth = this.videoPlayer.clientWidth
      this.previousTop = this.videoPlayer.style.top
      return this.updateSizes()
    }

    //Auto quality moved up or down
    if (this.srcVideoOffset.width !== this.videoPlayer.videoWidth
      || this.srcVideoOffset.height !== this.videoPlayer.videoHeight) {
      return this.updateSizes()
    }

    return true
  }

  nextFrame = () => {
    try {
      this.scheduled = false
      if (this.checkVideoSize())
        this.drawAmbilight()

      if (this.scheduled || !this.enabled || this.videoPlayer.paused) return
      this.scheduleNextFrame()
    } catch (ex) {
      console.error('YouTube Ambilight | NextFrame:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }

  scheduleNextFrame() {
    if (this.scheduled || !this.enabled || !this.isOnVideoPage) return

    raf(this.nextFrame)
    this.scheduled = true
  }

  isNewFrame(oldImage, newImage) {
    if (!oldImage || oldImage.length !== newImage.length) {
      oldImage = null
      newImage = null
      return true
    }

    for (let i = 0; i < oldImage.length; i++) {
      for (let xi = 0; xi < oldImage[i].length; xi++) {
        if (oldImage[i][xi] !== newImage[i][xi]) {
          oldImage = null
          newImage = null
          i = null
          xi = null
          return true
        }
      }
    }

    oldImage = null
    newImage = null
    return false
  }

  detectVideoFrameRate() {
    if (this.videoFrameRateStartTime === undefined) {
      this.videoFrameRateStartTime = 0
      this.videoFrameRateStartFrame = 0
    }

    const frameCount = this.videoPlayer.webkitDecodedFrameCount + this.videoPlayer.webkitDroppedFrameCount
    if (this.videoFrameCount !== frameCount) {
      const videoFrameRateFrame = frameCount
      const videoFrameRateTime = performance.now()
      if (this.videoFrameRateStartTime + 1000 < videoFrameRateTime) {
        if (this.videoFrameRateStartFrame !== 0) {
          this.videoFrameRate = (videoFrameRateFrame - this.videoFrameRateStartFrame) / ((videoFrameRateTime - this.videoFrameRateStartTime) / 1000)
          if (this.showFPS) {
            const frameRateText = (Math.round(Math.min(this.displayFrameRate || this.videoFrameRate, Math.max(0, this.videoFrameRate)) * 100) / 100).toFixed(2)
            this.videoFPSContainer.innerHTML = `VIDEO: ${frameRateText}`
          } else if (this.videoFPSContainer.innerHTML !== '') {
            this.videoFPSContainer.innerHTML = ''
          }
        }
        this.videoFrameRateStartFrame = videoFrameRateFrame
        this.videoFrameRateStartTime = videoFrameRateTime
      }
    }
  }

  detectDisplayFrameRate() {
    const displayFrameRateTime = performance.now()
    if (this.displayFrameRateStartTime < displayFrameRateTime - 1000) {
      this.displayFrameRate = this.displayFrameRateFrame / ((displayFrameRateTime - this.displayFrameRateStartTime) / 1000)
      if (this.showFPS) {
        const frameRateText = (Math.round(Math.max(0, this.displayFrameRate) * 100) / 100).toFixed(2)
        this.displayFPSContainer.innerHTML = `DISPLAY: ${frameRateText}`
        this.displayFPSContainer.style.color = (this.displayFrameRate < this.videoFrameRate) ? '#f33' : (this.displayFrameRate < this.videoFrameRate + 5) ? '#ff0' : '#3f3'
      } else if (this.displayFPSContainer.innerHTML !== '') {
        this.displayFPSContainer.innerHTML = ''
      }
      this.displayFrameRateFrame = 1
      this.displayFrameRateStartTime = displayFrameRateTime
    } else {
      if (!this.displayFrameRateFrame) {
        this.displayFrameRateFrame = 1
        this.displayFrameRateStartTime = displayFrameRateTime
      } else {
        this.displayFrameRateFrame++
      }
    }
  }

  drawAmbilight() {
    if (!this.enabled) return

    if (
      this.isVR ||
      this.isFillingFullscreen ||
      (!this.enableInFullscreen && this.isFullscreen)
    ) {
      this.hide()
      return
    }

    if (this.isHidden) {
      this.show()
    }

    this.detectVideoFrameRate()
    this.detectDisplayFrameRate()

    const newFrameCount = this.videoPlayer.webkitDecodedFrameCount + this.videoPlayer.webkitDroppedFrameCount
    if (this.videoFrameCount == newFrameCount) {
      this.skippedFrames = 0
      if (!this.highQuality) return
    } else if (this.videoFrameCount < newFrameCount && this.videoFrameCount > 120 && this.videoFrameCount - newFrameCount < - 2) {
      this.skippedFrames++
    }
    if (this.videoFrameCount == newFrameCount - 1) {
      this.skippedFrames = 0
    }
    if (this.skippedFrames > 20) {
      console.warn(`YouTube Ambilight: Skipped ${newFrameCount - this.videoFrameCount - 1} frames\n(Your GPU might not be fast enough)`)
    }

    //performance.mark('start-drawing')
    this.compareBuffer.ctx.drawImage(this.videoPlayer, 0, 0, this.compareBuffer.elem.width, this.compareBuffer.elem.height)

    if (
      this.highQuality &&
      this.videoFrameCount === newFrameCount
    ) {
      if (!this.videoFrameRate || !this.displayFrameRate || this.videoFrameRate < (this.displayFrameRate)) {
        //performance.mark('comparing-compare-start')
        let newImage = []

        let partSize = Math.ceil(this.compareBuffer.elem.height / 3)
        let isNewFrame = false

        try {
          for (let i = partSize; i < this.compareBuffer.elem.height; i += partSize) {
            newImage.push(this.compareBuffer.ctx.getImageData(0, i, this.compareBuffer.elem.width, 1).data)
          }
          isNewFrame = this.isNewFrame(this.oldImage, newImage)
          //performance.mark('comparing-compare-end')
        } catch (ex) {
          if (!this.showedHighQualityCompareWarning) {
            console.warn('Failed to retrieve video data. ', ex)
            AmbilightSentry.captureExceptionWithDetails(ex)
            this.showedHighQualityCompareWarning = true
          }
        }

        if (!isNewFrame) {
          newImage = null
          this.videoFrameCount++
          return
        }

        //performance.measure('comparing-compare', 'comparing-compare-start', 'comparing-compare-end')

        this.oldImage = newImage
        newImage = null
      }
    }

    this.videoFrameCount = newFrameCount

    this.buffer.ctx.drawImage(this.compareBuffer.elem, 0, this.compareBufferBarsClipPx, this.compareBuffer.elem.width, this.compareBuffer.elem.height - (this.compareBufferBarsClipPx * 2), 0, 0, this.p.w, this.p.h)
    //performance.mark('end-drawing')
    //performance.measure('drawing', 'start-drawing', 'end-drawing')

    this.players.forEach((player) => {
      player.ctx.drawImage(this.buffer.elem, 0, 0)
    })

    this.ambilightFrameCount++
  }

  enable(initial = false) {
    if (this.enabled && !initial) return

    this.setSetting('enabled', true)
    $.s(`#setting-enabled`).attr('aria-checked', true)

    $.s('html').attr('data-ambilight-enabled', true)

    if (!initial) {
      const toLight = !$.s('html').attr('dark')
      this.resetThemeToLightOnDisable = toLight
      this.setSetting('resetThemeToLightOnDisable', toLight)
      $.s(`#setting-resetThemeToLightOnDisable`).attr('aria-checked', toLight)
    }

    this.resetBlackBarsIfNeeded()
    this.checkVideoSize()
    this.start()
  }

  disable() {
    if (!this.enabled) return

    this.setSetting('enabled', false)
    $.s(`#setting-enabled`).attr('aria-checked', false)
    $.s('html').attr('data-ambilight-enabled', false)

    if (this.resetThemeToLightOnDisable) {
      this.resetThemeToLightOnDisable = undefined
      Ambilight.setDarkTheme(false)
    }

    this.videoPlayer.style.marginTop = ''
    const videoPlayerContainer = this.videoPlayer.parentNode
    videoPlayerContainer.style.overflow = ''
    videoPlayerContainer.style.marginTop = ''
    videoPlayerContainer.style.height = ''

    this.checkVideoSize()
    this.hide()
  }

  static setDarkTheme(value) {
    try {
      if (Ambilight.setDarkThemeBusy) return
      if ($.s('html').attr('dark')) {
        if (value) return
      } else {
        if (!value) return
      }
      if (value && !$.s('ytd-app').hasAttribute('is-watch-page')) return
      Ambilight.setDarkThemeBusy = true

      const toggle = (renderer) => {
        renderer = renderer || $.s('ytd-toggle-theme-compact-link-renderer')
        if (value) {
          renderer.handleSignalActionToggleDarkThemeOn()
        } else {
          renderer.handleSignalActionToggleDarkThemeOff()
        }
        Ambilight.setDarkThemeBusy = false
      }

      const renderer = $.s('ytd-toggle-theme-compact-link-renderer')
      if (renderer) {
        toggle(renderer)
      } else {
        $.s('ytd-popup-container').style.opacity = 0
        waitForDomElement(
          () => $.s('#avatar-btn'),
          'ytd-masthead',
          () => {
            waitForDomElement(
              () => {
                const renderer = $.s('ytd-toggle-theme-compact-link-renderer')
                return (renderer && renderer.handleSignalActionToggleDarkThemeOn)
              },
              'ytd-popup-container',
              () => {
                $.s('#avatar-btn').click()
                toggle()
                setTimeout(() => {
                  $.s('ytd-popup-container').style.opacity = ''
                  previousActiveElement.focus()
                }, 1)
              })
            let previousActiveElement = document.activeElement
            $.s('#avatar-btn').click()
          }
        )
      }
    } catch (ex) {
      console.error('Error while setting dark mode', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
      Ambilight.setDarkThemeBusy = false
    }
  }

  toggleEnabled() {
    if (this.enabled)
      this.disable()
    else
      this.enable()
  }

  start() {
    if (!this.isOnVideoPage || !this.enabled) return

    this.videoFrameRateMeasureStartFrame = 0
    this.videoFrameRateMeasureStartTime = 0
    this.showedHighQualityCompareWarning = false

    if (!$.s('html').attr('dark')) {
      Ambilight.setDarkTheme(true)
    }

    this.scheduleNextFrame()
  }


  hide() {
    if (this.isHidden) return
    this.isHidden = true
    this.ambilightContainer.style.opacity = '0'
    setTimeout(() => {
      this.clear()
    }, 500)
    if (this.resetThemeToLightOnDisable) {
      this.resetThemeToLightOnDisable = undefined
      Ambilight.setDarkTheme(false)
    }
  }

  show() {
    this.isHidden = false
    this.ambilightContainer.style.opacity = '1'
    Ambilight.setDarkTheme(true)
  }


  initScrollPosition() {
    window.on('scroll', () => {
      this.checkScrollPosition()
    })
    this.checkScrollPosition()
  }

  checkScrollPosition() {
    if (this.changedTopTimeout)
      clearTimeout(this.changedTopTimeout)
    if (window.scrollY > 0)
      this.changedTopTimeout = setTimeout(() => body.class('not-at-top').removeClass('at-top'), 100)
    else
      this.changedTopTimeout = setTimeout(() => body.class('at-top').removeClass('not-at-top'), 100)
  }


  initImmersiveMode() {
    if (this.immersive)
      body.class('immersive-mode')
  }

  toggleImmersiveMode() {
    body.classList.toggle('immersive-mode')
    const enabled = body.classList.contains('immersive-mode')
    $.s(`#setting-immersive`).attr('aria-checked', enabled ? 'true' : 'false')
    this.setSetting('immersive', enabled)
    window.dispatchEvent(new Event('resize'))
  }


  initSettings() {
    const button = $.create('button')
      .class('ytp-button ytp-ambilight-settings-button')
      .attr('title', 'Ambilight settings')
      .attr('aria-owns', 'ytp-id-190')
      .on('click', () => this.openSettingsPopup())

    button.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z" fill="#fff"></path>
    </svg>`
    button.prependTo($.s('.ytp-right-controls'))


    this.settingsMenu = $.create('div')
      .class('ytp-popup ytp-settings-menu ytp-ambilight-settings-menu')
      .attr('id', 'ytp-id-190')
    this.settingsMenu.innerHTML = `
      <div class="ytp-panel">
        <div class="ytp-panel-menu" role="menu">
          <a class="ytpa-feedback-link" rowspan="2" href="${this.feedbackFormLink}" target="_blank">
            <span class="ytpa-feedback-link__text">Give feedback or rate YouTube Ambilight</span>
          </a>
          ${
      this.settings.map(setting => {
        if (setting.type === 'checkbox') {
          return `
                  <div id="setting-${setting.name}" class="ytp-menuitem${setting.new ? ' ytap-menuitem--new' : ''}" role="menuitemcheckbox" aria-checked="${setting.value ? 'true' : 'false'}" tabindex="0">
                    <div class="ytp-menuitem-label">${setting.label}</div>
                    <div class="ytp-menuitem-content">
                      <div class="ytp-menuitem-toggle-checkbox"></div>
                    </div>
                  </div>
                `
        } else if (setting.type === 'list') {
          return `
                  <div class="ytp-menuitem${setting.new ? ' ytap-menuitem--new' : ''}" aria-haspopup="false" role="menuitemrange" tabindex="0">
                    <div class="ytp-menuitem-label">${setting.label}</div>
                    <div id="setting-${setting.name}-value" class="ytp-menuitem-content">${setting.value}%</div>
                  </div>
                  <div class="ytp-menuitem-range ${
                    setting.snapPoints ? 'ytp-menuitem-range--has-snap-points': ''
                  }" rowspan="2" title="Double click to reset">
                    <input id="setting-${setting.name}" type="range" min="${setting.min}" max="${setting.max}" colspan="2" value="${setting.value}" step="${setting.step || 1}" list="snap-points-${setting.name}" />
                  </div>
                  ${
                    !setting.snapPoints ? '' : `
                      <datalist class="setting-range-datalist" id="snap-points-${setting.name}">
                        ${
                          setting.snapPoints.map((point, i) => `<option class="setting-range-datalist__label ${
                            (point < setting.snapPoints[i-1] + 2) ? 'setting-range-datalist__label--flip' : ''
                          }" value="${point}" label="${Math.floor(point)}" style="left: ${
                            (point + (-setting.min)) * (100 / (setting.max - setting.min))
                          }%">`)
                        }
                      </datalist>
                    `
                  }
                `
        } else if (setting.type === 'section') {
          return `
                  <div class="ytap-section">
                    <div class="ytap-section__cell">
                      <div class="ytap-section__label">${setting.label}</div>
                    </div>
                    <div class="ytap-section__cell">
                      <div class="ytap-section__fill">-</div>
                    </div>
                  </div>
                `
        }
      }).join('')
      }
        </div>
      </div>`

    this.settingsMenu.prependTo($.s('.html5-video-player'))

    this.settings.forEach(setting => {
      const input = $.s(`#setting-${setting.name}`)
      if (setting.type === 'list') {
        const displayedValue = $.s(`#setting-${setting.name}-value`)
        input.on('change mousemove dblclick', (e) => {
          let value = input.value
          if (e.type === 'dblclick') {
            value = this.settings.find(s => s.name === setting.name).default
          } else if (input.value === input.attr('data-previous-value')) {
            return
          }
          input.value = value
          input.attr('data-previous-value', value)
          displayedValue.innerHTML = `${value}%`
          this.setSetting(setting.name, value)

          if (
            setting.name === 'surroundingContentShadowSize' ||
            setting.name === 'surroundingContentShadowOpacity' ||
            setting.name === 'debandingStrength'
          ) {
            this[setting.name] = value
            this.updateStyles()
            return
          }
          if (setting.name === 'spread' || setting.name === 'edge' || setting.name === 'fadeOutEasing') {
            this.recreateCanvasses()
          }
          this.updateSizes()
          this.scheduleNextFrame()
        })
      } else if (setting.type === 'checkbox') {
        input.on('click', () => {
          if (setting.type === 'checkbox') {
            setting.value = !setting.value
          }

          if (setting.name === 'immersive') {
            this.toggleImmersiveMode()
          }
          if (setting.name === 'enabled') {
            if (setting.value)
              this.enable()
            else
              this.disable()
          }
          if (
            setting.name === 'highQuality' ||
            setting.name === 'enableInFullscreen' ||
            setting.name === 'showFPS' ||
            setting.name === 'resetThemeToLightOnDisable' ||
            setting.name === 'horizontalBarsClipPercentageReset'
          ) {
            this[setting.name] = setting.value
            this.setSetting(setting.name, setting.value)
            $.s(`#setting-${setting.name}`).attr('aria-checked', setting.value)
          }

          if (setting.name === 'enableInFullscreen' && this.isFullscreen) {
            this.updateSizes()
          }
        })
      }
    })
  }

  openSettingsPopup() {
    const isOpen = this.settingsMenu.classList.contains('is-visible')
    if (isOpen) return

    this.settingsMenu.class('is-visible')
    $.s('.ytp-ambilight-settings-button').attr('aria-expanded', true)

    this.closeSettingsListener = (e) => {
      if (this.settingsMenu === e.target || this.settingsMenu.contains(e.target))
        return

      setTimeout(() => {
        this.settingsMenu.removeClass('is-visible')
        $.s('.ytp-ambilight-settings-button').attr('aria-expanded', false)
      }, 1)
      body.off('mouseup', this.closeSettingsListener)
    }
    body.on('mouseup', this.closeSettingsListener)
  }

  setSetting(key, value) {
    this[key] = value

    if (key === 'blur')
      value -= 30
    if (key === 'bloom')
      value -= 7

    if (!this.setSettingTimeout)
      this.setSettingTimeout = {}

    if (this.setSettingTimeout[key])
      clearTimeout(this.setSettingTimeout[key])

    this.setSettingTimeout[key] = setTimeout(() => {
      try {
        localStorage.setItem(`ambilight-${key}`, value)
      } catch (ex) {
        console.error('YouTube Ambilight | setSetting', ex)
        AmbilightSentry.captureExceptionWithDetails(ex)
      }
      this.setSettingTimeout[key] = null
    }, 500)
  }

  getSetting(key) {
    let value = null
    try {
      value = localStorage.getItem(`ambilight-${key}`)
    } catch (ex) {
      console.error('YouTube Ambilight | getSetting', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
    const setting = this.settings.find(setting => setting.name === key)
    if (value === null) {
      value = setting.default
    } else if (setting.type === 'checkbox') {
      value = (value === 'true')
    } else {
      if (key === 'blur')
        value = parseInt(value) + 30
      if (key === 'bloom')
        value = parseInt(value) + 7
    }

    return value
  }
}

const resetThemeToLightIfSettingIsTrue = () => {
  const key = 'resetThemeToLightOnDisable'
  try {
    const value = (localStorage.getItem(`ambilight-${key}`) === 'true')
    if (!value) return
  } catch (ex) {
    console.error('YouTube Ambilight | resetThemeToLightIfSettingIsTrue', ex)
    AmbilightSentry.captureException(ex)
    return
  }

  Ambilight.setDarkTheme(false)
}

const ambilightDetectDetachedVideo = () => {
  const container = $.s('.html5-video-container')
  const ytpApp = $.s('ytd-app')

  const observer = new MutationObserver((mutationsList, observer) => {
    if (!ytpApp.hasAttribute('is-watch-page')) return

    const videoPlayer = container.querySelector('video')
    if (!videoPlayer) return

    const isDetached = ambilight.videoPlayer !== videoPlayer
    if (!isDetached) return

    ambilight.setupVideoPlayer(videoPlayer)
  })

  observer.observe(container, {
    attributes: true,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false,
    childList: false,
    subtree: true
  })
}

const tryInitAmbilight = (ytpApp) => {
  if (!ytpApp.hasAttribute('is-watch-page')) return

  const videoPlayer = $.s("ytd-watch-flexy video")
  if (!videoPlayer) return false

  window.ambilight = new Ambilight(videoPlayer)
  ambilightDetectDetachedVideo()
  return true
}

const ambilightDetectPageTransition = (ytpApp) => {
  const observer = new MutationObserver((mutationsList, observer) => {
    if (!window.ambilight) return

    if (ytpApp.hasAttribute('is-watch-page')) {
      window.ambilight.start()
    } else if (ambilight.resetThemeToLightOnDisable) {
      Ambilight.setDarkTheme(false)
    }
  })
  observer.observe(ytpApp, {
    attributes: true,
    attributeFilter: ['is-watch-page']
  })
}

const ambilightDetectVideoPage = (ytpApp) => {
  if (tryInitAmbilight(ytpApp)) return

  if (!ytpApp.hasAttribute('is-watch-page')) {
    resetThemeToLightIfSettingIsTrue()
  }

  const observer = new MutationObserver((mutationsList, observer) => {
    if (window.ambilight) {
      observer.disconnect()
      return
    }

    tryInitAmbilight(ytpApp)
  })
  observer.observe(ytpApp, {
    childList: true,
    subtree: true
  })
}

try {
  const ytpApp = $.s('ytd-app')
  if (ytpApp) {
    ambilightDetectPageTransition(ytpApp)
    ambilightDetectVideoPage(ytpApp)
  }
} catch (ex) {
  console.error('YouTube Ambilight | Initialization', ex)
  AmbilightSentry.captureException(ex)
}