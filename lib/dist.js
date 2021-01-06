const rdflib = require('rdflib'),
      jsonld = require('jsonld'),
      yaml = require('js-yaml'),
      fs = require('fs'),
      path = require('path'),
      _ = require('lodash'),
      ejs = require('ejs'),
      jsld = require('jsld'),
      util = require('util');

const srcDir = path.join(__dirname, '../src');
const ontologiesDir = path.join(__dirname, '..');

const fixLiterals = quads => {
  return _.join(_.map(quads.split('"""'),
      (str, index) => index % 2 === 0 ? str : str.replace(/\n/mg,'\\n')
  ), '"');
};

const simpleBnodes = quads => {
  return quads.replace(/_:bn_([0-9]*)/mg,'_:bn$1').replace(/_:b([0-9]*)_b([0-9]*)/mg,'_:b$1xb$2');
};

async function storeJsonLd (store, input, ctxt) {
  const quads = await jsonld.toRDF(input, {expandContext: ctxt, format: 'application/n-quads'});
  await util.promisify(rdflib.parse)(quads, store, null, 'application/n-quads');
}

function skipFirstLine(input) {
  return input.substring(input.indexOf("\n") + 1);
};

const fixBlankNodesXML = (input) => {
  return input
      .replace(/(\srdf:parseType="Resource">)\s*<rdf:Description>((?:[^<]|<[^\/]|<\/[^r]|<\/r[^d]|<\/rd[^f]|<\/rdf[^:]|<\/rdf:[^D])*)<\/rdf:Description>\s*(<\/)/mg,'$1$2$3')
      .replace(/(\srdf:parseType="Resource">)\s*<rdf:Description>((?:[^<]|<[^\/]|<\/[^r]|<\/r[^d]|<\/rd[^f]|<\/rdf[^:]|<\/rdf:[^D])*)<\/rdf:Description>\s*(<\/)/mg,'$1$2$3')
      .replace(/(\srdf:parseType="Resource">)\s*<rdf:Description>((?:[^<]|<[^\/]|<\/[^r]|<\/r[^d]|<\/rd[^f]|<\/rdf[^:]|<\/rdf:[^D])*)<\/rdf:Description>\s*(<\/)/mg,'$1$2$3');
};

async function main() {
  const store = rdflib.graph();

  const ontologyCtxtYaml = fs.readFileSync(path.join(srcDir, 'context.jsonld.yaml'), 'utf8');
  const ontologyCtxt = yaml.load(ontologyCtxtYaml);

  const ontologyYaml = fs.readFileSync(path.join(srcDir, 'spa.jsonld.yaml'), 'utf8');
  const ontologyJsonLd = yaml.load(ontologyYaml);
  await storeJsonLd(store, ontologyJsonLd, ontologyCtxt);

  const htmlTemplateSrc = fs.readFileSync(path.join(srcDir, 'ontology.ejs'), 'utf8');
  const htmlTemplate = ejs.compile(htmlTemplateSrc);

  const outputAsBadTriples = await util.promisify(rdflib.serialize)(rdflib.defaultGraph(), store, 'xxx', 'application/n-triples');
  const outputAsTriples = _.flow(fixLiterals, simpleBnodes)(outputAsBadTriples);
  fs.writeFileSync(path.join(ontologiesDir, 'spa.nt'), outputAsTriples);

  const outputAsTurtleWithEmptyPrefix = await util.promisify(rdflib.serialize)(rdflib.defaultGraph(), store, 'xxx', 'text/turtle');
  const outputAsTurtle = skipFirstLine(outputAsTurtleWithEmptyPrefix);
  fs.writeFileSync(path.join(ontologiesDir, 'spa.ttl'), outputAsTurtle);

  const outputAsJsonLdRaw = await jsonld.fromRDF(outputAsTriples, {format: 'application/n-quads'});
  const outputAsJsonLdCompacted = await jsonld.compact(outputAsJsonLdRaw, ontologyCtxt, {graph: true});
  const outputAsJsonLdTxt = JSON.stringify(outputAsJsonLdCompacted, null, 3);
  fs.writeFileSync(path.join(ontologiesDir, 'spa.jsonld'), outputAsJsonLdTxt);

  const outputAsRdfXmlDirty = await util.promisify(rdflib.serialize)(rdflib.defaultGraph(), store, 'xxx', 'application/rdf+xml');
  const outputAsRdfXml = fixBlankNodesXML(outputAsRdfXmlDirty);
  fs.writeFileSync(path.join(ontologiesDir, 'spa.rdf'), outputAsRdfXml);
  fs.writeFileSync(path.join(ontologiesDir, 'spa.owl'), outputAsRdfXml);
  
  const outputAsJsLd = await util.promisify(jsld.convert)(outputAsJsonLdRaw, ontologyCtxt);
  const outputAsHtml = htmlTemplate(_.assign({}, {ontology: outputAsJsLd['sparql-algebra-ontology'], _: _, context: ontologyCtxt}));
  fs.writeFileSync(path.join(ontologiesDir, 'spa.html'), outputAsHtml);

  return outputAsJsLd;
}

main().then((result) => {
  console.log(result);
}).catch((err) => {
  console.error(err);
});
