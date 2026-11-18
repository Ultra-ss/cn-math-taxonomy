/* Dagre runs off the UI thread; geometry-only session cache never stores learning data. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmGraphLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmGraph.layout.v1', VERSION = 'dagre-0.8.5-raw-v1', MAX_ENTRIES = 6, MAX_BYTES = 512 * 1024;
  var script = root.document && root.document.currentScript;
  var workerURL = script && script.src ? new URL('graph-layout-worker.js', script.src).href : '/assets/graph-layout-worker.js';
  var GRAPH_OPTIONS = { nodeSep:'nodesep', edgeSep:'edgesep', rankSep:'ranksep', rankDir:'rankdir', align:'align', ranker:'ranker', acyclicer:'acyclicer' };
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function validId(id) { return typeof id === 'string' && id.length > 0 && id.length <= 256 && ['__proto__','constructor','prototype'].indexOf(id) < 0; }
  function number(value) { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e9; }
  function snapshot(cy, options) {
    options = options || {};
    var eles = options.eles || cy.elements(), nodes = eles.nodes(), edges = eles.edges(), graph = {};
    if (typeof options.sort === 'function') { nodes = nodes.sort(options.sort); edges = edges.sort(options.sort); }
    Object.keys(GRAPH_OPTIONS).forEach(function (key) { if (options[key] != null) graph[GRAPH_OPTIONS[key]] = options[key]; });
    var seen = new Set(), rows = [], links = [];
    nodes.forEach(function (node) {
      var id = node.id(), dimensions = node.layoutDimensions(options);
      if (!validId(id) || seen.has(id) || !number(dimensions.w) || !number(dimensions.h) || dimensions.w < 0 || dimensions.h < 0) throw new Error('Invalid graph layout node');
      seen.add(id);
      var row = {id:id, width:dimensions.w, height:dimensions.h};
      if (node.isChild && node.isChild()) row.parent = node.parent().id();
      rows.push(row);
    });
    edges.forEach(function (edge) {
      if (edge.source().isParent() || edge.target().isParent()) return;
      var id = edge.id(), source = edge.source().id(), target = edge.target().id();
      var minlen = typeof options.minLen === 'function' ? options.minLen.call(edge, edge) : options.minLen;
      var weight = typeof options.edgeWeight === 'function' ? options.edgeWeight.call(edge, edge) : options.edgeWeight;
      if (!validId(id) || !seen.has(source) || !seen.has(target)) throw new Error('Invalid graph layout edge');
      links.push({id:id, source:source, target:target, minlen:minlen == null ? 1 : minlen, weight:weight == null ? 1 : weight});
    });
    return {version:VERSION, graph:graph, nodes:rows, edges:links};
  }
  function compute(data, dagre) {
    if (!dagre || !dagre.graphlib || typeof dagre.layout !== 'function') throw new Error('Graph layout library unavailable');
    var graph = new dagre.graphlib.Graph({multigraph:true, compound:true});
    graph.setGraph(Object.assign({},data.graph)); graph.setDefaultEdgeLabel(function () { return {}; }); graph.setDefaultNodeLabel(function () { return {}; });
    data.nodes.forEach(function (node) { graph.setNode(node.id, {width:node.width, height:node.height, name:node.id}); });
    data.nodes.forEach(function (node) { if (node.parent) graph.setParent(node.id, node.parent); });
    data.edges.forEach(function (edge) { graph.setEdge(edge.source, edge.target, {minlen:edge.minlen, weight:edge.weight, name:edge.id}, edge.id); });
    dagre.layout(graph);
    var positions = Object.create(null);
    data.nodes.forEach(function (node) { var point = graph.node(node.id); positions[node.id] = {x:point.x, y:point.y}; });
    return positions;
  }
  function validPositions(data, positions) {
    return positions && typeof positions === 'object' && !Array.isArray(positions) && Object.keys(positions).length === data.nodes.length &&
      data.nodes.every(function (node) { var p = own(positions,node.id) && positions[node.id]; return p && number(p.x) && number(p.y); });
  }
  function fingerprint(data) { return JSON.stringify(data); }
  function digest(text) {
    var a = 2166136261, b = 5381;
    for (var i=0; i<text.length; i++) { a=Math.imul(a^text.charCodeAt(i),16777619); b=Math.imul(b,33)^text.charCodeAt(i); }
    return (a>>>0).toString(16)+'-'+(b>>>0).toString(16);
  }
  function abortError() { var error = new Error('Graph layout cancelled'); error.name = 'AbortError'; return error; }
  function create(options) {
    options = options || {};
    var win = options.window || root, worker = null, pending = null, serial = 0, destroyed = false, loaded = false, entries = [];
    var setTimer = options.setTimer || function (fn, ms) { return root.setTimeout(fn,ms); };
    var clearTimer = options.clearTimer || function (id) { root.clearTimeout(id); };
    var limit = Number.isInteger(options.maxEntries) ? Math.max(1,Math.min(MAX_ENTRIES,options.maxEntries)) : MAX_ENTRIES;
    // A slower computer may legitimately spend several seconds off-thread. Do not
    // restart that work on the UI thread just because it crossed five seconds.
    var timeout = typeof options.timeout === 'number' ? Math.max(1,options.timeout) : 20000;
    function storage() { return own(options,'storage') ? options.storage : win.sessionStorage; }
    function loadCache() {
      if (loaded) return;
      loaded = true;
      try {
        var raw = storage() && storage().getItem(KEY), data = raw && raw.length <= MAX_BYTES ? JSON.parse(raw) : null;
        if (data && data.v === 1 && Array.isArray(data.entries)) entries = data.entries.filter(function (entry) {
          return entry && typeof entry.key === 'string' && typeof entry.identity === 'string' && entry.identity.length < MAX_BYTES && entry.positions && typeof entry.positions === 'object';
        }).slice(-limit);
      } catch (error) { entries = []; }
    }
    function saveCache() {
      try {
        var text = JSON.stringify({v:1,entries:entries});
        while (text.length > MAX_BYTES && entries.length) { entries.shift(); text = JSON.stringify({v:1,entries:entries}); }
        if (storage()) storage().setItem(KEY,text);
      } catch (error) { /* Cache is optional, including private browsing and quota errors. */ }
    }
    function stopWorker() { if (worker) { worker.terminate(); worker = null; } }
    function clearPending(job) {
      if (job.timer !== null) clearTimer(job.timer);
      if (job.fallbackTimer !== null) clearTimer(job.fallbackTimer);
      if (job.signal && job.abort) job.signal.removeEventListener('abort',job.abort);
      pending = null;
    }
    function cancel() {
      if (!pending) return;
      var job = pending; clearPending(job); stopWorker(); job.reject(abortError());
    }
    function finish(job, positions, source) {
      if (pending !== job || destroyed) return;
      if (!validPositions(job.data,positions)) { fallback(job); return; }
      clearPending(job);
      entries = entries.filter(function (entry) { return entry.key !== job.key; });
      entries.push({key:job.key, identity:job.identity, positions:copy(positions)});
      if (entries.length > limit) entries.shift();
      saveCache(); job.resolve({positions:copy(positions),cached:false,source:source});
    }
    function fallback(job) {
      if (pending !== job || destroyed || job.fallback) return;
      job.fallback = true;
      if (job.timer !== null) { clearTimer(job.timer); job.timer = null; }
      stopWorker();
      // Unsupported/blocked workers retain the old algorithm, after yielding to UI.
      job.fallbackTimer = setTimer(function () {
        job.fallbackTimer = null;
        if (pending !== job || destroyed) return;
        try {
          var positions = compute(job.data,options.dagre || win.dagre);
          if (!validPositions(job.data,positions)) throw new Error('Invalid graph layout result');
          finish(job,positions,'main');
        } catch (error) { clearPending(job); job.reject(error); }
      },0);
    }
    function getWorker() {
      if (worker) return worker;
      worker = options.workerFactory ? options.workerFactory() : typeof win.Worker === 'function' ? new win.Worker(options.workerURL || workerURL) : null;
      if (!worker) return null;
      worker.onmessage = function (event) {
        var message=event.data, job=pending;
        if (!job || !message || message.id !== job.id) return;
        if (message.error) fallback(job); else finish(job,message.positions,'worker');
      };
      worker.onerror = function () { if (pending) fallback(pending); else stopWorker(); };
      worker.onmessageerror = function () { if (pending) fallback(pending); else stopWorker(); };
      return worker;
    }
    function run(cy, layoutOptions) {
      cancel();
      if (destroyed) return Promise.reject(abortError());
      var data;
      try { data=snapshot(cy,layoutOptions); } catch (error) { return Promise.reject(error); }
      var signal=layoutOptions && layoutOptions.signal;
      if (signal && signal.aborted) return Promise.reject(abortError());
      loadCache();
      var identity=fingerprint(data), key=digest(identity);
      var index=entries.findIndex(function (entry) { return entry.key===key && entry.identity===identity && validPositions(data,entry.positions); });
      if (index>=0) {
        var hit=entries.splice(index,1)[0]; entries.push(hit); saveCache();
        return Promise.resolve({positions:copy(hit.positions),cached:true,source:'cache'});
      }
      return new Promise(function (resolve,reject) {
        var job=pending={id:++serial,data:data,identity:identity,key:key,resolve:resolve,reject:reject,timer:null,fallbackTimer:null,fallback:false,signal:signal};
        if (signal) { job.abort=cancel; signal.addEventListener('abort',job.abort,{once:true}); }
        try {
          var activeWorker=getWorker();
          if (!activeWorker) { fallback(job); return; }
          job.timer=setTimer(function () { fallback(job); },timeout);
          activeWorker.postMessage({id:job.id,data:data});
        } catch (error) { fallback(job); }
      });
    }
    function pagehide() { cancel(); stopWorker(); }
    if (win.addEventListener) win.addEventListener('pagehide',pagehide);
    return {run:run,cancel:cancel,destroy:function () {
      if (destroyed) return; cancel(); stopWorker(); destroyed=true;
      if (win.removeEventListener) win.removeEventListener('pagehide',pagehide);
    }};
  }
  var client=null;
  return {KEY:KEY,VERSION:VERSION,MAX_ENTRIES:MAX_ENTRIES,MAX_BYTES:MAX_BYTES,snapshot:snapshot,compute:compute,create:create,
    run:function (cy,options) { if (!client) client=create(); return client.run(cy,options); },
    cancel:function () { if (client) client.cancel(); },destroy:function () { if (client) client.destroy(); client=null; }};
});
