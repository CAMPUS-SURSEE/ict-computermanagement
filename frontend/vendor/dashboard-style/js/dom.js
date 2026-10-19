/**
 * Updating rendered HTML without restarting animations.
 *
 * Replacing innerHTML recreates every node: entrance animations play again
 * and spinners jump back to their start: the page flickers.
 * morphHtml() instead keeps every node that is still the same, descends
 * into nodes whose tag and attributes are unchanged, and only inserts or
 * removes what actually changed. Kept nodes are never moved (moving
 * restarts their animations too), so the order of the new HTML decides.
 */

/**
 * Same element "shell": tag and attributes, ignoring the children.
 * @param {Node} a
 * @param {Node} b
 */
function sameShell(a, b) {
  if (a.nodeType !== 1 || b.nodeType !== 1) return false;
  const x = /** @type {Element} */ (a);
  const y = /** @type {Element} */ (b);
  if (x.tagName !== y.tagName || x.attributes.length !== y.attributes.length) return false;
  for (const attribute of Array.from(x.attributes)) {
    if (y.getAttribute(attribute.name) !== attribute.value) return false;
  }
  return true;
}

/**
 * Makes the children of `target` equal to `desired` (detached nodes).
 * @param {Node} target
 * @param {Node[]} desired
 */
export function morphChildren(target, desired) {
  let cursor = target.firstChild;
  for (const node of desired) {
    // An identical node further on: everything before it is gone.
    let match = cursor;
    while (match && !match.isEqualNode(node)) match = match.nextSibling;
    if (match) {
      while (cursor !== match) {
        const stale = /** @type {ChildNode} */ (cursor);
        cursor = stale.nextSibling;
        stale.remove();
      }
      cursor = match.nextSibling;
      continue;
    }
    if (cursor && sameShell(cursor, node)) {
      morphChildren(cursor, Array.from(node.childNodes));
      cursor = cursor.nextSibling;
      continue;
    }
    target.insertBefore(node, cursor);
  }
  while (cursor) {
    const stale = cursor;
    cursor = stale.nextSibling;
    target.removeChild(stale);
  }
}

/**
 * Sets the content of `target` to `html`, touching only what changed.
 * @param {Element} target
 * @param {string} html
 */
export function morphHtml(target, html) {
  const template = target.ownerDocument.createElement('template');
  template.innerHTML = html;
  morphChildren(target, Array.from(template.content.childNodes));
}
