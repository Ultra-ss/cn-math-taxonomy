/* Same Dagre implementation as the regular graph, with no UI/learning access. */
'use strict';
importScripts('vendor/dagre.min.js','graph-layout.js');
self.onmessage = function (event) {
  var message=event.data;
  if (!message || !Number.isInteger(message.id) || !message.data) return;
  try { self.postMessage({id:message.id,positions:self.CnmGraphLayout.compute(message.data,self.dagre)}); }
  catch (error) { self.postMessage({id:message.id,error:error && error.message || 'Graph layout failed'}); }
};
