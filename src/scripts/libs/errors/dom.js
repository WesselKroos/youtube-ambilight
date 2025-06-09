const getNodeSelector = (elem) => {
  if (!elem.tagName) return elem.nodeName; // Document

  const idSelector = elem.id ? `#${elem.id}` : '';
  const classSelector = elem.classList?.length
    ? `.${Array.from(elem.classList).sort().join('.')}`
    : '';
  return `${elem.tagName.toLowerCase()}${idSelector}${classSelector}`;
};

const getNodeTree = (elem) => {
  if (!elem) return [];

  const tree = [];
  tree.push(elem);
  while (elem.parentNode && elem.parentNode.tagName) {
    tree.unshift(elem.parentNode);
    elem = elem.parentNode;
  }
  return tree;
};

export const getNodeTreeString = (elem) =>
  getNodeTree(elem)
    .map((node, i) => `${' '.repeat(i)}${getNodeSelector(node)}`)
    .join('\n');

const createNodeEntry = (node, level) => ({
  level,
  node,
  children: [],
});

// const findEntry = (node, entry) => {
//   if(entry.node === node) return entry
//   for (entry of entry.children) {
//     const foundEntry = findEntry(node, entry)
//     if(foundEntry) return foundEntry
//   }
// }

const nodeEntryToString = (entry) => {
  let lines = [`${' '.repeat(entry.level)}${getNodeSelector(entry.node)}`];
  for (const childEntry of entry.children) {
    lines.push(nodeEntryToString(childEntry));
  }
  return lines.join('\n');
};

export const getSelectorTreeString = (selector) => {
  const trees = Array.from(document.querySelectorAll(selector)).map((elem) =>
    getNodeTree(elem)
  );

  const documentTrees = [];
  for (const nodeTree of trees) {
    let documentTree;
    let previousEntry;
    for (const node of nodeTree) {
      if (!previousEntry) {
        documentTree = documentTrees.find((dt) => dt.node === node);
        if (!documentTree) {
          documentTree = createNodeEntry(node, 0);
          documentTrees.push(documentTree);
        }
        previousEntry = documentTree;
        continue;
      }

      const existingEntry = previousEntry.children.find(
        (entry) => entry.node === node
      );
      if (existingEntry) {
        previousEntry = existingEntry;
        continue;
      }

      const entry = createNodeEntry(node, previousEntry.level + 1);
      previousEntry.children.push(entry);
      previousEntry = entry;
    }
  }

  return documentTrees
    .map((documentTree) =>
      documentTree
        ? nodeEntryToString(documentTree)
        : `No nodes found for selector: '${selector}'`
    )
    .join('\n');
};
